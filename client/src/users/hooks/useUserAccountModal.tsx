import { useState } from "react";
import { UserAccountModal } from "../components";

export function useUserAccountModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialView, setInitialView] = useState<"login" | "register">("login");

  const openLoginModal = () => {
    setInitialView("login");
    setIsModalOpen(true);
  };

  const openRegisterModal = () => {
    setInitialView("register");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const AccountModal = () => (
    <UserAccountModal
      isOpen={isModalOpen}
      onClose={closeModal}
      initialView={initialView}
    />
  );

  return {
    isModalOpen,
    openLoginModal,
    openRegisterModal,
    closeModal,
    AccountModal,
  };
}
