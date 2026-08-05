import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
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
