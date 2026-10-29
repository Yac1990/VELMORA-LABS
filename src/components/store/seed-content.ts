/**
 * Task 44 — contenu SEED bilingue (FR d'origine / EN) pour les produits et catégories
 * de démonstration, avec le même contrat d'honnêteté des données que seedAware (Task 42) :
 *
 *  - la valeur affichée est comparée au texte FR D'ORIGINE du seed ;
 *  - identique  → la traduction EN est affichée quand la boutique est en anglais
 *    (le contenu du seed n'a jamais été personnalisé : il peut suivre la langue) ;
 *  - différent  → la valeur de la base est affichée TELLE QUELLE, quelle que soit la
 *    langue (contenu réellement personnalisé par l'admin : honest data).
 *
 * Source de vérité des textes FR : prisma/seed.ts (copie exacte — vérifiée par QA).
 * Aucune traduction machine dynamique : uniquement ces traductions rédigées.
 */
import type { UiLang } from "@/lib/client";

/* ───────────────────────── Catégories du seed ───────────────────────── */

/** slug → nom EN ; la comparaison se fait sur le nom FR d'origine (seed.ts). */
const SEED_CATEGORY_FR_NAME: Record<string, string> = {
  numerique: "Produits numériques",
  formations: "Formations",
  abonnements: "Abonnements & SaaS",
  maison: "Maison",
  electronique: "Électronique",
  immobilier: "Immobilier",
  vehicules: "Véhicules",
};

const SEED_CATEGORY_EN_NAME: Record<string, string> = {
  numerique: "Digital products",
  formations: "Training",
  abonnements: "Subscriptions & SaaS",
  maison: "Home",
  electronique: "Electronics",
  immobilier: "Real estate",
  vehicules: "Vehicles",
};

/** Nom de catégorie localisé : correspondance par slug PUIS par nom FR exact. */
export function localizeCategoryName(
  slug: string | null | undefined,
  frName: string | null | undefined,
  lang: UiLang
): string {
  if (!frName) return "";
  if (lang !== "en") return frName;
  if (slug && SEED_CATEGORY_EN_NAME[slug]) return SEED_CATEGORY_EN_NAME[slug];
  const slugByName = Object.entries(SEED_CATEGORY_FR_NAME).find(([, fr]) => fr === frName)?.[0];
  return (slugByName && SEED_CATEGORY_EN_NAME[slugByName]) || frName;
}

/* ───────────────────────── Produits du seed ───────────────────────── */

export interface SeedProductTexts {
  title: string;
  short: string | null;
  description: string;
  features: { label: string; value: string }[];
  priceNote: string | null;
}

