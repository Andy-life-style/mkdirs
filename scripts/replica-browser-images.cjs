/** Apply the exact public image bytes observed by Chrome for blog imagery. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { load } = require("cheerio");

const root = path.resolve("content/aitoolfame");
const cacheRoot = path.join(os.tmpdir(), "aitoolfame-verification");
const cacheFile = path.join(cacheRoot, "image-binaries.json");
if (!fs.existsSync(cacheFile))
  throw new Error(
    "Run node scripts/replica-browser.cjs reference --image-binaries first",
  );
const entries = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
const manifestFile = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const replacements = new Map();
for (const entry of entries) {
  if (entry.contentType !== "image/avif") continue;
  const old = manifest.assets[entry.url];
  if (!old) throw new Error(`Unknown source image: ${entry.url}`);
  const bytes = fs.readFileSync(path.join(cacheRoot, entry.file));
  if (bytes.length !== entry.bytes)
    throw new Error(`Image cache size mismatch: ${entry.url}`);
  const local = `/replica-assets/${crypto.createHash("sha256").update(entry.url).digest("hex").slice(0, 24)}.avif`;
  fs.writeFileSync(path.join("public", local), bytes);
  replacements.set(old.local, local);
  manifest.assets[entry.url] = {
    local,
    bytes: bytes.length,
    contentType: "image/avif",
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}
let pages = 0;
for (const page of Object.values(manifest.pages)) {
  const file = path.join(root, "pages", page.file);
  const $ = load(fs.readFileSync(file, "utf8"));
  let changed = false;
  $("img[src]").each((_, element) => {
    const img = $(element);
    const replacement = replacements.get(img.attr("src"));
    if (replacement) {
      img.attr("src", replacement);
      changed = true;
    }
  });
  if (changed) {
    fs.writeFileSync(file, $.html());
    pages++;
    page.images = (page.images || []).map(
      (old) => replacements.get(old) || old,
    );
  }
}
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ images: replacements.size, pages }));
