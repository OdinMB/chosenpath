import { useState, useEffect, useCallback } from "react";
import { PrimaryButton, Icons } from "@components/ui";
import { config } from "@/config";
import { Logger } from "@common/logger";
import { StoryTemplate, PublicationStatus } from "@core/types";

type StoryLibraryProps = {
  token: string;
  onCreateNew: () => void;
  onEdit: (template: StoryTemplate) => void;
};

export const StoryLibrary = ({
  token,
  onCreateNew,
  onEdit,
}: StoryLibraryProps) => {
  const [templates, setTemplates] = useState<StoryTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    Logger.Admin.log("Loading story templates");

    try {
      const response = await fetch(`${config.apiUrl}/admin/library/templates`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        Logger.Admin.error("Server returned an error response", {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error("Failed to load story templates");
      }

      const data = await response.json();
      Logger.Admin.log(
        `Successfully loaded ${data.templates.length} story templates`
      );
      setTemplates(data.templates);
    } catch (error) {
      Logger.Admin.error("Failed to load story templates", error);
      setError("Failed to load story templates. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";

    const date = new Date(dateString);

    // Format: "2025-04-07"
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this story template? This action cannot be undone."
      )
    ) {
      Logger.Admin.log(`Delete operation canceled for template: ${templateId}`);
      return;
    }

    Logger.Admin.log(`Attempting to delete template: ${templateId}`);
    try {
      const response = await fetch(
        `${config.apiUrl}/admin/library/templates/${templateId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        Logger.Admin.error(`Failed to delete template: ${templateId}`, {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error("Failed to delete story template");
      }

      Logger.Admin.log(`Successfully deleted template: ${templateId}`);
      // Refresh the list
      loadTemplates();
    } catch (error) {
      Logger.Admin.error(`Error deleting template: ${templateId}`, error);
      setError("Failed to delete template. Please try again.");
    }
  };

  const getStatusColor = (status: PublicationStatus) => {
    switch (status) {
      case PublicationStatus.Draft:
        return "bg-gray-100 text-gray-700";
      case PublicationStatus.Review:
        return "bg-amber-100 text-amber-700";
      case PublicationStatus.Published:
        return "bg-green-100 text-green-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="bg-gray-50 p-6 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">
          Story Templates
        </h2>
        <div className="flex gap-2">
          <PrimaryButton
            onClick={loadTemplates}
            size="sm"
            variant="outline"
            disabled={isLoading}
            leftIcon={<Icons.Refresh className="h-4 w-4" />}
          >
            Refresh
          </PrimaryButton>
          <PrimaryButton
            onClick={onCreateNew}
            size="sm"
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Create New
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center rounded-md bg-tertiary-100 p-4 text-sm text-tertiary">
          <Icons.Error className="mr-2 h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-t-2 border-b-2 border-secondary rounded-full animate-spin"></div>
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-primary-500">
          <p>No story templates found.</p>
          <PrimaryButton
            onClick={onCreateNew}
            className="mt-4"
            leftIcon={<Icons.Plus className="h-4 w-4" />}
          >
            Create Your First Template
          </PrimaryButton>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-lg overflow-hidden shadow">
            <thead className="bg-gray-100 text-primary-800">
              <tr>
                <th className="py-3 px-4 text-left">Title</th>
                <th className="py-3 px-4 text-left">Status</th>
                <th className="py-3 px-4 text-left">Tags</th>
                <th className="py-3 px-4 text-left">Players</th>
                <th className="py-3 px-4 text-left">Story Length</th>
                <th className="py-3 px-4 text-left">Created</th>
                <th className="py-3 px-4 text-left">Updated</th>
                <th className="py-3 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div>
                      <span className="font-medium">{template.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded-md ${getStatusColor(
                        template.publicationStatus || PublicationStatus.Draft
                      )}`}
                    >
                      {template.publicationStatus || PublicationStatus.Draft}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {template.tags && template.tags.length > 0 ? (
                        template.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="inline-block px-2 py-1 text-xs bg-gray-100 rounded-md"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-sm">No tags</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {template.playerCountMin === template.playerCountMax
                      ? template.playerCountMin
                      : `${template.playerCountMin} - ${template.playerCountMax}`}
                  </td>
                  <td className="py-3 px-4">
                    {template.maxTurnsMin === template.maxTurnsMax
                      ? `${template.maxTurnsMin} turns`
                      : `${template.maxTurnsMin} - ${template.maxTurnsMax} turns`}
                  </td>
                  <td className="py-3 px-4">
                    {formatDate(template.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    {formatDate(template.updatedAt)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex space-x-3">
                      <button
                        onClick={() => onEdit(template)}
                        className="text-secondary hover:text-secondary-700 transition-colors"
                        title="Edit template"
                      >
                        <Icons.Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-tertiary hover:text-tertiary-700 transition-colors"
                        title="Delete template"
                      >
                        <Icons.Trash className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
