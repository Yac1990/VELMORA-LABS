/**
 * Sprint B — Passage en réel : catalogue initial de produits RÉELS.
 *
 * Règles d'honnêteté :
 * - 8 produits réels et vérifiables, une offre chacun pointant vers la page officielle du produit.
 * - Chaque destinationUrl a été vérifiée HTTP 200 (curl, 24/10/2026) AVANT inscription ici.
 *   Les sites qui bloquent le contrôle serveur (Amazon.fr produits, eBay, Udemy : 403/503 anti-robots)
 *   ne sont volontairement PAS dans ce seed — le propriétaire les ajoutera via le back-office
 *   (« Tester ») quand ses comptes partenaires seront actifs.
 * - Aucun prix inventé : priceCents null (prix variables selon région/promo — affichage « — »).
 * - Aucune image : media vide (pas de visuel trompeur sur des produits de marques).
 * - Descriptions factuelles en français, sans superlatifs marketing.
 * - isDemo = false. Partenaires liés = les 16 réseaux réels (statut pending).
 *
 * Idempotent : upsert par slug. Usage : bun scripts/seed-real-catalog.ts [--dry-run]
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type Seed = {
  slug: string;
  title: string;
  categorySlug: string;
  productType: string; // digital | training | subscription
  shortDescription: string;
  description: string;
  features: { label: string; value: string }[];
  partnerName: string;
  destinationUrl: string;
};

const PRODUCTS: Seed[] = [
  {
    slug: "notion",
    title: "Notion — plans payants",
    categorySlug: "abonnements",
    productType: "subscription",
    shortDescription: "Espace de travail tout-en-un : notes, documents, bases de données et wikis partagés.",
    description:
      "Notion centralise notes, documents, bases de données et wikis dans un espace de travail collaboratif. L'offre gratuite couvre l'usage individuel de base ; les plans payants (Plus, Business, Enterprise) ajoutent membres illimités, historique étendu et administration avancée. Facturation mensuelle ou annuelle, tarif par membre. Lien ci-dessous vers la page tarifaire officielle.",
    features: [
      { label: "Type", value: "Abonnement SaaS" },
      { label: "Essai gratuit", value: "Oui — plan gratuit disponible" },
      { label: "Langues", value: "Français, anglais, autres" },
      { label: "Programme partenaire", value: "PartnerStack (activation en cours)" },
    ],
    partnerName: "PartnerStack",
    destinationUrl: "https://www.notion.com/pricing",
  },
  {
    slug: "grammarly-premium",
    title: "Grammarly Premium",
    categorySlug: "abonnements",
    productType: "subscription",
    shortDescription: "Assistant de rédaction en anglais : grammaire, clarté, ton et détection de plagiat.",
    description:
      "Grammarly corrige grammaire, orthographe et ponctuation en anglais, propose des reformulations de clarté et adapte le ton (formel, amical…). La version Premium ajoute les suggestions avancées de vocabulaire, l'ajustement de ton complet et la détection de plagiat. Extension navigateur, applications et intégrations bureautiques. Page officielle des plans ci-dessous.",
    features: [
      { label: "Type", value: "Abonnement SaaS" },
      { label: "Essai gratuit", value: "Oui — version gratuite disponible" },
      { label: "Langue", value: "Anglais" },
      { label: "Programme partenaire", value: "PartnerStack (activation en cours)" },
    ],
    partnerName: "PartnerStack",
    destinationUrl: "https://www.grammarly.com/plans",
  },
  {
    slug: "framer",
    title: "Framer — création de sites web",
    categorySlug: "abonnements",
    productType: "subscription",
    shortDescription: "Création de sites web professionnels sans code, avec hébergement et CMS inclus.",
    description:
      "Framer permet de concevoir et publier des sites web responsive sans écrire de code : éditeur visuel, CMS intégré, animations et hébergement inclus. Plan gratuit pour découvrir, plans payants par site selon trafic et fonctionnalités. Page tarifaire officielle ci-dessous.",
    features: [
      { label: "Type", value: "Abonnement SaaS" },
      { label: "Essai gratuit", value: "Oui — plan gratuit disponible" },
      { label: "Usage", value: "Sites vitrines, portfolios, landing pages" },
      { label: "Programme partenaire", value: "PartnerStack (activation en cours)" },
    ],
    partnerName: "PartnerStack",
    destinationUrl: "https://www.framer.com/pricing/",
  },
  {
    slug: "shopify",
    title: "Shopify — boutique en ligne",
    categorySlug: "abonnements",
    productType: "subscription",
    shortDescription: "Plateforme e-commerce complète : catalogue, paiements, expédition et canaux de vente.",
    description:
      "Shopify permet de créer et gérer une boutique en ligne : catalogue produits, paiement sécurisé, expédition, marketing multicanal (réseaux sociaux, marketplaces). Interface en français, assistance 24/7. Essai d'ouverture de boutique disponible avant abonnement mensuel. Site officiel français ci-dessous.",
    features: [
      { label: "Type", value: "Abonnement SaaS" },
      { label: "Essai gratuit", value: "Disponible selon éligibilité" },
      { label: "Usage", value: "Vente en ligne B2C/D2C" },
      { label: "Programme partenaire", value: "Impact (activation en cours)" },
    ],
    partnerName: "Impact",
    destinationUrl: "https://www.shopify.com/fr",
  },
  {
    slug: "kindle-unlimited",
    title: "Kindle Unlimited",
    categorySlug: "abonnements",
    productType: "subscription",
    shortDescription: "Lecture numérique illimitée Amazon : livres, magazines et audiobooks inclus.",
    description:
      "Kindle Unlimited donne accès à un catalogue de lecture illimitée sur l'écosystème Kindle et l'application de lecture gratuite : romans, essais, magazines et audiobooks sélectionnés. Abonnement mensuel, résiliable à tout moment ; période d'essai selon éligibilité. Page d'abonnement officielle Amazon France ci-dessous.",
    features: [
      { label: "Type", value: "Abonnement lecture" },
      { label: "Essai gratuit", value: "Selon éligibilité du compte Amazon" },
      { label: "Supports", value: "Kindle, app iOS/Android, navigateur" },
      { label: "Programme partenaire", value: "Amazon Associates (activation en cours)" },
    ],
    partnerName: "Amazon Associates",
    destinationUrl: "https://www.amazon.fr/kindle-dbs/hz/subscribe/ku",
  },
  {
    slug: "teds-woodworking",
    title: "Ted's Woodworking — 16 000 plans de menuiserie",
    categorySlug: "formations",
    productType: "training",
    shortDescription: "Bibliothèque numérique de 16 000 plans de menuiserie avec instructions pas-à-pas.",
    description:
      "Ted's Woodworking est une bibliothèque numérique de 16 000 plans de menuiserie : meubles, établis, extérieurs et projets décoratifs. Chaque plan inclut instructions étape par étape, listes de matériaux, schémas de coupe et vues 3D pour la majorité des projets. Téléchargement numérique après achat unique. Page officielle du vendeur ci-dessous.",
    features: [
      { label: "Type", value: "Produit numérique (achat unique)" },
      { label: "Contenu", value: "16 000 plans + instructions + listes de matériaux" },
      { label: "Niveau", value: "Débutant à avancé" },
      { label: "Programme partenaire", value: "ClickBank (activation en cours)" },
    ],
    partnerName: "ClickBank",
    destinationUrl: "https://www.tedswoodworking.com/",
  },
  {
    slug: "wood-profits",
    title: "Wood Profits — lancer son activité de menuiserie",
    categorySlug: "formations",
    productType: "training",
    shortDescription: "Guide numérique pour démarrer une activité de menuiserie à domicile, e-book et audio.",
    description:
      "Wood Profits est un guide numérique (e-book + version audio) sur le démarrage d'une activité de menuiserie à domicile : choix des produits à fabriquer, tarification, outils de base, canaux de vente et promotion locale en ligne. Contenu en anglais. Page officielle du vendeur ci-dessous.",
    features: [
      { label: "Type", value: "Produit numérique (achat unique)" },
      { label: "Contenu", value: "E-book + guide audio" },
      { label: "Langue du contenu", value: "Anglais" },
      { label: "Programme partenaire", value: "ClickBank (activation en cours)" },
    ],
    partnerName: "ClickBank",
    destinationUrl: "https://www.woodprofits.com/",
  },
  {
    slug: "myshedplans",
    title: "MyShedPlans — 12 000 plans de construction",
    categorySlug: "numerique",
    productType: "digital",
    shortDescription: "Bibliothèque numérique de plus de 12 000 plans : abris de jardin, cabanons et aménagements.",
    description:
      "MyShedPlans est une collection numérique de plus de 12 000 plans de construction : abris de jardin, cabanons, garages et aménagements extérieurs. Plans avec schémas détaillés, listes de coupes et de matériaux, progressant du projet simple aux constructions plus vastes. Contenu en anglais, téléchargement après achat unique. Page officielle du vendeur ci-dessous.",
    features: [
      { label: "Type", value: "Produit numérique (achat unique)" },
      { label: "Contenu", value: "12 000+ plans avec schémas et listes de matériaux" },
      { label: "Langue du contenu", value: "Anglais" },
      { label: "Programme partenaire", value: "ClickBank (activation en cours)" },
    ],
    partnerName: "ClickBank",
    destinationUrl: "https://www.myshedplans.com/",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Catalogue réel — ${PRODUCTS.length} produits${dryRun ? " (simulation)" : ""}\n`);

  // Résolution des catégories et partenaires
  const cats = await db.category.findMany({ select: { id: true, slug: true } });
  const partners = await db.partner.findMany({ select: { id: true, name: true } });

  for (const p of PRODUCTS) {
    const cat = cats.find((c) => c.slug === p.categorySlug);
    if (!cat) {
      console.error(`  ✗ ${p.slug} : catégorie « ${p.categorySlug} » introuvable — ignoré.`);
      continue;
    }
    const partner = partners.find((x) => x.name === p.partnerName);
    if (!partner) {
      console.error(`  ✗ ${p.slug} : partenaire « ${p.partnerName} » introuvable — exécutez d'abord seed-real-partners.ts.`);
      continue;
    }

    const productData = {
      categoryId: cat.id,
      title: p.title,
      slug: p.slug,
      shortDescription: p.shortDescription,
      description: p.description,
      status: "published",
      productType: p.productType,
      language: "fr",
      countries: JSON.stringify([]),
      features: JSON.stringify(p.features),
      priceMinCents: null,
      priceMaxCents: null,
      currency: "EUR",
      priceNote: null,
      allowInquiry: false,
      isDemo: false,
    };
    const offerData = {
      destinationUrl: p.destinationUrl,
      priceCents: null,
      currency: "EUR",
      availability: "unknown",
      lastSyncedAt: new Date(),
      isActive: true,
    };

    if (dryRun) {
      console.log(`  [sim] ${p.slug} → ${p.partnerName} — ${p.destinationUrl}`);
      continue;
    }

    const existing = await db.product.findUnique({ where: { slug: p.slug }, include: { offers: true } });
    if (existing) {
      await db.product.update({ where: { id: existing.id }, data: productData });
      const offer = existing.offers[0];
      if (offer) {
        await db.productOffer.update({ where: { id: offer.id }, data: { ...offerData, partnerId: partner.id } });
      } else {
        await db.productOffer.create({ data: { productId: existing.id, partnerId: partner.id, ...offerData } });
      }
      console.log(`  ✓ MAJ — ${p.slug} (${p.partnerName})`);
    } else {
      await db.product.create({
        data: { ...productData, offers: { create: { partnerId: partner.id, ...offerData } } },
      });
      console.log(`  ✓ Créé — ${p.slug} (${p.partnerName}) — ${p.destinationUrl}`);
    }
  }

  const [products, offers] = await Promise.all([db.product.count(), db.productOffer.count()]);
  console.log(`\nTotal : ${products} produits réels, ${offers} offres (aucune donnée de démonstration).`);
}

main()
  .catch((e) => {
    console.error("✗ Échec :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
