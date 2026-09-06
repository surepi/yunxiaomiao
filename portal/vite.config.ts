import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Gateway API path prefixes that are proxied to the gateway so the browser
// only talks to the portal origin (avoids CORS and exposing port 8080).
const gatewayPaths = "^/(auth|admin|packages|redeem|renew|instances|webhooks|health|nodes)(/|$)";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      [gatewayPaths]: {
        target: "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
