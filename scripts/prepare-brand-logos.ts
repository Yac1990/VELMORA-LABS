/**
 * Task 19 — Normalisation des logos de plateformes pour les bandes défilantes.
 * Choisit la meilleure source disponible par marque (/tmp/logos/{slug}_{src}.png),
 * redimensionne proprement (max 256px, pas d'agrandissement) et copie vers public/brands/{slug}.png.
 * Couleurs d'origine préservées (aucun filtre).
 */
import sharp from "sharp";
import fs from "fs";

const SRC = "/tmp/logos";
const OUT = "public/brands";

// Source préférée par slug (validée visuellement) ; repli dans l'ordre.
// "wiki" = logo officiel Wikimedia (SVG rastérisé), "web" = image-search, "up" = UpLead, "gg" = favicon Google, "ddg" = favicon DDG.
const PICKS: Record<string, string[]> = {
  "amazon-associates": ["wiki", "up", "gg", "ddg"],
  awin: ["up", "gg"],
  chariow: ["gg", "up"],
  shareasale: ["up", "gg"],
  kwanko: ["gg", "up"],
  "rakuten-advertising": ["wiki", "web", "gg", "up"],
  "cj-affiliate": ["up", "gg"],
  impact: ["up", "gg"],
  partnerstack: ["gg", "up"],
  tradedoubler: ["up", "ddg", "gg"],
  admitad: ["gg", "up"],
  affilae: ["up", "gg"],
  effinity: ["gg", "up"],
  clickbank: ["up", "gg"],
  digistore24: ["up", "gg"],
  "ebay-partner-network": ["wiki", "web", "gg", "up"],
};

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const report: string[] = [];

  for (const [slug, prefs] of Object.entries(PICKS)) {
    // image-search peut fournir un fichier téléchargé séparément : {slug}_web.png prioritaire si présent
    let chosen: string | null = null;
    for (const src of prefs) {
      const p = `${SRC}/${slug}_${src}.png`;
      if (fs.existsSync(p) && fs.statSync(p).size > 800) { chosen = p; break; }
    }
    if (!chosen) { report.push(`! ${slug} : aucune source valide`); continue; }
    const img = sharp(chosen, { failOn: "none" });
    const meta = await img.metadata();
    await img
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(`${OUT}/${slug}.png`);
    report.push(`+ ${slug} ← ${chosen.split("/").pop()} (${meta.width}×${meta.height}) → ${Math.round(fs.statSync(`${OUT}/${slug}.png`).size / 1024)} Ko`);
  }
  console.log(report.join("\n"));
}

main();
