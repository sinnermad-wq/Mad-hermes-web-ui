import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative base for portable builds (works with any mount path)
  base: './',
  build: {
    // Ensure assets are relative for SPA routing
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // Keep filenames clean for Vite hash-based cache busting
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  // SPA fallback: all routes → index.html
  // (Vite preview/serve handles this automatically with --single flag)
})