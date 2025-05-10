import React from "react";
import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { PrimaryButton } from "components/ui";

type ErrorType = "not-found" | "server-error" | "auth-error" | "general";

interface ErrorBoundaryProps {
  type?: ErrorType;
}

export const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({
  type = "general",
}) => {
  const error = useRouteError();

  const getErrorMessage = () => {
    if (isRouteErrorResponse(error)) {
      if (error.status === 404) {
        return "The page you're looking for couldn't be found.";
      }

      if (error.status === 401 || error.status === 403) {
        return "You don't have permission to access this resource.";
      }

      if (error.status >= 500) {
        return "There was a problem with our server. Please try again later.";
      }

      return error.data?.message || "An unexpected error occurred.";
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "An unexpected error occurred.";
  };

  const getErrorTitle = () => {
    if (
      type === "not-found" ||
      (isRouteErrorResponse(error) && error.status === 404)
    ) {
      return "Page Not Found";
    }

    if (
      type === "auth-error" ||
      (isRouteErrorResponse(error) &&
        (error.status === 401 || error.status === 403))
    ) {
      return "Authentication Error";
    }

    if (
      type === "server-error" ||
      (isRouteErrorResponse(error) && error.status >= 500)
    ) {
      return "Server Error";
    }

    return "Something Went Wrong";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-primary-800 mb-4">
          {getErrorTitle()}
        </h1>
        <p className="text-primary-600 mb-6">{getErrorMessage()}</p>
        <PrimaryButton onClick={() => (window.location.href = "/")} fullWidth>
          Go Home
        </PrimaryButton>
      </div>
    </div>
  );
};
