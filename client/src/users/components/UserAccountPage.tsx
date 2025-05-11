import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { AppLogo } from "shared/components/AppLogo";

interface UserAccountPageProps {
  isInModal?: boolean;
  onClose?: () => void;
}

export function UserAccountPage({
  isInModal = false,
  onClose,
}: UserAccountPageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialView =
    (searchParams.get("view") as "login" | "register") || "login";

  const [currentView, setCurrentView] = useState<"login" | "register">(
    initialView
  );
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Update view when URL changes
  useEffect(() => {
    const view = searchParams.get("view") as "login" | "register";
    if (view) {
      setCurrentView(view);
    }
  }, [searchParams]);

  const handleSuccess = () => {
    if (isInModal && onClose) {
      onClose();
    } else {
      navigate("/");
    }
  };

  const handleRegisterSuccess = () => {
    console.log("UserAccountPage: Registration successful");
    setRegistrationSuccess(true);
    setHasError(false);
    setCurrentView("login");
  };

  const handleSwitchToLogin = () => {
    console.log("UserAccountPage: Switching to login view after registration");
    setRegistrationSuccess(false);
    setHasError(false);
    setCurrentView("login");
    navigate("/users/signin?view=login");
  };

  const handleRegisterError = () => {
    console.log("UserAccountPage: Registration error occurred");
    setHasError(true);
    if (currentView !== "register") {
      setCurrentView("register");
      navigate("/users/signin?view=register");
    }
  };

  const handleManualViewSwitch = (view: "login" | "register") => {
    console.log(`UserAccountPage: Switching to ${view} view`);
    setHasError(false);
    setCurrentView(view);
    navigate(`/users/signin?view=${view}`);
  };

  const content = (
    <div className="w-full max-w-md space-y-8">
      {!isInModal && (
        <AppLogo size="medium" className="mb-8" onClick={() => navigate("/")} />
      )}
      {hasError && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-700">
            There was an error with your request. Please try again.
          </div>
        </div>
      )}
      {currentView === "login" ? (
        <LoginForm
          onSuccess={handleSuccess}
          onRegisterClick={() => handleManualViewSwitch("register")}
          registrationSuccessMessage={
            registrationSuccess
              ? "Registration successful! You can now log in."
              : undefined
          }
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
    </div>
  );

  if (isInModal) {
    return content;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      {content}
    </div>
  );
}
