/* VELMORA LABS — service worker minimal (Task 37-b, durci Task 38).
   Stratégies : navigations = réseau d'abord (repli cache puis « / ») ;
   statiques _next/static, /brands/, /demo/, /icons/ = cache d'abord ;
   /api/ et toute requête XTransformPort (socket.io du chat) JAMAIS interceptés.
   Plafond de 80 entrées (suppression la plus ancienne).
   Enregistrement : uniquement en production (cf. install-prompt.tsx). */
const CACHE = "velmora-v1";
const MAX_ENTRIES = 80;
const PRECACHE = ["/", "/manifest.webmanifest", "/velmora-logo.png", "/icons/icon-192.png", "/icons/icon-512.png"];
const CACHE_FIRST = ["/_next/static/", "/brands/", "/demo/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))));
    } catch (_) { /* précache best-effort */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("velmora-") && k !== CACHE).map((k) => caches.delete(k)));
    } catch (_) { /* nettoyage best-effort */ }
    await self.clients.claim();
  })());
});

/** Limite le cache à MAX_ENTRIES (les keys() sont en ordre d'insertion en pratique). */
async function trimCache() {
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(key);
  } catch (_) { /* ignore */ }
}

async function cacheable(response) {
  return response && response.ok && (response.type === "basic" || response.type === "default");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.search.includes("XTransformPort")) return; // passerelle du sandbox (chat/socket.io) : ne JAMAIS intercepter
  if (url.pathname.startsWith("/api/")) return; // API : passer tel quel, jamais cache

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (await cacheable(fresh)) { const c = await caches.open(CACHE); await c.put(req, fresh.clone()); trimCache(); }
        return fresh;
      } catch (_) {
        try {
          const cache = await caches.open(CACHE);
          return (await cache.match(req)) || (await cache.match("/")) || Response.error();
        } catch (_) { return Response.error(); }
      }
    })());
    return;
  }

  if (CACHE_FIRST.some((p) => url.pathname.startsWith(p))) {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const fresh = await fetch(req);
        if (await cacheable(fresh)) { await cache.put(req, fresh.clone()); trimCache(); }
        return fresh;
      } catch (_) { return Response.error(); }
    })());
  }
  /* Autres requêtes GET same-origin : laisser le navigateur gérer. */
});
