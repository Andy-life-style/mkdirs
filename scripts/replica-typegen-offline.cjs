/** Extract the repository's Sanity schema without connecting to the API. */
require("tsx/cjs");
const fs = require("node:fs");
require.extensions[".css"] = () => {};
const { schemaTypes } = require("../src/sanity/schemas");
const { createSchema } = require("sanity");
const { markdownSchema } = require("sanity-plugin-markdown");
const { codeInput } = require("@sanity/code-input");
const { media } = require("sanity-plugin-media");
const sanityPath = require.resolve("sanity");
const { extractSchema } = require(
  require.resolve("@sanity/schema/_internal", { paths: [sanityPath] }),
);

const compiled = createSchema({
  name: "default",
  types: [
    ...schemaTypes,
    ...markdownSchema().schema.types,
    ...codeInput().schema.types,
    ...media().schema.types,
  ],
});
const extracted = extractSchema(compiled, { enforceRequiredFields: false });
fs.writeFileSync("schema.json", `${JSON.stringify(extracted, null, 2)}\n`);
const replica = extracted.find((type) => type.name === "replicaPage");
if (!replica?.attributes?.imageAssets)
  throw new Error("Extracted replicaPage schema is missing imageAssets");
console.log(
  "SCHEMA_EXTRACTED_OFFLINE",
  JSON.stringify({
    types: extracted.length,
    replicaFields: Object.keys(replica.attributes).length,
  }),
);
