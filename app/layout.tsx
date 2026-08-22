import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sahkohetki – sähkön hinta arjessa",
  description: "Katso pörssisähkön hinta ja yhdeksän arjen käytön kustannusarvio.",
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
