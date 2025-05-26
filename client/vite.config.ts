import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Create a configuration object with the correct settings
const config = {
  plugins: [react()],
  css: {
    postcss: "./postcss.config.cjs",
  },
  resolve: {
    alias: {
      client: path.resolve(__dirname, "./src"),
      core: path.resolve(__dirname, "../core"),
      admin: path.resolve(__dirname, "./src/admin"),
      shared: path.resolve(__dirname, "./src/shared"),
      components: path.resolve(__dirname, "./src/shared/components"),
      game: path.resolve(__dirname, "./src/game"),
      page: path.resolve(__dirname, "./src/page"),
      users: path.resolve(__dirname, "./src/users"),
      resources: path.resolve(__dirname, "./src/resources"),
    },
    extensions: [".ts", ".js", ".jsx", ".tsx", ".json"],
  },
  server: {
    proxy: {
      // Only proxy API requests through /api
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (pathStr: string) => pathStr.replace(/^\/api/, ""),
      },
    },
    historyApiFallback: {
      disableDotRule: true,
      rewrites: [
        // Only exclude API paths from the SPA fallback
        { from: /^(?!\/api\/).*/, to: "/index.html" },
      ],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["react-router-dom"],
        },
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    host: true,
    headers: {
      "Cache-Control": "no-store",
    },
  },
};

// Use a type assertion to handle the version mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default defineConfig(config as any);
