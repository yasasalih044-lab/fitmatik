import { configDefaults, defineConfig } from "vitest/config";

// Mavros Studio (studio/) kendi testlerini kendi klasöründe çalıştırır.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "studio/**"] },
});
