import { useState, useCallback } from "react";
import { Modal } from "shared/components/ui/Modal";
import { StoredCodeSetsList } from "page/components/StoredCodeSetsList";
import { UserStoriesList } from "./UserStoriesList";
import { useNavigate } from "react-router-dom";

interface UserStoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function UserStoriesModal({ isOpen, onClose }: UserStoriesModalProps) {
  const [tabIndex, setTabIndex] = useState(0);
  const navigate = useNavigate();

  const handleCodeSubmit = useCallback(
    (code: string) => {
      onClose();
      navigate(`/game/${code}`);
    },
    [navigate, onClose]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Your Stories" width="md">
      <div className="w-full">
        <div className="flex border-b mb-4">
          <button
            className={`px-4 py-2 font-medium text-sm cursor-pointer ${
              tabIndex === 0
                ? "border-b-2 border-primary-500 text-primary-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setTabIndex(0)}
          >
            My Stories
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm cursor-pointer ${
              tabIndex === 1
                ? "border-b-2 border-primary-500 text-primary-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setTabIndex(1)}
          >
            Local Stories
          </button>
        </div>

        {tabIndex === 0 && <UserStoriesList onCodeSelect={handleCodeSubmit} />}

        {tabIndex === 1 && (
          <div className="mt-2">
            <StoredCodeSetsList onCodeSubmit={handleCodeSubmit} />
          </div>
        )}
      </div>
    </Modal>
  );
}
