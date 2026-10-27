/**
 * Task 19 → 21 — deux bandes de logos partenaires défilant en sens opposés (pied de page,
 * entre « Comment ça marche ? » et les colonnes de liens — position inchangée).
 *
 * Task 40 — REFONTE PREMIUM (spec utilisateur complète) :
 * - Coque unique premium : fond blanc légèrement bleuté (#F7F9FE), coins arrondis 2xl,
 *   bordure fine teintée bleu marque, ombre très discrète, débordement coupé à la coque.
 * - Séparation fine entre bandes : filet dégradé bleu → violet (identité VELMORA).
 * - Fondus transparents gauche/droite (petits calques STATIQUES superposés, JAMAIS un
 *   mask sur la grande piste — interdit depuis Task 35-bis : corruption GPU Android) :
 *   ils suggèrent que d'autres partenaires arrivent, sans risque GPU.
 * - Survol (desktop uniquement, media (hover:hover) and (pointer:fine)) : la rangée
 *   survolée est SUSPENDUE (moteur, inchangé) et le logo s'agrandit légèrement
 *   (scale 1,06 + opacité pleine, transition 220 ms — aucun zoom excessif).
 *   Infobulle native `title` = nom réel du partenaire (pas de tooltip clippé par
 *   l'overflow de la coque). Tactile : aucune dépendance au survol, le défilement
 *   vertical de la page n'est jamais entravé (aucun touch-action restrictif).
 * - prefers-reduced-motion → bandes STATQUES nativement défilables (tactile/trackpad/
 *   clavier via tabIndex + aria-label bilingue) : les utilisateurs qui limitent les
 *   animations consultent tous les logos sans mouvement continu (spec §4).
 *   NB documenté : le panneau de prévisualisation FORCE cette préférence — il affiche
 *   donc la version statique ; le carrousel animé permanent reste actif sur tout
 *   navigateur standard (décision Task 39 conservée pour le mode animé).
 * - Logos AUTHENTIQUES uniquement : /brands/*.png existants (vérifiés sur disque :
 *   Amazon, Awin, ShareASale, Rakuten, CJ, impact.com, ClickBank, eBay, JUMIA,
 *   Chariow, Kwanko, PartnerStack, TradeDoubler, Admitad, Affilae, Effinity,
 *   Digistore24) — couleurs et proportions d'origine (object-fit: contain),
 *   aucun logo inventé, aucune annonce de partenariat officiel.
 * - Échec de chargement d'une image → remplacement TYPOGRAPHIQUE sobre au nom exact
 *   (état React par slug : les deux moitiés basculent ensemble, la boucle reste
 *   sans couture) ; jamais d'icône cassée, de `undefined`, ni de rangée bloquée.
 *   La liste rendue correspond à des fichiers réellement présents (pas de déduction
 *   à partir d'un simple nom) — si rien n'était disponible, le composant ne rendrait
 *   que l'espace réservé (aucune bande vide ni logo factice).
 * - Boucle sans saut : chaque piste = deux moitiés STRICTEMENT identiques (la seconde
 *   est aria-hidden : aucun contenu accessible dupliqué) ; décalage ramené modulo la
 *   largeur d'une moitié (mesurée, ResizeObserver). Créneaux à largeur fixe → aucun
 *   décalage de mise en page pendant le chargement des images. Vitesses modérées et
 *   légèrement différentes (60 s / 68 s par moitié) pour un mouvement dynamique et
 *   harmonieux — rangée 1 : droite → gauche ; rangée 2 : gauche → droite, TOUJOURS.
 * - Moteur rAF (aucune bibliothèque ajoutée, aucune re-render React par image) :
 *   pause totale pendant le défilement de page (reprise 180 ms), pause hors écran
 *   (IntersectionObserver), onglet masqué (visibilitychange), dt borné à 50 ms.
 * - Aucun titre, aucun texte introductif, aucun bouton — uniquement les logos.
 */
"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLang } from "@/store/lang";
import styles from "./logo-marquee.module.css";

type Brand = { slug: string; name: string };

/* Plateformes réparties sur les deux bandes (9 + 8), séquences indépendantes.
   Chaque slug correspond à un fichier /brands/<slug>.png VÉRIFIÉ présent dans le projet. */
