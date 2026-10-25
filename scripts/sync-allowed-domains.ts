/**
 * Sprint B — Synchronise les listes blanches Partner.allowedDomains avec les
 * destinations RÉELLES des offres du partenaire.
 *
 * Contexte : les partenaires réseau (ClickBank, PartnerStack, Impact…) ont leurs
 * domaines de TRACKING en liste blanche (hop.clickbank.net, partner.pxf.io…).
 * Tant que les IDs d'affilié ne sont pas configurés (Réglages tracking.<slug>.*),
 * /api/go redirige DIRECTEMENT vers la page du vendeur — ce domaine marchand doit
 * donc être autorisé lui aussi (anti open-redirect conservé : rien n'est ouvert).
 *
 * Normalisation identique au back-office : minuscules, « www. » retiré, dédupliqué.
 * Réinitialise aussi urlCheckStatus=« unverified » des offres marquées « broken »
 * uniquement parce que leur domaine marchand était absent de la liste (l'état
 * « unverified » est honnête : pas encore vérifié côté serveur).
 *
 * Usage : bun scripts/sync-allowed-domains.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function normalize(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

async function main() {
  const partners = await db.partner.findMany({
    select: { id: true, name: true, allowedDomains: true, offers: { select: { destinationUrl: true } } },
  });

  let touched = 0;
  for (const p of partners) {
    const current: string[] = JSON.parse(p.allowedDomains || "[]");
    const merged = new Set(current);
    for (const o of p.offers) {
      try {
        merged.add(normalize(new URL(o.destinationUrl).hostname));
      } catch {
        // URL invalide : ignorée (la vérification d'offres la signalera « broken »)
      }
    }
    const next = [...merged].sort();
    if (next.length === current.length && next.every((d, i) => d === current[i])) {
      console.log(`  ${p.name} : liste blanche déjà à jour (${next.length} domaines)`);
      continue;
    }
    const added = next.filter((d) => !current.includes(d));
    console.log(`  ${p.name} : +${added.length} → ${added.join(", ") || "(tri seulement)"}`);
    touched++;
    if (!dryRun) {
      await db.partner.update({ where: { id: p.id }, data: { allowedDomains: JSON.stringify(next) } });
    }
  }

  // Offres injustement marquées « broken » par le garde-fou 403 : retour à « unverified ».
  if (!dryRun) {
    const offers = await db.productOffer.findMany({
      where: { urlCheckStatus: "broken" },
      select: { id: true, destinationUrl: true, partner: { select: { allowedDomains: true } } },
    });
    let reset = 0;
    for (const o of offers) {
      const allowed: string[] = JSON.parse(o.partner.allowedDomains || "[]");
      try {
        const host = normalize(new URL(o.destinationUrl).hostname);
        if (allowed.some((a) => host === a || host.endsWith("." + a))) {
          await db.productOffer.update({
            where: { id: o.id },
            data: { urlCheckStatus: "unverified", urlCheckedAt: null },
          });
          reset++;
        }
      } catch {
        // URL invalide : laissée en l'état
      }
    }
    console.log(`Offres remises à « unverified » : ${reset}`);
  }

  console.log(`${dryRun ? "[DRY-RUN] " : ""}Partenaires mis à jour : ${touched}/${partners.length}`);
}

main()
  .catch((e) => {
    console.error("✗ Échec :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
