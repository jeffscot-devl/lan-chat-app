import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
    allowedHosts: ['whatsapp-clone-app-tunnel-ppaexfhk.devinapps.com', 'whatsapp-clone-app-tunnel-1auvqhmn.devinapps.com', 'whatsapp-clone-app-tunnel-5k08ynlw.devinapps.com'],
    hmr: {
      clientPort: 5173
    }
  },
})

