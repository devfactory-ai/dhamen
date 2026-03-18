/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_API_URL_DEV: string;
  readonly VITE_API_URL_STAGING: string;
  readonly VITE_API_URL_PROD: string;
  readonly VITE_ENV: 'local' | 'dev' | 'staging' | 'prod';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
