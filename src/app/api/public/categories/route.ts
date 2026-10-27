import { db } from "@/lib/db";
import { okCached } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/public/categories — catégories actives avec nombre de produits publiés
export async function GET() {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { status: "published" } } } } },
  });
  return okCached({
    items: categories.map((c) => ({
      id: c.id, slug: c.slug, name: c.name, icon: c.icon,
      description: c.description,
      productCount: c._count.products,
    })),
  });
}
