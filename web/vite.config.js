import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3130,
    strictPort: true,
    // dev server exposto via nginx em blights.kore.zone (Cloudflare na frente)
    allowedHosts: ["blights.kore.zone"],
  },
});
