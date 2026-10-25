/**
 * GET / POST /api/admin/categories
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.read");
  if ("error" in guard) return guard.error;
  const items = await db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
  return ok({ items: items.map((c) => ({ ...c, productCount: c._count.products })) });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const slug = String(body?.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (name.length < 2) return err("Nom de catégorie requis.");
  if (!slug) return err("Slug requis.");
  const exists = await db.category.findUnique({ where: { slug } });
  if (exists) return err("Une catégorie avec ce slug existe déjà.");
  const created = await db.category.create({
    data: {
      name, slug,
      description: body.description ? String(body.description).slice(0, 500) : null,
      icon: body.icon ? String(body.icon).slice(0, 40) : null,
      sortOrder: parseInt(String(body.sortOrder || "100"), 10) || 100,
      isActive: body.isActive !== false,
    },
  });
  await audit(session, "category.create", "category", created.id, { name });
  return ok({ category: created }, { status: 201 });
}
