import { ResolutionDetails } from "core/types";

/**
 * Enhances ResolutionDetails by ensuring readablePointModifiers array exists.
 * The backend is now responsible for populating the actual modifiers.
 *
 * @param details The original resolution details from the backend
 * @returns Enhanced resolution details, primarily ensuring readablePointModifiers is an array.
 */
export function enhanceResolutionDetails(
  details: ResolutionDetails
): ResolutionDetails {
  // The backend now provides the full list of readablePointModifiers.
  // This function primarily ensures the array exists for safe access in UI components
  // and can be a point for client-side logging or minor adjustments if ever needed.

  if (!details) {
    console.error(
      "[enhanceResolutionDetails] Received undefined details object. Returning a default structure."
    );
    return {
      points: 0,
      distribution: { favorable: 0, mixed: 0, unfavorable: 0 },
      readablePointModifiers: [],
    };
  }

  if (!details.readablePointModifiers) {
    // This case might happen if the backend somehow fails to send it,
    // or for older data structures if not fully migrated.
    console.warn(
      "[enhanceResolutionDetails] Backend did not provide readablePointModifiers. Defaulting to empty array."
    );
    return {
      ...details,
      readablePointModifiers: [],
    };
  }

  return details;
}
