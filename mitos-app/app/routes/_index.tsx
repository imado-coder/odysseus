/**
 * The app's root URL.
 *
 * Reached two ways: Shopify sends the merchant here with ?shop=… during
 * install, in which case we hand straight off to OAuth; or a person opens the
 * bare URL, and gets a form asking which store to install on.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, redirect, useLoaderData } from "react-router";
import { login } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/auth/login?${url.searchParams.toString()}`);
  }
  return { errors: {} as Record<string, string> };
}

export async function action({ request }: ActionFunctionArgs) {
  const errors = await login(request);
  return { errors: (errors ?? {}) as Record<string, string> };
}

export default function Index() {
  const { errors } = useLoaderData<typeof loader>();

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "3rem 1.5rem", maxWidth: "34rem", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", marginBottom: ".5rem" }}>MITOS</h1>
      <p style={{ color: "#5c5f62", marginBottom: "2rem" }}>
        Commandes à la livraison pour les boutiques Shopify en Algérie.
      </p>

      <Form method="post">
        <label htmlFor="shop" style={{ display: "block", marginBottom: ".375rem" }}>
          Domaine de la boutique
        </label>
        <input
          id="shop"
          type="text"
          name="shop"
          placeholder="ma-boutique.myshopify.com"
          style={{ width: "100%", padding: ".625rem .75rem", fontSize: "1rem", border: "1px solid #8c9196", borderRadius: ".5rem" }}
        />
        {errors.shop ? (
          <p style={{ color: "#d72c0d", marginTop: ".5rem" }}>{errors.shop}</p>
        ) : null}
        <button
          type="submit"
          style={{ marginTop: "1rem", padding: ".625rem 1.25rem", fontSize: "1rem", background: "#303030", color: "#fff", border: 0, borderRadius: ".5rem", cursor: "pointer" }}
        >
          Installer
        </button>
      </Form>
    </main>
  );
}
