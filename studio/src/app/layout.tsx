import type { Metadata, Viewport } from "next";
import "./globals.css";
import { displayFont, uiFont } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Mavros Studio",
  description: "Markanı anlat, rengini seç — Jett ile 12 postluk Instagram kampanyası ve banner'ları üret.",
  applicationName: "Mavros Studio",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#08080b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={`${uiFont.variable} ${displayFont.variable}`}>{children}</body>
    </html>
  );
}
