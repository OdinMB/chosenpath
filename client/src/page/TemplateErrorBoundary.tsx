import { useEffect } from "react";
import { useRouteError } from "react-router-dom";
import { PrimaryButton } from "components/ui";
import { Logger } from "shared/logger";
import { describeTemplateError } from "resources/templates/loaders/templateLoadErrors";

export const TemplateErrorBoundary = () => {
  const error = useRouteError();
  const { title, message, canRetry } = describeTemplateError(error);

  // The screen shows plain words only, so the raw error goes to the log
  useEffect(() => {
    Logger.App.error("Template page error", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-primary-800 mb-4">{title}</h1>
        <p className="text-primary-600 mb-6">{message}</p>
        <div className="space-y-4">
          <PrimaryButton
            onClick={() => (window.location.href = "/library")}
            fullWidth
          >
            Browse Library
          </PrimaryButton>
          {canRetry && (
            <PrimaryButton
              onClick={() => window.location.reload()}
              fullWidth
              variant="outline"
            >
              Retry
            </PrimaryButton>
          )}
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
