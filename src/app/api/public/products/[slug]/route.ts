import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/public/products/[slug]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await db.product.findUnique({
    where: { slug },
    include: {
      category: true,
      media: { orderBy: { sortOrder: "asc" } },
      offers: {
        where: { isActive: true },
        include: { partner: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!product || product.status !== "published") {
    return err("Produit introuvable ou non publié", 404);
  }

  // Règle de commission : affichée seulement si documentée, sinon « inconnue »
  const rules = await db.commissionRule.findMany({
    where: { partnerId: { in: product.offers.map((o) => o.partnerId) }, validTo: null },
  });

  return ok({
    id: product.id, slug: product.slug, title: product.title,
    shortDescription: product.shortDescription,
    description: product.description,
    status: product.status,
    productType: product.productType,
    language: product.language,
    countries: JSON.parse(product.countries || "[]"),
    features: JSON.parse(product.features || "[]"),
    priceMinCents: product.priceMinCents,
    priceMaxCents: product.priceMaxCents,
    currency: product.currency,
    priceNote: product.priceNote,
    allowInquiry: product.allowInquiry,
    isDemo: product.isDemo,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    category: product.category ? { slug: product.category.slug, name: product.category.name } : null,
    media: product.media.map((m) => ({ url: m.url, altText: m.altText })),
    offers: product.offers.map((o) => {
      const rule = rules.find((r) => r.partnerId === o.partnerId);
      return {
        id: o.id,
        partnerName: o.partner.name,
        partnerIsDemo: o.partner.isDemo,
        programType: o.partner.programType,
        priceCents: o.priceCents,
        currency: o.currency,
        availability: o.availability,
        lastSyncedAt: o.lastSyncedAt,
        urlCheckStatus: o.urlCheckStatus,
        commission: rule && rule.ruleType !== "unknown" && (rule.rate != null || rule.fixedAmountCents != null)
          ? { ruleType: rule.ruleType, rate: rule.rate, fixedAmountCents: rule.fixedAmountCents, currency: rule.currency, termsUrl: rule.termsUrl }
          : { ruleType: "unknown", note: "Règle de commission non documentée — affichée « inconnue »." },
      };
    }),
  });
}
