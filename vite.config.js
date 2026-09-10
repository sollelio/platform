import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // O pré-bundling do dev parte a resolução do web worker do
    // maplibre-gl (o Atlas Lab, só staging) — 404 em
    // .vite/deps/maplibre-gl-worker.mjs. Excluí-lo resolve; o build
    // de produção não passa por aqui.
    exclude: ['maplibre-gl'],
  },
})
