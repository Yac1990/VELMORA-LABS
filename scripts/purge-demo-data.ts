/**
 * Purge des données de démonstration — Sprint A (RAPPORT §6 item 6).
 *
 * Principe (règle projet) : toute donnée créée par prisma/seed.ts porte `isDemo=true`
 * et ne doit jamais être mélangée aux données réelles. Ce script :
 *   1. EXPORT intégral de tout ce qui va être supprimé → backups/demo-export-<ts>.json
 *      (hachages de mots de passe rédigés ; fichier en lecture 0600) ;
 *   2. SUPPRESSION ordonnée en respectant les clés étrangères ;
 *   3. MISE À JOUR du message du bandeau démo (setting `demo_mode_notice`) ;
 *   4. VÉRIFICATION post-purge (aucun isDemo=true restant) + rapport console.
 *
 * Périmètre supprimé :
 *   - partenaires `isDemo=true` (+ règles de commission, intégrations, offres, clics, conversions liés) ;
 *   - produits `isDemo=true` (+ médias, offres) ;
 *   - campagnes `isDemo=true` ;
 *   - contacts CRM `isDemo=true` (+ activités + enregistrements de consentement liés) ;
 *   - assets IA rattachés à un produit démo ;
 *   - comptes de démonstration `@velmora.demo` (SAUF tout compte de rôle owner — jamais supprimé) ;
 *   - clics/conversions réels (isDemo=false) rattachés à un partenaire démo — sans le partenaire
 *     ils ne seraient plus attribuables ; ils sont exportés pour trace avant suppression.
 *
 * Périmètre PRÉSERVÉ : catégories (structure réelle), réglages (12 clés), journal d'audit
 * (append-only), historique d'imports, contacts CRM RÉELS (les liens vers des produits démo
 * sont détachés automatiquement), le compte propriétaire.
 *
 * Usage :
 *   bun scripts/purge-demo-data.ts            # SIMULATION : export + comptes, aucune suppression
 *   bun scripts/purge-demo-data.ts --yes      # exécute l'export PUIS la purge
 * Restaurer les données démo plus tard : bun scripts/db-restore.ts --latest (état pré-purge)
 * ou bun prisma/seed.ts (recrée un jeu de démonstration neuf).
 */
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { db } from "@/lib/db";

