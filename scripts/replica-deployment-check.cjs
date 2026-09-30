/** Verify deployment-bundled content and HTTP flows without Chrome. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { load } = require("cheerio");

const root = process.cwd();
const origin = process.env.REPLICA_VERIFY_ORIGIN || "http://localhost:3001";
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "content/aitoolfame/manifest.json"), "utf8"),
);
const cards = JSON.parse(
  fs.readFileSync(path.join(root, "content/aitoolfame/cards.json"), "utf8"),
);
const index = JSON.parse(
  fs.readFileSync(path.join(root, "public/replica-index.json"), "utf8"),
);
const issues = [];

for (const [route, page] of Object.entries(manifest.pages)) {
  if (
    !/^[a-f0-9]+\.html$/.test(page.file) ||
    !fs.existsSync(path.join(root, "content/aitoolfame/pages", page.file))
  )
    issues.push(`Missing page file: ${route}`);
}
for (const [source, asset] of Object.entries(manifest.assets)) {
  const file = path.join(root, "public", asset.local.replace(/^\//, ""));
  if (!fs.existsSync(file)) {
    issues.push(`Missing asset: ${source}`);
    continue;
  }
  if (
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") !==
    asset.sha256
  )
    issues.push(`Asset checksum mismatch: ${source}`);
}
for (const route of Object.keys(manifest.pages).filter((route) =>
  /^\/item\/[^/?]+$/.test(route),
))
  if (!cards[route]) issues.push(`Missing sort/search card: ${route}`);

async function fetchPage(route) {
  const response = await fetch(new URL(route, origin), {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) issues.push(`HTTP ${response.status}: ${route}`);
  return { response, html: await response.text() };
}

async function main() {
  const routes = [
    "/",
    "/category",
    "/tag",
    "/collection",
    "/item/cursor",
    "/blog",
    "/pricing",
  ];
  const checked = [];
  for (const route of routes) {
    const { response, html } = await fetchPage(route);
    const bundled = fs.readFileSync(
      path.join(root, "content/aitoolfame/pages", manifest.pages[route].file),
      "utf8",
    );
    const served = load(html);
    const source = load(bundled);
    const sourceHeadingPreserved =
      served("main h1").first().text().trim() ===
      source("main h1").first().text().trim();
    if (!sourceHeadingPreserved)
      issues.push(`Bundled heading differs: ${route}`);
    if (
      served(
        'a[href^="/submit"], a[href^="/auth/"], form[data-replica-newsletter]',
      ).length
    )
      issues.push(`Unavailable business action is visible: ${route}`);
    checked.push({
      route,
      status: response.status,
      sourceHeadingPreserved,
    });
  }
  const search = await fetchPage("/category?q=cursor");
  const searchCards = load(search.html)("[data-replica-card]");
  if (
    !searchCards.length ||
    !searchCards.text().toLowerCase().includes("cursor")
  )
    issues.push("Search did not return Cursor");
  const ascending = await fetchPage("/category?sort=name-asc");
  const descending = await fetchPage("/category?sort=name-desc");
  const firstCard = (html) =>
    load(html)("[data-replica-card]").first().text().trim();
  if (
    !firstCard(ascending.html) ||
    firstCard(ascending.html) === firstCard(descending.html)
  )
    issues.push("Name sorting did not change the first card");
  const home = load((await fetchPage("/")).html);
  const image = home('img[src^="/replica-assets/"]').first().attr("src");
  if (!image) issues.push("Homepage has no bundled image");
  else {
    const asset = await fetch(new URL(image, origin), {
      signal: AbortSignal.timeout(30000),
    });
    if (
      !asset.ok ||
      !asset.headers.get("content-type")?.startsWith("image/") ||
      !(await asset.arrayBuffer()).byteLength
    )
      issues.push(`Image failed HTTP load: ${image}`);
  }
  const indexResponse = await fetch(new URL("/replica-index.json", origin));
  if (!indexResponse.ok || !(await indexResponse.json()).tags?.length)
    issues.push("Client search/filter index failed HTTP load");
  const report = {
    origin,
    bundledPages: Object.keys(manifest.pages).length,
    bundledAssets: Object.keys(manifest.assets).length,
    sortableCards: Object.keys(cards).length,
    index: {
      categories: index.categories?.length,
      tags: index.tags?.length,
      blogs: index.blogs?.length,
    },
    checked,
    searchCards: searchCards.length,
    ascendingFirst: firstCard(ascending.html).slice(0, 80),
    descendingFirst: firstCard(descending.html).slice(0, 80),
    image,
    issues,
  };
  console.log(JSON.stringify(report));
  if (issues.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
