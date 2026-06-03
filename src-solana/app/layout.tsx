import type { Metadata } from "next";
import { Source_Code_Pro } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers";

const sourceCode = Source_Code_Pro({
  variable: "--font-source-code",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Siphon Protocol - Fully Encrypted DeFi Execution Layer",
  description: "Execute DeFi strategies on-demand in a fully encrypted manner. Run arbitrage, yield farming, liquidity mining, and grid trading privately. Your trades remain invisible to MEV bots and front-runners.",
  keywords: ["DeFi", "encrypted execution", "privacy", "strategy execution", "MEV protection", "blockchain", "cryptocurrency"],
  authors: [{ name: "Siphon Protocol" }],
  openGraph: {
    title: "Siphon Protocol - Fully Encrypted DeFi Execution Layer",
    description: "Execute DeFi strategies on-demand in a fully encrypted manner. Your trades remain invisible to MEV bots and front-runners.",
    type: "website",
    siteName: "Siphon Protocol",
  },
  twitter: {
    card: "summary_large_image",
    title: "Siphon Protocol - Fully Encrypted DeFi Execution Layer",
    description: "Execute DeFi strategies on-demand in a fully encrypted manner. Your trades remain invisible to MEV bots and front-runners.",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sourceCode.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
