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
```bash
# Client linting
cd client && npm run lint

# Client unit tests
cd client && npm test

# Run specific test files
cd client && npm test -- --testPathPatterns=myTest.test.ts

# Server development with hot reload
cd server && npm run dev

# Preview client build
cd client && npm run preview
```

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

### Render Configuration
- **Root Directory**: Set to `server/` for server deployment, `client/` for client deployment
- **Build commands work**: Despite isolation, builds succeed because core gets copied/bundled during compilation
- **Workspace dependency resolution**: Works through TypeScript path mapping and build-time bundling

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

## Testing Approach

- **Server**: Mocha + Chai for API testing (see package.json scripts)
- **Client**: Jest for unit testing, ESLint for code quality, built-in React error boundaries
- **Integration**: Manual testing of WebSocket flows and AI integrations

### Unit Testing Setup (Client)
```bash
# Run all tests
cd client && npm test

# Run tests for specific file
cd client && npm test -- --testPathPatterns=fileName.test.ts

# Run tests in watch mode
cd client && npm test -- --watch
```

**Test Configuration:**
- **Framework**: Jest with TypeScript support via `jest.config.js`
- **Location**: Tests located in `/client/tests/` directory
- **Import Pattern**: Tests use relative paths like `../../../src/path/to/module.js` (Jest moduleNameMapper configured but aliases not yet working)
- **File Extensions**: **IMPORTANT**: All test imports must use `.js` extensions (e.g., `'../../../src/game/utils/module.js'`) due to Node16/NodeNext module resolution
- **File Naming**: Use `.test.ts` suffix for test files
- **Jest Module Mapping**: Module mappers configured for `components`, `client`, `shared`, `core`, `admin`, `game`, `page`, `users`, `resources` (requires further debugging to work with ts-jest)

## Environment Setup

### Required Environment Variables
```bash
# Server (.env)
OPENAI_API_KEY=your_key_here
PORT=3000
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development

# Client (.env)  
VITE_WS_PORT=3000
```

### Development Flow
1. Start from root: `npm run dev`
2. Client runs on http://localhost:5173
3. Server runs on http://localhost:3000
4. Core builds automatically before server/client start

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
- **Tests**: Currently use relative paths with `.js` extensions (e.g., `'../../../src/game/utils/module.js'`) due to Node16/NodeNext module resolution requirements
- **File Extensions**: When importing TypeScript files in tests, always use `.js` extensions in import paths, not `.ts`

### Content Management
- Lecture pages must stay synchronized with `/client/public/sitemap.xml`

### Quality Assurance
- **CRITICAL**: Before considering any task complete, ALWAYS run linting commands and fix all issues:
  - Client linting: `cd client && npm run lint`
  - Fix all TypeScript errors, ESLint warnings, and other linting issues
  - Tasks are not complete until all linting passes successfully

### Lint Configuration & Common Issues
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