const fs = require("node:fs");
const path = require("node:path");
const { load } = require("cheerio");
const m = JSON.parse(
  fs.readFileSync("content/aitoolfame/manifest.json", "utf8"),
);
const cards = JSON.parse(
  fs.readFileSync("content/aitoolfame/cards.json", "utf8"),
);
const missing = Object.keys(m.pages).filter(
  (r) => /^\/item\/[^/?]+$/.test(r) && !cards[r],
);
console.log("MISSING_CARDS", missing);
const failures = [];
const results = [];
const routes = Object.entries(m.pages).filter(
  ([r]) => !r.startsWith("/search"),
);
let cursor = 0;
async function main() {
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (cursor < routes.length) {
        const [route, p] = routes[cursor++];
        try {
          const response = await fetch(`http://localhost:3000${route}`, {
            signal: AbortSignal.timeout(60000),
          });
          const $ = load(await response.text());
          const heading = $("h1").first().text().trim();
          const brokenImages = $('img[src^="/replica-assets/"]')
            .map((i, e) => $(e).attr("src"))
            .get()
            .filter((src) => !fs.existsSync(path.join("public", src)));
          const foreignScripts = $("script[src]")
            .map((i, e) => $(e).attr("src"))
            .get()
            .filter((src) => !src.startsWith("/replica-"));
          const ok =
            response.status === 200 &&
            heading === p.heading &&
            brokenImages.length === 0 &&
            foreignScripts.length === 0;
          const record = {
            route,
            status: response.status,
            heading,
            ok,
            brokenImages,
            foreignScripts,
          };
          results.push(record);
          if (!ok) failures.push(record);
        } catch (e) {
          failures.push({ route, error: e.message });
        }
        if (results.length % 50 === 0)
          console.log("CHECKED", results.length, "FAILURES", failures.length);
      }
    }),
  );
  const report = {
    at: new Date().toISOString(),
    pages: results.length,
    failures,
    missingCards: missing,
  };
  fs.writeFileSync(
    "content/aitoolfame/validation.json",
    JSON.stringify(report, null, 2),
  );
  console.log("RESULT", JSON.stringify(report));
  if (failures.length || missing.length) process.exitCode = 1;
}
main();
