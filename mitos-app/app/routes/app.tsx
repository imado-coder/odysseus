/**
 * Layout for every embedded admin screen.
 *
 * Authentication happens here rather than in each child route, so a screen
 * added later cannot forget it. AppProvider loads App Bridge and the Polaris
 * web components from Shopify's CDN — the child routes render `s-*` elements
 * and never import a component library.
 */
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { NavMenu } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
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
        <a href="/app/shipping">Frais de livraison</a>
        <a href="/app/settings">Réglages</a>
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
