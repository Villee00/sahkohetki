import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sahkohetki",
  description: "Sahkohetki",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
