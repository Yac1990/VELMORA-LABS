/**
 * Taux de change RÉELS — service backend (aucune simulation, aucune invention).
 *
 * Fournisseur : https://open.er-api.com/v6/latest/EUR (API publique gratuite, sans clé)
 * — taux réels base EUR, ~160 devises, mis à jour quotidiennement par le fournisseur.
 *
 * Règles d'honnêteté des données :
 *  - les taux stockés proviennent intégralement de la dernière réponse réelle du fournisseur ;
 *  - si l'appel échoue et que la table est vide, on renvoie { rates: {}, fetchedAt: null } —
 *    jamais de valeur approximée ;
 *  - si l'appel échoue sur des données anciennes, les taux stockés sont renvoyés tels quels
 *    avec stale=true (transparence totale sur leur fraîcheur) ;
 *  - une devise absente de la réponse du fournisseur n'est jamais « complétée ».
 */

import { db } from "@/lib/db";

export const FX_BASE_CURRENCY = "EUR";

const FX_PROVIDER_URL = "https://open.er-api.com/v6/latest/EUR";
const FX_PROVIDER_NAME = "open.er-api.com";
const FX_TIMEOUT_MS = 8_000;
/** Plafond du payload brut conservé dans Setting (clé fx.latest.json). */
const FX_MAX_RAW_CHARS = 200 * 1024;
/** Au-delà de 6 h, getLatestRates déclenche une actualisation paresseuse. */
const FX_STALE_MS = 6 * 60 * 60 * 1000;
/** Anti-martelage : après un échec réseau, on n'enfonce pas le fournisseur pendant 60 s. */
const FX_RETRY_AFTER_FAILURE_MS = 60_000;

/** Clés Setting pour la conservation du payload brut complet (survit aux redémarrages). */
const FX_SETTING_JSON = "fx.latest.json";
const FX_SETTING_FETCHED_AT = "fx.latest.fetchedAt";

/** Paires EUR → X conservées en base (devises ciblées par la plateforme). */
const CURATED_QUOTES = [
  "USD", "MAD", "GBP", "CHF", "CAD", "XOF", "XAF", "CNY", "INR", "BRL",
  "JPY", "AED", "SAR", "AUD", "NGN",
] as const;

interface ProviderPayload {
  result?: string;
  provider?: string;
  base_code?: string;
  time_last_update_unix?: number;
  terms?: string;
  rates?: Record<string, unknown>;
}

export type RefreshResult =
  | { ok: true; provider: string; fetchedAt: string; pairs: number }
  | { ok: false; error: string };

export type LatestRates = {
  source: "database";
  base: string;
  provider: string | null;
  /** Date (ISO) de la dernière récupération réelle — null si aucune donnée n'a jamais été obtenue. */
  fetchedAt: string | null;
  /** true = données plus anciennes que 6 h (ou actualisation paresseuse en échec). */
  stale: boolean;
  rates: Record<string, number>;
  /** Présent uniquement si une actualisation paresseuse a été tentée et a échoué. */
  error?: string;
};

/**
 * Appel réseau RÉEL au fournisseur (timeout 8 s via AbortSignal.timeout).
 * Renvoie les taux bruts sanitizés (nombres finis strictement positifs uniquement)
 * et le payload texte complet (truncation à 200 Ko pour archivage dans Setting).
 */
