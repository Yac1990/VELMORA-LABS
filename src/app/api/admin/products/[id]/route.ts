/**
 * GET / PUT / DELETE /api/admin/products/[id]
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["draft", "pending_review", "published", "suspended", "archived"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "catalog.read");
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: true,
      media: { orderBy: { sortOrder: "asc" } },
      offers: { include: { partner: true } },
    },
  });
  if (!product) return err("Produit introuvable", 404);
  return ok({ product });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");

  const product = await db.product.findUnique({ where: { id } });
  if (!product) return err("Produit introuvable", 404);

  const data: Record<string, unknown> = {};
  if (body.title != null) {
    const title = String(body.title).trim();
    if (title.length < 3) return err("Titre trop court.");
    data.title = title;
  }
  if (body.description != null) {
    const description = String(body.description).trim();
    if (description.length < 20) return err("Description trop courte (20 caractères minimum).");
    data.description = description;
  }
  if (body.shortDescription != null) data.shortDescription = String(body.shortDescription).trim().slice(0, 300) || null;
  if (body.status != null) {
    if (!VALID_STATUSES.includes(body.status)) return err("Statut invalide.");
    data.status = body.status;
  }
  if (body.productType != null) data.productType = String(body.productType);
  if (body.language != null) data.language = String(body.language);
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.countries != null) data.countries = JSON.stringify(Array.isArray(body.countries) ? body.countries : []);
  if (body.features != null) data.features = JSON.stringify(Array.isArray(body.features) ? body.features.slice(0, 20) : []);
  if (body.priceMinCents !== undefined) data.priceMinCents = body.priceMinCents != null ? parseInt(String(body.priceMinCents), 10) : null;
  if (body.priceMaxCents !== undefined) data.priceMaxCents = body.priceMaxCents != null ? parseInt(String(body.priceMaxCents), 10) : null;
  if (body.currency != null) data.currency = String(body.currency);
  if (body.priceNote !== undefined) data.priceNote = body.priceNote ? String(body.priceNote).slice(0, 80) : null;
  if (body.allowInquiry !== undefined) data.allowInquiry = body.allowInquiry === true;

  if (data.priceMinCents != null && data.priceMaxCents != null && (data.priceMaxCents as number) < (data.priceMinCents as number)) {
    return err("Le prix maximum doit être supérieur ou égal au prix minimum.");
  }

  // Remplacement des médias si fournis
  if (Array.isArray(body.media)) {
    await db.productMedia.deleteMany({ where: { productId: id } });
    if (body.media.length) {
      await db.productMedia.createMany({
        data: body.media.slice(0, 10).map((m: { url: string; altText?: string }, i: number) => ({
          productId: id, url: String(m.url), altText: m.altText ? String(m.altText).slice(0, 160) : null, sortOrder: i,
        })),
      });
    }
  }

  const updated = await db.product.update({ where: { id }, data });
  await audit(session, "product.update", "product", id, { fields: Object.keys(data) });
  return ok({ product: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id } });
  if (!product) return err("Produit introuvable", 404);
  // Archivage plutôt que suppression physique si le produit a des clics/conversions
  const clicks = await db.clickEvent.count({ where: { offer: { productId: id } } });
  if (clicks > 0) {
    await db.product.update({ where: { id }, data: { status: "archived" } });
    await audit(session, "product.archive_soft_delete", "product", id, { clicks });
    return ok({ archived: true, message: "Produit archivé (des clics historiques y sont rattachés)." });
  }
  await db.product.delete({ where: { id } });
  await audit(session, "product.delete", "product", id, { title: product.title });
  return ok({ deleted: true });
}
