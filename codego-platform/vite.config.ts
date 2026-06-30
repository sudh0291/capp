import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig(() => {
  const isElectron = process.env.ELECTRON === 'true';

  return {
    plugins: [
      react(),
      isElectron && electron({
        main: {
          entry: 'electron/main.ts',
        },
        preload: {
          input: 'electron/preload.ts',
        },
        // We remove 'renderer: {}' because your React frontend is perfectly fine 
        // as a standard web application, and we don't need to inject Node.js into it.
      }),
    ],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          timeout: 1200000,
          proxyTimeout: 1200000,
          configure: (proxy) => {
            // Completely suppress proxy errors when backend isn't running
            proxy.on('error', (err, _req, res) => {
              if ((err as any).code === 'ECONNREFUSED') {
                // Do NOT log anything to terminal! Just return 503 to client
                if (res && 'writeHead' in res && !(res as any).writableEnded) {
                  (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                  (res as any).end(JSON.stringify({ offline: true, message: 'Backend not running' }));
                }
                return;
              }
            });
          },
        },
      },
    },
  };
})
