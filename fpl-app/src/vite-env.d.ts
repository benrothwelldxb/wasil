/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL used by the Axios API instance. */
  readonly VITE_API_BASE_URL?: string;
  /** Request timeout (ms) for outgoing API requests. */
  readonly VITE_API_TIMEOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
