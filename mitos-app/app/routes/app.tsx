/**
 * Layout for every embedded admin screen.
 *
 * Authentication happens here rather than in each child route, so a screen
 * added later cannot forget it. AppProvider loads App Bridge and the Polaris
 * web components from Shopify's CDN — the child routes render `s-*` elements
 * and never import a component library.
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { readSubscription } from "../lib/billing.server";
import { isEntitled } from "../lib/plans";

/**
 * The one screen a shop without a subscription may still open.
 *
 * It has to be reachable, or a merchant whose charge was cancelled has no way
 * back in and no way to see why — and this is also the screen that repairs a
 * stored subscription that has gone stale.
 */
const ALWAYS_ALLOWED = "/app/billing";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  /* The gate reads the stored copy, not Shopify: this loader runs on every
     screen the merchant opens, and a GraphQL round trip on each one would be
     paid for by every page load. The copy is kept current by the
     `app_subscriptions/update` webhook, and /app/billing re-asks Shopify
     directly for the case where a webhook was missed. */
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ALWAYS_ALLOWED)) {
    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop },
    });
    const sub = shop ? await readSubscription(prisma, shop.id) : null;
    if (!isEntitled(sub)) throw redirect(ALWAYS_ALLOWED);
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">
          Commandes
        </a>
        <a href="/app/dashboard">Tableau de bord</a>
        <a href="/app/products">Produits</a>
        <a href="/app/offers">Offres</a>
        <a href="/app/shipping">Frais de livraison</a>
        <a href="/app/settings">Réglages</a>
        <a href="/app/billing">Abonnement</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

/* Shopify's own docs require both of these on the embedded boundary: the
   error boundary re-throws auth redirects instead of rendering them as
   errors, and the headers function keeps the frame-ancestors header on
   error responses too. */
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
