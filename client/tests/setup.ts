// Global test setup
import { jest } from '@jest/globals';

// Make Jest globals available
import '@jest/globals';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.VITE_WS_PORT = '3000';

// Global test timeout
jest.setTimeout(10000);