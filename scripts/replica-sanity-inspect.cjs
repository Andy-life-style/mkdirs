/** Read-only check of the dedicated replica dataset. */
require("dotenv").config();
const createBrowserTransport = require("./replica-sanity-browser.cjs");

async function main() {
  const project = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const transport = await createBrowserTransport(
    `https://${project}.api.sanity.io/v2024-08-01`,
    process.env.SANITY_API_TOKEN,
  );
  try {
    const datasets = await transport.request("/datasets");
    console.log(
      JSON.stringify({ project, datasets: datasets.map((d) => d.name) }),
    );
    if (!datasets.some((d) => d.name === "shopapphub"))
      throw new Error("Target dataset shopapphub does not exist");
    const query = encodeURIComponent('count(*[_type == "replicaPage"])');
    const result = await transport.request(
      `/data/query/shopapphub?query=${query}`,
    );
    console.log(
      JSON.stringify({ dataset: "shopapphub", replicaPages: result.result }),
    );
    const originalCount = await transport.request(
      `/data/query/production?query=${encodeURIComponent("count(*)")}`,
    );
    console.log(
      JSON.stringify({
        dataset: "production",
        documents: originalCount.result,
      }),
    );
  } finally {
    transport.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
