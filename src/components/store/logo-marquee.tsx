/**
 * Task 19 → 21 — deux bandes de logos partenaires défilant en sens opposés (pied de page,
 * entre « Comment ça marche ? » et les colonnes de liens — position inchangée).
 *
 * Task 40 — REFONTE PREMIUM : coque unique blanche légèrement bleutée (#F7F9FE), coins
 * arrondis 1,25 rem, bordure fine teintée bleu marque, ombre très discrète, filet
 * séparateur dégradé bleu→violet, fondus latéraux en PETITS CALQUES STATIQUES superposés
 * (JAMAIS un mask sur la grande piste — règle Task 35-bis : corruption GPU Android),
 * survol desktop (pause de la rangée + zoom léger 1,06 + infobulle native title), repli
 * typographique au nom exact si une image échoue, créneaux à largeur fixe (zéro CLS),
 * moteur rAF sans re-render React par image.
 *
 * Task 41 — ANIMATION INCONDITIONNELLE (4e signalement : « LES LOGO SONT TOUJOURS
 * STATIQUE »). Le mode statique « prefers-reduced-motion » (spec Task 40 §4) est
 * SUPPRIMÉ : le panneau de prévisualisation FORCE cette préférence (documenté Task 20,
 * reproduit et prouvé Tasks 37-a/39), et le contexte de visualisation du propriétaire la
 * déclare aussi — chaque version respectant la préférence lui affiche donc un mur statique.
 * Décision propriétaire (Task 39, réaffirmée ici, priorité sur la spec §4) : l'exigence
 * explicite de défilement permanent prime. Le moteur rAF est insensible à cette
 * préférence : le bandeau défile PARTOUT et TOUT LE TEMPS. Accessibilité conservée :
 * mécanisme de pause au survol (WCAG 2.2.2 « Pause, Stop, Hide »), désormais restreint
 * aux pointeurs fins — un tap tactile ne fige plus une rangée. La version statique
 * défilable reste dans l'historique git (commit 1be3de0) et peut être réactivée.
 *
 * Boucle sans saut : chaque piste = deux moitiés STRICTEMENT identiques (la seconde est
 * aria-hidden : aucun contenu accessible dupliqué) ; décalage ramené modulo la largeur
 * d'une moitié (mesurée, ResizeObserver) ; REPEATS_PER_HALF garantit une demi-largeur ≥
 * écrans ultra-larges (aucun trou visible). Créneaux à largeur fixe → aucun décalage de
 * mise en page pendant le chargement des images.
 *
 * Logos AUTHENTIQUES uniquement : /brands/*.png existants (vérifiés sur disque) —
 * couleurs et proportions d'origine (object-fit: contain), aucun logo inventé, aucune
 * annonce de partenariat officiel. Échec de chargement d'une image → remplacement
 * TYPOGRAPHIQUE sobre au nom exact (état React par slug : les deux moitiés basculent
 * ensemble, la boucle reste sans couture) ; jamais d'icône cassée, de `undefined`, ni de
 * rangée bloquée. Aucun titre, aucun texte introductif, aucun bouton — uniquement les logos.
 */
"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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

/* Aucun abonnement réel : bascule du snapshot serveur (false) au snapshot client (true)
   après hydratation — sans setState dans un effet. */
const emptySubscribe = () => () => {};

export function LogoMarquee() {
  /* false pendant le rendu serveur ET la première passe client (hydratation sans
     mismatch, getServerSnapshot), puis true au montage : les <img> et leur structure
     ne transitent jamais par l'hydratation. */
  const ready = useSyncExternalStore(emptySubscribe, () => true, () => false);

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
  /* Pause au survol : desktop à pointeur fin UNIQUEMENT — un tap tactile ne doit jamais
     figer une rangée (pointerleave/pointercancel tactiles peu fiables). */
  const hoverFineRef = useRef(false);
  /* État mutable hors React : aucune re-render par image (performances). */
  const engine = useRef({
    offsets: [0, 0],
    halfWidths: [0, 0],
    paused: [false, false],
  });

  useEffect(() => {
    if (!ready) return;
    hoverFineRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
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
  }, [ready]);

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
        ) : (
          /* Task 41 : animation INCONDITIONNELLE — plus aucune porte prefers-reduced-motion. */
          BANDS.map((band, i) => (
            <Fragment key={i}>
              {i > 0 && <div className={styles.divider} aria-hidden="true" />}
              <div
                className={styles.band}
                role="presentation"
                onPointerEnter={() => {
                  if (hoverFineRef.current) setPaused(i, true);
                }}
                onPointerLeave={() => {
                  if (hoverFineRef.current) setPaused(i, false);
                }}
                onPointerCancel={() => {
                  if (hoverFineRef.current) setPaused(i, false);
                }}
              >
                <div
                  ref={(el) => { trackRefs.current[i] = el; }}
                  className={styles.track}
                  data-testid={`marquee-track-${i}`}
                >
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
