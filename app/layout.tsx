import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InveXt — listed markets and private vehicles, one account",
  description:
    "Live quotes across forty listed securities, plus single-asset vehicles in twelve private companies priced to dated, sourced marks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#0B0B0D" />
      </head>
      <body>{children}</body>
    </html>
  );
}
