import { Router } from "express";
import { StoryController } from "../controllers/StoryController.js";

export const router = Router();
const storyController = new StoryController();

router.get("/health", (_, res) => {
  res.json({ status: "ok" });
});

// Story routes
router.post(
  "/story/initialize",
  storyController.initializeStory.bind(storyController)
);
router.get("/story/:sessionId", storyController.getState.bind(storyController));
router.post(
  "/story/:sessionId/beat",
  storyController.generateNextBeat.bind(storyController)
);
router.post(
  "/story/:sessionId/choice",
  storyController.handlePlayerChoice.bind(storyController)
);
