/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WS_PORT?: string
  readonly VITE_WS_SERVER_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_ANTHROPIC_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Extend the global ImportMeta to ensure TypeScript recognizes it
declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}
