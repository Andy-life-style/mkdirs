/** Download public author avatars observed in the reference DOM; safe to rerun. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { load } = require("cheerio");

const root = path.resolve("content/aitoolfame");
const publicRoot = path.resolve("public");
const manifestFile = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const authors = {
  Hyhor:
    "https://lh3.googleusercontent.com/a/ACg8ocKLZKKgj_3kJNx2xzxuM4gBLdhd4qTaiht-9A5JTr8Vpe1LeeM=s96-c",
  "Nick Launches":
    "https://lh3.googleusercontent.com/a/ACg8ocIV003bmFuszTKQfJ3uq1MK3dd_Pqi18V5LlArQnu_ofeQuBYI=s96-c",
};
const cacheRoot = path.join(os.tmpdir(), "aitoolfame-verification");
const cacheFile = path.join(cacheRoot, "avatar-binaries.json");
const cached = fs.existsSync(cacheFile)
  ? JSON.parse(fs.readFileSync(cacheFile, "utf8"))
  : [];

async function localAvatar(url) {
  const previous = manifest.assets[url];
  if (previous && fs.existsSync(path.join(publicRoot, previous.local)))
    return previous.local;
  const entry = cached.find((item) => item.url === url);
  const response = entry
    ? null
    : await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (response && !response.ok)
    throw new Error(`Avatar HTTP ${response.status}: ${url}`);
  const contentType =
    entry?.contentType || response?.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/"))
    throw new Error(`Unexpected avatar response: ${contentType}`);
  const bytes = entry
    ? fs.readFileSync(path.join(cacheRoot, entry.file))
    : Buffer.from(await response.arrayBuffer());
  const ext = contentType.includes("png") ? ".png" : ".jpg";
  const file = `${crypto.createHash("sha256").update(url).digest("hex").slice(0, 24)}${ext}`;
  const local = `/replica-assets/${file}`;
  fs.writeFileSync(path.join(publicRoot, "replica-assets", file), bytes);
  manifest.assets[url] = {
    local,
    bytes: bytes.length,
    contentType,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
  return local;
}

async function main() {
  const local = {};
  for (const [name, url] of Object.entries(authors))
    local[name] = await localAvatar(url);
  let inserted = 0;
  for (const [route, page] of Object.entries(manifest.pages)) {
    if (!route.startsWith("/blog")) continue;
    const file = path.join(root, "pages", page.file);
    const $ = load(fs.readFileSync(file, "utf8"));
    $("main span.rounded-full").each((_, element) => {
      const avatar = $(element);
      if (avatar.find("img").length) return;
      const name = avatar.parent().find("span.truncate").first().text().trim();
      if (!local[name]) return;
      const img = $("<img>")
        .addClass("aspect-square h-full w-full")
        .attr({ alt: name, title: name, src: local[name], loading: "lazy" });
      avatar.append(img);
      inserted++;
    });
    fs.writeFileSync(file, $.html());
    page.images = [
      ...new Set([...(page.images || []), ...Object.values(local)]),
    ];
  }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify({ authors: Object.keys(local).length, inserted, local }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
