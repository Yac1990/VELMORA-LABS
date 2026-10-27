/**
 * GET /api/public/popularity — popularité RÉELLE des produits publiés.
 *
 * Mesure : clics sortants enregistrés via /api/go (redirections vers les partenaires)
 * sur les 30 derniers jours. Une étoile = un niveau d'intérêt des visiteurs mesuré
 * par les clics — ce ne sont NI des notes d'acheteurs, NI des ventes, NI des avis.
 *
 * Échelle relative et calculée côté serveur : 5 étoiles pour le produit le plus
 * cliqué de la période, proportionnalité pour les autres, minimum 1 étoile dès
 * le premier clic. Les produits sans clic n'apparaissent pas (aucune étoile inventée).
 *
 * Cache mémoire local de 60 s (données agrégées et non personnelles).
 */
import { db } from "@/lib/db";
import { okCached } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const PERIOD_DAYS = 30;
const CACHE_TTL_MS = 60_000;

interface PopularityEntry {
  productId: string;
  slug: string;
  title: string;
  isDemo: boolean;
  clicks30d: number;
  stars: number;
}

let cache: { at: number; data: unknown } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return okCached(cache.data);
  }

  const since = new Date(Date.now() - PERIOD_DAYS * 86_400_000);

  // Agrégation réelle : clics → offre → produit publié.
  const grouped = await db.clickEvent.groupBy({
    by: ["offerId"],
    where: { clickedAt: { gte: since } },
    _count: true,
  });

  if (grouped.length === 0) {
    const empty = {
      periodDays: PERIOD_DAYS,
      generatedAt: new Date().toISOString(),
      maxClicks: 0,
      note:
        "Popularité mesurée uniquement par les clics sortants enregistrés (redirections vers les partenaires). Ce ne sont ni des notes d'acheteurs ni des ventes.",
      products: [] as PopularityEntry[],
    };
    cache = { at: Date.now(), data: empty };
    return okCached(empty);
  }

  const offers = await db.productOffer.findMany({
    where: { id: { in: grouped.map((g) => g.offerId) } },
    select: {
      id: true,
      product: {
        select: {
          id: true, slug: true, title: true, isDemo: true,
          status: true,
        },
      },
    },
  });

  // Regroupement par produit (un produit peut avoir plusieurs offres).
  const byProduct = new Map<string, PopularityEntry>();
  for (const g of grouped) {
    const offer = offers.find((o) => o.id === g.offerId);
    if (!offer || offer.product.status !== "published") continue;
    const existing = byProduct.get(offer.product.id);
    if (existing) existing.clicks30d += g._count;
    else {
      byProduct.set(offer.product.id, {
        productId: offer.product.id,
        slug: offer.product.slug,
        title: offer.product.title,
        isDemo: offer.product.isDemo,
        clicks30d: g._count,
        stars: 0,
      });
    }
  }

  const products = Array.from(byProduct.values()).sort((a, b) => b.clicks30d - a.clicks30d);
  const maxClicks = products.length ? products[0].clicks30d : 0;
  for (const p of products) {
    p.stars = maxClicks > 0 ? Math.max(1, Math.round((5 * p.clicks30d) / maxClicks)) : 0;
  }

  const data = {
    periodDays: PERIOD_DAYS,
    generatedAt: new Date().toISOString(),
    maxClicks,
    note:
      "Popularité mesurée uniquement par les clics sortants enregistrés (redirections vers les partenaires) sur les 30 derniers jours. Échelle relative : le produit le plus cliqué obtient 5 étoiles. Ce ne sont ni des notes d'acheteurs ni des ventes.",
    products,
  };

  cache = { at: Date.now(), data: data };
  return okCached(data);
}
