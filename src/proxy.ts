/**
 * Proxy Next.js 16 (ex-« middleware », convention renommée par Next 16) — couche de bordure
 * (runtime edge), exécutée avant chaque route.
 *
 * Périmètre (défense en profondeur, aucune logique métier déplacée ici) :
 * 1. x-request-id : identifiant de corrélation unique sur TOUTES les réponses
 *    (débogage, support, corrélation avec le journal d'audit). Repris du client s'il
 *    en fournit un, sinon généré (crypto.randomUUID).
 * 2. Sondes de scanners automatiques (/wp-admin, /.env, /.git, phpmyadmin…) :
 *    404 immédiat sans invoquer l'application — moins de bruit dans les journaux,
 *    aucune information exposée.
 * 3. Task 27 — Vérification cryptographique /api/admin/* à la bordure : le jeton
 *    (cookie httpOnly `vml_session` OU en-tête `X-Session-Token`, repli iframe de
 *    prévisualisation) doit porter une signature HMAC-SHA256 valide et non expirée,
 *    sinon 401 immédiat avec la même enveloppe {error} que l'API. Chaque route admin
 *    revalide ensuite la session et applique le RBAC fin (requirePermission +
 *    hasPermission par permission) — le proxy accélère le rejet, il ne remplace pas
 *    les contrôles applicatifs.
 *
 * Limites assumées (documentées) :
 *   - Le runtime Edge n'a pas accès à la base : on vérifie la SIGNATURE et
 *     l'EXPIRATION du jeton, pas le rôle ni l'état actif du compte (RBAC par route).
 *   - En production, AUTH_SECRET est incorporé dans le bundle Edge au BUILD
 *     (next build). Après rotation du secret : reconstruire puis redémarrer.
 *   - Les routes #/admin côté navigateur sont invisibles côté serveur (hash
 *     fragment) : la protection côté UI reste le garde d'authAdmin du client.
 *
 * Vérification compatible Edge (Web Crypto, aucune dépendance Node) :
 * crypto.subtle.verify compare les signatures à temps constant. Les constantes de
 * cookie et le secret de repli dupliquent exactement src/lib/auth.ts (import évité :
 * auth.ts dépend de node:crypto et de Prisma).
 */
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "vml_session"; // identique à src/lib/auth.ts
const SESSION_HEADER = "x-session-token"; // identique au repli X-Session-Token de auth.ts
const DEV_FALLBACK_SECRET = "velmora-dev-secret-change-me"; // identique à getSecret() de auth.ts

/** Sondes de scanners courantes — aucune route légitime de la plateforme ne commence par ces chemins. */
const SCANNER_PROBE = /^\/(?:wp-admin|wp-content|wp-includes|wp-login\.php|xmlrpc\.php|phpmyadmin|pma|\.env|\.git|\.svn|\.aws|\.ssh|\.DS_Store|config\.json)(?:\/|$)/i;

interface SessionPayload {
  uid: string;
  email: string;
  role: string;
  displayName: string;
  exp: number; // epoch ms
}

/**
 * Secret de signature — Task 45 : en production, l'absence d'AUTH_SECRET est fatale
 * (identique à getSecret() de src/lib/auth.ts). Le repli dev ne survit qu'en
 * développement ; en production le bundle Edge est construit avec AUTH_SECRET
 * incorporé (cf. DEPLOIEMENT.md, Étape 5).
 */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET manquant en production (proxy Edge) — cf. DEPLOIEMENT.md, Étape 5.");
  }
  return DEV_FALLBACK_SECRET;
}

/** base64url → octets (sans dépendance Node). */
function b64urlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Vérifie signature HMAC-SHA256 + expiration. Retourne le payload ou null. */
async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const parts = token.split(".");
  const body = parts[0];
  const sig = parts[1];
  if (!body || !sig) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(getSecret()),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig),
      new TextEncoder().encode(body)
    );
    if (!valid) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(body))
    ) as SessionPayload;
    if (!payload?.exp || payload.exp < Date.now() || !payload.uid) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extrait le jeton de session — ordre identique à sessionFromRequest :
 * 1. en-tête X-Session-Token (repli iframe de prévisualisation) ;
 * 2. cookie httpOnly vml_session.
 */
function extractToken(req: NextRequest): string | null {
  const headerToken = req.headers.get(SESSION_HEADER);
  if (headerToken) return headerToken.trim();
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

function unauthorized(requestId: string): NextResponse {
  return NextResponse.json(
    { error: "Authentification requise" },
    { status: 401, headers: { "Cache-Control": "no-store", "x-request-id": requestId } }
  );
}

export async function proxy(req: NextRequest) {
  // Identifiant de corrélation : transmis par le client s'il existe, sinon généré.
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();

  // 1. Sondes de scanners → 404 minimal, jamais traitées par l'application.
  if (SCANNER_PROBE.test(req.nextUrl.pathname)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "x-request-id": requestId,
      },
    });
  }

  // 2. Task 27 — /api/admin/* : signature HMAC + expiration vérifiées à la bordure.
  //    (Même statut, même message et même enveloppe que requirePermission —
  //    le client traite les deux réponses de manière identique.)
  if (req.nextUrl.pathname.startsWith("/api/admin/")) {
    // Préflights CORS : rien à authentifier, on laisse Next les traiter.
    if (req.method !== "OPTIONS") {
      const token = extractToken(req);
      const session = token ? await verifySessionToken(token) : null;
      if (!session) return unauthorized(requestId);
    }
  }

  // 3. Passage normal : x-request-id ajouté à la réponse finale (fusionnée par Next).
  const res = NextResponse.next();
  res.headers.set("x-request-id", requestId);
  return res;
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques Next et les assets publics (brands/, demo/, logos…)
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|brands/|demo/|logo\\.svg|velmora-logo\\.png).*)",
  ],
};
