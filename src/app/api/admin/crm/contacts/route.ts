/**
 * GET / POST /api/admin/crm/contacts
 * Accès restreint au rôle CRM/owner. Minimisation : champs limités, consentement tracé.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit, parseJsonArray } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["new", "to_contact", "in_discussion", "qualified", "converted", "lost", "unsubscribed"];

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "crm.read");
  if ("error" in guard) return guard.error;
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim() || "";
  const status = sp.get("status") || "";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, parseInt(sp.get("perPage") || "25", 10) || 25);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) where.OR = [{ name: { contains: q } }, { email: { contains: q } }];

  const [total, items] = await Promise.all([
    db.crmContact.count({ where }),
    db.crmContact.findMany({
      where, orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage, take: perPage,
      include: {
        activities: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    }),
  ]);

  return ok({
    items: items.map((c) => ({
      id: c.id, name: c.name, email: c.email, phone: c.phone,
      country: c.country, language: c.language,
      status: c.status, source: c.source,
      consentStatus: c.consentStatus, consentAt: c.consentAt,
      tags: parseJsonArray(c.tags), isDemo: c.isDemo,
      anonymizedAt: c.anonymizedAt, createdAt: c.createdAt,
      lastActivity: c.activities[0] || null,
    })),
    total, page, perPage,
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "crm.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase() || null;
  if (name.length < 2) return err("Nom requis.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err("E-mail invalide.");

  const consentStatus = body.consentStatus === "granted" ? "granted" : "none";
  const created = await db.crmContact.create({
    data: {
      name,
      email,
      phone: body.phone ? String(body.phone).slice(0, 40) : null,
      country: body.country ? String(body.country).slice(0, 60) : null,
      status: VALID_STATUSES.includes(body.status) ? body.status : "new",
      source: body.source ? String(body.source).slice(0, 60) : "manual",
      consentStatus,
      consentPurpose: consentStatus === "granted" ? String(body.consentPurpose || "Communications commerciales").slice(0, 300) : null,
      consentAt: consentStatus === "granted" ? new Date() : null,
      tags: JSON.stringify(Array.isArray(body.tags) ? body.tags.slice(0, 10).map(String) : []),
      notes: body.notes ? String(body.notes).slice(0, 2000) : null,
    },
  });
  if (consentStatus === "granted") {
    await db.consentRecord.create({
      data: {
        subjectType: "crm_contact", subjectId: created.id,
        purpose: created.consentPurpose || "communications",
        status: "granted", source: "manual_entry", recordedAt: new Date(),
      },
    });
  }
  await audit(session, "crm.contact.create", "crm_contact", created.id, { name });
  return ok({ contact: created }, { status: 201 });
}
