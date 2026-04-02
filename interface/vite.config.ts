import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, resolve(__dirname, '..'), '')
  const localEnv = loadEnv(mode, process.cwd(), '')
  const env = { ...rootEnv, ...localEnv, ...process.env }
  const apiPort = env.PORT?.trim() || '3000'
  const proxyTarget = env.VITE_API_PROXY_TARGET?.trim() || `http://127.0.0.1:${apiPort}`
  const subPath = env.SUB_PATH?.trim() || ''
  const normalizedSubPath = subPath && subPath !== '/'
    ? `/${subPath.replace(/^\/+|\/+$/g, '')}/`
    : '/'

  return {
    base: normalizedSubPath,
    define: {
      __APP_SUB_PATH__: JSON.stringify(subPath),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/metrics': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/health': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
