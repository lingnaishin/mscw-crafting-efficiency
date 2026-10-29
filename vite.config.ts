import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
  server: {
    port: 5173,
    proxy: {
      "/api/mesowatch": {
        target: "https://meso.watch",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mesowatch/, ""),
        headers: {
          Referer: "https://meso.watch/",
        },
      },
    },
  },
});
