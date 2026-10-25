/**
 * GET / PUT /api/admin/social/posts — calendrier social assisté.
 * TRANSPARENCE : aucune publication directe n'est effectuée (aucune autorisation API configurée).
 * Le workflow est : brouillon → approuvé → [export manuel requis] → publié (saisie manuelle avec preuve).
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const PLATFORMS = ["tiktok", "instagram", "facebook", "youtube"];
const STATUSES = ["draft", "approved", "scheduled", "published_manual", "failed", "archived"];

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "social.read");
  if ("error" in guard) return guard.error;
  const posts = await db.socialPost.findMany({
    orderBy: { createdAt: "desc" }, take: 100,
    include: { asset: { select: { id: true, assetType: true, content: true, prompt: true } } },
  });
  return ok({
    items: posts,
    integrationStatus: {
      tiktok: { configured: false, note: "Aucune autorisation API TikTok configurée (Content Posting API : approbation développeur requise)." },
      instagram: { configured: false, note: "Aucun jeton Instagram Graph API configuré (compte professionnel + revue d'app requis)." },
      facebook: { configured: false, note: "Aucun jeton Facebook Page API configuré." },
      youtube: { configured: false, note: "Aucun jeton YouTube Data API configuré (OAuth + quota)." },
    },
    policy: "Aucune publication directe possible tant que les autorisations API ne sont pas obtenues. Utilisez l'export manuel (média + légende + hashtags + lien).",
  });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "social.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  const caption = String(body?.caption || "").trim();
  if (caption.length < 5) return err("Légende requise (5 caractères min.).");
  if (!PLATFORMS.includes(body?.platform)) return err("Plateforme invalide. Valeurs : " + PLATFORMS.join(", "));

  const created = await db.socialPost.create({
    data: {
      platform: body.platform,
      caption: caption.slice(0, 2200),
      hashtags: body.hashtags ? String(body.hashtags).slice(0, 500) : null,
      campaignLink: body.campaignLink ? String(body.campaignLink).slice(0, 500) : null,
      aiAssetId: body.aiAssetId ? String(body.aiAssetId) : null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      publishStatus: "draft",
    },
  });
  await audit(session, "social.post.create", "social_post", created.id, { platform: body.platform });
  return ok({ post: created }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.id) return err("id requis");
  const post = await db.socialPost.findUnique({ where: { id: String(body.id) } });
  if (!post) return err("Publication introuvable", 404);

  // Session vérifiée une fois : approve exige ai.approve, les autres social.write.
  const needPermission = body.action === "approve" ? "ai.approve" : "social.write";
  const guard = await requirePermission(req, needPermission as never);
  if ("error" in guard) return guard.error;
  const session = guard.session;

  const data: Record<string, unknown> = {};
  let auditAction = "social.post.update";

  switch (body.action) {
    case "approve": {
      data.publishStatus = "approved";
      data.approvedBy = session.email;
      data.approvedAt = new Date();
      auditAction = "social.post.approve";
      break;
    }
    case "schedule": {
      if (post.publishStatus !== "approved") return err("Seule une publication APPROUVÉE peut être programmée.", 400);
      if (!body.scheduledAt) return err("Date de programmation requise.");
      data.publishStatus = "scheduled";
      data.scheduledAt = new Date(body.scheduledAt);
      auditAction = "social.post.schedule";
      break;
    }
    case "mark_published_manual": {
      if (!["approved", "scheduled"].includes(post.publishStatus)) return err("Marquer « publié manuellement » exige une publication approuvée.", 400);
      data.publishStatus = "published_manual";
      data.externalPostId = body.externalPostId ? String(body.externalPostId).slice(0, 120) : null;
      auditAction = "social.post.mark_published_manual";
      break;
    }
    case "fail": {
      data.publishStatus = "failed";
      data.errorMessage = body.errorMessage ? String(body.errorMessage).slice(0, 500) : null;
      auditAction = "social.post.mark_failed";
      break;
    }
    case "archive": {
      data.publishStatus = "archived";
      auditAction = "social.post.archive";
      break;
    }
    default: {
      if (body.caption != null) data.caption = String(body.caption).slice(0, 2200);
      if (body.hashtags !== undefined) data.hashtags = body.hashtags ? String(body.hashtags).slice(0, 500) : null;
      if (body.campaignLink !== undefined) data.campaignLink = body.campaignLink ? String(body.campaignLink).slice(0, 500) : null;
    }
  }

  const updated = await db.socialPost.update({ where: { id: post.id }, data });
  await audit(session, auditAction, "social_post", post.id, { fields: Object.keys(data) });
  return ok({ post: updated });
}
