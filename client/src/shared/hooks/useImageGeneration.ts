import { useState } from "react";
import {
  StoryElement,
  ImageQuality,
  ImageSize,
  ImageInstructions,
  CharacterIdentity,
} from "core/types";
import {
  GenerateElementImageRequest,
  GenerateCoverImageRequest,
  GeneratePlayerImageRequest,
  GenerateImageResponse,
} from "core/types/api";
import { apiClient, LONG_OPERATION_TIMEOUT } from "shared/apiClient";

// Using longer timeout for image generation operations which can take significantly longer than normal API calls

interface UseImageGenerationResult {
  generateImageForElement: (
    params: GenerateElementImageParams
  ) => Promise<GenerateImageResponse | null>;
  generateCoverImage: (
    params: GenerateCoverImageParams
  ) => Promise<GenerateImageResponse | null>;
  generateImageForPlayer: (
    params: GeneratePlayerImageParams
  ) => Promise<GenerateImageResponse | null>;
  isGenerating: boolean;
  error: string | null;
}

interface GenerateElementImageParams {
  templateId: string;
  element: StoryElement;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}

interface GenerateCoverImageParams {
  templateId: string;
  coverPrompt: string;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}

interface GeneratePlayerImageParams {
  templateId: string;
  playerSlot: string;
  identity: CharacterIdentity;
  identityIndex: number;
  imageInstructions?: ImageInstructions;
  size?: ImageSize;
  quality?: ImageQuality;
}

export function useImageGeneration(): UseImageGenerationResult {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateImageForElement = async (
    params: GenerateElementImageParams
  ): Promise<GenerateImageResponse | null> => {
    const { templateId, element, imageInstructions, size, quality } = params;

    console.log("useImageGeneration: Starting image generation process", {
      elementId: element.id,
      templateId,
    });

    setIsGenerating(true);
    setError(null);

    try {
      // Prepare the request payload
      const payload: GenerateElementImageRequest = {
        templateId,
        elementId: element.id,
        appearance: element.name + "\n" + element.appearance,
        imageInstructions,
        size,
        quality,
      };

      console.log("Sending image generation request with payload:", payload);

      // Use the API endpoint
      const apiUrl = `/image-generation/template/element`;
      console.log("Request URL:", apiUrl);

      // Make the API request using apiClient
      const response = await apiClient.post(apiUrl, payload, {
        timeout: LONG_OPERATION_TIMEOUT,
      });

      console.log("Image generation response:", response.data);
      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);

      // Handle successful response - apiClient already extracts the data property
      return response.data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";

      setError(errorMessage);
      console.error("Image generation failed:", errorMessage);
      console.error("Error details:", err);

      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCoverImage = async (
    params: GenerateCoverImageParams
  ): Promise<GenerateImageResponse | null> => {
    const { templateId, coverPrompt, imageInstructions, size, quality } =
      params;

    console.log("useImageGeneration: Starting cover image generation", {
      templateId,
      coverPrompt,
    });

    setIsGenerating(true);
    setError(null);

    try {
      // Prepare the request payload
      const payload: GenerateCoverImageRequest = {
        templateId,
        coverPrompt,
        imageInstructions,
        size,
        quality,
      };

      console.log(
        "Sending cover image generation request with payload:",
        payload
      );

      // Use the API endpoint
      const apiUrl = `/image-generation/template/cover`;
      console.log("Request URL:", apiUrl);

      // Make the API request using apiClient
      const response = await apiClient.post(apiUrl, payload, {
        timeout: LONG_OPERATION_TIMEOUT,
      });

      console.log("Cover image generation response:", response.data);

      // Handle successful response - apiClient already extracts the data property
      return response.data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";

      setError(errorMessage);
      console.error("Cover image generation failed:", errorMessage);
      console.error("Error details:", err);

      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const generateImageForPlayer = async (
    params: GeneratePlayerImageParams
  ): Promise<GenerateImageResponse | null> => {
    const {
      templateId,
      playerSlot,
      identity,
      identityIndex,
      imageInstructions,
      size,
      quality,
    } = params;

    console.log("useImageGeneration: Starting player image generation", {
      templateId,
      playerSlot,
      identity,
      identityIndex,
    });

    setIsGenerating(true);
    setError(null);

    try {
      // Prepare the request payload
      const payload: GeneratePlayerImageRequest = {
        templateId,
        playerSlot,
        identityIndex,
        // Include character name in appearance for better results
        appearance: identity.name
          ? `${identity.name}${
              identity.pronouns.personal
                ? ` (${identity.pronouns.personal}/${identity.pronouns.object})`
                : ""
            }: ${identity.appearance}`
          : identity.appearance,
        imageInstructions,
        size,
        quality,
      };

      console.log(
        "Sending player image generation request with payload:",
        payload
      );

      // Use the API endpoint
      const apiUrl = `/image-generation/template/player`;
      console.log("Request URL:", apiUrl);

      // Make the API request using apiClient
      const response = await apiClient.post(apiUrl, payload, {
        timeout: LONG_OPERATION_TIMEOUT,
      });

      console.log("Player image generation response:", response.data);

      // Handle successful response - apiClient already extracts the data property
      return response.data;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";

      setError(errorMessage);
      console.error("Player image generation failed:", errorMessage);
      console.error("Error details:", err);

      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateImageForElement,
    generateCoverImage,
    generateImageForPlayer,
    isGenerating,
    error,
  };
}
