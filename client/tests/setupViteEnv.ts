// Mock import.meta.env for Jest
interface GlobalWithImport extends Global {
  import: {
    meta: {
      env: Record<string, string | boolean>;
    };
  };
}

(global as unknown as GlobalWithImport).import = {
  meta: {
    env: {
      VITE_WS_PORT: '3000',
      VITE_ANTHROPIC_API_KEY: '',
      MODE: 'test',
      DEV: false,
      PROD: false,
      SSR: false
    }
  }
};