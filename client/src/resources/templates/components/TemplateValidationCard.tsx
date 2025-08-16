import React from "react";
import { Icons } from "components/ui";
import { ImageCard } from "shared/components/ImageCard";
import { ValidationResult, ValidationIssue } from "../utils/templateValidation";

interface TemplateValidationCardProps {
  validationResult: ValidationResult | null;
  onNavigateFromIssue: (issue: ValidationIssue) => void;
  onAutoFixIssue: (issue: ValidationIssue) => void;
}

export const TemplateValidationCard: React.FC<TemplateValidationCardProps> = ({
  validationResult,
  onNavigateFromIssue,
  onAutoFixIssue,
}) => {
  if (!validationResult || validationResult.stats.totalIssues === 0) {
    return null;
  }

  return (
    <div className="flex justify-center mb-4">
      <ImageCard
        publicImagePath="/cracked-earth-horizontal.jpeg"
        title="Template Issues"
        className="w-full max-w-2xl"
      >
        <div className="flex flex-col h-full space-y-3">
          {/* Group issues by type */}
          {validationResult.stats.errors > 0 && (
            <div>
              <h4 className="font-medium text-red-800 mb-1">
                Error{validationResult.stats.errors > 1 ? "s" : ""}
              </h4>
              <div className="space-y-1">
                {validationResult.issues
                  .filter((issue) => issue.type === "error")
                  .map((issue, index) => (
                    <div
                      key={`error-${index}`}
                      className="flex items-start justify-between text-sm text-gray-700"
                    >
                      <span>• {issue.message}</span>
                      {issue.autoFixable && (
                        <button
                          onClick={() => onAutoFixIssue(issue)}
                          className="ml-2 p-1 text-primary-600 hover:text-primary-800 transition-colors"
                          title="Fix this issue"
                        >
                          <Icons.Wrench className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {validationResult.stats.warnings > 0 && (
            <div>
              <h4 className="font-medium text-yellow-800 mb-1">
                Warning{validationResult.stats.warnings > 1 ? "s" : ""}
              </h4>
              <div className="space-y-1">
                {validationResult.issues
                  .filter((issue) => issue.type === "warning")
                  .map((issue, index) => (
                    <div
                      key={`warning-${index}`}
                      className="flex items-start justify-between text-sm text-gray-700"
                    >
                      <span
                        className={
                          issue.category === "images"
                            ? "cursor-pointer hover:text-primary-600"
                            : ""
                        }
                        onClick={
                          issue.category === "images"
                            ? () => onNavigateFromIssue(issue)
                            : undefined
                        }
                      >
                        • {issue.message}
                      </span>
                      {issue.autoFixable && (
                        <button
                          onClick={() => onAutoFixIssue(issue)}
                          className="ml-2 p-1 text-primary-600 hover:text-primary-800 transition-colors"
                          title="Fix this issue"
                        >
                          <Icons.Wrench className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
          
          {validationResult.stats.info > 0 && (
            <div>
              <h4 className="font-medium text-blue-800 mb-1">
                Note{validationResult.stats.info > 1 ? "s" : ""}
              </h4>
              <div className="space-y-1">
                {validationResult.issues
                  .filter((issue) => issue.type === "info")
                  .map((issue, index) => (
                    <div
                      key={`info-${index}`}
                      className="text-sm text-gray-700"
                    >
                      • {issue.message}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </ImageCard>
    </div>
  );
};