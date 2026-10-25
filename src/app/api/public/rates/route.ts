/**
 * GET /api/public/rates — taux de change RÉELS publics (base EUR), destinés à l'affichage.
 * Seules les devises configurées (réglage display_currencies) sont renvoyées, sans authentification.
 * Source : table ExchangeRate alimentée par le fournisseur open.er-api.com — aucun taux inventé :
 * si aucune donnée n'a jamais pu être récupérée, rates est renvoyé vide avec un état explicite.
 * Limitation de débit : 60 requêtes / minute / IP (actualisation paresseuse partagée en arrière-plan).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, parseJsonArray } from "@/lib/api-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { getLatestRates, FX_BASE_CURRENCY } from "@/lib/fx";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`rates:${ip}`, 60, 60_000);
  if (!rl.allowed) return err("Trop de requêtes — réessayez dans un instant.", 429, { retryAfterSec: rl.retryAfterSec });

  const [rates, settingRows] = await Promise.all([
    getLatestRates(),
    db.setting.findMany({ where: { key: { in: ["display_currencies", "reference_currency"] } } }),
  ]);
  const map: Record<string, string> = {};
  for (const s of settingRows) map[s.key] = s.value;
  const referenceCurrency = map.reference_currency || FX_BASE_CURRENCY;
  const displayCurrencies = parseJsonArray(map.display_currencies);
  const codes = (displayCurrencies.length > 0 ? displayCurrencies : [referenceCurrency])
    .map((c) => c.toUpperCase());

  // 1 EUR = 1 EUR : identité exacte de la devise de base (pas une donnée inventée).
  const filtered: Record<string, number> = { [FX_BASE_CURRENCY]: 1 };
  for (const code of codes) {
    if (code === FX_BASE_CURRENCY) continue;
    const rate = rates.rates[code];
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) filtered[code] = rate;
  }

  return ok({
    base: FX_BASE_CURRENCY,
    source: rates.source,
    provider: rates.provider,
    fetchedAt: rates.fetchedAt,
    stale: rates.stale,
    rates: filtered,
    ...(rates.error ? { error: rates.error } : {}),
  });
}
