import { useState, useCallback } from "react";
import { UserAccountModal } from "../components";

export function useUserAccountModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialView, setInitialView] = useState<"login" | "register">("login");

  const openLoginModal = useCallback(() => {
    console.log("useUserAccountModal: Opening login modal");
    setInitialView("login");
    setIsModalOpen(true);
  }, []);

  const openRegisterModal = useCallback(() => {
    console.log("useUserAccountModal: Opening register modal");
    setInitialView("register");
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    console.log("useUserAccountModal: Closing modal");
    setIsModalOpen(false);
    // Do not reset initialView here to allow reopening in the same view
  }, []);

  const AccountModal = useCallback(() => {
    console.log(
      `useUserAccountModal: Rendering modal with initialView=${initialView}`
    );
    return (
      <UserAccountModal
        isOpen={isModalOpen}
        onClose={closeModal}
        initialView={initialView}
      />
    );
  }, [isModalOpen, closeModal, initialView]);

  return {
    isModalOpen,
    openLoginModal,
    openRegisterModal,
    closeModal,
    AccountModal,
  };
}
