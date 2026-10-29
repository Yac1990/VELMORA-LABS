"use client";

/**
 * Task 37-c — internationalisation FR/EN de la boutique publique.
 *
 * Source de vérité de la langue : useLang() (zustand persist « velmora-lang »).
 * Hydratation : `useI18n()` renvoie TOUJOURS « fr » pendant le rendu serveur ET la
 * première passe client (via useLang → useSyncExternalStore), puis la langue
 * persistée APRÈS le montage. Aucune lecture de localStorage pendant le rendu,
 * aucun branchement sur typeof window → aucun écart SSR/client possible.
 *
 * Clés : plates, namespacées par préfixe descriptif (nav.*, header.*, home.*,
 * catalog.*, product.*, inquiry.*, form.*, contact.*, faq.*, legal.*, boot.*,
 * common.*, lang.*). Les valeurs sont soit une chaîne (avec jetons {nom}
 * interpolés), soit une fonction (vars) => string pour les pluriels complexes.
 *
 * Les DONNÉES (titres/descriptions produits, noms de catégories, messages du
 * serveur, paramètres admin) restent telles qu'enregistrées en base — principe
 * « honest data » : seule l'interface est traduite.
 */
import { useCallback } from "react";
import { useLang, type Lang } from "@/store/lang";

export type I18nVars = Record<string, string | number>;

export type DictEntry = string | ((vars: I18nVars) => string);

/** Dictionnaire plat : clé → chaîne (avec jetons {var}) ou fonction de mise en forme. */
export type Dict = { [key: string]: DictEntry };

/** Élargit les types de valeurs (les littéraux restent utiles aux clés) sans toucher aux clés. */
type Widen<T extends Record<string, DictEntry>> = { [K in keyof T]: DictEntry };

/* ─────────────────────────────── Français (source) ─────────────────────────────── */

