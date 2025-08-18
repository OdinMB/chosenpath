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
  ImageGenerationErrorResponse,
} from "core/types/api";
import { apiClient, LONG_OPERATION_TIMEOUT } from "shared/apiClient";
import { invalidateTemplateImagesCache } from "./useTemplateImages";
import { notificationService } from "shared/notifications/notificationService";
import { ImageGenerationErrorNotification } from "shared/notifications/notifications";

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

  // Helper function to parse API errors and show notifications
  const handleApiError = (err: unknown): void => {
    // Check if this is a structured image generation error response
    if (typeof err === 'object' && err !== null && 'response' in err) {
      const apiError = err as { response?: { data?: ImageGenerationErrorResponse } };
      
      if (apiError.response?.data?.imageGenerationError) {
        const errorData = apiError.response.data;
        const errorInfo = errorData.imageGenerationError;
        
        // Create an image generation error notification
        const notification: Omit<ImageGenerationErrorNotification, "id"> = {
          type: "error",
          title: "Image Generation Failed",
          message: errorData.errorMessage,
          errorCode: errorInfo?.errorCode,
          guidance: errorInfo?.guidance,
          retryable: errorInfo?.retryable,
          autoClose: false, // Make it sticky - user must manually dismiss
        };
        
        notificationService.addNotification(notification);
        return; // IMPORTANT: Return here to prevent fallback
      }
    }

    // Fallback to generic error notification
    const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
    const fallbackNotification = {
      type: "error" as const,
      title: "Image Generation Failed",
      message: errorMessage,
      autoClose: false, // Make it sticky - user must manually dismiss
    };
    
    notificationService.addNotification(fallbackNotification);
  };

  const generateImageForElement = async (
    params: GenerateElementImageParams
  ): Promise<GenerateImageResponse | null> => {
    const { templateId, element, imageInstructions, size, quality } = params;


    setIsGenerating(true);

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

      // Use the API endpoint
      const apiUrl = `/image-generation/template/element`;

      // Make the API request using apiClient
      const response = await apiClient.post<GenerateImageResponse>(
        apiUrl,
        payload,
        {
          timeout: LONG_OPERATION_TIMEOUT,
        }
      );


      // Invalidate template images cache so the UI updates
      invalidateTemplateImagesCache(templateId);

      // Handle successful response - apiClient already extracts the data property
      return response;
    } catch (err) {
      handleApiError(err);
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


    setIsGenerating(true);

    try {
      // Prepare the request payload
      const payload: GenerateCoverImageRequest = {
        templateId,
        coverPrompt,
        imageInstructions,
        size,
        quality,
      };

      // Use the API endpoint
      const apiUrl = `/image-generation/template/cover`;

      // Make the API request using apiClient
      const response = await apiClient.post<GenerateImageResponse>(
        apiUrl,
        payload,
        {
          timeout: LONG_OPERATION_TIMEOUT,
        }
      );


      // Invalidate template images cache so the UI updates
      invalidateTemplateImagesCache(templateId);

      // Handle successful response - apiClient already extracts the data property
      return response;
    } catch (err) {
      handleApiError(err);
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


    setIsGenerating(true);

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

      // Use the API endpoint
      const apiUrl = `/image-generation/template/player`;

      // Make the API request using apiClient
      const response = await apiClient.post<GenerateImageResponse>(
        apiUrl,
        payload,
        {
          timeout: LONG_OPERATION_TIMEOUT,
        }
      );


      // Invalidate template images cache so the UI updates
      invalidateTemplateImagesCache(templateId);

      // Handle successful response - apiClient already extracts the data property
      return response;
    } catch (err) {
      handleApiError(err);
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
  };
}
