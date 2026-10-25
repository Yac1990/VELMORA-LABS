/**
 * GET  /api/admin/ai/assets — bibliothèque de contenus IA
 * PUT  /api/admin/ai/assets/[id] via /assets — changement de statut (workflow d'approbation)
 * Statuts : draft → pending_review → approved | rejected → archived
 * SEUL un rôle avec ai.approve peut approuver (owner). marketing_editor peut soumettre à vérification.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "content.read");
  if ("error" in guard) return guard.error;
  const sp = req.nextUrl.searchParams;
  const assetType = sp.get("assetType") || "";
  const status = sp.get("status") || "";
  const productId = sp.get("productId") || "";
  const where: Record<string, unknown> = {};
  if (assetType) where.assetType = assetType;
  if (status) where.status = status;
  if (productId) where.productId = productId;

  const assets = await db.aiAsset.findMany({
    where, orderBy: { createdAt: "desc" }, take: 100,
    include: { product: { select: { title: true, slug: true } } },
  });
  return ok({
    items: assets.map((a) => ({
      id: a.id, assetType: a.assetType, provider: a.provider,
      prompt: a.prompt.slice(0, 300), content: a.content,
      status: a.status, costEstimate: a.costEstimate,
      createdBy: a.createdBy, createdAt: a.createdAt,
      product: a.product ? { title: a.product.title, slug: a.product.slug } : null,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "approve" || action === "reject") {
    const guard2 = await requirePermission(req, "ai.approve");
    if ("error" in guard2) return guard2.error;
    const session = guard2.session;
    if (!body?.id) return err("id requis");
    const asset = await db.aiAsset.findUnique({ where: { id: String(body.id) } });
    if (!asset) return err("Asset introuvable", 404);
    const newStatus = action === "approve" ? "approved" : "rejected";
    const updated = await db.aiAsset.update({ where: { id: asset.id }, data: { status: newStatus } });
    await audit(session, `ai.asset.${action}`, "ai_asset", asset.id, { previous: asset.status });
    return ok({ asset: updated });
  }

  // Soumission à vérification : contenu.read + écriture
  const guard3 = await requirePermission(req, "content.write");
  if ("error" in guard3) return guard3.error;
  const session = guard3.session;
  if (!body?.id) return err("id requis");
  const asset = await db.aiAsset.findUnique({ where: { id: String(body.id) } });
  if (!asset) return err("Asset introuvable", 404);
  if (!["draft", "pending_review", "rejected"].includes(asset.status)) {
    return err(`Impossible de modifier un asset au statut « ${asset.status} ».`);
  }
  const newStatus = action === "submit" ? "pending_review" : ["draft", "archived"].includes(body.status) ? body.status : asset.status;
  if (action !== "submit" && body.status && !["draft", "pending_review", "archived"].includes(body.status) && body.status !== newStatus) {
    return err("Seul un rôle autorisé peut approuver ou rejeter un contenu.");
  }
  const updated = await db.aiAsset.update({ where: { id: asset.id }, data: { status: newStatus } });
  await audit(session, "ai.asset.status_update", "ai_asset", asset.id, { to: newStatus });
  return ok({ asset: updated });
}
