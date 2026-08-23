import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sähköhetki – sähkön hinta arjessa",
  description:
    "Katso pörssisähkön hinta ja yhdeksän arjen sähkönkäytön kustannusarviota.",
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
