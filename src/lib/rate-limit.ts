/**
 * Limitation de débit en mémoire locale (par instance) pour endpoints publics sensibles.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Task 45 — extraction d'IP anti-usurpation :
 * 1. `x-real-ip` : posé par le proxy de confiance (Vercel / Caddy), non contrôlable
 *    par le client — source prioritaire ;
 * 2. sinon le DERNIER saut de `x-forwarded-for` : notre proxy ajoute l'IP réelle du
 *    client en fin de chaîne — le premier saut (utilisé auparavant) est lui fourni
 *    par le client lui-même et permettait de contourner les limites de débit en
 *    forgeant un en-tête.
 */
export function getClientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "local";
}

// Nettoyage périodique pour éviter la croissance mémoire
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  }, 60_000);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
}
