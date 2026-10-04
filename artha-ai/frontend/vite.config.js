import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const BACKEND_PORT = process.env.BACKEND_PORT || '8002'
const FRONTEND_PORT = process.env.PORT ? parseInt(process.env.PORT) : 5175

export default defineConfig({
  plugins: [react()],
  server: {
    port: FRONTEND_PORT,
    proxy: { '/api': `http://127.0.0.1:${BACKEND_PORT}` },
  },
})

