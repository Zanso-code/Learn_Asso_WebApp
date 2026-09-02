import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Sans service worker, « fonctionne hors ligne » resterait une promesse en
    // l'air : les donnees seraient bien dans IndexedDB, mais l'application
    // elle-meme ne se chargerait pas. On precache la coquille applicative.
    //
    // Aucune mise en cache des appels Supabase : le miroir IndexedDB EST la
    // couche de donnees hors ligne, et une reponse REST perimee servie par le
    // service worker ferait reculer le curseur de synchronisation.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg', 'fonts/*.woff2'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
        // L'application est une SPA : /admin et /app/* doivent servir la
        // coquille, mais jamais intercepter les appels a l'API.
        navigateFallbackDenylist: [/^\/api/, /supabase/],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'AssoCaisse — Gestion d’association',
        short_name: 'AssoCaisse',
        description:
          "Membres, cotisations, dépenses et rapport d'Assemblée Générale, même sans réseau.",
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f8fafc',
        theme_color: '#0066ff',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
