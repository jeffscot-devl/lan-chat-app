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
    allowedHosts: [
      'whatsapp-clone-app-tunnel-xed1t5va.devinapps.com',
      'whatsapp-clone-app-tunnel-ih6jytua.devinapps.com'
    ],
    hmr: {
      clientPort: 5173
    }
  },
})

