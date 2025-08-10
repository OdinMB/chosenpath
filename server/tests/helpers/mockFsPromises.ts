import { jest } from "@jest/globals";
// Create named jest.fn mocks first
export const readdir: jest.MockedFunction<(path: string) => Promise<string[]>> =
  jest.fn();
export const unlink: jest.MockedFunction<(path: string) => Promise<void>> =
  jest.fn();
export const readFile: jest.MockedFunction<
  (path: string, encoding?: string) => Promise<string>
> = jest.fn();
export const writeFile: jest.MockedFunction<
  (path: string, data: string) => Promise<void>
> = jest.fn();
export const access: jest.MockedFunction<(path: string) => Promise<void>> =
  jest.fn();

// Default export references the same instances, so default and named agree
const defaultExport = { readdir, unlink, readFile, writeFile, access };
export default defaultExport;
