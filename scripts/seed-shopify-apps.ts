import { resolve } from "node:path";
import { createClient } from "@sanity/client";
import dotenv from "dotenv";

/**
 * Run from the repository root: pnpm exec tsx scripts/seed-shopify-apps.ts
 * Reads Sanity settings specifically from .env (never logs credentials).
 * Creates missing published documents only; never patches/deletes existing data.
 * All new documents and strong references are committed in one transaction.
 * No asset uploads, remote scraping, or image fields are involved.
 *
 * Schema: item.categories/tags are reference arrays with _key;
 * category.group is a single reference; group/category have priority.
 * All four types require name and slug. Introduction is Markdown text.
 * publishDate makes items visible. pricePlan is the DIRECTORY submission plan,
 * not the Shopify app's pricing. No app prices/ratings are asserted here.
 *
 * Editorial seed descriptions; source for each app is its apps.shopify.com link
 * (checked 2026-09-28). Categories/tags below are our directory taxonomy.
 * Fixed IDs make repeated/concurrent runs of this script idempotent. Existing
 * documents with other IDs are reused by slug/name (or normalized app URL).
 * Avoid concurrent manual imports: Sanity does not enforce unique slugs.
 */

const groups = {
  marketing: ["Marketing & Conversion", "Tools for acquisition and retention."],
  storefront: [
    "Storefront Experience",
    "Tools for building the shopping experience.",
  ],
  operations: [
    "Store Operations",
    "Tools for store workflows and fulfillment.",
  ],
} as const;

const categories = {
  "email-marketing": [
    "Email Marketing",
    "Campaigns and customer messaging.",
    "marketing",
  ],
  "product-reviews": [
    "Product Reviews",
    "Customer feedback and social proof.",
    "marketing",
  ],
  "loyalty-referrals": [
    "Loyalty & Referrals",
    "Rewards and referral programs.",
    "marketing",
  ],
  "upsells-bundles": [
    "Upsells & Bundles",
    "Product recommendations and bundles.",
    "marketing",
  ],
  "lead-capture": [
    "Lead Capture",
    "Forms and popups for collecting leads.",
    "marketing",
  ],
  "page-builders": [
    "Page Builders",
    "Visual storefront and landing page tools.",
    "storefront",
  ],
  "search-discovery": [
    "Search & Discovery",
    "Help shoppers find relevant products.",
    "storefront",
  ],
  localization: [
    "Localization",
    "Translate and adapt storefront content.",
    "storefront",
  ],
  seo: ["SEO", "Tools for search visibility and optimization.", "storefront"],
  "customer-support": [
    "Customer Support",
    "Customer conversations and assistance.",
    "operations",
  ],
  automation: [
    "Workflow Automation",
    "Automate recurring store tasks.",
    "operations",
  ],
  subscriptions: [
    "Subscriptions",
    "Manage recurring product purchases.",
    "operations",
  ],
  "shipping-returns": [
    "Shipping & Returns",
    "Shipment tracking and returns management.",
    "operations",
  ],
  "data-management": [
    "Data Management",
    "Bulk store data import and export.",
    "operations",
  ],
  invoicing: [
    "Invoices & Documents",
    "Order invoices and packing slips.",
    "operations",
  ],
  sourcing: [
    "Product Sourcing",
    "Dropshipping and print-on-demand fulfillment.",
    "operations",
  ],
} as const satisfies Record<
  string,
  readonly [string, string, keyof typeof groups]
>;

const tags = {
  email: ["Email", "Email campaigns and customer communication."],
  sms: ["SMS", "Text message marketing."],
  popups: ["Popups", "Onsite forms and signup popups."],
  reviews: ["Reviews", "Collect and display customer reviews."],
  loyalty: ["Loyalty", "Rewards for repeat customers."],
  referrals: ["Referrals", "Customer referral programs."],
  wishlist: ["Wishlist", "Save products for future purchases."],
  "page-builder": ["Page Builder", "Visual page editing."],
  search: ["Search", "Product search and filtering."],
  "by-shopify": ["By Shopify", "Apps developed by Shopify."],
  chat: ["Live Chat", "Storefront customer messaging."],
  automation: ["Automation", "Automated store workflows."],
  bundles: ["Bundles", "Products sold together."],
  subscriptions: ["Subscriptions", "Recurring product orders."],
  translation: ["Translation", "Multilingual storefront content."],
  upselling: ["Upselling", "Additional product offers."],
  tracking: ["Order Tracking", "Shipment status updates."],
  returns: ["Returns", "Returns and exchange workflows."],
  invoices: ["Invoices", "Order documents and invoices."],
  "import-export": ["Import & Export", "Bulk store data transfers."],
  seo: ["SEO", "Search engine optimization."],
  dropshipping: ["Dropshipping", "Supplier-based product fulfillment."],
  "print-on-demand": ["Print on Demand", "Custom products produced on demand."],
} as const;

