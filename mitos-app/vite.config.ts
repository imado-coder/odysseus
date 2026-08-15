import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

/* The Shopify CLI rewrites HOST into SHOPIFY_APP_URL as it tunnels. Normalise
   it once here so the rest of the app only ever reads SHOPIFY_APP_URL. */
if (process.env.HOST && !process.env.SHOPIFY_APP_URL) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
}

const host = process.env.SHOPIFY_APP_URL
  ? new URL(process.env.SHOPIFY_APP_URL).hostname
  : "localhost";

export default defineConfig({
  server: {
    port: Number(process.env.PORT || 3000),
    allowedHosts: [host],
    /* The tunnel terminates TLS, so HMR has to be told to come back over
       wss on 443 rather than the local http port. */
    hmr:
      host === "localhost"
        ? undefined
        : { protocol: "wss", host, port: 443, clientPort: 443 },
    fs: { allow: ["app", "node_modules"] },
  },
  plugins: [reactRouter(), tsconfigPaths()],
  build: { assetsInlineLimit: 0 },
  optimizeDeps: { include: ["@shopify/shopify-app-react-router/react"] },
});
