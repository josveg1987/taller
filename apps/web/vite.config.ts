import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Las llamadas a la API (/api/...) nunca se responden con la pantalla de la app.
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
      manifest: {
        name: 'Taller - Presupuestos',
        short_name: 'Presupuestos',
        description: 'Presupuestos para talleres de pintura y desabolladura',
        lang: 'es-CL',
        theme_color: '#11223D',
        background_color: '#11223D',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
