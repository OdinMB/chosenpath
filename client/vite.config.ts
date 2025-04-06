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
      shared: path.resolve(__dirname, "../shared"),
    },
    extensions: [".ts", ".js", ".jsx", ".tsx", ".json"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (pathStr: string) => pathStr.replace(/^\/api/, ""),
      },
    },
    historyApiFallback: true,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          router: ["react-router-dom"],
        },
      },
    },
  },
};

// Use a type assertion to handle the version mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default defineConfig(config as any);
