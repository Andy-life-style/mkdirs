const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sharp = require("sharp");
const dir = path.join(os.tmpdir(), "aitoolfame-verification");
async function main() {
  const results = [];
  for (const file of fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith("reference-") &&
        f.endsWith(".png") &&
        !f.includes("-full") &&
        !f.includes("-interaction-"),
    )) {
    const local = file.replace("reference-", "local-");
    if (!fs.existsSync(path.join(dir, local))) continue;
    const a = await sharp(path.join(dir, file))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const b = await sharp(path.join(dir, local))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
      results.push({ page: file, dimensionsDiffer: true });
      continue;
    }
    let changed = 0;
    let total = 0;
    for (let i = 0; i < a.data.length; i += 3) {
      const delta = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      );
      if (delta > 24) changed++;
      total += delta;
    }
    results.push({
      page: file.replace("reference-", ""),
      changedPercent: Number(
        ((changed / (a.data.length / 3)) * 100).toFixed(2),
      ),
      meanDelta: Number((total / (a.data.length / 3)).toFixed(2)),
    });
  }
  results.sort((a, b) => (b.changedPercent ?? 100) - (a.changedPercent ?? 100));
  fs.writeFileSync(
    "content/aitoolfame/visual-comparison.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        note: "Thresholded pixel comparison of viewport screenshots, not a claim of semantic equivalence.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results.slice(0, 20)));
  for (const [name, pages, width] of [
    ["desktop", ["category", "tag", "item-cursor", "blog"], 1440],
    ["mobile", ["category", "item-cursor", "pricing", "auth-login"], 390],
  ]) {
    const w = width === 1440 ? 720 : 390;
    const h = width === 1440 ? 500 : 844;
    const inputs = [];
    for (let row = 0; row < pages.length; row++)
      for (let col = 0; col < 2; col++) {
        const f = path.join(
          dir,
          `${col ? "local" : "reference"}-${pages[row]}-${width}.png`,
        );
        if (fs.existsSync(f))
          inputs.push({
            input: await sharp(f).resize(w, h).toBuffer(),
            left: col * w,
            top: row * h,
          });
      }
    await sharp({
      create: {
        width: w * 2,
        height: h * pages.length,
        channels: 3,
        background: "#eeeeee",
      },
    })
      .composite(inputs)
      .png()
      .toFile(path.join(dir, `comparison-${name}.png`));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
