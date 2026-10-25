/**
 * POST /api/admin/ai/image — génération d'IMAGE publicitaire via z-ai-web-dev-sdk (réel).
 * Le média généré est enregistré sous /public/ai-assets/ et référencé dans la bibliothèque.
 */
import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SIZES = ["1024x1024", "768x1344", "1344x768", "720x1440"];

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "ai.use");
  if ("error" in guard) return guard.error;
  const session = guard.session;

  const rl = checkRateLimit(`aiimg:${session.uid}`, 6, 60_000);
  if (!rl.allowed) return err("Limite de génération d'images atteinte (6/minute).", 429, { retryAfterSec: rl.retryAfterSec });

  const body = await req.json().catch(() => null);
  const prompt = String(body?.prompt || "").trim();
  if (prompt.length < 10) return err("Décrivez le visuel souhaité (10 caractères minimum).");
  const size = SIZES.includes(body?.size) ? body.size : "1024x1024";

  const quotaSetting = await db.setting.findUnique({ where: { key: "ai_monthly_quota" } });
  const quota = parseInt(quotaSetting?.value || "200", 10);
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const used = await db.aiAsset.count({ where: { createdAt: { gte: monthStart } } });
  if (used >= quota) return err(`Quota mensuel IA atteint (${used}/${quota}).`, 429);

  try {
    const zai = await ZAI.create();
    const response = await zai.images.generations.create({ prompt: prompt.slice(0, 2000), size });
    const base64 = response.data?.[0]?.base64;
    if (!base64) return err("Le fournisseur IA n'a pas renvoyé d'image — génération NON confirmée.", 502);

    const buffer = Buffer.from(base64, "base64");
    const dir = path.join(process.cwd(), "public", "ai-assets");
    await mkdir(dir, { recursive: true });
    const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    await writeFile(path.join(dir, filename), buffer);

    const asset = await db.aiAsset.create({
      data: {
        productId: body.productId ? String(body.productId) : null,
        assetType: "image",
        provider: "zai-image",
        prompt: prompt.slice(0, 2000),
        content: `/ai-assets/${filename}`,
        status: "draft",
        costEstimate: null,
        createdBy: session.email,
      },
    });
    await audit(session, "ai.image", "ai_asset", asset.id, { size, bytes: buffer.length });
    return ok({ asset, usage: { monthlyUsed: used + 1, monthlyQuota: quota }, note: "Image générée par IA — vérifier les droits et l'exactitude avant publication." });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await audit(session, "ai.image_failed", "ai_asset", undefined, { error: message.slice(0, 200) });
    return err(`Échec de la génération d'image (NON confirmée) : ${message}`, 502);
  }
}
