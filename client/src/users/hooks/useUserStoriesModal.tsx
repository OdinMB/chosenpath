import { useState, useCallback } from "react";
import { UserStoriesModal } from "../components/UserStoriesModal";

export function useUserStoriesModal() {
  const [isOpen, setIsOpen] = useState(false);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    openModal,
    closeModal,
    StoriesModal: function () {
      return <UserStoriesModal isOpen={isOpen} onClose={closeModal} />;
    },
  };
}
