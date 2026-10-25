/**
 * GET / POST /api/admin/partners — partenaires + intégrations (statut, jamais de secrets)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit, parseJsonArray } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "partners.read");
  if ("error" in guard) return guard.error;
  const items = await db.partner.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      integrations: true,
      commissionRules: { where: { validTo: null } },
      _count: { select: { offers: true, clickEvents: true, conversions: true } },
    },
  });
  return ok({
    items: items.map((p) => ({
      id: p.id, name: p.name, website: p.website, programType: p.programType,
      status: p.status, documentationUrl: p.documentationUrl,
      trackingTemplate: p.trackingTemplate, trackingDocUrl: p.trackingDocUrl,
      supportedCountries: parseJsonArray(p.supportedCountries),
      allowedDomains: parseJsonArray(p.allowedDomains),
      isDemo: p.isDemo, note: p.note, createdAt: p.createdAt,
      integrations: p.integrations.map((i) => ({
        id: i.id, integrationType: i.integrationType, status: i.status,
        statusDetail: i.statusDetail, lastSyncAt: i.lastSyncAt,
        secretRefName: i.encryptedSecretRef, // nom de variable d'env uniquement — jamais la valeur
      })),
      commissionRule: p.commissionRules[0] || null,
      offerCount: p._count.offers, clickCount: p._count.clickEvents, conversionCount: p._count.conversions,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "partners.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const website = String(body?.website || "").trim();
  if (name.length < 2) return err("Nom du partenaire requis.");
  try { new URL(website); } catch { return err("URL du site partenaire invalide."); }

  const domains = Array.isArray(body.allowedDomains) ? body.allowedDomains.map(String).slice(0, 20) : [];
  if (domains.length === 0) return err("Au moins un domaine autorisé est requis (liste blanche anti open-redirect).");

  const created = await db.partner.create({
    data: {
      name, website,
      programType: ["affiliate", "direct", "other"].includes(body.programType) ? body.programType : "affiliate",
      status: ["active", "inactive", "pending"].includes(body.status) ? body.status : "active",
      documentationUrl: body.documentationUrl ? String(body.documentationUrl) : null,
      supportedCountries: JSON.stringify(Array.isArray(body.supportedCountries) ? body.supportedCountries.map(String) : []),
      allowedDomains: JSON.stringify(domains.map((d: string) => d.toLowerCase().trim().replace(/^www\./, ""))),
      note: body.note ? String(body.note).slice(0, 500) : null,
    },
  });
  await db.partnerIntegration.create({
    data: { partnerId: created.id, integrationType: String(body.integrationType || "csv"), status: "not_configured" },
  });
  await audit(session, "partner.create", "partner", created.id, { name });
  return ok({ partner: created }, { status: 201 });
}
