import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    // Exclude @xyflow/react from dep optimizer so its CSS is served directly
    // (the optimizer can't handle .css files inside packages)
    optimizeDeps: {
      exclude: ["@xyflow/react"],
    },
    proxy: {
      "/api": {
        // Inside Docker: api-gateway container. Local dev: localhost:3000.
        target: process.env.VITE_API_URL ?? "http://localhost:3000",
        changeOrigin: true,
      },
      "/workflow": {
        // Direct SSE connection to workflow-service for live updates.
        // Rewrite removes /workflow prefix — workflow-service serves at /runs/:id/events
        target: process.env.VITE_WORKFLOW_URL ?? "http://localhost:3006",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/workflow/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
