# AI Interactive Fiction Writer

A multiplayer interactive fiction game powered by AI that generates unique story experiences.

## Running Locally

### Prerequisites

- Node.js (v18 or higher)
- npm (v8 or higher)
- OpenAI API key

### Local Setup

1. Clone the repository and install dependencies

```bash
git clone <repository-url>
npm run install:all
```

2. Create environment files

Create `.env` based on `.env.sample` in the server directory.

Create `.env` based on `.env.sample` in the client directory.

3. Start the development servers

```bash
npm run dev
```

This will start:

- Client at http://localhost:5173
- Server at http://localhost:3000

## Deploying to Render.com

### Prerequisites

- A Render.com account
- Repository pushed to GitHub

### Deployment Steps

1. Create a Web Service for the Backend

   - Log in to Render.com
   - Click "New +" and select "Web Service"
   - Connect your GitHub repository
   - Configure:
     - Name: `ai-story-game-server`
     - Root Directory: `server`
     - Environment: `Node`
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
     - Environment Variables as per `.env` file

2. Create a Static Site for the Frontend
   - Click "New +" and select "Static Site"
   - Connect your GitHub repository
   - Configure:
     - Name: `ai-story-game-client`
     - Root Directory: `client`
     - Build Command: `npm install && npm run build`
     - Publish Directory: `dist`
     - Environment Variables as per `.env` file

Your application will be accessible through the Render-provided URLs once deployment is complete.

Despite isolation, builds succeed because core gets copied/bundled during compilation
Workspace dependency resolution: Works through TypeScript path mapping and build-time bundling
