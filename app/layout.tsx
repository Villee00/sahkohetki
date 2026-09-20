import type { Metadata } from "next";
import "./globals.css";
import { Geist, Roboto } from "next/font/google";
import { cn } from "@/lib/utils";

const robotoHeading = Roboto({subsets:['latin'],variable:'--font-heading'});

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
    <html lang="fi" className={cn("font-sans", geist.variable, robotoHeading.variable)}>
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
