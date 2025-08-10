# Server Testing Setup

This directory contains the Jest testing infrastructure for the server part of the application.

## Setup Complete ✅

The following components have been configured and tested:

### 1. Jest Configuration
- **File**: `jest.config.js`
- **Features**: TypeScript support, ESM modules, proper module mapping
- **Test Environment**: Node.js with custom environment variables

### 2. Test Scripts
Available npm scripts in `package.json` (identical to client):
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:unit` - Run only unit tests
- `npm run test:integration` - Run only integration tests
- `npm run test:lint` - ESLint + TypeScript on test files
- `npm run test:all` - All tests + test linting
- `npm run check:all` - Complete quality check (lint + test:all)

### 3. Test Directory Structure
```
tests/
├── setup.ts              # Global test configuration
├── unit/                  # Unit tests
├── integration/           # Integration tests
├── __mocks__/            # Mock implementations
└── helpers/              # Test helper utilities
```

### 4. Working Tests
- ✅ **setup.test.ts** - Verifies Jest configuration
- ✅ **simple.test.ts** - Basic functionality tests

### 5. Mock Framework
Basic mocks are available in `tests/__mocks__/`:
- Database operations (`shared/db.ts`)
- File system operations (`shared/storageUtils.ts`)
- AI Story Generator (`game/services/AIStoryGenerator.ts`)

### 6. Test Utilities
Helper functions for creating test data are available in `tests/helpers/testHelpers.ts`.

## Usage

### Running Tests
```bash
# Run all tests
cd server && npm test

# Run specific test file
cd server && npm test simple.test.ts

# Run with coverage
cd server && npm run test:coverage

# Run in watch mode
cd server && npm run test:watch
```

### Writing Tests
```typescript
// Example test file
import { describe, test, expect } from '@jest/globals';

describe('My Feature', () => {
  test('should work correctly', () => {
    expect(1 + 1).toBe(2);
  });
});
```

## Test Environment Parity

Both server and client now have **identical** testing infrastructure:

### ✅ Matching Features
- **Commands**: Same npm scripts (`check:all`, `test:all`, `test:lint`)
- **Structure**: Same directory organization (`unit/`, `integration/`, `__mocks__/`, `helpers/`)
- **TypeScript**: Full type checking on both source and test files
- **ESLint**: Comprehensive linting on test files
- **Path Aliases**: Both support workspace-specific path mapping

### ✅ Quality Assurance
- Server: `cd server && npm run check:all` - All checks pass
- Client: `cd client && npm run check:all` - All checks pass
- **Zero configuration drift** between environments

The foundation is solid and ready for development!