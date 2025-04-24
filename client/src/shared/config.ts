/**
 * API base URL for the application
 * In development, this is the proxy set up in Vite
 * In production, this is the actual API endpoint
 */
export const API_BASE_URL = import.meta.env.DEV ? "/api" : "/api";

/**
 * Default image if a template image is not found
 */
export const DEFAULT_IMAGE = "/placeholder-image.png";
