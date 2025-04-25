import { Beat } from "./beat.js";

// Image generation constants
export const IMAGE_SIZES = {
  AUTO: "auto",
  SQUARE: "1024x1024",
  LANDSCAPE: "1536x1024",
  PORTRAIT: "1024x1536",
} as const;

export const IMAGE_QUALITIES = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export type ImageSize = (typeof IMAGE_SIZES)[keyof typeof IMAGE_SIZES];
export type ImageQuality =
  (typeof IMAGE_QUALITIES)[keyof typeof IMAGE_QUALITIES];

// Types used by the application
export type ImageStatus = "ready" | "generating" | "failed";

export type Image = {
  id: string;
  description: string;
  status: ImageStatus;
  url?: string;
};

export type ImageLibrary = Image[];

export type BeatsNeedingImages = Record<string, Beat>;
