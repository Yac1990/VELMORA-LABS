/**
 * Task 19 → 21 → 40 → 41 → 43 — bande de logos défilante du pied de page
 * (entre « Comment ça marche ? » et les colonnes de liens — position inchangée).
 *
 * Task 43 v2 — AFFINAGE PROPRIÉTAIRE après la v1 monochrome (« le design actuel
 * des logos qui défilent ne plaît pas ») : la capture du modèle confirme UNE SEULE
 * rangée plate SANS CONTOUR, logos défilant DANS LE VIDE (aucune coque, aucune
 * bordure, aucun fondu — coupés aux bords) ; consignes explicites reprises :
 * 1) « rassure-toi que les logos soient en couleur » → suppression TOTALE du
 *    grayscale et de l'opacité réduite : PNG d'origine colorés, opacité pleine ;
 * 2) « réduis la distance entre les logos » → créneaux resserrés 108/132/160 px ;
 * 3) « bien visible » → logos agrandis (26/30/34 px de haut).
 * Les 17 plateformes RÉELLEMENT intégrées restent affichées (honnêteté des
 * données : le modèle illustre le STYLE, pas les marques).
 *
 * Task 41 (inchangé, non négociable) — ANIMATION INCONDITIONNELLE : 4 signalements
 * « LES LOGO SONT TOUJOURS STATIQUE » ont prouvé que le panneau de prévisualisation
 * FORCE prefers-reduced-motion:reduce. AUCUNE porte statique ne doit être
 * réintroduite : le moteur rAF défile PARTOUT et TOUT LE TEMPS. Accessibilité
 * (WCAG 2.2.2) : pause au survol restreinte aux pointeurs fins — un tap tactile
 * ne fige jamais la bande.
 *
 * Boucle sans saut : piste = deux moitiés STRICTEMENT identiques (la seconde est
 * aria-hidden) ; décalage modulo la largeur d'une moitié (mesurée, ResizeObserver) ;
 * REPEATS_PER_HALF garantit une demi-largeur ≥ écrans ultra-larges. Créneaux à
 * largeur fixe → zéro CLS. Moteur rAF sans re-render React par image.
 *
 * Logos AUTHENTIQUES uniquement : /brands/*.png vérifiés sur disque, proportions
 * d'origine (object-fit: contain), aucun logo inventé. Échec de chargement →
 * repli TYPOGRAPHIQUE gris au nom exact (état par slug : les deux moitiés
 * basculent ensemble) ; jamais d'icône cassée ni de rangée bloquée. Aucun titre,
 * aucun texte, aucun bouton — uniquement la bande de logos.
 */
"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./logo-marquee.module.css";

type Brand = { slug: string; name: string };

/* Les 17 plateformes réellement intégrées, dans une seule séquence (modèle Task 43 :
   une seule rangée). Chaque slug correspond à un fichier /brands/<slug>.png VÉRIFIÉ
   (PNG couleur d'origine — affichés SANS filtre depuis la v2). */
const BRANDS: Brand[] = [
  { slug: "amazon-associates", name: "Amazon Associates" },
  { slug: "awin", name: "Awin" },
  { slug: "shareasale", name: "ShareASale" },
  { slug: "rakuten-advertising", name: "Rakuten Advertising" },
  { slug: "cj-affiliate", name: "CJ Affiliate" },
  { slug: "impact", name: "impact.com" },
  { slug: "clickbank", name: "ClickBank" },
  { slug: "ebay-partner-network", name: "eBay Partner Network" },
  { slug: "jumia", name: "Jumia" },
  { slug: "chariow", name: "Chariow" },
  { slug: "kwanko", name: "Kwanko" },
  { slug: "partnerstack", name: "PartnerStack" },
  { slug: "tradedoubler", name: "TradeDoubler" },
  { slug: "admitad", name: "Admitad" },
  { slug: "affilae", name: "Affilae" },
  { slug: "effinity", name: "Effinity" },
  { slug: "digistore24", name: "Digistore24" },
];

