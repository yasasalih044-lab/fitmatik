import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { DEFAULT_THEME, THEME_BOOT_SCRIPT } from "@/lib/theme";
import IntroSplash from "@/components/IntroSplash";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fit-matik",
  description: "Ne yediğini yaz ya da paketin fotoğrafını çek — kalorisini araştırıp günlüğüne yazsın.",
  applicationName: "Fit-matik",
  appleWebApp: { capable: true, title: "Fit-matik", statusBarStyle: "default" },
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#070a08",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className={`${instrument.variable} ${jetbrains.variable}`}>
        <IntroSplash />
        {children}
      </body>
    </html>
  );
}
