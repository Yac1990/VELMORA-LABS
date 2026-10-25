/**
 * PUT /api/admin/campaigns/[id]
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePermission(req, "content.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");
  const data: Record<string, unknown> = {};
  if (body.name != null) data.name = String(body.name).trim();
  if (body.status != null && ["draft", "active", "paused", "ended"].includes(body.status)) data.status = body.status;
  if (body.channel != null) data.channel = String(body.channel);
  if (body.objective !== undefined) data.objective = body.objective ? String(body.objective).slice(0, 200) : null;
  const updated = await db.campaign.update({ where: { id }, data });
  await audit(session, "campaign.update", "campaign", id, { fields: Object.keys(data) });
  return ok({ campaign: updated });
}
