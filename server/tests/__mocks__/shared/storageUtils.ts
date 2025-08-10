// Mock file system operations for unit tests
import { jest } from '@jest/globals';

// In-memory file system for testing
const mockFileSystem = new Map<string, string>();

export const writeStoryFile = jest.fn<(storyId: string, content: string) => Promise<void>>().mockImplementation(async (storyId: string, content: string) => {
  mockFileSystem.set(`story-${storyId}`, content);
});

export const readStoryFile = jest.fn<(storyId: string) => Promise<string>>().mockImplementation(async (storyId: string) => {
  const content = mockFileSystem.get(`story-${storyId}`);
  if (!content) {
    const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
  return content;
});

export const ensureStoryDirectoryStructure = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

export const deleteStoryDirectory = jest.fn<(storyId: string) => Promise<void>>().mockImplementation(async (storyId: string) => {
  const keys = Array.from(mockFileSystem.keys()).filter(key => key.includes(storyId));
  keys.forEach(key => mockFileSystem.delete(key));
});

export const writeStorageFile = jest.fn<(category: string, filename: string, content: string) => Promise<void>>().mockImplementation(async (category: string, filename: string, content: string) => {
  mockFileSystem.set(`${category}-${filename}`, content);
});

export const readStorageFile = jest.fn<(category: string, filename: string) => Promise<string>>().mockImplementation(async (category: string, filename: string) => {
  const content = mockFileSystem.get(`${category}-${filename}`);
  if (!content) {
    const error = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    throw error;
  }
  return content;
});

export const loadTemplateImages = jest.fn<() => string[]>().mockReturnValue([]);

// Helper for tests to access the mock file system
export const getMockFileSystem = () => mockFileSystem;
export const clearMockFileSystem = () => mockFileSystem.clear();