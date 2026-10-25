/**
 * GET  /api/admin/products?q=&status=&category=&page= — liste admin
 * POST /api/admin/products — création (catalog.write)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit, parseJsonArray } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

function slugify(title: string): string {
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.read");
  if ("error" in guard) return guard.error;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const status = sp.get("status") || "";
  const categoryId = sp.get("categoryId") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, parseInt(sp.get("perPage") || "20", 10) || 20);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (q) where.OR = [{ title: { contains: q } }, { slug: { contains: q } }];

  const [total, items] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * perPage, take: perPage,
      include: {
        category: true,
        media: { orderBy: { sortOrder: "asc" }, take: 1 },
        offers: { include: { partner: true } },
      },
    }),
  ]);

  return ok({
    items: items.map((p) => ({
      id: p.id, title: p.title, slug: p.slug, status: p.status,
      productType: p.productType, isDemo: p.isDemo,
      category: p.category ? { id: p.category.id, name: p.category.name } : null,
      image: p.media[0]?.url || null,
      priceMinCents: p.priceMinCents, priceMaxCents: p.priceMaxCents, currency: p.currency,
      priceNote: p.priceNote, allowInquiry: p.allowInquiry,
      offers: p.offers.map((o) => ({
        id: o.id, partnerName: o.partner.name, destinationUrl: o.destinationUrl,
        priceCents: o.priceCents, currency: o.currency, availability: o.availability,
        isActive: o.isActive, urlCheckStatus: o.urlCheckStatus, lastSyncedAt: o.lastSyncedAt,
        externalId: o.externalId,
      })),
      updatedAt: p.updatedAt,
    })),
    total, page, perPage,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");

  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  if (title.length < 3) return err("Le titre est obligatoire (3 caractères minimum).");
  if (description.length < 20) return err("La description est obligatoire (20 caractères minimum).");

  let slug = String(body.slug || "").trim() || slugify(title);
  const existing = await db.product.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now().toString(36)}`;

  const priceMin = body.priceMinCents != null ? parseInt(String(body.priceMinCents), 10) : null;
  const priceMax = body.priceMaxCents != null ? parseInt(String(body.priceMaxCents), 10) : null;
  if (priceMin != null && priceMin < 0) return err("Le prix ne peut pas être négatif.");
  if (priceMin != null && priceMax != null && priceMax < priceMin) return err("Le prix maximum doit être supérieur ou égal au prix minimum.");

  const product = await db.product.create({
    data: {
      title, slug, description,
      shortDescription: String(body.shortDescription || "").trim().slice(0, 300) || null,
      status: ["draft", "pending_review", "published", "suspended", "archived"].includes(body.status) ? body.status : "draft",
      productType: String(body.productType || "digital"),
      language: String(body.language || "fr"),
      countries: JSON.stringify(parseJsonArray(JSON.stringify(body.countries || []))),
      features: JSON.stringify(Array.isArray(body.features) ? body.features.slice(0, 20) : []),
      categoryId: body.categoryId || null,
      priceMinCents: priceMin, priceMaxCents: priceMax,
      currency: String(body.currency || "EUR"),
      priceNote: body.priceNote ? String(body.priceNote).slice(0, 80) : null,
      allowInquiry: body.allowInquiry === true,
      isDemo: body.isDemo === true,
      media: Array.isArray(body.media) && body.media.length
        ? { create: body.media.slice(0, 10).map((m: { url: string; altText?: string }, i: number) => ({ url: String(m.url), altText: m.altText ? String(m.altText).slice(0, 160) : null, sortOrder: i })) }
        : undefined,
    },
    include: { media: true },
  });

  // Offre optionnelle à la création
  if (body.offer && body.offer.partnerId && body.offer.destinationUrl) {
    await db.productOffer.create({
      data: {
        productId: product.id,
        partnerId: String(body.offer.partnerId),
        externalId: body.offer.externalId ? String(body.offer.externalId).slice(0, 80) : null,
        destinationUrl: String(body.offer.destinationUrl).trim(),
        priceCents: body.offer.priceCents != null ? parseInt(String(body.offer.priceCents), 10) : priceMin,
        currency: String(body.offer.currency || body.currency || "EUR"),
        availability: ["in_stock", "out_of_stock", "unknown"].includes(body.offer.availability) ? body.offer.availability : "unknown",
        urlCheckStatus: "unverified",
      },
    });
  }

  await audit(session, "product.create", "product", product.id, { title });
  return ok({ product }, { status: 201 });
}
