import { useState, useCallback, useEffect } from "react";
import { Modal } from "shared/components/ui/Modal";
import { UserStoriesList } from "./UserStoriesList";
import { useNavigate } from "react-router-dom";
import { useUserStories } from "../hooks";
import { useAuth } from "shared/useAuth";
import { StoryCard } from "shared/components";
import { PrimaryButton } from "shared/components/ui";
import { StoredCodeSet } from "shared/SessionContext";
import { getSortedCodeSets } from "shared/utils/codeSetUtils";
import { StoryMetadata } from "core/types/api";
import { Logger } from "shared/logger";

interface UserStoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserStoriesModal({ isOpen, onClose }: UserStoriesModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { storyCodes, associateStoryCode, loadUserStoryData } =
    useUserStories();
  const [localCodeSets, setLocalCodeSets] = useState<StoredCodeSet[]>([]);
  const [associatingCode, setAssociatingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      Logger.App.log("UserStoriesModal opened - loading data");
      refreshLocalCodeSets();

      // Refresh user stories when the modal opens
      if (isAuthenticated) {
        loadUserStoryData();
      }
    }
  }, [isOpen, isAuthenticated, loadUserStoryData]);

  // Filter local codes that aren't already in the user's database
  useEffect(() => {
    if (!isAuthenticated || !storyCodes.length) {
      setLocalCodeSets(getSortedCodeSets());
      return;
    }

    // Get all the codes the user already has in the database
    const userCodeStrings = storyCodes.map((sc) => sc.code);

    // Filter local code sets to those that aren't in the user's database
    const filteredSets = getSortedCodeSets().filter((set) => {
      // Check if any code in the set isn't in the user's database
      return Object.values(set.codes).some(
        (code) => !userCodeStrings.includes(code)
      );
    });

    Logger.App.log(
      `Filtered local code sets: ${filteredSets.length} (total: ${
        getSortedCodeSets().length
      })`
    );
    setLocalCodeSets(filteredSets);
  }, [storyCodes, isAuthenticated]);

  const refreshLocalCodeSets = () => {
    const sets = getSortedCodeSets();
    Logger.App.log(`Refreshed local code sets: ${sets.length}`);
    setLocalCodeSets(sets);
  };

  const handleCodeSubmit = useCallback(
    (code: string) => {
      onClose();
      navigate(`/game/${code}`);
    },
    [navigate, onClose]
  );

  const handleAssociateCode = useCallback(
    async (codeSet: StoredCodeSet) => {
      if (!isAuthenticated) return;

      // Get the first code from the set
      const [playerSlot, code] = Object.entries(codeSet.codes)[0] || [];
      if (!playerSlot || !code) return;

      try {
        setAssociatingCode(code);
        setError(null);

        // Extract storyId from the code if possible (it might be encoded in the code)
        // For this example, we'll just use a portion of the code as a simple storyId
        const storyId = code.substring(0, 8);

        await associateStoryCode(storyId, playerSlot, code);

        // Refresh the local code sets list
        refreshLocalCodeSets();
      } catch (error) {
        setError("Failed to associate code. Please try again later.");
        console.error("Error associating code:", error);
      } finally {
        setAssociatingCode(null);
      }
    },
    [isAuthenticated, associateStoryCode]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Your Stories" width="md">
      <div className="w-full space-y-6">
        {/* Error message */}
        {error && (
          <div className="p-3 border border-red-200 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Local codes not associated with user yet */}
        {isAuthenticated && localCodeSets.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-medium text-primary-700">Local Stories</h3>
            <p className="text-sm text-gray-500 mb-2">
              Not yet linked to your account.
            </p>

            {localCodeSets.map((codeSet) => {
              // Create a minimal story object from the code set
              const storyId =
                Object.values(codeSet.codes)[0]?.substring(0, 8) || "unknown";
              const mockStory: StoryMetadata = {
                id: storyId,
                title: codeSet.title || `Story ${storyId}`,
                createdAt: codeSet.timestamp,
                updatedAt: codeSet.timestamp,
                maxTurns: 10,
                generateImages: true,
                creatorId: "",
              };

              return (
                <StoryCard
                  key={codeSet.timestamp}
                  story={mockStory}
                  onPlay={() =>
                    handleCodeSubmit(Object.values(codeSet.codes)[0])
                  }
                  className="bg-gray-50"
                >
                  <div className="mt-2 flex justify-end">
                    <PrimaryButton
                      size="sm"
                      variant="outline"
                      onClick={() => handleAssociateCode(codeSet)}
                      isLoading={
                        associatingCode === Object.values(codeSet.codes)[0]
                      }
                      disabled={!!associatingCode}
                    >
                      Link to Account
                    </PrimaryButton>
                  </div>
                </StoryCard>
              );
            })}
          </div>
        )}

        {/* User's stories from database */}
        <div>
          <h3 className="font-medium text-primary-700 mb-3">Your Stories</h3>
          <UserStoriesList onCodeSelect={handleCodeSubmit} />
        </div>
      </div>
    </Modal>
  );
}
