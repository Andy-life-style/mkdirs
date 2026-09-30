/** Public GET-only collector. Never executes downloaded scripts or submits forms. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { load } = require("cheerio");
const ORIGIN = "https://aitoolfame.com";
const refresh = process.argv.includes("--refresh");
const ROOT = process.cwd();
const OUT = path.join(ROOT, "content/aitoolfame");
const CACHE = path.join(ROOT, ".replica-cache");
const ASSETS = path.join(ROOT, "public/replica-assets");
for (const dir of [OUT, CACHE, ASSETS, path.join(OUT, "pages")])
  fs.mkdirSync(dir, { recursive: true });
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
const read = (file, fallback) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
const manifest = read(path.join(OUT, "manifest.json"), {
  source: ORIGIN,
  pages: {},
  assets: {},
  failures: [],
  discovered: [],
  startedAt: new Date().toISOString(),
});
const assetJobs = new Map();
function save() {
  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}
async function get(url, binary = false) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: {
          "User-Agent": "AIToolFame-Authorized-Archive/1.0",
          Accept: binary
            ? "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
            : "text/html,application/xml",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return binary
        ? {
            bytes: Buffer.from(await response.arrayBuffer()),
            type: response.headers.get("content-type") || "",
          }
        : await response.text();
    } catch (e) {
      error = e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw error;
}
function absolute(value, base = ORIGIN) {
  try {
    return new URL(value.replaceAll("&amp;", "&"), base).href;
  } catch {
    return null;
  }
}
async function asset(value, base = ORIGIN) {
  if (!value || /^(data:|#)/.test(value)) return value;
  let url = absolute(value, base);
  if (!url || !/^https?:/.test(url)) return value;
  const parsed = new URL(url);
  if (parsed.pathname === "/_next/image" && parsed.searchParams.has("url"))
    url = absolute(parsed.searchParams.get("url"));
  if (
    manifest.assets[url] &&
    fs.existsSync(path.join(ROOT, "public", manifest.assets[url].local))
  )
    return manifest.assets[url].local;
  if (assetJobs.has(url)) return assetJobs.get(url);
  const job = (async () => {
    try {
      const { bytes, type } = await get(url, true);
      let ext = type.includes("image/avif")
        ? ".avif"
        : type.includes("image/webp")
          ? ".webp"
          : path.extname(new URL(url).pathname).toLowerCase();
      if (!/^\.[a-z0-9]{2,5}$/.test(ext))
        ext =
          {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
            "text/css": ".css",
            "font/woff2": ".woff2",
          }[type.split(";")[0]] || ".bin";
      if (type.includes("text/html")) throw new Error("Asset returned HTML");
      const file = hash(url) + ext;
      let output = bytes;
      if (ext === ".css") {
        let css = bytes.toString();
        const urls = [...css.matchAll(/url\((?:["']?)([^)"']+)["']?\)/g)].map(
          (m) => m[1],
        );
        for (const entry of new Set(urls))
          if (!entry.startsWith("data:"))
            css = css.split(entry).join(await asset(entry, url));
        output = Buffer.from(css);
      }
      fs.writeFileSync(path.join(ASSETS, file), output);
      const local = `/replica-assets/${file}`;
      manifest.assets[url] = {
        local,
        bytes: output.length,
        contentType: type,
        sha256: crypto.createHash("sha256").update(output).digest("hex"),
      };
      return local;
    } catch (e) {
      manifest.failures.push({
        kind: "asset",
        url,
        error: e.message,
        at: new Date().toISOString(),
      });
      return value;
    }
  })();
  assetJobs.set(url, job);
  return job;
}
function resolveStream($) {
  const scripts = $("script")
    .map((i, e) => $(e).text())
    .get()
    .join("\n");
  for (const match of scripts.matchAll(/\$(RS|RC)\("([^"]+)","([^"]+)"\)/g)) {
    const [, action, a, b] = match;
    const source = $(`[id="${action === "RS" ? a : b}"]`);
    const target = $(`[id="${action === "RS" ? b : a}"]`);
    if (!source.length || !target.length) continue;
    if (action === "RS") target.replaceWith(source.contents());
    else {
      let node = target[0].nextSibling;
      let depth = 0;
      while (node) {
        if (node.type === "comment") {
          if (node.data === "/$") {
            if (depth === 0) break;
            depth--;
          } else if (["$", "$?", "$!"].includes(node.data)) depth++;
        }
        const next = node.nextSibling;
        $(node).remove();
        node = next;
      }
      target.replaceWith(source.contents());
    }
    source.remove();
  }
}
function canonical(value) {
  let url;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  if (
    /^\/(api|studio|dashboard|settings|edit|publish|payment|cdn-cgi)(\/|$)/.test(
      url.pathname,
    )
  )
    return null;
  if (/\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.startsWith("/_next"))
    return null;
  if (
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/submit" ||
    url.pathname === "/unsubscribe"
  )
    return null;
  for (const k of [...url.searchParams.keys()])
    if (!["page", "sort", "f", "category", "tag"].includes(k))
      url.searchParams.delete(k);
  url.searchParams.sort();
  return url.pathname.replace(/\/$/, "") + url.search || "/";
}
const queue = [];
const queued = new Set();
function enqueue(value) {
  const key = canonical(value);
  if (key && !queued.has(key)) {
    queued.add(key);
    queue.push(key);
  }
}
async function collect(key) {
  const file = `${hash(key)}.html`;
  const cacheFile = path.join(CACHE, file);
  const cached = fs.existsSync(cacheFile);
  const raw =
    cached && !refresh
      ? fs.readFileSync(cacheFile, "utf8")
      : await get(ORIGIN + key);
  if (!cached || refresh) fs.writeFileSync(cacheFile, raw);
  const $ = load(raw);
  resolveStream($);
  $("a[href]").each((i, e) => enqueue($(e).attr("href")));
  const pageNumbers = $("[aria-label=pagination] li")
    .map((i, e) => Number($(e).text().trim()))
    .get()
    .filter((n) => Number.isInteger(n) && n > 0);
  const maxPage = Math.max(1, ...pageNumbers);
  for (let page = 2; page <= maxPage; page++) {
    const u = new URL(key, ORIGIN);
    u.searchParams.set("page", String(page));
    enqueue(u.href);
  }
  const title = $("title").first().text();
  const heading = $("h1").first().text().trim();
  const description = $("meta[name=description]").attr("content") || "";
  const text = $("main").text().replace(/\s+/g, " ").trim();
  $(
    "script,iframe,object,embed,base,link[rel=preload],link[rel=modulepreload],link[rel=preconnect],link[rel=dns-prefetch]",
  ).remove();
  $("meta[http-equiv]").remove();
  $('[hidden][id^="S:"],template').remove();
  $("*").each((i, e) => {
    for (const attr of Object.keys(e.attribs || {})) {
      if (
        /^on/i.test(attr) ||
        ["nonce", "integrity"].includes(attr) ||
        attr.startsWith("data-sentry")
      )
        $(e).removeAttr(attr);
    }
  });
  $("a[href]").each((i, e) => {
    const a = $(e);
    const href = a.attr("href");
    if (/^(javascript|data):/i.test(href)) {
      a.removeAttr("href");
      return;
    }
    if (href.startsWith(ORIGIN))
      a.attr("href", href.slice(ORIGIN.length) || "/");
    if (a.attr("target") === "_blank") a.attr("rel", "noopener noreferrer");
  });
  $("form").attr("action", "/search").attr("method", "get");
  $("input[type=hidden]").remove();
  $('input[placeholder*="Search"]').attr("name", "q");
  $("input[type=email]").each((i, e) =>
    $(e)
      .closest("form")
      .attr("data-replica-newsletter", "true")
      .removeAttr("action"),
  );
  const elements = $(
    'img,link[rel=stylesheet],link[rel=icon],link[rel="shortcut icon"],link[rel=apple-touch-icon],source',
  ).toArray();
  // Keep bounded concurrency even when a page contains hundreds of assets.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < elements.length) {
        const el = $(elements[cursor++]);
        const attr = el.is("link") ? "href" : "src";
        const src = el.attr(attr);
        if (src) el.attr(attr, await asset(src));
        el.removeAttr("srcset").removeAttr("sizes");
        if (el.is("img")) el.attr("loading", "lazy");
      }
    }),
  );
  // Next/Image blur placeholders otherwise persist without the original React runtime.
  $("img[style]").each((i, e) => {
    const el = $(e);
    el.attr(
      "style",
      el.attr("style").replace(/background-image:url\(.*?\)(?:;|$)/g, ""),
    );
  });
  $("link[rel=canonical]").remove();
  $(
    'meta[property="og:url"],meta[property="og:image"],meta[name="twitter:image"]',
  ).remove();
  $("html").removeAttr("style").removeClass("dark").addClass("light");
  $("head").append(
    '<meta name="robots" content="noindex,nofollow"><link rel="stylesheet" href="/replica.css"><script src="/replica-theme.js"></script>',
  );
  $("body").append('<script src="/replica-client.js" defer></script>');
  fs.writeFileSync(path.join(OUT, "pages", file), $.html());
  const type = key === "/" ? "home" : key.split("?")[0].split("/")[1];
  const itemLinks = [
    ...new Set(
      $('main a[href^="/item/"]')
        .map((i, e) => $(e).attr("href"))
        .get(),
    ),
  ];
  const record = {
    source: ORIGIN + key,
    file,
    type,
    title,
    heading,
    description,
    text,
    itemLinks,
    fetchedAt: new Date().toISOString(),
  };
  if (/^\/item\/[^/?]+$/.test(key)) {
    record.categories = [
      ...new Set(
        $('main a[href^="/category/"]')
          .map((i, e) => $(e).attr("href"))
          .get(),
      ),
    ];
    record.tags = [
      ...new Set(
        $('main a[href^="/tag/"]')
          .map((i, e) => $(e).attr("href"))
          .get(),
      ),
    ];
    record.images = [
      ...new Set(
        $("main img")
          .map((i, e) => $(e).attr("src"))
          .get(),
      ),
    ];
  }
  manifest.pages[key] = record;
}
async function main() {
  manifest.failures = [];
  const sitemap = await get(`${ORIGIN}/sitemap.xml`);
  fs.writeFileSync(path.join(OUT, "source-sitemap.xml"), sitemap);
  for (const m of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) enqueue(m[1]);
  for (const key of [
    "/",
    "/category",
    "/tag",
    "/collection",
    "/blog",
    "/pricing",
    "/about",
    "/privacy",
    "/terms",
    "/search",
    "/search?f=featured",
  ])
    enqueue(key);
  manifest.sitemapCount = queue.length;
  let cursor = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < queue.length) {
        const key = queue[cursor++];
        try {
          await collect(key);
        } catch (e) {
          manifest.failures.push({
            kind: "page",
            url: ORIGIN + key,
            error: e.message,
          });
        }
        completed++;
        if (completed % 10 === 0) {
          manifest.discovered = queue;
          save();
          console.log(
            JSON.stringify({
              completed,
              discovered: queue.length,
              assets: Object.keys(manifest.assets).length,
              failures: manifest.failures.length,
            }),
          );
        }
      }
    }),
  );
  manifest.discovered = queue;
  manifest.finishedAt = new Date().toISOString();
  manifest.counts = Object.values(manifest.pages).reduce((acc, p) => {
    acc[p.type] = (acc[p.type] || 0) + 1;
    return acc;
  }, {});
  save();
  console.log(
    "FINISHED",
    JSON.stringify({
      pages: Object.keys(manifest.pages).length,
      assets: Object.keys(manifest.assets).length,
      failures: manifest.failures.length,
      counts: manifest.counts,
    }),
  );
}
main().catch((e) => {
  save();
  console.error(e);
  process.exitCode = 1;
});
