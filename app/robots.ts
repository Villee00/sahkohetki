import type { MetadataRoute } from "next";

const siteUrl = "https://sahkohetki.fi";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
