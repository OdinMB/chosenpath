import { useState, useEffect, useRef } from "react";
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
  // Keep track of previous open state to detect when modal opens
  const prevIsOpenRef = useRef(isOpen);
  const [currentView, setCurrentView] = useState<"login" | "register">(
    initialView
  );
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset states when modal closes
  useEffect(() => {
    if (!isOpen) {
      setRegistrationSuccess(false);
      setHasError(false);
    }

    // Update view when modal opens (but not when it's already open)
    if (isOpen && !prevIsOpenRef.current) {
      console.log(
        `UserAccountModal: Modal opened, setting view to ${initialView}`
      );
      setCurrentView(initialView);
    }

    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialView]);

  console.log(
    `UserAccountModal: Rendering with isOpen=${isOpen}, currentView=${currentView}, initialView=${initialView}, registrationSuccess=${registrationSuccess}, hasError=${hasError}`
  );

  const handleSuccess = () => {
    console.log("UserAccountModal: handleSuccess called");
    onClose();
  };

  const handleRegisterSuccess = () => {
    console.log("UserAccountModal: Registration successful");
    setRegistrationSuccess(true);
    setHasError(false); // Clear any previous error state
  };

  const handleSwitchToLogin = () => {
    console.log("UserAccountModal: Switching to login view after registration");
    setRegistrationSuccess(false);
    setHasError(false);
    setCurrentView("login");
  };

  const handleRegisterError = () => {
    console.log(
      "UserAccountModal: Registration error occurred, maintaining register view"
    );
    setHasError(true);

    // Ensure we stay on the register view
    if (currentView !== "register") {
      setCurrentView("register");
    }
  };

  const handleManualViewSwitch = (view: "login" | "register") => {
    console.log(`UserAccountModal: Manually switching to ${view} view`);
    setHasError(false); // Clear error state on manual view switch
    setCurrentView(view);
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
          onRegisterClick={() => handleManualViewSwitch("register")}
        />
      ) : (
        <RegisterForm
          onSuccess={handleRegisterSuccess}
          onError={handleRegisterError}
          showSuccessMessage={registrationSuccess}
          onLoginClick={
            registrationSuccess
              ? handleSwitchToLogin
              : () => handleManualViewSwitch("login")
          }
        />
      )}
    </Modal>
  );
}
