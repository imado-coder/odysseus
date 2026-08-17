/**
 * POST /api/admin/bootstrap — operator-only setup, run from outside.
 *
 * Two problems this solves, both of which otherwise need a human with a
 * terminal and a direct line to the database:
 *
 *   A freshly provisioned Postgres has no reference data, and the machine
 *   that wrote the schema usually cannot reach the database — managed
 *   Postgres is reachable from the deployment, not from wherever the code was
 *   authored. So the seed has to be triggerable through the app.
 *
 *   Not every store installs through OAuth. A merchant who created a custom
 *   app inside their own admin already holds an offline Admin API token, and
 *   there is no install flow to run: the token simply has to be written into
 *   the session table for `unauthenticated.admin()` to find. That is the same
 *   row OAuth would have written.
 *
 * It is inert unless ADMIN_KEY is set, and every call must present it. With
 * no key configured the route answers 404 like any other unknown path — an
 * unconfigured deployment does not advertise that this exists.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { seedWilayas } from "../lib/geo.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Length-independent comparison, so a wrong key leaks nothing by timing. */
function keyMatches(given: string | null): boolean {
  const expected = process.env.ADMIN_KEY ?? "";
  if (!expected || !given) return false;
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function guard(request: Request): Response | null {
  if (!process.env.ADMIN_KEY) {
    return new Response("Not Found", { status: 404 });
  }
  const url = new URL(request.url);
  const given =
    request.headers.get("x-mitos-key") ?? url.searchParams.get("key");
  if (!keyMatches(given)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

async function status() {
  const [wilayas, communes, shops, sessions, leads, orders] = await Promise.all([
    prisma.wilaya.count(),
    prisma.commune.count(),
    prisma.shop.count(),
    prisma.session.count(),
    prisma.lead.count(),
    prisma.codOrder.count(),
  ]);
  return { wilayas, communes, shops, sessions, leads, orders };
}

/** GET is the read-only half: it says what state the database is in. */
export async function loader({ request }: LoaderFunctionArgs) {
  const denied = guard(request);
  if (denied) return denied;

  try {
    return json({ ok: true, ...(await status()) });
  } catch (e) {
    return json(
      { error: "database_unreachable", detail: message(e) },
      503,
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const denied = guard(request);
  if (denied) return denied;

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  try {
    switch (String(body.action)) {
      case "seed-geo":
        return json({ ok: true, ...(await seedWilayas(prisma)) });
      case "install-shop":
        return json({ ok: true, shop: await installShop(body) });
      case "status":
        return json({ ok: true, ...(await status()) });
      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("bootstrap", body.action, e);
    return json({ error: "failed", detail: message(e) }, 500);
  }
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Writes the rows an install produces: the store, its settings, and the
 * offline session holding the Admin API token. Idempotent, so re-running it
 * after rotating a token just replaces the token.
 */
async function installShop(body: Record<string, any>) {
  const domain = String(body.shop || "").toLowerCase().trim();
  if (!domain.endsWith(".myshopify.com")) {
    throw new Error("shop must be a myshopify.com domain");
  }

  const accessToken = String(body.accessToken || "").trim();
  if (!accessToken) throw new Error("accessToken is required");

  /* The library reads the session's scope to decide whether the grant still
     covers what the app asks for. A custom app's token carries whatever the
     merchant ticked, which is normally exactly SCOPES — recording anything
     else here would send a working install back through OAuth. */
  const scope = String(body.scope || process.env.SCOPES || "");

  const shop = await prisma.shop.upsert({
    where: { domain },
    update: {
      uninstalledAt: null,
      name: body.name ?? undefined,
      currency: body.currency ?? undefined,
    },
    create: {
      domain,
      name: body.name ?? null,
      currency: String(body.currency || "DZD"),
    },
  });

  await prisma.shopSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: { shopId: shop.id },
  });

  /* `offline_<domain>` is the id the Shopify session library derives for an
     offline session; writing any other id means it will never be found. */
  const id = `offline_${domain}`;
  await prisma.session.upsert({
    where: { id },
    update: { accessToken, scope, shop: domain, isOnline: false, state: "" },
    create: {
      id,
      shop: domain,
      state: "",
      isOnline: false,
      accessToken,
      scope,
    },
  });

  return { id: shop.id, domain: shop.domain, sessionId: id, scope };
}
