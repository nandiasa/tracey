import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The trace worker is an ES module (it imports the Potrace WASM build).
  worker: { format: 'es' },
})
