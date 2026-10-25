/**
 * GET /api/admin/email/logs — journal d'envoi des e-mails (pagination + comptes par statut).
 * Tout rôle d'administration peut consulter (settings.read vérifié côté serveur).
 * Les corps complets ne sont jamais exposés dans la liste : aperçu tronqué à 160 caractères.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "settings.read");
  if ("error" in guard) return guard.error;

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const perPageRaw = Number(url.searchParams.get("perPage")) || 20;
  const perPage = Math.min(50, Math.max(1, perPageRaw));

  const [logs, total, groups] = await Promise.all([
    db.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        toEmail: true,
        subject: true,
        purpose: true,
        status: true,
        provider: true,
        smtpHost: true,
        errorMessage: true,
        attempts: true,
        relatedContactId: true,
        sentAt: true,
        createdAt: true,
        bodyText: true,
      },
    }),
    db.emailLog.count(),
    db.emailLog.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countsByStatus: Record<string, number> = {};
  for (const g of groups) countsByStatus[g.status] = g._count._all;

  return ok({
    logs: logs.map((l) => ({
      id: l.id,
      toEmail: l.toEmail,
      subject: l.subject,
      purpose: l.purpose,
      status: l.status,
      provider: l.provider,
      smtpHost: l.smtpHost,
      errorMessage: l.errorMessage,
      attempts: l.attempts,
      relatedContactId: l.relatedContactId,
      sentAt: l.sentAt,
      createdAt: l.createdAt,
      // Aperçu tronqué — jamais le corps complet dans une liste.
      bodyPreview: (l.bodyText || "").replace(/\s+/g, " ").trim().slice(0, 160),
    })),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    countsByStatus,
  });
}
