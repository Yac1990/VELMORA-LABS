import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, parseJsonArray } from "@/lib/api-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/public/catalog?q=&category=&type=&sort=&page=&perPage=&includeDemo=
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`catalog:${ip}`, 120, 60_000);
  if (!rl.allowed) return err("Trop de requêtes", 429, { retryAfterSec: rl.retryAfterSec });

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const category = sp.get("category") || "";
  const type = sp.get("type") || "";
  const sort = sp.get("sort") || "recent";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = Math.min(48, Math.max(6, parseInt(sp.get("perPage") || "12", 10) || 12));
  const includeDemo = sp.get("includeDemo") !== "false";

  const where: Record<string, unknown> = { status: "published" };
  if (!includeDemo) where.isDemo = false;
  if (category) where.category = { slug: category };
  if (type) where.productType = type;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { shortDescription: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const orderBy: Record<string, "asc" | "desc"> =
    sort === "price_asc" ? { priceMinCents: "asc" } :
    sort === "price_desc" ? { priceMinCents: "desc" } :
    { createdAt: "desc" };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where, orderBy, skip: (page - 1) * perPage, take: perPage,
      include: {
        category: true,
        media: { orderBy: { sortOrder: "asc" }, take: 1 },
        offers: {
          where: { isActive: true },
          include: { partner: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  ]);

  return ok({
    items: products.map((p) => ({
      id: p.id, slug: p.slug, title: p.title,
      shortDescription: p.shortDescription,
      productType: p.productType,
      category: p.category ? { slug: p.category.slug, name: p.category.name } : null,
      image: p.media[0]?.url || null,
      priceMinCents: p.priceMinCents, priceMaxCents: p.priceMaxCents,
      currency: p.currency, priceNote: p.priceNote,
      allowInquiry: p.allowInquiry, isDemo: p.isDemo,
      updatedAt: p.updatedAt,
      partnerCount: p.offers.length,
      partnerName: p.offers[0]?.partner?.name || null,
      availability: p.offers[0]?.availability || "unknown",
    })),
    total, page, perPage, pages: Math.ceil(total / perPage),
  });
}
