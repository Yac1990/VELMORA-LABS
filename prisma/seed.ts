/**
 * Seed VELMORA LABS — données de DÉMONSTRATION uniquement.
 * Chaque donnée créée ici porte isDemo=true et ne doit jamais être mélangée aux données réelles.
 * Exécution : bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync, createHash } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function anonSession(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 12);
}

const CATEGORIES = [
  { slug: "numerique", name: "Produits numériques", icon: "FileText", sortOrder: 1, description: "E-books, PDF, modèles Excel, templates, ressources créatives, logiciels et sites web." },
  { slug: "formations", name: "Formations", icon: "GraduationCap", sortOrder: 2, description: "Cours en ligne, programmes professionnels et ressources pédagogiques." },
  { slug: "abonnements", name: "Abonnements & SaaS", icon: "RefreshCw", sortOrder: 3, description: "SaaS, outils de productivité, services numériques et adhésions de vendeurs." },
  { slug: "maison", name: "Maison", icon: "Lamp", sortOrder: 4, description: "Accessoires, mobilier, décoration et électroménager." },
  { slug: "electronique", name: "Électronique", icon: "Cpu", sortOrder: 5, description: "Téléphones, ordinateurs, accessoires et objets connectés." },
  { slug: "immobilier", name: "Immobilier", icon: "Building2", sortOrder: 6, description: "Maisons, appartements, terrains et annonces de vendeurs vérifiés." },
  { slug: "vehicules", name: "Véhicules", icon: "Car", sortOrder: 7, description: "Voitures, motos et offres de vendeurs vérifiés." },
];

// Vendeurs fictifs clairement marqués DÉMO — domaines autorisés : example.com uniquement
const PARTNERS = [
  { name: "Boutique Démo — Marché Général", slug: "demo-market", programType: "affiliate", commissionRule: { ruleType: "percentage", rate: 5 }, countries: ["FR", "BE", "CH", "CA", "MA"] },
  { name: "Boutique Démo — TechStore", slug: "demo-tech", programType: "affiliate", commissionRule: { ruleType: "percentage", rate: 3.5 }, countries: ["FR", "BE", "LU"] },
  { name: "Boutique Démo — Formations Pro", slug: "demo-training", programType: "affiliate", commissionRule: { ruleType: "unknown", rate: null }, countries: ["FR", "CA", "SN", "CI"] },
  { name: "Boutique Démo — Annonces Immo & Auto", slug: "demo-listings", programType: "direct", commissionRule: { ruleType: "fixed", rate: null }, countries: ["FR", "MA", "TN"] },
];

interface SeedProduct {
  title: string; slug: string; category: string; productType: string;
  short: string; description: string;
  priceCents?: number | null; priceMin?: number; priceMax?: number;
  currency: string; priceNote?: string;
  image: string; partner: string; externalId: string;
  features: { label: string; value: string }[];
  allowInquiry?: boolean;
  countries?: string[];
}

const PRODUCTS: SeedProduct[] = [
  {
    title: "Guide Productivité 2025 — E-book", slug: "guide-productivite-2025-ebook", category: "numerique", productType: "digital",
    short: "E-book de 180 pages avec méthodes et modèles prêts à l'emploi.",
    description: "E-book complet de 180 pages réunissant des méthodes de gestion du temps, des modèles de planification et des exercices progressifs. Format PDF avec mises à jour annuelles du contenu. Livraison numérique immédiate sur le site du vendeur.",
    priceCents: 1499, currency: "EUR", image: "/demo/ebook-productivite.png",
    partner: "demo-market", externalId: "DM-EBOOK-001",
    features: [{ label: "Format", value: "PDF, 180 pages" }, { label: "Langue", value: "Français" }, { label: "Mise à jour", value: "Annuelle" }],
  },
  {
    title: "Pack 120 Templates Notion", slug: "pack-120-templates-notion", category: "numerique", productType: "digital",
    short: "Modèles Notion : projets, finances, contenus, CRM simple.",
    description: "Collection de 120 modèles Notion dupliquables en un clic : suivi de projets, budget personnel, calendrier éditorial, mini-CRM et prise de notes. Compatible Notion gratuit et payant. Lien de duplication fourni par le vendeur après achat.",
    priceCents: 2900, currency: "EUR", image: "/demo/templates-notion.png",
    partner: "demo-market", externalId: "DM-NOTION-002",
    features: [{ label: "Contenu", value: "120 modèles" }, { label: "Compatibilité", value: "Notion gratuit & plus" }, { label: "Livraison", value: "Duplication immédiate" }],
  },
  {
    title: "Formation Marketing Digital Avancé", slug: "formation-marketing-digital-avance", category: "formations", productType: "training",
    short: "24 h de vidéo, projets pratiques et certificat de fin.",
    description: "Programme en ligne de 24 heures : stratégie de contenu, publicité payante, SEO et analyse de données. Comprend 8 études de cas, des modèles de campagnes et un accès à une communauté d'apprenants. Accès au programme et paiement traités par le vendeur.",
    priceCents: 19900, currency: "EUR", image: "/demo/formation-marketing.png",
    partner: "demo-training", externalId: "TR-FORM-010",
    features: [{ label: "Durée", value: "24 h de vidéo" }, { label: "Accès", value: "12 mois" }, { label: "Certificat", value: "Oui" }],
  },
  {
    title: "Cours Excel pour Professionnels", slug: "cours-excel-professionnels", category: "formations", productType: "training",
    short: "Maîtrisez TCD, Power Query et automatisation en 15 h.",
    description: "Formation ciblée sur les usages professionnels d'Excel : tableaux croisés dynamiques, Power Query, formules avancées et automatisation de rapports. Exercices corrigés et fichiers de pratique inclus.",
    priceCents: 8900, currency: "EUR", image: "/demo/cours-excel.png",
    partner: "demo-training", externalId: "TR-FORM-011",
    features: [{ label: "Durée", value: "15 h" }, { label: "Niveau", value: "Intermédiaire à avancé" }, { label: "Fichiers", value: "Exercices inclus" }],
  },
  {
    title: "Logiciel SaaS de gestion de projet", slug: "saas-gestion-de-projet", category: "abonnements", productType: "subscription",
    short: "Tableaux Kanban, suivi du temps et rapports — jusqu'à 10 utilisateurs.",
    description: "Abonnement mensuel à un outil de gestion de projet : tableaux Kanban, diagrammes de charge, suivi du temps et rapports exportables. Essai de 14 jours disponible via le vendeur. Prix affiché par utilisateur et par mois.",
    priceCents: 1900, currency: "EUR", priceNote: "par mois / utilisateur", image: "/demo/saas-gestion.png",
    partner: "demo-market", externalId: "DM-SAAS-020",
    features: [{ label: "Essai", value: "14 jours" }, { label: "Utilisateurs", value: "Jusqu'à 10 inclus" }, { label: "Support", value: "E-mail 24/7" }],
  },
  {
    title: "Service VPN Premium", slug: "service-vpn-premium", category: "abonnements", productType: "subscription",
    short: "Chiffrement AES-256, 60 pays, 5 appareils simultanés.",
    description: "Abonnement VPN avec chiffrement AES-256, serveurs dans 60 pays, politique zéro journal auditée et 5 connexions simultanées. Applications Windows, macOS, iOS et Android. La souscription s'effectue sur le site du vendeur.",
    priceCents: 999, currency: "EUR", priceNote: "par mois", image: "/demo/vpn-securite.png",
    partner: "demo-tech", externalId: "TS-VPN-030",
    features: [{ label: "Serveurs", value: "60 pays" }, { label: "Appareils", value: "5 simultanés" }, { label: "Journaux", value: "Politique zéro journal" }],
  },
  {
    title: "Lampe de bureau design LED", slug: "lampe-bureau-design-led", category: "maison", productType: "home",
    short: "Éclairage réglable 2700–6000 K, bras articulé, USB-C.",
    description: "Lampe de bureau LED avec température de couleur réglable de 2700 K à 6000 K, luminosité par paliers, bras articulé en aluminium et alimentation USB-C. Garantie fabricant de 2 ans selon les conditions du vendeur.",
    priceCents: 4990, currency: "EUR", image: "/demo/lampe-bureau.png",
    partner: "demo-market", externalId: "DM-HOME-040",
    features: [{ label: "Matériau", value: "Aluminium" }, { label: "Alimentation", value: "USB-C" }, { label: "Garantie", value: "2 ans" }],
  },
  {
    title: "Organiseur modulaire de cuisine", slug: "organiseur-modulaire-cuisine", category: "maison", productType: "home",
    short: "8 contenants hermétiques empilables, sans BPA.",
    description: "Système d'organisation de placard avec 8 contenants hermétiques empilables, étiquettes incluses et matériaux sans BPA. Compatible lave-vaisselle pour les corps de contenants.",
    priceCents: 3490, currency: "EUR", image: "/demo/organiseur-cuisine.png",
    partner: "demo-market", externalId: "DM-HOME-041",
    features: [{ label: "Contenu", value: "8 contenants" }, { label: "Empilable", value: "Oui" }, { label: "Entretien", value: "Lave-vaisselle (corps)" }],
  },
  {
    title: "Écouteurs sans fil Pro", slug: "ecouteurs-sans-fil-pro", category: "electronique", productType: "electronics",
    short: "Réduction de bruit active, 30 h d'autonomie avec boîtier.",
    description: "Écouteurs true wireless avec réduction de bruit active, Bluetooth 5.3, autonomie de 8 h (30 h avec le boîtier) et certification IPX5. Deux coloris disponibles selon le stock du vendeur.",
    priceCents: 7900, currency: "EUR", image: "/demo/ecouteurs-sans-fil.png",
    partner: "demo-tech", externalId: "TS-AUDIO-050",
    features: [{ label: "Bluetooth", value: "5.3" }, { label: "Autonomie", value: "8 h / 30 h avec boîtier" }, { label: "Résistance", value: "IPX5" }],
  },
  {
    title: "Clavier mécanique compact 75 %", slug: "clavier-mecanique-compact-75", category: "electronique", productType: "electronics",
    short: "Switches interchangeables, rétroéclairage RVB, sans fil.",
    description: "Clavier mécanique au format 75 % avec switches interchangeables à chaud, rétroéclairage RVB par touche, double mode sans fil (2,4 GHz / Bluetooth) et câble USB-C détachable.",
    priceCents: 12900, currency: "EUR", image: "/demo/clavier-mecanique.png",
    partner: "demo-tech", externalId: "TS-CLAV-051",
    features: [{ label: "Format", value: "75 %" }, { label: "Switches", value: "Hot-swap" }, { label: "Connexion", value: "2,4 GHz / BT / USB-C" }],
  },
  {
    title: "Appartement T3 rénové — Lyon 6e", slug: "appartement-t3-lyon-6e", category: "immobilier", productType: "real_estate",
    short: "68 m², 2 chambres, balcon, proche metro — annonce du vendeur.",
    description: "Appartement de type 3 de 68 m² entièrement rénové : séjour lumineux, deux chambres, cuisine équipée, balcon et cave. Immeuble de standing de 1930 avec ascenseur. Les fourchettes de prix sont indicatives ; toute visite s'organise avec le vendeur après demande de renseignements.",
    priceMin: 29900000, priceMax: 31500000, currency: "EUR", image: "/demo/appartement-t3.png",
    partner: "demo-listings", externalId: "LA-IMMO-100", allowInquiry: true,
    features: [{ label: "Surface", value: "68 m²" }, { label: "Pièces", value: "T3, 2 chambres" }, { label: "Extérieur", value: "Balcon" }],
  },
  {
    title: "Villa contemporaine avec piscine — Marrakech", slug: "villa-contemporaine-marrakech", category: "immobilier", productType: "real_estate",
    short: "240 m² habitables, 4 chambres, jardin paysager.",
    description: "Villa contemporaine de 240 m² sur un terrain de 800 m² : quatre chambres avec salles d'eau, séjour double hauteur, piscine chauffée et jardin paysager. Fourchette de prix indicative ; le dossier complet est transmis par le vendeur après demande.",
    priceMin: 89000000, priceMax: 98000000, currency: "EUR", image: "/demo/villa-piscine.png",
    partner: "demo-listings", externalId: "LA-IMMO-101", allowInquiry: true,
    features: [{ label: "Surface", value: "240 m²" }, { label: "Terrain", value: "800 m²" }, { label: "Piscine", value: "Chauffée" }],
  },
  {
    title: "Citadine électrique 100 % électrique", slug: "citadine-electrique-annonce", category: "vehicules", productType: "vehicle",
    short: "Autonomie 320 km WLTP, recharge rapide DC.",
    description: "Citadine électrique d'occasion récente avec autonomie WLTP de 320 km, charge rapide DC jusqu'à 100 kW, historique d'entretien complet et garantie constructeur restante. Le prix final dépend des options et de la disponibilité du véhicule chez le vendeur.",
    priceMin: 1890000, priceMax: 2190000, currency: "EUR", image: "/demo/voiture-electrique.png",
    partner: "demo-listings", externalId: "LA-AUTO-200", allowInquiry: true,
    features: [{ label: "Autonomie", value: "320 km WLTP" }, { label: "Recharge", value: "DC 100 kW" }, { label: "Historique", value: "Entretien complet" }],
  },
  {
    title: "Scooter électrique 125 équivalent", slug: "scooter-electrique-125-equivalent", category: "vehicules", productType: "vehicle",
    short: "90 km d'autonomie, batterie amovible, freins ABS.",
    description: "Scooter électrique équivalent 125 cm³ : batterie amovible de 3,4 kWh, autonomie annoncée de 90 km en cycle urbain, freins ABS et connectivité mobile. Immatriculation et livraison à organiser avec le vendeur.",
    priceMin: 420000, priceMax: 490000, currency: "EUR", image: "/demo/scooter-electrique.png",
    partner: "demo-listings", externalId: "LA-AUTO-201", allowInquiry: true,
    features: [{ label: "Autonomie", value: "90 km urbain" }, { label: "Batterie", value: "3,4 kWh amovible" }, { label: "Sécurité", value: "ABS" }],
  },
];

async function main() {
  console.log("→ Nettoyage des tables…");
  await db.commissionTransaction.deleteMany();
  await db.conversion.deleteMany();
  await db.clickEvent.deleteMany();
  await db.commissionRule.deleteMany();
  await db.productOffer.deleteMany();
  await db.productMedia.deleteMany();
  await db.aiAsset.deleteMany();
  await db.socialPost.deleteMany();
  await db.crmActivity.deleteMany();
  await db.consentRecord.deleteMany();
  await db.crmContact.deleteMany();
  await db.importJob.deleteMany();
  await db.auditLog.deleteMany();
  await db.partnerIntegration.deleteMany();
  await db.campaign.deleteMany();
  await db.product.deleteMany();
  await db.partner.deleteMany();
  await db.category.deleteMany();
  await db.profile.deleteMany();
  await db.setting.deleteMany();
  await db.exchangeRate.deleteMany();

  console.log("→ Paramètres de marque…");
  const settings: { key: string; value: string }[] = [
    { key: "brand_name", value: "VELMORA LABS" },
    { key: "brand_tagline", value: "Découvrez plus. Choisissez mieux." },
    { key: "brand_logo", value: "/velmora-logo.png" },
    { key: "reference_currency", value: "EUR" },
    { key: "display_currencies", value: JSON.stringify(["EUR", "USD", "MAD"]) },
    { key: "target_countries", value: JSON.stringify(["FR", "BE", "CH", "CA", "MA", "SN", "CI"]) },
    { key: "default_language", value: "fr" },
    { key: "timezone", value: "UTC" },
    { key: "cookie_consent", value: "banner" },
    { key: "demo_mode_notice", value: "Catalogue de démonstration — les vendeurs, produits et statistiques affichés sont fictifs et marqués DÉMO." },
    { key: "outbound_notice", value: "VELMORA LABS regroupe des produits de plusieurs vendeurs dans sept univers. Lorsque vous cliquez sur « Voir l'offre », vous êtes redirigé vers le site du vendeur, où l'achat s'effectue. La redirection est mesurée de façon strictement anonyme." },
    { key: "ai_monthly_quota", value: "200" },
  ];
  for (const s of settings) await db.setting.create({ data: s });

  console.log("→ Profils utilisateurs (démo, 5 rôles)…");
  const demoPassword = hashPassword("velmora-demo-2024");
  const profiles = [
    { email: "admin@velmora.demo", displayName: "Amina (Propriétaire)", role: "owner" },
    { email: "catalogue@velmora.demo", displayName: "Bruno (Catalogue)", role: "catalog_manager" },
    { email: "marketing@velmora.demo", displayName: "Chloé (Marketing)", role: "marketing_editor" },
    { email: "crm@velmora.demo", displayName: "Djamal (CRM)", role: "crm_manager" },
    { email: "analyste@velmora.demo", displayName: "Elsa (Analyste)", role: "analyst" },
  ];
  for (const p of profiles) {
    await db.profile.create({ data: { ...p, passwordHash: demoPassword } });
  }

  console.log("→ Catégories…");
  const categoryMap = new Map<string, string>();
  for (const c of CATEGORIES) {
    const created = await db.category.create({ data: c });
    categoryMap.set(c.slug, created.id);
  }

  console.log("→ Vendeurs démo…");
  const partnerMap = new Map<string, string>();
  for (const p of PARTNERS) {
    const created = await db.partner.create({
      data: {
        name: p.name,
        website: `https://example.com/${p.slug}`,
        programType: p.programType,
        status: "active",
        supportedCountries: JSON.stringify(p.countries),
        allowedDomains: JSON.stringify(["example.com"]),
        isDemo: true,
        note: "Vendeur fictif de démonstration — aucune offre réelle connectée.",
      },
    });
    partnerMap.set(p.slug, created.id);
    // Règle de commission documentée (démo) ou explicitement « inconnue »
    await db.commissionRule.create({
      data: {
        partnerId: created.id,
        ruleType: p.commissionRule.ruleType,
        rate: p.commissionRule.rate,
        currency: "EUR",
        note: p.commissionRule.ruleType === "unknown" ? "Taux non communiqué par le vendeur — affiché « inconnu »." : "Règle de démonstration.",
      },
    });
    // Intégration déclarée mais NON configurée (aucune clé API fournie)
    await db.partnerIntegration.create({
      data: {
        partnerId: created.id,
        integrationType: "csv",
        status: "not_configured",
        statusDetail: "Aucune clé API ni flux configuré. Import CSV manuel disponible.",
      },
    });
  }

  console.log("→ Produits démo + offres…");
  const productIds: string[] = [];
  for (const p of PRODUCTS) {
    const created = await db.product.create({
      data: {
        categoryId: categoryMap.get(p.category) || null,
        title: p.title,
        slug: p.slug,
        shortDescription: p.short,
        description: p.description,
        status: "published",
        productType: p.productType,
        language: "fr",
        countries: JSON.stringify(p.countries || ["FR", "BE", "CH", "MA", "CA"]),
        features: JSON.stringify(p.features),
        priceMinCents: p.priceMin ?? p.priceCents ?? null,
        priceMaxCents: p.priceMax ?? p.priceCents ?? null,
        currency: p.currency,
        priceNote: p.priceNote ?? null,
        allowInquiry: p.allowInquiry ?? false,
        isDemo: true,
      },
    });
    productIds.push(created.id);
    await db.productMedia.create({
      data: { productId: created.id, url: p.image, altText: p.title, sortOrder: 0 },
    });
    await db.productOffer.create({
      data: {
        productId: created.id,
        partnerId: partnerMap.get(p.partner)!,
        externalId: p.externalId,
        destinationUrl: `https://example.com/go/${p.externalId}`,
        priceCents: p.priceMin ?? p.priceCents ?? null,
        currency: p.currency,
        availability: "in_stock",
        lastSyncedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
        urlCheckedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
        urlCheckStatus: "ok",
        isActive: true,
      },
    });
  }

  console.log("→ Campagnes démo…");
  const campaigns = [
    { name: "Démo — Campagne TikTok Tech", channel: "social", objective: "Notoriété", targetCountry: "FR" },
    { name: "Démo — Newsletter Mensuelle", channel: "email", objective: "Conversion", targetCountry: "FR" },
    { name: "Démo — Guide SEO Comparatifs", channel: "content", objective: "Trafic organique", targetCountry: "MA" },
  ];
  const campaignIds: string[] = [];
  for (const c of campaigns) {
    const created = await db.campaign.create({
      data: { ...c, status: "active", isDemo: true, startAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60) },
    });
    campaignIds.push(created.id);
  }

  console.log("→ Événements de clic démo (90 jours)…");
  const offers = await db.productOffer.findMany();
  let clicks = 0;
  const now = Date.now();
  for (let day = 89; day >= 0; day--) {
    const base = 6 + Math.round(8 * Math.sin(day / 7) + Math.random() * 6);
    for (let i = 0; i < base; i++) {
      const offer = offers[Math.floor(Math.random() * offers.length)];
      const clickedAt = new Date(now - day * 86400000 - Math.floor(Math.random() * 86400000));
      await db.clickEvent.create({
        data: {
          offerId: offer.id,
          partnerId: offer.partnerId,
          campaignId: Math.random() < 0.6 ? campaignIds[Math.floor(Math.random() * campaignIds.length)] : null,
          clickedAt,
          anonymousSessionId: anonSession(`seed-${day}-${i}`),
          subId: `sub_${Math.floor(Math.random() * 4) + 1}`,
          countryCoarse: ["FR", "BE", "MA", "CA", "CH"][Math.floor(Math.random() * 5)],
          isDemo: true,
        },
      });
      clicks++;
    }
  }

  console.log(`→ Conversions démo (${clicks} clics créés)…`);
  const statuses = ["pending", "confirmed", "confirmed", "cancelled", "paid", "paid", "estimated"];
  const convCurrency = ["EUR", "EUR", "EUR", "USD", "MAD"];
  let convCount = 0;
  for (let i = 0; i < 46; i++) {
    const offer = offers[Math.floor(Math.random() * offers.length)];
    const status = statuses[i % statuses.length];
    const orderValue = 2000 + Math.floor(Math.random() * 180000);
    const rate = 0.05;
    const commission = Math.round(orderValue * rate);
    const reportedAt = new Date(now - Math.floor(Math.random() * 88) * 86400000);
    const created = await db.conversion.create({
      data: {
        partnerId: offer.partnerId,
        externalConversionId: `DEMO-CONV-${String(i + 1).padStart(4, "0")}`,
        offerId: offer.id,
        reportedAt,
        status,
        orderValueCents: orderValue,
        orderCurrency: convCurrency[i % convCurrency.length],
        commissionAmountCents: commission,
        commissionCurrency: "EUR",
        isDemo: true,
        sourceReportId: "demo-csv-import",
        note: "Conversion de démonstration générée par le seed.",
      },
    });
    await db.commissionTransaction.create({
      data: {
        conversionId: created.id,
        eventType: status,
        amountCents: commission,
        currency: "EUR",
        occurredAt: reportedAt,
        externalReference: `DEMO-TX-${i + 1}`,
        notes: "Événement de démonstration.",
      },
    });
    convCount++;
  }

  console.log("→ Contacts CRM démo + consentements…");
  const contacts = [
    { name: "Sarah Benali", email: "sarah.benali@example-mail.test", country: "FR", status: "qualified", source: "inquiry", productId: productIds[10], consent: "granted" },
    { name: "Thomas Girard", email: "t.girard@example-mail.test", country: "BE", status: "in_discussion", source: "contact_form", consent: "granted" },
    { name: "Fatou Diallo", email: "fatou.diallo@example-mail.test", country: "SN", status: "new", source: "contact_form", consent: "none" },
    { name: "Marco Rossi", email: "marco.rossi@example-mail.test", country: "CA", status: "to_contact", source: "inquiry", productId: productIds[12], consent: "granted" },
    { name: "Nadia El Amrani", email: "n.elamrani@example-mail.test", country: "MA", status: "converted", source: "inquiry", productId: productIds[11], consent: "granted" },
    { name: "Luc Martin", email: "luc.martin@example-mail.test", country: "FR", status: "unsubscribed", source: "contact_form", consent: "withdrawn" },
  ];
  for (const c of contacts) {
    const created = await db.crmContact.create({
      data: {
        name: c.name, email: c.email, country: c.country,
        status: c.status, source: c.source,
        sourceProductId: c.productId || null,
        consentStatus: c.consent,
        consentPurpose: c.consent === "granted" ? "Réponses aux demandes et communications commerciales (double opt-in simulé en démo)" : null,
        consentAt: c.consent === "granted" ? new Date(now - 86400000 * 30) : null,
        tags: JSON.stringify([c.source, "demo"]),
        isDemo: true,
      },
    });
    if (c.consent !== "none") {
      await db.consentRecord.create({
        data: {
          subjectType: "crm_contact",
          subjectId: created.id,
          purpose: "communications_commerciales",
          status: c.consent,
          source: c.source || "demo",
          recordedAt: new Date(now - 86400000 * 30),
          withdrawnAt: c.consent === "withdrawn" ? new Date(now - 86400000 * 5) : null,
        },
      });
    }
    await db.crmActivity.create({
      data: { contactId: created.id, activityType: "note", notes: "Contact créé via données de démonstration.", createdAt: new Date(now - 86400000 * 25) },
    });
  }

  console.log("✓ Seed terminé : 14 produits, 46 conversions, ~900 clics, 6 contacts CRM — 100 % DÉMO.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
