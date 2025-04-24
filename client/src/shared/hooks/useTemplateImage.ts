import { useState, useEffect, useCallback } from "react";
import { getTemplateImageUrl } from "../utils/imageUtils";

interface UseTemplateImageOptions {
  templateId: string;
  imageName: string;
  fallbackImage?: string;
  retryCount?: number;
  retryDelay?: number;
}

interface UseTemplateImageResult {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Custom hook for working with template images stored in the data directory
 * @param options - Configuration options for the hook
 * @returns Object containing the image URL, loading state, any errors, and a retry function
 */
export function useTemplateImage({
  templateId,
  imageName,
  fallbackImage,
  retryCount = 2,
  retryDelay = 1000,
}: UseTemplateImageOptions): UseTemplateImageResult {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [retryKey, setRetryKey] = useState(0);

  // Function to manually trigger a retry
  const retry = useCallback(() => {
    setRetryKey((prev) => prev + 1);
    setIsLoading(true);
    setError(null);
    setAttempts(0);
  }, []);

  useEffect(() => {
    if (!templateId || !imageName) {
      setIsLoading(false);
      setError("Template ID and image name are required");
      return;
    }

    // Reset state when inputs change
    setImageUrl(null);
    setIsLoading(true);
    setError(null);
    setAttempts(0);

    // Get the direct API URL to the image
    const url = getTemplateImageUrl(templateId, imageName);
    console.log(
      `[Image] Loading image from API: ${url}, attempt ${attempts + 1}`
    );

    // Create an image element to check if the image exists
    const img = new Image();

    img.onload = () => {
      console.log(`[Image] Successfully loaded ${url}`);
      setImageUrl(url);
      setIsLoading(false);
      setError(null);
    };

    img.onerror = () => {
      console.error(`[Image] Failed to load ${url}, attempt ${attempts + 1}`);

      // Try again if we haven't exceeded retry count
      if (attempts < retryCount) {
        console.log(`[Image] Retrying in ${retryDelay}ms...`);
        // Wait before retrying
        const timer = setTimeout(() => {
          setAttempts((prev) => prev + 1);
        }, retryDelay);

        return () => clearTimeout(timer);
      }

      // If fallback image is provided, use it
      if (fallbackImage) {
        console.log(`[Image] Using fallback image: ${fallbackImage}`);
        setImageUrl(fallbackImage);
        setIsLoading(false);
        setError(null);
      } else {
        setImageUrl(null);
        setIsLoading(false);
        setError(`Failed to load image: ${imageName}`);
      }
    };

    // Start loading the image
    img.src = url;

    // Add a timeout as a safety net
    const timeoutId = setTimeout(() => {
      if (isLoading) {
        console.warn(`[Image] Loading timeout for ${url}`);
        img.src = ""; // Cancel the current request

        if (attempts < retryCount) {
          setAttempts((prev) => prev + 1);
        } else if (fallbackImage) {
          setImageUrl(fallbackImage);
          setIsLoading(false);
          setError(null);
        } else {
          setImageUrl(null);
          setIsLoading(false);
          setError(`Timeout loading image: ${imageName}`);
        }
      }
    }, 10000); // 10 second timeout

    // Clean up
    return () => {
      clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };
  }, [
    templateId,
    imageName,
    fallbackImage,
    attempts,
    retryCount,
    retryDelay,
    retryKey,
    isLoading,
  ]);

  return { imageUrl, isLoading, error, retry };
}
