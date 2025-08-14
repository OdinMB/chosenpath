# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build Commands

```bash
# Build all workspaces from root
npm run build

# Build individual workspaces
npm run build:core
npm run build:server
npm run build:client

# Development mode (builds core, then runs server + client)
npm run dev
```

### Testing and Quality

Run ALL checks with one command:

```bash
cd client && npm run check:all
cd server && npm run check:all
```

Runs

1. ESLint on all source files
2. TypeScript compilation check on all files
3. Jest unit tests
4. ESLint on test files
5. TypeScript compilation check on test files

### Installation

```bash
# Install all workspace dependencies
npm run install:all

# Individual workspace installs
npm run install:core
npm run install:server
npm run install:client
```

## Architecture Overview

This is a **monorepo** containing an AI-powered multiplayer interactive fiction game with three workspaces:

### Core (`/core`)

Shared TypeScript library containing:

- **Types**: Complete type definitions for stories, players, beats, outcomes, etc.
- **Models**: Domain models (`Story.ts`, `PlayerManager.ts`, `ThreadManager.ts`, etc.)
- **Utils**: Shared utilities for date handling, difficulty calculation, template processing

### Server (`/server`)

Express.js backend with:

- **WebSocket**: Real-time game orchestration via Socket.IO
- **HTTP API**: REST endpoints for CRUD operations
- **AI Integration**: LangChain with OpenAI/Anthropic/Google providers
- **Storage**: PostgreSQL for users/metadata, JSON files for stories/templates
- **Authentication**: JWT with role-based access (user/admin)

### Client (`/client`)

React SPA with:

- **Game Interface**: Real-time multiplayer gameplay UI
- **Page System**: Public pages, library browser, template configurator
- **User System**: Authentication, account management, story archives
- **Admin Interface**: Story/template/user management

## Key Technologies

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router
- **Backend**: Express.js, Socket.IO, PostgreSQL, JWT authentication
- **AI**: LangChain, OpenAI API, image generation via AI providers
- **Validation**: Zod schemas shared between client/server
- **Build**: Workspace-based monorepo with TypeScript compilation

## Deployment & Workspace Dependencies

This monorepo deploys successfully to platforms like Render using workspace isolation:

### Production Build Process

- **Server**: TypeScript compilation resolves `core/*` imports via tsconfig paths, then copies core's built files into `server/dist/core/` making the deployment self-contained
- **Client**: Vite build process bundles core code directly into the client bundle via alias resolution
- **Individual package-lock.json files**: Not needed - workspace dependencies are managed at root level, but build processes copy/bundle core at build time

## Communication Patterns

### HTTP API (Server Port 3000)

- **Stories**: CRUD operations, admin management
- **Templates**: Library browsing, creation, configuration
- **Users**: Authentication, account management
- **Images**: AI generation and serving

### WebSocket (Real-time Game)

- **Game orchestration**: Beat progression, choice handling
- **Multiplayer sync**: Player state, chat, collaborative decisions
- **AI operations**: Story generation, image creation (queued)

## Important File Locations

### Configuration

- `/server/.env` - Server environment variables (OPENAI_API_KEY, database config)
- `/client/.env` - Client environment variables (VITE_WS_PORT)
- `/core/config.ts` - Shared configuration constants

### Game Logic

- `/core/models/Story.ts` - Central story domain model
- `/server/src/game/GameHandler.ts` - Game orchestration service
- `/client/src/game/GameService.ts` - Client-side game state management
- `/core/models/PlayerManager.ts` - Multiplayer session management

### Data Models

- `/core/types/` - Complete TypeScript definitions
- `/server/src/shared/db.ts` - Database connection and queries
- `/data/templates/` - Template JSON files and images
- `/data/stories/` - Story save files and generated images

## Development Patterns

### State Management

- **Server**: Domain models in Core with business logic
- **Client**: React Context for auth/session, local state for UI
- **Shared**: Zod schemas ensure type safety across boundaries

### Error Handling

- **HTTP**: Express middleware with structured error responses
- **WebSocket**: Connection recovery and graceful degradation
- **AI**: Retry logic and fallback content for AI service failures

### File Organization

- **Feature-based**: Grouped by domain (game/, users/, templates/, etc.)
- **Shared utilities**: Common functions in `/shared/` directories
- **Type co-location**: Related types defined near implementation

### Security

- **Authentication**: JWT tokens with secure cookie handling
- **CSRF protection**: Token-based CSRF prevention
- **Rate limiting**: API endpoints protected against abuse
- **Input validation**: Zod schemas validate all inputs

## Database Schema

### PostgreSQL Tables

- **users**: Authentication, roles, preferences
- **stories**: Metadata, sharing settings, AI generation logs
- **templates**: Public library entries, tags, ratings
- **feedback**: User feedback and content moderation

### File Storage

- **Story data**: JSON files in `/data/stories/[uuid]/`
- **Template data**: JSON files in `/data/templates/[uuid]/`
- **Images**: Generated/uploaded images organized by story/template ID

## Testing and Quality Assurance

### Directory Structure

