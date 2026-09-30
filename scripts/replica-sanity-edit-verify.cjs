/** Reversible write-permission probe restricted to one shopapphub page. */
require("dotenv").config();
const { createHash } = require("node:crypto");
const createBrowserTransport = require("./replica-sanity-browser.cjs");

const target = "shopapphub";
const route = "/about";
const id = `replica.page.${createHash("sha256").update(route).digest("hex").slice(0, 32)}`;
const query = (expression) =>
  `/data/query/${target}?query=${encodeURIComponent(expression)}`;

async function main() {
  const project = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  if (project !== "vnn8nbql" || !process.env.SANITY_API_TOKEN)
    throw new Error("Unexpected Sanity project or missing token");
  const transport = await createBrowserTransport(
    `https://${project}.api.sanity.io/v2024-08-01`,
    process.env.SANITY_API_TOKEN,
  );
  const read = async () =>
    (
      await transport.request(
        query(`*[_id == "${id}"][0]{_id,_rev,title,route}`),
      )
    ).result;
  const patch = async (revision, title) =>
    transport.request(`/data/mutate/${target}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(
        JSON.stringify({
          mutations: [
            { patch: { id, ifRevisionID: revision, set: { title } } },
          ],
        }),
      ),
    });
  let original;
  let marker;
  let changed = false;
  async function restoreOriginal() {
    if (!changed) return;
    const current = await read();
    if (current.title !== marker)
      throw new Error(
        "Document changed concurrently; original title was not overwritten",
      );
    await patch(current._rev, original.title);
    const restored = await read();
    if (restored.title !== original.title)
      throw new Error("Original title restoration could not be verified");
    console.log(
      "ORIGINAL_RESTORED",
      JSON.stringify({ dataset: target, route, id }),
    );
  }
  try {
    original = await read();
    if (
      !original ||
      original.route !== route ||
      typeof original.title !== "string"
    )
      throw new Error("Validation document is missing or invalid");
    marker = `${original.title} [shopapphub-write-check-${Date.now()}]`;
    await patch(original._rev, marker);
    changed = true;
    const updated = await read();
    if (updated.title !== marker)
      throw new Error("Temporary edit was not visible after save");
    console.log(
      "TEMPORARY_EDIT_VERIFIED",
      JSON.stringify({ dataset: target, route, id }),
    );
  } finally {
    try {
      await restoreOriginal();
    } finally {
      transport.close();
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
