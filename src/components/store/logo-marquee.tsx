/**
 * Task 19 + Task 20 + Task 21 — Deux bandes de logos défilant en sens opposés (zone pied de page).
 * - Task 21 (hydratation) : les bandes ne sont rendues qu'APRÈS le montage côté client.
 *   Le serveur n'envoie qu'un espace réservé vide (deux barres, aucune image) : l'outillage
 *   du panneau de prévisualisation, qui marque les images et leurs parents AVANT
 *   l'hydratation React, ne trouve ainsi aucun élément du bandeau à altérer — l'erreur
 *   « some attributes of the server rendered HTML didn't match » ne peut plus se produire
 *   sur le marquee. Aucun impact visible : l'espace réservé garde la même hauteur.
 * - Bande 1 : défilement continu droite → gauche ; bande 2 : gauche → droite.
 * - Moteur JavaScript (requestAnimationFrame) : contrairement à une animation CSS,
 *   il n'est PAS désactivé par un environnement qui force « prefers-reduced-motion »
 *   (panneau de prévisualisation) ni par la désactivation des animations CSS —
 *   c'est le même mécanisme que les animations framer-motion du site, vérifié fonctionnel.
 * - Boucle fluide sans saut : chaque piste = deux moitiés strictement identiques ;
 *   le décalage est ramené modulo la largeur d'une moitié (largeur mesurée, ResizeObserver).
 * - Pause au survol, bande par bande (pointerenter/leave) ; plein régime sur écran tactile.
 * - prefers-reduced-motion : défilement ralenti (×2,5) au lieu d'un arrêt total —
 *   un arrêt rendait les bandes figées en permanence dans l'environnement de prévisualisation.
 * - Aucun titre, aucun texte : uniquement les logos (alt descriptif pour lecteurs d'écran).
 * - Logos servis localement depuis /brands/*.png (couleurs d'origine, non déformés).
 * - Aucun lien cliquable : présentation neutre, aucune annonce de partenariat.
 */
"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import styles from "./logo-marquee.module.css";

type Brand = { slug: string; name: string };

/* Plateformes réparties sur les deux bandes (8 + 8), séquences indépendantes. */
const BAND_TOP: Brand[] = [
  { slug: "amazon-associates", name: "Amazon Associates" },
  { slug: "awin", name: "Awin" },
  { slug: "shareasale", name: "ShareASale" },
  { slug: "rakuten-advertising", name: "Rakuten Advertising" },
  { slug: "cj-affiliate", name: "CJ Affiliate" },
  { slug: "impact", name: "impact.com" },
  { slug: "clickbank", name: "ClickBank" },
  { slug: "ebay-partner-network", name: "eBay Partner Network" },
];

const BAND_BOTTOM: Brand[] = [
  { slug: "chariow", name: "Chariow" },
  { slug: "kwanko", name: "Kwanko" },
  { slug: "partnerstack", name: "PartnerStack" },
  { slug: "tradedoubler", name: "TradeDoubler" },
  { slug: "admitad", name: "Admitad" },
  { slug: "affilae", name: "Affilae" },
  { slug: "effinity", name: "Effinity" },
  { slug: "digistore24", name: "Digistore24" },
];

/** Répétitions de la séquence par moitié de piste : garantit une moitié ≥ largeur d'écran (boucle sans trou). */
const REPEATS_PER_HALF = 3;

/* Durée (en secondes) pour parcourir exactement une moitié de piste —
   mêmes rythmes que la version CSS d'origine (48 s / 56 s). */
const BANDS: { brands: Brand[]; direction: "left" | "right"; durationS: number }[] = [
  { brands: BAND_TOP, direction: "left", durationS: 48 },
  { brands: BAND_BOTTOM, direction: "right", durationS: 56 },
];

/** Mouvement réduit : on ralentit fortement au lieu de figer (voir en-tête). */
const REDUCED_MOTION_FACTOR = 2.5;

