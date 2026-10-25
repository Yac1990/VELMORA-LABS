/**
 * POST /api/admin/ai/storyboard — storyboard de vidéo verticale 30 s via LLM (réel).
 * TRANSPARENCE (règle 4 du cahier des charges) : aucun fournisseur de rendu vidéo n'étant
 * configuré, cet endpoint produit un storyboard + ressources exportables, PAS une vidéo MP4.
 * L'UI doit clairement l'indiquer.
 */
import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "ai.use");
  if ("error" in guard) return guard.error;
  const session = guard.session;

  const rl = checkRateLimit(`aisb:${session.uid}`, 6, 60_000);
  if (!rl.allowed) return err("Limite atteinte (6/minute).", 429, { retryAfterSec: rl.retryAfterSec });

  const body = await req.json().catch(() => null);
  if (!body?.productId && !body?.productContext) return err("Fournissez un produit ou un contexte.");

  let productContext = "";
  let productId: string | null = null;
  if (body.productId) {
    const product = await db.product.findUnique({ where: { id: String(body.productId) } });
    if (product) {
      productId = product.id;
      productContext = `Titre : ${product.title}\nDescription : ${product.description.slice(0, 1200)}\nCaractéristiques : ${product.features}`;
    }
  }
  if (!productContext) productContext = String(body.productContext).slice(0, 2000);

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: "assistant",
          content: `Tu es directeur créatif spécialisé en vidéos verticales courtes (TikTok/Reels/Shorts, 9:16, ~30 s).
RÈGLES STRICTES :
- Utilise UNIQUEMENT les informations produit fournies. N'invente AUCUN prix, garantie, note, résultat ou avis client.
- Répond EXCLUSIVEMENT en JSON valide avec ce format :
{
  "title": "titre de la vidéo",
  "total_duration_seconds": 30,
  "scenes": [
    { "scene": 1, "duration_seconds": 5, "visual": "description visuelle précise", "on_screen_text": "texte à l'écran", "voiceover": "voix off (1-2 phrases)" }
  ],
  "cta": "appel à l'action final",
  "music_suggestion": "style de musique libre de droits (description, pas de titre protégé)",
  "disclaimer": "mention à afficher"
}
- Prévois 4 à 6 scènes totalisant ~30 secondes.`,
        },
        { role: "user", content: `Produit :\n${productContext}\n\nTon : ${body.tone || "dynamique et sincère"} | Audience : ${body.audience || "grand public"}` },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return err("Le fournisseur IA n'a pas renvoyé de storyboard — génération NON confirmée.", 502);

    // Extraction du JSON (le modèle peut l'entourer de ```json)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    let storyboard;
    try {
      storyboard = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      storyboard = null;
    }
    if (!storyboard || !Array.isArray(storyboard.scenes)) {
      // Contenu non parsable : on enregistre le brut, l'utilisateur corrigera
      storyboard = { title: "Storyboard (à reformater)", scenes: [], raw };
    }

    const asset = await db.aiAsset.create({
      data: {
        productId,
        assetType: "video_storyboard",
        provider: "zai-llm",
        prompt: `Storyboard vidéo 30 s 9:16. Contexte : ${productContext.slice(0, 400)}`,
        content: JSON.stringify(storyboard, null, 2),
        status: "draft",
        costEstimate: null,
        createdBy: session.email,
      },
    });
    await audit(session, "ai.storyboard", "ai_asset", asset.id);
    return ok({
      asset,
      renderingStatus: "not_configured",
      renderingNote: "Aucun fournisseur de rendu vidéo n'est configuré. Livrable actuel : storyboard + textes exportables (JSON/CSV) pour montage externe. Aucun MP4 ne sera prétendument créé.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await audit(session, "ai.storyboard_failed", "ai_asset", undefined, { error: message.slice(0, 200) });
    return err(`Échec de génération du storyboard (NON confirmée) : ${message}`, 502);
  }
}
