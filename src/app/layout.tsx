import type { Metadata } from "next";
import { Anton, Inter, Space_Grotesk } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

// Signal design system: Inter for body, Space Grotesk for geometric display headings.
// Self-hosted by next/font: no external request, no layout shift.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk", display: "swap" });
const anton = Anton({ subsets: ["latin"], weight: "400", variable: "--font-anton", display: "swap" });

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
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${anton.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
