import type { NextConfig } from "next";

// Stüdyo, fitmatik deposunun içinde ama ayrı bir uygulama; kökü burası.
const root = process.cwd();

const nextConfig: NextConfig = {
  // Coolify/Docker için küçük, kendi kendine yeten sunucu çıktısı
  output: "standalone",
  outputFileTracingRoot: root,
  turbopack: { root },
};

export default nextConfig;
