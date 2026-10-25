/**
 * Sprint B — Passage en réel : enregistrement des 16 réseaux d'affiliation réels
 * de la plateforme (identiques au bandeau logos public/brands/).
 *
 * Règles d'honnêteté :
 * - isDemo = false : ce sont de vrais réseaux, aux vraies URL de site/programme.
 * - status = "pending" : le propriétaire n'a PAS encore de compte chez ces réseaux.
 *   L'activation se fera après inscription (obtention de l'ID d'affilié).
 * - trackingTemplate : UNIQUEMENT les formats de tracking publics documentés par
 *   chaque réseau (jamais inventés). Null = format à confirmer lors de l'activation.
 * - Les IDs d'affilié ne sont PAS inventés : ils se saisiront dans Réglages
 *   (clés Setting tracking.{slug}.affiliateId / .merchantId) une fois les comptes créés.
 *
 * Idempotent : met à jour les partenaires existants (par nom), crée les manquants.
 * Usage : bun scripts/seed-real-partners.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type PartnerSeed = {
  name: string;
  website: string;
  documentationUrl: string;
  supportedCountries: string[];
  allowedDomains: string[];
  trackingTemplate: string | null;
  trackingDocUrl: string | null;
  note: string;
};

const TARGET = ["FR", "BE", "CH", "CA", "MA", "SN", "CI"];

const PARTNERS: PartnerSeed[] = [
  {
    name: "Amazon Associates",
    website: "https://www.amazon.fr",
    documentationUrl: "https://programme-association.amazon.fr/",
    supportedCountries: [...TARGET],
    allowedDomains: [
      "amazon.fr", "www.amazon.fr", "amazon.com", "www.amazon.com",
      "amazon.de", "amazon.es", "amazon.it", "amazon.co.uk", "amazon.ca",
    ],
    // Format réel documenté : paramètre « tag » ajouté à n'importe quelle URL Amazon.
    // L'ID d'affilié FR se termine par -21 (site ID). Ex: ?tag=monsite-21
    trackingTemplate: "{destUrl}?tag={affiliateId}",
    trackingDocUrl: "https://affiliate-program.amazon.com/help/operating/buildinglinks",
    note: "Activer après inscription au Programme Partenaires Amazon (validation obligatoire sous 180 j avec 3 ventes qualifiées). Saisir le tag dans Réglages → tracking.amazon-associates.affiliateId (ex: monsite-21). Le gabarit gère automatiquement « ? » vs « & » si l'URL de destination contient déjà des paramètres.",
  },
  {
    name: "Awin",
    website: "https://www.awin.com",
    documentationUrl: "https://www.awin.com/fr/editeurs",
    supportedCountries: [...TARGET],
    allowedDomains: ["awin1.com", "www.awin1.com", "awin.com", "www.awin.com", "ui.awin.com", "wiki.awin.com"],
    // Format réel documenté (deeplink Awin) : cread.php avec awinmid (annonceur) + awinaffid (éditeur) + ued (URL encodée).
    trackingTemplate: "https://www.awin1.com/cread.php?awinmid={merchantId}&awinaffid={affiliateId}&ued={destUrlEnc}",
    trackingDocUrl: "https://wiki.awin.com/index.php/Publisher:_Creating_Links",
    note: "Activer après inscription éditeur Awin (droits d'entrée ~5 € remboursés sur première commission, selon conditions). Saisir awinaffid dans tracking.awin.affiliateId et l'awinmid de chaque annonceur dans tracking.awin.merchantId.",
  },
  {
    name: "ShareASale",
    website: "https://www.shareasale.com",
    documentationUrl: "https://www.shareasale.com/newsignup.cfm",
    supportedCountries: ["FR", "BE", "CH", "CA"],
    allowedDomains: ["shareasale.com", "www.shareasale.com"],
    // Format réel documenté (deep link r.cfm) : u = ID éditeur, m = ID annonceur, urllink = destination encodée, afftrack = subid.
    trackingTemplate: "https://www.shareasale.com/r.cfm?u={affiliateId}&m={merchantId}&urllink={destUrlEnc}&afftrack={subId}",
    trackingDocUrl: "https://www.shareasale.com/linkgen.cfm",
    note: "Réseau principal du groupe Awin (marché nord-américain). Activer après inscription éditeur. Saisir l'ID éditeur dans tracking.shareasale.affiliateId et l'ID annonceur dans tracking.shareasale.merchantId.",
  },
  {
    name: "CJ Affiliate",
    website: "https://www.cj.com",
    documentationUrl: "https://signup.cj.com/member/publisherSignUp",
    supportedCountries: ["FR", "BE", "CH", "CA"],
    allowedDomains: [
      "anrdoezrs.net", "www.anrdoezrs.net", "tkqlhce.com", "jdoqocy.com",
      "kqzyfj.com", "dpbolvw.net", "qksrv.net", "cj.com", "www.cj.com", "signup.cj.com",
    ],
    // Format réel documenté (Deep Link CJ) : domaine de tracking attribué à l'annonceur
    // (anrdoezrs.net, tkqlhce.com, jdoqocy.com, kqzyfj.com, dpbolvw.net…).
    trackingTemplate: "https://www.anrdoezrs.net/links/{linkId}/type/dlg/sid/{subId}/{destUrl}",
    trackingDocUrl: "https://help.cj.com/en/publisher CJ n'expose pas de gabarit universel public — le domaine de tracking et le linkId sont fournis par l'annonceur dans son interface.",
    note: "Le linkId et le domaine de tracking dépendent de chaque annonceur CJ (ils varient : anrdoezrs.net, tkqlhce.com, jdoqocy.com…). Le gabarit ci-dessus utilise le domaine le plus courant ; à ajuster par annonceur lors de l'activation. Saisir le linkId dans tracking.cj-affiliate.merchantId.",
  },
  {
    name: "Impact",
    website: "https://impact.com",
    documentationUrl: "https://impact.com/creators/",
    supportedCountries: [...TARGET],
    allowedDomains: ["partner.pxf.io", "impact.com", "www.impact.com", "app.impact.com"],
    // Format réel (Impact Links) : /c/{campaignId}/{partnerId}/{sharedId}/{sharedSecretId}?u={url encodée}&subId1=…
    trackingTemplate: "https://partner.pxf.io/c/{campaignId}/{partnerId}/{sharedId}?u={destUrlEnc}&subId1={subId}",
    trackingDocUrl: "https://integrations.impact.com/docs/performance-links",
    note: "Les composants de l'Impact Link (campaignId/partnerId/sharedId) se récupèrent dans l'interface Impact → Home → Impact Link. Les saisir respectivement dans tracking.impact.merchantId (campaign) et tracking.impact.affiliateId (partner).",
  },
  {
    name: "Rakuten Advertising",
    website: "https://marketing.rakuten.com",
    documentationUrl: "https://marketing.rakuten.com/fr/",
    supportedCountries: ["FR", "BE", "CH", "CA"],
    allowedDomains: ["click.linksynergy.com", "linksynergy.com", "marketing.rakuten.com"],
    // Format réel documenté (deeplink LinkShare/Rakuten) : id = token éditeur, mid = ID annonceur, murl = destination encodée.
    trackingTemplate: "https://click.linksynergy.com/deeplink?id={affiliateId}&mid={merchantId}&murl={destUrlEnc}",
    trackingDocUrl: "https://marketing.rakuten.com/blog/deep-linking/",
    note: "Activer après inscription éditeur Rakuten Advertising. Saisir le token éditeur dans tracking.rakuten-advertising.affiliateId et l'ID annonceur (mid) dans tracking.rakuten-advertising.merchantId.",
  },
  {
    name: "TradeDoubler",
    website: "https://www.tradedoubler.com",
    documentationUrl: "https://www.tradedoubler.com/en/publishers/",
    supportedCountries: ["FR", "BE", "CH"],
    allowedDomains: ["pdt.tradedoubler.com", "tradedoubler.com", "www.tradedoubler.com"],
    // Format réel documenté (tracking link TD) : a = ID éditeur, g = ID programme/annonceur, epi = subid, url = destination encodée.
    trackingTemplate: "https://pdt.tradedoubler.com/click?a={affiliateId}&g={merchantId}&epi={subId}&url={destUrlEnc}",
    trackingDocUrl: "https://www.tradedoubler.com/en/publishers/",
    note: "Activer après inscription éditeur TradeDoubler. Saisir l'ID éditeur (a) dans tracking.tradedoubler.affiliateId et l'ID programme (g) de chaque annonceur dans tracking.tradedoubler.merchantId.",
  },
  {
    name: "ClickBank",
    website: "https://www.clickbank.com",
    documentationUrl: "https://www.clickbank.com/signup/",
    supportedCountries: ["FR", "BE", "CH", "CA"],
    allowedDomains: ["hop.clickbank.net", "clickbank.com", "www.clickbank.com"],
    // Format réel documenté (hoplink ClickBank) : affiliate = compte éditeur-affilié, vendor = compte vendeur, tid = tracking id.
    trackingTemplate: "https://hop.clickbank.net/?affiliate={affiliateId}&vendor={merchantId}&tid={subId}",
    trackingDocUrl: "https://www.clickbank.com/kb/article/347/hoplinks/",
    note: "Activer après création du compte ClickBank. Saisir le compte affilié dans tracking.clickbank.affiliateId et le compte vendeur (vendor) de chaque produit dans tracking.clickbank.merchantId.",
  },
  {
    name: "Digistore24",
    website: "https://www.digistore24.com",
    documentationUrl: "https://www.digistore24.com/signup",
    supportedCountries: ["FR", "BE", "CH", "CA"],
    allowedDomains: ["digistore24.com", "www.digistore24.com"],
    // Format réel documenté (redir link Digistore24) : /redir/{id produit}/{compte affilié}/{clé de campagne}.
    trackingTemplate: "https://www.digistore24.com/redir/{merchantId}/{affiliateId}/{subId}",
    trackingDocUrl: "https://www.digistore24.com/info/affiliate",
    note: "Activer après création du compte Digistore24. Saisir le compte affilié dans tracking.digistore24.affiliateId et l'ID produit de chaque promotion dans tracking.digistore24.merchantId.",
  },
  {
    name: "eBay Partner Network",
    website: "https://www.ebay.fr",
    documentationUrl: "https://partnernetwork.ebay.com/",
    supportedCountries: [...TARGET],
    allowedDomains: [
      "rover.ebay.com", "partnernetwork.ebay.com",
      "ebay.fr", "www.ebay.fr", "ebay.com", "www.ebay.com",
    ],
    // Format réel documenté (rover link EPN) : campid = ID campagne, mpre = destination encodée, customid = subid.
    trackingTemplate: "https://rover.ebay.com/rover/1/{campaignId}/1?mpre={destUrlEnc}&campid={affiliateId}&customid={subId}",
    trackingDocUrl: "https://partnernetwork.ebay.com/help/guides/link-building/",
    note: "Activer après inscription EPN. Saisir le campid dans tracking.ebay-partner-network.affiliateId ; {campaignId} (1er segment du rover) est le format de pays-réseau, à confirmer dans l'interface EPN lors de l'activation (tracking.ebay-partner-network.merchantId).",
  },
  {
    name: "Admitad",
    website: "https://www.admitad.com",
    documentationUrl: "https://www.admitad.com/en/publishers/",
    supportedCountries: [...TARGET],
    allowedDomains: ["ad.admitad.com", "admitad.com", "www.admitad.com"],
    // Format réel documenté (deeplink Admitad) : /g/{clé deeplink du programme}/?ulp={url encodée}&subid=…
    trackingTemplate: "https://ad.admitad.com/g/{merchantId}/?ulp={destUrlEnc}&subid={subId}",
    trackingDocUrl: "https://help.admitad.com/en/publisher/tools/deeplink",
    note: "Activer après inscription éditeur Admitad. Pour chaque programme accepté, saisir la clé deeplink « g » dans tracking.admitad.merchantId.",
  },
  {
    name: "PartnerStack",
    website: "https://partnerstack.com",
    documentationUrl: "https://www.partnerstack.com/partners",
    supportedCountries: ["FR", "BE", "CH", "CA"],
    allowedDomains: ["partnerstack.com", "www.partnerstack.com"],
    trackingTemplate: null, // format à confirmer lors de l'activation (liens personnalisés par éditeur SaaS)
    trackingDocUrl: null,
    note: "Réseau B2B SaaS. Les liens de tracking PartnerStack sont personnalisés par éditeur (domaine dédié ou /via/{clé}) — gabarit à enregistrer après acceptation dans un programme. Aucun gabarit générique public documenté : volontairement laissé vide (jamais inventé).",
  },
  {
    name: "Affilae",
    website: "https://www.affilae.com",
    documentationUrl: "https://www.affilae.com/fr/",
    supportedCountries: ["FR", "BE", "CH"],
    allowedDomains: ["affilae.com", "www.affilae.com", "action.affilae.com"],
    trackingTemplate: null, // format à confirmer lors de l'activation
    trackingDocUrl: null,
    note: "Réseau francophone. Gabarit de tracking à enregistrer après activation du compte (disponible dans l'interface éditeur Affilae) — volontairement laissé vide ici.",
  },
  {
    name: "Effinity",
    website: "https://www.effinity.fr",
    documentationUrl: "https://www.effinity.fr/",
    supportedCountries: ["FR", "BE", "CH"],
    allowedDomains: ["effinity.fr", "www.effinity.fr", "effiliation.com", "tracking.effiliation.com"],
    trackingTemplate: null, // format à confirmer lors de l'activation
    trackingDocUrl: null,
    note: "Réseau français (ex-Effiliation). Gabarit de tracking à enregistrer après activation du compte éditeur — volontairement laissé vide ici.",
  },
  {
    name: "Kwanko",
    website: "https://www.kwanko.com",
    documentationUrl: "https://www.kwanko.com/fr/",
    supportedCountries: ["FR", "BE", "CH", "MA"],
    allowedDomains: ["kwanko.com", "www.kwanko.com"],
    trackingTemplate: null, // format à confirmer lors de l'activation
    trackingDocUrl: null,
    note: "Réseau performance francophone/européen. Gabarit de tracking à enregistrer après activation du compte — volontairement laissé vide ici.",
  },
  {
    name: "Chariow",
    website: "https://chariow.com",
    documentationUrl: "https://chariow.com/",
    supportedCountries: ["MA", "SN", "CI", "FR"],
    allowedDomains: ["chariow.com", "www.chariow.com"],
    trackingTemplate: null, // format à confirmer lors de l'activation
    trackingDocUrl: null,
    note: "Plateforme de produits numériques (créateurs Afrique francophone — alignée avec les pays cibles MA/SN/CI). Les liens d'affiliation Chariow sont propres à chaque produit créateur : gabarit à enregistrer après adhésion à un programme — volontairement laissé vide ici.",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Seed partenaires réels — ${PARTNERS.length} réseaux${dryRun ? " (simulation)" : ""}\n`);

  for (const p of PARTNERS) {
    const data = {
      name: p.name,
      website: p.website,
      programType: "affiliate",
      status: "pending",
      documentationUrl: p.documentationUrl,
      supportedCountries: JSON.stringify(p.supportedCountries),
      allowedDomains: JSON.stringify(p.allowedDomains),
      isDemo: false,
      trackingTemplate: p.trackingTemplate,
      trackingDocUrl: p.trackingDocUrl,
      note: p.note,
    };
    const existing = await db.partner.findFirst({ where: { name: p.name } });
    if (dryRun) {
      console.log(`  [sim] ${existing ? "MAJ" : "CRÉATION"} — ${p.name}`);
      continue;
    }
    if (existing) {
      await db.partner.update({ where: { id: existing.id }, data });
      console.log(`  ✓ MAJ — ${p.name}`);
    } else {
      await db.partner.create({ data });
      console.log(`  ✓ Créé — ${p.name}`);
    }
  }

  const total = await db.partner.count();
  const withTemplate = await db.partner.count({ where: { trackingTemplate: { not: null } } });
  console.log(`\nTotal partenaires : ${total} (gabarits de tracking réels : ${withTemplate})`);
  console.log("Statut : pending — activation après inscription du propriétaire + saisie des IDs dans Réglages.");
}

main()
  .catch((e) => {
    console.error("✗ Échec :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
