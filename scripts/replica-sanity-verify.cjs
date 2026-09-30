/** Read-only comparison of local preview markup with imported Sanity documents. */
require("dotenv").config();
const crypto = require("node:crypto");
const createBrowserTransport = require("./replica-sanity-browser.cjs");

async function main() {
  const project = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const transport = await createBrowserTransport(
    `https://${project}.api.sanity.io/v2024-08-01`,
    process.env.SANITY_API_TOKEN,
  );
  const routes = [
    "/",
    "/category",
    "/tag",
    "/collection",
    "/item/cursor",
    "/blog",
    "/pricing",
  ];
  const report = [];
  try {
    for (const route of routes) {
      const id = `replica.page.${crypto.createHash("sha256").update(route).digest("hex").slice(0, 32)}`;
      const query = encodeURIComponent(`*[_id == "${id}"][0].html`);
      const document = await transport.request(
        `/data/query/shopapphub?query=${query}`,
      );
      const response = await fetch(`http://localhost:3001${route}`);
      const html = await response.text();
      report.push({
        route,
        status: response.status,
        sameMarkup: html === document.result,
        bytes: html.length,
      });
    }
    const studio = await fetch("http://localhost:3001/studio");
    console.log(JSON.stringify({ pages: report, studioStatus: studio.status }));
    if (
      report.some((page) => page.status !== 200 || !page.sameMarkup) ||
      studio.status !== 200
    )
      process.exitCode = 1;
  } finally {
    transport.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
