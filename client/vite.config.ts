import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Phase 8a — allow the @psynote/client-portal package (now living in
      // packages/client-portal) to import back into the main client via
      // `@client/*`. This is a Phase 8a-only coupling; Phase 8b will sever
      // it when the portal becomes independently deployable.
      '@client': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
