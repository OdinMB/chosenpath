import { useEffect } from "react";
import { PrimaryButton, Icons, ConfirmDialog } from "@components/ui/index";
import { StoryTemplate, PublicationStatus } from "@core/types";
import { ShareLink } from "@components/ShareLink";
import { sortTagsByCategory } from "@common/tagCategories.js";
import { useTemplateLibrary } from "./hooks/useTemplateLibrary.js";

type TemplateLibraryProps = {
  token: string;
  onCreateNew: () => void;
  onEdit: (template: StoryTemplate) => void;
};

export const TemplateLibrary = ({
  token,
  onCreateNew,
  onEdit,
}: TemplateLibraryProps) => {
  const {
    templates,
    isLoading,
    error,
    fileInputRef,
    collectionFileInputRef,
    deleteDialog,
    loadTemplates,
    formatDate,
    handleDeleteTemplate,
    openDeleteDialog,
    closeDeleteDialog,
    handleExportTemplate,
    handleExportAllTemplates,
    handleFileInputChange,
    handleCollectionFileInputChange,
  } = useTemplateLibrary(token);

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

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  return (
    <div className="bg-gray-50 pt-4 rounded-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">Templates</h2>
        <div className="flex gap-2">
          <PrimaryButton
            onClick={loadTemplates}
            size="sm"
            variant="outline"
            leftBorder={false}
            disabled={isLoading}
            leftIcon={<Icons.Refresh className="h-4 w-4" />}
            title="Refresh templates"
          ></PrimaryButton>

          {/* Single Import */}
          <input
            type="file"
            accept="application/json"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            className="hidden"
          />
          <PrimaryButton
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.SingleImport className="h-4 w-4" />}
            title="Import single template"
          ></PrimaryButton>

          {/* Import Collection */}
          <input
            type="file"
            accept="application/json"
            ref={collectionFileInputRef}
            onChange={handleCollectionFileInputChange}
            className="hidden"
          />
          <PrimaryButton
            onClick={() => collectionFileInputRef.current?.click()}
            size="sm"
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.ImportCollection className="h-4 w-4" />}
            title="Import template collection"
          ></PrimaryButton>

          {/* Export All */}
          <PrimaryButton
            onClick={handleExportAllTemplates}
            size="sm"
            variant="outline"
            leftBorder={false}
            leftIcon={<Icons.ExportAll className="h-4 w-4" />}
            title="Export all templates"
          ></PrimaryButton>

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

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={() => handleDeleteTemplate(deleteDialog.templateId)}
        title="Delete Template"
        message="Are you sure you want to delete this story template? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

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
                <th className="hidden xl:table-cell py-3 px-4 text-left">
                  Tags
                </th>
                <th className="hidden md:table-cell py-3 px-4 text-left">
                  Players
                </th>
                <th className="hidden lg:table-cell py-3 px-4 text-left">
                  Length
                </th>
                <th className="hidden md:table-cell py-3 px-4 text-left">
                  Updated
                </th>
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
                        template.publicationStatus
                      )}`}
                    >
                      <span className="md:hidden">
                        {template.publicationStatus.substring(0, 5)}
                      </span>
                      <span className="hidden md:inline">
                        {template.publicationStatus}
                      </span>
                    </span>
                  </td>
                  <td className="hidden xl:table-cell py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {template.tags && template.tags.length > 0 ? (
                        sortTagsByCategory(template.tags).map((tag, index) => (
                          <span
                            key={index}
                            className="inline-block px-2 py-1 text-xs bg-gray-100 rounded-md"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-sm">None</span>
                      )}
                    </div>
                  </td>
                  <td className="hidden md:table-cell py-3 px-4">
                    {template.playerCountMin === template.playerCountMax
                      ? template.playerCountMin
                      : `${template.playerCountMin} - ${template.playerCountMax}`}
                  </td>
                  <td className="hidden lg:table-cell py-3 px-4">
                    {template.maxTurnsMin === template.maxTurnsMax
                      ? `${template.maxTurnsMin}`
                      : `${template.maxTurnsMin} - ${template.maxTurnsMax}`}
                  </td>
                  <td className="hidden md:table-cell py-3 px-4">
                    <span className="whitespace-nowrap">
                      {formatDate(template.updatedAt)}
                    </span>
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
                      {template.publicationStatus ===
                        PublicationStatus.Published && (
                        <ShareLink templateId={template.id} />
                      )}
                      <button
                        onClick={() => handleExportTemplate(template)}
                        className="text-secondary hover:text-secondary-700 transition-colors"
                        title="Export template as JSON"
                      >
                        <Icons.Export className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => openDeleteDialog(template.id)}
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
