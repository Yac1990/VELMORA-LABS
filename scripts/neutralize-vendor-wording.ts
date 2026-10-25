/**
 * Migration one-off (Task 16, complément) — neutralise le mot « partenaire » dans les
 * textes VISITABLES stockés en base : descriptions de catégories, descriptions et
 * courts résumés des produits, notes des partenaires. Remplacements ordonnés
 * (phrases spécifiques d'abord, fallback global ensuite). Idempotent.
 * Aucune donnée de tracking / conversion / commission n'est modifiée.
 * Usage : bun run scripts/neutralize-vendor-wording.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Remplacements spécifiques (avant le fallback global) — formulations les plus gênantes. */
const SPECIFIC: [RegExp, string][] = [
  [/annonce partenaire/g, "annonce du vendeur"],
  [/l'annonceur partenaire/gi, "le vendeur"],
  [/annonces de partenaires autorisés/gi, "annonces de vendeurs vérifiés"],
  [/offres de partenaires disposant d'un mécanisme de rémunération réel/gi, "offres de vendeurs vérifiés"],
  [/adhésions partenaires/gi, "adhésions de vendeurs"],
  [/mécanisme de rémunération réel/gi, "sélection vérifiée"],
  [/rémunération réelle/gi, "sélection vérifiée"],
];

/** Fallback global — toute occurrence résiduelle. */
const GENERIC: [RegExp, string][] = [
  [/Partenaires/g, "Vendeurs"],
  [/Partenaire/g, "Vendeur"],
  [/partenaires/g, "vendeurs"],
  [/partenaire/g, "vendeur"],
];

function neutralize(text: string): string {
  let out = text;
  for (const [re, to] of SPECIFIC) out = out.replace(re, to);
  for (const [re, to] of GENERIC) out = out.replace(re, to);
  return out;
}

async function main() {
  // 1. Catégories (description visible sous le titre du catalogue filtré)
  const categories = await db.category.findMany();
  for (const c of categories) {
    if (c.description && c.description !== neutralize(c.description)) {
      await db.category.update({ where: { id: c.id }, data: { description: neutralize(c.description) } });
      console.log(`✓ Catégorie : "${c.name}"`);
    }
  }

  // 2. Produits (description + shortDescription + priceNote affichés sur les fiches)
  const products = await db.product.findMany();
  for (const p of products) {
    const data: { description?: string; shortDescription?: string; priceNote?: string } = {};
    if (p.description && p.description !== neutralize(p.description)) data.description = neutralize(p.description);
    if (p.shortDescription && p.shortDescription !== neutralize(p.shortDescription)) data.shortDescription = neutralize(p.shortDescription);
    if (p.priceNote && p.priceNote !== neutralize(p.priceNote)) data.priceNote = neutralize(p.priceNote);
    if (Object.keys(data).length > 0) {
      await db.product.update({ where: { id: p.id }, data });
      console.log(`✓ Produit : "${p.title}"`);
    }
  }

  // 3. Notes partenaires (back-office, cohérence)
  const partners = await db.partner.findMany();
  for (const p of partners) {
    if (p.note && p.note !== neutralize(p.note)) {
      await db.partner.update({ where: { id: p.id }, data: { note: neutralize(p.note) } });
      console.log(`✓ Note partenaire : "${p.name}"`);
    }
  }
}

main()
  .catch((e) => {
    console.error("✗ Échec de la neutralisation :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
