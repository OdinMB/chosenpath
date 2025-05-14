import { useState, useCallback } from "react";
import { useAuth } from "shared/useAuth";
import { UserStoryCodeAssociation } from "core/types/api";
import { Logger } from "shared/logger";
import { useRevalidator } from "react-router-dom";
import { usersApi } from "../usersApi"; // Ensure this path is correct relative to this file's new location if moved

export function useUserStoriesActions() {
  const { isAuthenticated, user } = useAuth();
  const [isAssociating, setIsAssociating] = useState(false);
  const [associationError, setAssociationError] = useState<string | null>(null);
  const revalidator = useRevalidator();

  const associateStoryCode = useCallback(
    async (
      storyId: string,
      playerSlot: string,
      code: string
    ): Promise<UserStoryCodeAssociation | null> => {
      if (!isAuthenticated) {
        Logger.App.warn("User not authenticated. Cannot associate story code.");
        setAssociationError("You must be logged in to link a story code.");
        return null;
      }

      setIsAssociating(true);
      setAssociationError(null);
      try {
        Logger.App.log(
          `Attempting to associate code: ${code} for story: ${storyId} by user: ${user?.id}`
        );
        const associatedCode = await usersApi.associateStoryCode({
          storyId,
          playerSlot,
          code,
        });
        Logger.App.log("Successfully associated story code:", associatedCode);
        revalidator.revalidate();
        return associatedCode;
      } catch (err) {
        Logger.App.error("Failed to associate story code in hook", err);
        const message =
          err instanceof Error
            ? err.message
            : "Failed to save your story code. Please try again later.";
        setAssociationError(message);
        return null;
      } finally {
        setIsAssociating(false);
      }
    },
    [isAuthenticated, user, revalidator]
  );

  return {
    associateStoryCode,
    isAssociating,
    associationError,
    clearAssociationError: () => setAssociationError(null),
  };
}
