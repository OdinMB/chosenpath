import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { PrimaryButton } from "components/ui";

export const TemplateErrorBoundary = () => {
  const error = useRouteError();

  const getErrorMessage = () => {
    if (isRouteErrorResponse(error)) {
      if (error.status === 404) {
        return "The template you're looking for couldn't be found.";
      }

      if (error.status === 401) {
        return "You need to be logged in to access this template.";
      }

      if (error.status === 403) {
        return "You don't have permission to access this template.";
      }

      return error.data?.message || "There was a problem loading the template.";
    }

    if (error instanceof Error) {
      // Check for specific error messages that indicate null/undefined template data
      if (
        error.message.includes("null") ||
        error.message.includes("undefined")
      ) {
        return "The template data is corrupted or incomplete. Please try again later.";
      }

      if (error.message.includes("playerCountMin")) {
        return "The template configuration is invalid. Please contact support.";
      }

      return error.message;
    }

    return "There was a problem loading the template.";
  };

  const getErrorTitle = () => {
    if (isRouteErrorResponse(error)) {
      if (error.status === 401) {
        return "Authentication Required";
      }

      if (error.status === 403) {
        return "Access Denied";
      }
    }

    return "Template Not Available";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-primary-800 mb-4">
          {getErrorTitle()}
        </h1>
        <p className="text-primary-600 mb-6">{getErrorMessage()}</p>
        <div className="space-y-4">
          <PrimaryButton
            onClick={() => (window.location.href = "/library")}
            fullWidth
          >
            Browse Library
          </PrimaryButton>
          <PrimaryButton
            onClick={() => window.location.reload()}
            fullWidth
            variant="outline"
          >
            Retry
          </PrimaryButton>
          <PrimaryButton
            onClick={() => (window.location.href = "/")}
            fullWidth
            variant="outline"
          >
            Go Home
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
};
