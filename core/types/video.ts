import { z } from "zod";

export const videoSourceSchema = z.enum(["template", "story"]);
export type VideoSource = z.infer<typeof videoSourceSchema>;

// Status of a video generation job at the video provider
export type VideoStatus = "queued" | "in_progress" | "completed" | "failed";

// Videos displayed in the UI
export type VideoUI = {
  id: string;
  source: VideoSource;
  sourceId: string; // templateId or storyId
  subDirectory?: string;
  status?: VideoStatus;
  description?: string;
  progress?: number;
  error?: string;
};

export type VideoStoryState = {
  id: string;
  source: VideoSource;
  videoJobId?: string; // Job ID at the video provider
  description?: string;
  status?: VideoStatus;
  progress?: number;
};

export type VideoLibrary = VideoStoryState[];

export const videoRequestSchema = z.object({
  caption: z
    .string()
    .describe(
      "Caption for the video. Up to six words. Focus on the action/scene."
    ),
  id: z
    .string()
    .describe(
      "The ID of the video. Don't override existing ids of videos that are already in the video library."
    ),
  referenceImageIds: z
    .array(z.string())
    .describe(
      "The IDs of the images to use as references for the video (as first frame). Leave empty if no reference image is needed. Only use existing images from the image library. Remember that each image reference costs money."
    ),
  prompt: z
    .string()
    .describe(
      "A prompt to generate the video. Describe the action, camera movement, and scene. Include shot type (wide, close-up, etc.), subject, action, setting, and lighting."
    ),
});

export type VideoRequest = z.infer<typeof videoRequestSchema> & {
  subDir?: string;
};

export type VideoGenerationErrorInfo = {
  errorCode:
    | "COPYRIGHT"
    | "CONTENT_POLICY"
    | "RATE_LIMIT"
    | "TECHNICAL"
    | "UNKNOWN";
  userFriendlyMessage: string;
  technicalMessage: string;
  guidance: string;
  retryable: boolean;
};
