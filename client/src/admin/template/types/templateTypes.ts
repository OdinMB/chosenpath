import { StoryTemplate } from "core/types";
import JSZip from "jszip";

/**
 * Dialog state for template deletion confirmation
 */
export interface DeleteDialogState {
  isOpen: boolean;
  templateId: string;
}

/**
 * Dialog state for template import confirmation
 */
export interface ImportDialogState {
  isOpen: boolean;
  file: File | null;
  existingTemplate: StoryTemplate | null;
  newTemplate: Partial<StoryTemplate> | null;
  isNewer: boolean;
}

/**
 * Template information during import process
 */
export interface TemplateImportInfo {
  template: Partial<StoryTemplate>;
  existingTemplate: StoryTemplate | null;
  isNewer: boolean;
  templateDir: string;
  isSameAge?: boolean;
}

/**
 * Template collection import summary
 */
export interface ImportSummary {
  total: number;
  new: number;
  newer: number;
  older: number;
  same: number;
}

/**
 * Dialog state for collection import confirmation
 */
export interface CollectionImportDialogState {
  isOpen: boolean;
  file: File | null;
  summary: ImportSummary;
  templates: TemplateImportInfo[];
}

/**
 * Interface for the useTemplateProcessing hook functions
 */
export interface TemplateProcessing {
  compareTemplateVersions: (
    existingTemplate: StoryTemplate,
    newTemplate: Partial<StoryTemplate>
  ) => boolean;
  processTemplateFile: (file: File) => Promise<{
    templateData: Partial<StoryTemplate>;
    assetFiles?: string[];
    zipData?: JSZip;
    templateDir?: string;
  }>;
  processCollectionFile: (file: File) => Promise<{
    templates: TemplateImportInfo[];
    zipData?: JSZip;
    zipFiles?: string[];
  }>;
  findExistingTemplate: (
    templateData: Partial<StoryTemplate>
  ) => StoryTemplate | null;
}

/**
 * Interface for template core operations
 */
export interface TemplateCore {
  createTemplate: (
    templateData: Partial<StoryTemplate>
  ) => Promise<StoryTemplate>;
  loadTemplates: () => Promise<void>;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}
