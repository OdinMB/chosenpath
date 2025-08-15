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
import { StoryTemplate } from "core/types";
import JSZip from "jszip";

interface TemplateOverviewProps {
  initialTemplates: TemplateMetadata[];
  onEdit: (templateId: string) => void;
  onDelete?: (templateId: string) => Promise<void>;
  onExport?: (template: TemplateMetadata) => Promise<void>;
  onExportAll?: () => Promise<void>;
  onCreateNew: () => Promise<void>;
  canPublish?: boolean;
  canExportAll?: boolean;
  canImport?: boolean;
  showCreatorColumn?: boolean;
}

export const TemplateOverview = ({
  initialTemplates,
  onEdit,
  onDelete,
  onExport,
  onExportAll,
  onCreateNew,
  canPublish = false,
  canExportAll = false,
  canImport = false,
  showCreatorColumn = false,
}: TemplateOverviewProps) => {
  const revalidator = useRevalidator();
  const [templates, setTemplates] =
    useState<TemplateMetadata[]>(initialTemplates);

  // Track when we've made local modifications that shouldn't be overwritten
  const hasLocalModifications = useRef(false);

  // Update local templates state when initialTemplates prop changes,
  // but only if we haven't made local modifications
  useEffect(() => {
    if (!hasLocalModifications.current) {
      Logger.UI.log(
        `Syncing with initialTemplates: ${initialTemplates.length} templates`
      );
      setTemplates(initialTemplates);
    } else {
      Logger.UI.log(
        `Skipping sync with initialTemplates due to local modifications`
      );
    }
  }, [initialTemplates]);

  // Helper function to convert StoryTemplate to TemplateMetadata
  const convertTemplateToMetadata = (
    template: StoryTemplate
  ): TemplateMetadata => ({
    id: template.id,
    title: template.title,
    teaser: template.teaser,
    publicationStatus: template.publicationStatus,
    tags: template.tags,
    playerCountMin: template.playerCountMin,
    playerCountMax: template.playerCountMax,
    maxTurnsMin: template.maxTurnsMin,
    maxTurnsMax: template.maxTurnsMax,
    gameMode: template.gameMode,
    showOnWelcomeScreen: template.showOnWelcomeScreen,
    order: template.order,
    containsImages: false, // Default value since StoryTemplate doesn't have this field
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  });

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
    templates: Array<{
      template: StoryTemplate;
      existingTemplate: TemplateMetadata | null;
      isNewer: boolean;
      isSameAge: boolean;
      path: string;
    }>;
  }>({
    isOpen: false,
    file: null,
    summary: { total: 0, new: 0, newer: 0, older: 0, same: 0 },
    templates: [],
  });

  // Simple refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const collectionFileInputRef = useRef<HTMLInputElement>(null);

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
    Logger.UI.log(
      `Collection file input changed. File: ${file ? file.name : "none"}`
    );

    if (file) {
      Logger.UI.log(`Processing collection file: ${file.name}`);
      processCollectionFile(file);
    }

    // Reset the file input so the same file can be selected again
    if (event.target) {
      event.target.value = "";
    }
  };

  const processCollectionFile = async (file: File) => {
    try {
      Logger.UI.log(`=== Starting processCollectionFile for: ${file.name} ===`);

      if (!file.name.endsWith(".zip")) {
        Logger.UI.error("Collection file must be a ZIP archive");
        return;
      }

      Logger.UI.log("Analyzing collection structure...");

      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const templateFiles: { path: string; template: StoryTemplate }[] = [];

      // Look for template.json files in the zip
      for (const [path, zipEntry] of Object.entries(zip.files)) {
        if (path.endsWith("template.json") && !zipEntry.dir) {
          try {
            const content = await zipEntry.async("text");
            const templateData = JSON.parse(content) as StoryTemplate;
            templateFiles.push({ path, template: templateData });
          } catch (error) {
            Logger.UI.warn(`Failed to parse template.json at ${path}:`, error);
          }
        }
      }

      if (templateFiles.length === 0) {
        Logger.UI.error("No valid template.json files found in collection");
        return;
      }

      Logger.UI.log(`Found ${templateFiles.length} templates in collection`);

      // Check against existing templates to create summary
      const existingTemplates = templates;
      Logger.UI.log(
        `Comparing against ${existingTemplates.length} existing templates`
      );

      const templateInfos = templateFiles.map(({ path, template }) => {
        const existing = existingTemplates.find((t) => t.id === template.id);
        const isNewer = existing
          ? new Date(template.updatedAt) > new Date(existing.updatedAt)
          : false;
        const isSameAge = existing
          ? new Date(template.updatedAt).getTime() ===
            new Date(existing.updatedAt).getTime()
          : false;

        return {
          template,
          existingTemplate: existing || null,
          isNewer,
          isSameAge,
          path, // Preserve the path information
        };
      });

      const summary = {
        total: templateInfos.length,
        new: templateInfos.filter((info) => !info.existingTemplate).length,
        newer: templateInfos.filter(
          (info) => info.existingTemplate && info.isNewer
        ).length,
        older: templateInfos.filter(
          (info) => info.existingTemplate && !info.isNewer && !info.isSameAge
        ).length,
        same: templateInfos.filter(
          (info) => info.existingTemplate && info.isSameAge
        ).length,
      };

      Logger.UI.log(`Collection summary:`, summary);
      Logger.UI.log(`Setting collection import dialog to open`);

      setCollectionImportDialog({
        isOpen: true,
        file,
        summary,
        templates: templateInfos,
      });

      Logger.UI.log(`=== Finished processCollectionFile ===`);
    } catch (error) {
      Logger.UI.error("Failed to process collection file:", error);
    }
  };

  const confirmTemplateImport = async () => {
    try {
      if (importDialog.file) {
        const result = await templateApi.importTemplateZip(importDialog.file);

        // Update local state to include the new/updated template
        if (result.isNewTemplate) {
          // Add new template to the list
          setTemplates((prevTemplates) => [
            ...prevTemplates,
            convertTemplateToMetadata(result.template),
          ]);
        } else {
          // Update existing template in the list
          setTemplates((prevTemplates) =>
            prevTemplates.map((template) =>
              template.id === result.template.id
                ? convertTemplateToMetadata(result.template)
                : template
            )
          );
        }

        closeImportDialog();
        Logger.UI.log(
          `Successfully ${
            result.isNewTemplate ? "imported new" : "updated"
          } template: ${result.template.title} (${result.filesImported} files)`
        );

        // Refresh the template list from server
        revalidator.revalidate();
      }
    } catch (error) {
      Logger.UI.error("Failed to import template", error);
    }
  };

  const confirmCollectionImport = async () => {
    try {
      Logger.UI.log(`=== Starting confirmCollectionImport ===`);

      if (!collectionImportDialog.file || !collectionImportDialog.templates) {
        Logger.UI.log("No file or templates in collection dialog, returning");
        return;
      }

      Logger.UI.log(
        `Starting import of ${collectionImportDialog.templates.length} templates`
      );

      let importedCount = 0;
      const results: Array<{ template: StoryTemplate; isNew: boolean }> = [];

      // Re-load the original ZIP to extract assets for each template
      const arrayBuffer = await collectionImportDialog.file.arrayBuffer();
      const originalZip = await JSZip.loadAsync(arrayBuffer);

      // Import each template individually with its assets
      for (const templateInfo of collectionImportDialog.templates) {
        // Only import if it's new or newer
        if (!templateInfo.existingTemplate || templateInfo.isNewer) {
          try {
            Logger.UI.log(`Importing template: ${templateInfo.template.title}`);

            // Find the template directory from the original path
            const templateDir = templateInfo.path.replace("/template.json", "");

            // Create a new ZIP with template.json and all assets from this template's directory
            const templateZip = new JSZip();

            // Add template.json
            templateZip.file(
              "template.json",
              JSON.stringify(templateInfo.template, null, 2)
            );

            // Add all asset files from the template's directory
            let assetCount = 0;
            for (const [filePath, zipEntry] of Object.entries(
              originalZip.files
            )) {
              // Skip directories and template.json
              if (zipEntry.dir || filePath.endsWith("template.json")) {
                continue;
              }

              // Include files from this template's directory
              if (templateDir && filePath.startsWith(`${templateDir}/`)) {
                const relativePath = filePath.substring(templateDir.length + 1);
                const fileData = await zipEntry.async("blob");
                templateZip.file(relativePath, fileData);
                assetCount++;
              }
            }

            const zipBlob = await templateZip.generateAsync({ type: "blob" });
            Logger.UI.log(
              `Created ZIP with ${assetCount} asset files for template: ${templateInfo.template.title}`
            );

            // Use the proper ZIP import endpoint with assets included
            const importResult = await templateApi.importTemplateZip(zipBlob);

            results.push({
              template: importResult.template,
              isNew: !templateInfo.existingTemplate,
            });
            importedCount++;
          } catch (error) {
            Logger.UI.error(
              `Failed to import template ${templateInfo.template.title}:`,
              error
            );
            // Continue with other templates
          }
        }
      }

      Logger.UI.log(`Import completed. ${results.length} templates imported.`);

      // Update local state with imported templates
      if (results.length > 0) {
        Logger.UI.log("Updating local state with imported templates");
        hasLocalModifications.current = true;

        setTemplates((prevTemplates) => {
          const updatedTemplates = [...prevTemplates];

          for (const result of results) {
            const metadata = convertTemplateToMetadata(result.template);

            if (result.isNew) {
              // Add new template
              updatedTemplates.push(metadata);
            } else {
              // Update existing template
              const index = updatedTemplates.findIndex(
                (t) => t.id === result.template.id
              );
              if (index !== -1) {
                updatedTemplates[index] = metadata;
              }
            }
          }

          Logger.UI.log(
            `Local state updated. Total templates: ${updatedTemplates.length}`
          );
          return updatedTemplates;
        });
      }

      closeCollectionImportDialog();

      Logger.UI.log(
        `Successfully imported ${importedCount} templates from collection`
      );
      Logger.UI.log(`=== Finished confirmCollectionImport ===`);

      // Note: Removed revalidator.revalidate() to avoid race condition with local state
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
      }

      // Always update local state to immediately remove the deleted template
      hasLocalModifications.current = true;
      setTemplates((prevTemplates) =>
        prevTemplates.filter((template) => template.id !== templateId)
      );

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
      case PublicationStatus.Private:
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // Filter status options if the user doesn't have publish permission
  const renderStatusColumn = (template: TemplateMetadata) => {
    // Show the actual status, but limit what users can see based on permissions
    // If user doesn't have publish permission, hide Published/Review status unless it's already set
    const isRestrictedStatus =
      template.publicationStatus === PublicationStatus.Published ||
      template.publicationStatus === PublicationStatus.Review;

    // If the user doesn't have publish permission and template has restricted status,
    // only show it if it's already set (don't hide existing published/review templates)
    if (!canPublish && isRestrictedStatus) {
      // Still show the actual status even if user can't set it
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
    }

    // Default case: show the actual status
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
      render: (template) => {
        const truncatedTitle = template.title
          ? template.title.length > 22
            ? `${template.title.substring(0, 22)}…`
            : template.title
          : "";

        return (
          <div className="md:flex md:items-center">
            {/* Mobile: render tag and title in a single inline flow to allow proper wrapping */}
            <span className="md:hidden font-medium leading-snug break-words whitespace-normal">
              <span
                className={`inline-flex items-center px-1 py-0 text-[10px] leading-[1rem] font-semibold rounded-sm mr-1 align-middle ${getStatusColor(
                  template.publicationStatus
                )}`}
              >
                {template.publicationStatus.substring(0, 5)}
              </span>
              {truncatedTitle}
            </span>
            {/* Desktop: full title */}
            <span className="hidden md:inline font-medium">
              {template.title}
            </span>
          </div>
        );
      },
    },
    {
      key: "publicationStatus",
      label: "Status",
      className: "py-3 px-4 text-left hidden md:table-cell",
      render: renderStatusColumn,
    },
    ...(showCreatorColumn
      ? [
          {
            key: "creatorId" as keyof TemplateMetadata,
            label: "Creator",
            className: "py-3 px-4 text-left hidden md:table-cell",
            render: (template: TemplateMetadata) => (
              <span className="text-sm text-gray-600">
                {template.creatorUsername || template.creatorId || "Unknown"}
              </span>
            ),
          },
        ]
      : []),
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
      className: `py-3 px-4 text-center hidden ${
        showCreatorColumn ? "lg:table-cell" : "md:table-cell"
      }`,
      render: (template) => (
        <>
          {template.playerCountMin === template.playerCountMax
            ? template.playerCountMin ?? 1
            : `${template.playerCountMin ?? 1}-${template.playerCountMax ?? 1}`}
        </>
      ),
    },
    {
      key: "maxTurnsMin",
      label: "Beats",
      filterable: false,
      className: `py-3 px-4 text-center hidden ${
        showCreatorColumn ? "lg:table-cell" : "md:table-cell"
      }`,
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
        <div className="flex space-x-2 md:space-x-3">
          <button
            onClick={() => onEdit(template.id)}
            className="text-secondary hover:text-secondary-700 transition-colors"
            title="Edit World"
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
            title="Export World"
          >
            <Icons.Export className="h-5 w-5" />
          </button>
          <button
            onClick={() => openDeleteDialog(template.id)}
            className="text-tertiary hover:text-tertiary-700 transition-colors"
            title="Delete World"
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
        <h2 className="text-xl font-semibold text-secondary hidden md:block">
          Worlds
        </h2>
        <div className="flex gap-2">
          <PrimaryButton
            onClick={() => {
              hasLocalModifications.current = false;
              revalidator.revalidate();
            }}
            size="sm"
            variant="outline"
            leftBorder={false}
            disabled={revalidator.state === "loading"}
            leftIcon={<Icons.Refresh className="h-4 w-4" />}
            title="Refresh Worlds"
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
                title="Import single World"
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
                title="Import collection of Worlds"
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
              title="Export all Worlds"
            ></PrimaryButton>
          )}

          {/* Create New */}
          <PrimaryButton
            onClick={handleCreateNew}
            size="sm"
            variant="primary"
            leftBorder={false}
            leftIcon={<Icons.Plus className="h-4 w-4" />}
            title="Create new World"
          >
            New <span className="hidden md:inline">World</span>
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
        emptyMessage="No Worlds found"
        enableSelection={true}
        selectedItems={selectedItems}
        onToggleItemSelection={toggleItemSelection}
        onToggleAllSelection={toggleAllSelection}
        selectionActions={selectedItems.size > 0 ? selectionActions : []}
        getSelectedItems={getSelectedItems}
        allItems={templates}
      />

      {/* Delete Template Dialog */}
      <ConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={closeDeleteDialog}
        onConfirm={() => handleDelete(deleteDialog.templateId)}
        title="Delete World"
        message="Are you sure you want to delete this World? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Import Single Template Dialog */}
      <ConfirmDialog
        isOpen={importDialog.isOpen}
        onClose={closeImportDialog}
        onConfirm={confirmTemplateImport}
        title="Import World"
        message={
          importDialog.existingTemplate && importDialog.newTemplate
            ? `A World with ${
                importDialog.existingTemplate.id === importDialog.newTemplate.id
                  ? "the same ID"
                  : "a matching title"
              } already exists:

${importDialog.existingTemplate.title}
Last updated: ${formatDateTime(importDialog.existingTemplate.updatedAt)}

Your World ${
                importDialog.isNewer
                  ? "**is newer** than"
                  : importDialog.existingTemplate.updatedAt ===
                    importDialog.newTemplate.updatedAt
                  ? "**was updated at the same time** as"
                  : "**is older** than"
              } the existing file.

Do you want to proceed with the import and override the existing World?`
            : "Are you sure you want to import this World?"
        }
        confirmText="Import"
        cancelText="Cancel"
      />

      {/* Import Collection Dialog */}
      <ConfirmDialog
        isOpen={collectionImportDialog.isOpen}
        onClose={closeCollectionImportDialog}
        onConfirm={confirmCollectionImport}
        title="Import Collection of Worlds"
        message={`Found ${collectionImportDialog.summary.total} Worlds:
- ${collectionImportDialog.summary.new} new Worlds
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
