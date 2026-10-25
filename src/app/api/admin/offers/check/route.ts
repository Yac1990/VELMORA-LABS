/**
 * POST /api/admin/offers/check — vérification serveur des URLs d'offres.
 * Corps (optionnel) : { "offerId": "…" } pour une seule offre, sinon toutes les offres actives.
 * Permission : catalog.write. Journal d'audit : offers.url_check.
 * Réutilise runOfferCheck (src/lib/offer-check.ts) — même logique que le script cron.
 */
import { NextRequest } from "next/server";
import { ok, err, requirePermission } from "@/lib/api-utils";
import { runOfferCheck } from "@/lib/offer-check";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;

  const body = await req.json().catch(() => ({}));
  const offerId = body && typeof body.offerId === "string" && body.offerId.trim() ? body.offerId.trim() : null;
  const limit = body && Number.isFinite(Number(body.limit)) ? Number(body.limit) : 100;

  try {
    const summary = await runOfferCheck({ offerId, limit, actor: { uid: session.uid, email: session.email } });
    return ok({
      summary: { checked: summary.checked, ok: summary.ok, broken: summary.broken },
      check: offerId ? summary.results[0] ?? null : null,
      results: offerId ? undefined : summary.results,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "Échec de la vérification des URLs", 500);
  }
}
