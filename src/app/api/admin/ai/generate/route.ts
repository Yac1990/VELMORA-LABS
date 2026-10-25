/**
 * POST /api/admin/ai/generate — génération de TEXTES marketing via LLM (z-ai-web-dev-sdk, réel).
 * Règles du cahier des charges :
 * - Le contenu IA ne doit PAS inventer prix, garanties, caractéristiques, résultats ou avis clients.
 * - Le prompt, le fournisseur et le statut sont enregistrés (bibliothèque d'assets).
 * - Quota mensuel contrôlé côté serveur.
 */
import { NextRequest } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TASKS: Record<string, { label: string; instruction: string }> = {
  hooks: { label: "Accroches", instruction: "Génère 5 accroches publicitaires courtes (max 12 mots chacune), percutantes, numérotées." },
  description: { label: "Description", instruction: "Génère une description marketing de 60 à 90 mots, claire et factuelle." },
  social_caption: { label: "Légende sociale", instruction: "Génère une légende pour les réseaux sociaux (2 phrases max) suivie d'une ligne « Hashtags : » avec 5 hashtags pertinents." },
  script_video: { label: "Script vidéo 30 s", instruction: "Génère un script de vidéo verticale 9:16 de 30 secondes découpé en 4 à 6 scènes. Pour chaque scène : durée estimée, description visuelle, texte à l'écran, voix off (1-2 phrases). Termine par un appel à l'action." },
  email_subjects: { label: "Objets d'e-mail", instruction: "Génère 5 objets d'e-mail de moins de 60 caractères, sans majuscules excessives ni promesses invérifiables, numérotés." },
  cta: { label: "Appels à l'action", instruction: "Génère 5 appels à l'action courts (max 6 mots), numérotés." },
};

const FACTUAL_GUARDRAIL = `RÈGLES STRICTES :
- Utilise UNIQUEMENT les informations produit fournies ci-dessous.
- N'invente AUCUN prix, pourcentage de réduction, garantie, délai, note, avis client, résultat chiffré ou caractéristique non fournie.
- Si une information manque, reste général sans affirmer de fait précis.
- Répond en français, sans préambule ni conclusion superflue.`;

async function countMonthlyUsage(): Promise<number> {
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  return db.aiAsset.count({ where: { createdAt: { gte: start } } });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "ai.use");
  if ("error" in guard) return guard.error;
  const session = guard.session;

  const rl = checkRateLimit(`ai:${session.uid}`, 12, 60_000);
  if (!rl.allowed) return err("Limite de génération atteinte (12/minute) — patientez un instant.", 429, { retryAfterSec: rl.retryAfterSec });

  const body = await req.json().catch(() => null);
  const task = body?.task && TASKS[body.task] ? body.task : null;
  if (!task) return err("Type de génération invalide. Valeurs : " + Object.keys(TASKS).join(", "));

  const quotaSetting = await db.setting.findUnique({ where: { key: "ai_monthly_quota" } });
  const quota = parseInt(quotaSetting?.value || "200", 10);
  const used = await countMonthlyUsage();
  if (used >= quota) {
    return err(`Quota mensuel IA atteint (${used}/${quota}). Contactez l'administrateur pour l'augmenter dans Paramètres.`, 429);
  }

  let productContext = body.productContext ? String(body.productContext).slice(0, 4000) : "";
  if (body.productId) {
    const product = await db.product.findUnique({
      where: { id: String(body.productId) },
      include: { category: true, offers: { include: { partner: true }, take: 1 } },
    });
    if (product) {
      productContext = [
        `Titre : ${product.title}`,
        product.shortDescription ? `Résumé : ${product.shortDescription}` : "",
        `Description : ${product.description.slice(0, 1500)}`,
        product.category ? `Catégorie : ${product.category.name}` : "",
        product.features ? `Caractéristiques vérifiées : ${product.features}` : "",
        product.priceMinCents != null ? `Prix affiché sur le site : indisponible dans la génération (ne pas mentionner de chiffre).` : "",
        `Audience cible : ${body.audience || "grand public"} | Langue : ${body.language || "français"} | Ton souhaité : ${body.tone || "professionnel et accessible"}`,
      ].filter(Boolean).join("\n");
    }
  }

  if (!productContext) return err("Fournissez un produit (productId) ou un contexte produit (productContext).");

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: `Tu es un rédacteur marketing expert. ${FACTUAL_GUARDRAIL}\n\nCONTEXTE PRODUIT VÉRIFIÉ :\n${productContext}` },
        { role: "user", content: TASKS[task].instruction },
      ],
      thinking: { type: "disabled" },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      return err("Le fournisseur IA n'a pas renvoyé de contenu — génération NON confirmée.", 502);
    }

    const asset = await db.aiAsset.create({
      data: {
        productId: body.productId ? String(body.productId) : null,
        assetType: "text",
        provider: "zai-llm",
        prompt: `[${TASKS[task].label}] ${TASKS[task].instruction}\n---\nContexte : ${productContext.slice(0, 800)}`,
        content,
        status: "draft",
        costEstimate: null, // coût réel indisponible — ne pas inventer
        createdBy: session.email,
      },
    });
    await audit(session, "ai.generate", "ai_asset", asset.id, { task, provider: "zai-llm" });
    return ok({ asset, usage: { monthlyUsed: used + 1, monthlyQuota: quota }, note: "Contenu généré par IA — vérification humaine requise avant toute utilisation." });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue du fournisseur IA";
    await audit(session, "ai.generate_failed", "ai_asset", undefined, { task, error: message.slice(0, 200) });
    return err(`Échec de la génération IA (NON confirmée) : ${message}`, 502);
  }
}