/** Répétitions de la séquence par moitié : 17 créneaux × 160 px = 2 720 px par
    séquence ; ×2 = 5 440 px ≥ écrans ultra-larges (boucle sans aucun trou). */
const REPEATS_PER_HALF = 2;

/* Durée (secondes) pour parcourir exactement une moitié : moitié = 34 × 160 px =
   5 440 px ÷ 110 s ≈ 49 px/s — défilement lent, régulier et BIEN VISIBLE, sens
   standard gauche → droite. */
const DIRECTION = "left" as const;
const DURATION_S = 110;

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
  const trackRef = useRef<HTMLDivElement | null>(null);
  const firstHalfRef = useRef<HTMLUListElement | null>(null);
  /* Pause au survol : desktop à pointeur fin UNIQUEMENT — un tap tactile ne doit jamais
     figer la bande (pointerleave/pointercancel tactiles peu fiables). */
  const hoverFineRef = useRef(false);
  /* État mutable hors React : aucune re-render par image (performances). */
  const engine = useRef({ offset: 0, halfWidth: 0, paused: false });

  useEffect(() => {
    if (!ready) return;
    hoverFineRef.current =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const s = engine.current;

    /* Largeur d'une moitié mesurée dynamiquement (chargement des images, responsive). */
    const measure = () => {
      if (firstHalfRef.current) s.halfWidth = firstHalfRef.current.getBoundingClientRect().width;
    };
    const observer = new ResizeObserver(measure);
    if (firstHalfRef.current) observer.observe(firstHalfRef.current);
    measure();

    let raf = 0;
    let running = false;
    let last = performance.now();
    const tick = (now: number) => {
      /* dt borné : aucun saut après un onglet inactif ou une perte de focus. */
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const track = trackRef.current;
      if (track && s.halfWidth > 0) {
        if (!s.paused) {
          s.offset = (s.offset + (s.halfWidth / DURATION_S) * dt) % s.halfWidth;
        }
        /* Sens standard gauche → droite (le repli modulo reste invisible car les
           deux moitiés sont identiques). */
        const x = DIRECTION === "left" ? -s.offset : -(s.halfWidth - s.offset);
        track.style.transform = `translate3d(${x}px, 0, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    /* La boucle rAF est SUSPENDUE quand la bande est hors écran (IntersectionObserver),
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

  /* Logo (ou repli typographique si l'image a échouée) — jamais d'icône cassée. */
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

  const seq: Brand[] = Array.from({ length: REPEATS_PER_HALF }, () => BRANDS).flat();

  return (
    <div ref={wrapRef} className={styles.section} data-testid="logo-marquee">
      {/* Modèle Task 43 : bande plate sur blanc pur — overflow coupé ici, aucune
          coque, aucune bordure, aucun fondu latéral (les logos vont jusqu'au bord). */}
      <div
        className={styles.band}
        role="presentation"
        onPointerEnter={() => {
          if (hoverFineRef.current) engine.current.paused = true;
        }}
        onPointerLeave={() => {
          if (hoverFineRef.current) engine.current.paused = false;
        }}
        onPointerCancel={() => {
          if (hoverFineRef.current) engine.current.paused = false;
        }}
      >
        {!ready ? (
          /* Espace réservé serveur : même géométrie que la bande réelle (aucun CLS),
             aucun contenu marquable par l'outillage de prévisualisation. */
          <div aria-hidden="true" className={styles.phBar} />
        ) : (
          /* Task 41 : animation INCONDITIONNELLE — plus aucune porte prefers-reduced-motion. */
          <div ref={trackRef} className={styles.track} data-testid="marquee-track-0">
            <ul ref={firstHalfRef} className={styles.half}>
              {seq.map((b, i) => (
                <li key={`${b.slug}-${i}`} className={styles.item}>
                  {renderBrand(b, false)}
                </li>
              ))}
            </ul>
            <ul className={styles.half} aria-hidden="true">
              {seq.map((b, i) => (
                <li key={`${b.slug}-${i}`} className={styles.item}>
                  {renderBrand(b, true)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
