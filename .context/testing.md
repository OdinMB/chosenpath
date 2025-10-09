### Testing Commands

**Comprehensive check from the root directory:**

```bash
npm run check:all
```

This single command from the root directory will:

1. Build the core module
2. Run ALL server checks (lint, tests, test linting)
3. Run ALL client checks (lint, tests, test linting)

Each check includes:

- ESLint on all source and test files
- TypeScript compilation check on all source and test files
- Jest unit tests

**Note:** Only use more specific commands when you need to check a very specific thing. In most cases, run the full suite with `npm run check:all` from the root.

**Individual Workspace Checks (only when needed for specific debugging):**

```bash
cd server && npm run check:all   # Server only
cd client && npm run check:all   # Client only
```

**More Granular Commands (when debugging specific issues):**

```bash
npm run lint        # ESLint + TypeScript on all source files
npm test            # Run Jest tests
npm run test:lint   # ESLint + TypeScript on test files
npm run test:all    # Tests + test linting
```

**Run Specific Tests:**

```bash
npm test -- --testPathPattern=fileName.test.ts
```

### Project-Specific Lint/TypeScript Rules

**All lint warnings and errors must be fixed.** Run `npm run check:all` after making changes to catch issues early.

Run `npm run check:all` from root to verify all checks pass, or one of the more granular commands listed below (if that's save enough). Common issues to catch:

- `@typescript-eslint/no-unused-vars` - Remove unused variables, imports, and function parameters
- **Unused imports** - Remove unused React imports (use `import { useState } from "react"` instead of `import React, { useState } from "react"` when React itself isn't used)
- `@typescript-eslint/no-explicit-any` - Avoid `any` types, use specific types instead
- `@typescript-eslint/no-unsafe-*` - Avoid unsafe operations on `any` types
- Property access errors - Use optional chaining (`?.`) or proper type guards
- Array/object method errors - Ensure arrays/objects exist before calling `.length`, `.map()`, etc.
- Missing return types on functions - Add explicit return types for exported functions
- Only use @ts-ignore and @ts-expect-error after explicit user consent

**Type Safety Patterns:**

- Use proper TypeScript types instead of `any`
- Add type guards when accessing potentially undefined properties
- Define proper interfaces for complex objects
- No "as unknown as" trickery without explicit user consent

### Directory Structure

```
tests/
├── unit/           # Unit tests for individual components
├── integration/    # Integration tests for multiple components
├── __mocks__/      # Mock implementations
└── helpers/        # Test utilities and helpers
```

### Test File Conventions

- **Naming**: Use `.test.ts` suffix for all test files
- **Location**: Both server and client use unit/integration subdirectories
- **Imports**: Use relative paths in test files (e.g., `'../../../../src/module'`)
- **Path Aliases**: Source files can use path aliases - Jest resolves them automatically
- **Mock Data**: Use existing mock story state from `/server/tests/__mocks__/game/services/AIStoryGenerator.ts` - contains `createMockStoryState()` function for consistent test data
