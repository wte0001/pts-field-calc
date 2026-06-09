import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// IMPORTANT FOR GITHUB PAGES:
// Set `base` to '/<your-repo-name>/' before building for GitHub Pages.
// Example: if your repo is github.com/yourname/pts-field-calc,
// then base must be '/pts-field-calc/'.
// For local development this value is ignored by `npm run dev`.
const BASE = '/pts-field-calc/'

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'PTS Field Calc',
        short_name: 'PTS Field Calc',
        description: 'NEC field reference calculator: wire size, motor FLC, conduit fill, cable tray fill. Reference tool only.',
        theme_color: '#0b2545',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}']
      }
    })
  ],
  test: {
    environment: 'node'
  }
})