export async function fetchLatestRates(): Promise<
  | { ok: true; provider: string; fetchedAt: Date; rates: Record<string, number>; raw: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(FX_PROVIDER_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(FX_TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `Le fournisseur de taux a répondu HTTP ${res.status}` };
    const text = await res.text();
    let payload: ProviderPayload;
    try {
      payload = JSON.parse(text) as ProviderPayload;
    } catch {
      return { ok: false, error: "Le fournisseur de taux a renvoyé une réponse non JSON" };
    }
    if (payload.result !== "success" || !payload.rates || typeof payload.rates !== "object") {
      return {
        ok: false,
        error: `Réponse inattendue du fournisseur de taux (result=${String(payload.result ?? "absent")})`,
      };
    }
    // Sanitization stricte : seules les valeurs numériques finies et positives sont retenues.
    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(payload.rates)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) rates[code] = value;
    }
    if (Object.keys(rates).length === 0) {
      return { ok: false, error: "Le fournisseur de taux n'a renvoyé aucun taux exploitable" };
    }
    return {
      ok: true,
      provider: typeof payload.provider === "string" && payload.provider ? payload.provider : FX_PROVIDER_NAME,
      fetchedAt: new Date(),
      rates,
      raw: text.length > FX_MAX_RAW_CHARS ? text.slice(0, FX_MAX_RAW_CHARS) : text,
    };
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) {
      return { ok: false, error: `Fournisseur de taux injoignable (délai de ${FX_TIMEOUT_MS / 1000} s dépassé)` };
    }
    return {
      ok: false,
      error: `Échec de la récupération des taux : ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Actualisation effective : 1 appel réseau + upserts (ExchangeRate + Setting). */
async function doRefresh(): Promise<RefreshResult> {
  const fetched = await fetchLatestRates();
  if (!fetched.ok) {
    lastRefreshFailureAt = Date.now();
    return { ok: false, error: fetched.error };
  }
  try {
    let stored = 0;
    for (const quote of CURATED_QUOTES) {
      const rate = fetched.rates[quote];
      // Devise absente ou invalide dans la réponse réelle : on ne l'invente pas.
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
      await db.exchangeRate.upsert({
        where: {
          baseCurrency_quoteCurrency: { baseCurrency: FX_BASE_CURRENCY, quoteCurrency: quote },
        },
        update: { rate, provider: fetched.provider, fetchedAt: fetched.fetchedAt },
        create: {
          baseCurrency: FX_BASE_CURRENCY,
          quoteCurrency: quote,
          rate,
          provider: fetched.provider,
          fetchedAt: fetched.fetchedAt,
        },
      });
      stored += 1;
    }
    // Conservation du payload brut complet + horodatage (survit aux redémarrages).
    await db.setting.upsert({
      where: { key: FX_SETTING_JSON },
      update: { value: fetched.raw, updatedAt: fetched.fetchedAt },
      create: { key: FX_SETTING_JSON, value: fetched.raw },
    });
    await db.setting.upsert({
      where: { key: FX_SETTING_FETCHED_AT },
      update: { value: fetched.fetchedAt.toISOString(), updatedAt: fetched.fetchedAt },
      create: { key: FX_SETTING_FETCHED_AT, value: fetched.fetchedAt.toISOString() },
    });
    lastRefreshFailureAt = 0;
    return { ok: true, provider: fetched.provider, fetchedAt: fetched.fetchedAt.toISOString(), pairs: stored };
  } catch (e) {
    lastRefreshFailureAt = Date.now();
    return {
      ok: false,
      error: `Erreur d'enregistrement des taux : ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// Déduplication : plusieurs requêtes simultanées partagent la même actualisation en cours.
let inFlightRefresh: Promise<RefreshResult> | null = null;
// Horodatage du dernier échec (anti-martelage du fournisseur après panne réseau).
let lastRefreshFailureAt = 0;

export async function refreshExchangeRates(): Promise<RefreshResult> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = doRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

function newestFetchedAt(rows: { fetchedAt: Date }[]): Date | null {
  if (rows.length === 0) return null;
  return rows.reduce((acc, r) => (r.fetchedAt.getTime() > acc.getTime() ? r.fetchedAt : acc), rows[0].fetchedAt);
}

function ratesFromRows(rows: { quoteCurrency: string; rate: number }[]): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const r of rows) rates[r.quoteCurrency] = r.rate;
  return rates;
}

/**
 * Lecture des taux EUR stockés en base.
 * - Données plus récentes que 6 h → servies telles quelles.
 * - Données absentes ou > 6 h → actualisation paresseuse (un seul appel réseau grâce à
 *   la déduplication) ; en cas d'échec, on sert l'état stocké avec stale=true, ou un
 *   état vide honnête si la table n'a jamais été remplie. Aucun taux n'est inventé.
 */
