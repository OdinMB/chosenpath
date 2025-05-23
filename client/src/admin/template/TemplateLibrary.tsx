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
import { useLoaderData, useRevalidator, useNavigate } from "react-router-dom";
import { AdminTemplatesLoaderData } from "./adminTemplatesLoader.js";
import { adminTemplateApi } from "admin/adminApi";
import { Logger } from "shared/logger";
import { createDefaultTemplate } from "./utils/templateFactory";

export const TemplateLibrary = () => {
  const { templates: initialTemplates } =
    useLoaderData() as AdminTemplatesLoaderData;
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const {
    templates,
    fileInputRef,
    collectionFileInputRef,
    deleteDialog,
    importDialog,
    collectionImportDialog,
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
  } = useTemplateLibrary(initialTemplates);

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

  const columns: ColumnOption<StoryTemplate>[] = [
    {
      key: "title",
      label: "Title",
      render: (template) => (
        <span className="font-medium">{template.title}</span>
      ),
    },
    {
      key: "publicationStatus",
      label: "Status",
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
      className: "py-3 px-4 text-center hidden md:table-cell",
      render: (template) => (
        <>
          {template.playerCountMin === template.playerCountMax
            ? template.playerCountMin
            : `${template.playerCountMin}-${template.playerCountMax}`}
        </>
      ),
    },
    {
      key: "maxTurnsMin",
      label: "Beats",
      filterable: false,
      className: "py-3 px-4 text-center hidden md:table-cell",
      render: (template) => (
        <>
          {template.maxTurnsMin === template.maxTurnsMax
            ? `${template.maxTurnsMin}`
            : `${template.maxTurnsMin}-${template.maxTurnsMax}`}
        </>
      ),
    },
    {
      key: "updatedAt",
      label: "Updated",
      filterable: false,
      className: "py-3 px-4 text-left hidden lg:table-cell",
      render: (template) => (
        <span className="whitespace-nowrap">
          {formatDateTime(template.updatedAt)}
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
            onClick={() => navigate(`/admin/templates/${template.id}`)}
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
    selectedItems,
    toggleItemSelection,
    toggleAllSelection,
    clearSelection,
    getSelectedItems,
  } = useTableFilterSort({
    data: templates,
    initialSort: { key: "updatedAt", direction: "desc" },
    enableSelection: true,
  });

  const handleCreateNewTemplate = async () => {
    try {
      const defaultTemplate = createDefaultTemplate();
      const response = await adminTemplateApi.createTemplate({
        template: defaultTemplate,
      });
      navigate(`/admin/templates/${response.template.id}`);
    } catch (error) {
      Logger.Admin.error("Failed to create new template", error);
    }
  };

  const handleExportSelected = async (selectedTemplates: StoryTemplate[]) => {
    if (selectedTemplates.length === 0) return;

    try {
      const templateIds = selectedTemplates.map((template) => template.id);
      const zipBlob = await adminTemplateApi.exportSelectedTemplates(
        templateIds
      );

      // Create download
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `selected-templates-${
        new Date().toISOString().split("T")[0]
      }.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Clear selection after export
      clearSelection();
    } catch (error) {
      Logger.Admin.error("Failed to export selected templates", error);
    }
  };

  const selectionActions = [
    {
      label: "Export Selected",
      icon: <Icons.Export className="h-4 w-4" />,
      onClick: handleExportSelected,
    },
  ];

  return (
    <div className="pt-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-secondary">Templates</h2>
        <div className="flex gap-2">
          <PrimaryButton
            onClick={revalidator.revalidate}
            size="sm"
            variant="outline"
            leftBorder={false}
            disabled={revalidator.state === "loading"}
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

          {/* Create New */}
          <PrimaryButton
            onClick={handleCreateNewTemplate}
            size="sm"
            variant="primary"
            leftBorder={false}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
            title="Create new template"
          >
            New Template
          </PrimaryButton>
        </div>
      </div>

      <SortableTable
        data={filteredTemplates}
        columns={columns}
        sortConfig={sortConfig}
        onSort={requestSort}
        filters={filters}
        onFilter={addFilter}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isLoading={revalidator.state === "loading"}
        emptyMessage="No templates found"
        enableSelection={true}
        selectedItems={selectedItems}
        onToggleItemSelection={toggleItemSelection}
        onToggleAllSelection={toggleAllSelection}
        selectionActions={selectionActions}
        getSelectedItems={getSelectedItems}
        allItems={templates}
      />

      {/* Delete Template Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={() => handleDeleteTemplate(deleteDialog.templateId)}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone."
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
        message={`Found ${collectionImportDialog.summary.total} templates:
- ${collectionImportDialog.summary.new} new templates
- ${collectionImportDialog.summary.newer} newer versions
- ${collectionImportDialog.summary.same} same versions
- ${collectionImportDialog.summary.older} older versions

Do you want to proceed with the import?`}
        confirmText="Import"
        cancelText="Cancel"
      />
    </div>
  );
};
