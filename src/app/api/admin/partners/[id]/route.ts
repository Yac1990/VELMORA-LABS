/**
 * PUT / DELETE /api/admin/partners/[id]
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "partners.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");
  const existing = await db.partner.findUnique({ where: { id } });
  if (!existing) return err("Partenaire introuvable", 404);

  const data: Record<string, unknown> = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (body.website != null) {
    try { new URL(String(body.website)); } catch { return err("URL invalide."); }
    data.website = String(body.website);
  }
  if (body.programType != null) data.programType = String(body.programType);
  if (body.status != null) data.status = String(body.status);
  if (body.documentationUrl !== undefined) data.documentationUrl = body.documentationUrl ? String(body.documentationUrl) : null;
  if (body.supportedCountries != null) data.supportedCountries = JSON.stringify(Array.isArray(body.supportedCountries) ? body.supportedCountries.map(String) : []);
  if (body.allowedDomains != null) {
    const domains = Array.isArray(body.allowedDomains) ? body.allowedDomains.map(String).slice(0, 20) : [];
    if (domains.length === 0) return err("Au moins un domaine autorisé est requis.");
    data.allowedDomains = JSON.stringify(domains.map((d: string) => d.toLowerCase().trim().replace(/^www\./, "")));
  }
  if (body.note !== undefined) data.note = body.note ? String(body.note).slice(0, 500) : null;

  const updated = await db.partner.update({ where: { id }, data });
  await audit(session, "partner.update", "partner", id, { fields: Object.keys(data) });
  return ok({ partner: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "partners.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const existing = await db.partner.findUnique({ where: { id } });
  if (!existing) return err("Partenaire introuvable", 404);
  const clicks = await db.clickEvent.count({ where: { partnerId: id } });
  if (clicks > 0) {
    await db.partner.update({ where: { id }, data: { status: "inactive" } });
    await audit(session, "partner.deactivate_has_history", "partner", id, { clicks });
    return ok({ deactivated: true, message: "Partenaire désactivé : des clics/conversions historiques y sont rattachés." });
  }
  await db.partner.delete({ where: { id } });
  await audit(session, "partner.delete", "partner", id, { name: existing.name });
  return ok({ deleted: true });
}
