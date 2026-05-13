import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Same codebase serves two hosts:
//   - GitHub Pages (subpath):  https://boozelee.github.io/dj-nef-website/
//   - Vercel       (root):     https://djnefke.vercel.app/
// Vercel sets process.env.VERCEL=1 in its build env.
export default defineConfig({
  base: process.env.VERCEL ? '/' : '/dj-nef-website/',
  plugins: [react()],
})
