import type { MetadataRoute } from "next";

const siteUrl = "https://sahkohetki.fi";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
    },
    {
      url: `${siteUrl}/historia`,
    },
  ];
}