function MarqueeHalf({
  brands,
  hidden,
  halfRef,
}: {
  brands: Brand[];
  hidden?: boolean;
  halfRef?: (el: HTMLUListElement | null) => void;
}) {
  const seq: Brand[] = Array.from({ length: REPEATS_PER_HALF }, () => brands).flat();
  return (
    <ul ref={halfRef} className={styles.half} aria-hidden={hidden ? "true" : undefined}>
      {seq.map((b, i) => (
        <li key={`${b.slug}-${i}`} className={styles.item}>
          <img
            src={`/brands/${b.slug}.png`}
            alt={hidden ? "" : `Logo ${b.name}`}
            title={hidden ? undefined : b.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={styles.logo}
            suppressHydrationWarning
          />
        </li>
      ))}
    </ul>
  );
}

/* Aucun abonnement réel : la valeur bascule simplement du snapshot serveur (false)
   au snapshot client (true) après hydratation — sans setState dans un effet. */
const emptySubscribe = () => () => {};

export function LogoMarquee() {
  /* false pendant le rendu serveur ET la première passe client (hydratation sans mismatch,
     getServerSnapshot), puis true dès que le client est monté : les 96 <img> et leur
     structure ne transitent jamais par l'hydratation. */
  const ready = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  const firstHalfRefs = useRef<(HTMLUListElement | null)[]>([null, null]);
  /* État mutable hors React : aucune re-render par image (performances). */
  const engine = useRef({
    offsets: [0, 0],
    halfWidths: [0, 0],
    paused: [false, false],
    reducedMotion: false,
  });

  useEffect(() => {
    if (!ready) return;
    const s = engine.current;

    /* Mouvement réduit : simple ralentissement (jamais d'arrêt, voir en-tête). */
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncReduced = () => {
      s.reducedMotion = mq.matches;
    };
    syncReduced();
    mq.addEventListener("change", syncReduced);

    /* Largeur d'une moitié mesurée dynamiquement (chargement des images, responsive). */
    const measure = () => {
      for (let i = 0; i < 2; i++) {
        const half = firstHalfRefs.current[i];
        if (half) s.halfWidths[i] = half.getBoundingClientRect().width;
      }
    };
    const observer = new ResizeObserver(measure);
    for (let i = 0; i < 2; i++) {
      const half = firstHalfRefs.current[i];
      if (half) observer.observe(half);
    }
    measure();

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      /* dt borné : aucun saut après un onglet inactif ou une perte de focus. */
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      for (let i = 0; i < 2; i++) {
        const track = trackRefs.current[i];
        if (!track) continue;
        const half = s.halfWidths[i];
        if (half <= 0) continue;
        if (!s.paused[i]) {
          const duration = BANDS[i].durationS * (s.reducedMotion ? REDUCED_MOTION_FACTOR : 1);
          s.offsets[i] = (s.offsets[i] + (half / duration) * dt) % half;
        }
        /* Bande gauche : avance vers la gauche ; bande droite : vers la droite.
           Le repli modulo reste invisible car les deux moitiés sont identiques. */
        const offset = s.offsets[i];
        const x = BANDS[i].direction === "left" ? -offset : -(half - offset);
        track.style.transform = `translate3d(${x}px, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mq.removeEventListener("change", syncReduced);
    };
  }, [ready]);

  const setPaused = (index: number, value: boolean) => {
    engine.current.paused[index] = value;
  };

  return (
    <div className="space-y-4 py-5" data-testid="logo-marquee">
      {!ready ? (
        /* Espace réservé serveur : même hauteur que les deux bandes (28 px + 16 px + 28 px),
           aucun contenu marquable par l'outillage externe. */
        <div aria-hidden="true">
          <div className="h-7" />
          <div className="mt-4 h-7" />
        </div>
      ) : (
        BANDS.map((band, i) => (
        <div
          key={i}
          className={styles.band}
          role="presentation"
          onPointerEnter={() => setPaused(i, true)}
          onPointerLeave={() => setPaused(i, false)}
          onPointerCancel={() => setPaused(i, false)}
        >
          <div ref={(el) => { trackRefs.current[i] = el; }} className={styles.track}>
            <MarqueeHalf
              brands={band.brands}
              halfRef={(el) => { firstHalfRefs.current[i] = el; }}
            />
            <MarqueeHalf brands={band.brands} hidden />
          </div>
        </div>
        ))
      )}
    </div>
  );
}
