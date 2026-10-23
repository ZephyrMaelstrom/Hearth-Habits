import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const preview = process.env.VITE_CHANNEL === 'preview';

/** Labels the preview build so it can't be mistaken for the main app once installed. */
function previewLabel(): Plugin {
  return {
    name: 'hearth-preview-label',
    apply: 'build',
    transformIndexHtml: (html) => (preview ? html.replace('<title>Hearth &amp; Habits</title>', '<title>Hearth &amp; Habits Preview</title>') : html),
    closeBundle() {
      if (!preview) return;
      const file = resolve('dist/manifest.webmanifest');
      if (!existsSync(file)) return;
      const m = JSON.parse(readFileSync(file, 'utf8'));
      m.name = 'Hearth & Habits Preview';
      m.short_name = 'Hearth Preview';
      writeFileSync(file, JSON.stringify(m, null, 2));
    },
  };
}

// base './' keeps every asset path relative, so the build works on GitHub Pages
// under /Hearth-Habits/ (and /Hearth-Habits/preview/) without changes.
export default defineConfig({
  base: './',
  plugins: [react(), previewLabel()],
  // the Firestore chunk is large but loads only when sync is configured
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
