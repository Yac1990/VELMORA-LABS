/**
 * Vérification serveur des URLs d'offres (Sprint A — RAPPORT-DEVELOPPEMENT.md §6 item 4).
 *
 * Deux points d'entrée :
 *  - POST /api/admin/offers/check (back-office, bouton « Tester », permission catalog.write)
 *  - scripts/check-offer-urls.ts (planifiable en cron : exit 2 si liens cassés → alerte)
 *
 * Garde-fous à chaque requête émise :
 *  - http/https uniquement ;
 *  - domaine contrôlé contre la liste blanche du partenaire (anti open-redirect) ;
 *  - adresses réseau privées interdites (anti SSRF) ;
 *  - redirections suivies manuellement (max 3) avec revalidation à CHAQUE saut ;
 *  - timeout 8 s par requête ; HEAD d'abord, repli GET si HEAD refusé (405/501/400).
 *
 * Statut final stocké sur l'offre : urlCheckStatus = ok | broken (+ urlCheckedAt).
 * Limites assumées (documentées) : les pare-feux anti-robots (403/429) peuvent
 * produire un faux « broken » — le rapport est relu par un humain avant correction ;
 * l'outil ne désactive jamais une offre automatiquement ; pas de résolution DNS
 * du nom d'hôte (rebinding DNS non détecté).
 */
import { db } from "@/lib/db";
import { isDomainAllowed, isPrivateHost } from "@/lib/url-guard";

export type OfferCheckStatus = "ok" | "broken";

export interface OfferCheckOutcome {
  status: OfferCheckStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  reason: string | null;
}

export interface OfferCheckResult extends OfferCheckOutcome {
  offerId: string;
  productTitle: string | null;
  partnerName: string;
  destinationUrl: string;
}

export interface OfferCheckSummary {
  checked: number;
  ok: number;
  broken: number;
  results: OfferCheckResult[];
}

const HOP_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const REQUEST_HEADERS = {
  "user-agent": "VELMORA-Labs-UrlCheck/1.0 (vérification d'intégrité des liens)",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
};

function broken(reason: string): OfferCheckOutcome {
  return { status: "broken", httpStatus: null, finalUrl: null, reason };
}

/** Vérifie une seule URL de destination (sans toucher la base). */
export async function checkOfferUrl(destinationUrl: string, allowedDomains: string[]): Promise<OfferCheckOutcome> {
  let url: URL;
  try {
    url = new URL(destinationUrl);
  } catch {
    return broken("URL invalide");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return broken("Protocole non autorisé (http/https requis)");
  }
  if (!isDomainAllowed(destinationUrl, allowedDomains).ok) {
    return broken("Domaine hors liste blanche du partenaire (anti open-redirect)");
  }
  if (isPrivateHost(url.hostname)) {
    return broken("Adresse réseau privée interdite (anti SSRF)");
  }

  let current = url.toString();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: REQUEST_HEADERS,
      });
      if (res.status === 405 || res.status === 501 || res.status === 400) {
        // Certains serveurs rejettent HEAD — repli GET (corps ignoré).
        res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
          headers: REQUEST_HEADERS,
        });
      }
      try { await res.arrayBuffer(); } catch { /* corps déjà consommé ou absent */ }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erreur réseau";
      return broken(msg.includes("abort") || msg.includes("timeout") || msg.includes("Timeout") ? "Délai dépassé (8 s)" : `Injoignable : ${msg}`);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { status: "ok", httpStatus: res.status, finalUrl: current, reason: "Redirection sans destination (considérée joignable)" };
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return broken("Redirection vers une URL invalide");
      }
      if (next.protocol !== "https:" && next.protocol !== "http:") {
        return broken("Redirection vers un protocole non autorisé");
      }
      if (isPrivateHost(next.hostname)) {
        return broken("Redirection vers une adresse privée interdite");
      }
      if (!isDomainAllowed(next.toString(), allowedDomains).ok) {
        return broken(`Redirection hors liste blanche (${next.hostname})`);
      }
      current = next.toString();
      continue;
    }

    const okStatus = res.status >= 200 && res.status < 400;
    return {
      status: okStatus ? "ok" : "broken",
      httpStatus: res.status,
      finalUrl: current,
      reason: okStatus ? null : `HTTP ${res.status}`,
    };
  }
  return broken(`Plus de ${MAX_REDIRECTS} redirections consécutives`);
}

function parseAllowedDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Vérifie les offres actives (ou une offre donnée), met à jour urlCheckStatus /
 * urlCheckedAt, journalise une entrée d'audit et renvoie le résumé.
 * Séquentiel volontaire : on ne martèle pas les serveurs partenaires.
 */
export async function runOfferCheck(
  opts: { offerId?: string | null; limit?: number; actor?: { uid: string; email: string } | null } = {}
): Promise<OfferCheckSummary> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const offers = await db.productOffer.findMany({
    where: { isActive: true, ...(opts.offerId ? { id: opts.offerId } : {}) },
    include: {
      partner: { select: { name: true, allowedDomains: true } },
      product: { select: { title: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const results: OfferCheckResult[] = [];
  let okCount = 0;
  let brokenCount = 0;
  for (const offer of offers) {
    const allowed = parseAllowedDomains(offer.partner.allowedDomains);
    const outcome = await checkOfferUrl(offer.destinationUrl, allowed);
    if (outcome.status === "ok") okCount++;
    else brokenCount++;
    await db.productOffer.update({
      where: { id: offer.id },
      data: { urlCheckStatus: outcome.status, urlCheckedAt: new Date() },
    });
    results.push({
      offerId: offer.id,
      productTitle: offer.product?.title ?? null,
      partnerName: offer.partner.name,
      destinationUrl: offer.destinationUrl,
      status: outcome.status,
      httpStatus: outcome.httpStatus,
      finalUrl: outcome.finalUrl,
      reason: outcome.reason,
    });
  }

  try {
    await db.auditLog.create({
      data: {
        actorId: opts.actor?.uid ?? null,
        actorEmail: opts.actor?.email ?? null,
        action: "offers.url_check",
        entityType: opts.offerId ? "product_offer" : null,
        entityId: opts.offerId ?? null,
        metadataJson: JSON.stringify({ checked: okCount + brokenCount, ok: okCount, broken: brokenCount, limit }),
      },
    });
  } catch {
    // le journal ne doit jamais bloquer l'opération métier
  }

  return { checked: okCount + brokenCount, ok: okCount, broken: brokenCount, results };
}
