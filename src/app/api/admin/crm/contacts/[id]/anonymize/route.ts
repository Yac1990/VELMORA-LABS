/**
 * POST /api/admin/crm/contacts/[id]/anonymize — droit à l'effacement (RGPD).
 * Anonymisation irréversible des données personnelles, conservation du tracé de consentement.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "crm.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const contact = await db.crmContact.findUnique({ where: { id } });
  if (!contact) return err("Contact introuvable", 404);
  if (contact.anonymizedAt) return err("Contact déjà anonymisé.", 400);

  await db.crmContact.update({
    where: { id },
    data: {
      name: `Anonymisé #${id.slice(-6)}`,
      email: null, phone: null,
      notes: "[Données personnelles supprimées à la demande de la personne concernée]",
      status: "unsubscribed",
      consentStatus: "withdrawn",
      anonymizedAt: new Date(),
    },
  });
  await db.crmActivity.create({
    data: { contactId: id, activityType: "note", notes: "Anonymisation effectuée (droit à l'effacement)." },
  });
  await db.consentRecord.updateMany({
    where: { subjectType: "crm_contact", subjectId: id, status: "granted" },
    data: { status: "withdrawn", withdrawnAt: new Date() },
  });
  await audit(session, "crm.contact.anonymize", "crm_contact", id, { previousName: contact.name });
  return ok({ anonymized: true });
}
