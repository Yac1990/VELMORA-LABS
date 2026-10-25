/**
 * GET / PUT /api/admin/settings — paramètres internationaux (marque, devises, SEO…)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const EDITABLE_KEYS = [
  "brand_name", "brand_tagline", "brand_logo", "reference_currency", "display_currencies",
  "target_countries", "default_language", "timezone", "cookie_consent",
  "demo_mode_notice", "outbound_notice", "ai_monthly_quota",
];

export async function GET(req: Request) {
  const guard = await requirePermission(req, "settings.read");
  if ("error" in guard) return guard.error;
  const settings = await db.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return ok({
    settings: map,
    editableKeys: EDITABLE_KEYS,
    integrationsStatus: {
      ai_text: { provider: "z-ai-web-dev-sdk (LLM)", configured: true, note: "Génération de texte opérationnelle via SDK interne." },
      ai_image: { provider: "z-ai-web-dev-sdk (images)", configured: true, note: "Génération d'images opérationnelle via SDK interne." },
      ai_video_render: { provider: null, configured: false, note: "Aucun fournisseur de rendu vidéo configuré → workflow storyboard + export, jamais de fausse vidéo." },
      social_apis: { provider: null, configured: false, note: "TikTok / Instagram / Facebook / YouTube : aucune clé OAuth configurée → publication manuelle de secours." },
      partner_apis: { provider: null, configured: false, note: "Aucune API partenaire configurée → import CSV manuel." },
      exchange_rates: { provider: "open.er-api.com (exchangerate-api)", configured: true, note: "Taux réels EUR→15 devises, actualisation paresseuse (6 h) + bouton manuel — voir la carte Taux de change ci-dessous." },
      email_smtp: { provider: process.env.SMTP_HOST ? "SMTP" : null, configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM), note: "Envoi réel via nodemailer quand SMTP_HOST/PORT/FROM sont définis ; sinon les e-mails restent en file (jamais de faux « sent ») — carte E-mails ci-dessous." },
    },
    envDocumentation: {
      required: ["DATABASE_URL"],
      optional: ["AUTH_SECRET (recommandé en production — signe les cookies de session)", "Les secrets partenaires/IA éventuels restent côté serveur uniquement"],
    },
  });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "settings.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return ok({ updated: 0 });

  // Sprint B : les clés « tracking.<slug>.* » (IDs d'affilié des réseaux) sont éditables
  // via le même endpoint — préfixe whitelisté, jamais de valeurs de secrets d'API ici.
  const isTrackingKey = (key: string) => /^tracking\.[a-z0-9-]+\.[a-z][a-zA-Z0-9]*$/.test(key);

  const updates: string[] = [];
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!EDITABLE_KEYS.includes(key) && !isTrackingKey(key)) continue;
    await db.setting.upsert({
      where: { key },
      update: { value: String(value), updatedAt: new Date() },
      create: { key, value: String(value) },
    });
    updates.push(key);
  }
  await audit(session, "settings.update", "setting", undefined, { keys: updates });
  return ok({ updated: updates.length, keys: updates });
}
