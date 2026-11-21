import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/toaster";
import { StoreProvider } from "@/store/provider";

import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: { default: "OpsWarden", template: "%s · OpsWarden" },
  description: "Human-supervised procurement investigations: evidence-backed findings and approved actions.",
};

export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover", // lets the mobile bottom nav respect safe-area insets
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the inline script below may set data-theme before React hydrates.
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script
          // Applies the saved theme before first paint so dark mode never flashes light.
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ow-theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <StoreProvider>
          {children}
          <Toaster />
        </StoreProvider>
      </body>
    </html>
  );
}
