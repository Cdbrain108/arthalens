import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_PORT = process.env.BACKEND_PORT || '8000'
const FRONTEND_PORT = process.env.PORT ? parseInt(process.env.PORT) : 5173

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: FRONTEND_PORT,
    allowedHosts: true,
    proxy: { '/api': `http://127.0.0.1:${BACKEND_PORT}` },
  },
})
