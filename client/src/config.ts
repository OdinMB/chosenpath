export const config = {
  wsPort: import.meta.env.VITE_WS_PORT || "3000",
  wsServerUrl:
    import.meta.env.VITE_WS_SERVER_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://api.chosenpath.ai"),
  apiUrl:
    import.meta.env.VITE_API_URL ||
    (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
      ? "http://localhost:3000"
      : "https://api.chosenpath.ai"),
} as const;
