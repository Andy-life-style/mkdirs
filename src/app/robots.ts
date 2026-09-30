import { siteConfig } from "@/config/site";
import type { MetadataRoute } from "next";

/**
 * https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
 */
export default function robots(): MetadataRoute.Robots {
  const replicaPreview = process.env.VERCEL_ENV !== "production";
  return {
    rules: {
      userAgent: "*",
      ...(replicaPreview ? { disallow: "/" } : { allow: "/" }),
    },
    ...(siteConfig.url ? { sitemap: `${siteConfig.url}/sitemap.xml` } : {}),
  };
}
