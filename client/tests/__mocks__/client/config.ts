// Mock for client/config module
export const isDevelopment = false;

export const API_CONFIG = {
  DEFAULT_PORT: 3000,
  DEFAULT_DOMAIN: 'example.com',
  API_BASE_URL: 'http://localhost:3000'
};

export const config = {
  wsPort: '3000',
  wsServerUrl: 'http://localhost:3000',
  apiUrl: 'http://localhost:3000',
  getFullApiUrl: () => 'http://localhost:3000'
};