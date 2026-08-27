import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fit-matik",
    short_name: "Fit-matik",
    description: "Kalori günlüğü — yaz ya da paketin fotoğrafını çek.",
    start_url: "/upload",
    display: "standalone",
    background_color: "#0d181b",
    theme_color: "#0d181b",
    orientation: "portrait",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
