/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The default sweetalert2 build injects its CSS at runtime (blocked by our CSP).
    // Use the plain ESM build and bundle its stylesheet instead (see lib/alerts.ts).
    alias: [{ find: /^sweetalert2$/, replacement: 'sweetalert2/dist/sweetalert2.esm.js' }],
  },
  server: { port: 5173, strictPort: true }, // must match the CORS origin http://localhost:5173
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    env: { VITE_API_URL: 'http://api.test', VITE_STAGE: 'test' },
    css: false,
    testTimeout: 10000,
  },
});
