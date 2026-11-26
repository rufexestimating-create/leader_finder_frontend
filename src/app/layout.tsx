import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Unbounded } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: `${BRAND_NAME} · ${PRODUCT_NAME}`,
  description: "Find and qualify leads with AI-powered enrichment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set by the inline script before React hydrates, so the attribute legitimately differs
    <html lang="en" className={`${instrument.variable} ${unbounded.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
