/**
 * OAuth catch-all. The library owns the whole handshake; this route exists
 * only so /auth, /auth/callback and /auth/session-token resolve to it.
 */
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return null;
}
