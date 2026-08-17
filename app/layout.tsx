import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retro Tactical Notes",
  description: "A private, local-first tactical notebook with a rugged retro arcade interface.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
