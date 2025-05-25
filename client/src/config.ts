import { getApiConfig } from "core/config.js";

// Environment detection
export const isDevelopment =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");

export const API_CONFIG = getApiConfig(isDevelopment);

export const config = {
  wsPort: import.meta.env.VITE_WS_PORT || API_CONFIG.DEFAULT_PORT.toString(),
  wsServerUrl:
    import.meta.env.VITE_WS_SERVER_URL ||
    (isDevelopment
      ? `http://localhost:${API_CONFIG.DEFAULT_PORT}`
      : `https://api.${API_CONFIG.DEFAULT_DOMAIN}`),
  apiUrl:
    import.meta.env.VITE_API_URL ||
    (isDevelopment
      ? `http://localhost:${API_CONFIG.DEFAULT_PORT}`
      : `https://api.${API_CONFIG.DEFAULT_DOMAIN}`),
  discordUrl: "https://discord.gg/AbKqHCEXUS",
} as const;
