/** Isolated, repeatable migration. No endpoint here can mutate production. */
require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const createBrowserTransport = require("./replica-sanity-browser.cjs");

const project = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const original = "production";
const target = "shopapphub";
const token = process.env.SANITY_API_TOKEN;
const mode = process.argv[2] || "inspect";
if (project !== "vnn8nbql" || !token)
  throw new Error("Missing or unexpected Sanity project/token");
if (!["inspect", "prepare", "import"].includes(mode))
  throw new Error("Unknown mode");
const base = `https://${project}.api.sanity.io/v2024-08-01`;
const digest = (data, algorithm = "sha256") =>
  crypto.createHash(algorithm).update(data).digest("hex");

function verifyBackup() {
  const dir = path.resolve("backups", `${project}-${original}`);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
  );
  const documents = fs.readFileSync(path.join(dir, "documents.ndjson"));
  if (
    manifest.project !== project ||
    manifest.dataset !== original ||
    !manifest.assetBackupComplete
  )
    throw new Error("Production backup manifest is incomplete or mismatched");
  if (
    digest(documents) !== manifest.sha256 ||
    documents.toString().trim().split("\n").length !== manifest.documents
  )
    throw new Error("Production document backup failed verification");
  for (const asset of manifest.assets) {
    const file = path.join(dir, asset.local);
    if (!fs.existsSync(file) || digest(fs.readFileSync(file)) !== asset.sha256)
      throw new Error(
        `Production asset backup failed verification: ${asset.id}`,
      );
  }
  console.log(
    "BACKUP_VERIFIED",
    JSON.stringify({
      documents: manifest.documents,
      assets: manifest.assets.length,
    }),
  );
}

const query = (expression) =>
  `/data/query/${target}?query=${encodeURIComponent(expression)}`;
async function main() {
  verifyBackup();
  const transport = await createBrowserTransport(base, token);
  try {
    const datasets = await transport.request("/datasets");
    if (!datasets.some((dataset) => dataset.name === target))
      throw new Error(
        `Target dataset ${target} does not exist; import is disabled`,
      );
    console.log(
      "DATASETS",
      JSON.stringify({
        project,
        original,
        target,
        names: datasets.map((d) => d.name),
      }),
    );
    const count = await transport.request(
      query('count(*[_type == "replicaPage"])'),
    );
    console.log("EXISTING_PAGES", count.result);
    if (mode !== "import") return;

    const manifest = JSON.parse(
      fs.readFileSync("content/aitoolfame/manifest.json", "utf8"),
    );
    const assets = Object.entries(manifest.assets).filter(([, value]) =>
      value.contentType.startsWith("image/"),
    );
    const assetQuery =
      '*[_type in ["sanity.imageAsset", "sanity.fileAsset"]]{_id,sha1hash}';
    const existingAssets = await transport.request(query(assetQuery));
    const byHash = new Map(
      existingAssets.result
        .filter((asset) => asset.sha1hash)
        .map((asset) => [asset.sha1hash, asset._id]),
    );
    const byPath = new Map();
    const failures = [];
    let uploaded = 0;
    let reused = 0;
    for (const [source, asset] of assets) {
      const local = path.join("public", asset.local.replace(/^\//, ""));
      if (!fs.existsSync(local)) {
        failures.push({ source, reason: "local file missing" });
        continue;
      }
      const bytes = fs.readFileSync(local);
      if (digest(bytes) !== asset.sha256) {
        failures.push({ source, reason: "local SHA-256 mismatch" });
        continue;
      }
      const sha1 = digest(bytes, "sha1");
      let id = byHash.get(sha1);
      if (!id) {
        const kind = /svg\+xml|icon/.test(asset.contentType)
          ? "files"
          : "images";
        const filename = encodeURIComponent(path.basename(local));
        const result = await transport.request(
          `/assets/${kind}/${target}?filename=${filename}`,
          {
            method: "POST",
            headers: { "Content-Type": asset.contentType },
            body: bytes,
          },
        );
        id = result.document?._id;
        if (!id) throw new Error(`Asset upload returned no ID: ${source}`);
        byHash.set(sha1, id);
        uploaded++;
      } else reused++;
      byPath.set(asset.local, id);
      if ((uploaded + reused) % 50 === 0)
        console.log("ASSETS_PROCESSED", uploaded + reused, "/", assets.length);
    }
    if (failures.length)
      throw new Error(
        `Local asset verification failed: ${JSON.stringify(failures)}`,
      );
    console.log(
      "ASSETS_VERIFIED",
      JSON.stringify({
        total: assets.length,
        uploaded,
        reused,
        unique: byHash.size,
      }),
    );

    const documents = Object.entries(manifest.pages).map(([route, page]) => {
      const file = path.join("content/aitoolfame/pages", page.file);
      const imagePaths = [...new Set(page.images || [])];
      return {
        _id: `replica.page.${digest(route).slice(0, 32)}`,
        _type: "replicaPage",
        route,
        title: page.title,
        heading: page.heading,
        description: page.description,
        sourceUrl: page.source,
        pageType: page.type,
        capturedAt: page.fetchedAt,
        html: fs.readFileSync(file, "utf8"),
        text: page.text,
        imagePaths,
        imageAssets: imagePaths
          .filter((imagePath) => byPath.get(imagePath)?.startsWith("image-"))
          .map((imagePath) => ({
            _key: digest(imagePath).slice(0, 16),
            _type: "image",
            asset: { _type: "reference", _ref: byPath.get(imagePath) },
          })),
      };
    });
    for (let i = 0; i < documents.length; i += 8) {
      await transport.request(`/data/mutate/${target}?returnIds=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(
          JSON.stringify({
            mutations: documents
              .slice(i, i + 8)
              .map((doc) => ({ createOrReplace: doc })),
          }),
        ),
      });
      if ((i + 8) % 80 === 0 || i + 8 >= documents.length)
        console.log(
          "PAGES_IMPORTED",
          Math.min(i + 8, documents.length),
          "/",
          documents.length,
        );
    }
    const result = await transport.request(
      query(
        '{"pages":count(*[_type=="replicaPage"]),"images":count(*[_type=="sanity.imageAsset"]),"files":count(*[_type=="sanity.fileAsset"])}',
      ),
    );
    const report = {
      project,
      target,
      original,
      expectedPages: documents.length,
      expectedAssets: assets.length,
      uploaded,
      reused,
      verified: result.result,
      sourceFailures: manifest.failures,
      importFailures: failures,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(
      "content/aitoolfame/sanity-import.json",
      JSON.stringify(report, null, 2),
    );
    console.log("VERIFIED", JSON.stringify(report));
    if (result.result.pages !== documents.length)
      throw new Error("Imported page count mismatch");
  } finally {
    transport.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
