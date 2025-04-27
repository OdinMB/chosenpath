import { useState } from "react";
import axios from "axios";
import {
  StoryElement,
  ImageQuality,
  ImageSize,
  ImageInstructions,
} from "core/types";
import {
  GenerateElementImageRequest,
  GenerateImageResponse,
  ResponseStatus,
  SuccessResponse,
} from "core/types/api";
import { API_CONFIG } from "core/config";

interface UseImageGenerationResult {
  generateImageForElement: (
    params: GenerateElementImageParams
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
        appearance: element.appearance,
        imageInstructions,
        size,
        quality,
      };

      console.log("Sending image generation request with payload:", payload);

      // Use the API_CONFIG.DEFAULT_API_URL for the endpoint
      const apiUrl = `${API_CONFIG.DEFAULT_API_URL}/image-generation/template/element`;
      console.log("Request URL:", apiUrl);

      // Make the API request with explicit options to prevent any event propagation or redirects
      const response = await axios.post<SuccessResponse<GenerateImageResponse>>(
        apiUrl,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        }
      );

      console.log("Image generation response:", response.data);
      console.log("Response status:", response.status);
      console.log("Response headers:", response.headers);

      // Handle successful response
      if (response.data.status === ResponseStatus.SUCCESS) {
        console.log("Image generated successfully for", element.name);
        return response.data.data;
      }

      throw new Error("Failed to generate image");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";

      setError(errorMessage);
      console.error("Image generation failed:", errorMessage);

      if (axios.isAxiosError(err)) {
        console.error("Axios error details:", {
          status: err.response?.status,
          statusText: err.response?.statusText,
          data: err.response?.data,
          headers: err.response?.headers,
          config: {
            url: err.config?.url,
            method: err.config?.method,
            data: err.config?.data,
          },
        });
      }

      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    generateImageForElement,
    isGenerating,
    error,
  };
}
