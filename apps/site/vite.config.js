import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Hand off /booking to CRA dev server on :3000
      '^/booking($|/)': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/booking/, '/'),
      },
      // CRA assets / HMR endpoints that its HTML references
      '/static': { target: 'http://localhost:3000', changeOrigin: true },
      '/sockjs-node': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
      '/asset-manifest.json': { target: 'http://localhost:3000', changeOrigin: true },
      '/favicon.ico': { target: 'http://localhost:3000', changeOrigin: true },
      '/manifest.json': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
})
