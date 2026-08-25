/**
 * The call list, installable and openable without signal.
 *
 * ── What is cached, and what is deliberately not ─────────────────────────
 *
 * The shell — this page, its icons, its manifest. That is what makes the app
 * open instantly from the home screen and open *at all* in a shop with no
 * bars, instead of the browser's offline dinosaur.
 *
 * The orders are NOT cached, and that is the whole design of this file.
 *
 * A cash-on-delivery merchant works this list by ringing people and marking
 * what happened. A cached list would show orders that may already have been
 * called by someone else, or cancelled, or shipped — and it would look exactly
 * as trustworthy as a live one. The merchant would ring a customer who was
 * already rung, or quote a total that has since changed, and nothing on the
 * screen would tell them. Showing "Connexion impossible" is worse-looking and
 * far better: it is true, and the page already says it.
 *
 * So: the shell is cache-first, and every call to the Supabase functions goes
 * to the network or fails visibly. Nothing in between.
 */

const VERSION = "mitos-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      /* One missing file must not fail the whole install and leave the app
         uninstallable — add what can be added. */
      .then((cache) =>
        Promise.allSettled(SHELL.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* Only GET is ever cacheable, and a status write is a POST — letting one
     through here would mean a confirmation that never reached the server. */
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* Anything that is not this app's own origin is data: the Supabase
     functions that own the orders, the rates and the carriers. Never cached,
     never served stale. */
  if (url.origin !== self.location.origin) return;

  /* Navigation: try the network first so a redeploy is picked up the moment
     there is signal, and fall back to the cached page when there is none. */
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() =>
          caches.match("./index.html").then((hit) => hit || Response.error()),
        ),
    );
    return;
  }

  /* Icons and the manifest: cache-first, they change only with a release. */
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req)),
  );
});
