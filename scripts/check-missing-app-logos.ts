import { resolve } from "node:path";
import { createClient, requester } from "@sanity/client";
import dotenv from "dotenv";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * Run from repository root: pnpm exec tsx scripts/check-missing-app-logos.ts
 * Read-only: queries every item document, including drafts/releases (raw).
 * Documents are counted individually, without limiting to the 100-app seed.
 * An image is present when either icon or image has a nonempty asset reference.
 * Empty image objects count as missing; asset availability is not downloaded or checked.
 */
type Item = {
  _id: string;
  name?: string;
  slug?: { current?: string };
  link?: string;
  icon?: { asset?: { _ref?: string } };
  image?: { asset?: { _ref?: string } };
};

async function main() {
  const env = dotenv.config({ path: resolve(process.cwd(), ".env") });
  if (env.error) throw new Error("Cannot read .env in the repository root.");
  const required = (key: string) => {
    const value = env.parsed?.[key]?.trim();
    if (!value) throw new Error(`Missing ${key} in .env`);
    return value;
  };

  // Same proxy middleware as seed-shopify-app-logos.ts.
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const proxyRequester = proxyUrl ? requester.clone() : undefined;
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
  if (proxyRequester && agent) {
    proxyRequester.use({
      finalizeOptions: (options) => ({ ...options, agent }),
    });
  }
  const client = createClient({
    projectId: required("NEXT_PUBLIC_SANITY_PROJECT_ID"),
    dataset: required("NEXT_PUBLIC_SANITY_DATASET"),
    token: required("SANITY_API_TOKEN"),
    apiVersion: "2024-08-01",
    useCdn: false,
    perspective: "raw",
    ...(proxyRequester ? { requester: proxyRequester } : {}),
  });

  // The only Sanity operation is a read query; no patches or asset uploads.
  const items = await client.fetch<Item[]>(
    '*[_type == "item"] | order(name asc, _id asc) {_id, name, slug, link, icon{asset{_ref}}, image{asset{_ref}}}',
  );
  const missing = items.filter(
    (item) => !item.icon?.asset?._ref && !item.image?.asset?._ref,
  );
  console.log("Item documents (raw perspective, including drafts/releases):");
  console.table({
    total: items.length,
    withIconOrImage: items.length - missing.length,
    missingBothIconAndImage: missing.length,
  });

  if (!missing.length) {
    console.log("All item documents have an icon or image asset reference.");
    return;
  }
  console.log("Items missing both icon and image:");
  // JSON lines preserve long names/URLs without console.table truncation.
  for (const item of missing) {
    console.log(
      JSON.stringify({
        _id: item._id,
        name: item.name ?? null,
        slug: item.slug?.current ?? null,
        link: item.link ?? null,
      }),
    );
  }
}

main().catch(() => {
  // Do not expose SDK request objects, headers, proxy credentials, or tokens.
  console.error(
    "Read-only logo check failed. Check .env settings, proxy/network connectivity, and Sanity read permissions.",
  );
  process.exitCode = 1;
});