const FR = {
  /* Générique */
  "common.retry": "Réessayer",
  "common.demoBadge": "Démo",
  "common.privacyLink": "politique de confidentialité",

  /* Sélecteur de langue (libellés bilingues assumés) */
  "lang.aria": "Choisir la langue / Choose language",
  "lang.label": "Langue / Language",
  "lang.fr": "Français",
  "lang.en": "English",

  /* Navigation */
  "nav.home": "Accueil",
  "nav.catalogue": "Catalogue",
  "nav.faq": "FAQ",
  "nav.contact": "Contact",
  "nav.about": "À propos",
  "nav.mainAria": "Navigation principale",
  "nav.mobileAria": "Navigation mobile",

  /* En-tête */
  "header.openMenuAria": "Ouvrir le menu de la boutique",
  "header.brandHomeAria": "{brand} — retour à l'accueil",
  "header.logoAlt": "Logo {brand}",
  "header.searchPlaceholder": "Rechercher un produit…",
  "header.searchPlaceholderShort": "Rechercher…",
  "header.searchAria": "Rechercher un produit",
  "header.searchSubmitAria": "Lancer la recherche",
  "header.categories": "Catégories",
  "header.categoriesAria": "Explorer par catégorie",
  "header.categoriesEmpty": "Aucune catégorie disponible pour le moment.",
  "header.categoriesEmptyShort": "Aucune catégorie disponible.",
  "header.categoryItemAria": (vars) => {
    const n = Number(vars.count);
    return `Voir la catégorie ${vars.name} — ${n} produit${n > 1 ? "s" : ""}`;
  },
  "header.adminAria": "Ouvrir l'espace administrateur (back-office)",
  "header.adminTitle": "Espace administrateur",
  "header.adminButton": "Espace administrateur",

  /* Pied de page */
  "footer.disclosureFallback":
    "VELMORA LABS regroupe des produits de plusieurs vendeurs. Lorsque vous cliquez sur « Voir l'offre », vous êtes redirigé vers le site du vendeur, où l'achat s'effectue. L'achat ne se fait jamais sur VELMORA LABS.",
  "footer.shopTitle": "Boutique",
  "footer.shopAria": "Liens de la boutique",
  "footer.legalTitle": "Informations légales",
  "footer.legalAria": "Informations légales",
  "footer.linkPrivacy": "Politique de confidentialité",
  "footer.linkTerms": "Conditions d'utilisation",
  "footer.linkDisclosure": "Fonctionnement de la plateforme",
  "footer.linkCookies": "Politique cookies",
  "footer.copyright": "© {year} {brand}. Tous droits réservés.",
  "footer.priceNotice":
    "Prix indicatifs fournis par les vendeurs — vérifiez toujours le prix final sur leur site.",

  /* Démarrage de la boutique */
  "boot.loadingAria": "Chargement de la boutique",
  "boot.errorTitle": "Impossible de charger la boutique",
  "boot.errorBody":
    "Les paramètres du site n'ont pas pu être récupérés. Vérifiez votre connexion, puis réessayez.",

  /* Accueil */
  "home.badge": "Plateforme multi-produits",
  "home.titleFallback": "Découvrez plus. Choisissez mieux.",
  "home.subtitle":
    "Découvrez et comparez des produits issus de plusieurs vendeurs dans {count} univers. En un clic, rejoignez le site du vendeur pour finaliser votre achat.",
  "home.searchPlaceholder": "E-book, formation, abonnement, appartement…",
  "home.searchButton": "Rechercher",
  "home.heroImageAlt": "Illustration de la boutique VELMORA — sélection multi-catégories de produits",
  "home.heroFallbackTagline": "Une sélection multi-univers, actualisée en continu",
  "home.categoriesTitle": "Parcourir par",
  "home.categoriesAccent": "catégorie",
  "home.categoriesSubtitle": "Sept univers, un seul comparateur.",
  "home.allCatalog": "Tout le catalogue",
  "home.categoryAria": (vars) => {
    const n = Number(vars.count);
    return `Voir les produits de la catégorie ${vars.name} (${n} produit${n > 1 ? "s" : ""})`;
  },
  "home.productCount": (vars) => {
    const n = Number(vars.count);
    return `${n} produit${n > 1 ? "s" : ""}`;
  },
  "home.newTitle": "Nouveautés",
  "home.newSubtitle": "Les derniers ajouts au catalogue.",
  "home.popularTitle": "Les plus consultés",
  "home.popularSubtitleMeasured":
    "Classement établi à partir des clics sortants enregistrés vers les offres (30 derniers jours) — ni des ventes ni des avis.",
  "home.popularSubtitleDefault": "Une sélection régulièrement consultée par les visiteurs de la boutique.",
  "home.viewAll": "Tout voir",
  "home.rowError":
    "Impossible de charger cette sélection pour le moment — le reste de la boutique reste accessible.",
  "home.rowLoadingAria": "Chargement — {title}",
  "home.rowEmpty": "Aucun produit à afficher pour l'instant.",
  "home.howTitle": "Comment ça marche ?",
  "home.disclosureFallback":
    "VELMORA LABS regroupe des produits de plusieurs vendeurs dans sept univers. Lorsque vous cliquez sur « Voir l'offre », vous êtes redirigé vers le site du vendeur, où l'achat s'effectue. La redirection est mesurée de façon strictement anonyme.",
  "home.howLink": "Découvrir le fonctionnement de la plateforme",

  /* Catalogue */
  "catalog.type.digital": "Produits numériques",
  "catalog.type.training": "Formations",
  "catalog.type.subscription": "Abonnements & SaaS",
  "catalog.type.home": "Maison",
  "catalog.type.electronics": "Électronique",
  "catalog.type.real_estate": "Immobilier",
  "catalog.type.vehicle": "Véhicules",
  "catalog.type.other": "Autres",
  "catalog.type.fallback": "Produit",
  "catalog.availability.inStock": "En stock (selon le vendeur)",
  "catalog.availability.outOfStock": "Rupture signalée",
  "catalog.availability.unknown": "Disponibilité à vérifier sur le site du vendeur",
  "catalog.popularityAria": (vars) => {
    const n = Number(vars.count);
    const nStr = n.toLocaleString("fr-FR");
    return `Popularité : ${vars.stars} sur 5, mesurée par ${nStr} clic${n > 1 ? "s" : ""} sortant${n > 1 ? "s" : ""} vers les offres sur 30 jours. Ce ne sont ni des notes d'acheteurs ni des ventes.`;
  },
  "catalog.clicks": (vars) => {
    const n = Number(vars.count);
    return `${n.toLocaleString("fr-FR")} clic${n > 1 ? "s" : ""} · 30 j`;
  },
  "catalog.cardAria": "Voir la fiche produit : {title}",
  "catalog.imageAlt": "Illustration — {title}",
  "catalog.offersCount": (vars) => `${Number(vars.count).toLocaleString("fr-FR")} offres disponibles`,
  "catalog.offerComing": "Offre à venir",
  "catalog.descFallback":
    "Parcourez les produits et offres de notre sélection multi-catégories. L'achat s'effectue sur le site du vendeur, en un clic.",
  "catalog.filtersAria": "Filtres du catalogue",
  "catalog.searchInputAria": "Rechercher dans le catalogue",
  "catalog.categoryAria": "Filtrer par catégorie",
  "catalog.categoryPlaceholder": "Catégorie",
  "catalog.allCategories": "Toutes les catégories",
  "catalog.typeAria": "Filtrer par type de produit",
  "catalog.typePlaceholder": "Type",
  "catalog.allTypes": "Tous les types",
  "catalog.sortAria": "Trier les résultats",
  "catalog.sortPlaceholder": "Tri",
  "catalog.sort.recent": "Plus récents",
  "catalog.sort.priceAsc": "Prix croissant",
  "catalog.sort.priceDesc": "Prix décroissant",
  "catalog.countLine": (vars) => {
    const n = Number(vars.count);
    const q = String(vars.q ?? "");
    return `${n.toLocaleString("fr-FR")} produit${n > 1 ? "s" : ""} trouvé${n > 1 ? "s" : ""}${q ? ` pour « ${q} »` : ""}`;
  },
  "catalog.starsNote":
    "★ = intérêt des visiteurs mesuré par les clics sortants vers les offres (30 derniers jours) — ni des avis d'acheteurs ni des ventes.",
  "catalog.loadingAria": "Chargement des produits",
  "catalog.errorTitle": "Le catalogue n'a pas pu être chargé",
  "catalog.errorFallback": "Erreur de chargement du catalogue",
  "catalog.emptyTitle": "Aucun produit ne correspond à votre recherche",
  "catalog.emptyBody": "Essayez d'élargir vos filtres ou de réinitialiser la recherche.",
  "catalog.resetFilters": "Réinitialiser les filtres",
  "catalog.paginationAria": "Pagination du catalogue",
  "catalog.prev": "Précédent",
  "catalog.next": "Suivant",
  "catalog.pageAria": "Aller à la page {n}",
  "catalog.pageInfo": "Page {page} sur {pages} — devise de référence : {currency}",

  /* Fiche produit */
  "product.loadingAria": "Chargement de la fiche produit",
  "product.errorFallback": "Erreur de chargement du produit",
  "product.notFoundTitle": "Produit introuvable",
  "product.notFoundBody":
    "Ce produit n'existe plus ou n'est pas publié. Il a peut-être été retiré du catalogue.",
  "product.errorTitle": "Erreur de chargement",
  "product.errorBodyFallback": "Réessayez dans un instant.",
  "product.backToCatalog": "Retour au catalogue",
  "product.thumbsAria": "Vignettes du produit",
  "product.thumbAria": "Afficher l'image {index} sur {total}",
  "product.thumbAlt": "Miniature {index} — {title}",
  "product.interestNote":
    "Intérêt des visiteurs — mesuré par les clics sortants, pas une note d'acheteurs.",
  "product.rangeNote":
    "Fourchette indicative — le prix final est celui affiché sur le site du vendeur.",
  "product.descriptionTitle": "Description",
  "product.featuresTitle": "Caractéristiques",
  "product.updated": "Mis à jour le {date}",
  "product.language": "Langue : {lang}",
  "product.offersTitle": "Offres disponibles ({count})",
  "product.offersNote":
    "L'achat, le paiement et le service après-vente s'effectuent sur le site du vendeur.",
  "product.noOffers": "Aucune offre active pour ce produit actuellement — revenez bientôt.",
  "product.offerPrice": "Prix sur le site du vendeur : {price}",
  "product.lastSync": "Dernière synchronisation : {date}",
  "product.linkChecking": " — lien en cours de vérification",
  "product.offerTerms": "Conditions de l'offre",
  "product.viewOn": "Voir sur {partner}",
  "product.redirectNote": "Vous serez redirigé vers le site du vendeur pour finaliser votre achat.",

  /* Demande de renseignements (fiche produit) */
  "inquiry.title": "Demander des renseignements",
  "inquiry.body":
    "Ce produit est proposé par un vendeur. Envoyez votre demande via VELMORA LABS : après votre consentement explicite, vos coordonnées sont transmises au vendeur, qui vous recontacte directement. Aucun achat ne se fait sur VELMORA LABS.",
  "inquiry.formAria": "Formulaire de demande de renseignements",
  "inquiry.phoneLabel": "Téléphone (facultatif)",
  "inquiry.phonePlaceholder": "+33 6 12 34 56 78",
  "inquiry.messagePlaceholder": "Précisez votre demande : visite, disponibilité, options…",
  "inquiry.consentA":
    "J'accepte que mes informations (nom, adresse e-mail et téléphone si renseigné) soient transmises au vendeur de « {product} » afin d'être recontacté(e) au sujet de ma demande. Ce consentement est nécessaire pour envoyer le formulaire ; je peux le retirer à tout moment via la page Contact. Consultez notre ",
  "inquiry.consentC": ".",
  "inquiry.errorConsent": "Votre consentement est requis pour transmettre votre demande au vendeur.",
  "inquiry.successFallback":
    "Votre demande a été enregistrée. Le vendeur ou notre équipe vous recontactera.",
  "inquiry.errorSend": "Échec de l'envoi — réessayez dans quelques instants.",
  "inquiry.submit": "Envoyer ma demande",

  /* Libellés de formulaires partagés */
  "form.nameLabel": "Nom complet *",
  "form.namePlaceholder": "Votre nom",
  "form.emailLabel": "E-mail *",
  "form.emailPlaceholder": "vous@exemple.com",
  "form.messageLabel": "Votre message",
  "form.messageLabelRequired": "Votre message *",
  "form.errorName": "Merci d'indiquer votre nom.",
  "form.errorEmail": "Adresse e-mail invalide.",

  /* Contact */
  "contact.title": "Contact",
  "contact.subtitle":
    "Une question sur une offre, un vendeur, vos données ou le fonctionnement du site ? Écrivez-nous.",
  "contact.formAria": "Formulaire de contact",
  "contact.countryLabel": "Pays (facultatif)",
  "contact.countryPlaceholder": "France, Belgique, Maroc, Canada…",
  "contact.messagePlaceholder": "Décrivez votre question ou votre demande (10 caractères minimum).",
  "contact.consentA":
    "J'accepte que mes informations (nom, adresse e-mail, pays si renseigné et message) soient enregistrées afin de traiter et répondre à ma demande. Ce consentement est nécessaire pour envoyer le formulaire ; je peux le retirer à tout moment. Consultez notre ",
  "contact.consentC": ".",
  "contact.errorConsent": "Votre consentement est requis pour traiter votre demande.",
  "contact.errorMinLength": "Merci de détailler votre message (10 caractères minimum).",
  "contact.successFallback":
    "Votre message a bien été enregistré. Notre équipe vous répondra par e-mail.",
  "contact.errorSend": "Échec de l'envoi — réessayez dans quelques minutes.",
  "contact.submit": "Envoyer le message",
  "contact.beforeTitle": "Avant d'écrire",
  "contact.beforeBody":
    "Les réponses aux questions fréquentes (fonctionnement, prix, badges « Démo », devises) se trouvent dans la FAQ. Les demandes concernant un bien immobilier ou un véhicule passent par le formulaire de la fiche produit.",
  "contact.faqButton": "Consulter la FAQ",
  "contact.transparencyTitle": "Transparence des données",
  "contact.transparencyBody":
    "Votre message est enregistré uniquement pour traiter votre demande, conservé au maximum 3 ans, jamais revendu. Détails et droits RGPD dans la politique de confidentialité.",
  "contact.privacyButton": "Lire la politique de confidentialité",

  /* FAQ */
  "faq.title": "Foire aux questions",
  "faq.subtitle":
    "Fonctionnement, prix, transparence, devises : les réponses aux questions que l'on nous pose le plus souvent.",
  "faq.q1": "Comment fonctionne la plateforme VELMORA LABS ?",
  "faq.a1":
    "VELMORA LABS est une plateforme multi-produits : vous parcourez le catalogue, comparez les produits, les prix et les disponibilités, puis vous cliquez sur « Voir l'offre » pour être redirigé vers le site du vendeur. La redirection est mesurée de façon totalement anonyme, et c'est sur le site du vendeur que l'achat se déroule — nous ne vendons rien nous-mêmes.",
  "faq.q2": "Est-ce que j'achète directement sur VELMORA LABS ?",
  "faq.a2":
    "Non, jamais. Le paiement, la facturation, la livraison, la garantie et le service après-vente sont assurés par le vendeur, selon ses propres conditions générales. VELMORA LABS ne vous demande jamais de coordonnées bancaires et ne traite aucune commande.",
  "faq.q3": "La consultation du site est-elle payante ?",
  "faq.a3":
    "Non. Parcourir le catalogue, comparer les prix et consulter les fiches produits est entièrement gratuit, sans compte à créer. Si vous décidez d'acheter, cela se fait directement sur le site du vendeur, selon ses propres conditions et prix.",
  "faq.q4": "Les prix affichés sont-ils fiables ?",
  "faq.a4":
    "Les prix et disponibilités sont synchronisés régulièrement avec les données des vendeurs, et chaque fiche indique la date de dernière mise à jour de chaque offre. Ils restent toutefois indicatifs : les vendeurs peuvent modifier leurs prix à tout moment. Avant d'acheter, vérifiez toujours le prix final affiché sur le site du vendeur — c'est lui qui fait foi.",
  "faq.q5": "Que signifie le badge « Démo » ?",
  "faq.a5":
    "Le badge « Démo » signale un contenu de démonstration : vendeur ou produit fictif, utilisé pour montrer le fonctionnement de la plateforme. Aucune vraie offre ne se cache derrière un élément marqué « Démo », et le bandeau affiché en haut du site vous prévient lorsque le catalogue est en mode démonstration.",
  "faq.q6": "Pourquoi certains biens (immobilier, véhicules) affichent-ils une fourchette de prix ?",
  "faq.a6":
    "Pour les annonces de vendeurs (appartements, maisons, véhicules), le prix dépend de l'état, des options et de la négociation : nous affichons donc une fourchette indicative plutôt qu'un faux prix unique. Pour obtenir le prix réel et les conditions, utilisez le formulaire « Demander des renseignements » de la fiche : après votre consentement, votre demande est transmise au vendeur qui vous recontacte.",
  "faq.q7": "Comment poser une question sur un bien immobilier ou un véhicule ?",
  "faq.a7":
    "Ouvrez la fiche du bien et complétez le formulaire « Demander des renseignements » (nom, e-mail, téléphone facultatif, message). Votre demande part vers le vendeur uniquement si vous cochez la case de consentement — sans elle, rien n'est envoyé. Vous pouvez retirer votre consentement à tout moment via la page Contact.",
  "faq.q8": "Dans quelle devise les prix sont-ils affichés ?",
  "faq.a8":
    "La boutique utilise une devise de référence (l'euro par défaut), identique pour toutes les fiches afin de permettre la comparaison. Le vendeur peut toutefois facturer dans sa propre devise : le montant final facturé, le taux de change appliqué et d'éventuels frais bancaires dépendent du vendeur et de votre moyen de paiement — vérifiez-les sur le site du vendeur avant de valider.",
  "faq.notFound": "Vous ne trouvez pas la réponse à votre question ?",
  "faq.writeUs": "Écrivez-nous : nous lisons tous les messages.",
  "faq.contactButton": "Nous contacter",

  /* Pages légales */
  "legal.updated": "Dernière mise à jour : juillet 2025",

  "legal.privacy.title": "Politique de confidentialité",
  "legal.privacy.intro":
    "VELMORA LABS est une plateforme multi-produits : nous collectons le minimum de données nécessaire pour répondre à vos demandes et mesurer, de façon anonyme, l'usage du site. Nous ne vendons jamais vos données et l'achat s'effectue sur le site du vendeur.",
  "legal.privacy.s1.title": "1. Responsable du traitement",
  "legal.privacy.s1.body":
    "Le responsable du traitement des données collectées sur ce site est VELMORA LABS. Pour toute question relative à vos données, utilisez le formulaire de la page Contact : c'est notre canal officiel de prise de contact, nous répondons dans les meilleurs délais.",
  "legal.privacy.s2.title": "2. Données que nous collectons",
  "legal.privacy.s2.lead1": "Données que vous nous transmettez volontairement :",
  "legal.privacy.s2.b1":
    "Formulaire de contact : nom, adresse e-mail, pays (facultatif) et message.",
  "legal.privacy.s2.b2":
    "Demande de renseignements (immobilier, véhicules) : nom, adresse e-mail, téléphone (facultatif), message et le produit consulté. Ces éléments sont transmis au vendeur concerné uniquement après votre consentement explicite (case à cocher obligatoire).",
  "legal.privacy.s2.lead2": "Données de navigation, strictement anonymisées :",
  "legal.privacy.s2.b3":
    "Clics sortants (redirections) : chaque clic est enregistré avec un identifiant de session haché (empreinte non réversible recalculée chaque jour), le pays approximatif déduit de l'infrastructure réseau, la page de provenance tronquée et l'offre concernée. Aucune donnée personnelle n'est associée.",
  "legal.privacy.s2.b4":
    "Nous n'utilisons ni cookie publicitaire, ni traceur tiers, ni profilage publicitaire. Aucune donnée de paiement n'est jamais collectée : l'achat s'effectue intégralement sur le site du vendeur.",
  "legal.privacy.s2.tail":
    "Le site ne propose pas de compte client : nous ne demandons ni mot de passe, ni pièce d'identité, ni coordonnées bancaires.",
  "legal.privacy.s3.title": "3. Finalités et bases légales",
  "legal.privacy.s3.b1":
    "Répondre à vos demandes (contact, demande de renseignements) — base légale : votre consentement, matérialisé par la case à cocher obligatoire du formulaire.",
  "legal.privacy.s3.b2":
    "Transmettre votre demande au vendeur concerné (immobilier / véhicules) — base légale : votre consentement explicite, révocable à tout moment.",
  "legal.privacy.s3.b3":
    "Mesurer l'audience du site de façon anonyme (comptage de clics agrégé, sans donnée personnelle) — base légale : intérêt légitime, sous réserve d'anonymisation complète.",
  "legal.privacy.s3.b4":
    "Assurer la sécurité du site et prévenir les abus (limitations de débit, vérification des destinations de redirection) — base légale : intérêt légitime.",
  "legal.privacy.s4.title": "4. Durées de conservation",
  "legal.privacy.s4.b1":
    "Demandes de contact et de renseignements : 3 ans maximum après le dernier échange avec vous, puis anonymisation ou suppression. Un contact ayant retiré son consentement est traité comme unsubscribed et n'est plus sollicité.",
  "legal.privacy.s4.b2":
    "Événements de clic : conservés 24 mois au maximum, sous forme anonymisée et agrégée (statistiques internes sans donnée personnelle).",
  "legal.privacy.s4.b3":
    "Preuves de consentement : conservées pendant la durée de la relation puis archivées conformément aux obligations légales de justification.",
  "legal.privacy.s5.title": "5. Destinataires des données",
  "legal.privacy.s5.b1": "Notre équipe interne, uniquement pour traiter votre demande.",
  "legal.privacy.s5.b2":
    "Le vendeur du produit concerné, uniquement dans le cadre d'une demande de renseignements et uniquement après votre consentement explicite.",
  "legal.privacy.s5.b3":
    "Notre hébergeur technique, agissant en qualité de sous-traitant, dans des conditions contractuelles de protection des données.",
  "legal.privacy.s5.tail":
    "Nous ne vendons, ne louons et ne cédons vos données à aucun tiers à des fins publicitaires. Aucune mesure d'audience tierce (régies publicitaires, réseaux sociaux) n'est présente sur le site.",
  "legal.privacy.s6.title": "6. Vos droits (RGPD)",
  "legal.privacy.s6.lead":
    "Conformément au Règlement général sur la protection des données (UE 2016/679) et aux lois nationales applicables, vous disposez des droits suivants :",
  "legal.privacy.s6.b1": "droit d'accès à vos données ;",
  "legal.privacy.s6.b2": "droit de rectification ;",
  "legal.privacy.s6.b3": "droit à l'effacement (« droit à l'oubli ») ;",
  "legal.privacy.s6.b4": "droit à la limitation du traitement ;",
  "legal.privacy.s6.b5": "droit d'opposition ;",
  "legal.privacy.s6.b6": "droit à la portabilité de vos données ;",
  "legal.privacy.s6.b7":
    "droit de retirer votre consentement à tout moment, sans affecter la licéité du traitement antérieur.",
  "legal.privacy.s6.tail":
    "Pour exercer ces droits, écrivez-nous via la page Contact en précisant l'adresse e-mail concernée. Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la CNIL (France) ou de l'autorité de protection des données de votre pays de résidence.",
  "legal.privacy.s7.title": "7. Sécurité",
  "legal.privacy.s7.body":
    "Les échanges transitent chiffrés. L'accès à l'outillage interne est protégé par des sessions signées et à usage restreint ; les actions sensibles sont journalisées. Les données sont minimisées à la source : nous ne collectons que les champs explicitement indiqués sur les formulaires.",
  "legal.privacy.s8.title": "8. Cookies et traceurs",
  "legal.privacy.s8.before": "Notre approche est décrite en détail dans la ",
  "legal.privacy.s8.emphasis": "Politique cookies",
  "legal.privacy.s8.after":
    " : pas de cookies publicitaires ni de traceurs tiers, uniquement ce qui est strictement nécessaire.",

  "legal.terms.title": "Conditions d'utilisation",
  "legal.terms.intro":
    "Les présentes conditions encadrent l'utilisation du site VELMORA LABS, plateforme multi-produits. En naviguant sur le site, vous les acceptez. Le site ne vend aucun produit : il regroupe et présente des offres de plusieurs vendeurs.",
  "legal.terms.s1.title": "1. Objet",
  "legal.terms.s1.body":
    "VELMORA LABS met à disposition un service gratuit de regroupement et de présentation d'offres issues de plusieurs vendeurs, dans sept catégories : produits numériques, formations, abonnements & SaaS, maison, électronique, immobilier et véhicules.",
  "legal.terms.s2.title": "2. Nature du service — vous n'achetez pas sur ce site",
  "legal.terms.s2.b1":
    "VELMORA LABS n'est ni le vendeur, ni le fabricant, ni l'annonceur des produits présentés.",
  "legal.terms.s2.b2":
    "Le contrat de vente se conclut exclusivement entre vous et le vendeur, sur le site du vendeur, selon ses propres conditions générales.",
  "legal.terms.s2.b3":
    "Le paiement, la facturation, la livraison, la garantie et le service après-vente relèvent entièrement du vendeur.",
  "legal.terms.s2.b4":
    "Les prix, fourchettes de prix et disponibilités affichés sont indicatifs, synchronisés régulièrement avec les données des vendeurs et peuvent varier à tout moment. Seul le prix affiché sur le site du vendeur au moment de l'achat fait foi.",
  "legal.terms.s3.title": "3. Redirection vers le site du vendeur",
  "legal.terms.s3.body":
    "Les boutons d'achat (« Voir sur [nom du vendeur] ») pointent vers un endpoint de redirection suivie qui enregistre un clic strictement anonyme avant de vous rediriger vers le site du vendeur, où l'achat se finalise. Cette mesure anonyme nous permet de comprendre l'intérêt des visiteurs et d'améliorer la sélection. Ce mécanisme est détaillé dans la page « Fonctionnement de la plateforme ».",
  "legal.terms.s4.title": "4. Utilisation du site",
  "legal.terms.s4.lead": "Vous vous engagez à utiliser le site de manière loyale et licite, et notamment à :",
  "legal.terms.s4.b1": "ne pas tenter d'altérer, de surcharger ou de contourner les mesures de sécurité du site ;",
  "legal.terms.s4.b2": "ne pas générer artificiellement des clics sur les redirections (fraude au clic) ;",
  "legal.terms.s4.b3": "ne pas extraire massivement le contenu du catalogue sans autorisation écrite ;",
  "legal.terms.s4.b4": "fournir des informations exactes dans les formulaires et ne pas usurper l'identité d'autrui.",
  "legal.terms.s5.title": "5. Propriété intellectuelle",
  "legal.terms.s5.body":
    "La marque, le logo, les textes et l'interface du site sont la propriété de VELMORA LABS ou de ses licenciés. Les noms, visuels et descriptions des produits appartiennent à leurs propriétaires respectifs (vendeurs ou fabricants) et sont utilisés dans le cadre strict de la présentation comparative.",
  "legal.terms.s6.title": "6. Disponibilité et exactitude",
  "legal.terms.s6.body":
    "Le service est fourni « en l'état », avec soin mais sans garantie d'interruption nulle. Le catalogue évolue en continu : certains produits peuvent devenir indisponibles ou voir leurs prix modifiés. En cas d'erreur manifeste de prix sur le site du vendeur, c'est la procédure du vendeur qui s'applique ; nous vous invitons à vérifier le prix final avant tout achat.",
  "legal.terms.s7.title": "7. Responsabilité",
  "legal.terms.s7.body":
    "La responsabilité de VELMORA LABS ne peut être engagée que pour des dommages directs résultant d'une faute imputable au site. Elle est expressément exclue pour le contenu, les pratiques commerciales, la livraison et le service après-vente des sites vendeurs, vers lesquels nos liens vous redirigent de façon clairement identifiée.",
  "legal.terms.s8.title": "8. Droit applicable et réclamations",
  "legal.terms.s8.body":
    "Les présentes conditions sont soumises au droit français. En cas de différend, une solution amiable sera recherchée en priorité via la page Contact, avant toute action judiciaire. Nous pouvons faire évoluer ces conditions pour refléter l'amélioration du service ; la version applicable est celle publiée sur cette page, avec sa date de mise à jour.",

  "legal.disclosure.title": "Fonctionnement de la plateforme",
  "legal.disclosure.intro":
    "VELMORA LABS est une plateforme multi-produits qui regroupe des produits provenant de plusieurs vendeurs et sources. Voici, en toute transparence, comment fonctionne le site — et ce que cela ne change pas pour vous.",
  "legal.disclosure.s1.title": "1. Le parcours en trois étapes",
  "legal.disclosure.s1.step1.title": "Vous parcourez le catalogue.",
  "legal.disclosure.s1.step1.text":
    "Vous découvrez les produits, prix et disponibilités indiqués pour chaque offre, toutes catégories confondues.",
  "legal.disclosure.s1.step2.title": "Vous cliquez sur « Voir sur [nom du vendeur] ».",
  "legal.disclosure.s1.step2.text":
    "Le bouton mène vers une redirection suivie (/api/go) qui enregistre un clic strictement anonyme, puis vous envoie sur le site du vendeur.",
  "legal.disclosure.s1.step3.title": "Vous achetez sur le site du vendeur.",
  "legal.disclosure.s1.step3.text":
    "La commande, le paiement et le service après-vente se font entièrement chez le vendeur, selon ses conditions. Nous ne voyons jamais votre panier ni vos moyens de paiement.",
  "legal.disclosure.s2.title": "2. Prix et disponibilités",
  "legal.disclosure.s2.body":
    "Les prix et disponibilités affichés sont synchronisés régulièrement depuis les données des vendeurs et horodatés : chaque fiche indique sa dernière mise à jour. Ils restent indicatifs — les vendeurs peuvent modifier leurs prix à tout moment, et seul le prix affiché sur le site du vendeur au moment de l'achat fait foi.",
  "legal.disclosure.s3.title": "3. Une mesure strictement anonyme",
  "legal.disclosure.s3.body":
    "Chaque redirection est enregistrée côté serveur sous forme anonyme : empreinte hachée non réversible, recalculée chaque jour, sans aucune donnée personnelle. Cela nous permet d'alimenter le classement « Les plus consultés », de repérer les liens rompus et d'améliorer la sélection — sans jamais identifier les visiteurs ni les suivre d'un site à l'autre.",
  "legal.disclosure.s4.title": "4. Nos engagements",
  "legal.disclosure.s4.b1":
    "Le classement et la sélection des produits ne sont pas vendus : aucun vendeur ne paie pour apparaître « mieux classé ».",
  "legal.disclosure.s4.b2":
    "Les prix et disponibilités proviennent des données synchronisées des vendeurs et sont affichés tels quels, y compris lorsqu'une offre est moins compétitive qu'une autre.",
  "legal.disclosure.s4.b3":
    "Chaque destination de redirection est contrôlée contre une liste blanche de domaines et les liens sont testés régulièrement. Un lien signalé rompu est retiré de la redirection.",
  "legal.disclosure.s4.b4":
    "Aucune donnée personnelle n'est enregistrée lors des redirections : pas de compte client, pas de cookie publicitaire.",
  "legal.disclosure.s5.title": "5. Questions",
  "legal.disclosure.s5.body":
    "Une question sur le fonctionnement du site, sur un vendeur ou sur une offre ? La page Contact est le bon canal : nous lisons tout et répondons.",

  "legal.cookies.title": "Politique cookies",
  "legal.cookies.intro":
    "VELMORA LABS n'utilise ni cookie publicitaire, ni traceur tiers. Cette page explique, en détail, ce qui est stocké sur votre appareil (et ce qui ne l'est pas).",
  "legal.cookies.s1.title": "1. Notre approche",
  "legal.cookies.s1.before":
    "Un cookie est un petit fichier déposé sur votre appareil par un site web. Nous avons fait un choix simple : limiter le stockage au strict nécessaire. Concrètement, il n'y a ",
  "legal.cookies.s1.emphasis":
    "aucun cookie de publicité ciblée, aucun pixel de réseau social et aucun cookie de mesure d'audience tierce",
  "legal.cookies.s1.after": " sur ce site.",
  "legal.cookies.s2.title": "2. Ce que nous utilisons",
  "legal.cookies.s2.b1":
    "Cookies strictement nécessaires (cas échéant) : sécurité et session de l'outillage interne réservé aux administrateurs. Ils ne déposent rien sur les appareils des visiteurs de la boutique publique.",
  "legal.cookies.s2.b2":
    "Mesure d'audience interne, sans cookie : les clics sur les redirections sortantes sont enregistrés côté serveur avec une empreinte hachée non réversible, recalculée chaque jour, qui ne permet ni de vous identifier ni de vous suivre d'un site à l'autre. Aucun identifiant n'est stocké sur votre appareil.",
  "legal.cookies.s2.b3":
    "Préférences d'affichage : certains réglages d'interface peuvent être mémorisés localement (stockage local du navigateur) pour améliorer votre confort de navigation. Ils ne contiennent aucune donnée personnelle.",
  "legal.cookies.s3.title": "3. Ce que nous n'utilisons pas",
  "legal.cookies.s3.b1": "pas de cookies de régie publicitaire ni de retargeting ;",
  "legal.cookies.s3.b2": "pas de widgets ou boutons de réseaux sociaux qui pistent votre navigation ;",
  "legal.cookies.s3.b3": "pas de vente ou de partage de données de navigation avec des tiers.",
  "legal.cookies.s4.title": "4. Gérer les cookies depuis votre navigateur",
  "legal.cookies.s4.body":
    "Vous pouvez à tout moment consulter, bloquer ou supprimer les cookies depuis les réglages de votre navigateur (généralement dans « Confidentialité et sécurité »). Comme nous ne déposons pas de cookies de suivi sur la boutique publique, leur blocage n'altère pas la navigation ; en revanche, bloquer les cookies techniques peut déconnecter une session d'administration légitime.",
  "legal.cookies.s5.title": "5. Évolutions",
  "legal.cookies.s5.body":
    "Si nous devions un jour ajouter un traceur non essentiel (par exemple une mesure d'audience tierce), il serait soumis à votre consentement préalable via un bandeau dédié, et cette page serait mise à jour avec sa date de révision.",

  "legal.about.title": "À propos de VELMORA LABS",
  "legal.about.intro":
    "VELMORA LABS est une plateforme multi-produits internationale : un seul site pour découvrir des produits numériques, formations, abonnements, articles de maison, électronique, biens immobiliers et véhicules, proposés par plusieurs vendeurs vérifiés.",
  "legal.about.s1.title": "1. Notre mission",
  "legal.about.s1.body":
    "Le commerce en ligne est éclaté : chaque vendeur annonce ses prix dans sa propre bulle. Notre mission est de remettre de la lisibilité — regrouper des offres de catégories très différentes, afficher les prix au même endroit, et indiquer clairement quand vous quittez le site pour finaliser un achat chez le vendeur.",
  "legal.about.s2.title": "2. Comment nous travaillons",
  "legal.about.s2.step1.title": "Sélection des vendeurs.",
  "legal.about.s2.step1.text":
    "Chaque source est vérifiée avant publication : destinations contrôlées contre une liste blanche de domaines, liens testés régulièrement.",
  "legal.about.s2.step2.title": "Synchronisation du catalogue.",
  "legal.about.s2.step2.text":
    "Prix, fourchettes et disponibilités proviennent des données des vendeurs, horodatées et rafraîchies ; chaque fiche indique sa dernière mise à jour.",
  "legal.about.s2.step3.title": "Redirection claire.",
  "legal.about.s2.step3.text":
    "Un clic sur « Voir sur [nom du vendeur] » passe par notre redirection suivie, enregistrée de façon anonyme, puis vous arrivez sur le site du vendeur pour finaliser l'achat.",
  "legal.about.s3.title": "3. Nos engagements",
  "legal.about.s3.b1":
    "Sources indiquées : chaque fiche précise l'offre concernée et la date de sa dernière mise à jour.",
  "legal.about.s3.b2":
    "Données minimisées : pas de compte client, pas de cookie publicitaire, clics enregistrés sans donnée personnelle.",
  "legal.about.s3.b3":
    "Consentement explicite : aucune coordonnée n'est transmise à un vendeur sans la case de consentement cochée.",
  "legal.about.s3.b4":
    "Jamais de vente directe : nous ne prenons ni paiement, ni commande ; l'achat se fait sur le site du vendeur.",
  "legal.about.s4.title": "4. Nous contacter",
  "legal.about.s4.body":
    "Une question, une correction de prix, un signalement ? La page Contact est le canal le plus rapide. Les questions fréquentes (fonctionnement, prix, devises) ont leur page FAQ.",
} satisfies Record<string, DictEntry>;

