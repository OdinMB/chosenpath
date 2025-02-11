import { createServer } from "http";
import { config } from "./config/env.js";
import { createApp } from "./app.js";
import { GameWebSocketServer } from "./websocket/index.js";

const app = createApp();
const server = createServer(app);
const wss = new GameWebSocketServer(server);

export { wss };

server.listen(config.port, () => {
  console.log(
    `🚀 Server running in ${config.nodeEnv} mode on port ${config.port}`
  );
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Closing server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
