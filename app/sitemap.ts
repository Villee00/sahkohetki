import type { MetadataRoute } from "next";

const siteUrl = "https://sahkohetki.fi";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/ennuste`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];
}
