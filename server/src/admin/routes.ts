import express from "express";
import { config } from "../config/env.js";

// Simple authentication middleware
const authenticate = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.split(" ")[1];

  // Simple password check - should be replaced with a more secure method in production
  if (token !== config.adminPassword) {
    return res.status(403).json({ error: "Invalid credentials" });
  }

  next();
};

const router = express.Router();

// Auth check route
router.get("/auth", authenticate, (req, res) => {
  res.json({ authenticated: true });
});

// Protected admin routes
router.get("/stories", authenticate, (req, res) => {
  // This will be implemented later
  res.json({ message: "Stories management will be implemented here" });
});

export const adminRouter = router;