type AppSeed = {
  name: string;
  handle: string;
  description: string;
  categories: (keyof typeof categories)[];
  tags: (keyof typeof tags)[];
};

const apps: AppSeed[] = [
  {
    name: "Klaviyo",
    handle: "klaviyo-email-marketing",
    description:
      "Create email and SMS campaigns with customer segmentation and automated messaging.",
    categories: ["email-marketing"],
    tags: ["email", "sms", "automation"],
  },
  {
    name: "Omnisend",
    handle: "omnisend",
    description:
      "Manage email newsletters, SMS campaigns, and signup forms for your store.",
    categories: ["email-marketing", "lead-capture"],
    tags: ["email", "sms", "popups"],
  },
  {
    name: "Privy",
    handle: "privy",
    description:
      "Capture subscribers with popups and reach customers through email and SMS.",
    categories: ["email-marketing", "lead-capture"],
    tags: ["email", "sms", "popups"],
  },
  {
    name: "Judge.me",
    handle: "judgeme",
    description:
      "Collect product reviews and display customer ratings and testimonials.",
    categories: ["product-reviews"],
    tags: ["reviews"],
  },
  {
    name: "Loox",
    handle: "loox",
    description: "Collect and showcase visual product reviews from customers.",
    categories: ["product-reviews"],
    tags: ["reviews"],
  },
  {
    name: "Yotpo Product Reviews",
    handle: "yotpo-social-reviews",
    description:
      "Gather customer reviews and display user-generated content on product pages.",
    categories: ["product-reviews"],
    tags: ["reviews"],
  },
  {
    name: "Stamped Reviews & Loyalty",
    handle: "product-reviews-addon",
    description:
      "Collect customer reviews and support customer loyalty programs.",
    categories: ["product-reviews", "loyalty-referrals"],
    tags: ["reviews", "loyalty"],
  },
  {
    name: "Smile",
    handle: "smile-io",
    description: "Create loyalty programs with points, rewards, and VIP tiers.",
    categories: ["loyalty-referrals"],
    tags: ["loyalty"],
  },
  {
    name: "LoyaltyLion",
    handle: "loyaltylion",
    description:
      "Build customer loyalty programs with rewards, tiers, and referrals.",
    categories: ["loyalty-referrals"],
    tags: ["loyalty", "referrals"],
  },
  {
    name: "Growave",
    handle: "growave",
    description:
      "Combine loyalty rewards, reviews, and wishlists in a customer retention toolkit.",
    categories: ["loyalty-referrals", "product-reviews"],
    tags: ["loyalty", "reviews", "wishlist"],
  },
  {
    name: "ReferralCandy",
    handle: "referralcandy",
    description: "Run referral and affiliate programs for your Shopify store.",
    categories: ["loyalty-referrals"],
    tags: ["referrals"],
  },
  {
    name: "PageFly",
    handle: "pagefly",
    description:
      "Build storefront and landing pages with a visual drag-and-drop editor.",
    categories: ["page-builders"],
    tags: ["page-builder"],
  },
  {
    name: "GemPages",
    handle: "gempages",
    description:
      "Design landing pages and sales funnels using a visual page builder.",
    categories: ["page-builders"],
    tags: ["page-builder"],
  },
  {
    name: "Shogun",
    handle: "shogun",
    description:
      "Design product pages, landing pages, and blog content with visual editing tools.",
    categories: ["page-builders"],
    tags: ["page-builder"],
  },
  {
    name: "Shopify Search & Discovery",
    handle: "search-and-discovery",
    description:
      "Customize product search, filtering, and recommendations in your storefront.",
    categories: ["search-discovery"],
    tags: ["search", "by-shopify"],
  },
  {
    name: "Shopify Inbox",
    handle: "inbox",
    description:
      "Manage customer conversations and provide shopping assistance through chat.",
    categories: ["customer-support"],
    tags: ["chat", "by-shopify"],
  },
  {
    name: "Shopify Flow",
    handle: "flow",
    description: "Create automated workflows for recurring store processes.",
    categories: ["automation"],
    tags: ["automation", "by-shopify"],
  },
  {
    name: "Shopify Bundles",
    handle: "shopify-bundles",
    description: "Create fixed product bundles and multipacks for your store.",
    categories: ["upsells-bundles"],
    tags: ["bundles", "by-shopify"],
  },
  {
    name: "Shopify Subscriptions",
    handle: "shopify-subscriptions",
    description:
      "Offer recurring product purchases with subscription management.",
    categories: ["subscriptions"],
    tags: ["subscriptions", "by-shopify"],
  },
  {
    name: "Shopify Translate & Adapt",
    handle: "translate-and-adapt",
    description:
      "Translate and adapt storefront content for different markets.",
    categories: ["localization"],
    tags: ["translation", "by-shopify"],
  },
  {
    name: "Shopify Forms",
    handle: "shopify-forms",
    description:
      "Collect customer information through forms to grow your marketing list.",
    categories: ["lead-capture"],
    tags: ["popups", "by-shopify"],
  },
  {
    name: "ReConvert",
    handle: "reconvert-upsell-cross-sell",
    description:
      "Create upsell and cross-sell offers, including post-purchase offers.",
    categories: ["upsells-bundles"],
    tags: ["upselling"],
  },
  {
    name: "Frequently Bought Together",
    handle: "frequently-bought-together",
    description:
      "Recommend related products and offer product bundles to shoppers.",
    categories: ["upsells-bundles"],
    tags: ["bundles", "upselling"],
  },
  {
    name: "AfterShip Order Tracking",
    handle: "aftership",
    description: "Provide branded order tracking and shipment status updates.",
    categories: ["shipping-returns"],
    tags: ["tracking"],
  },
  {
    name: "AfterShip Returns & Exchanges",
    handle: "returns-center-by-aftership",
    description:
      "Manage customer returns, exchanges, and store credit workflows.",
    categories: ["shipping-returns"],
    tags: ["returns"],
  },
  {
    name: "Order Printer Pro",
    handle: "order-printer-pro",
    description: "Generate PDF invoices, quotes, and packing slips for orders.",
    categories: ["invoicing"],
    tags: ["invoices"],
  },
  {
    name: "Matrixify",
    handle: "excel-export-import",
    description: "Import, export, update, and migrate store data in bulk.",
    categories: ["data-management"],
    tags: ["import-export"],
  },
  {
    name: "Booster SEO",
    handle: "booster-apps-seo-optimizer",
    description:
      "Optimize store search visibility, images, and page speed with SEO tools.",
    categories: ["seo"],
    tags: ["seo"],
  },
  {
    name: "DSers",
    handle: "dsers",
    description:
      "Manage dropshipping products, supplier connections, and order fulfillment.",
    categories: ["sourcing"],
    tags: ["dropshipping"],
  },
  {
    name: "Printful",
    handle: "printful",
    description:
      "Create and sell custom print-on-demand products with fulfillment services.",
    categories: ["sourcing"],
    tags: ["print-on-demand"],
  },
];

