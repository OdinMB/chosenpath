# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build Commands

```bash
npm run build   # Build all workspaces from root. Do NOT use this for lint/TS/test checks
npm run dev     # Development mode (builds core, then runs server + client). Do NOT use this for checks.
```

### Testing and Quality

```bash
npm run check:all   # Comprehensive check: build + lint + tests. Run in root (your default working directory) for client+server checks, or in `client` or `server` directory for more targeted checks.
npm run lint        # ESLint + TypeScript on all source files
npm run test:all    # Tests + test linting
```

See `/.cursor/rules/testing.mdc` for detailed testing commands and patterns.

### Quick Code Review

AFTER making code changes, run a quick validation:

1. **Run checks** - Check for ESLint / TS / test issues. When in doubt, use check:all in the `client` or `server` directory, or in root to check both.
2. **Verify functionality** - Test the specific feature/fix you implemented
3. **Check for obvious issues** - Review your changes for common problems

### Comprehensive Code Review

Invoke the `code-reviewer` subagent for thorough code validation when:

- Completing significant features or refactoring
- Before finalizing PRs/tasks with substantial code changes
- Needing systematic review of architecture, security, and maintainability

Take project-specific requirements into account: `.cursor/rules/testing.mdc`.

### Quick Visual Check

IMMEDIATELY after implementing any front-end change:

1. **Identify what changed** - Review the modified components/pages
2. **Navigate to affected pages** - Use `mcp__playwright__browser_navigate` to visit each changed view
3. **Verify design compliance** - Compare against `/.cursor/rules/design-principles.md` and `/.cursor/rules/style-guide.md`
4. **Validate feature implementation** - Ensure the change fulfills the user's specific request
5. **Check acceptance criteria** - Review any provided context files or requirements
6. **Capture evidence** - Take full page screenshot at desktop viewport (1440px) of each changed view
7. **Check for errors** - Run `mcp__playwright__browser_console_messages`

The site is available at http://localhost:5173/.
To login, use username 'claude@localdevelopment.com' and password 'asdF!234'.

### Comprehensive Design Review

Invoke the `design-reviewer` subagent for thorough design validation when:

- Completing significant UI/UX features
- Before finalizing PRs/tasks with visual changes
- Needing comprehensive accessibility and responsiveness testing

### Content Management

- Lecture pages must stay synchronized with `/client/public/sitemap.xml`
- Update `/client/src/page/static/Privacy.tsx` whenever any tools or practices change that need to be disclosed to users

### Tests

1. Important functions and classes must have corresponding unit tests
2. Integration tests should be added for complex workflows involving multiple components

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

## Important File Locations

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

## Additional context information

- `/.cursor/rules/folder-structure.mdc` - More details about the folder structure of the repo
- `/.cursor/rules/deployment.mdc` - Deployment, Workspace Dependencies, Install commands
- `/.cursor/rules/api.mdc` - API flows between client and server (with end-to-end instructions)
- `/.cursor/rules/storage.mdc` - Database schemas and file storage system
- `/.cursor/rules/testing.mdc` - Unit and integration tests, commands for checking for ESLint and TypeScript issues
- `/.cursor/rules/design-principles.mdc` - Design principles for frontend
- `/.cursor/rules/ui.mdc` - Style guide
- `/.cursor/rules/story.mdc` - Story state and Story model classes
- `/.cursor/rules/image-generation.mdc` - Image generation flows
- `/.cursor/rules/pregenerations.mdc` - Flows for pregenerating possible future story states (to reduce wait times for users)
- `/.cursor/rules/security.mdc` - Security layers and components
