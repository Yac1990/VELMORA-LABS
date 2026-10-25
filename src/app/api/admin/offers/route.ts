/**
 * GET  /api/admin/offers?productId= — offres (une par partenaire possible)
 * POST /api/admin/offers — création d'offre
 * PUT  /api/admin/offers?id= — mise à jour (statut, URL, prix)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.read");
  if ("error" in guard) return guard.error;
  const productId = req.nextUrl.searchParams.get("productId");
  const offers = await db.productOffer.findMany({
    where: productId ? { productId } : undefined,
    include: { partner: true, product: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok({ offers });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body?.productId || !body?.partnerId || !body?.destinationUrl) {
    return err("productId, partnerId et destinationUrl sont requis.");
  }
  const partner = await db.partner.findUnique({ where: { id: String(body.partnerId) } });
  if (!partner) return err("Partenaire introuvable.", 404);

  const destinationUrl = String(body.destinationUrl).trim();
  try {
    const u = new URL(destinationUrl);
    if (!["http:", "https:"].includes(u.protocol)) return err("L'URL de destination doit être en http(s).");
  } catch {
    return err("URL de destination invalide.");
  }

  const created = await db.productOffer.create({
    data: {
      productId: String(body.productId),
      partnerId: String(body.partnerId),
      externalId: body.externalId ? String(body.externalId).slice(0, 80) : null,
      destinationUrl,
      priceCents: body.priceCents != null ? parseInt(String(body.priceCents), 10) : null,
      currency: String(body.currency || "EUR"),
      availability: ["in_stock", "out_of_stock", "unknown"].includes(body.availability) ? body.availability : "unknown",
      urlCheckStatus: "unverified",
    },
  });
  await audit(session, "offer.create", "product_offer", created.id, { destinationUrl });
  return ok({ offer: created }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body?.id) return err("id requis");
  const { id, ...rest } = body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (rest.destinationUrl != null) {
    try { new URL(String(rest.destinationUrl)); } catch { return err("URL invalide."); }
    data.destinationUrl = String(rest.destinationUrl);
    data.urlCheckStatus = "unverified";
  }
  if (rest.priceCents !== undefined) data.priceCents = rest.priceCents != null ? parseInt(String(rest.priceCents), 10) : null;
  if (rest.availability != null) data.availability = String(rest.availability);
  if (rest.isActive !== undefined) data.isActive = rest.isActive === true;
  if (rest.externalId !== undefined) data.externalId = rest.externalId ? String(rest.externalId).slice(0, 80) : null;

  const updated = await db.productOffer.update({ where: { id: String(id) }, data });
  await audit(session, "offer.update", "product_offer", String(id), { fields: Object.keys(data) });
  return ok({ offer: updated });
}

export async function DELETE(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return err("id requis");
  const clicks = await db.clickEvent.count({ where: { offerId: id } });
  if (clicks > 0) {
    await db.productOffer.update({ where: { id }, data: { isActive: false } });
    await audit(session, "offer.deactivate_has_clicks", "product_offer", id, { clicks });
    return ok({ deactivated: true, message: "Offre désactivée : des clics y sont rattachés." });
  }
  await db.productOffer.delete({ where: { id } });
  await audit(session, "offer.delete", "product_offer", id);
  return ok({ deleted: true });
}
