import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const appName = (
    process.env.APP_NAME?.trim() ||
    process.env.VITE_APP_NAME?.trim() ||
    process.env.APP_TITLE?.trim() ||
    'ScribeNode — AI Speech & Transcript Engine'
  );

  const appShortName = (
    process.env.APP_SHORT_NAME?.trim() ||
    process.env.VITE_APP_SHORT_NAME?.trim() ||
    appName.split(/[-—–:]/)[0]?.trim() ||
    'ScribeNode'
  );

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.svg',
          'pwa-icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png'
        ],
        manifest: {
          name: appName,
          short_name: appShortName,
          description: 'High-fidelity audio transcription, speaker diarization, and multimodal speech intelligence engine powered by Gemini.',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'any',
          scope: '/',
          start_url: '/',
          categories: ['productivity', 'utilities', 'audio', 'business'],
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            },
            {
              src: '/pwa-icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/health/],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^\/api\//,
              handler: 'NetworkOnly'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
