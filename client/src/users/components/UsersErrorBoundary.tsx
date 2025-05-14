import React from "react";
import { useNavigate, useRouteError } from "react-router-dom";
import { PrimaryButton } from "components/ui"; // Assuming you have a PrimaryButton component
import { Logger } from "shared/logger";

export const UsersErrorBoundary: React.FC = () => {
  const navigate = useNavigate();
  const error = useRouteError();

  // Log the error for debugging purposes
  Logger.App.error("Error in user section:", error);

  const handleGoToSignIn = () => {
    navigate("/users/signin?view=login", { replace: true });
  };

  // Attempt to get a more specific error message
  let errorMessage = "An unexpected error occurred.";
  if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else if (
    error &&
    typeof error === "object" &&
    "statusText" in error &&
    typeof error.statusText === "string"
  ) {
    errorMessage = error.statusText;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h2 className="text-2xl font-semibold text-red-600 mb-4">
          Oops! Something went wrong.
        </h2>
        <p className="text-gray-700 mb-6">{errorMessage}</p>
        <PrimaryButton onClick={handleGoToSignIn}>Go to Sign In</PrimaryButton>
      </div>
    </div>
  );
};
