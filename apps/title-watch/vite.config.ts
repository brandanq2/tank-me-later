import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Different port from tank-me-later so both apps can run side by side.
  server: {
    port: 5174,
    proxy: {
      '/api/raiderio': {
        target: 'https://raider.io',
        changeOrigin: true,
        rewrite: () => '/api/v1/characters/profile',
      },
      '/api/cutoff': {
        target: 'https://raider.io',
        changeOrigin: true,
        rewrite: () => '/api/v1/mythic-plus/season-cutoffs',
      },
    },
  },
})