```
tests/
├── unit/           # Unit tests for individual components
├── integration/    # Integration tests for multiple components
├── __mocks__/      # Mock implementations
└── helpers/        # Test utilities and helpers
```

### Commands

**Complete Quality Check:**

```bash
cd client && npm run check:all
cd server && npm run check:all
```

**Individual Commands (identical for both platforms):**

```bash
npm run lint        # ESLint + TypeScript on all source files
npm test            # Run Jest tests
npm run test:lint   # ESLint + TypeScript on test files
npm run test:all    # Tests + test linting
npm run check:all   # Everything above
```

**Run Specific Tests:**

```bash
npm test -- --testPathPattern=fileName.test.ts
```

### Test File Conventions

- **Naming**: Use `.test.ts` suffix for all test files
- **Location**: Both server and client use unit/integration subdirectories
- **Imports**: Use relative paths in test files (e.g., `'../../../../src/module'`)
- **Path Aliases**: Source files can use path aliases - Jest resolves them automatically
- **Mock Data**: Use existing mock story state from `/server/tests/__mocks__/game/services/AIStoryGenerator.ts` - contains `createMockStoryState()` function for consistent test data

### Task Completion Requirements

1. All new functions, methods, classes, and services MUST have corresponding unit tests
2. Integration tests should be added for complex workflows involving multiple components
3. **For comprehensive validation**: Run `npm run check:all` (server and/or client directory). Do this for new features and anything beyond trivial changes.
4. Even for small changes, run `npm run lint` to catch TypeScript and ESLint issues. **All lint warnings must be fixed**

## Development Guidelines

### Story State Management

- Use domain models (`Story.ts`, `ClientStateManager.ts`, `PlayerManager.ts`, `ThreadManager.ts`) in `/core/models/` for all StoryState manipulation
- Add new functions to these model classes rather than implementing complex state logic elsewhere
- Keep story manipulation logic centralized in these domain models

### UI Components and Styling

- UI components are in `/client/src/shared/components/` - import from `'components/ui'`
- Use `PrimaryButton` for buttons and `Modal.tsx` for modals
- All icons must be stored in and consumed via `components/ui/Icons.tsx`
- Design conventions defined in `/client/tailwind.config.js`

### API Development Pattern

- **Types**: Add request/response types in `/core/types/api.ts`
- **Client**: Use `/client/src/shared/apiClient.ts` through specialized wrappers (`templateApi`, `storiesApi`)
- **Server**: Add routes in appropriate `resourceRoutes.ts` files, implement logic in `resourceService.ts`
- **Rate Limiting**: Configure in `config.ts`, apply using `/server/src/shared/rateLimiter.ts`
- **Responses**: Use `/server/src/shared/responseUtils.ts` for typed responses

### Routing Architecture

- **URL Structure**: Feature/role-based first (`/admin/templates`, `/page/templates/:id`)
- **State Management**: Use React Router loaders for data fetching, actions for mutations
- **Authentication**: Verify auth in route loaders, redirect unauthorized users
- **Organization**: Feature-based routing in dedicated `*Routes.tsx` files
- **Error Handling**: Nested error boundaries at different route hierarchy levels

### Folder Structure

- **Client Contexts**: `/admin/`, `/game/`, `/page/`, `/users/` with directory aliases
- **Resources**: Cross-context features in `/client/src/resources/RESOURCE`
- **Shared**: Common utilities in `/client/src/shared/` and `/server/src/shared/`
- **Core**: Types and utilities shared between client/server in `/core/`

### Import Aliases

- **Client**: Use Vite aliases (`game/*`, `core/*`, `shared/*`, etc.) instead of relative paths (configured in `vite.config.ts`)
- **Server**: Use TypeScript path mapping (`core/*`, `server/*`, `shared/*`, etc.) instead of relative paths (configured in `tsconfig.json`)
- **Tests**: Use relative paths in test files (e.g., `'../../../../src/game/utils/module'`)
- **Source Files**: Can use path aliases in source files - Jest automatically resolves them

### Content Management

- Lecture pages must stay synchronized with `/client/public/sitemap.xml`
- Update `/client/src/page/static/Privacy.tsx` whenever any tools or practices change that need to be disclosed to users

### Common Linting Issues

**ESLint Rules to Watch For:**

- `@typescript-eslint/no-unused-vars` - Remove unused variables, imports, and function parameters
- **Unused imports** - Remove unused React imports (use `import { useState } from "react"` instead of `import React, { useState } from "react"` when React itself isn't used)
- `@typescript-eslint/no-explicit-any` - Avoid `any` types, use specific types instead
- `@typescript-eslint/no-unsafe-*` - Avoid unsafe operations on `any` types
- Property access errors - Use optional chaining (`?.`) or proper type guards
- Array/object method errors - Ensure arrays/objects exist before calling `.length`, `.map()`, etc.
- Missing return types on functions - Add explicit return types for exported functions

**Type Safety Patterns:**

- Use proper TypeScript types instead of `any`
- Add type guards when accessing potentially undefined properties
- Use array checks before calling `.length` or array methods
- Define proper interfaces for complex objects
- Use generic types for reusable components
- Only use @ts-ignore and @ts-expect-error after explicit consent from the user
