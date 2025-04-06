import path from "path";
import { STORAGE_PATHS } from "shared/config.js";
import fs from "fs/promises";

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
