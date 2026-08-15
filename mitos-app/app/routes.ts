import { flatRoutes } from "@react-router/fs-routes";
import type { RouteConfig } from "@react-router/dev/routes";

/* File-system routing, matching the layout the Shopify CLI expects:
   app.* are the embedded admin screens, auth.* the OAuth handshake,
   api.cod and webhooks are unauthenticated POST endpoints. */
export default flatRoutes() satisfies RouteConfig;