const SEED_PRODUCTS: Record<string, { fr: SeedProductTexts; en: SeedProductTexts }> = {
  "guide-productivite-2025-ebook": {
    fr: {
      title: "Guide Productivité 2025 — E-book",
      short: "E-book de 180 pages avec méthodes et modèles prêts à l'emploi.",
      description:
        "E-book complet de 180 pages réunissant des méthodes de gestion du temps, des modèles de planification et des exercices progressifs. Format PDF avec mises à jour annuelles du contenu. Livraison numérique immédiate sur le site du vendeur.",
      features: [
        { label: "Format", value: "PDF, 180 pages" },
        { label: "Langue", value: "Français" },
        { label: "Mise à jour", value: "Annuelle" },
      ],
      priceNote: null,
    },
    en: {
      title: "2025 Productivity Guide — E-book",
      short: "180-page e-book with ready-to-use methods and templates.",
      description:
        "Complete 180-page e-book bringing together time-management methods, planning templates and progressive exercises. PDF format with annual content updates. Instant digital delivery on the seller's website.",
      features: [
        { label: "Format", value: "PDF, 180 pages" },
        { label: "Language", value: "French" },
        { label: "Updates", value: "Annual" },
      ],
      priceNote: null,
    },
  },
  "pack-120-templates-notion": {
    fr: {
      title: "Pack 120 Templates Notion",
      short: "Modèles Notion : projets, finances, contenus, CRM simple.",
      description:
        "Collection de 120 modèles Notion dupliquables en un clic : suivi de projets, budget personnel, calendrier éditorial, mini-CRM et prise de notes. Compatible Notion gratuit et payant. Lien de duplication fourni par le vendeur après achat.",
      features: [
        { label: "Contenu", value: "120 modèles" },
        { label: "Compatibilité", value: "Notion gratuit & plus" },
        { label: "Livraison", value: "Duplication immédiate" },
      ],
      priceNote: null,
    },
    en: {
      title: "Pack of 120 Notion Templates",
      short: "Notion templates: projects, finance, content, simple CRM.",
      description:
        "Collection of 120 Notion templates you can duplicate in one click: project tracking, personal budget, editorial calendar, mini-CRM and note taking. Compatible with free and paid Notion. Duplication link provided by the seller after purchase.",
      features: [
        { label: "Contents", value: "120 templates" },
        { label: "Compatibility", value: "Free & paid Notion" },
        { label: "Delivery", value: "Instant duplication" },
      ],
      priceNote: null,
    },
  },
  "formation-marketing-digital-avance": {
    fr: {
      title: "Formation Marketing Digital Avancé",
      short: "24 h de vidéo, projets pratiques et certificat de fin.",
      description:
        "Programme en ligne de 24 heures : stratégie de contenu, publicité payante, SEO et analyse de données. Comprend 8 études de cas, des modèles de campagnes et un accès à une communauté d'apprenants. Accès au programme et paiement traités par le vendeur.",
      features: [
        { label: "Durée", value: "24 h de vidéo" },
        { label: "Accès", value: "12 mois" },
        { label: "Certificat", value: "Oui" },
      ],
      priceNote: null,
    },
    en: {
      title: "Advanced Digital Marketing Course",
      short: "24 h of video, hands-on projects and a completion certificate.",
      description:
        "24-hour online programme: content strategy, paid advertising, SEO and data analysis. Includes 8 case studies, campaign templates and access to a learner community. Programme access and payment are handled by the seller.",
      features: [
        { label: "Duration", value: "24 h of video" },
        { label: "Access", value: "12 months" },
        { label: "Certificate", value: "Yes" },
      ],
      priceNote: null,
    },
  },
  "cours-excel-professionnels": {
    fr: {
      title: "Cours Excel pour Professionnels",
      short: "Maîtrisez TCD, Power Query et automatisation en 15 h.",
      description:
        "Formation ciblée sur les usages professionnels d'Excel : tableaux croisés dynamiques, Power Query, formules avancées et automatisation de rapports. Exercices corrigés et fichiers de pratique inclus.",
      features: [
        { label: "Durée", value: "15 h" },
        { label: "Niveau", value: "Intermédiaire à avancé" },
        { label: "Fichiers", value: "Exercices inclus" },
      ],
      priceNote: null,
    },
    en: {
      title: "Excel Course for Professionals",
      short: "Master pivot tables, Power Query and automation in 15 h.",
      description:
        "Training focused on professional uses of Excel: pivot tables, Power Query, advanced formulas and report automation. Corrected exercises and practice files included.",
      features: [
        { label: "Duration", value: "15 h" },
        { label: "Level", value: "Intermediate to advanced" },
        { label: "Files", value: "Exercises included" },
      ],
      priceNote: null,
    },
  },
  "saas-gestion-de-projet": {
    fr: {
      title: "Logiciel SaaS de gestion de projet",
      short: "Tableaux Kanban, suivi du temps et rapports — jusqu'à 10 utilisateurs.",
      description:
        "Abonnement mensuel à un outil de gestion de projet : tableaux Kanban, diagrammes de charge, suivi du temps et rapports exportables. Essai de 14 jours disponible via le vendeur. Prix affiché par utilisateur et par mois.",
      features: [
        { label: "Essai", value: "14 jours" },
        { label: "Utilisateurs", value: "Jusqu'à 10 inclus" },
        { label: "Support", value: "E-mail 24/7" },
      ],
      priceNote: "par mois / utilisateur",
    },
    en: {
      title: "SaaS Project Management Software",
      short: "Kanban boards, time tracking and reports — up to 10 users.",
      description:
        "Monthly subscription to a project management tool: Kanban boards, workload charts, time tracking and exportable reports. 14-day trial available via the seller. Price shown per user per month.",
      features: [
        { label: "Trial", value: "14 days" },
        { label: "Users", value: "Up to 10 included" },
        { label: "Support", value: "Email 24/7" },
      ],
      priceNote: "per month / user",
    },
  },
  "service-vpn-premium": {
    fr: {
      title: "Service VPN Premium",
      short: "Chiffrement AES-256, 60 pays, 5 appareils simultanés.",
      description:
        "Abonnement VPN avec chiffrement AES-256, serveurs dans 60 pays, politique zéro journal auditée et 5 connexions simultanées. Applications Windows, macOS, iOS et Android. La souscription s'effectue sur le site du vendeur.",
      features: [
        { label: "Serveurs", value: "60 pays" },
        { label: "Appareils", value: "5 simultanés" },
        { label: "Journaux", value: "Politique zéro journal" },
      ],
      priceNote: "par mois",
    },
    en: {
      title: "Premium VPN Service",
      short: "AES-256 encryption, 60 countries, 5 simultaneous devices.",
      description:
        "VPN subscription with AES-256 encryption, servers in 60 countries, an audited no-logs policy and 5 simultaneous connections. Windows, macOS, iOS and Android apps. Subscription takes place on the seller's website.",
      features: [
        { label: "Servers", value: "60 countries" },
        { label: "Devices", value: "5 simultaneous" },
        { label: "Logs", value: "No-logs policy" },
      ],
      priceNote: "per month",
    },
  },
  "lampe-bureau-design-led": {
    fr: {
      title: "Lampe de bureau design LED",
      short: "Éclairage réglable 2700–6000 K, bras articulé, USB-C.",
      description:
        "Lampe de bureau LED avec température de couleur réglable de 2700 K à 6000 K, luminosité par paliers, bras articulé en aluminium et alimentation USB-C. Garantie fabricant de 2 ans selon les conditions du vendeur.",
      features: [
        { label: "Matériau", value: "Aluminium" },
        { label: "Alimentation", value: "USB-C" },
        { label: "Garantie", value: "2 ans" },
      ],
      priceNote: null,
    },
    en: {
      title: "Design LED Desk Lamp",
      short: "Adjustable 2700–6000 K lighting, articulated arm, USB-C.",
      description:
        "LED desk lamp with colour temperature adjustable from 2700 K to 6000 K, stepped brightness, articulated aluminium arm and USB-C power. 2-year manufacturer warranty under the seller's conditions.",
      features: [
        { label: "Material", value: "Aluminium" },
        { label: "Power", value: "USB-C" },
        { label: "Warranty", value: "2 years" },
      ],
      priceNote: null,
    },
  },
  "organiseur-modulaire-cuisine": {
    fr: {
      title: "Organiseur modulaire de cuisine",
      short: "8 contenants hermétiques empilables, sans BPA.",
      description:
        "Système d'organisation de placard avec 8 contenants hermétiques empilables, étiquettes incluses et matériaux sans BPA. Compatible lave-vaisselle pour les corps de contenants.",
      features: [
        { label: "Contenu", value: "8 contenants" },
        { label: "Empilable", value: "Oui" },
        { label: "Entretien", value: "Lave-vaisselle (corps)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Modular Kitchen Organiser",
      short: "8 stackable airtight containers, BPA-free.",
      description:
        "Cupboard organisation system with 8 stackable airtight containers, labels included and BPA-free materials. Dishwasher-safe for container bodies.",
      features: [
        { label: "Contents", value: "8 containers" },
        { label: "Stackable", value: "Yes" },
        { label: "Care", value: "Dishwasher (body)" },
      ],
      priceNote: null,
    },
  },
  "ecouteurs-sans-fil-pro": {
    fr: {
      title: "Écouteurs sans fil Pro",
      short: "Réduction de bruit active, 30 h d'autonomie avec boîtier.",
      description:
        "Écouteurs true wireless avec réduction de bruit active, Bluetooth 5.3, autonomie de 8 h (30 h avec le boîtier) et certification IPX5. Deux coloris disponibles selon le stock du vendeur.",
      features: [
        { label: "Bluetooth", value: "5.3" },
        { label: "Autonomie", value: "8 h / 30 h avec boîtier" },
        { label: "Résistance", value: "IPX5" },
      ],
      priceNote: null,
    },
    en: {
      title: "Pro Wireless Earbuds",
      short: "Active noise cancelling, 30 h battery life with case.",
      description:
        "True wireless earbuds with active noise cancelling, Bluetooth 5.3, 8 h battery life (30 h with the case) and IPX5 certification. Two colours available depending on seller stock.",
      features: [
        { label: "Bluetooth", value: "5.3" },
        { label: "Battery life", value: "8 h / 30 h with case" },
        { label: "Water resistance", value: "IPX5" },
      ],
      priceNote: null,
    },
  },
  "clavier-mecanique-compact-75": {
    fr: {
      title: "Clavier mécanique compact 75 %",
      short: "Switches interchangeables, rétroéclairage RVB, sans fil.",
      description:
        "Clavier mécanique au format 75 % avec switches interchangeables à chaud, rétroéclairage RVB par touche, double mode sans fil (2,4 GHz / Bluetooth) et câble USB-C détachable.",
      features: [
        { label: "Format", value: "75 %" },
        { label: "Switches", value: "Hot-swap" },
        { label: "Connexion", value: "2,4 GHz / BT / USB-C" },
      ],
      priceNote: null,
    },
    en: {
      title: "Compact 75% Mechanical Keyboard",
      short: "Hot-swappable switches, RGB backlight, wireless.",
      description:
        "75%-format mechanical keyboard with hot-swappable switches, per-key RGB backlighting, dual wireless mode (2.4 GHz / Bluetooth) and a detachable USB-C cable.",
      features: [
        { label: "Layout", value: "75%" },
        { label: "Switches", value: "Hot-swap" },
        { label: "Connection", value: "2.4 GHz / BT / USB-C" },
      ],
      priceNote: null,
    },
  },
  "appartement-t3-lyon-6e": {
    fr: {
      title: "Appartement T3 rénové — Lyon 6e",
      short: "68 m², 2 chambres, balcon, proche metro — annonce du vendeur.",
      description:
        "Appartement de type 3 de 68 m² entièrement rénové : séjour lumineux, deux chambres, cuisine équipée, balcon et cave. Immeuble de standing de 1930 avec ascenseur. Les fourchettes de prix sont indicatives ; toute visite s'organise avec le vendeur après demande de renseignements.",
      features: [
        { label: "Surface", value: "68 m²" },
        { label: "Pièces", value: "T3, 2 chambres" },
        { label: "Extérieur", value: "Balcon" },
      ],
      priceNote: null,
    },
    en: {
      title: "Renovated 3-room apartment — Lyon 6th",
      short: "68 m², 2 bedrooms, balcony, close to the metro — seller listing.",
      description:
        "Fully renovated 3-room apartment of 68 m²: bright living room, two bedrooms, fitted kitchen, balcony and cellar. Prestigious 1930 building with a lift. Price ranges are indicative; any visit is arranged with the seller after an enquiry.",
      features: [
        { label: "Area", value: "68 m²" },
        { label: "Rooms", value: "3-room, 2 bedrooms" },
        { label: "Outdoor", value: "Balcony" },
      ],
      priceNote: null,
    },
  },
  "villa-contemporaine-marrakech": {
    fr: {
      title: "Villa contemporaine avec piscine — Marrakech",
      short: "240 m² habitables, 4 chambres, jardin paysager.",
      description:
        "Villa contemporaine de 240 m² sur un terrain de 800 m² : quatre chambres avec salles d'eau, séjour double hauteur, piscine chauffée et jardin paysager. Fourchette de prix indicative ; le dossier complet est transmis par le vendeur après demande.",
      features: [
        { label: "Surface", value: "240 m²" },
        { label: "Terrain", value: "800 m²" },
        { label: "Piscine", value: "Chauffée" },
      ],
      priceNote: null,
    },
    en: {
      title: "Contemporary villa with pool — Marrakech",
      short: "240 m² of living space, 4 bedrooms, landscaped garden.",
      description:
        "Contemporary villa of 240 m² on an 800 m² plot: four bedrooms with en-suite shower rooms, a double-height living room, heated pool and landscaped garden. Indicative price range; the full file is sent by the seller after an enquiry.",
      features: [
        { label: "Area", value: "240 m²" },
        { label: "Plot", value: "800 m²" },
        { label: "Pool", value: "Heated" },
      ],
      priceNote: null,
    },
  },
  "citadine-electrique-annonce": {
    fr: {
      title: "Citadine électrique 100 % électrique",
      short: "Autonomie 320 km WLTP, recharge rapide DC.",
      description:
        "Citadine électrique d'occasion récente avec autonomie WLTP de 320 km, charge rapide DC jusqu'à 100 kW, historique d'entretien complet et garantie constructeur restante. Le prix final dépend des options et de la disponibilité du véhicule chez le vendeur.",
      features: [
        { label: "Autonomie", value: "320 km WLTP" },
        { label: "Recharge", value: "DC 100 kW" },
        { label: "Historique", value: "Entretien complet" },
      ],
      priceNote: null,
    },
    en: {
      title: "100% Electric City Car",
      short: "320 km WLTP range, DC fast charging.",
      description:
        "Recent used electric city car with a WLTP range of 320 km, DC fast charging up to 100 kW, a full service history and remaining manufacturer warranty. The final price depends on the vehicle's options and availability at the seller.",
      features: [
        { label: "Range", value: "320 km WLTP" },
        { label: "Charging", value: "DC 100 kW" },
        { label: "History", value: "Full service record" },
      ],
      priceNote: null,
    },
  },
  "scooter-electrique-125-equivalent": {
    fr: {
      title: "Scooter électrique 125 équivalent",
      short: "90 km d'autonomie, batterie amovible, freins ABS.",
      description:
        "Scooter électrique équivalent 125 cm³ : batterie amovible de 3,4 kWh, autonomie annoncée de 90 km en cycle urbain, freins ABS et connectivité mobile. Immatriculation et livraison à organiser avec le vendeur.",
      features: [
        { label: "Autonomie", value: "90 km urbain" },
        { label: "Batterie", value: "3,4 kWh amovible" },
        { label: "Sécurité", value: "ABS" },
      ],
      priceNote: null,
    },
    en: {
      title: "Electric Scooter, 125cc-equivalent",
      short: "90 km range, removable battery, ABS brakes.",
      description:
        "125cc-equivalent electric scooter: 3.4 kWh removable battery, stated range of 90 km in urban cycle, ABS brakes and mobile connectivity. Registration and delivery to be arranged with the seller.",
      features: [
        { label: "Range", value: "90 km urban" },
        { label: "Battery", value: "3.4 kWh removable" },
        { label: "Safety", value: "ABS" },
      ],
      priceNote: null,
    },
  },
};

/* ───────────────────────── Helpers de localisation ───────────────────────── */

/**
 * Produits RÉELS créés par le propriétaire via l'admin (état figé à la Task 44).
 * Mêmes règles que le seed : la traduction EN n'est affichée que si le texte FR est
 * strictement identique à cette version d'origine — dès que le propriétaire modifie
 * un champ dans l'admin, SA version s'affiche telle quelle, quelle que soit la langue
 * (honest data). Les textes FR ci-dessous sont la copie exacte de la base à Task 44.
 */
const OWNER_PRODUCTS: Record<string, { fr: SeedProductTexts; en: SeedProductTexts }> = {
  notion: {
    fr: {
      title: "Notion — plans payants",
      short: "Espace de travail tout-en-un : notes, documents, bases de données et wikis partagés.",
      description:
        "Notion centralise notes, documents, bases de données et wikis dans un espace de travail collaboratif. L'offre gratuite couvre l'usage individuel de base ; les plans payants (Plus, Business, Enterprise) ajoutent membres illimités, historique étendu et administration avancée. Facturation mensuelle ou annuelle, tarif par membre. Lien ci-dessous vers la page tarifaire officielle.",
      features: [
        { label: "Type", value: "Abonnement SaaS" },
        { label: "Essai gratuit", value: "Oui — plan gratuit disponible" },
        { label: "Langues", value: "Français, anglais, autres" },
        { label: "Programme partenaire", value: "PartnerStack (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Notion — paid plans",
      short: "All-in-one workspace: notes, documents, databases and shared wikis.",
      description:
        "Notion brings notes, documents, databases and wikis together in a collaborative workspace. The free plan covers basic individual use; paid plans (Plus, Business, Enterprise) add unlimited members, extended history and advanced administration. Monthly or yearly billing, priced per member. Link below to the official pricing page.",
      features: [
        { label: "Type", value: "SaaS subscription" },
        { label: "Free trial", value: "Yes — free plan available" },
        { label: "Languages", value: "French, English, more" },
        { label: "Partner program", value: "PartnerStack (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  "grammarly-premium": {
    fr: {
      title: "Grammarly Premium",
      short: "Assistant de rédaction en anglais : grammaire, clarté, ton et détection de plagiat.",
      description:
        "Grammarly corrige grammaire, orthographe et ponctuation en anglais, propose des reformulations de clarté et adapte le ton (formel, amical…). La version Premium ajoute les suggestions avancées de vocabulaire, l'ajustement de ton complet et la détection de plagiat. Extension navigateur, applications et intégrations bureautiques. Page officielle des plans ci-dessous.",
      features: [
        { label: "Type", value: "Abonnement SaaS" },
        { label: "Essai gratuit", value: "Oui — version gratuite disponible" },
        { label: "Langue", value: "Anglais" },
        { label: "Programme partenaire", value: "PartnerStack (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Grammarly Premium",
      short: "English writing assistant: grammar, clarity, tone and plagiarism detection.",
      description:
        "Grammarly fixes English grammar, spelling and punctuation, suggests clarity rewrites and adapts tone (formal, friendly…). The Premium version adds advanced vocabulary suggestions, full tone adjustment and plagiarism detection. Browser extension, apps and office integrations. Official plans page below.",
      features: [
        { label: "Type", value: "SaaS subscription" },
        { label: "Free trial", value: "Yes — free version available" },
        { label: "Language", value: "English" },
        { label: "Partner program", value: "PartnerStack (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  framer: {
    fr: {
      title: "Framer — création de sites web",
      short: "Création de sites web professionnels sans code, avec hébergement et CMS inclus.",
      description:
        "Framer permet de concevoir et publier des sites web responsive sans écrire de code : éditeur visuel, CMS intégré, animations et hébergement inclus. Plan gratuit pour découvrir, plans payants par site selon trafic et fonctionnalités. Page tarifaire officielle ci-dessous.",
      features: [
        { label: "Type", value: "Abonnement SaaS" },
        { label: "Essai gratuit", value: "Oui — plan gratuit disponible" },
        { label: "Usage", value: "Sites vitrines, portfolios, landing pages" },
        { label: "Programme partenaire", value: "PartnerStack (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Framer — website creation",
      short: "Professional no-code website creation, with hosting and CMS included.",
      description:
        "Framer lets you design and publish responsive websites without writing code: visual editor, built-in CMS, animations and hosting included. Free plan to explore, paid plans per site based on traffic and features. Official pricing page below.",
      features: [
        { label: "Type", value: "SaaS subscription" },
        { label: "Free trial", value: "Yes — free plan available" },
        { label: "Usage", value: "Brochure sites, portfolios, landing pages" },
        { label: "Partner program", value: "PartnerStack (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  shopify: {
    fr: {
      title: "Shopify — boutique en ligne",
      short: "Plateforme e-commerce complète : catalogue, paiements, expédition et canaux de vente.",
      description:
        "Shopify permet de créer et gérer une boutique en ligne : catalogue produits, paiement sécurisé, expédition, marketing multicanal (réseaux sociaux, marketplaces). Interface en français, assistance 24/7. Essai d'ouverture de boutique disponible avant abonnement mensuel. Site officiel français ci-dessous.",
      features: [
        { label: "Type", value: "Abonnement SaaS" },
        { label: "Essai gratuit", value: "Disponible selon éligibilité" },
        { label: "Usage", value: "Vente en ligne B2C/D2C" },
        { label: "Programme partenaire", value: "Impact (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Shopify — online store",
      short: "Complete e-commerce platform: catalog, payments, shipping and sales channels.",
      description:
        "Shopify lets you create and run an online store: product catalog, secure payment, shipping, multichannel marketing (social media, marketplaces). French interface, 24/7 support. Store-opening trial available before the monthly subscription. Official French website below.",
      features: [
        { label: "Type", value: "SaaS subscription" },
        { label: "Free trial", value: "Available depending on eligibility" },
        { label: "Usage", value: "B2C/D2C online selling" },
        { label: "Partner program", value: "Impact (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  "kindle-unlimited": {
    fr: {
      title: "Kindle Unlimited",
      short: "Lecture numérique illimitée Amazon : livres, magazines et audiobooks inclus.",
      description:
        "Kindle Unlimited donne accès à un catalogue de lecture illimitée sur l'écosystème Kindle et l'application de lecture gratuite : romans, essais, magazines et audiobooks sélectionnés. Abonnement mensuel, résiliable à tout moment ; période d'essai selon éligibilité. Page d'abonnement officielle Amazon France ci-dessous.",
      features: [
        { label: "Type", value: "Abonnement lecture" },
        { label: "Essai gratuit", value: "Selon éligibilité du compte Amazon" },
        { label: "Supports", value: "Kindle, app iOS/Android, navigateur" },
        { label: "Programme partenaire", value: "Amazon Associates (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Kindle Unlimited",
      short: "Unlimited digital reading from Amazon: books, magazines and audiobooks included.",
      description:
        "Kindle Unlimited gives access to an unlimited reading catalog on the Kindle ecosystem and the free reading app: novels, non-fiction, magazines and selected audiobooks. Monthly subscription, cancellable at any time; trial period depending on eligibility. Official Amazon France subscription page below.",
      features: [
        { label: "Type", value: "Reading subscription" },
        { label: "Free trial", value: "Depending on Amazon account eligibility" },
        { label: "Devices", value: "Kindle, iOS/Android app, browser" },
        { label: "Partner program", value: "Amazon Associates (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  "teds-woodworking": {
    fr: {
      title: "Ted's Woodworking — 16 000 plans de menuiserie",
      short: "Bibliothèque numérique de 16 000 plans de menuiserie avec instructions pas-à-pas.",
      description:
        "Ted's Woodworking est une bibliothèque numérique de 16 000 plans de menuiserie : meubles, établis, extérieurs et projets décoratifs. Chaque plan inclut instructions étape par étape, listes de matériaux, schémas de coupe et vues 3D pour la majorité des projets. Téléchargement numérique après achat unique. Page officielle du vendeur ci-dessous.",
      features: [
        { label: "Type", value: "Produit numérique (achat unique)" },
        { label: "Contenu", value: "16 000 plans + instructions + listes de matériaux" },
        { label: "Niveau", value: "Débutant à avancé" },
        { label: "Programme partenaire", value: "ClickBank (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Ted's Woodworking — 16,000 woodworking plans",
      short: "Digital library of 16,000 woodworking plans with step-by-step instructions.",
      description:
        "Ted's Woodworking is a digital library of 16,000 woodworking plans: furniture, workbenches, outdoor projects and decorative builds. Each plan includes step-by-step instructions, material lists, cutting diagrams and 3D views for most projects. Digital download after a one-time purchase. Official seller page below.",
      features: [
        { label: "Type", value: "Digital product (one-time purchase)" },
        { label: "Contents", value: "16,000 plans + instructions + material lists" },
        { label: "Level", value: "Beginner to advanced" },
        { label: "Partner program", value: "ClickBank (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  "wood-profits": {
    fr: {
      title: "Wood Profits — lancer son activité de menuiserie",
      short: "Guide numérique pour démarrer une activité de menuiserie à domicile, e-book et audio.",
      description:
        "Wood Profits est un guide numérique (e-book + version audio) sur le démarrage d'une activité de menuiserie à domicile : choix des produits à fabriquer, tarification, outils de base, canaux de vente et promotion locale en ligne. Contenu en anglais. Page officielle du vendeur ci-dessous.",
      features: [
        { label: "Type", value: "Produit numérique (achat unique)" },
        { label: "Contenu", value: "E-book + guide audio" },
        { label: "Langue du contenu", value: "Anglais" },
        { label: "Programme partenaire", value: "ClickBank (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "Wood Profits — start your woodworking business",
      short: "Digital guide to starting a home woodworking business, e-book and audio.",
      description:
        "Wood Profits is a digital guide (e-book + audio version) about starting a home woodworking business: choosing products to make, pricing, basic tools, sales channels and local online promotion. Content in English. Official seller page below.",
      features: [
        { label: "Type", value: "Digital product (one-time purchase)" },
        { label: "Contents", value: "E-book + audio guide" },
        { label: "Content language", value: "English" },
        { label: "Partner program", value: "ClickBank (activation in progress)" },
      ],
      priceNote: null,
    },
  },
  myshedplans: {
    fr: {
      title: "MyShedPlans — 12 000 plans de construction",
      short: "Bibliothèque numérique de plus de 12 000 plans : abris de jardin, cabanons et aménagements.",
      description:
        "MyShedPlans est une collection numérique de plus de 12 000 plans de construction : abris de jardin, cabanons, garages et aménagements extérieurs. Plans avec schémas détaillés, listes de coupes et de matériaux, progressant du projet simple aux constructions plus vastes. Contenu en anglais, téléchargement après achat unique. Page officielle du vendeur ci-dessous.",
      features: [
        { label: "Type", value: "Produit numérique (achat unique)" },
        { label: "Contenu", value: "12 000+ plans avec schémas et listes de matériaux" },
        { label: "Langue du contenu", value: "Anglais" },
        { label: "Programme partenaire", value: "ClickBank (activation en cours)" },
      ],
      priceNote: null,
    },
    en: {
      title: "MyShedPlans — 12,000 building plans",
      short: "Digital library of 12,000+ plans: garden sheds, barns and outdoor builds.",
      description:
        "MyShedPlans is a digital collection of 12,000+ construction plans: garden sheds, barns, garages and outdoor setups. Plans with detailed diagrams, cutting and material lists, progressing from simple projects to larger builds. Content in English, download after a one-time purchase. Official seller page below.",
      features: [
        { label: "Type", value: "Digital product (one-time purchase)" },
        { label: "Contents", value: "12,000+ plans with diagrams and material lists" },
        { label: "Content language", value: "English" },
        { label: "Partner program", value: "ClickBank (activation in progress)" },
      ],
      priceNote: null,
    },
  },
};

/** Champs produit localisables (fiche + carte). */
export interface LocalizableProductFields {
  slug: string;
  title: string;
  shortDescription: string | null;
  description?: string;
  features?: { label: string; value: string }[];
  priceNote: string | null;
}

export interface LocalizedProductTexts {
  title: string;
  shortDescription: string | null;
  description: string;
  features: { label: string; value: string }[];
  priceNote: string | null;
}

/**
 * Localise les textes d'un produit seed en mode EN : chaque champ n'est traduit QUE
 * s'il est encore strictement identique au texte FR d'origine du seed (sinon il a été
 * personnalisé par l'admin et s'affiche tel quel, quelle que soit la langue — honest data).
 */
export function localizeProductFields(p: LocalizableProductFields, lang: UiLang): LocalizedProductTexts {
  const raw: LocalizedProductTexts = {
    title: p.title,
    shortDescription: p.shortDescription,
    description: p.description ?? "",
    features: p.features ?? [],
    priceNote: p.priceNote,
  };
  if (lang !== "en") return raw;
  const pair = SEED_PRODUCTS[p.slug] ?? OWNER_PRODUCTS[p.slug];
  if (!pair) return raw;
  const { fr, en } = pair;
  return {
    title: p.title === fr.title ? en.title : p.title,
    shortDescription:
      (p.shortDescription ?? null) === fr.short ? en.short : p.shortDescription,
    description: p.description != null && p.description === fr.description ? en.description : (p.description ?? ""),
    features:
      p.features && JSON.stringify(p.features) === JSON.stringify(fr.features) ? en.features : (p.features ?? []),
    priceNote: (p.priceNote ?? null) === fr.priceNote ? en.priceNote : p.priceNote,
  };
}
