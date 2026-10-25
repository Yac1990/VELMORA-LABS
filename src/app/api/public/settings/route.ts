import { db } from "@/lib/db";
import { ok } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// GET /api/public/settings — paramètres publics (marque, devise, message « Comment ça marche »)
export async function GET() {
  const settings = await db.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;
  return ok({
    brandName: map.brand_name || "VELMORA LABS",
    brandTagline: map.brand_tagline || "",
    brandLogo: map.brand_logo || "/velmora-logo.png",
    referenceCurrency: map.reference_currency || "EUR",
    displayCurrencies: JSON.parse(map.display_currencies || '["EUR"]'),
    targetCountries: JSON.parse(map.target_countries || "[]"),
    defaultLanguage: map.default_language || "fr",
    timezone: map.timezone || "UTC",
    demoNotice: map.demo_mode_notice || "",
    outboundNotice: map.outbound_notice || "",
  });
}
