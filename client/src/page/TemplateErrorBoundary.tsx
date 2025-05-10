import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { PrimaryButton } from "components/ui";

export const TemplateErrorBoundary = () => {
  const error = useRouteError();

  const getErrorMessage = () => {
    if (isRouteErrorResponse(error)) {
      if (error.status === 404) {
        return "The template you're looking for couldn't be found.";
      }

      return error.data?.message || "There was a problem loading the template.";
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "There was a problem loading the template.";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-primary-800 mb-4">
          Template Not Available
        </h1>
        <p className="text-primary-600 mb-6">{getErrorMessage()}</p>
        <div className="space-y-4">
          <PrimaryButton
            onClick={() => (window.location.href = "/templates")}
            fullWidth
          >
            Browse Templates
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
