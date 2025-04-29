import { useEffect } from "react";
import { PrimaryButton, Icons, ConfirmDialog } from "components/ui/index";
import { StoryTemplate, PublicationStatus } from "core/types";
import { ShareLink } from "components/ShareLink";
import { sortTagsByCategory } from "shared/tagCategories.js";
import { useTemplateLibrary } from "./hooks/useTemplateLibrary.js";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";

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
    importDialog,
    collectionImportDialog,
    loadTemplates,
    formatDate,
    formatDateTime,
    handleDeleteTemplate,
    openDeleteDialog,
    closeDeleteDialog,
    confirmTemplateImport,
    closeImportDialog,
    confirmCollectionImport,
    closeCollectionImportDialog,
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

  const tableColumns: ColumnOption<StoryTemplate>[] = [
    {
      key: "title",
      label: "Title",
      filterable: true,
      render: (template) => (
        <div>
          <span className="font-medium">{template.title}</span>
        </div>
      ),
    },
    {
      key: "publicationStatus",
      label: "Status",
      filterable: true,
      render: (template) => (
        <span
          className={`inline-block px-2 py-1 text-xs font-medium rounded-md ${getStatusColor(
            template.publicationStatus
          )}`}
        >
          <span className="md:hidden">
            {template.publicationStatus.substring(0, 5)}
          </span>
          <span className="hidden md:inline">{template.publicationStatus}</span>
        </span>
      ),
    },
    {
      key: "tags",
      label: "Tags",
      filterable: true,
      sortable: false,
      className: "py-3 px-4 text-left hidden xl:table-cell",
      render: (template) => (
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
      ),
    },
    {
      key: "playerCountMin",
      label: "Players",
      className: "py-3 px-4 text-left hidden md:table-cell",
      render: (template) => (
        <>
          {template.playerCountMin === template.playerCountMax
            ? template.playerCountMin
            : `${template.playerCountMin} - ${template.playerCountMax}`}
        </>
      ),
    },
    {
      key: "maxTurnsMin",
      label: "Length",
      className: "py-3 px-4 text-left hidden lg:table-cell",
      render: (template) => (
        <>
          {template.maxTurnsMin === template.maxTurnsMax
            ? `${template.maxTurnsMin}`
            : `${template.maxTurnsMin} - ${template.maxTurnsMax}`}
        </>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated",
      className: "py-3 px-4 text-left hidden md:table-cell",
      render: (template) => (
        <span className="whitespace-nowrap">
          {formatDate(template.updatedAt)}
        </span>
      ),
    },
    {
      key: "id" as keyof StoryTemplate,
      label: "Actions",
      sortable: false,
      filterable: false,
      render: (template) => (
        <div className="flex space-x-3">
          <button
            onClick={() => onEdit(template)}
            className="text-secondary hover:text-secondary-700 transition-colors"
            title="Edit template"
          >
            <Icons.Edit className="h-5 w-5" />
          </button>
          {template.publicationStatus === PublicationStatus.Published && (
            <ShareLink templateId={template.id} />
          )}
          <button
            onClick={() => handleExportTemplate(template)}
            className="text-secondary hover:text-secondary-700 transition-colors"
            title="Export template"
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
      ),
    },
  ];

  const {
    filteredAndSortedData: filteredTemplates,
    sortConfig,
    filters,
    requestSort,
    addFilter,
    removeFilter,
    clearFilters,
  } = useTableFilterSort({
    data: templates,
    initialSort: { key: "updatedAt", direction: "desc" },
  });

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
            accept=".zip,application/zip"
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
            accept=".zip,application/zip"
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

      {/* Confirmation Dialogs */}

      {/* Delete Template Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={() => handleDeleteTemplate(deleteDialog.templateId)}
        title="Delete Template"
        message="Are you sure you want to delete this story template? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Import Single Template Dialog */}
      <ConfirmDialog
        isOpen={importDialog.isOpen}
        onClose={closeImportDialog}
        onConfirm={confirmTemplateImport}
        title="Import Template"
        message={
          importDialog.existingTemplate && importDialog.newTemplate
            ? `A template with ${
                importDialog.existingTemplate.id === importDialog.newTemplate.id
                  ? "the same ID"
                  : "a matching title"
              } already exists:

${importDialog.existingTemplate.title}
Last updated: ${formatDateTime(importDialog.existingTemplate.updatedAt)}

Your template ${
                importDialog.isNewer
                  ? "**is newer** than"
                  : importDialog.existingTemplate.updatedAt ===
                    importDialog.newTemplate.updatedAt
                  ? "**was updated at the same time** as"
                  : "**is older** than"
              } the existing file.

Do you want to proceed with the import and override the existing template?`
            : "Are you sure you want to import this template?"
        }
        confirmText="Import"
        cancelText="Cancel"
      />

      {/* Import Collection Dialog */}
      <ConfirmDialog
        isOpen={collectionImportDialog.isOpen}
        onClose={closeCollectionImportDialog}
        onConfirm={confirmCollectionImport}
        title="Import Template Collection"
        message={
          collectionImportDialog.file
            ? `This collection contains ${collectionImportDialog.summary.total} templates:

• ${collectionImportDialog.summary.new} **new templates**
• ${collectionImportDialog.summary.newer} templates that are **newer than** existing ones
• ${collectionImportDialog.summary.older} templates that are **older than** existing ones
• ${collectionImportDialog.summary.same} templates with the **same update time** as existing ones

Proceeding will import or update all templates in the collection. Continue?`
            : "Are you sure you want to import this template collection?"
        }
        confirmText="Import All"
        cancelText="Cancel"
      />

      <SortableTable
        data={filteredTemplates}
        columns={tableColumns}
        filters={filters}
        sortConfig={sortConfig}
        onSort={requestSort}
        onFilter={addFilter}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isLoading={isLoading}
        emptyMessage={
          <div>
            <p>No story templates found.</p>
            <PrimaryButton
              onClick={onCreateNew}
              className="mt-4"
              leftIcon={<Icons.Plus className="h-4 w-4" />}
            >
              Create Your First Template
            </PrimaryButton>
          </div>
        }
      />
    </div>
  );
};
