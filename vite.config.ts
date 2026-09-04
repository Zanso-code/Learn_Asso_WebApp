import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

/**
 * En-tetes de securite — construits a partir de l'environnement, jamais ecrits
 * en dur.
 *
 * La CSP citait l'hote Supabase en dur dans index.html alors que l'URL reelle
 * vient de VITE_SUPABASE_URL. Un deploiement vers un autre projet bloquait donc
 * SILENCIEUSEMENT tous les appels reseau : le navigateur refuse la requete sans
 * que l'application ne voie autre chose qu'une panne. Le README avertissait ;
 * l'avertissement ne suffit pas, la generation supprime la classe entiere.
 *
 * Deux directives ne peuvent PAS voyager dans une balise <meta> — le navigateur
 * les ignore et se contente d'une erreur en console : `frame-ancestors` et
 * `Strict-Transport-Security`. D'ou le fichier `_headers`, lu par Netlify et
 * Cloudflare Pages. Les autres hebergeurs trouveront le bloc equivalent dans le
 * README ; servir TOUTE la politique en en-tete et retirer la balise reste le
 * mieux.
 */
function securityHeaders(supabaseUrl: string): Plugin {
  // `connect-src` doit citer l'hote en HTTPS et en WSS (canal temps reel).
  let origin = ''
  try {
    origin = new URL(supabaseUrl).origin
  } catch {
    /* URL absente ou invalide : ConfigError prend le relais au demarrage */
  }
  const supabase = origin ? `${origin} ${origin.replace(/^https:/, 'wss:')}` : ''

  // `'unsafe-inline'` sur style-src est exige par Tailwind ; script-src, lui,
  // reste strict — c'est celui qui compte. `img-src data: blob:` est
  // indispensable : logos et recus sont des data URL.
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ]

  const meta = directives.join('; ')
  // La version en-tete ajoute ce que la balise ne peut pas porter.
  const header = [...directives, "frame-ancestors 'none'"].join('; ')

  return {
    name: 'assocaisse-security-headers',

    transformIndexHtml(html) {
      return html.replace('__CSP__', meta)
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: [
          '/*',
          `  Content-Security-Policy: ${header}`,
          '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
          '  X-Content-Type-Options: nosniff',
          '  X-Frame-Options: DENY',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  Permissions-Policy: camera=(self), geolocation=(), microphone=(), payment=(), interest-cohort=()',
          '  Cross-Origin-Opener-Policy: same-origin',
          '',
        ].join('\n'),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Les variables ne sont pas encore injectees dans `process.env` a ce stade :
  // `loadEnv` lit .env.local comme le fera le remplacement de compilation.
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [
      react(),
      tailwindcss(),
      securityHeaders(env.VITE_SUPABASE_URL ?? ''),
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
  }
})
