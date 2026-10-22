import {
  Archivo, Bricolage_Grotesque, DM_Sans, DM_Serif_Display, Fraunces, Instrument_Sans, Inter,
  Manrope, Outfit, Playfair_Display, Plus_Jakarta_Sans, Space_Grotesk, Syne,
} from "next/font/google";

export const uiFont = Instrument_Sans({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-ui" });
export const displayFont = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-display-face" });

// Marka fontları yalnız seçilince indirilir; Türkçe karakterler için latin-ext şart.
// next/font seçenekleri düz nesne olarak yazılmak zorunda.
const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const manrope = Manrope({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const archivo = Archivo({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const outfit = Outfit({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const syne = Syne({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], display: "swap", preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin", "latin-ext"], display: "swap", preload: false, weight: "400" });

export type FontOption = { name: string; family: string; kind: "Sans" | "Serif" | "Display"; weight: number };

/** Seçilebilir marka fontları. `name` Jett brand.json'a yazılır. */
export const FONT_OPTIONS: FontOption[] = [
  { name: "Inter", family: inter.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "Manrope", family: manrope.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "Space Grotesk", family: spaceGrotesk.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "Archivo", family: archivo.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "DM Sans", family: dmSans.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "Outfit", family: outfit.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "Plus Jakarta Sans", family: jakarta.style.fontFamily, kind: "Sans", weight: 700 },
  { name: "Bricolage Grotesque", family: displayFont.style.fontFamily, kind: "Display", weight: 700 },
  { name: "Syne", family: syne.style.fontFamily, kind: "Display", weight: 700 },
  { name: "Playfair Display", family: playfair.style.fontFamily, kind: "Serif", weight: 700 },
  { name: "Fraunces", family: fraunces.style.fontFamily, kind: "Serif", weight: 700 },
  { name: "DM Serif Display", family: dmSerif.style.fontFamily, kind: "Serif", weight: 400 },
];

export function fontByName(name: string): FontOption {
  return FONT_OPTIONS.find((f) => f.name === name) ?? FONT_OPTIONS[0];
}
