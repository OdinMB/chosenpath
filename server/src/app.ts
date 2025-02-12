import express from "express";
import cors from "cors";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  
  // Simple health check endpoint
  app.get("/health", (_, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
