import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://sahkohetki.fi";

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Sähköhetki",
  alternateName: "Sähkön hinta",
  url: `${siteUrl}/`,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  title: "Sähkön hinta tänään – pörssisähkö 15 min | Sähköhetki",
  description:
    "Sähkön hinta tänään ja huomenna 15 minuutin tarkkuudella. Katso Suomen pörssisähkön halvin, kallein ja keskihinta.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fi">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
