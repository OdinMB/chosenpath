export const config = {
  wsPort: import.meta.env.VITE_WS_PORT || "3000",
  wsServerUrl:
    import.meta.env.VITE_WS_SERVER_URL ||
    "https://ai-story-game-server.onrender.com",
} as const;
