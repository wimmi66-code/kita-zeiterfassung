/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Pfad auf GitHub Pages: https://<name>.github.io/<repo>/
const base = process.env.VITE_BASE ?? '/kita-zeiterfassung/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kita-Zeiterfassung',
        short_name: 'Zeiten',
        lang: 'de',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2f6f4f',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      // Keine API-Antworten cachen: Zeitdaten kommen immer frisch aus Supabase.
      workbox: {
        navigateFallback: `${base}index.html`,
        runtimeCaching: [],
        // Export-Bibliotheken nur bei Bedarf laden, nicht vorab auf das Handy
        globIgnores: ['**/exceljs*.js', '**/jspdf*.js', '**/html2canvas*.js', '**/purify*.js', '**/index.es-*.js'],
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});
