// Mock database for unit tests
import { jest } from '@jest/globals';

const mockQuery = jest.fn<(query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>().mockResolvedValue({ rows: [] });

export const getDb = jest.fn().mockReturnValue({
  query: mockQuery,
});

export const initializeDatabase = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

export const closeDatabase = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

// Export the mock query function so tests can access it
export { mockQuery };