const BAND_TOP: Brand[] = [
  { slug: "amazon-associates", name: "Amazon Associates" },
  { slug: "awin", name: "Awin" },
  { slug: "shareasale", name: "ShareASale" },
  { slug: "rakuten-advertising", name: "Rakuten Advertising" },
  { slug: "cj-affiliate", name: "CJ Affiliate" },
  { slug: "impact", name: "impact.com" },
  { slug: "clickbank", name: "ClickBank" },
  { slug: "ebay-partner-network", name: "eBay Partner Network" },
  { slug: "jumia", name: "Jumia" },
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

/* Durée (secondes) pour parcourir exactement une moitié : vitesses modérées (≈ 90 px/s
   et ≈ 71 px/s en desktop) et légèrement différentes — mouvement dynamique et harmonieux. */
const BANDS: { brands: Brand[]; direction: "left" | "right"; durationS: number }[] = [
  { brands: BAND_TOP, direction: "left", durationS: 60 },
  { brands: BAND_BOTTOM, direction: "right", durationS: 68 },
];

/** Bande STATIQUE (animations réduites) : nativement défilable (tactile/trackpad/clavier).
    Répétition de la séquence MESURÉE (spec §6) : on ne duplique que si une séquence ne
    remplit pas la largeur visible — jamais de doublons adjacents inutiles sur mobile.
    Mesure en effet (composant monté uniquement) + ResizeObserver (responsive). */
function StaticStrip({
  brands,
  ariaLabel,
  renderBrand,
}: {
  brands: Brand[];
  ariaLabel: string;
  renderBrand: (b: Brand, hidden: boolean) => React.ReactNode;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [repeats, setRepeats] = useState(1);

  useEffect(() => {
    const compute = () => {
      const seq = listRef.current?.scrollWidth ?? 0;
      const visible = stripRef.current?.clientWidth ?? 0;
      if (seq <= 0 || visible <= 0) return;
      const needed = seq >= visible ? 1 : Math.min(4, Math.ceil(visible / seq) + 1);
      setRepeats((prev) => (prev === needed ? prev : needed));
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (listRef.current) ro.observe(listRef.current);
    if (stripRef.current) ro.observe(stripRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={stripRef}
      className={`${styles.band} ${styles.bandStatic}`}
      role="region"
      tabIndex={0}
      aria-label={ariaLabel}
    >
      {Array.from({ length: repeats }, (_, r) => (
        <ul
          key={r}
          ref={r === 0 ? listRef : undefined}
          className={styles.half}
          aria-hidden={r === 0 ? undefined : "true"}
        >
          {brands.map((b) => (
            <li key={b.slug} className={styles.item}>
              {renderBrand(b, r !== 0)}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/* Préférence « animations réduites » (spec Task 40 §4) — abonnement matchMedia unique,
   snapshot sans setState dans un effet. */
const reduceSubscribe = (cb: () => void) => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onChange = () => cb();
  reduced.addEventListener("change", onChange);
  return () => {
    reduced.removeEventListener("change", onChange);
  };
};
const reduceSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Aucun abonnement réel : bascule du snapshot serveur (false) au snapshot client (true)
   après hydratation — sans setState dans un effet. */
const emptySubscribe = () => () => {};

const DICT = {
  fr: {
    staticStripAria:
      "Plateformes partenaires — bande horizontale défilable (animations réduites actives)",
  },
  en: {
    staticStripAria:
      "Partner platforms — horizontally scrollable strip (reduced motion is active)",
  },
} as const;

export function LogoMarquee() {
  /* false pendant le rendu serveur ET la première passe client (hydratation sans
     mismatch, getServerSnapshot), puis true au montage : les <img> et leur structure
     ne transitent jamais par l'hydratation. */
  const ready = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const reduced = useSyncExternalStore(reduceSubscribe, reduceSnapshot, () => false);
  const { lang } = useLang();
  const t = DICT[lang];

  /* Slugs dont l'image a échoué → remplacement typographique (jamais d'icône cassée).
     Par slug (et non par instance) : les deux moitiés basculent ensemble → boucle intacte. */
  const [failedSlugs, setFailedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const markFailed = useCallback((slug: string) => {
    setFailedSlugs((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
  }, []);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const trackRefs = useRef<(HTMLDivElement | null)[]>([null, null]);
  const firstHalfRefs = useRef<(HTMLUListElement | null)[]>([null, null]);
  /* État mutable hors React : aucune re-render par image (performances). */
  const engine = useRef({
    offsets: [0, 0],
    halfWidths: [0, 0],
    paused: [false, false],
  });

  useEffect(() => {
    if (!ready || reduced) return;
    const s = engine.current;

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
    let running = false;
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
          const duration = BANDS[i].durationS;
          s.offsets[i] = (s.offsets[i] + (half / duration) * dt) % half;
        }
        /* Bande 1 : droite → gauche ; bande 2 : gauche → droite (TOUJOURS opposées).
           Le repli modulo reste invisible car les deux moitiés sont identiques. */
        const offset = s.offsets[i];
        const x = BANDS[i].direction === "left" ? -offset : -(half - offset);
        track.style.transform = `translate3d(${x}px, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    /* La boucle rAF est SUSPENDUE quand le bandeau est hors écran (IntersectionObserver),
       quand l'onglet est masqué, ou pendant tout défilement de page (reprise 180 ms). */
    let scrolling = false;
    let scrollTimer = 0;
    const start = () => {
      if (running || scrolling) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };
    const onScroll = () => {
      scrolling = true;
      stop();
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrolling = false;
        if (!document.hidden) start();
      }, 180);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) start();
        else stop();
      },
      { rootMargin: "120px" }
    );
    if (wrapRef.current) io.observe(wrapRef.current);
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      window.clearTimeout(scrollTimer);
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
    };
  }, [ready, reduced]);

  const setPaused = (index: number, value: boolean) => {
    engine.current.paused[index] = value;
  };

  /* Logo (ou repli typographique si l'image a échoué) — jamais d'icône cassée. */
  const renderBrand = (b: Brand, hidden: boolean) =>
    failedSlugs.has(b.slug) ? (
      <span className={styles.logoText} title={hidden ? undefined : b.name}>
        {b.name}
      </span>
    ) : (
      <img
        src={`/brands/${b.slug}.png`}
        alt={hidden ? "" : `Logo ${b.name}`}
        title={hidden ? undefined : b.name}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={styles.logo}
        suppressHydrationWarning
        onError={() => markFailed(b.slug)}
      />
    );

  return (
    <div ref={wrapRef} className={styles.section} data-testid="logo-marquee">
      <div className={styles.shell}>
        {!ready ? (
          /* Espace réservé serveur : même géométrie que les deux bandes (aucun CLS),
             aucun contenu marquable par l'outillage de prévisualisation. */
          <div aria-hidden="true">
            <div className={styles.phBar} />
            <div className={styles.divider} />
            <div className={styles.phBar} />
          </div>
        ) : reduced ? (
          /* Animations réduites : bandes STATIQUES nativement défilables (tactile,
             trackpad, clavier) — consultation complète sans mouvement continu. */
          BANDS.map((band, i) => (
            <Fragment key={i}>
              {i > 0 && <div className={styles.divider} aria-hidden="true" />}
              <StaticStrip
                brands={band.brands}
                ariaLabel={t.staticStripAria}
                renderBrand={renderBrand}
              />
            </Fragment>
          ))
        ) : (
          BANDS.map((band, i) => (
            <Fragment key={i}>
              {i > 0 && <div className={styles.divider} aria-hidden="true" />}
              <div
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
                    renderBrand={renderBrand}
                  />
                  <MarqueeHalf brands={band.brands} hidden renderBrand={renderBrand} />
                </div>
              </div>
            </Fragment>
          ))
        )}
        {/* Fondus latéraux : petits calques STATIQUES (jamais un mask sur la piste —
            Task 35-bis), ils suggèrent l'arrivée d'autres partenaires. */}
        <span className={`${styles.fade} ${styles.fadeLeft}`} aria-hidden="true" />
        <span className={`${styles.fade} ${styles.fadeRight}`} aria-hidden="true" />
      </div>
    </div>
  );
}

/** Moitié de piste animée : séquence répétée (créneaux à largeur fixe → zéro CLS). */
function MarqueeHalf({
  brands,
  hidden,
  halfRef,
  renderBrand,
}: {
  brands: Brand[];
  hidden?: boolean;
  halfRef?: (el: HTMLUListElement | null) => void;
  renderBrand: (b: Brand, hidden: boolean) => React.ReactNode;
}) {
  const seq: Brand[] = Array.from({ length: REPEATS_PER_HALF }, () => brands).flat();
  return (
    <ul ref={halfRef} className={styles.half} aria-hidden={hidden ? "true" : undefined}>
      {seq.map((b, i) => (
        <li key={`${b.slug}-${i}`} className={styles.item}>
          {renderBrand(b, hidden === true)}
        </li>
      ))}
    </ul>
  );
}
