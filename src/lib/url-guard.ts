/**
 * Garde-fous URL — logique pure, sans dépendance Next.js, pour être réutilisable
 * à la fois par les API routes (via api-utils) et par les scripts bun (cron).
 */

/** Normalise une URL et vérifie que son domaine est sur la liste blanche du partenaire. */
export function isDomainAllowed(url: string, allowedDomains: string[]): { ok: boolean; host?: string } {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { ok: false };
    const host = parsed.hostname.toLowerCase();
    const hostWithoutWww = host.replace(/^www\./, "");
    const allowed = allowedDomains.some((d) => {
      const clean = d.toLowerCase().trim().replace(/^www\./, "");
      return host === clean || hostWithoutWww === clean || hostWithoutWww.endsWith("." + clean);
    });
    return { ok: allowed, host };
  } catch {
    return { ok: false };
  }
}

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/,
  /\.localhost$/,
  /\.local$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./, // link-local (dont metadata cloud 169.254.169.254)
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./, // RFC1918 172.16.0.0/12
];

/**
 * Anti-SSRF : refuse les hôtes réseau privés/réservés (boucle locale, RFC1918,
 * link-local, IPv6 unique-local/link-local). Contrôle sur le nom d'hôte uniquement —
 * la résolution DNS vers une IP privée (rebinding) reste une limitation documentée.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;
  return PRIVATE_HOST_PATTERNS.some((re) => re.test(h));
}