type DocumentType = "group" | "category" | "tag" | "item";
type SeedDocument = {
  _id: string;
  _type: DocumentType;
  name: string;
  slug: { _type: "slug"; current: string };
  link?: string;
  [key: string]: unknown;
};
type ExistingDocument = {
  _id: string;
  _type: DocumentType;
  name?: string;
  slug?: { current?: string };
  link?: string;
};

function normalize(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLink(value?: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return normalize(value);
  }
}

function document(
  type: DocumentType,
  slug: string,
  name: string,
): SeedDocument {
  return {
    _id: `seed-shopify-${type}-${slug}`,
    _type: type,
    name,
    slug: { _type: "slug", current: slug },
  };
}

function reference(id: string) {
  return { _type: "reference" as const, _ref: id };
}

function references(keys: string[], ids: Map<string, string>) {
  return keys.map((key) => {
    const id = ids.get(key);
    if (!id) throw new Error(`Missing reference: ${key}`);
    return { ...reference(id), _key: key };
  });
}

async function main() {
  if (
    apps.length !== 30 ||
    new Set(apps.map((app) => app.handle)).size !== 30
  ) {
    throw new Error("Expected exactly 30 apps with unique handles.");
  }
  // Use parsed .env values so unrelated shell variables cannot redirect a seed.
  const env = dotenv.config({ path: resolve(process.cwd(), ".env") });
  if (env.error) throw new Error("Cannot read .env in the repository root.");
  const required = (key: string) => {
    const value = env.parsed?.[key]?.trim();
    if (!value) throw new Error(`Missing ${key} in .env`);
    return value;
  };
  const client = createClient({
    projectId: required("NEXT_PUBLIC_SANITY_PROJECT_ID"),
    dataset: required("NEXT_PUBLIC_SANITY_DATASET"),
    token: required("SANITY_API_TOKEN"),
    apiVersion: "2024-08-01",
    useCdn: false,
    // Include drafts in duplicate detection; never silently publish a draft.
    perspective: "raw",
  });
  const existing = await client.fetch<ExistingDocument[]>(
    '*[_type in ["group", "category", "tag", "item"]]{_id, _type, name, slug, link}',
  );
  const planned: SeedDocument[] = [];
  const counts = {
    group: { create: 0, reuse: 0 },
    category: { create: 0, reuse: 0 },
    tag: { create: 0, reuse: 0 },
    item: { create: 0, reuse: 0 },
  };

  const ensure = (seed: SeedDocument): string => {
    const matches = existing.filter((entry) => {
      const baseId = entry._id.replace(/^drafts\./, "");
      return (
        baseId === seed._id ||
        (entry._type === seed._type &&
          (normalize(entry.slug?.current) === normalize(seed.slug.current) ||
            normalize(entry.name) === normalize(seed.name) ||
            (seed._type === "item" &&
              !!seed.link &&
              normalizeLink(entry.link) === normalizeLink(seed.link))))
      );
    });
    const ids = new Set(
      matches.map((entry) => entry._id.replace(/^drafts\./, "")),
    );
    if (ids.size > 1) {
      throw new Error(
        `Conflicting ${seed._type} matches for ${seed.name}: ${[...ids].join(", ")}. Resolve duplicates before retrying.`,
      );
    }
    if (matches.length) {
      const published = matches.find(
        (entry) =>
          !entry._id.startsWith("drafts.") &&
          !entry._id.startsWith("versions."),
      );
      if (!published || published._type !== seed._type) {
        throw new Error(
          `Cannot reuse ${seed.name}: draft/version only or ID type conflict. Review in Studio first.`,
        );
      }
      counts[seed._type].reuse++;
      return published._id;
    }
    planned.push(seed);
    existing.push(seed);
    counts[seed._type].create++;
    return seed._id;
  };

  const groupIds = new Map<string, string>();
  for (const [slug, [name, description]] of Object.entries(groups)) {
    groupIds.set(
      slug,
      ensure({ ...document("group", slug, name), description, priority: 0 }),
    );
  }
  const categoryIds = new Map<string, string>();
  for (const [slug, [name, description, group]] of Object.entries(categories)) {
    const groupId = groupIds.get(group);
    if (!groupId) throw new Error(`Missing group: ${group}`);
    categoryIds.set(
      slug,
      ensure({
        ...document("category", slug, name),
        description,
        priority: 0,
        group: reference(groupId),
      }),
    );
  }
  const tagIds = new Map<string, string>();
  for (const [slug, [name, description]] of Object.entries(tags)) {
    tagIds.set(slug, ensure({ ...document("tag", slug, name), description }));
  }
  const publishDate = new Date().toISOString();
  for (const app of apps) {
    const link = `https://apps.shopify.com/${app.handle}`;
    ensure({
      ...document("item", app.handle, app.name),
      link,
      description: app.description,
      introduction: `## ${app.name}\n\n${app.description}\n\n[View on Shopify App Store](${link})`,
      categories: references(app.categories, categoryIds),
      tags: references(app.tags, tagIds),
      publishDate,
      pricePlan: "free",
      freePlanStatus: "approved",
      featured: false,
      paid: false,
      forceHidden: false,
      sponsor: false,
    });
  }

  console.table(counts);
  if (!planned.length) {
    console.log("All seed documents already exist; nothing to create.");
    return;
  }
  const transaction = client.transaction();
  for (const seed of planned) transaction.createIfNotExists(seed);
  await transaction.commit({ visibility: "sync" });
  console.log(
    `Seed complete: ${planned.length} missing documents ensured. Existing documents preserved.`,
  );
}

main().catch((error: unknown) => {
  // Avoid dumping SDK request objects/headers that might contain the API token.
  console.error(
    "Shopify seed failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
