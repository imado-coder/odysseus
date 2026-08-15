import type { Config } from "@react-router/dev/config";

export default {
  /* Server-rendered. An embedded Shopify app authenticates every request
     against a session token before it renders, so there is nothing to
     prerender and no static build to serve. */
  ssr: true,
} satisfies Config;
