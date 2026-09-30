const fs = require("node:fs");
const path = require("node:path");
const { load } = require("cheerio");
const root = "content/aitoolfame";
const m = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
for (const [route, p] of Object.entries(m.pages)) {
  if (route.startsWith("/search")) {
    m.redirects ??= {};
    m.redirects[route] = {
      source: p.source,
      target: "/auth/login",
      note: "Reference search route redirects to authentication. Public search uses /category?q=.",
    };
    delete m.pages[route];
  } else if (route.startsWith("/item/") && !p.heading) {
    if (!m.failures.some((f) => f.url === p.source))
      m.failures.push({
        kind: "page",
        url: p.source,
        error:
          "Reference returned NEXT_NOT_FOUND inside streamed HTML. No tool content available.",
      });
    delete m.pages[route];
  }
}
const cards = {};
const index = [];
const pages = Object.entries(m.pages).sort(([a], [b]) => {
  const order = (r) =>
    r === "/category"
      ? 0
      : /^\/category\?page=/.test(r)
        ? Number(new URL(r, "http://local").searchParams.get("page"))
        : 10000;
  return order(a) - order(b);
});
for (const [route, p] of pages) {
  const file = path.join(root, "pages", p.file);
  const $ = load(fs.readFileSync(file, "utf8"));
  if (/^\/item\/[^/?]+$/.test(route)) {
    for (const [field, label, prefix] of [
      ["categories", "Categories", "category"],
      ["tags", "Tags", "tag"],
    ]) {
      p[field] = $("h2")
        .filter((i, e) => $(e).text().trim() === label)
        .parent()
        .find(`a[href^="/${prefix}/"]`)
        .map((i, e) => $(e).attr("href"))
        .get();
    }
  }
  $('a[href^="/item/"]').each((i, e) => {
    const a = $(e);
    if (!a.find("h3").length) return;
    const card = a
      .parents("div")
      .filter(
        (i, e) =>
          ($(e).hasClass("border") || $(e).hasClass("border-2")) &&
          $(e).hasClass("flex-col"),
      )
      .first();
    if (!card.length) return;
    card.attr("data-replica-card", a.attr("href"));
    const grid = card.parent();
    if (grid.hasClass("grid")) grid.attr("data-replica-grid", "true");
    const link = a.attr("href");
    if (!cards[link])
      cards[link] = {
        html: $.html(card),
        featured:
          card.text().includes("Featured") || card.text().includes("Sponsored"),
        order: Object.keys(cards).length,
      };
  });
  $("[aria-label=pagination] li > span").each((i, e) => {
    const el = $(e);
    if (
      el.attr("aria-disabled") === "true" ||
      el.attr("aria-hidden") === "true"
    )
      return;
    const u = new URL(route, "https://aitoolfame.com");
    const current = Number(u.searchParams.get("page")) || 1;
    const text = el.text().trim();
    const page = /^\d+$/.test(text)
      ? Number(text)
      : el.attr("aria-label")?.includes("next")
        ? current + 1
        : el.attr("aria-label")?.includes("previous")
          ? current - 1
          : null;
    if (!page) return;
    u.searchParams.set("page", String(page));
    u.searchParams.sort();
    const a = $("<a></a>")
      .attr("class", el.attr("class"))
      .attr("href", u.pathname + u.search)
      .html(el.html());
    if (page === current) a.attr("aria-current", "page");
    el.replaceWith(a);
  });
  // Decode the public contact address encoded by Cloudflare, without running its script.
  $("[data-cfemail]").each((i, e) => {
    const el = $(e);
    const hex = el.attr("data-cfemail");
    let email = "";
    const key = Number.parseInt(hex.slice(0, 2), 16);
    for (let j = 2; j < hex.length; j += 2)
      email += String.fromCharCode(
        Number.parseInt(hex.slice(j, j + 2), 16) ^ key,
      );
    el.text(email);
    if (el.is("a")) el.attr("href", `mailto:${email}`);
    else el.closest("a").attr("href", `mailto:${email}`);
  });
  $("form").each((i, e) => {
    const f = $(e);
    if (f.find('input[placeholder*="Search"]').length)
      f.attr("action", "/category");
  });
  $("button[aria-label]").each((i, e) => {
    const b = $(e);
    if (b.attr("aria-label").includes("visitors"))
      b.attr("title", b.attr("aria-label"));
  });
  // Remove original resource hints, analytics endpoint metadata and loading scaffolds.
  $("link[rel=manifest],meta[name=sentry-trace],meta[name=baggage]").remove();
  fs.writeFileSync(file, $.html());
  if (/^\/item\/[^/?]+$/.test(route))
    index.push({
      route,
      name: p.heading,
      description: p.description,
      categories: p.categories,
      tags: p.tags,
    });
}
fs.writeFileSync(path.join(root, "cards.json"), JSON.stringify(cards));
m.counts = Object.values(m.pages).reduce((acc, p) => {
  acc[p.type] = (acc[p.type] || 0) + 1;
  return acc;
}, {});
fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(m, null, 2));
fs.writeFileSync(path.join(root, "items.json"), JSON.stringify(index, null, 2));
fs.writeFileSync(
  "public/replica-index.json",
  JSON.stringify({
    categories: Object.entries(m.pages)
      .filter(([r]) => /^\/category\/[^/?]+$/.test(r))
      .map(([r, p]) => ({
        route: r,
        name: r
          .split("/")
          .at(-1)
          .split("-")
          .map(
            (s) =>
              ({ gpts: "GPTs", ios: "iOS" })[s] ||
              s[0].toUpperCase() + s.slice(1),
          )
          .join(" "),
      })),
    tags: Object.keys(m.pages)
      .filter((r) => /^\/tag\/[^/?]+$/.test(r))
      .map((r) => ({
        route: r,
        name: r
          .split("/")
          .at(-1)
          .split("-")
          .map(
            (s) =>
              ({ gpts: "GPTs", ios: "iOS" })[s] ||
              s[0].toUpperCase() + s.slice(1),
          )
          .join(" "),
      })),
    blogs: Object.keys(m.pages)
      .filter((r) => r.startsWith("/blog/category/"))
      .map((r) => ({ route: r, name: r.endsWith("seo") ? "SEO" : "Reviews" })),
  }),
);
console.log(
  JSON.stringify({
    pages: pages.length,
    items: index.length,
    cards: Object.keys(cards).length,
  }),
);
