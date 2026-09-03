import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const shoulders = Big_Shoulders({
  variable: "--font-shoulders",
  subsets: ["latin", "latin-ext"],
  weight: ["600", "700", "800"],
  display: "swap",
});
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
  themeColor: "#f2eee5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${shoulders.variable} ${instrument.variable} ${jetbrains.variable}`}>{children}</body>
    </html>
  );
}
