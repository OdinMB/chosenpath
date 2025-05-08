import { useState } from "react";
import { Modal } from "../../shared/components/ui/Modal";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

interface UserAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: "login" | "register";
}

export function UserAccountModal({
  isOpen,
  onClose,
  initialView = "login",
}: UserAccountModalProps) {
  const [currentView, setCurrentView] = useState<"login" | "register">(
    initialView
  );

  console.log(
    `UserAccountModal: Rendering with isOpen=${isOpen}, view=${currentView}`
  );

  const handleSuccess = () => {
    console.log("UserAccountModal: handleSuccess called");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      width="md"
      showCloseButton={true}
      title={currentView === "login" ? "Login" : "Create Account"}
    >
      {currentView === "login" ? (
        <LoginForm
          onSuccess={handleSuccess}
          onRegisterClick={() => {
            console.log("UserAccountModal: Switching to register view");
            setCurrentView("register");
          }}
        />
      ) : (
        <RegisterForm
          onSuccess={() => {
            console.log(
              "UserAccountModal: Registration successful, switching to login view"
            );
            setCurrentView("login");
          }}
          onLoginClick={() => {
            console.log("UserAccountModal: Switching to login view");
            setCurrentView("login");
          }}
        />
      )}
    </Modal>
  );
}
