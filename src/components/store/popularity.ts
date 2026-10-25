"use client";

/**
 * Popularité réelle des produits (clics sortants enregistrés via /api/go, 30 jours).
 * Un seul appel réseau partagé par page, avec cache mémoire module (60 s, aligné sur
 * le cache serveur). Aucune invention : si un produit n'a aucun clic, il n'a pas d'étoile.
 */
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";

export interface PopularityProduct {
  productId: string;
  slug: string;
  title: string;
  isDemo: boolean;
  clicks30d: number;
  stars: number;
}

export interface PopularityData {
  periodDays: number;
  generatedAt: string;
  maxClicks: number;
  note: string;
  products: PopularityProduct[];
}

const CLIENT_CACHE_TTL_MS = 60_000;

let cache: { at: number; data: PopularityData } | null = null;
let inflight: Promise<PopularityData> | null = null;

async function loadPopularity(): Promise<PopularityData> {
  if (cache && Date.now() - cache.at < CLIENT_CACHE_TTL_MS) return cache.data;
  if (!inflight) {
    inflight = apiGet<PopularityData>("/api/public/popularity")
      .then((d) => {
        cache = { at: Date.now(), data: d };
        return d;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Données de popularité partagées (déjà en cache → rendu immédiat, sans scintillement). */
export function usePopularity(): { data: PopularityData | null; error: boolean } {
  const [data, setData] = useState<PopularityData | null>(() => (cache ? cache.data : null));
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await loadPopularity();
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}

/** Entrée de popularité d'un produit (null si inconnu ou aucun clic). */
export function popularityFor(
  list: PopularityProduct[] | null | undefined,
  productId: string
): PopularityProduct | null {
  if (!list) return null;
  return list.find((p) => p.productId === productId) ?? null;
}
