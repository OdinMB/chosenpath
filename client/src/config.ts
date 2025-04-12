import { API_CONFIG, isDevelopment } from "@core/config";

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
} as const;
