/**
 * GET /api/admin/audit — journal d'audit (lecture seule, analyste+)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "audit.read");
  if ("error" in guard) return guard.error;
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, parseInt(req.nextUrl.searchParams.get("perPage") || "50", 10) || 50);
  const [total, items] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * perPage, take: perPage }),
  ]);
  return ok({
    items: items.map((a) => ({
      id: a.id, actorEmail: a.actorEmail, action: a.action,
      entityType: a.entityType, entityId: a.entityId,
      metadata: a.metadataJson ? JSON.parse(a.metadataJson) : null,
      createdAt: a.createdAt,
    })),
    total, page, perPage,
  });
}