/* ──────────────────────────────── English ──────────────────────────────── */

const EN: Widen<typeof FR> = {
  /* Generic */
  "common.retry": "Retry",
  "common.demoBadge": "Demo",
  "common.privacyLink": "privacy policy",

  /* Language switcher (deliberately bilingual labels) */
  "lang.aria": "Choisir la langue / Choose language",
  "lang.label": "Langue / Language",
  "lang.fr": "Français",
  "lang.en": "English",

  /* Navigation */
  "nav.home": "Home",
  "nav.catalogue": "Catalog",
  "nav.faq": "FAQ",
  "nav.contact": "Contact",
  "nav.about": "About",
  "nav.mainAria": "Main navigation",
  "nav.mobileAria": "Mobile navigation",

  /* Header */
  "header.openMenuAria": "Open the store menu",
  "header.brandHomeAria": "{brand} — back to home",
  "header.logoAlt": "{brand} logo",
  "header.searchPlaceholder": "Search for a product…",
  "header.searchPlaceholderShort": "Search…",
  "header.searchAria": "Search for a product",
  "header.searchSubmitAria": "Run the search",
  "header.categories": "Categories",
  "header.categoriesAria": "Browse by category",
  "header.categoriesEmpty": "No categories available at the moment.",
  "header.categoriesEmptyShort": "No categories available.",
  "header.categoryItemAria": (vars) => {
    const n = Number(vars.count);
    return `View the ${vars.name} category — ${n} product${n > 1 ? "s" : ""}`;
  },
  "header.adminAria": "Open the admin area (back office)",
  "header.adminTitle": "Admin area",
  "header.adminButton": "Admin area",

  /* Footer */
  "footer.disclosureFallback":
    "VELMORA LABS aggregates products from several sellers. When you click on “View the offer”, you are redirected to the seller's website, where the purchase takes place. The purchase is never made on VELMORA LABS.",
  "footer.shopTitle": "Store",
  "footer.shopAria": "Store links",
  "footer.legalTitle": "Legal information",
  "footer.legalAria": "Legal information",
  "footer.linkPrivacy": "Privacy policy",
  "footer.linkTerms": "Terms of use",
  "footer.linkDisclosure": "How the platform works",
  "footer.linkCookies": "Cookie policy",
  "footer.copyright": "© {year} {brand}. All rights reserved.",
  "footer.priceNotice":
    "Indicative prices provided by the sellers — always check the final price on their website.",

  /* Store boot */
  "boot.loadingAria": "Loading the store",
  "boot.errorTitle": "Unable to load the store",
  "boot.errorBody":
    "The site settings could not be retrieved. Check your connection, then try again.",

  /* Home */
  "home.badge": "Multi-product platform",
  "home.titleFallback": "Discover more. Choose better.",
  "home.subtitle":
    "Discover and compare products from several sellers across {count} universes. In one click, go to the seller's website to complete your purchase.",
  "home.searchPlaceholder": "E-book, training course, subscription, apartment…",
  "home.searchButton": "Search",
  "home.heroImageAlt": "VELMORA store illustration — multi-category product selection",
  "home.heroFallbackTagline": "A multi-universe selection, continuously updated",
  "home.categoriesTitle": "Browse by",
  "home.categoriesAccent": "category",
  "home.categoriesSubtitle": "Seven universes, one single comparison site.",
  "home.allCatalog": "The whole catalog",
  "home.categoryAria": (vars) => {
    const n = Number(vars.count);
    return `View the products in the ${vars.name} category (${n} product${n > 1 ? "s" : ""})`;
  },
  "home.productCount": (vars) => {
    const n = Number(vars.count);
    return `${n} product${n > 1 ? "s" : ""}`;
  },
  "home.newTitle": "New arrivals",
  "home.newSubtitle": "The latest additions to the catalog.",
  "home.popularTitle": "Most viewed",
  "home.popularSubtitleMeasured":
    "Ranking based on the outbound clicks recorded towards the offers (last 30 days) — neither sales nor reviews.",
  "home.popularSubtitleDefault": "A selection regularly viewed by the store's visitors.",
  "home.viewAll": "View all",
  "home.rowError":
    "Unable to load this selection right now — the rest of the store remains accessible.",
  "home.rowLoadingAria": "Loading — {title}",
  "home.rowEmpty": "No products to display at the moment.",
  "home.howTitle": "How does it work?",
  "home.disclosureFallback":
    "VELMORA LABS aggregates products from several sellers across seven universes. When you click on “View the offer”, you are redirected to the seller's website, where the purchase takes place. The redirection is measured in a strictly anonymous way.",
  "home.howLink": "Learn how the platform works",

  /* Catalog */
  "catalog.type.digital": "Digital products",
  "catalog.type.training": "Training courses",
  "catalog.type.subscription": "Subscriptions & SaaS",
  "catalog.type.home": "Home",
  "catalog.type.electronics": "Electronics",
  "catalog.type.real_estate": "Real estate",
  "catalog.type.vehicle": "Vehicles",
  "catalog.type.other": "Other",
  "catalog.type.fallback": "Product",
  "catalog.availability.inStock": "In stock (per the seller)",
  "catalog.availability.outOfStock": "Out of stock (reported)",
  "catalog.availability.unknown": "Availability to be checked on the seller's website",
  "catalog.popularityAria": (vars) => {
    const n = Number(vars.count);
    const nStr = n.toLocaleString("en-US");
    return `Popularity: ${vars.stars} out of 5, measured by ${nStr} outbound click${n > 1 ? "s" : ""} towards the offers over 30 days. These are neither buyer ratings nor sales.`;
  },
  "catalog.clicks": (vars) => {
    const n = Number(vars.count);
    return `${n.toLocaleString("en-US")} click${n > 1 ? "s" : ""} · 30 days`;
  },
  "catalog.cardAria": "View product page: {title}",
  "catalog.imageAlt": "Image — {title}",
  "catalog.offersCount": (vars) => `${Number(vars.count).toLocaleString("en-US")} offers available`,
  "catalog.offerComing": "Offer coming soon",
  "catalog.descFallback":
    "Browse the products and offers of our multi-category selection. Purchases are completed on the seller's website, in one click.",
  "catalog.filtersAria": "Catalog filters",
  "catalog.searchInputAria": "Search the catalog",
  "catalog.categoryAria": "Filter by category",
  "catalog.categoryPlaceholder": "Category",
  "catalog.allCategories": "All categories",
  "catalog.typeAria": "Filter by product type",
  "catalog.typePlaceholder": "Type",
  "catalog.allTypes": "All types",
  "catalog.sortAria": "Sort the results",
  "catalog.sortPlaceholder": "Sort",
  "catalog.sort.recent": "Most recent",
  "catalog.sort.priceAsc": "Price: low to high",
  "catalog.sort.priceDesc": "Price: high to low",
  "catalog.countLine": (vars) => {
    const n = Number(vars.count);
    const q = String(vars.q ?? "");
    return `${n.toLocaleString("en-US")} product${n > 1 ? "s" : ""} found${q ? ` for “${q}”` : ""}`;
  },
  "catalog.starsNote":
    "★ = visitor interest measured by the outbound clicks towards the offers (last 30 days) — neither buyer reviews nor sales.",
  "catalog.loadingAria": "Loading products",
  "catalog.errorTitle": "The catalog could not be loaded",
  "catalog.errorFallback": "Failed to load the catalog",
  "catalog.emptyTitle": "No product matches your search",
  "catalog.emptyBody": "Try widening your filters or resetting the search.",
  "catalog.resetFilters": "Reset filters",
  "catalog.paginationAria": "Catalog pagination",
  "catalog.prev": "Previous",
  "catalog.next": "Next",
  "catalog.pageAria": "Go to page {n}",
  "catalog.pageInfo": "Page {page} of {pages} — reference currency: {currency}",

  /* Product detail */
  "product.loadingAria": "Loading the product page",
  "product.errorFallback": "Failed to load the product",
  "product.notFoundTitle": "Product not found",
  "product.notFoundBody":
    "This product no longer exists or is not published. It may have been removed from the catalog.",
  "product.errorTitle": "Loading error",
  "product.errorBodyFallback": "Try again in a moment.",
  "product.backToCatalog": "Back to the catalog",
  "product.thumbsAria": "Product thumbnails",
  "product.thumbAria": "Show image {index} of {total}",
  "product.thumbAlt": "Thumbnail {index} — {title}",
  "product.interestNote":
    "Visitor interest — measured by outbound clicks, not a buyer rating.",
  "product.rangeNote":
    "Indicative range — the final price is the one displayed on the seller's website.",
  "product.descriptionTitle": "Description",
  "product.featuresTitle": "Specifications",
  "product.updated": "Updated on {date}",
  "product.language": "Language: {lang}",
  "product.offersTitle": "Available offers ({count})",
  "product.offersNote":
    "The purchase, the payment and the after-sales service take place on the seller's website.",
  "product.noOffers": "No active offer for this product at the moment — come back soon.",
  "product.offerPrice": "Price on the seller's website: {price}",
  "product.lastSync": "Last sync: {date}",
  "product.linkChecking": " — link being verified",
  "product.offerTerms": "Offer terms",
  "product.viewOn": "View on {partner}",
  "product.redirectNote": "You will be redirected to the seller's website to complete your purchase.",

  /* Inquiry form (product page) */
  "inquiry.title": "Request information",
  "inquiry.body":
    "This product is offered by a seller. Send your request through VELMORA LABS: after your explicit consent, your contact details are passed on to the seller, who will get back to you directly. No purchase is made on VELMORA LABS.",
  "inquiry.formAria": "Information request form",
  "inquiry.phoneLabel": "Phone (optional)",
  "inquiry.phonePlaceholder": "+33 6 12 34 56 78",
  "inquiry.messagePlaceholder": "Detail your request: viewing, availability, options…",
  "inquiry.consentA":
    "I agree that my information (name, e-mail address and phone number if provided) may be passed on to the seller of “{product}” so that I can be contacted about my request. This consent is required to submit the form; I can withdraw it at any time via the Contact page. See our ",
  "inquiry.consentC": ".",
  "inquiry.errorConsent": "Your consent is required to pass your request on to the seller.",
  "inquiry.successFallback":
    "Your request has been saved. The seller or our team will get back to you.",
  "inquiry.errorSend": "Sending failed — try again in a few moments.",
  "inquiry.submit": "Send my request",

  /* Shared form labels */
  "form.nameLabel": "Full name *",
  "form.namePlaceholder": "Your name",
  "form.emailLabel": "E-mail *",
  "form.emailPlaceholder": "you@example.com",
  "form.messageLabel": "Your message",
  "form.messageLabelRequired": "Your message *",
  "form.errorName": "Please provide your name.",
  "form.errorEmail": "Invalid e-mail address.",

  /* Contact */
  "contact.title": "Contact",
  "contact.subtitle":
    "A question about an offer, a seller, your data or how the site works? Write to us.",
  "contact.formAria": "Contact form",
  "contact.countryLabel": "Country (optional)",
  "contact.countryPlaceholder": "France, Belgium, Morocco, Canada…",
  "contact.messagePlaceholder": "Describe your question or your request (10 characters minimum).",
  "contact.consentA":
    "I agree that my information (name, e-mail address, country if provided and message) may be stored in order to process and answer my request. This consent is required to submit the form; I can withdraw it at any time. See our ",
  "contact.consentC": ".",
  "contact.errorConsent": "Your consent is required to process your request.",
  "contact.errorMinLength": "Please elaborate your message (10 characters minimum).",
  "contact.successFallback":
    "Your message has been saved. Our team will reply by e-mail.",
  "contact.errorSend": "Sending failed — try again in a few minutes.",
  "contact.submit": "Send the message",
  "contact.beforeTitle": "Before you write",
  "contact.beforeBody":
    "The answers to frequently asked questions (how it works, prices, “Demo” badges, currencies) are in the FAQ. Requests about a property or a vehicle go through the product page form.",
  "contact.faqButton": "Read the FAQ",
  "contact.transparencyTitle": "Data transparency",
  "contact.transparencyBody":
    "Your message is stored only to process your request, kept for 3 years at most, never resold. Details and GDPR rights are in the privacy policy.",
  "contact.privacyButton": "Read the privacy policy",

  /* FAQ */
  "faq.title": "Frequently asked questions",
  "faq.subtitle":
    "How it works, prices, transparency, currencies: the answers to the questions we are asked most often.",
  "faq.q1": "How does the VELMORA LABS platform work?",
  "faq.a1":
    "VELMORA LABS is a multi-product platform: you browse the catalog, compare products, prices and availabilities, then click on “View the offer” to be redirected to the seller's website. The redirection is measured in a completely anonymous way, and the purchase takes place on the seller's website — we do not sell anything ourselves.",
  "faq.q2": "Do I buy directly on VELMORA LABS?",
  "faq.a2":
    "No, never. Payment, invoicing, delivery, warranty and after-sales service are provided by the seller, under the seller's own terms and conditions. VELMORA LABS never asks you for bank details and processes no order.",
  "faq.q3": "Does browsing the site cost anything?",
  "faq.a3":
    "No. Browsing the catalog, comparing prices and viewing product pages is entirely free, with no account to create. If you decide to buy, this happens directly on the seller's website, under the seller's own terms and prices.",
  "faq.q4": "Are the displayed prices reliable?",
  "faq.a4":
    "Prices and availabilities are synchronised regularly with the sellers' data, and each product page shows the date of the last update of each offer. They nevertheless remain indicative: sellers may change their prices at any time. Before buying, always check the final price displayed on the seller's website — that is the authoritative one.",
  "faq.q5": "What does the “Demo” badge mean?",
  "faq.a5":
    "The “Demo” badge flags demonstration content: a fictitious seller or product, used to show how the platform works. No real offer hides behind an item marked “Demo”, and the banner displayed at the top of the site warns you when the catalog is in demonstration mode.",
  "faq.q6": "Why do some listings (real estate, vehicles) show a price range?",
  "faq.a6":
    "For seller listings (apartments, houses, vehicles), the price depends on the condition, the options and the negotiation: we therefore display an indicative range rather than a fake single price. To get the real price and the terms, use the “Request information” form on the product page: after your consent, your request is passed on to the seller, who will contact you.",
  "faq.q7": "How do I ask a question about a property or a vehicle?",
  "faq.a7":
    "Open the product page and fill in the “Request information” form (name, e-mail, optional phone number, message). Your request is sent to the seller only if you tick the consent box — without it, nothing is sent. You can withdraw your consent at any time via the Contact page.",
  "faq.q8": "In which currency are prices displayed?",
  "faq.a8":
    "The store uses a reference currency (the euro by default), the same for every product page to allow comparison. The seller may nevertheless invoice in their own currency: the final amount charged, the exchange rate applied and any bank fees depend on the seller and your payment method — check them on the seller's website before confirming.",
  "faq.notFound": "Can't find the answer to your question?",
  "faq.writeUs": "Write to us: we read every message.",
  "faq.contactButton": "Contact us",

  /* Legal pages */
  "legal.updated": "Last updated: July 2025",

  "legal.privacy.title": "Privacy policy",
  "legal.privacy.intro":
    "VELMORA LABS is a multi-product platform: we collect the minimum amount of data needed to answer your requests and to measure, anonymously, how the site is used. We never sell your data and the purchase takes place on the seller's website.",
  "legal.privacy.s1.title": "1. Data controller",
  "legal.privacy.s1.body":
    "The data controller for the data collected on this site is VELMORA LABS. For any question about your data, use the form on the Contact page: it is our official contact channel, and we answer as quickly as we can.",
  "legal.privacy.s2.title": "2. Data we collect",
  "legal.privacy.s2.lead1": "Data you provide to us voluntarily:",
  "legal.privacy.s2.b1": "Contact form: name, e-mail address, country (optional) and message.",
  "legal.privacy.s2.b2":
    "Information request (real estate, vehicles): name, e-mail address, phone (optional), message and the product viewed. These details are passed on to the seller concerned only after your explicit consent (a mandatory checkbox).",
  "legal.privacy.s2.lead2": "Browsing data, strictly anonymised:",
  "legal.privacy.s2.b3":
    "Outbound clicks (redirections): each click is recorded with a hashed session identifier (a non-reversible fingerprint recomputed every day), the approximate country inferred from the network infrastructure, the truncated referring page and the offer concerned. No personal data is associated.",
  "legal.privacy.s2.b4":
    "We use neither advertising cookies nor third-party trackers, and no advertising profiling. No payment data is ever collected: the purchase takes place entirely on the seller's website.",
  "legal.privacy.s2.tail":
    "The site has no customer accounts: we never ask for a password, an identity document or bank details.",
  "legal.privacy.s3.title": "3. Purposes and legal bases",
  "legal.privacy.s3.b1":
    "Answering your requests (contact, information request) — legal basis: your consent, materialised by the mandatory checkbox of the form.",
  "legal.privacy.s3.b2":
    "Passing your request on to the seller concerned (real estate / vehicles) — legal basis: your explicit consent, revocable at any time.",
  "legal.privacy.s3.b3":
    "Measuring the site's audience anonymously (aggregated click counting, with no personal data) — legal basis: legitimate interest, subject to complete anonymisation.",
  "legal.privacy.s3.b4":
    "Keeping the site secure and preventing abuse (rate limiting, verification of redirection destinations) — legal basis: legitimate interest.",
  "legal.privacy.s4.title": "4. Retention periods",
  "legal.privacy.s4.b1":
    "Contact and information requests: 3 years at most after the last exchange with you, then anonymisation or deletion. A contact who has withdrawn consent is treated as unsubscribed and is no longer contacted.",
  "legal.privacy.s4.b2":
    "Click events: kept 24 months at most, in anonymised and aggregated form (internal statistics with no personal data).",
  "legal.privacy.s4.b3":
    "Proof of consent: kept for the duration of the relationship and then archived in accordance with legal proof-keeping obligations.",
  "legal.privacy.s5.title": "5. Recipients of the data",
  "legal.privacy.s5.b1": "Our internal team, only to process your request.",
  "legal.privacy.s5.b2":
    "The seller of the product concerned, only as part of an information request and only after your explicit consent.",
  "legal.privacy.s5.b3":
    "Our technical hosting provider, acting as a processor, under contractual data-protection terms.",
  "legal.privacy.s5.tail":
    "We never sell, rent or transfer your data to any third party for advertising purposes. No third-party audience measurement (ad networks, social networks) is present on the site.",
  "legal.privacy.s6.title": "6. Your rights (GDPR)",
  "legal.privacy.s6.lead":
    "In accordance with the General Data Protection Regulation (EU 2016/679) and the applicable national laws, you have the following rights:",
  "legal.privacy.s6.b1": "right of access to your data;",
  "legal.privacy.s6.b2": "right to rectification;",
  "legal.privacy.s6.b3": "right to erasure (“right to be forgotten”);",
  "legal.privacy.s6.b4": "right to restriction of processing;",
  "legal.privacy.s6.b5": "right to object;",
  "legal.privacy.s6.b6": "right to data portability;",
  "legal.privacy.s6.b7":
    "right to withdraw your consent at any time, without affecting the lawfulness of the processing carried out before.",
  "legal.privacy.s6.tail":
    "To exercise these rights, write to us via the Contact page, mentioning the e-mail address concerned. If you believe, after contacting us, that your rights are not being respected, you can lodge a complaint with the CNIL (France) or with the data-protection authority of your country of residence.",
  "legal.privacy.s7.title": "7. Security",
  "legal.privacy.s7.body":
    "Communications travel encrypted. Access to the internal tooling is protected by signed, restricted-use sessions; sensitive actions are logged. Data is minimised at the source: we only collect the fields explicitly indicated on the forms.",
  "legal.privacy.s8.title": "8. Cookies and trackers",
  "legal.privacy.s8.before": "Our approach is described in detail in the ",
  "legal.privacy.s8.emphasis": "Cookie policy",
  "legal.privacy.s8.after":
    ": no advertising cookies or third-party trackers, only what is strictly necessary.",

  "legal.terms.title": "Terms of use",
  "legal.terms.intro":
    "These terms govern the use of the VELMORA LABS website, a multi-product platform. By browsing the site, you accept them. The site sells no product: it aggregates and presents offers from several sellers.",
  "legal.terms.s1.title": "1. Purpose",
  "legal.terms.s1.body":
    "VELMORA LABS provides a free service that aggregates and presents offers from several sellers, in seven categories: digital products, training courses, subscriptions & SaaS, home, electronics, real estate and vehicles.",
  "legal.terms.s2.title": "2. Nature of the service — you do not buy on this site",
  "legal.terms.s2.b1":
    "VELMORA LABS is neither the seller, nor the manufacturer, nor the advertiser of the products presented.",
  "legal.terms.s2.b2":
    "The sales contract is concluded exclusively between you and the seller, on the seller's website, under the seller's own terms and conditions.",
  "legal.terms.s2.b3":
    "Payment, invoicing, delivery, warranty and after-sales service are entirely the seller's responsibility.",
  "legal.terms.s2.b4":
    "The prices, price ranges and availabilities displayed are indicative, synchronised regularly with the sellers' data and may change at any time. Only the price displayed on the seller's website at the time of purchase is authoritative.",
  "legal.terms.s3.title": "3. Redirection to the seller's website",
  "legal.terms.s3.body":
    "The buy buttons (“View on [seller name]”) point to a tracked redirection endpoint that records a strictly anonymous click before redirecting you to the seller's website, where the purchase is finalised. This anonymous measurement lets us understand visitors' interest and improve the selection. This mechanism is described on the “How the platform works” page.",
  "legal.terms.s4.title": "4. Use of the site",
  "legal.terms.s4.lead": "You agree to use the site in a fair and lawful manner, and in particular to:",
  "legal.terms.s4.b1": "not attempt to alter, overload or circumvent the site's security measures;",
  "legal.terms.s4.b2": "not generate artificial clicks on the redirections (click fraud);",
  "legal.terms.s4.b3": "not extract the catalog content on a massive scale without written authorisation;",
  "legal.terms.s4.b4": "provide accurate information in the forms and not impersonate anyone.",
  "legal.terms.s5.title": "5. Intellectual property",
  "legal.terms.s5.body":
    "The brand, the logo, the texts and the interface of the site are the property of VELMORA LABS or its licensors. Product names, visuals and descriptions belong to their respective owners (sellers or manufacturers) and are used strictly within the scope of comparative presentation.",
  "legal.terms.s6.title": "6. Availability and accuracy",
  "legal.terms.s6.body":
    "The service is provided “as is”, with care but without any guarantee of uninterrupted availability. The catalog changes continuously: some products may become unavailable or see their prices change. In the event of a manifest pricing error on the seller's website, the seller's own procedure applies; we invite you to check the final price before any purchase.",
  "legal.terms.s7.title": "7. Liability",
  "legal.terms.s7.body":
    "The liability of VELMORA LABS can only be engaged for direct damages resulting from a fault attributable to the site. It is expressly excluded for the content, the business practices, the delivery and the after-sales service of the seller websites, to which our links redirect you in a clearly identified way.",
  "legal.terms.s8.title": "8. Governing law and complaints",
  "legal.terms.s8.body":
    "These terms are governed by French law. In the event of a dispute, an amicable solution will first be sought via the Contact page, before any court action. We may update these terms to reflect improvements to the service; the applicable version is the one published on this page, with its last-updated date.",

  "legal.disclosure.title": "How the platform works",
  "legal.disclosure.intro":
    "VELMORA LABS is a multi-product platform that aggregates products from several sellers and sources. Here is, in full transparency, how the site works — and what it does not change for you.",
  "legal.disclosure.s1.title": "1. The three-step journey",
  "legal.disclosure.s1.step1.title": "You browse the catalog.",
  "legal.disclosure.s1.step1.text":
    "You discover the products, prices and availabilities shown for each offer, across all categories.",
  "legal.disclosure.s1.step2.title": "You click on “View on [seller name]”.",
  "legal.disclosure.s1.step2.text":
    "The button leads to a tracked redirection (/api/go) that records a strictly anonymous click, then sends you to the seller's website.",
  "legal.disclosure.s1.step3.title": "You buy on the seller's website.",
  "legal.disclosure.s1.step3.text":
    "The order, the payment and the after-sales service happen entirely with the seller, under their terms. We never see your basket or your payment methods.",
  "legal.disclosure.s2.title": "2. Prices and availabilities",
  "legal.disclosure.s2.body":
    "The prices and availabilities displayed are synchronised regularly from the sellers' data and timestamped: each product page shows its last update. They remain indicative — sellers may change their prices at any time, and only the price displayed on the seller's website at the time of purchase is authoritative.",
  "legal.disclosure.s3.title": "3. A strictly anonymous measurement",
  "legal.disclosure.s3.body":
    "Each redirection is recorded server-side in anonymous form: a non-reversible hashed fingerprint, recomputed every day, with no personal data whatsoever. This feeds the “Most viewed” ranking, helps detect broken links and improves the selection — without ever identifying visitors or following them from site to site.",
  "legal.disclosure.s4.title": "4. Our commitments",
  "legal.disclosure.s4.b1":
    "Ranking and product selection are not for sale: no seller pays to appear “better ranked”.",
  "legal.disclosure.s4.b2":
    "Prices and availabilities come from the sellers' synchronised data and are displayed as they are, including when an offer is less competitive than another.",
  "legal.disclosure.s4.b3":
    "Each redirection destination is checked against a domain allow-list and the links are tested regularly. A link reported as broken is removed from the redirection.",
  "legal.disclosure.s4.b4":
    "No personal data is recorded during redirections: no customer account, no advertising cookie.",
  "legal.disclosure.s5.title": "5. Questions",
  "legal.disclosure.s5.body":
    "A question about how the site works, about a seller or about an offer? The Contact page is the right channel: we read everything and we answer.",

  "legal.cookies.title": "Cookie policy",
  "legal.cookies.intro":
    "VELMORA LABS uses neither advertising cookies nor third-party trackers. This page explains, in detail, what is stored on your device (and what is not).",
  "legal.cookies.s1.title": "1. Our approach",
  "legal.cookies.s1.before":
    "A cookie is a small file placed on your device by a website. We made a simple choice: limit storage to the strict minimum. Concretely, there is ",
  "legal.cookies.s1.emphasis":
    "no targeted advertising cookie, no social-network pixel and no third-party audience-measurement cookie",
  "legal.cookies.s1.after": " on this site.",
  "legal.cookies.s2.title": "2. What we use",
  "legal.cookies.s2.b1":
    "Strictly necessary cookies (where applicable): security and session of the internal tooling reserved for administrators. They place nothing on the devices of visitors to the public store.",
  "legal.cookies.s2.b2":
    "Internal audience measurement, without cookies: clicks on outbound redirections are recorded server-side with a non-reversible hashed fingerprint, recomputed every day, which makes it impossible to identify you or to follow you from site to site. No identifier is stored on your device.",
  "legal.cookies.s2.b3":
    "Display preferences: some interface settings may be memorised locally (browser local storage) to improve your browsing comfort. They contain no personal data.",
  "legal.cookies.s3.title": "3. What we do not use",
  "legal.cookies.s3.b1": "no ad-network or retargeting cookies;",
  "legal.cookies.s3.b2": "no social-media widgets or buttons that track your browsing;",
  "legal.cookies.s3.b3": "no sale or sharing of browsing data with third parties.",
  "legal.cookies.s4.title": "4. Managing cookies from your browser",
  "legal.cookies.s4.body":
    "You can review, block or delete cookies at any time from your browser's settings (usually under “Privacy and security”). Since we do not place tracking cookies on the public store, blocking them does not alter your browsing; on the other hand, blocking technical cookies may sign out a legitimate administration session.",
  "legal.cookies.s5.title": "5. Changes",
  "legal.cookies.s5.body":
    "If we ever had to add a non-essential tracker (for example a third-party audience measurement), it would be subject to your prior consent via a dedicated banner, and this page would be updated with its revision date.",

  "legal.about.title": "About VELMORA LABS",
  "legal.about.intro":
    "VELMORA LABS is an international multi-product platform: a single site to discover digital products, training courses, subscriptions, home goods, electronics, real estate and vehicles, offered by several verified sellers.",
  "legal.about.s1.title": "1. Our mission",
  "legal.about.s1.body":
    "Online commerce is scattered: every seller advertises its prices in its own bubble. Our mission is to restore readability — aggregate offers from very different categories, display prices in the same place, and clearly indicate when you are leaving the site to complete a purchase with the seller.",
  "legal.about.s2.title": "2. How we work",
  "legal.about.s2.step1.title": "Seller selection.",
  "legal.about.s2.step1.text":
    "Each source is verified before publication: destinations checked against a domain allow-list, links tested regularly.",
  "legal.about.s2.step2.title": "Catalog synchronisation.",
  "legal.about.s2.step2.text":
    "Prices, ranges and availabilities come from the sellers' data, timestamped and refreshed; each product page shows its last update.",
  "legal.about.s2.step3.title": "Clear redirection.",
  "legal.about.s2.step3.text":
    "A click on “View on [seller name]” goes through our tracked redirection, recorded anonymously, then you arrive on the seller's website to complete the purchase.",
  "legal.about.s3.title": "3. Our commitments",
  "legal.about.s3.b1":
    "Sources indicated: each product page states the offer concerned and the date of its last update.",
  "legal.about.s3.b2":
    "Minimised data: no customer account, no advertising cookie, clicks recorded with no personal data.",
  "legal.about.s3.b3":
    "Explicit consent: no contact details are passed to a seller without the consent box being ticked.",
  "legal.about.s3.b4":
    "Never any direct selling: we take neither payment nor orders; the purchase happens on the seller's website.",
  "legal.about.s4.title": "4. Contact us",
  "legal.about.s4.body":
    "A question, a price correction, a report? The Contact page is the fastest channel. Frequently asked questions (how it works, prices, currencies) have their own FAQ page.",
};

