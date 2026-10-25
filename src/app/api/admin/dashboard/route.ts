/**
 * GET /api/admin/dashboard?period=7d&from=&to=&includeDemo=true
 * Indicateurs RÉELS calculés depuis ClickEvent et Conversion.
 * - Les clics ne sont jamais présentés comme des ventes.
 * - Les commissions sont séparées par état (estimée / en attente / confirmée / annulée / payée).
 * - La source des données (démo incluse ou non) est explicitement indiquée.
 * Sprint B : SQL brut en syntaxe PostgreSQL (identifiants entre guillemets, to_char,
 * booléens natifs, ::int pour éviter les bigint non sérialisables en JSON).
 */
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

function periodRange(period: string, from?: string | null, to?: string | null): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  switch (period) {
    case "today": start.setHours(0, 0, 0, 0); return { start, end, label: "Aujourd'hui" };
    case "7d": start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); return { start, end, label: "7 derniers jours" };
    case "month": start.setDate(1); start.setHours(0, 0, 0, 0); return { start, end, label: "Mois courant" };
    case "quarter": { const q = Math.floor(now.getMonth() / 3); start.setMonth(q * 3, 1); start.setHours(0, 0, 0, 0); return { start, end, label: "Trimestre courant" }; }
    case "year": start.setMonth(0, 1); start.setHours(0, 0, 0, 0); return { start, end, label: "Année courante" };
    case "custom": {
      const s = from ? new Date(from) : new Date(now.getTime() - 30 * 86400000);
      const e = to ? new Date(to) : end;
      s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999);
      return { start: s, end: e, label: "Période personnalisée" };
    }
    default: start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0); return { start, end, label: "30 derniers jours" };
  }
}

function previousRange(start: Date, end: Date): { start: Date; end: Date } {
  const span = end.getTime() - start.getTime();
  return { start: new Date(start.getTime() - span), end: new Date(start.getTime() - 1) };
}

type CommissionsMap = Record<string, { count: number; commissionCents: number; orderValueCents: number }>;

