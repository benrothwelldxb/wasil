/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'development' | 'staging' | 'production'; see src/config/env.ts. */
  readonly VITE_APP_ENV?: string;
  /** Absolute URL or '/'-rooted path; see src/config/env.ts. */
  readonly VITE_API_BASE_URL?: string;
  /** 'debug' | 'info' | 'warn' | 'error' | 'silent'; see src/config/env.ts. */
  readonly VITE_LOG_LEVEL?: string;
  /** Comma-separated flag list, '!' negates; see src/config/env.ts. */
  readonly VITE_FLAGS?: string;
  /** Free-form app version string; see src/config/env.ts. */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
