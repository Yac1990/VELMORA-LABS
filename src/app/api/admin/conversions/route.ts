/**
 * GET / PUT /api/admin/conversions — liste et mise à jour de statut
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["estimated", "pending", "confirmed", "cancelled", "paid", "unknown"];

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "conversions.read");
  if ("error" in guard) return guard.error;
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, parseInt(sp.get("perPage") || "25", 10) || 25);
  const includeDemo = sp.get("includeDemo") !== "false";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (!includeDemo) where.isDemo = false;

  const [total, items] = await Promise.all([
    db.conversion.count({ where }),
    db.conversion.findMany({
      where,
      orderBy: { reportedAt: "desc" },
      skip: (page - 1) * perPage, take: perPage,
      include: {
        partner: { select: { name: true, isDemo: true } },
        offer: { include: { product: { select: { title: true, slug: true } } } },
      },
    }),
  ]);

  return ok({
    items: items.map((c) => ({
      id: c.id,
      partnerName: c.partner.name, isDemo: c.isDemo || c.partner.isDemo,
      externalConversionId: c.externalConversionId,
      reportedAt: c.reportedAt, status: c.status,
      orderValueCents: c.orderValueCents, orderCurrency: c.orderCurrency,
      commissionAmountCents: c.commissionAmountCents, commissionCurrency: c.commissionCurrency,
      sourceReportId: c.sourceReportId,
      productTitle: c.offer?.product.title || null,
      note: c.note,
    })),
    total, page, perPage,
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "conversions.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body?.id || !body?.status) return err("id et status requis.");
  if (!VALID_STATUSES.includes(body.status)) return err("Statut invalide.");

  const existing = await db.conversion.findUnique({ where: { id: String(body.id) } });
  if (!existing) return err("Conversion introuvable.", 404);

  const updated = await db.conversion.update({
    where: { id: String(body.id) },
    data: { status: body.status, note: body.note ? String(body.note).slice(0, 500) : existing.note },
  });
  await db.commissionTransaction.create({
    data: {
      conversionId: updated.id,
      eventType: body.status,
      amountCents: updated.commissionAmountCents,
      currency: updated.commissionCurrency,
      occurredAt: new Date(),
      notes: `Statut changé ${existing.status} → ${body.status} par ${session.email}`,
    },
  });
  await audit(session, "conversion.status_update", "conversion", updated.id, { from: existing.status, to: body.status });
  return ok({ conversion: updated });
}
