import express from "express";
import { createServer } from "http";
import cors from "cors";
import { GameWebSocketServer } from "./websocket/index.js";
import { config } from "./config.js";

const app = express();
app.use(cors());

const server = createServer(app);
const wss = new GameWebSocketServer(server);

// Graceful shutdown handler
function shutdown() {
  console.log('\nShutting down gracefully...');
  
  // Close WebSocket server first
  wss.close(() => {
    console.log('WebSocket server closed');
    
    // Then close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);
}

// Handle different termination signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(config.port, () => {
  console.log(`WebSocket server ready on ws://localhost:${config.port}`);
});
