import { useState, useCallback } from "react";
import { UserAccountModal } from "../components";

export function useUserAccountModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialView, setInitialView] = useState<"login" | "register">("login");

  const openLoginModal = useCallback(() => {
    setInitialView("login");
    setIsModalOpen(true);
  }, []);

  const openRegisterModal = useCallback(() => {
    setInitialView("register");
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    // Do not reset initialView here to allow reopening in the same view
  }, []);

  const AccountModal = useCallback(() => {
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
