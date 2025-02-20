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
cd ai-story-game
npm run install:all
```

2. Create environment files

Create `.env` in the server directory:

```
OPENAI_API_KEY=your_openai_api_key
PORT=3000
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

Create `.env` in the client directory:

```
VITE_WS_PORT=3000
```

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
     - Environment Variables:
       ```
       OPENAI_API_KEY=your_openai_api_key
       PORT=3000
       CORS_ORIGIN=https://your-frontend-url.onrender.com
       NODE_ENV=production
       ```

2. Create a Static Site for the Frontend
   - Click "New +" and select "Static Site"
   - Connect your GitHub repository
   - Configure:
     - Name: `ai-story-game-client`
     - Root Directory: `client`
     - Build Command: `npm install && npm run build`
     - Publish Directory: `dist`
     - Environment Variables:
       ```
       VITE_WS_PORT=443
       ```

Your application will be accessible through the Render-provided URLs once deployment is complete.
