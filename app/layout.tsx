import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://sahkohetki.fi";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  title: "Sähköhetki – pörssisähkön hinta helpoksi",
  description:
    "Tarkista Suomen pörssisähkön hinta tänään tunti- ja 15 minuutin tarkkuudella sekä arvioi kodinkoneiden sähkönkulutuksen kustannus.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fi">
      <body>{children}</body>
    </html>
  );
}
