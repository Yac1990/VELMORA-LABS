/**
 * Vérification planifiée des URLs d'offres — Sprint A (RAPPORT §6 item 4).
 *
 * Usage :
 *   bun scripts/check-offer-urls.ts                 # toutes les offres actives (max 100)
 *   bun scripts/check-offer-urls.ts --limit=200     # augmenter la limite
 *   bun scripts/check-offer-urls.ts --offerId=...   # une seule offre
 *
 * Planification (cron) : ex. toutes les nuits à 04:00 UTC
 *   0 4 * * * cd /home/z/my-project && bun scripts/check-offer-urls.ts >> logs/url-check.log 2>&1
 *
 * Codes de sortie : 0 = toutes joignables (ou aucune offre) ; 2 = liens cassés détectés
 * (→ brancher l'alerte e-mail/messagerie sur ce code) ; 1 = erreur fatale.
 *
 * La même logique est exposée au back-office via POST /api/admin/offers/check
 * (bouton « Tester » de la vue Produits).
 */
import { runOfferCheck } from "@/lib/offer-check";
import { db } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const offerIdArg = args.find((a) => a.startsWith("--offerId="));
  const limit = limitArg ? Math.max(1, parseInt(limitArg.split("=")[1], 10) || 100) : 100;
  const offerId = offerIdArg ? offerIdArg.split("=")[1] : null;

  console.log(`→ Vérification des URLs d'offres (limite ${limit}${offerId ? `, offre ${offerId}` : ""})…`);
  const summary = await runOfferCheck({ offerId, limit });

  if (summary.checked === 0) {
    console.log("✓ Aucune offre active à vérifier.");
    process.exit(0);
  }

  for (const r of summary.results) {
    const icon = r.status === "ok" ? "✓" : "✗";
    const detail = r.status === "ok"
      ? `HTTP ${r.httpStatus ?? "?"}`
      : `${r.reason ?? "injoignable"}${r.httpStatus ? ` (HTTP ${r.httpStatus})` : ""}`;
    console.log(`${icon} [${r.status}] « ${r.productTitle ?? "(produit supprimé)"} » — ${r.partnerName} — ${r.destinationUrl} — ${detail}`);
  }

  console.log(`→ Résumé : ${summary.checked} vérifiée(s), ${summary.ok} OK, ${summary.broken} cassée(s).`);
  if (summary.broken > 0) {
    console.log("⚠ Liens cassés détectés — à corriger dans Admin → Produits → Offres (ou Partenaires → liste blanche).");
    process.exit(2);
  }
  console.log("✓ Toutes les URLs sont joignables.");
  process.exit(0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