const DICTS: Record<Lang, Dict> = { fr: FR, en: EN };

/* ───────────────── Valeurs FR du seed initial (miroir de prisma/seed.ts) ───────────────── */

const SEED_TAGLINE_FR = "Découvrez plus. Choisissez mieux.";

const SEED_OUTBOUND_FR =
  "VELMORA LABS regroupe des produits de plusieurs vendeurs dans sept univers. Lorsque vous cliquez sur « Voir l'offre », vous êtes redirigé vers le site du vendeur, où l'achat s'effectue. La redirection est mesurée de façon strictement anonyme.";

export const SEED_DEFAULTS = { tagline: SEED_TAGLINE_FR, outbound: SEED_OUTBOUND_FR } as const;

/**
 * Paramètre admin « seed-aware » (Task 42) : si la valeur est vide OU correspond
 * encore au texte FR posé par le seed initial (jamais personnalisée), on rend la
 * traduction i18n — sinon le contenu réellement personnalisé par l'admin s'affiche
 * tel quel, quelle que soit la langue (principe « honest data » : seules les
 * valeurs non personnalisées suivent la langue de l'interface).
 */
export function seedAware(
  raw: string | null | undefined,
  seedFr: string,
  i18nKey: string,
  t: (key: string, vars?: I18nVars) => string
): string {
  const value = (raw ?? "").trim();
  if (!value || value === seedFr) return t(i18nKey);
  return value;
}