const DEMO_EMAIL_SUFFIX = "@velmora.demo";
const POST_PURGE_NOTICE = "Catalogue en préparation — les premières offres partenaires arrivent bientôt.";

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function main() {
  const apply = process.argv.includes("--yes");
  const ROOT = process.cwd();
  const exportDir = resolve(ROOT, "backups");

  if (!existsSync(DB_EXISTS())) {
    console.error("✗ Base introuvable — script interrompu.");
    process.exit(1);
  }

  // ── 1. Identification du périmètre ─────────────────────────────────────────
  const partners = await db.partner.findMany({ where: { isDemo: true } });
  const products = await db.product.findMany({ where: { isDemo: true } });
  const campaigns = await db.campaign.findMany({ where: { isDemo: true } });
  const contacts = await db.crmContact.findMany({ where: { isDemo: true } });
  const demoProfiles = await db.profile.findMany({
    where: { email: { endsWith: DEMO_EMAIL_SUFFIX }, NOT: { role: "owner" } },
  });
  // Sécurité structurelle : on refuse toute purge si un rôle owner se retrouverait dans le lot.
  if (demoProfiles.some((p) => p.role === "owner")) {
    console.error("✗ Garde-fou : un compte owner porte un e-mail @velmora.demo — purge refusée, corrigez d'abord son e-mail.");
    process.exit(1);
  }
  const partnerIds = partners.map((p) => p.id);
  const productIds = products.map((p) => p.id);
  const contactIds = contacts.map((c) => c.id);

  const offers = partnerIds.length
    ? await db.productOffer.findMany({ where: { partnerId: { in: partnerIds } } })
    : [];
  const offerIds = offers.map((o) => o.id);
  const clicks = partnerIds.length ? await db.clickEvent.findMany({ where: { partnerId: { in: partnerIds } } }) : [];
  const conversions = partnerIds.length ? await db.conversion.findMany({ where: { partnerId: { in: partnerIds } } }) : [];
  const conversionIds = conversions.map((c) => c.id);
  const transactions = conversionIds.length
    ? await db.commissionTransaction.findMany({ where: { conversionId: { in: conversionIds } } })
    : [];
  const commissionRules = partnerIds.length ? await db.commissionRule.findMany({ where: { partnerId: { in: partnerIds } } }) : [];
  const integrations = partnerIds.length ? await db.partnerIntegration.findMany({ where: { partnerId: { in: partnerIds } } }) : [];
  const media = productIds.length ? await db.productMedia.findMany({ where: { productId: { in: productIds } } }) : [];
  const activities = contactIds.length ? await db.crmActivity.findMany({ where: { contactId: { in: contactIds } } }) : [];
  const consents = contactIds.length
    ? await db.consentRecord.findMany({ where: { subjectType: "crm_contact", subjectId: { in: contactIds } } })
    : [];
  const aiAssets = productIds.length ? await db.aiAsset.findMany({ where: { productId: { in: productIds } } }) : [];
  // Données réelles rattachées à du démo : préservées, liens détachés (trace ci-dessous).
  const realContactsWithDemoProduct = productIds.length
    ? await db.crmContact.findMany({ where: { isDemo: false, sourceProductId: { in: productIds } }, select: { id: true, name: true, email: true } })
    : [];

  const scope = {
    partners: partners.length, commissionRules: commissionRules.length, partnerIntegrations: integrations.length,
    products: products.length, productMedia: media.length, productOffers: offers.length,
    campaigns: campaigns.length, clickEvents: clicks.length,
    conversions: conversions.length, commissionTransactions: transactions.length,
    crmContacts: contacts.length, crmActivities: activities.length, consentRecords: consents.length,
    aiAssets: aiAssets.length, demoProfiles: demoProfiles.length,
  };
  const totalScope = Object.values(scope).reduce((a, b) => a + b, 0);

  console.log(`→ Périmètre démo identifié : ${totalScope} enregistrement(s)`);
  console.log(`  ${Object.entries(scope).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(", ") || "aucune donnée démo"}`);
  if (realContactsWithDemoProduct.length) {
    console.log(`  ℹ ${realContactsWithDemoProduct.length} contact(s) CRM RÉEL(S) rattaché(s) à un produit démo : conservés, lien produit détaché.`);
  }

  // ── 2. Export JSON (toujours, même en simulation) ─────────────────────────
  if (totalScope > 0) {
    mkdirSync(exportDir, { recursive: true });
    const exportPath = join(exportDir, `demo-export-${timestamp()}.json`);
    const redactProfiles = demoProfiles.map((p) => ({ ...p, passwordHash: "[rédigé]" }));
    writeFileSync(
      exportPath,
      JSON.stringify({ exportedAt: new Date().toISOString(), reason: "Purge des données de démonstration (Sprint A)", scope, tables: {
        partners, commissionRules, partnerIntegrations: integrations, products, productMedia: media,
        productOffers: offers, campaigns, clickEvents: clicks, conversions, commissionTransactions: transactions,
        crmContacts: contacts, crmActivities: activities, consentRecords: consents, aiAssets,
        demoProfiles: redactProfiles,
      } }, null, 1),
      { mode: 0o600 }
    );
    console.log(`→ Export de traçabilité : ${exportPath}`);
  }

  if (!apply) {
    console.log("→ SIMULATION terminée — relancez avec --yes pour exporter puis purger réellement.");
    process.exit(0);
  }
  if (totalScope === 0) {
    console.log("✓ Rien à purger — la base ne contient aucune donnée de démonstration.");
    process.exit(0);
  }

  // ── 3. Suppression ordonnée (feuilles d'abord) ────────────────────────────
  console.log("→ Suppression en cours…");
  if (consents.length) await db.consentRecord.deleteMany({ where: { id: { in: consents.map((c) => c.id) } } });
  if (activities.length) await db.crmActivity.deleteMany({ where: { id: { in: activities.map((a) => a.id) } } });
  if (transactions.length) await db.commissionTransaction.deleteMany({ where: { id: { in: transactions.map((t) => t.id) } } });
  if (conversionIds.length) await db.conversion.deleteMany({ where: { id: { in: conversionIds } } });
  if (clicks.length) await db.clickEvent.deleteMany({ where: { id: { in: clicks.map((c) => c.id) } } });
  if (offerIds.length) await db.productOffer.deleteMany({ where: { id: { in: offerIds } } });
  if (commissionRules.length) await db.commissionRule.deleteMany({ where: { id: { in: commissionRules.map((r) => r.id) } } });
  if (integrations.length) await db.partnerIntegration.deleteMany({ where: { id: { in: integrations.map((i) => i.id) } } });
  if (media.length) await db.productMedia.deleteMany({ where: { id: { in: media.map((m) => m.id) } } });
  if (aiAssets.length) await db.aiAsset.deleteMany({ where: { id: { in: aiAssets.map((a) => a.id) } } });
  if (contactIds.length) await db.crmContact.deleteMany({ where: { id: { in: contactIds } } });
  if (campaigns.length) await db.campaign.deleteMany({ where: { id: { in: campaigns.map((c) => c.id) } } });
  if (productIds.length) await db.product.deleteMany({ where: { id: { in: productIds } } });
  if (partnerIds.length) await db.partner.deleteMany({ where: { id: { in: partnerIds } } });
  if (demoProfiles.length) {
    await db.profile.deleteMany({
      where: { email: { endsWith: DEMO_EMAIL_SUFFIX }, NOT: { role: "owner" } },
    });
  }

  // ── 4. Bandeau démo → message neutre honnête ───────────────────────────────
  await db.setting.updateMany({ where: { key: "demo_mode_notice" }, data: { value: POST_PURGE_NOTICE } });

  // ── 5. Vérification post-purge ─────────────────────────────────────────────
  const [leftPartners, leftProducts, leftCampaigns, leftContacts, leftDemoProfiles] = await Promise.all([
    db.partner.count({ where: { isDemo: true } }),
    db.product.count({ where: { isDemo: true } }),
    db.campaign.count({ where: { isDemo: true } }),
    db.crmContact.count({ where: { isDemo: true } }),
    db.profile.count({ where: { email: { endsWith: DEMO_EMAIL_SUFFIX }, NOT: { role: "owner" } } }),
  ]);
  const remainingDemo = leftPartners + leftProducts + leftCampaigns + leftContacts + leftDemoProfiles;

  const [realContacts, categories, settings, profiles, auditEntries] = await Promise.all([
    db.crmContact.count({ where: { isDemo: false } }),
    db.category.count(),
    db.setting.count(),
    db.profile.count(),
    db.auditLog.count(),
  ]);

  console.log("✓ Purge terminée.");
  console.log(`  Contrôle : isDemo restant = ${remainingDemo} (attendu 0) · profils démo restants = ${leftDemoProfiles}`);
  console.log(`  Préservé : contacts CRM réels=${realContacts}, catégories=${categories}, réglages=${settings}, profils=${profiles}, journal d'audit=${auditEntries} entrées.`);
  console.log(`  Bandeau boutique : « ${POST_PURGE_NOTICE} »`);
  console.log("  Pour restaurer l'état pré-purge : bun scripts/db-restore.ts --latest --yes");
  console.log("  Pour recréer un jeu de démonstration : bun prisma/seed.ts");
  process.exit(remainingDemo === 0 ? 0 : 2);
}

function DB_EXISTS(): string {
  return resolve(process.cwd(), "db/custom.db");
}

main()
  .catch((e) => {
    console.error("✗ Échec de la purge :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
