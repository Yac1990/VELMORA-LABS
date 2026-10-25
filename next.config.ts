import type { NextConfig } from "next";

/**
 * En-têtes de sécurité (Sprint A — RAPPORT-DEVELOPPEMENT.md §6 item 7).
 *
 * - Toujours actifs : nosniff, Referrer-Policy, Permissions-Policy, CSP.
 * - Configurables par variable d'environnement (cf. .env.example) :
 *   • SECURITY_FRAME_ANCESTORS — anti-framing (X-Frame-Options + frame-ancestors).
 *     VIDE par défaut car le panneau de prévisualisation du sandbox intègre le site
 *     via une iframe cross-origin (voir le jeton de repli X-Session-Token dans
 *     src/lib/auth.ts). En production : définir 'self' ou une liste explicite.
 *   • SECURITY_HSTS=true — HSTS, à activer uniquement derrière HTTPS.
 *
 * La CSP autorise 'unsafe-inline'/'unsafe-eval' car le runtime Next.js (dev HMR et
 * amorces inline en production) l'exige ; les restrictions fortes portent sur
 * object-src, base-uri, form-action, connect-src et frame-ancestors (optionnel).
 */
const frameAncestors = (process.env.SECURITY_FRAME_ANCESTORS || "").trim();
const hstsEnabled = (process.env.SECURITY_HSTS || "").trim().toLowerCase() === "true";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // https: accepté sur les images : les médias produits peuvent pointer vers un CDN partenaire (cf. admin Produits → Médias)
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];
if (frameAncestors) contentSecurityPolicy.push(`frame-ancestors ${frameAncestors}`);

const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy.join("; ") },
];
if (frameAncestors) {
  securityHeaders.push({ key: "X-Frame-Options", value: "SAMEORIGIN" });
}
if (hstsEnabled) {
  securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
}

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
