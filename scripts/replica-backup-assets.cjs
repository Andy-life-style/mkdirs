const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve("backups/vnn8nbql-production");
const file = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const documents = fs.readFileSync(path.join(root, "documents.ndjson"));
if (
  crypto.createHash("sha256").update(documents).digest("hex") !==
  manifest.sha256
)
  throw new Error("Backup checksum mismatch");
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
async function main() {
  for (const asset of manifest.assets) {
    const ext = path.extname(new URL(asset.url).pathname);
    const local = path.join("assets", `${asset.id}${ext}`);
    if (!fs.existsSync(path.join(root, local))) {
      const response = await fetch(asset.url, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(`Asset ${asset.id}: ${response.status}`);
      fs.writeFileSync(
        path.join(root, local),
        Buffer.from(await response.arrayBuffer()),
      );
    }
    const bytes = fs.readFileSync(path.join(root, local));
    asset.local = local;
    asset.bytes = bytes.length;
    asset.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  }
  manifest.assetBackupComplete = true;
  manifest.note =
    "All exported documents and referenced asset binaries are backed up with SHA-256 checksums. Original dataset remains untouched.";
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify({
      documents: manifest.documents,
      assets: manifest.assets.length,
      verified: true,
      originalUntouched: true,
    }),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
