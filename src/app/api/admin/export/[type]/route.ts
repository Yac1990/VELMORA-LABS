/**
 * GET /api/admin/export/[type]?period=...&includeDemo=...
 * Exports CSV : clicks | conversions | contacts | products | dashboard
 * Chaque export mentionne la période, la devise, le fuseau et la source des données.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requirePermission, toCsv } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const sp = req.nextUrl.searchParams;
  const includeDemo = sp.get("includeDemo") !== "false";
  const permission =
    type === "contacts" ? "crm.read" :
    type === "products" ? "catalog.read" : "dashboard.read";
  const guard = await requirePermission(req, permission as never);
  if ("error" in guard) return guard.error;
  const session = guard.session;

  const days = parseInt(sp.get("days") || "90", 10) || 90;
  const since = new Date(Date.now() - days * 86400000);
  const header = `# VELMORA LABS — export ${type}\n# Période : ${since.toISOString().slice(0, 10)} → ${new Date().toISOString().slice(0, 10)} (UTC)\n# Généré : ${new Date().toISOString()} par ${session.email}\n# Source : base de données de l'application — ${includeDemo ? "inclut les données marquées DÉMO" : "données réelles uniquement"}\n# Devise : variable selon les lignes (colonne currency)\n`;

  let rows: Record<string, unknown>[] = [];

  if (type === "clicks") {
    const clicks = await db.clickEvent.findMany({
      where: { clickedAt: { gte: since }, ...(includeDemo ? {} : { isDemo: false }) },
      include: { offer: { include: { product: { select: { title: true } } } } },
      orderBy: { clickedAt: "desc" }, take: 5000,
    });
    rows = clicks.map((c) => ({
      date: c.clickedAt.toISOString(), product: c.offer?.product?.title || "", offer_id: c.offerId,
      campaign: c.campaignId || "", sub_id: c.subId || "", country: c.countryCoarse || "",
      is_demo: c.isDemo ? "OUI" : "non",
    }));
  } else if (type === "conversions") {
    const convs = await db.conversion.findMany({
      where: { reportedAt: { gte: since }, ...(includeDemo ? {} : { isDemo: false }) },
      include: { partner: { select: { name: true } }, offer: { include: { product: { select: { title: true } } } } },
      orderBy: { reportedAt: "desc" }, take: 5000,
    });
    rows = convs.map((c) => ({
      date: c.reportedAt.toISOString(), partner: c.partner.name, external_id: c.externalConversionId,
      product: c.offer?.product?.title || "", status: c.status,
      order_value: c.orderValueCents != null ? (c.orderValueCents / 100).toFixed(2) : "",
      order_currency: c.orderCurrency || "", commission: c.commissionAmountCents != null ? (c.commissionAmountCents / 100).toFixed(2) : "",
      commission_currency: c.commissionCurrency || "",
      is_demo: c.isDemo ? "OUI" : "non",
    }));
  } else if (type === "contacts") {
    const contacts = await db.crmContact.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    rows = contacts.map((c) => ({
      date: c.createdAt.toISOString(), name: c.name, email: c.email || "", phone: c.phone || "",
      country: c.country || "", status: c.status, source: c.source || "",
      consent: c.consentStatus, is_demo: c.isDemo ? "OUI" : "non", anonymized: c.anonymizedAt ? "OUI" : "non",
    }));
  } else if (type === "products") {
    const products = await db.product.findMany({ include: { category: true }, orderBy: { updatedAt: "desc" } });
    rows = products.map((p) => ({
      title: p.title, slug: p.slug, status: p.status, type: p.productType,
      category: p.category?.name || "", currency: p.currency,
      price_min: p.priceMinCents != null ? (p.priceMinCents / 100).toFixed(2) : "",
      price_max: p.priceMaxCents != null ? (p.priceMaxCents / 100).toFixed(2) : "",
      is_demo: p.isDemo ? "OUI" : "non", updated_at: p.updatedAt.toISOString(),
    }));
  } else if (type === "dashboard") {
    const convs = await db.conversion.groupBy({
      by: ["status"], where: { reportedAt: { gte: since }, ...(includeDemo ? {} : { isDemo: false }) },
      _count: true, _sum: { commissionAmountCents: true, orderValueCents: true },
    });
    const clicksTotal = await db.clickEvent.count({ where: { clickedAt: { gte: since }, ...(includeDemo ? {} : { isDemo: false }) } });
    rows = [
      { metric: "clics (redirections partenaires)", value: clicksTotal, note: "ce ne sont pas des ventes" },
      ...convs.map((c) => ({
        metric: `conversions statut ${c.status}`, value: c._count,
        note: `valeur commandes: ${((c._sum.orderValueCents || 0) / 100).toFixed(2)} | commissions site: ${((c._sum.commissionAmountCents || 0) / 100).toFixed(2)}`,
      })),
    ];
  } else {
    return new Response("Type d'export inconnu. Valeurs : clicks, conversions, contacts, products, dashboard", { status: 404 });
  }

  const csv = header + "\n" + toCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="velmora-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
