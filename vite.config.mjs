import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${process.env.BACKEND_PORT || 3002}`,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
