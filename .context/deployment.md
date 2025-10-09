## Deployment & Workspace Dependencies

This monorepo deploys successfully to platforms like Render using workspace isolation:

### Production Build Process

- **Server**: TypeScript compilation resolves `core/*` imports via tsconfig paths, then copies core's built files into `server/dist/core/` making the deployment self-contained
- **Client**: Vite build process bundles core code directly into the client bundle via alias resolution
- **Individual package-lock.json files**: Not needed - workspace dependencies are managed at root level, but build processes copy/bundle core at build time

### Installation

```bash
# Install all workspace dependencies
npm run install:all

# Individual workspace installs
npm run install:core
npm run install:server
npm run install:client
```
