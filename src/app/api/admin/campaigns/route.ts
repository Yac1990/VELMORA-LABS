/**
 * GET / POST /api/admin/campaigns
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "content.read");
  if ("error" in guard) return guard.error;
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clickEvents: true } } },
  });
  return ok({
    items: campaigns.map((c) => ({
      id: c.id, name: c.name, channel: c.channel, objective: c.objective,
      targetCountry: c.targetCountry, status: c.status,
      startAt: c.startAt, endAt: c.endAt, isDemo: c.isDemo,
      clickCount: c._count.clickEvents,
    })),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "content.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  if (name.length < 3) return err("Nom de campagne requis (3 caractères min.).");
  const created = await db.campaign.create({
    data: {
      name,
      channel: ["social", "email", "content", "paid", "other"].includes(body.channel) ? body.channel : "other",
      objective: body.objective ? String(body.objective).slice(0, 200) : null,
      targetCountry: body.targetCountry ? String(body.targetCountry).slice(0, 2).toUpperCase() : null,
      status: ["draft", "active", "paused", "ended"].includes(body.status) ? body.status : "draft",
      isDemo: false,
    },
  });
  await audit(session, "campaign.create", "campaign", created.id, { name });
  return ok({ campaign: created }, { status: 201 });
}
