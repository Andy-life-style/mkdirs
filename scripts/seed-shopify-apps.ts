import { resolve } from "node:path";
import { createClient, requester } from "@sanity/client";
import dotenv from "dotenv";
import { HttpsProxyAgent } from "https-proxy-agent";

/**
 * Run from the repository root: pnpm exec tsx scripts/seed-shopify-apps.ts
 * Reads Sanity settings specifically from .env (never logs credentials).
 * Creates missing published documents; only appends missing collection references
 * to existing published items, preserving their content and manual memberships.
 * All new documents and strong references are committed in one transaction.
 * No asset uploads, remote scraping, or image fields are involved.
 *
 * Schema: item.categories/tags are reference arrays with _key;
 * category.group is a single reference; group/category have priority.
 * All five types require name and slug. Introduction is Markdown text.
 * publishDate makes items visible. pricePlan is the DIRECTORY submission plan,
 * not the Shopify app's pricing. No app prices/ratings are asserted here.
 *
 * Editorial seed descriptions; source for each app is its apps.shopify.com link
 * (checked 2026-09-28). Categories/tags below are our directory taxonomy.
 * Fixed IDs make repeated/concurrent runs of this script idempotent. Existing
 * documents with other IDs are reused by slug/name (or normalized app URL).
 * Avoid concurrent manual imports: Sanity does not enforce unique slugs.
 * Sidebar: SUPPORT_CATEGORY_GROUP=true uses group -> category; tags populate
 * home filters. Collections are reached through collection pages, not the sidebar.
 * Existing UI pagination and collapsed-group behavior are intentionally unchanged.
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
  merchandising: [
    "Products & Selling",
    "Tools for product choices and selling models.",
  ],
  inventory: [
    "Inventory & Delivery",
    "Tools for stock availability and shipping labels.",
  ],
  channels: [
    "Sales Channels",
    "Tools for product feeds and social storefront content.",
  ],
  insights: [
    "Analytics & Insights",
    "Tools for reporting and understanding store activity.",
  ],
  trust: [
    "Privacy & Access",
    "Tools for consent preferences and storefront access.",
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
  "sms-marketing": [
    "SMS Marketing",
    "Customer messaging through text campaigns.",
    "marketing",
  ],
  "affiliate-marketing": [
    "Affiliate Marketing",
    "Partner and customer referral programs.",
    "marketing",
  ],
  "product-options": [
    "Product Options",
    "Product customization and option selection.",
    "merchandising",
  ],
  wishlists: [
    "Wishlists",
    "Let shoppers save products for later.",
    "merchandising",
  ],
  "digital-products": [
    "Digital Products",
    "Deliver downloadable products and files.",
    "merchandising",
  ],
  bookings: [
    "Bookings & Appointments",
    "Schedule services and customer appointments.",
    "merchandising",
  ],
  wholesale: [
    "Wholesale & B2B",
    "Workflows for wholesale buyers and trade orders.",
    "merchandising",
  ],
  preorders: [
    "Preorders & Restock Alerts",
    "Manage product availability and customer notifications.",
    "inventory",
  ],
  "inventory-sync": [
    "Inventory Sync",
    "Synchronize stock across feeds and sales channels.",
    "inventory",
  ],
  "shipping-labels": [
    "Shipping Labels",
    "Prepare carrier labels and shipping workflows.",
    "inventory",
  ],
  "sales-channels": [
    "Product Feeds & Channels",
    "Connect product catalogs with external sales channels.",
    "channels",
  ],
  "social-feeds": [
    "Social Feeds",
    "Display social content on the storefront.",
    "channels",
  ],
  reporting: [
    "Reports & Analytics",
    "Review store activity through reports and dashboards.",
    "insights",
  ],
  "behavior-analytics": [
    "Heatmaps & Session Replay",
    "Explore how visitors interact with store pages.",
    "insights",
  ],
  "cookie-consent": [
    "Cookie Consent",
    "Manage cookie banners and consent preferences.",
    "trust",
  ],
  "access-control": [
    "Store Access Control",
    "Control access to selected storefront content.",
    "trust",
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
  "push-notifications": [
    "Push Notifications",
    "Browser notifications for store visitors.",
  ],
  affiliates: ["Affiliates", "Partner-led referral programs."],
  "visual-reviews": [
    "Visual Reviews",
    "Customer reviews with photos or videos.",
  ],
  filters: ["Product Filters", "Narrow product results using filters."],
  helpdesk: ["Helpdesk", "Organize customer support requests."],
  "shipping-labels": ["Shipping Labels", "Prepare labels for order shipments."],
  inventory: ["Inventory", "Manage and synchronize product stock."],
  preorders: ["Preorders", "Accept orders ahead of product availability."],
  "back-in-stock": ["Back in Stock", "Notify shoppers when products return."],
  "product-options": [
    "Product Options",
    "Collect product customization choices.",
  ],
  "digital-downloads": ["Digital Downloads", "Deliver files to customers."],
  bookings: ["Bookings", "Schedule appointments and services."],
  b2b: ["B2B", "Wholesale and trade customer workflows."],
  analytics: ["Analytics", "Reports on store activity."],
  heatmaps: ["Heatmaps", "Visualize visitor interactions with pages."],
  "cookie-consent": [
    "Cookie Consent",
    "Collect and manage cookie preferences.",
  ],
  "access-control": ["Access Control", "Restrict selected storefront content."],
  "social-feeds": [
    "Social Feeds",
    "Display social media content in the store.",
  ],
  "product-feeds": ["Product Feeds", "Connect catalogs to shopping channels."],
  segmentation: [
    "Customer Segmentation",
    "Group customers for targeted messaging.",
  ],
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
  // Additional editorial entries; official listing: apps.shopify.com/<handle>.
  {
    name: "Avada Email Marketing",
    handle: "avada-email-marketing",
    description:
      "Create email campaigns, signup forms, and automated customer messages.",
    categories: ["email-marketing", "lead-capture"],
    tags: ["email", "popups", "automation", "segmentation"],
  },
  {
    name: "Postscript SMS Marketing",
    handle: "postscript-sms-marketing",
    description:
      "Organize SMS campaigns and automated messages for customer segments.",
    categories: ["sms-marketing"],
    tags: ["sms", "automation", "segmentation"],
  },
  {
    name: "Brevo PushOwl",
    handle: "pushowl",
    description:
      "Reach store visitors through email, SMS, and browser push notifications.",
    categories: ["email-marketing", "sms-marketing"],
    tags: ["email", "sms", "push-notifications"],
  },
  {
    name: "Sendvio",
    handle: "sendvio-email-marketing-sms",
    description:
      "Manage email and SMS campaigns with automated customer follow-ups.",
    categories: ["email-marketing", "sms-marketing"],
    tags: ["email", "sms", "automation"],
  },
  {
    name: "Vitals",
    handle: "vitals",
    description:
      "Combine product reviews, bundle offers, and other storefront marketing tools.",
    categories: ["product-reviews", "upsells-bundles"],
    tags: ["reviews", "bundles"],
  },
  {
    name: "Fera Product Reviews",
    handle: "fera",
    description: "Collect and display customer reviews with photos and videos.",
    categories: ["product-reviews"],
    tags: ["reviews", "visual-reviews"],
  },
  {
    name: "Okendo",
    handle: "okendo-reviews",
    description:
      "Manage customer reviews, loyalty programs, and referral experiences.",
    categories: ["product-reviews", "loyalty-referrals"],
    tags: ["reviews", "loyalty", "referrals"],
  },
  {
    name: "Rivyo Product Reviews",
    handle: "rivyo-product-review",
    description:
      "Collect product feedback and display customer reviews in your store.",
    categories: ["product-reviews"],
    tags: ["reviews"],
  },
  {
    name: "Ali Reviews",
    handle: "ali-reviews",
    description: "Import and display product reviews for a Shopify catalog.",
    categories: ["product-reviews"],
    tags: ["reviews"],
  },
  {
    name: "Rivo",
    handle: "rivo-loyalty",
    description: "Create customer loyalty rewards and referral programs.",
    categories: ["loyalty-referrals"],
    tags: ["loyalty", "referrals"],
  },
  {
    name: "Joy Loyalty",
    handle: "joyio",
    description: "Manage loyalty points, rewards, VIP tiers, and referrals.",
    categories: ["loyalty-referrals"],
    tags: ["loyalty", "referrals"],
  },
  {
    name: "Snowball Affiliate Marketing",
    handle: "social-snowball",
    description:
      "Organize affiliate, influencer, and customer referral programs.",
    categories: ["affiliate-marketing"],
    tags: ["affiliates", "referrals"],
  },
  {
    name: "LayoutHub",
    handle: "layout-hub",
    description: "Build storefront and landing pages using visual layouts.",
    categories: ["page-builders"],
    tags: ["page-builder"],
  },
  {
    name: "EComposer",
    handle: "ecomposer",
    description:
      "Design storefront pages and sections with a visual page builder.",
    categories: ["page-builders"],
    tags: ["page-builder"],
  },
  {
    name: "Instant Page Builder",
    handle: "instant-builder",
    description:
      "Create landing pages, product pages, and storefront sections.",
    categories: ["page-builders"],
    tags: ["page-builder"],
  },
  {
    name: "Searchanise",
    handle: "searchanise",
    description:
      "Help shoppers navigate catalogs with product search and filters.",
    categories: ["search-discovery"],
    tags: ["search", "filters"],
  },
  {
    name: "Tidio",
    handle: "tidio-chat",
    description: "Manage customer questions with live chat and helpdesk tools.",
    categories: ["customer-support"],
    tags: ["chat", "helpdesk"],
  },
  {
    name: "SB Helpdesk, Live Chat & FAQs",
    handle: "helpcenter",
    description:
      "Organize customer support tickets, live chat, and frequently asked questions.",
    categories: ["customer-support"],
    tags: ["chat", "helpdesk"],
  },
  {
    name: "Seal Subscriptions",
    handle: "seal-subscriptions",
    description:
      "Set up recurring product orders and manage customer subscriptions.",
    categories: ["subscriptions"],
    tags: ["subscriptions"],
  },
  {
    name: "Loop Subscriptions",
    handle: "loop-subscriptions",
    description: "Manage subscription plans and recurring customer purchases.",
    categories: ["subscriptions"],
    tags: ["subscriptions"],
  },
  {
    name: "PayWhirl",
    handle: "paywhirl",
    description:
      "Create subscription plans and manage recurring purchase workflows.",
    categories: ["subscriptions"],
    tags: ["subscriptions"],
  },
  {
    name: "ShipStation",
    handle: "shipstation",
    description:
      "Organize order fulfillment, inventory, and shipping label workflows.",
    categories: ["shipping-labels", "shipping-returns"],
    tags: ["shipping-labels", "inventory", "tracking"],
  },
  {
    name: "Shippo",
    handle: "shippo",
    description: "Prepare shipping labels and manage shipment workflows.",
    categories: ["shipping-labels"],
    tags: ["shipping-labels"],
  },
  {
    name: "TrackingMore",
    handle: "trackingmore",
    description:
      "Provide shipment tracking and order status information to customers.",
    categories: ["shipping-returns"],
    tags: ["tracking"],
  },
  {
    name: "Return Prime",
    handle: "return-prime",
    description: "Manage return requests and product exchange workflows.",
    categories: ["shipping-returns"],
    tags: ["returns"],
  },
  {
    name: "Printify",
    handle: "printify",
    description:
      "Create custom products and connect orders with print-on-demand fulfillment.",
    categories: ["sourcing"],
    tags: ["print-on-demand"],
  },
  {
    name: "Gelato",
    handle: "gelato-print-on-demand",
    description:
      "Sell custom products through a print-on-demand production network.",
    categories: ["sourcing"],
    tags: ["print-on-demand"],
  },
  {
    name: "Spocket",
    handle: "spocket",
    description:
      "Find supplier products and manage dropshipping sourcing workflows.",
    categories: ["sourcing"],
    tags: ["dropshipping"],
  },
  {
    name: "Zendrop",
    handle: "zendrop",
    description:
      "Source dropshipping products and coordinate supplier fulfillment.",
    categories: ["sourcing"],
    tags: ["dropshipping"],
  },
  {
    name: "AutoDS",
    handle: "autods",
    description:
      "Find supplier products and automate dropshipping store workflows.",
    categories: ["sourcing", "automation"],
    tags: ["dropshipping", "automation"],
  },
  {
    name: "Plug in SEO",
    handle: "plug-in-seo",
    description:
      "Review store SEO issues and manage search optimization tasks.",
    categories: ["seo"],
    tags: ["seo"],
  },
  {
    name: "Smart SEO",
    handle: "smart-seo",
    description: "Manage store SEO and image optimization tasks.",
    categories: ["seo"],
    tags: ["seo"],
  },
  {
    name: "langify",
    handle: "langify",
    description:
      "Translate storefront content for shoppers in different languages.",
    categories: ["localization"],
    tags: ["translation"],
  },
  {
    name: "Weglot",
    handle: "weglot",
    description:
      "Translate store pages and manage multilingual storefront content.",
    categories: ["localization"],
    tags: ["translation"],
  },
  {
    name: "Hextom Translate & Currency",
    handle: "translate-my-store",
    description:
      "Translate storefront content and provide currency display tools.",
    categories: ["localization"],
    tags: ["translation"],
  },
  {
    name: "Mechanic",
    handle: "mechanic",
    description:
      "Create automated tasks for recurring Shopify store workflows.",
    categories: ["automation"],
    tags: ["automation"],
  },
  {
    name: "Order Automator",
    handle: "order-automator",
    description: "Automate recurring order processing and fulfillment tasks.",
    categories: ["automation"],
    tags: ["automation"],
  },
  {
    name: "syncX Stock Sync",
    handle: "stock-sync",
    description:
      "Import product data and synchronize inventory from supplier feeds.",
    categories: ["inventory-sync", "data-management"],
    tags: ["inventory", "import-export"],
  },
  {
    name: "Trunk",
    handle: "trunk",
    description:
      "Synchronize inventory across connected stores and sales channels.",
    categories: ["inventory-sync"],
    tags: ["inventory"],
  },
  {
    name: "Amai PreOrder Manager",
    handle: "pre-order",
    description: "Manage product preorders and back-in-stock notifications.",
    categories: ["preorders"],
    tags: ["preorders", "back-in-stock"],
  },
  {
    name: "Timesact",
    handle: "timesact-discount-pre-order",
    description: "Offer preorders and manage back-in-stock waitlists.",
    categories: ["preorders"],
    tags: ["preorders", "back-in-stock"],
  },
  {
    name: "Amp Back in Stock & Preorder",
    handle: "back-in-stock",
    description:
      "Collect shopper interest with restock alerts, preorders, and wishlists.",
    categories: ["preorders", "wishlists"],
    tags: ["back-in-stock", "preorders", "wishlist"],
  },
  {
    name: "PC Custom Product Options",
    handle: "product-customizer",
    description:
      "Let shoppers choose custom product options and personalization details.",
    categories: ["product-options"],
    tags: ["product-options"],
  },
  {
    name: "Shopify Digital Products",
    handle: "digital-downloads",
    description:
      "Deliver digital products and downloadable files to customers.",
    categories: ["digital-products"],
    tags: ["digital-downloads", "by-shopify"],
  },
  {
    name: "SendOwl",
    handle: "sendowl",
    description:
      "Sell digital products and deliver purchased files to customers.",
    categories: ["digital-products"],
    tags: ["digital-downloads"],
  },
  {
    name: "Sky Pilot",
    handle: "sky-pilot",
    description:
      "Deliver digital products such as ebooks and downloadable files.",
    categories: ["digital-products"],
    tags: ["digital-downloads"],
  },
  {
    name: "Uplinkly Digital Downloads",
    handle: "digital-downloads-2",
    description:
      "Attach downloadable files to products and deliver digital purchases.",
    categories: ["digital-products"],
    tags: ["digital-downloads"],
  },
  {
    name: "Sesami",
    handle: "sesami",
    description:
      "Schedule customer appointments, services, and bookable experiences.",
    categories: ["bookings"],
    tags: ["bookings"],
  },
  {
    name: "Wholesale Pricing Discount",
    handle: "wholesale-pricing-discount",
    description:
      "Manage wholesale buyer pricing rules and quantity-based offers.",
    categories: ["wholesale"],
    tags: ["b2b"],
  },
  {
    name: "Locksmith",
    handle: "locksmith",
    description:
      "Control customer access to selected products and storefront pages.",
    categories: ["access-control"],
    tags: ["access-control"],
  },
  {
    name: "BSS B2B Wholesale Pricing",
    handle: "b2b-solution-custom-pricing",
    description:
      "Set up wholesale registration and buyer-specific pricing workflows.",
    categories: ["wholesale"],
    tags: ["b2b"],
  },
  {
    name: "Report Pundit",
    handle: "report-pundit",
    description: "Build custom store reports and schedule their delivery.",
    categories: ["reporting"],
    tags: ["analytics"],
  },
  {
    name: "Lucky Orange",
    handle: "lucky-orange",
    description:
      "Explore visitor interactions using heatmaps and session recordings.",
    categories: ["behavior-analytics"],
    tags: ["heatmaps", "analytics"],
  },
  {
    name: "Hotjar Install",
    handle: "hotjar",
    description:
      "Connect a storefront with Hotjar to examine visitor interactions.",
    categories: ["behavior-analytics"],
    tags: ["heatmaps", "analytics"],
  },
  {
    name: "BeProfit",
    handle: "beprofit-profit-tracker",
    description:
      "Organize store revenue and cost data in analytics dashboards.",
    categories: ["reporting"],
    tags: ["analytics"],
  },
  {
    name: "Bundler",
    handle: "bundler-product-bundles",
    description: "Create product bundles and quantity-based offers.",
    categories: ["upsells-bundles"],
    tags: ["bundles", "upselling"],
  },
  {
    name: "Rebuy",
    handle: "rebuy",
    description:
      "Offer product recommendations across cart, checkout, and post-purchase experiences.",
    categories: ["upsells-bundles"],
    tags: ["upselling"],
  },
  {
    name: "Aftersell",
    handle: "aftersell",
    description:
      "Create post-purchase offers and customize thank-you page selling experiences.",
    categories: ["upsells-bundles"],
    tags: ["upselling"],
  },
  {
    name: "Booster Discounted Upsells",
    handle: "discounted-upsells",
    description:
      "Present related product offers with merchant-configured discounts.",
    categories: ["upsells-bundles"],
    tags: ["upselling"],
  },
  {
    name: "Globo Product Options",
    handle: "product-options-pro",
    description:
      "Collect personalization choices with product option fields and selectors.",
    categories: ["product-options"],
    tags: ["product-options"],
  },
  {
    name: "Appstle Subscriptions",
    handle: "subscriptions-by-appstle",
    description:
      "Manage recurring orders, subscription boxes, and customer subscription preferences.",
    categories: ["subscriptions"],
    tags: ["subscriptions", "bundles"],
  },
  {
    name: "Wishlist Hero",
    handle: "wishlist-hero",
    description:
      "Let shoppers save products to wishlists and receive reminder emails.",
    categories: ["wishlists"],
    tags: ["wishlist"],
  },
  {
    name: "Pandectes GDPR Compliance",
    handle: "gdpr-cookie-consent",
    description:
      "Configure cookie banners and manage visitor consent preferences.",
    categories: ["cookie-consent"],
    tags: ["cookie-consent"],
  },
  {
    name: "Instafeed",
    handle: "instafeed",
    description: "Display Instagram posts and videos in storefront feeds.",
    categories: ["social-feeds"],
    tags: ["social-feeds"],
  },
  {
    name: "Google & YouTube",
    handle: "google",
    description:
      "Connect store products with shopping experiences on Google and YouTube.",
    categories: ["sales-channels"],
    tags: ["product-feeds"],
  },
  {
    name: "TikTok",
    handle: "tiktok",
    description:
      "Connect store products with TikTok advertising and shopping workflows.",
    categories: ["sales-channels"],
    tags: ["product-feeds"],
  },
  {
    name: "Pinterest",
    handle: "pinterest",
    description:
      "Connect a product catalog with Pinterest shopping and advertising tools.",
    categories: ["sales-channels"],
    tags: ["product-feeds"],
  },
  {
    name: "Facebook & Instagram",
    handle: "facebook",
    description:
      "Manage product connections with Facebook and Instagram shopping tools.",
    categories: ["sales-channels"],
    tags: ["product-feeds"],
  },
  {
    name: "Shop",
    handle: "shop",
    description:
      "Manage a store presence and product discovery in the Shop channel.",
    categories: ["sales-channels"],
    tags: ["product-feeds", "by-shopify"],
  },
  {
    name: "Microsoft Channel",
    handle: "microsoft-advertising",
    description: "Connect a product catalog with Microsoft shopping ads.",
    categories: ["sales-channels"],
    tags: ["product-feeds"],
  },
];

// Editorial use-case collections, matched by any listed category or tag.
// Membership lives on item.collections (the collection schema has no items field).
const collections = {
  "customer-messaging": {
    name: "Customer Messaging",
    description: "Email, SMS, and signup tools for customer communication.",
    categories: ["email-marketing", "sms-marketing", "lead-capture"],
    tags: [],
  },
  "reviews-rewards-referrals": {
    name: "Reviews, Rewards & Referrals",
    description: "Tools for customer feedback, loyalty, and referral programs.",
    categories: ["product-reviews", "loyalty-referrals", "affiliate-marketing"],
    tags: [],
  },
  "storefront-building": {
    name: "Storefront Building",
    description:
      "Build store pages and display social content or saved products.",
    categories: ["page-builders", "social-feeds", "wishlists"],
    tags: [],
  },
  "product-discovery": {
    name: "Product Discovery & Offers",
    description: "Tools for product search, SEO, bundles, and related offers.",
    categories: ["search-discovery", "seo", "upsells-bundles"],
    tags: [],
  },
  "international-storefronts": {
    name: "International Storefronts",
    description: "Tools for translating and adapting store content.",
    categories: ["localization"],
    tags: [],
  },
  "subscription-selling": {
    name: "Subscription Selling",
    description:
      "Tools for recurring product orders and subscription management.",
    categories: ["subscriptions"],
    tags: [],
  },
  "inventory-fulfillment": {
    name: "Inventory & Fulfillment",
    description:
      "Stock synchronization, preorders, shipping, returns, and documents.",
    categories: [
      "inventory-sync",
      "preorders",
      "shipping-labels",
      "shipping-returns",
      "invoicing",
    ],
    tags: [],
  },
  "sourcing-custom-products": {
    name: "Sourcing & Custom Products",
    description: "Tools for supplier sourcing and print-on-demand products.",
    categories: ["sourcing"],
    tags: [],
  },
  "store-operations-insights": {
    name: "Store Operations & Insights",
    description:
      "Automate store work, move data, and review customer activity.",
    categories: [
      "automation",
      "data-management",
      "reporting",
      "behavior-analytics",
    ],
    tags: [],
  },
  "specialized-selling": {
    name: "Specialized Selling",
    description:
      "Product options, digital downloads, service bookings, and wholesale.",
    categories: [
      "product-options",
      "digital-products",
      "bookings",
      "wholesale",
    ],
    tags: [],
  },
  "channels-shopify-tools": {
    name: "Sales Channels & Shopify Tools",
    description: "Catalog channel connections and tools developed by Shopify.",
    categories: ["sales-channels"],
    tags: ["by-shopify"],
  },
  "customer-care-privacy": {
    name: "Customer Care & Privacy",
    description:
      "Customer support, cookie preferences, and storefront access tools.",
    categories: ["customer-support", "cookie-consent", "access-control"],
    tags: [],
  },
} satisfies Record<
  string,
  {
    name: string;
    description: string;
    categories: (keyof typeof categories)[];
    tags: (keyof typeof tags)[];
  }
>;

function collectionSlugs(app: AppSeed): string[] {
  return Object.entries(collections)
    .filter(
      ([, collection]) =>
        collection.categories.some((category) =>
          app.categories.includes(category),
        ) || collection.tags.some((tag) => app.tags.includes(tag)),
    )
    .map(([slug]) => slug);
}

type DocumentType = "group" | "category" | "tag" | "collection" | "item";
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
  _rev?: string;
  _type: DocumentType;
  name?: string;
  slug?: { current?: string };
  link?: string;
  collections?: { _key: string; _type: "reference"; _ref: string }[];
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
    apps.length !== 100 ||
    new Set(apps.map((app) => app.handle)).size !== 100 ||
    new Set(apps.map((app) => normalize(app.name))).size !== 100
  ) {
    throw new Error("Expected exactly 100 apps with unique handles and names.");
  }
  // Reject empty navigation entries and bad memberships before reading credentials.
  for (const [slug] of Object.entries(groups)) {
    if (!Object.values(categories).some((category) => category[2] === slug)) {
      throw new Error(`Empty group: ${slug}`);
    }
  }
  for (const [field, taxonomy] of Object.entries({ categories, tags })) {
    const used = new Set<string>(
      apps.flatMap((app) => app[field as "categories" | "tags"]),
    );
    for (const slug of Object.keys(taxonomy)) {
      if (!used.has(slug)) throw new Error(`Unused ${field}: ${slug}`);
    }
  }
  for (const app of apps) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.handle)) {
      throw new Error(`Invalid app handle: ${app.handle}`);
    }
    for (const [keys, taxonomy] of [
      [app.categories, categories],
      [app.tags, tags],
    ] as const) {
      if (
        !keys.length ||
        new Set(keys).size !== keys.length ||
        keys.some((key) => !(key in taxonomy))
      ) {
        throw new Error(`Invalid taxonomy references for ${app.name}`);
      }
    }
    if (!collectionSlugs(app).length)
      throw new Error(`No collection for ${app.name}`);
  }
  for (const slug of Object.keys(collections)) {
    if (!apps.some((app) => collectionSlugs(app).includes(slug))) {
      throw new Error(`Empty collection: ${slug}`);
    }
  }
  // Use parsed .env values so unrelated shell variables cannot redirect a seed.
  const env = dotenv.config({ path: resolve(process.cwd(), ".env") });
  if (env.error) throw new Error("Cannot read .env in the repository root.");
  const required = (key: string) => {
    const value = env.parsed?.[key]?.trim();
    if (!value) throw new Error(`Missing ${key} in .env`);
    return value;
  };
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const proxyRequester = proxyUrl ? requester.clone() : undefined;
  if (proxyUrl && proxyRequester) {
    const agent = new HttpsProxyAgent(proxyUrl);
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
    ...(proxyRequester ? { requester: proxyRequester } : {}),
    // Include drafts in duplicate detection; never silently publish a draft.
    perspective: "raw",
  });
  const existing = await client.fetch<ExistingDocument[]>(
    '*[_type in ["group", "category", "tag", "collection", "item"]]{_id, _rev, _type, name, slug, link, collections}',
  );
  const planned: SeedDocument[] = [];
  const counts = {
    group: { create: 0, reuse: 0 },
    category: { create: 0, reuse: 0 },
    tag: { create: 0, reuse: 0 },
    collection: { create: 0, reuse: 0 },
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
        `Conflicting ${seed._type} matches for ${seed.name}: ${Array.from(ids).join(", ")}. Resolve duplicates before retrying.`,
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
  const collectionIds = new Map<string, string>();
  for (const [slug, { name, description }] of Object.entries(collections)) {
    collectionIds.set(
      slug,
      ensure({
        ...document("collection", slug, name),
        description,
        priority: 0,
      }),
    );
  }
  const collectionPatches: {
    id: string;
    revision: string;
    additions: ReturnType<typeof references>;
  }[] = [];
  for (const app of apps) {
    const link = `https://apps.shopify.com/${app.handle}`;
    const memberships = references(collectionSlugs(app), collectionIds);
    const id = ensure({
      ...document("item", app.handle, app.name),
      link,
      description: app.description,
      introduction: `## ${app.name}\n\n${app.description}\n\n[View on Shopify App Store](${link})`,
      categories: references(app.categories, categoryIds),
      tags: references(app.tags, tagIds),
      collections: memberships,
      publishDate,
      pricePlan: "free",
      freePlanStatus: "approved",
      featured: false,
      paid: false,
      forceHidden: false,
      sponsor: false,
    });
    if (planned.some((seed) => seed._id === id)) continue;
    const current = existing.find((entry) => entry._id === id);
    if (!current?._rev) throw new Error(`Missing revision for ${app.name}`);
    const currentMemberships = current.collections ?? [];
    const additions = memberships.filter(
      (membership) =>
        !currentMemberships.some((entry) => entry._ref === membership._ref),
    );
    // Preserve hand-edited references and their keys, including unrelated collections.
    const keys = new Set(currentMemberships.map((entry) => entry._key));
    for (const addition of additions) {
      const baseKey = `seed-${addition._key}`;
      let suffix = 0;
      addition._key = baseKey;
      while (keys.has(addition._key)) addition._key = `${baseKey}-${++suffix}`;
      keys.add(addition._key);
    }
    if (additions.length)
      collectionPatches.push({ id, revision: current._rev, additions });
  }

  console.table(counts);
  console.log(
    `Existing items needing collection links: ${collectionPatches.length}`,
  );
  if (!planned.length && !collectionPatches.length) {
    console.log(
      "All seed documents and collection links already exist; nothing to change.",
    );
    return;
  }
  const transaction = client.transaction();
  for (const seed of planned) transaction.createIfNotExists(seed);
  for (const { id, revision, additions } of collectionPatches) {
    // A concurrent edit aborts the transaction; rerunning fetches fresh memberships.
    transaction.patch(id, (patch) =>
      patch
        .ifRevisionId(revision)
        .setIfMissing({ collections: [] })
        .append("collections", additions),
    );
  }
  await transaction.commit({ visibility: "sync" });
  console.log(
    `Seed complete: ${planned.length} missing documents ensured; ${collectionPatches.length} existing items linked to collections. Existing content preserved.`,
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
