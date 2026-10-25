/**
 * GET /api/go/[offerId]?campaign=&subid=
 * Endpoint serveur de redirection suivie (cahier des charges §4 et §AFFILIATION).
 * - Vérifie que l'offre est active et publiée.
 * - Vérifie la destination contre la liste blanche de domaines du partenaire (anti open-redirect).
 * - Sprint B — tracking réel : si le partenaire possède un gabarit de tracking documenté
 *   (Partner.trackingTemplate) ET que les IDs requis sont configurés dans Réglages
 *   (clés Setting « tracking.<slug>.* »), l'URL finale est le lien de tracking RÉEL du réseau
 *   (Awin cread.php, Amazon tag, ClickBank hoplink…). Sinon → redirection directe vers la
 *   destination, jamais de gabarit partiellement rempli ni d'ID inventé.
 * - Enregistre le clic avec un identifiant de session ANONYME minimisé (hash court).
 * - Redirige 302 avec Cache-Control: no-store.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { err, isDomainAllowed } from "@/lib/api-utils";
import { anonymizedSessionId } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Slug cohérent avec le back-office (clés Setting tracking.<slug>.*). */
function partnerSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Applique le gabarit de tracking réel du réseau.
 * Placeholders : {affiliateId} {merchantId} {subId} {destUrl} {destUrlEnc}
 * Tout autre placeholder {x} est résolu via Setting « tracking.<slug>.<x> ».
 * Retourne null si un placeholder requis manque (jamais d'URL de tracking incomplète).
 */
async function buildTrackingUrl(
  template: string,
  slug: string,
  destination: URL,
  subId: string | null,
): Promise<string | null> {
  const settings = await db.setting.findMany({
    where: { key: { startsWith: `tracking.${slug}.` } },
  });
  const cfg: Record<string, string> = {};
  for (const s of settings) cfg[s.key.split(".").slice(2).join(".")] = s.value;

  // Valeurs standard ; {subId} vide est acceptable (certains réseaux l'optionnalisent),
  // mais tout placeholder D'AUTRE type non résolu invalide le gabarit.
  const resolve = (token: string): string | null => {
    switch (token) {
      case "affiliateId": return cfg.affiliateId || null;
      case "merchantId": return cfg.merchantId || null;
      case "subId": return subId ?? "";
      case "destUrl": return destination.toString();
      case "destUrlEnc": return encodeURIComponent(destination.toString());
      default: return cfg[token] ?? null;
    }
  };

  let out = template;
  // {destUrl} : gère le collage « ? » quand la destination a déjà une query (Amazon tag).
  out = out.replace(/\{destUrl\}(\??)/g, (_m, q: string) => {
    const hasQuery = destination.search !== "";
    return destination.toString() + (q === "?" && hasQuery ? "&" : q);
  });
  for (const m of out.matchAll(/\{([a-zA-Z0-9]+)\}/g)) {
    const token = m[1];
    const value = resolve(token);
    if (value === null) return null; // ID requis non configuré → pas de tracking
    if (value === "" && token === "subId") {
      // subId absent : retirer proprement le paramètre « &subId= » / « ?subId= » du gabarit
      out = out.replace(/[&?]([a-zA-Z0-9_]+)=\{subId\}/, "");
      out = out.replace(/\{subId\}/, "");
      continue;
    }
    out = out.replace(`{${token}}`, value);
  }
  if (/\{[a-zA-Z0-9]+\}/.test(out)) return null; // placeholder restant → invalide
  return out;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`go:${ip}`, 30, 60_000);
  if (!rl.allowed) {
    return err("Trop de redirections depuis cette adresse — réessayez plus tard.", 429, { retryAfterSec: rl.retryAfterSec });
  }

  const offer = await db.productOffer.findUnique({
    where: { id: offerId },
    include: {
      partner: true,
      product: { select: { status: true, slug: true } },
    },
  });

  if (!offer || !offer.isActive || offer.product.status !== "published") {
    return err("Offre indisponible ou désactivée. Le bouton d'achat est retiré conformément à nos règles de transparence.", 404);
  }

  const allowedDomains: string[] = JSON.parse(offer.partner.allowedDomains || "[]");
  const check = isDomainAllowed(offer.destinationUrl, allowedDomains);
  if (!check.ok) {
    // Destination non autorisée : blocage explicite (jamais de redirection ouverte)
    await db.productOffer.update({
      where: { id: offer.id },
      data: { urlCheckStatus: "broken", urlCheckedAt: new Date() },
    });
    return err("URL de destination non autorisée — redirection bloquée par mesure de sécurité.", 403);
  }

  const sp = req.nextUrl.searchParams;
  const campaignId = sp.get("campaign");
  const subId = sp.get("subid")?.slice(0, 64) || null;
  const country = req.headers.get("x-vercel-ip-country") || null;

  const day = new Date().toISOString().slice(0, 10);
  const sessionId = anonymizedSessionId(ip, req.headers.get("user-agent") || "", day);

  await db.clickEvent.create({
    data: {
      offerId: offer.id,
      partnerId: offer.partnerId,
      campaignId: campaignId && campaignId.length < 40 ? campaignId : null,
      anonymousSessionId: sessionId,
      subId,
      countryCoarse: country,
      referrer: req.headers.get("referer")?.slice(0, 180) || null,
      isDemo: offer.partner.isDemo,
    },
  });

  const destination = new URL(offer.destinationUrl);
  // Préservation des paramètres de suivi autorisés passés à l'endpoint (uniquement si
  // la destination finale EST l'URL du vendeur — le réseau de tracking les gère autrement).
  const applyUtm = (u: URL) => {
    for (const [key, value] of sp.entries()) {
      if (["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].includes(key)) {
        u.searchParams.set(key, value);
      }
    }
  };

  // Sprint B — tracking réel : gabarit documenté + IDs configurés → lien réseau authentique.
  let finalUrl = destination.toString();
  if (offer.partner.trackingTemplate) {
    try {
      const tracking = await buildTrackingUrl(
        offer.partner.trackingTemplate,
        partnerSlug(offer.partner.name),
        destination,
        subId,
      );
      const trackingUrl = tracking ? new URL(tracking) : null;
      // Le lien de tracking passe aussi par la liste blanche (domaines réseau réels inclus
      // dans Partner.allowedDomains par seed-real-partners.ts / le back-office).
      if (trackingUrl && isDomainAllowed(trackingUrl.toString(), allowedDomains).ok) {
        finalUrl = trackingUrl.toString();
      }
    } catch {
      // Gabarit mal formé → repli direct (jamais d'erreur 500 exposée à l'utilisateur)
    }
  }

  const final = new URL(finalUrl);
  if (final.toString() === destination.toString()) applyUtm(final);

  return NextResponse.redirect(final.toString(), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
