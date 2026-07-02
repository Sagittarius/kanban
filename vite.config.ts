import legacy from "@vitejs/plugin-legacy";
import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin";

export default defineConfig(() => ({
  build: {
    cssTarget: ["chrome87", "edge87", "firefox78", "safari14"],
  },
  plugins: [
    legacy({
      modernTargets: [
        "Chrome >= 87",
        "Edge >= 87",
        "Firefox >= 78",
        "Safari >= 14",
      ],
      modernPolyfills: true,
      renderLegacyChunks: false,
    }),
    vinext(),
    sites(),
  ],
}));
