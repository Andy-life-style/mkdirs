import type { SiteConfig } from "@/types";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL;

export const siteConfig: SiteConfig = {
  name: "AIToolFame",
  tagline: "Discover the best AI Tools in 2026",
  description:
    "AIToolFame.com is a curated directory of AI tools, helping users discover the best AI tools while giving founders a platform to showcase their AI tools.",
  keywords: [
    "Directory",
    "Template",
    "Boilerplate",
    "Next.js",
    "Auth.js",
    "Tailwindcss",
    "Shadcn/ui",
    "Resend",
    "Sanity",
    "Stripe",
    "Vercel",
  ],
  author: "AIToolFame",
  url: SITE_URL,
  logo: "/replica-assets/fc0857be459c35f9d7184114.png",
  // set the logoDark if you have put the logo-dark.png in the public folder
  // logoDark: "/logo-dark.png",
  // please increase the version number when you update the image
  image: `${SITE_URL}/og.png?v=1`,
  mail: "support@mkdirs.com",
  utm: {
    source: "mkdirs.com",
    medium: "referral",
    campaign: "navigation",
  },
  links: {
    // leave it blank if you don't want to show the link (don't delete)
    twitter: "https://x.com/MkdirsHQ",
    github: "https://github.com/MkdirsHQ",
    youtube: "https://www.youtube.com/@MkdirsHQ",
  },
};