async function commissions(where: Record<string, unknown>): Promise<CommissionsMap> {
  const rows = await db.conversion.groupBy({
    by: ["status"],
    where,
    _sum: { commissionAmountCents: true, orderValueCents: true },
    _count: true,
  });
  const map: Record<string, { count: number; commissionCents: number; orderValueCents: number }> = {};
  for (const r of rows) {
    map[r.status] = { count: r._count, commissionCents: r._sum.commissionAmountCents || 0, orderValueCents: r._sum.orderValueCents || 0 };
  }
  return map;
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.read");
  if ("error" in guard) return guard.error;
  const sp = req.nextUrl.searchParams;
  const includeDemo = sp.get("includeDemo") !== "false";
  const { start, end, label } = periodRange(
    sp.get("period") || "30d", sp.get("from"), sp.get("to")
  );
  const prev = previousRange(start, end);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const demoFilter = includeDemo ? {} : { isDemo: false };
  const clickWhere = { clickedAt: { gte: start, lte: end }, ...demoFilter };
  const convWhere = { reportedAt: { gte: start, lte: end }, ...demoFilter };

  const [totalClicks, uniqueSessions, prevClicks, currentCommissions, prevCommissions, dailyClicks, dailyConversions, topOffers, topCategories, topPartners, campaignsCount, brokenLinks, topConversionsRows, commissionsByProduct] = await Promise.all([
    db.clickEvent.count({ where: clickWhere }),
    db.clickEvent.groupBy({ by: ["anonymousSessionId"], where: clickWhere, _count: true }),
    db.clickEvent.count({ where: { clickedAt: { gte: prev.start, lte: prev.end }, ...demoFilter } }),
    commissions(convWhere),
    commissions({ reportedAt: { gte: prev.start, lte: prev.end }, ...demoFilter }),
    // Postgres : DateTime natif → to_char en UTC (Prisma stocke les timestamps en UTC).
    // includeDemo ? Prisma.empty : filtre isDemo = false (booléen natif PostgreSQL).
    db.$queryRaw<{ day: string; c: number }[]>`
      SELECT to_char("clickedAt", 'YYYY-MM-DD') as day, COUNT(*)::int as c
      FROM "ClickEvent"
      WHERE "clickedAt" >= ${start} AND "clickedAt" <= ${end}${includeDemo ? Prisma.empty : Prisma.sql` AND "isDemo" = false`}
      GROUP BY to_char("clickedAt", 'YYYY-MM-DD') ORDER BY day`,
    db.$queryRaw<{ day: string; c: number }[]>`
      SELECT to_char("reportedAt", 'YYYY-MM-DD') as day, COUNT(*)::int as c
      FROM "Conversion"
      WHERE "reportedAt" >= ${start} AND "reportedAt" <= ${end}${includeDemo ? Prisma.empty : Prisma.sql` AND "isDemo" = false`}
      GROUP BY to_char("reportedAt", 'YYYY-MM-DD') ORDER BY day`,
    db.clickEvent.groupBy({ by: ["offerId"], where: clickWhere, _count: true, orderBy: { _count: { offerId: "desc" } }, take: 6 }),
    db.$queryRaw<{ name: string; c: number }[]>`
      SELECT ca."name" as name, COUNT(ce."id")::int as c
      FROM "ClickEvent" ce
      JOIN "ProductOffer" po ON po."id" = ce."offerId"
      JOIN "Product" p ON p."id" = po."productId"
      JOIN "Category" ca ON ca."id" = p."categoryId"
      WHERE ce."clickedAt" >= ${start} AND ce."clickedAt" <= ${end}${includeDemo ? Prisma.empty : Prisma.sql` AND ce."isDemo" = false`}
      GROUP BY ca."name" ORDER BY c DESC LIMIT 6`,
    db.clickEvent.groupBy({ by: ["partnerId"], where: clickWhere, _count: true, orderBy: { _count: { partnerId: "desc" } }, take: 5 }),
    db.campaign.count(),
    db.productOffer.count({ where: { urlCheckStatus: "broken" } }),
    // Produits les plus achetés — conversions RAPPORTÉES rattachées à un produit via l'offre.
    // Jamais assimilées à des ventes certaines : les statuts sont renvoyés en détail.
    db.$queryRaw<{
      productId: string; title: string; slug: string; isDemo: boolean;
      total: number;
      estimated: number; pending: number; confirmed: number; cancelled: number; paid: number; unknown: number;
    }[]>`
      SELECT p."id" as "productId", p."title" as "title", p."slug" as "slug", p."isDemo" as "isDemo",
             COUNT(*)::int as total,
             SUM(CASE WHEN c."status" = 'estimated' THEN 1 ELSE 0 END)::int as estimated,
             SUM(CASE WHEN c."status" = 'pending' THEN 1 ELSE 0 END)::int as pending,
             SUM(CASE WHEN c."status" = 'confirmed' THEN 1 ELSE 0 END)::int as confirmed,
             SUM(CASE WHEN c."status" = 'cancelled' THEN 1 ELSE 0 END)::int as cancelled,
             SUM(CASE WHEN c."status" = 'paid' THEN 1 ELSE 0 END)::int as paid,
             SUM(CASE WHEN c."status" = 'unknown' THEN 1 ELSE 0 END)::int as unknown
      FROM "Conversion" c
      JOIN "ProductOffer" po ON po."id" = c."offerId"
      JOIN "Product" p ON p."id" = po."productId"
      WHERE c."reportedAt" >= ${start} AND c."reportedAt" <= ${end}${includeDemo ? Prisma.empty : Prisma.sql` AND c."isDemo" = false`}
      GROUP BY p."id", p."title", p."slug", p."isDemo"
      ORDER BY total DESC
      LIMIT 8`,
    // Commissions par produit ET par devise d'origine (jamais de sommation inter-devises).
    db.$queryRaw<{ productId: string; currency: string; total: number }[]>`
      SELECT p."id" as "productId", c."commissionCurrency" as "currency", SUM(c."commissionAmountCents")::int as total
      FROM "Conversion" c
      JOIN "ProductOffer" po ON po."id" = c."offerId"
      JOIN "Product" p ON p."id" = po."productId"
      WHERE c."reportedAt" >= ${start} AND c."reportedAt" <= ${end}${includeDemo ? Prisma.empty : Prisma.sql` AND c."isDemo" = false`}
        AND c."commissionAmountCents" IS NOT NULL
      GROUP BY p."id", c."commissionCurrency"`,
  ]);

  // Classement « le mieux acheté » : priorité aux conversions confirmées ou payées
  // (les plus fiables) ; à défaut, produit le plus rapporté toutes statuts confondus.
  const topConversions = topConversionsRows.map((r) => ({
    productId: r.productId,
    title: r.title,
    slug: r.slug,
    isDemo: r.isDemo,
    total: Number(r.total),
    byStatus: {
      estimated: Number(r.estimated), pending: Number(r.pending), confirmed: Number(r.confirmed),
      cancelled: Number(r.cancelled), paid: Number(r.paid), unknown: Number(r.unknown),
    },
    commissionTotals: commissionsByProduct
      .filter((c) => c.productId === r.productId && c.currency)
      .map((c) => ({ currency: c.currency, amountCents: Number(c.total) })),
  }));
  const best = topConversions.find((p) => (p.byStatus.confirmed + p.byStatus.paid) > 0)
    || topConversions.find((p) => p.byStatus.cancelled < p.total)
    || null;
  const bestSeller = best
    ? {
        productId: best.productId, title: best.title, slug: best.slug, isDemo: best.isDemo,
        conversions: best.byStatus.confirmed + best.byStatus.paid > 0
          ? best.byStatus.confirmed + best.byStatus.paid
          : best.total,
        basis: best.byStatus.confirmed + best.byStatus.paid > 0
          ? "Conversions confirmées ou payées sur la période"
          : "Conversions rapportées (aucune encore confirmée) sur la période",
      }
    : null;

  const offerIds = topOffers.map((o) => o.offerId);
  const offersWithMeta = offerIds.length ? await db.productOffer.findMany({
    where: { id: { in: offerIds } },
    include: { product: { select: { title: true, slug: true } } },
  }) : [];
  const partnerIds = topPartners.map((p) => p.partnerId);
  const partnersMeta = partnerIds.length ? await db.partner.findMany({ where: { id: { in: partnerIds } } }) : [];

  const sumCommissions = (m: Record<string, { count: number; commissionCents: number }>) =>
    Object.values(m).reduce((acc, v) => acc + v.commissionCents, 0);

  return ok({
    meta: {
      periodLabel: label,
      start: startIso, end: endIso,
      timezone: "UTC",
      includeDemo,
      dataSource: includeDemo
        ? "Données réelles + données de DÉMONSTRATION clairement marquées (isDemo=true). Les conversions démo sont fictives."
        : "Données réelles uniquement (clics via /api/go, conversions importées).",
      generatedAt: new Date().toISOString(),
      comparisonLabel: "vs période précédente équivalente",
    },
    clicks: {
      total: totalClicks,
      unique: uniqueSessions.length,
      previous: prevClicks,
      deltaPct: prevClicks > 0 ? Math.round(((totalClicks - prevClicks) / prevClicks) * 100) : null,
      note: "Un clic = une redirection vers le partenaire. Ce n'est PAS une vente.",
    },
    conversions: {
      byStatus: Object.fromEntries(Object.entries(currentCommissions).map(([k, v]) => [k, v.count])),
      total: Object.values(currentCommissions).reduce((a, v) => a + v.count, 0),
      note: "« Conversions rapportées » : signalées par les partenaires ou importées — jamais assimilées à des ventes certaines.",
    },
    commissions: {
      byStatus: Object.fromEntries(Object.entries(currentCommissions).map(([k, v]) => [k, v.commissionCents])),
      totalCents: sumCommissions(currentCommissions),
      prevTotalCents: sumCommissions(prevCommissions),
      note: "Commissions du SITE (revenu d'affiliation). Le chiffre d'affaires marchand est compté séparément.",
    },
    series: {
      clicks: dailyClicks.map((d) => ({ day: d.day, count: d.c })),
      conversions: dailyConversions.map((d) => ({ day: d.day, count: d.c })),
    },
    topOffers: topOffers.map((o) => {
      const meta = offersWithMeta.find((m) => m.id === o.offerId);
      return { offerId: o.offerId, clicks: o._count, title: meta?.product.title || "(offre supprimée)", slug: meta?.product.slug || null };
    }),
    topCategories: topCategories.map((c) => ({ name: c.name, clicks: c.c })),
    topConversions,
    bestSeller,
    topConversionsNote: "Classement établi sur les conversions RAPPORTÉES (signalées par les partenaires ou importées) — jamais assimilées à des ventes certaines. Conversions sans offre rattachable non comptées.",
    topPartners: topPartners.map((p) => {
      const meta = partnersMeta.find((m) => m.id === p.partnerId);
      return { name: meta?.name || "(partenaire supprimé)", clicks: p._count, isDemo: meta?.isDemo ?? false };
    }),
    health: { campaignsCount, brokenLinks },
  });
}
