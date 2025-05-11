import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUserStories } from "./hooks";
import { useAuth } from "shared/useAuth";
import { UserStoriesList } from "./components/UserStoriesList";
import { StoryCard } from "shared/components";
import { PrimaryButton } from "shared/components/ui";
import { StoredCodeSet } from "shared/SessionContext";
import { getSortedCodeSets } from "shared/utils/codeSetUtils";
import { StoryMetadata } from "core/types/api";
import { Logger } from "shared/logger";

export function Users() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { storyCodes, associateStoryCode, loadUserStoryData } =
    useUserStories();
  const [localCodeSets, setLocalCodeSets] = useState<StoredCodeSet[]>([]);
  const [associatingCode, setAssociatingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load data when component mounts
  useEffect(() => {
    Logger.App.log("UsersPage mounted - loading data");
    refreshLocalCodeSets();

    // Refresh user stories when the component mounts
    if (isAuthenticated) {
      loadUserStoryData();
    }
  }, [isAuthenticated, loadUserStoryData]);

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

  const handleCodeSubmit = (code: string) => {
    navigate(`/game/${code}`);
  };

  const handleAssociateCode = async (codeSet: StoredCodeSet) => {
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
  };

  return (
    <>
      <div className="max-w-4xl mx-auto p-4 md:p-6 mt-8">
        <h1 className="text-2xl font-bold text-primary-700 mb-6">
          Your Stories
        </h1>

        <div className="w-full space-y-8">
          {/* Error message */}
          {error && (
            <div className="p-3 border border-red-200 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Local codes not associated with user yet */}
          {isAuthenticated && localCodeSets.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-primary-700">
                Local Stories
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                These stories are stored locally but not yet linked to your
                account.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localCodeSets.map((codeSet) => {
                  // Create a minimal story object from the code set
                  const storyId =
                    Object.values(codeSet.codes)[0]?.substring(0, 8) ||
                    "unknown";
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
            </div>
          )}

          {/* User's stories from database */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-primary-700">
              Cloud Stories
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Stories linked to your account that you can access from any
              device.
            </p>
            <UserStoriesList onCodeSelect={handleCodeSubmit} />
          </div>
        </div>
      </div>
    </>
  );
}
