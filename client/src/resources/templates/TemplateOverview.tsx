import { PrimaryButton, Icons, ConfirmDialog } from "components/ui/index";
import { TemplateMetadata, PublicationStatus } from "core/types";
import { ShareLink } from "components/ShareLink";
import { sortTagsByCategory } from "client/resources/templates/tagCategories.js";
import {
  SortableTable,
  useTableFilterSort,
  ColumnOption,
} from "shared/components";
import { useRevalidator } from "react-router-dom";
import { Logger } from "shared/logger";
import { templateApi } from "./templateApi.js";
import { useState, useRef, useEffect } from "react";

interface TemplateOverviewProps {
  initialTemplates: TemplateMetadata[];
  onEdit: (templateId: string) => void;
  onDelete?: (templateId: string) => Promise<void>;
  onExport?: (template: TemplateMetadata) => Promise<void>;
  onExportAll?: () => Promise<void>;
  onCreateNew: () => Promise<void>;
  onImport?: (templateId: string, zipData: Blob) => Promise<unknown>;
  canPublish?: boolean;
  canExportAll?: boolean;
  canImport?: boolean;
}

export const TemplateOverview = ({
  initialTemplates,
  onEdit,
  onDelete,
  onExport,
  onExportAll,
  onCreateNew,
  onImport,
  canPublish = false,
  canExportAll = false,
  canImport = false,
}: TemplateOverviewProps) => {
  const revalidator = useRevalidator();
  const [templates, setTemplates] =
    useState<TemplateMetadata[]>(initialTemplates);

  // Update local templates state when initialTemplates prop changes
  useEffect(() => {
    setTemplates(initialTemplates);
  }, [initialTemplates]);

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    templateId: string;
  }>({ isOpen: false, templateId: "" });

  // Import dialog states
  const [importDialog, setImportDialog] = useState<{
    isOpen: boolean;
    file: Blob | null;
    existingTemplate: TemplateMetadata | null;
    newTemplate: Partial<TemplateMetadata> | null;
    isNewer: boolean;
  }>({
    isOpen: false,
    file: null,
    existingTemplate: null,
    newTemplate: null,
    isNewer: false,
  });

  const [collectionImportDialog, setCollectionImportDialog] = useState<{
    isOpen: boolean;
    file: Blob | null;
    summary: {
      total: number;
      new: number;
      newer: number;
      older: number;
      same: number;
    };
    templates: TemplateMetadata[];
  }>({
    isOpen: false,
    file: null,
    summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
    templates: [],
  });

  // Simple refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectionFileInputRef = useRef<HTMLInputElement>(null);

  // Handle imports with custom handler if provided
  const handleImport = onImport || templateApi.importTemplateZip;

  // Date formatting utility
  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Dialog handlers
  const openDeleteDialog = (templateId: string) => {
    setDeleteDialog({ isOpen: true, templateId });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ isOpen: false, templateId: "" });
  };

  const closeImportDialog = () => {
    setImportDialog({
      isOpen: false,
      file: null,
      existingTemplate: null,
      newTemplate: null,
      isNewer: false,
    });
  };

  const closeCollectionImportDialog = () => {
    setCollectionImportDialog({
      isOpen: false,
      file: null,
      summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
      templates: [],
    });
  };

  // File input handlers (simplified versions)
  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      // For now, just show a simple import dialog
      setImportDialog({
        isOpen: true,
        file,
        existingTemplate: null,
        newTemplate: { title: file.name.replace(/\.[^/.]+$/, "") },
        isNewer: false,
      });
    }
  };

  const handleCollectionFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      // For now, just show a simple collection import dialog
      setCollectionImportDialog({
        isOpen: true,
        file,
        summary: { total: 1, new: 1, newer: 0, older: 0, same: 0 },
        templates: [],
      });
    }
  };

  const confirmTemplateImport = async () => {
    try {
      if (importDialog.file && importDialog.newTemplate?.title) {
        // Create a temporary template ID for import
        const tempId = `temp-${Date.now()}`;
        await handleImport(tempId, importDialog.file);
        closeImportDialog();
        revalidator.revalidate();
      }
    } catch (error) {
      Logger.UI.error("Failed to import template", error);
    }
  };

  const confirmCollectionImport = async () => {
    try {
      if (collectionImportDialog.file) {
        // Handle collection import (simplified)
        Logger.UI.log("Collection import not fully implemented yet");
        closeCollectionImportDialog();
        revalidator.revalidate();
      }
    } catch (error) {
      Logger.UI.error("Failed to import collection", error);
    }
  };

  // Wrap the external handlers with local state management or use default implementations
  const handleDelete = async (templateId: string) => {
    try {
      if (onDelete) {
        await onDelete(templateId);
      } else {
        // Default implementation
        await templateApi.deleteTemplate(templateId);
        revalidator.revalidate();
      }
      closeDeleteDialog();
    } catch (error) {
      Logger.UI.error("Failed to delete template", error);
    }
  };

  const handleExport = async (template: TemplateMetadata) => {
    try {
      if (onExport) {
        await onExport(template);
      } else {
        // Default implementation
        const zipBlob = await templateApi.exportTemplates([template.id]);
        templateApi.createDownload(
          zipBlob,
          `${template.title.replace(/\s+/g, "-").toLowerCase()}.zip`
        );
      }
    } catch (error) {
      Logger.UI.error("Failed to export template", error);
    }
  };

  const handleExportAll = async () => {
    try {
      if (onExportAll) {
        await onExportAll();
      } else {
        // Default implementation - get all template metadata and export them
        const templateMetadata = await templateApi.getAllTemplateMetadata();
        const templateIds = templateMetadata.map((template) => template.id);
        const zipBlob = await templateApi.exportTemplates(templateIds);
        templateApi.createDownload(
          zipBlob,
          `all-templates-${new Date().toISOString().split("T")[0]}.zip`
        );
      }
    } catch (error) {
      Logger.UI.error("Failed to export all templates", error);
    }
  };

  const handleCreateNew = async () => {
    await onCreateNew();
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

  // Filter status options if the user doesn't have publish permission
  const renderStatusColumn = (template: TemplateMetadata) => {
    // If the template is already published, show it regardless of permissions
    const isAlreadyPublishedOrReview =
      template.publicationStatus === PublicationStatus.Published ||
      template.publicationStatus === PublicationStatus.Review;

    // Only show published/review status if the user has permission or it's already set
    if (!canPublish && !isAlreadyPublishedOrReview) {
      return (
        <span className="inline-block px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
          <span className="md:hidden">Draft</span>
          <span className="hidden md:inline">Draft</span>
        </span>
      );
    }

    return (
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
    );
  };

  const columns: ColumnOption<TemplateMetadata>[] = [
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
      render: renderStatusColumn,
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
      key: "id" as keyof TemplateMetadata,
      label: "Actions",
      sortable: false,
      filterable: false,
      render: (template) => (
        <div className="flex space-x-3">
          <button
            onClick={() => onEdit(template.id)}
            className="text-secondary hover:text-secondary-700 transition-colors"
            title="Edit template"
          >
            <Icons.Edit className="h-5 w-5" />
          </button>
          {(canPublish ||
            template.publicationStatus === PublicationStatus.Published) && (
            <ShareLink templateId={template.id} />
          )}
          <button
            onClick={() => handleExport(template)}
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

  const handleExportSelected = async (
    selectedTemplates: TemplateMetadata[]
  ) => {
    if (selectedTemplates.length === 0) return;

    try {
      const templateIds = selectedTemplates.map((template) => template.id);

      // Use the consistent exportTemplates API
      const zipBlob = await templateApi.exportTemplates(templateIds);

      // Create a descriptive filename
      const filename =
        selectedTemplates.length === 1
          ? `${selectedTemplates[0].title
              .replace(/\s+/g, "-")
              .toLowerCase()}.zip`
          : `selected-templates-${new Date().toISOString().split("T")[0]}.zip`;

      // Trigger download
      templateApi.createDownload(zipBlob, filename);

      // Clear selection after export
      clearSelection();

      Logger.UI.log(`Exported ${selectedTemplates.length} selected templates`);
    } catch (error) {
      Logger.UI.error("Failed to export selected templates", error);
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

          {canImport && (
            <>
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
            </>
          )}

          {canExportAll && (
            <PrimaryButton
              onClick={handleExportAll}
              size="sm"
              variant="outline"
              leftBorder={false}
              leftIcon={<Icons.ExportAll className="h-4 w-4" />}
              title="Export all templates"
            ></PrimaryButton>
          )}

          {/* Create New */}
          <PrimaryButton
            onClick={handleCreateNew}
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
        onConfirm={() => handleDelete(deleteDialog.templateId)}
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
