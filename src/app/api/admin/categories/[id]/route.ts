/**
 * PUT / DELETE /api/admin/categories/[id]
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");
  const existing = await db.category.findUnique({ where: { id } });
  if (!existing) return err("Catégorie introuvable", 404);

  const data: Record<string, unknown> = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0, 500) : null;
  if (body.icon !== undefined) data.icon = body.icon ? String(body.icon).slice(0, 40) : null;
  if (body.sortOrder != null) data.sortOrder = parseInt(String(body.sortOrder), 10) || 100;
  if (body.isActive !== undefined) data.isActive = body.isActive === true;

  const updated = await db.category.update({ where: { id }, data });
  await audit(session, "category.update", "category", id, { fields: Object.keys(data) });
  return ok({ category: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const count = await db.product.count({ where: { categoryId: id } });
  if (count > 0) {
    await db.category.update({ where: { id }, data: { isActive: false } });
    await audit(session, "category.deactivate_has_products", "category", id, { products: count });
    return ok({ deactivated: true, message: `Catégorie désactivée : ${count} produit(s) y sont rattachés.` });
  }
  await db.category.delete({ where: { id } });
  await audit(session, "category.delete", "category", id);
  return ok({ deleted: true });
}
