import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  /* Server-rendered. An embedded Shopify app authenticates every request
     against a session token before it renders, so there is nothing to
     prerender and no static build to serve. */
  ssr: true,

  /* Vercel does not run `react-router-serve`; it expects the build output in
     its own layout. The preset emits that, so the same source also still runs
     under `npm start` on a VPS or Fly.io — which is the whole point of not
     writing Vercel-specific handlers by hand. */
  presets: [vercelPreset()],
} satisfies Config;
