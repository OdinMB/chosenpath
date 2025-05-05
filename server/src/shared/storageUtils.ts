import path from "path";
import { STORAGE_PATHS } from "../config.js";
import fs from "fs/promises";
import fsSync from "fs";
import JSZip from "jszip";
import { ImageStoryState } from "core/types/index.js";

/**
 * Gets the appropriate fully-resolved storage path based on the current environment
 * @param pathType - The type of storage path ('stories' or 'mocks')
 * @returns The full absolute storage path ready for appending filenames
 */
export function getStoragePath(
  pathType: keyof typeof STORAGE_PATHS.development
): string {
  const env =
    process.env.NODE_ENV === "production" ? "production" : "development";
  const storagePath = STORAGE_PATHS[env][pathType];

  // If path is already absolute, return as is
  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }

  // For relative paths in development, resolve against current working directory
  return path.join(process.cwd(), storagePath);
}

/**
 * Ensures a directory exists before performing file operations
 * @param dirPath - The directory path to ensure exists
 */
async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`Failed to create directory ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Gets the story directory path for a specific story
 * @param storyId - The story ID
 * @returns The full path to the story directory
 */
export function getStoryDirectoryPath(storyId: string): string {
  const storiesBasePath = getStoragePath("stories");
  return path.join(storiesBasePath, storyId);
}

/**
 * Gets the story file path for a specific story
 * @param storyId - The story ID
 * @returns The full path to the story.json file
 */
export function getStoryFilePath(storyId: string): string {
  return path.join(getStoryDirectoryPath(storyId), "story.json");
}

/**
 * Gets the images directory path for a specific story
 * @param storyId - The story ID
 * @returns The full path to the story's images directory
 */
export function getStoryImagesDirectoryPath(storyId: string): string {
  return path.join(getStoryDirectoryPath(storyId), "images");
}

/**
 * Ensures a story directory structure exists, creating directories if needed
 * @param storyId - The story ID
 * @returns The full path to the created story directory
 */
export async function ensureStoryDirectoryStructure(
  storyId: string
): Promise<string> {
  const storyDirPath = getStoryDirectoryPath(storyId);
  const imagesDirPath = getStoryImagesDirectoryPath(storyId);

  await ensureDirExists(storyDirPath);
  await ensureDirExists(imagesDirPath);

  return storyDirPath;
}

/**
 * Reads a story file from storage
 * @param storyId - The story ID
 * @returns The file contents as a string
 */
export async function readStoryFile(storyId: string): Promise<string> {
  const filePath = getStoryFilePath(storyId);

  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw error; // Story file doesn't exist
    }
    throw error;
  }
}

/**
 * Writes a story file to storage, creating the directory structure if it doesn't exist
 * @param storyId - The story ID
 * @param data - The data to write
 */
export async function writeStoryFile(
  storyId: string,
  data: string
): Promise<void> {
  await ensureStoryDirectoryStructure(storyId);
  const filePath = getStoryFilePath(storyId);

  try {
    await fs.writeFile(filePath, data);
  } catch (error) {
    throw error;
  }
}

/**
 * List all story directories in storage
 * @returns Array of story IDs
 */
export async function listStoryDirectories(): Promise<string[]> {
  const dirPath = getStoragePath("stories");

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Directory doesn't exist, create it
      await ensureDirExists(dirPath);
      // Return empty array as the directory was just created
      return [];
    }
    throw error;
  }
}

/**
 * Deletes a story directory and all its contents
 * @param storyId - The story ID to delete
 */
export async function deleteStoryDirectory(storyId: string): Promise<void> {
  const dirPath = getStoryDirectoryPath(storyId);

  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // If directory doesn't exist, don't treat it as an error
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Reads a file from storage, creating the directory if it doesn't exist
 * @param pathType - The type of storage path ('stories' or 'mocks')
 * @param fileName - The file name to read
 * @returns The file contents as a string
 */
export async function readStorageFile(
  pathType: keyof typeof STORAGE_PATHS.development,
  fileName: string
): Promise<string> {
  const dirPath = getStoragePath(pathType);
  const filePath = path.join(dirPath, fileName);

  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if ((error as NodeJS.ErrnoException).path === filePath) {
        // File doesn't exist, but that's not our problem to solve
        throw error;
      }
      // Directory might not exist, try to create it
      await ensureDirExists(dirPath);
      // Try again
      return await fs.readFile(filePath, "utf-8");
    }
    throw error;
  }
}

/**
 * Writes a file to storage, creating the directory if it doesn't exist
 * @param pathType - The type of storage path ('stories' or 'mocks')
 * @param fileName - The file name to write
 * @param data - The data to write
 */
export async function writeStorageFile(
  pathType: keyof typeof STORAGE_PATHS.development,
  fileName: string,
  data: string
): Promise<void> {
  const dirPath = getStoragePath(pathType);
  const filePath = path.join(dirPath, fileName);

  try {
    await fs.writeFile(filePath, data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Directory might not exist, try to create it
      await ensureDirExists(dirPath);
      // Try again
      await fs.writeFile(filePath, data);
    } else {
      throw error;
    }
  }
}

/**
 * Lists files in a storage directory, creating the directory if it doesn't exist
 * @param pathType - The type of storage path ('stories' or 'mocks')
 * @returns Array of file names in the directory
 */
export async function listStorageFiles(
  pathType: keyof typeof STORAGE_PATHS.development
): Promise<string[]> {
  const dirPath = getStoragePath(pathType);

  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Directory doesn't exist, create it
      await ensureDirExists(dirPath);
      // Return empty array as the directory was just created
      return [];
    }
    throw error;
  }
}

/**
 * Deletes a file from storage
 * @param pathType - The type of storage path ('stories' or 'mocks')
 * @param fileName - The file name to delete
 */
export async function deleteStorageFile(
  pathType: keyof typeof STORAGE_PATHS.development,
  fileName: string
): Promise<void> {
  const dirPath = getStoragePath(pathType);
  const filePath = path.join(dirPath, fileName);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    // If file doesn't exist, don't treat it as an error
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Gets stats for a file in storage
 * @param pathType - The type of storage path ('stories' or 'mocks')
 * @param fileName - The file name to get stats for
 * @returns The file stats
 */
export async function getStorageFileStats(
  pathType: keyof typeof STORAGE_PATHS.development,
  fileName: string
): Promise<ReturnType<typeof fs.stat>> {
  const dirPath = getStoragePath(pathType);
  const filePath = path.join(dirPath, fileName);

  return await fs.stat(filePath);
}

/**
 * Gets files in a storage subdirectory
 * @param pathType - The type of storage path ('stories', 'library', or 'mocks')
 * @param subDir - The subdirectory within the storage path (or empty string for base directory)
 * @returns Array of file names in the subdirectory
 */
export async function getStorageFiles(
  pathType: keyof typeof STORAGE_PATHS.development,
  subDir: string
): Promise<string[]> {
  const basePath = getStoragePath(pathType);
  const dirPath = subDir ? path.join(basePath, subDir) : basePath;

  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Directory doesn't exist, create it
      await ensureDirExists(dirPath);
      // Return empty array as the directory was just created
      return [];
    }
    throw error;
  }
}

/**
 * Ensures a storage directory exists before performing file operations
 * @param pathType - The type of storage path ('stories', 'library', or 'mocks')
 * @returns The full path to the created directory
 */
export async function ensureStorageDirectory(dirPath: string): Promise<string> {
  try {
    await ensureDirExists(dirPath);
    return dirPath;
  } catch (error) {
    console.error(`Failed to ensure directory exists ${dirPath}:`, error);
    throw error;
  }
}

/**
 * Gets the path to a file within a specific storage path type
 * @param pathType - The type of storage path ('stories', 'library', etc.)
 * @param subPath - The subpath within the storage path
 * @returns The full path to the file
 */
export function getStorageFilePath(
  pathType: keyof typeof STORAGE_PATHS.development,
  subPath: string
): string {
  const basePath = getStoragePath(pathType);
  return path.join(basePath, subPath);
}

/**
 * Lists all files in a subdirectory of a storage path
 * @param pathType - The type of storage path ('stories', 'library', or 'mocks')
 * @param subDir - The subdirectory within the storage path (or empty string for base directory)
 * @param filter - Optional filter function to apply to filenames
 * @returns Array of file names in the subdirectory
 */
export async function listStorageSubdirFiles(
  pathType: keyof typeof STORAGE_PATHS.development,
  subDir: string,
  filter?: (filename: string) => boolean
): Promise<string[]> {
  const basePath = getStoragePath(pathType);
  const dirPath = subDir ? path.join(basePath, subDir) : basePath;

  try {
    const files = await fs.readdir(dirPath);
    return filter ? files.filter(filter) : files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Directory doesn't exist, create it
      await ensureDirExists(dirPath);
      // Return empty array as the directory was just created
      return [];
    }
    throw error;
  }
}

/**
 * Checks if a file exists in storage
 * @param pathType - The type of storage path ('stories', 'library', or 'mocks')
 * @param subPath - The subpath within the storage path
 * @returns Boolean indicating if the file exists
 */
export function storageFileExists(
  pathType: keyof typeof STORAGE_PATHS.development,
  subPath: string
): boolean {
  const filePath = getStorageFilePath(pathType, subPath);
  return fsSync.existsSync(filePath);
}

/**
 * Filters files by extension
 * @param extensions - Array of file extensions to include (with dot, e.g. ['.jppg', '.png'])
 * @returns A filter function that can be passed to listStorageSubdirFiles
 */
export function filterByExtension(
  extensions: string[]
): (filename: string) => boolean {
  return (filename: string) => {
    const ext = path.extname(filename).toLowerCase();
    return extensions.includes(ext);
  };
}

/**
 * Extracts files from a zip archive to a target directory
 * @param zipPath - Path to the zip file
 * @param targetDir - Directory to extract files to
 * @returns Array of extracted file paths relative to the target directory
 */
export async function extractZip(
  zipPath: string,
  targetDir: string
): Promise<string[]> {
  const extractedFiles: string[] = [];
  const zipBuffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(zipBuffer);

  // Process zip entries
  const zipEntries = Object.keys(zip.files);

  for (const entryPath of zipEntries) {
    const entry = zip.files[entryPath];

    // Skip directories
    if (entry.dir) continue;

    // Security check to prevent directory traversal
    if (entryPath.includes("..")) {
      throw new Error(`Invalid path in zip: ${entryPath}`);
    }

    // Get file buffer
    const content = await entry.async("nodebuffer");

    // Create directory structure if needed
    const filePath = path.join(targetDir, entryPath);
    const fileDir = path.dirname(filePath);

    if (!fsSync.existsSync(fileDir)) {
      await fs.mkdir(fileDir, { recursive: true });
    }

    // Write file
    await fs.writeFile(filePath, content);
    extractedFiles.push(entryPath);
  }

  return extractedFiles;
}

/**
 * Creates a zip archive of a directory
 * @param sourceDir - Directory to create a zip archive from
 * @param zipPath - Path to save the zip file (if not provided, returns buffer)
 * @param baseInZipPath - Base path within the zip archive
 * @returns Buffer containing the zip file
 */
export async function createZipFromDirectory(
  sourceDir: string,
  baseInZipPath: string = ""
): Promise<Buffer> {
  const zip = new JSZip();
  await addDirectoryToZip(sourceDir, baseInZipPath, zip);
  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Adds a directory to a zip archive recursively
 * @param sourceDir - Source directory to add
 * @param zipPath - Path within the zip archive
 * @param zip - JSZip instance
 */
export async function addDirectoryToZip(
  sourceDir: string,
  zipPath: string,
  zip: JSZip
): Promise<void> {
  if (!fsSync.existsSync(sourceDir)) {
    return;
  }

  const entries = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const entryPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Recursively process subdirectory
      await addDirectoryToZip(sourcePath, entryPath, zip);
    } else {
      // Add file to zip
      const fileData = await fs.readFile(sourcePath);
      zip.file(entryPath, fileData);
    }
  }
}

/**
 * Loads image files from a template's images directory
 * @param templateId - The template ID
 * @returns Array of objects with image information
 */
export function loadTemplateImages(templateId: string): Array<ImageStoryState> {
  try {
    // Get the template directory
    const templateDir = path.join(
      getStoragePath("templates"),
      templateId,
      "images"
    );
    const imageExtensions = [".jpeg", ".png"];

    // Check if directory exists
    if (!fsSync.existsSync(templateDir)) {
      console.log(`Template images directory not found: ${templateDir}`);
      return [];
    }

    // Get files from directory
    const files = fsSync
      .readdirSync(templateDir)
      .filter((file) =>
        imageExtensions.includes(path.extname(file).toLowerCase())
      );

    // Map files to image objects
    const images = files.map(
      (file) =>
        ({
          id: path.parse(file).name, // Use filename without extension as ID
          source: "template" as const,
          description: "",
        } as ImageStoryState)
    );

    console.log(`Loaded ${images.length} images from template ${templateId}`);
    return images;
  } catch (error) {
    console.error("Error loading template images:", error);
    return []; // Return empty array if there's an error
  }
}

/**
 * Loads image files from a story's images directory
 * @param storyId - The story ID
 * @returns Array of objects with image information
 */
export function loadStoryImages(storyId: string): Array<ImageStoryState> {
  try {
    // Get the story images directory
    const imagesDir = getStoryImagesDirectoryPath(storyId);
    const imageExtensions = [".jpeg", ".jpg", ".png"];

    // Check if directory exists
    if (!fsSync.existsSync(imagesDir)) {
      console.log(`Story images directory not found: ${imagesDir}`);
      return [];
    }

    // Get files from directory
    const files = fsSync
      .readdirSync(imagesDir)
      .filter((file) =>
        imageExtensions.includes(path.extname(file).toLowerCase())
      );

    // Map files to image objects
    const images = files.map(
      (file) =>
        ({
          id: path.parse(file).name, // Use filename without extension as ID
          source: "story" as const,
          description: "",
        } as ImageStoryState)
    );

    console.log(`Loaded ${images.length} images from story ${storyId}`);
    return images;
  } catch (error) {
    console.error("Error loading story images:", error);
    return []; // Return empty array if there's an error
  }
}