/* ─────────────────────────────── Hook public ─────────────────────────────── */

/** Remplace les jetons {nom} par les valeurs fournies (sans toucher aux inconnus). */
function interpolate(template: string, vars?: I18nVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Accès i18n de la boutique : `lang` courant (fr pendant SSR + hydratation, puis
 * langue persistée), `setLang` (persisté par zustand) et `t(clé, vars?)` avec
 * repli en cascade : dict[lang] → dict.fr → la clé elle-même.
 */
export function useI18n(): {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: I18nVars) => string;
  mounted: boolean;
} {
  const { lang, setLang, mounted } = useLang();
  const t = useCallback(
    (key: string, vars?: I18nVars): string => {
      const entry = DICTS[lang][key] ?? DICTS.fr[key];
      if (entry === undefined) return key;
      return typeof entry === "function" ? entry(vars ?? {}) : interpolate(entry, vars);
    },
    [lang]
  );
  return { lang, setLang, t, mounted };
}

/** Clés de dictionnaire pour les libellés dérivés de données (type produit, disponibilité). */
export function productTypeKey(value: string): string {
  const known: Record<string, string> = {
    digital: "catalog.type.digital",
    training: "catalog.type.training",
    subscription: "catalog.type.subscription",
    home: "catalog.type.home",
    electronics: "catalog.type.electronics",
    real_estate: "catalog.type.real_estate",
    vehicle: "catalog.type.vehicle",
    other: "catalog.type.other",
  };
  return known[value] ?? "catalog.type.fallback";
}

export function availabilityKey(availability: string): string {
  if (availability === "in_stock") return "catalog.availability.inStock";
  if (availability === "out_of_stock") return "catalog.availability.outOfStock";
  return "catalog.availability.unknown";
}
