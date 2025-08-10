// Meta test to verify Jest setup is working correctly
import { jest, describe, test, expect } from '@jest/globals';
// Test import from source file that uses path aliases
import { isDevelopment } from '../../src/config.js';

describe('Jest Setup Verification', () => {
  test('Jest is properly configured', () => {
    expect(jest).toBeDefined();
    expect(typeof jest.fn).toBe('function');
  });

  test('TypeScript compilation works', () => {
    interface TestInterface {
      name: string;
      value: number;
    }

    const testObject: TestInterface = {
      name: 'test',
      value: 42,
    };

    expect(testObject.name).toBe('test');
    expect(testObject.value).toBe(42);
  });

  test('Environment variables are set', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.OPENAI_API_KEY).toBe('test-key-123');
    expect(process.env.DB_DATABASE).toBe('chosenpath_test');
  });

  test('Async/await works', async () => {
    const asyncFunction = async (value: string): Promise<string> => {
      return new Promise((resolve) => {
        setTimeout(() => resolve(`processed-${value}`), 10);
      });
    };

    const result = await asyncFunction('test');
    expect(result).toBe('processed-test');
  });

  test('Mocking works', () => {
    const mockFunction = jest.fn().mockReturnValue('mocked-value');
    
    expect(mockFunction()).toBe('mocked-value');
    expect(mockFunction).toHaveBeenCalledTimes(1);
  });

  test('Path alias resolution works', () => {
    // This tests that we can import from a source file that uses core/* path aliases
    expect(typeof isDevelopment).toBe('boolean');
    // In test environment, NODE_ENV should be 'test', so isDevelopment should be false
    expect(isDevelopment).toBe(false);
  });
});