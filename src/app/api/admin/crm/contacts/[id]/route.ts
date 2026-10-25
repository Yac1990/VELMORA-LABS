/**
 * GET / PUT /api/admin/crm/contacts/[id]
 * PUT permet : statut, tags, notes, retrait de consentement (tracé dans consent_records).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["new", "to_contact", "in_discussion", "qualified", "converted", "lost", "unsubscribed"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "crm.read");
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const contact = await db.crmContact.findUnique({
    where: { id },
    include: {
      activities: { orderBy: { createdAt: "desc" } },
      sourceProduct: { select: { title: true, slug: true } },
    },
  });
  if (!contact) return err("Contact introuvable", 404);
  const consents = await db.consentRecord.findMany({
    where: { subjectType: "crm_contact", subjectId: id },
    orderBy: { recordedAt: "desc" },
  });
  return ok({ contact, consents });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "crm.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");
  const existing = await db.crmContact.findUnique({ where: { id } });
  if (!existing) return err("Contact introuvable", 404);

  const data: Record<string, unknown> = {};
  if (body.status != null) {
    if (!VALID_STATUSES.includes(body.status)) return err("Statut invalide.");
    data.status = body.status;
  }
  if (body.tags != null) data.tags = JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 10).map(String) : []);
  if (body.notes !== undefined) data.notes = body.notes ? String(body.notes).slice(0, 2000) : null;
  if (body.country !== undefined) data.country = body.country ? String(body.country).slice(0, 60) : null;
  if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).slice(0, 40) : null;

  // Retrait de consentement explicite
  if (body.withdrawConsent === true) {
    data.consentStatus = "withdrawn";
    data.status = "unsubscribed";
    await db.consentRecord.updateMany({
      where: { subjectType: "crm_contact", subjectId: id, status: "granted" },
      data: { status: "withdrawn", withdrawnAt: new Date() },
    });
  }

  const updated = await db.crmContact.update({ where: { id }, data });

  if (body.activityNotes) {
    await db.crmActivity.create({
      data: {
        contactId: id,
        activityType: ["note", "task", "call", "email", "status_change"].includes(body.activityType) ? body.activityType : "note",
        notes: String(body.activityNotes).slice(0, 2000),
        dueAt: body.activityDueAt ? new Date(body.activityDueAt) : null,
      },
    });
  }

  await audit(session, "crm.contact.update", "crm_contact", id, { fields: Object.keys(data) });
  return ok({ contact: updated });
}
