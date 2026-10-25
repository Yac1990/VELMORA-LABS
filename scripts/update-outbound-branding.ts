/**
 * Migration one-off (Task 16) — présenter le site public comme une plateforme multi-produits :
 * 1. Renomme les partenaires démo « Partenaire Démo — X » en « Boutique Démo — X ».
 * 2. Remplace la clé de réglage « affiliate_disclosure » (texte d'affiliation, plus exposé)
 *    par « outbound_notice » (message neutre « Comment ça marche »).
 * Aucune donnée de tracking, conversion ou commission n'est modifiée : la mécanique
 * d'arrière-plan reste intacte. Idempotent.
 * Usage : bun run scripts/update-outbound-branding.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const OUTBOUND_NOTICE =
  "VELMORA LABS regroupe des produits de plusieurs vendeurs dans sept univers. Lorsque vous cliquez sur « Voir l'offre », vous êtes redirigé vers le site du vendeur, où l'achat s'effectue. La redirection est mesurée de façon strictement anonyme.";

async function main() {
  // 1. Partenaires démo → « Boutique Démo — … »
  const demoPartners = await db.partner.findMany({ where: { name: { startsWith: "Partenaire Démo" } } });
  for (const p of demoPartners) {
    const newName = p.name.replace("Partenaire Démo", "Boutique Démo");
    await db.partner.update({ where: { id: p.id }, data: { name: newName } });
    console.log(`✓ Partenaire renommé : "${p.name}" → "${newName}"`);
  }

  // 2. Réglage public : outbound_notice (upsert) + suppression de l'ancienne clé affiliate_disclosure
  await db.setting.upsert({
    where: { key: "outbound_notice" },
    update: { value: OUTBOUND_NOTICE },
    create: { key: "outbound_notice", value: OUTBOUND_NOTICE },
  });
  console.log('✓ Réglage "outbound_notice" défini (message neutre « Comment ça marche »).');

  const deleted = await db.setting.deleteMany({ where: { key: "affiliate_disclosure" } });
  console.log(`✓ Ancienne clé "affiliate_disclosure" supprimée (${deleted.count} ligne(s)).`);

  // 3. Note du bandeau démo si elle mentionne encore « partenaires »
  const demoNotice = await db.setting.findUnique({ where: { key: "demo_mode_notice" } });
  if (demoNotice && demoNotice.value.includes("partenaires")) {
    await db.setting.update({
      where: { key: "demo_mode_notice" },
      data: { value: "Catalogue de démonstration — les vendeurs, produits et statistiques affichés sont fictifs et marqués DÉMO." },
    });
    console.log('✓ Réglage "demo_mode_notice" neutralisé (« partenaires » → « vendeurs »).');
  }
}

main()
  .catch((e) => {
    console.error("✗ Échec de la migration :", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
