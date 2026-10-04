import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { spellDictionaries } from './scripts/spell-dictionaries.mjs'

// draw.io shape libraries (scripts/build-diagram-libs.mjs): only the catalog is
// precached; a library is cached the first time it is used.
const libsCatalog = 'public/diagram-libs/catalog.json'
// Cache name per build of the libraries (the app deletes the others).
const libsBuild = existsSync('public/diagram-libs/.version') ? readFileSync('public/diagram-libs/.version', 'utf8').trim() : 'none'
const libsRevision = existsSync(libsCatalog) ? createHash('sha256').update(readFileSync(libsCatalog)).digest('hex').slice(0, 16) : null

// The script directives of the recommended Content-Security-Policy
// (deploy/nginx) also travel in the built page, for hosts that send no headers
// (GitHub Pages, a plain web server): no inline scripts or event handlers from
// shared content. Network and image rules stay with the server's header, where
// a school adapts them (its own http servers, for example).
const cspHeader = /Content-Security-Policy "([^"]+)"/.exec(readFileSync('deploy/nginx/ofimeo-headers.inc', 'utf8'))![1]
const cspMeta = cspHeader.split(';').map((d) => d.trim()).filter((d) => /^(script-src|object-src|base-uri) /.test(d)).join('; ')

// Relative base so the build can be served from any static host or subpath.
export default defineConfig({
  base: './',
  // The spelling worker loads Harper (English grammar) with a dynamic import.
  worker: { format: 'es' },
  // Harper finds its WebAssembly file next to its module (new URL(…, import.meta.url)).
  optimizeDeps: { exclude: ['harper.js'] },
  plugins: [
    // Production pages carry the CSP (the dev server needs inline scripts).
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml: (html: string) => html.replace(/<meta charset="UTF-8" \/>/i, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${cspMeta}" />`),
    },
    // Spelling dictionaries as separate files, cached the first time a language is used.
    spellDictionaries(),
    // Installable web app that works offline. The suite and every app are
    // precached; CJK handwriting fonts are cached the first time they are used.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Ofimeo',
        short_name: 'Ofimeo',
        description: 'Ofimeo: collaborative office suite that runs in your browser: documents, spreadsheets, drawings, diagrams, presentations, forms and PDFs.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1a73e8',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // Installed app: right-click or long-press the icon to start a document.
        shortcuts: [
          ['New document', 'writer'],
          ['New spreadsheet', 'sheet'],
          ['New drawing', 'draw'],
          ['New diagram', 'diagram'],
          ['New presentation', 'slides'],
          ['New form', 'forms'],
          ['Annotate a PDF', 'pdf'],
          ['New notebook', 'notebook'],
        ].map(([name, type]) => ({ name, url: `./#new=${type}` })),
        file_handlers: [
          {
            action: './',
            // Formats the apps open (registry.ts accept), without generic ones (.txt, .html, .xml, .zip).
            accept: {
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
              'application/vnd.oasis.opendocument.text': ['.odt'],
              'application/msword': ['.doc'],
              'application/rtf': ['.rtf'],
              'text/markdown': ['.md', '.markdown'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
              'application/vnd.ms-excel': ['.xls'],
              'text/csv': ['.csv'],
              'text/tab-separated-values': ['.tsv'],
              'application/vnd.jgraph.mxfile': ['.drawio'],
              'application/vnd.ms-visio.drawing': ['.vsdx'],
              'application/json': ['.excalidraw', '.oform'],
              'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
              'application/vnd.oasis.opendocument.presentation': ['.odp'],
              'application/vnd.ms-powerpoint': ['.ppt'],
              'application/pdf': ['.pdf'],
            },
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png,ico,webmanifest}', 'pdfjs/standard_fonts/*'],
        globIgnores: ['excalidraw/fonts/Xiaolai/**', 'diagram-libs/**'],
        additionalManifestEntries: libsRevision ? [{ url: 'diagram-libs/catalog.json', revision: libsRevision }] : [],
        // The spreadsheet engine is a single large chunk.
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Take control right away, so the first visit already works offline afterwards.
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.includes('/pdfjs/cmaps/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pdf-cmaps', cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 32 } },
          },
          {
            // School configuration (src/core/school-config.ts) and its files (logo): replaced
            // on the server after the build, so not precached; the last copy is used offline.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && (url.pathname.endsWith('/ofimeo.config.json') || url.pathname.includes('/school/')),
            handler: 'NetworkFirst',
            options: { cacheName: 'school-config', networkTimeoutSeconds: 3, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/excalidraw/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'excalidraw-fonts', cacheableResponse: { statuses: [0, 200] } },
          },
          {
            // Spelling dictionaries (content-hashed names) and Harper's WebAssembly (English grammar).
            urlPattern: ({ url }) => url.pathname.includes('/dictionaries/') || /\/harper_wasm[^/]*\.wasm$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'spelling', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 24 } },
          },
          {
            // Stencils, shape code, palettes and images; the files of a draw.io release never change.
            urlPattern: ({ url }) => url.pathname.includes('/diagram-libs/') && !url.pathname.endsWith('/catalog.json'),
            handler: 'CacheFirst',
            options: { cacheName: `diagram-libs-${libsBuild}`, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
})
