import { useState, useEffect, useCallback } from "react";
import { templateApi } from "../templateApi";
import { ImageStoryState, TemplateImageManifest } from "core/types";
import { Logger } from "shared/logger";

interface TemplateImagesData {
  images: ImageStoryState[];
  manifest: TemplateImageManifest;
}

interface UseTemplateImagesResult {
  data: TemplateImagesData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Cache for template images data to avoid unnecessary API calls
const templateImagesCache = new Map<string, {
  data: TemplateImagesData;
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to fetch and cache template images data with manifest
 * Only fetches when templateId is provided and template is saved
 * 
 * @param templateId - Template ID (must exist, not for unsaved templates)
 * @param enabled - Whether to fetch data (defaults to true when templateId exists)
 */
export function useTemplateImages(
  templateId?: string,
  enabled: boolean = true
): UseTemplateImagesResult {
  const [data, setData] = useState<TemplateImagesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplateImages = useCallback(async () => {
    if (!templateId || !enabled) {
      return;
    }

    // Check cache first
    const cached = templateImagesCache.get(templateId);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      Logger.UI.log(`Using cached template images for ${templateId}`);
      setData(cached.data);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      Logger.UI.log(`Fetching template images for ${templateId}`);
      const response = await templateApi.getTemplateImages(templateId);
      
      // Cache the result
      templateImagesCache.set(templateId, {
        data: response,
        timestamp: now,
      });
      
      setData(response);
      Logger.UI.log(`Successfully fetched template images for ${templateId}:`, response);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch template images";
      Logger.UI.error(`Error fetching template images for ${templateId}:`, err);
      setError(errorMessage);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [templateId, enabled]);

  // Fetch data when templateId or enabled changes
  useEffect(() => {
    if (templateId && enabled) {
      fetchTemplateImages();
    } else {
      // Clear data when templateId is not provided or disabled
      setData(null);
      setError(null);
    }
  }, [templateId, enabled, fetchTemplateImages]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchTemplateImages,
  };
}

/**
 * Invalidates the cache for a specific template
 * Useful when images are generated or modified
 */
export function invalidateTemplateImagesCache(templateId: string): void {
  templateImagesCache.delete(templateId);
  Logger.UI.log(`Invalidated template images cache for ${templateId}`);
}

/**
 * Clears the entire template images cache
 */
export function clearTemplateImagesCache(): void {
  templateImagesCache.clear();
  Logger.UI.log("Cleared template images cache");
}