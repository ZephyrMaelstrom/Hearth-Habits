import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' keeps every asset path relative, so the build works on GitHub Pages
// under /Hearth-Habits/ and on any other static host without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  // the Firestore chunk is large but loads only when sync is configured
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 700 },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
