import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SUPABASE_API_TARGET = 'http://127.0.0.1:54321'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/rest/v1': SUPABASE_API_TARGET,
      '/auth/v1': SUPABASE_API_TARGET,
      '/storage/v1': SUPABASE_API_TARGET,
      '/realtime/v1': { target: SUPABASE_API_TARGET, ws: true },
      '/functions/v1': SUPABASE_API_TARGET,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    globals: true,
  },
})
