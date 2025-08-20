import { TemplateMetadata } from "core/types";
import { templateApi } from "./templateApi";
import { Logger } from "shared/logger";
import { TEMPLATE_CACHE_DURATION_MS } from "core/config";

// Simple in-memory cache for templates
class TemplateCache {
  private cache = new Map<string, { data: TemplateMetadata[]; timestamp: number }>();
  private readonly CACHE_DURATION = TEMPLATE_CACHE_DURATION_MS;

  private getCacheKey(forWelcomeScreen: boolean = false): string {
    return forWelcomeScreen ? "welcome-screen" : "all-published";
  }

  async getPublishedTemplates(forWelcomeScreen: boolean = false): Promise<TemplateMetadata[]> {
    const cacheKey = this.getCacheKey(forWelcomeScreen);
    const cached = this.cache.get(cacheKey);
    
    // Return cached data if it's still fresh
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      Logger.App.log(`Using cached templates for ${cacheKey}`);
      return cached.data;
    }

    // Fetch fresh data
    try {
      Logger.App.log(`Fetching fresh templates for ${cacheKey}`);
      const templates = await templateApi.getPublishedTemplateMetadata(forWelcomeScreen);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: templates,
        timestamp: Date.now()
      });

      return templates;
    } catch (error) {
      Logger.App.error(`Failed to fetch templates for ${cacheKey}`, error);
      
      // Return stale data if available, otherwise throw
      if (cached) {
        Logger.App.log(`Using stale cached templates for ${cacheKey}`);
        return cached.data;
      }
      
      throw error;
    }
  }

  // Clear cache (useful for admin operations)
  clearCache(): void {
    this.cache.clear();
    Logger.App.log("Template cache cleared");
  }

  // Clear specific cache entry
  clearCacheEntry(forWelcomeScreen: boolean = false): void {
    const cacheKey = this.getCacheKey(forWelcomeScreen);
    this.cache.delete(cacheKey);
    Logger.App.log(`Template cache cleared for ${cacheKey}`);
  }
}

export const templateCache = new TemplateCache();