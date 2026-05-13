import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Project GitHub Pages site: https://boozelee.github.io/dj-nef-website/
export default defineConfig({
  base: '/dj-nef-website/',
  plugins: [react()],
})
