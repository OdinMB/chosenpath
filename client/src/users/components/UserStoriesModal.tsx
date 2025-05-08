import { useState, useCallback, useEffect } from "react";
import { Modal } from "shared/components/ui/Modal";
import { UserStoriesList } from "./UserStoriesList";
import { useNavigate } from "react-router-dom";
import { useUserStories } from "../hooks";
import { useAuth } from "shared/useAuth";
import { PrimaryButton } from "shared/components/ui";
import { StoredCodeSet } from "shared/SessionContext";
import { getSortedCodeSets } from "shared/utils/codeSetUtils";

interface UserStoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserStoriesModal({ isOpen, onClose }: UserStoriesModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { storyCodes, associateStoryCode } = useUserStories();
  const [localCodeSets, setLocalCodeSets] = useState<StoredCodeSet[]>([]);
  const [associatingCode, setAssociatingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load local code sets when modal opens
  useEffect(() => {
    if (isOpen) {
      refreshLocalCodeSets();
    }
  }, [isOpen]);

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

    setLocalCodeSets(filteredSets);
  }, [storyCodes, isAuthenticated]);

  const refreshLocalCodeSets = () => {
    setLocalCodeSets(getSortedCodeSets());
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
              These stories are stored locally and are not yet linked to your
              account.
            </p>

            {localCodeSets.map((codeSet) => (
              <div
                key={codeSet.timestamp}
                className="border rounded-lg p-3 bg-white shadow-sm flex justify-between items-center"
              >
                <div>
                  <div className="font-medium">
                    {codeSet.title ||
                      `Story from ${new Date(
                        codeSet.timestamp
                      ).toLocaleString()}`}
                  </div>
                  <div className="text-xs text-gray-500">
                    {Object.keys(codeSet.codes).length} codes
                  </div>
                </div>
                <div className="flex space-x-2">
                  <PrimaryButton
                    size="sm"
                    onClick={() =>
                      handleCodeSubmit(Object.values(codeSet.codes)[0])
                    }
                  >
                    Play
                  </PrimaryButton>
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
              </div>
            ))}
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
