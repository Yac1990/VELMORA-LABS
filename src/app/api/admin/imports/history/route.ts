/**
 * GET /api/admin/imports/history — historique des imports
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.read");
  if ("error" in guard) return guard.error;
  const jobs = await db.importJob.findMany({ orderBy: { startedAt: "desc" }, take: 50 });
  return ok({
    items: jobs.map((j) => ({
      id: j.id, importType: j.importType, status: j.status,
      startedAt: j.startedAt, finishedAt: j.finishedAt,
      counts: JSON.parse(j.countsJson || "{}"),
      errorSummary: j.errorSummary,
    })),
  });
}
