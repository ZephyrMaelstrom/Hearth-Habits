/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHANNEL?: 'main' | 'preview';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
