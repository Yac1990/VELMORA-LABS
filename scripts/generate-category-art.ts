/**
 * Task 17 — Illustrations de la section « Parcourir par catégorie » (accueil).
 * Génère 7 visuels 3D pastel (un par univers) dans un style strictement homogène,
 * puis les optimise (redimensionnement 360px + WebP) pour un chargement léger.
 * Idempotent : relancer ne régénère que les fichiers manquants (ou FORCE=1 pour tout régénérer).
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const OUT_DIR = "public/demo/categories";
const STYLE =
  "Soft 3D render illustration, single centered subject on a clean very light lavender-white background, " +
  "pastel blue and violet color palette, subtle soft shadows, glossy smooth clay material, " +
  "minimal modern e-commerce category tile artwork, no text, no letters, no watermark, high quality, detailed";

const SUBJECTS: Record<string, string> = {
  numerique:
    "a modern silver laptop with a glowing blue cloud and small floating digital document icons rising above the screen",
  formations:
    "a dark blue graduation cap resting on a neat stack of two books with a tiny violet play-button icon",
  abonnements:
    "a glossy blue cloud with a white download arrow, floating above three small connected violet server blocks",
  maison:
    "a cozy pastel beige armchair sofa with a slender floor lamp and a small potted green plant",
  electronique:
    "a sleek open laptop beside modern wireless over-ear headphones with blue accents",
  immobilier:
    "a charming small house with a blue roof, tiny windows and two rounded miniature trees",
  vehicules:
    "a modern compact electric car in white and blue, three-quarter front view, slightly elevated",
};

const SLUGS = ["numerique", "formations", "abonnements", "maison", "electronique", "immobilier", "vehicules"];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const force = process.env.FORCE === "1";
  const zai = await ZAI.create();
  const results: string[] = [];

  for (const slug of SLUGS) {
    const finalPath = path.join(OUT_DIR, `cat-${slug}.webp`);
    if (!force && fs.existsSync(finalPath)) {
      results.push(`= ${slug} (déjà présent)`);
      continue;
    }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await zai.images.generations.create({
          prompt: `${STYLE}. Subject: ${SUBJECTS[slug]}`,
          size: "1024x1024",
        });
        const b64 = res.data?.[0]?.base64;
        if (!b64) throw new Error("réponse vide");
        const buffer = Buffer.from(b64, "base64");
        await sharp(buffer).resize(360, 360, { fit: "cover" }).webp({ quality: 82 }).toFile(finalPath);
        ok = true;
        results.push(`+ ${slug} (${Math.round(fs.statSync(finalPath).size / 1024)} Ko)`);
      } catch (err) {
        console.error(`✗ ${slug} tentative ${attempt} :`, (err as Error).message);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
    }
    if (!ok) results.push(`! ${slug} ÉCHEC`);
  }

  console.log(results.join("\n"));
  const failed = results.filter((r) => r.startsWith("!"));
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
