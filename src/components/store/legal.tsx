"use client";

/**
 * Pages légales de la boutique — contenus réels rédigés en français :
 * politique de confidentialité, conditions d'utilisation, fonctionnement de la
 * plateforme, politique cookies, à propos. Chaque vue = LegalPage({ kind }).
 */
import type { ReactNode } from "react";

export type LegalKind = "privacy" | "terms" | "disclosure" | "cookies" | "about";

const UPDATED = "Dernière mise à jour : juillet 2025";
const BRAND = "VELMORA LABS";

function LegalShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <article className="rounded-2xl border bg-white p-6 shadow-sm lg:p-10">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{UPDATED}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm leading-relaxed text-foreground/85">
          {intro}
        </p>
        <div className="mt-7 space-y-7">{children}</div>
      </article>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-foreground/80">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: { title: string; text: string }[] }) {
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="brand-gradient mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <p>
            <span className="font-semibold text-foreground">{s.title} </span>
            {s.text}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────── Politique de confidentialité ─────────────── */

function PrivacyPage() {
  return (
    <LegalShell
      title="Politique de confidentialité"
      intro={`${BRAND} est une plateforme multi-produits : nous collectons le minimum de données nécessaire pour répondre à vos demandes et mesurer, de façon anonyme, l'usage du site. Nous ne vendons jamais vos données et l'achat s'effectue sur le site du vendeur.`}
    >
      <Section title="1. Responsable du traitement">
        <p>
          Le responsable du traitement des données collectées sur ce site est {BRAND}. Pour toute question
          relative à vos données, utilisez le formulaire de la page Contact : c'est notre canal officiel
          de prise de contact, nous répondons dans les meilleurs délais.
        </p>
      </Section>

      <Section title="2. Données que nous collectons">
        <p className="font-medium text-foreground">Données que vous nous transmettez volontairement :</p>
        <Bullets
          items={[
            "Formulaire de contact : nom, adresse e-mail, pays (facultatif) et message.",
            "Demande de renseignements (immobilier, véhicules) : nom, adresse e-mail, téléphone (facultatif), message et le produit consulté. Ces éléments sont transmis au vendeur concerné uniquement après votre consentement explicite (case à cocher obligatoire).",
          ]}
        />
        <p className="mt-2.5 font-medium text-foreground">Données de navigation, strictement anonymisées :</p>
        <Bullets
          items={[
            "Clics sortants (redirections) : chaque clic est enregistré avec un identifiant de session haché (empreinte non réversible recalculée chaque jour), le pays approximatif déduit de l'infrastructure réseau, la page de provenance tronquée et l'offre concernée. Aucune donnée personnelle n'est associée.",
            "Nous n'utilisons ni cookie publicitaire, ni traceur tiers, ni profilage publicitaire. Aucune donnée de paiement n'est jamais collectée : l'achat s'effectue intégralement sur le site du vendeur.",
          ]}
        />
        <p className="mt-2.5">
          Le site ne propose pas de compte client : nous ne demandons ni mot de passe, ni pièce d'identité,
          ni coordonnées bancaires.
        </p>
      </Section>

      <Section title="3. Finalités et bases légales">
        <Bullets
          items={[
            "Répondre à vos demandes (contact, demande de renseignements) — base légale : votre consentement, matérialisé par la case à cocher obligatoire du formulaire.",
            "Transmettre votre demande au vendeur concerné (immobilier / véhicules) — base légale : votre consentement explicite, révocable à tout moment.",
            "Mesurer l'audience du site de façon anonyme (comptage de clics agrégé, sans donnée personnelle) — base légale : intérêt légitime, sous réserve d'anonymisation complète.",
            "Assurer la sécurité du site et prévenir les abus (limitations de débit, vérification des destinations de redirection) — base légale : intérêt légitime.",
          ]}
        />
      </Section>

      <Section title="4. Durées de conservation">
        <Bullets
          items={[
            "Demandes de contact et de renseignements : 3 ans maximum après le dernier échange avec vous, puis anonymisation ou suppression. Un contact ayant retiré son consentement est traité comme unsubscribed et n'est plus sollicité.",
            "Événements de clic : conservés 24 mois au maximum, sous forme anonymisée et agrégée (statistiques internes sans donnée personnelle).",
            "Preuves de consentement : conservées pendant la durée de la relation puis archivées conformément aux obligations légales de justification.",
          ]}
        />
      </Section>

      <Section title="5. Destinataires des données">
        <Bullets
          items={[
            "Notre équipe interne, uniquement pour traiter votre demande.",
            "Le vendeur du produit concerné, uniquement dans le cadre d'une demande de renseignements et uniquement après votre consentement explicite.",
            "Notre hébergeur technique, agissant en qualité de sous-traitant, dans des conditions contractuelles de protection des données.",
          ]}
        />
        <p className="mt-2.5">
          Nous ne vendons, ne louons et ne cédons vos données à aucun tiers à des fins publicitaires.
          Aucune mesure d'audience tierce (régies publicitaires, réseaux sociaux) n'est présente sur le site.
        </p>
      </Section>

      <Section title="6. Vos droits (RGPD)">
        <p>
          Conformément au Règlement général sur la protection des données (UE 2016/679) et aux lois
          nationales applicables, vous disposez des droits suivants :
        </p>
        <Bullets
          items={[
            "droit d'accès à vos données ;",
            "droit de rectification ;",
            "droit à l'effacement (« droit à l'oubli ») ;",
            "droit à la limitation du traitement ;",
            "droit d'opposition ;",
            "droit à la portabilité de vos données ;",
            "droit de retirer votre consentement à tout moment, sans affecter la licéité du traitement antérieur.",
          ]}
        />
        <p className="mt-2.5">
          Pour exercer ces droits, écrivez-nous via la page Contact en précisant l'adresse e-mail concernée.
          Si vous estimez, après nous avoir contactés, que vos droits ne sont pas respectés, vous pouvez
          introduire une réclamation auprès de la CNIL (France) ou de l'autorité de protection des données
          de votre pays de résidence.
        </p>
      </Section>

      <Section title="7. Sécurité">
        <p>
          Les échanges transitent chiffrés. L'accès à l'outillage interne est protégé par des sessions
          signées et à usage restreint ; les actions sensibles sont journalisées. Les données sont minimisées
          à la source : nous ne collectons que les champs explicitement indiqués sur les formulaires.
        </p>
      </Section>

      <Section title="8. Cookies et traceurs">
        <p>
          Notre approche est décrite en détail dans la <span className="font-medium text-foreground">Politique
          cookies</span> : pas de cookies publicitaires ni de traceurs tiers, uniquement ce qui est
          strictement nécessaire.
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─────────────── Conditions d'utilisation ─────────────── */

function TermsPage() {
  return (
    <LegalShell
      title="Conditions d'utilisation"
      intro={`Les présentes conditions encadrent l'utilisation du site ${BRAND}, plateforme multi-produits. En naviguant sur le site, vous les acceptez. Le site ne vend aucun produit : il regroupe et présente des offres de plusieurs vendeurs.`}
    >
      <Section title="1. Objet">
        <p>
          {BRAND} met à disposition un service gratuit de regroupement et de présentation d'offres issues
          de plusieurs vendeurs, dans sept catégories : produits numériques, formations,
          abonnements &amp; SaaS, maison, électronique, immobilier et véhicules.
        </p>
      </Section>

      <Section title="2. Nature du service — vous n'achetez pas sur ce site">
        <Bullets
          items={[
            `${BRAND} n'est ni le vendeur, ni le fabricant, ni l'annonceur des produits présentés.`,
            "Le contrat de vente se conclut exclusivement entre vous et le vendeur, sur le site du vendeur, selon ses propres conditions générales.",
            "Le paiement, la facturation, la livraison, la garantie et le service après-vente relèvent entièrement du vendeur.",
            "Les prix, fourchettes de prix et disponibilités affichés sont indicatifs, synchronisés régulièrement avec les données des vendeurs et peuvent varier à tout moment. Seul le prix affiché sur le site du vendeur au moment de l'achat fait foi.",
          ]}
        />
      </Section>

      <Section title="3. Redirection vers le site du vendeur">
        <p>
          Les boutons d'achat (« Voir sur [nom du vendeur] ») pointent vers un endpoint de redirection suivie
          qui enregistre un clic strictement anonyme avant de vous rediriger vers le site du vendeur, où
          l'achat se finalise. Cette mesure anonyme nous permet de comprendre l'intérêt des visiteurs et
          d'améliorer la sélection. Ce mécanisme est détaillé dans la page « Fonctionnement de la plateforme ».
        </p>
      </Section>

      <Section title="4. Utilisation du site">
        <p>Vous vous engagez à utiliser le site de manière loyale et licite, et notamment à :</p>
        <Bullets
          items={[
            "ne pas tenter d'altérer, de surcharger ou de contourner les mesures de sécurité du site ;",
            "ne pas générer artificiellement des clics sur les redirections (fraude au clic) ;",
            "ne pas extraire massivement le contenu du catalogue sans autorisation écrite ;",
            "fournir des informations exactes dans les formulaires et ne pas usurper l'identité d'autrui.",
          ]}
        />
      </Section>

      <Section title="5. Propriété intellectuelle">
        <p>
          La marque, le logo, les textes et l'interface du site sont la propriété de {BRAND} ou de ses
          licenciés. Les noms, visuels et descriptions des produits appartiennent à leurs propriétaires
          respectifs (vendeurs ou fabricants) et sont utilisés dans le cadre strict de la présentation
          comparative.
        </p>
      </Section>

      <Section title="6. Disponibilité et exactitude">
        <p>
          Le service est fourni « en l'état », avec soin mais sans garantie d'interruption nulle. Le
          catalogue évolue en continu : certains produits peuvent devenir indisponibles ou voir leurs prix
          modifiés. En cas d'erreur manifeste de prix sur le site du vendeur, c'est la procédure du
          vendeur qui s'applique ; nous vous invitons à vérifier le prix final avant tout achat.
        </p>
      </Section>

      <Section title="7. Responsabilité">
        <p>
          La responsabilité de {BRAND} ne peut être engagée que pour des dommages directs résultant d'une
          faute imputable au site. Elle est expressément exclue pour le contenu, les pratiques commerciales,
          la livraison et le service après-vente des sites vendeurs, vers lesquels nos liens vous
          redirigent de façon clairement identifiée.
        </p>
      </Section>

      <Section title="8. Droit applicable et réclamations">
        <p>
          Les présentes conditions sont soumises au droit français. En cas de différend, une solution
          amiable sera recherchée en priorité via la page Contact, avant toute action judiciaire. Nous
          pouvons faire évoluer ces conditions pour refléter l'amélioration du service ; la version applicable
          est celle publiée sur cette page, avec sa date de mise à jour.
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─────────────── Fonctionnement de la plateforme ─────────────── */

function DisclosurePage() {
  return (
    <LegalShell
      title="Fonctionnement de la plateforme"
      intro={`${BRAND} est une plateforme multi-produits qui regroupe des produits provenant de plusieurs vendeurs et sources. Voici, en toute transparence, comment fonctionne le site — et ce que cela ne change pas pour vous.`}
    >
      <Section title="1. Le parcours en trois étapes">
        <Steps
          items={[
            {
              title: "Vous parcourez le catalogue.",
              text: "Vous découvrez les produits, prix et disponibilités indiqués pour chaque offre, toutes catégories confondues.",
            },
            {
              title: "Vous cliquez sur « Voir sur [nom du vendeur] ».",
              text: "Le bouton mène vers une redirection suivie (/api/go) qui enregistre un clic strictement anonyme, puis vous envoie sur le site du vendeur.",
            },
            {
              title: "Vous achetez sur le site du vendeur.",
              text: "La commande, le paiement et le service après-vente se font entièrement chez le vendeur, selon ses conditions. Nous ne voyons jamais votre panier ni vos moyens de paiement.",
            },
          ]}
        />
      </Section>

      <Section title="2. Prix et disponibilités">
        <p>
          Les prix et disponibilités affichés sont synchronisés régulièrement depuis les données des
          vendeurs et horodatés : chaque fiche indique sa dernière mise à jour. Ils restent indicatifs —
          les vendeurs peuvent modifier leurs prix à tout moment, et seul le prix affiché sur le site du
          vendeur au moment de l'achat fait foi.
        </p>
      </Section>

      <Section title="3. Une mesure strictement anonyme">
        <p>
          Chaque redirection est enregistrée côté serveur sous forme anonyme : empreinte hachée non
          réversible, recalculée chaque jour, sans aucune donnée personnelle. Cela nous permet
          d'alimenter le classement « Les plus consultés », de repérer les liens rompus et d'améliorer
          la sélection — sans jamais identifier les visiteurs ni les suivre d'un site à l'autre.
        </p>
      </Section>

      <Section title="4. Nos engagements">
        <Bullets
          items={[
            "Le classement et la sélection des produits ne sont pas vendus : aucun vendeur ne paie pour apparaître « mieux classé ».",
            "Les prix et disponibilités proviennent des données synchronisées des vendeurs et sont affichés tels quels, y compris lorsqu'une offre est moins compétitive qu'une autre.",
            "Chaque destination de redirection est contrôlée contre une liste blanche de domaines et les liens sont testés régulièrement. Un lien signalé rompu est retiré de la redirection.",
            "Aucune donnée personnelle n'est enregistrée lors des redirections : pas de compte client, pas de cookie publicitaire.",
          ]}
        />
      </Section>

      <Section title="5. Questions">
        <p>
          Une question sur le fonctionnement du site, sur un vendeur ou sur une offre ? La page Contact
          est le bon canal : nous lisons tout et répondons.
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─────────────── Politique cookies ─────────────── */

function CookiesPage() {
  return (
    <LegalShell
      title="Politique cookies"
      intro={`${BRAND} n'utilise ni cookie publicitaire, ni traceur tiers. Cette page explique, en détail, ce qui est stocké sur votre appareil (et ce qui ne l'est pas).`}
    >
      <Section title="1. Notre approche">
        <p>
          Un cookie est un petit fichier déposé sur votre appareil par un site web. Nous avons fait un choix
          simple : limiter le stockage au strict nécessaire. Concrètement, il n'y a <span className="font-medium text-foreground">aucun
          cookie de publicité ciblée, aucun pixel de réseau social et aucun cookie de mesure d'audience
          tierce</span> sur ce site.
        </p>
      </Section>

      <Section title="2. Ce que nous utilisons">
        <Bullets
          items={[
            "Cookies strictement nécessaires (cas échéant) : sécurité et session de l'outillage interne réservé aux administrateurs. Ils ne déposent rien sur les appareils des visiteurs de la boutique publique.",
            "Mesure d'audience interne, sans cookie : les clics sur les redirections sortantes sont enregistrés côté serveur avec une empreinte hachée non réversible, recalculée chaque jour, qui ne permet ni de vous identifier ni de vous suivre d'un site à l'autre. Aucun identifiant n'est stocké sur votre appareil.",
            "Préférences d'affichage : certains réglages d'interface peuvent être mémorisés localement (stockage local du navigateur) pour améliorer votre confort de navigation. Ils ne contiennent aucune donnée personnelle.",
          ]}
        />
      </Section>

      <Section title="3. Ce que nous n'utilisons pas">
        <Bullets
          items={[
            "pas de cookies de régie publicitaire ni de retargeting ;",
            "pas de widgets ou boutons de réseaux sociaux qui pistent votre navigation ;",
            "pas de vente ou de partage de données de navigation avec des tiers.",
          ]}
        />
      </Section>

      <Section title="4. Gérer les cookies depuis votre navigateur">
        <p>
          Vous pouvez à tout moment consulter, bloquer ou supprimer les cookies depuis les réglages de votre
          navigateur (généralement dans « Confidentialité et sécurité »). Comme nous ne déposons pas de
          cookies de suivi sur la boutique publique, leur blocage n'altère pas la navigation ; en revanche,
          bloquer les cookies techniques peut déconnecter une session d'administration légitime.
        </p>
      </Section>

      <Section title="5. Évolutions">
        <p>
          Si nous devions un jour ajouter un traceur non essentiel (par exemple une mesure d'audience
          tierce), il serait soumis à votre consentement préalable via un bandeau dédié, et cette page serait
          mise à jour avec sa date de révision.
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─────────────── À propos ─────────────── */

function AboutPage() {
  return (
    <LegalShell
      title={`À propos de ${BRAND}`}
      intro={`${BRAND} est une plateforme multi-produits internationale : un seul site pour découvrir des produits numériques, formations, abonnements, articles de maison, électronique, biens immobiliers et véhicules, proposés par plusieurs vendeurs vérifiés.`}
    >
      <Section title="1. Notre mission">
        <p>
          Le commerce en ligne est éclaté : chaque vendeur annonce ses prix dans sa propre bulle. Notre
          mission est de remettre de la lisibilité — regrouper des offres de catégories très différentes,
          afficher les prix au même endroit, et indiquer clairement quand vous quittez le site pour
          finaliser un achat chez le vendeur.
        </p>
      </Section>

      <Section title="2. Comment nous travaillons">
        <Steps
          items={[
            {
              title: "Sélection des vendeurs.",
              text: "Chaque source est vérifiée avant publication : destinations contrôlées contre une liste blanche de domaines, liens testés régulièrement.",
            },
            {
              title: "Synchronisation du catalogue.",
              text: "Prix, fourchettes et disponibilités proviennent des données des vendeurs, horodatées et rafraîchies ; chaque fiche indique sa dernière mise à jour.",
            },
            {
              title: "Redirection claire.",
              text: "Un clic sur « Voir sur [nom du vendeur] » passe par notre redirection suivie, enregistrée de façon anonyme, puis vous arrivez sur le site du vendeur pour finaliser l'achat.",
            },
          ]}
        />
      </Section>

      <Section title="3. Nos engagements">
        <Bullets
          items={[
            "Sources indiquées : chaque fiche précise l'offre concernée et la date de sa dernière mise à jour.",
            "Données minimisées : pas de compte client, pas de cookie publicitaire, clics enregistrés sans donnée personnelle.",
            "Consentement explicite : aucune coordonnée n'est transmise à un vendeur sans la case de consentement cochée.",
            "Jamais de vente directe : nous ne prenons ni paiement, ni commande ; l'achat se fait sur le site du vendeur.",
          ]}
        />
      </Section>

      <Section title="4. Nous contacter">
        <p>
          Une question, une correction de prix, un signalement ? La page Contact est le canal le plus rapide.
          Les questions fréquentes (fonctionnement, prix, devises) ont leur page FAQ.
        </p>
      </Section>
    </LegalShell>
  );
}

/* ─────────────── Sélecteur de vue ─────────────── */

export function LegalPage({ kind }: { kind: LegalKind }) {
  if (kind === "privacy") return <PrivacyPage />;
  if (kind === "terms") return <TermsPage />;
  if (kind === "disclosure") return <DisclosurePage />;
  if (kind === "cookies") return <CookiesPage />;
  return <AboutPage />;
}
