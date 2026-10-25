/**
 * GET / POST /api/admin/rates — taux de change RÉELS (fournisseur open.er-api.com, sans clé).
 * GET  : lecture des taux stockés (actualisation paresseuse automatique si > 6 h)
 *        — permission settings.read, détenue par tous les rôles admin (y compris analyste).
 * POST : actualisation immédiate depuis le fournisseur + journal d'audit « rates.refresh »
 *        — permission settings.write (modification de données plateforme).
 * Aucun taux n'est inventé : si le fournisseur échoue et que la table est vide, rates reste vide.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit, parseJsonArray } from "@/lib/api-utils";
import { getLatestRates, refreshExchangeRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/** Taux stockés + configuration devises (réglages display_currencies / reference_currency). */
async function buildPayload() {
  const rates = await getLatestRates();
  const settingRows = await db.setting.findMany({
    where: { key: { in: ["display_currencies", "reference_currency"] } },
  });
  const map: Record<string, string> = {};
  for (const s of settingRows) map[s.key] = s.value;
  const referenceCurrency = map.reference_currency || "EUR";
  let displayCurrencies = parseJsonArray(map.display_currencies);
  if (displayCurrencies.length === 0) displayCurrencies = [referenceCurrency];
  return {
    ...rates,
    config: {
      displayCurrencies,
      referenceCurrency,
    },
  };
}

export async function GET(req: Request) {
  const guard = await requirePermission(req, "settings.read");
  if ("error" in guard) return guard.error;
  return ok(await buildPayload());
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "settings.write");
  if ("error" in guard) return guard.error;
  const result = await refreshExchangeRates();
  if (!result.ok) {
    await audit(guard.session, "rates.refresh", "exchange_rate", undefined, {
      ok: false,
      error: result.error,
    });
    return err(`Actualisation impossible : ${result.error}`, 502);
  }
  await audit(guard.session, "rates.refresh", "exchange_rate", undefined, {
    ok: true,
    provider: result.provider,
    pairs: result.pairs,
    fetchedAt: result.fetchedAt,
  });
  return ok(await buildPayload());
}