export async function getLatestRates(): Promise<LatestRates> {
  const rows = await db.exchangeRate.findMany({ where: { baseCurrency: FX_BASE_CURRENCY } });
  const newest = newestFetchedAt(rows);
  const provider = rows.length > 0 ? rows[0].provider : null;
  const stale = newest !== null && Date.now() - newest.getTime() > FX_STALE_MS;

  if (rows.length === 0 || stale) {
    const recentFailure = Date.now() - lastRefreshFailureAt < FX_RETRY_AFTER_FAILURE_MS;
    if (!recentFailure) {
      const refreshed = await refreshExchangeRates();
      if (refreshed.ok) {
        const fresh = await db.exchangeRate.findMany({ where: { baseCurrency: FX_BASE_CURRENCY } });
        const freshNewest = newestFetchedAt(fresh);
        return {
          source: "database",
          base: FX_BASE_CURRENCY,
          provider: fresh.length > 0 ? fresh[0].provider : null,
          fetchedAt: freshNewest ? freshNewest.toISOString() : null,
          stale: false,
          rates: ratesFromRows(fresh),
        };
      }
      // Échec de l'actualisation : état stocké (flag stale) ou état vide honnête.
      if (rows.length === 0) {
        return {
          source: "database",
          base: FX_BASE_CURRENCY,
          provider: null,
          fetchedAt: null,
          stale: false,
          rates: {},
          error: refreshed.error,
        };
      }
      return {
        source: "database",
        base: FX_BASE_CURRENCY,
        provider,
        fetchedAt: newest ? newest.toISOString() : null,
        stale: true,
        rates: ratesFromRows(rows),
        error: refreshed.error,
      };
    }
    // Échec très récent : ne pas re-solliciter le fournisseur immédiatement.
    if (rows.length === 0) {
      return {
        source: "database",
        base: FX_BASE_CURRENCY,
        provider: null,
        fetchedAt: null,
        stale: false,
        rates: {},
        error: "Actualisation récente échouée — nouvel essai automatique dans quelques instants",
      };
    }
    return {
      source: "database",
      base: FX_BASE_CURRENCY,
      provider,
      fetchedAt: newest ? newest.toISOString() : null,
      stale: true,
      rates: ratesFromRows(rows),
    };
  }

  return {
    source: "database",
    base: FX_BASE_CURRENCY,
    provider,
    fetchedAt: newest ? newest.toISOString() : null,
    stale: false,
    rates: ratesFromRows(rows),
  };
}

/**
 * Conversion de centimes via le pivot EUR, à partir des taux STOCKÉS (aucun appel réseau,
 * aucune valeur approchée). Renvoie null si la conversion est impossible
 * (devise inconnue ou taux manquant en base). La valeur renvoyée est brute :
 * l'arrondi (centimes) relève de l'appelant.
 */
export async function convert(cents: number, from: string, to: string): Promise<number | null> {
  if (!Number.isFinite(cents)) return null;
  const src = from.trim().toUpperCase();
  const dst = to.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(src) || !/^[A-Z]{3}$/.test(dst)) return null;
  if (src === dst) return cents;

  const needed = [src, dst].filter((c) => c !== FX_BASE_CURRENCY);
  const rows = await db.exchangeRate.findMany({
    where: { baseCurrency: FX_BASE_CURRENCY, quoteCurrency: { in: needed } },
  });
  const rateOf = (code: string): number | null => {
    if (code === FX_BASE_CURRENCY) return 1; // 1 EUR = 1 EUR : identité de la devise de base
    const row = rows.find((r) => r.quoteCurrency === code);
    return row ? row.rate : null;
  };
  const eurToSrc = rateOf(src); // taux EUR → devise source
  const eurToDst = rateOf(dst); // taux EUR → devise cible
  if (eurToSrc === null || eurToDst === null) return null;
  return (cents / eurToSrc) * eurToDst;
}
