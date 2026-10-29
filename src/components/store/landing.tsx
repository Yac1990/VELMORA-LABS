"use client";

/**
 * Accueil type maquette ChronoTask : fond gris très clair, hero centré avec recherche,
 * grille des catégories (icônes lucide mappées), rangées « Nouveautés » et
 * « Les plus consultés », bandeau « Comment ça marche ».
 * Task 36 : apparition au défilement 100 % CSS (classe .reveal), sans framer-motion.
 */
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/client";
import type { CatalogProduct, CategoryInfo, NavigateFn, StoreSettings } from "./store-app";
import { ProductCard, categoryIcon } from "./catalog";
import { popularityFor, usePopularity, type PopularityProduct } from "./popularity";
import { useI18n, seedAware, SEED_DEFAULTS } from "./i18n";
import { localizeCategoryName } from "./seed-content";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Eye, PackageSearch, Search, ShieldCheck, Sparkles } from "lucide-react";

/**
 * Task 36 — apparition au défilement SANS bibliothèque JS.
 * Un simple <div> rendu à l'identique côté serveur et client : le contenu est
 * VISIBLE dès le HTML initial (plus jamais opacity:0 avant hydratation — fin des
 * sections invisibles puis « pop-in » perçues comme instables sur téléphone).
 * L'animation éventuelle est purement CSS (classe .reveal dans globals.css) :
 * - uniquement sur écrans ≥ 1024 px avec animations autorisées (motion réduits exclus),
 *   pilotée par le défilement dans le composeur (animation-timeline: view()) —
 *   aucun écouteur de scroll, aucun re-rendu React, aucun calcul JS par frame ;
 * - téléphones, tablettes et prefers-reduced-motion : AUCUNE animation, contenu
 *   parfaitement statique et stable au défilement.
 * framer-motion est supprimé de la boutique entière : le bundle initial perd son
 * poids (~45 Ko gzip) — chargement plus rapide sur mobile.
 * `delay` conservé dans l'API pour compatibilité des appels existants (ignoré) : le
 * minutage éventuel est géré par CSS si besoin un jour.
 */
function FadeUp({ children, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return <div className={className ? `reveal ${className}` : "reveal"}>{children}</div>;
}

/* ── Task 17 : illustrations des univers (visuels générés, optimisés WebP). ──
   Clé = slug RÉEL de la catégorie en base ; catégorie sans visuel → repli icône. */
const CATEGORY_ART: Record<string, string> = {
  numerique: "/demo/categories/cat-numerique.webp",
  formations: "/demo/categories/cat-formations.webp",
  abonnements: "/demo/categories/cat-abonnements.webp",
  maison: "/demo/categories/cat-maison.webp",
  electronique: "/demo/categories/cat-electronique.webp",
  immobilier: "/demo/categories/cat-immobilier.webp",
  vehicules: "/demo/categories/cat-vehicules.webp",
};

/** Visuel d'univers : illustration WebP dédiée, repli élégant sur l'icône de marque si absente/échec. */
function CategoryArt({
  slug,
  icon: Icon,
}: {
  slug: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const [failed, setFailed] = useState(false);
  const src = CATEGORY_ART[slug];
  if (!src || failed) {
    return (
      <div
        className="brand-gradient flex h-24 w-full items-center justify-center rounded-xl"
        aria-hidden="true"
      >
        <Icon className="h-9 w-9 text-white/90" />
      </div>
    );
  }
  return (
    <div
      className="flex h-24 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-sky-50/70 to-violet-50/50"
      aria-hidden="true"
      suppressHydrationWarning
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
        /* Attributs externes (marquage d'images du panneau de prévisualisation) ignorés. */
        suppressHydrationWarning
      />
    </div>
  );
}

export function LandingView({
  settings,
  categories,
  onNavigate,
  onOpenProduct,
}: {
  settings: StoreSettings;
  categories: CategoryInfo[];
  onNavigate: NavigateFn;
  onOpenProduct: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const [heroFailed, setHeroFailed] = useState(false);
  const [recentItems, setRecentItems] = useState<CatalogProduct[] | null>(null);
  const [listError, setListError] = useState(false);
  const { data: popularity, error: popularityError } = usePopularity();
  const { t, lang } = useI18n();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet<{ items: CatalogProduct[] }>("/api/public/catalog?sort=recent&perPage=24&page=1");
        if (cancelled) return;
        setRecentItems(res.items);
      } catch {
        if (!cancelled) setListError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const newest = useMemo(() => recentItems?.slice(0, 4) ?? null, [recentItems]);

  // « Les plus consultés » : classement RÉEL par clics sortants (30 j), restreint aux
  // produits du pool récent. Aucune mesure disponible → la section est masquée (jamais
  // de sélection présentée comme consultée sans donnée).
  const popular = useMemo(() => {
    if (!recentItems) return null;
    if (popularityError) return recentItems.slice(4, 8);
    if (!popularity) return null;
    if (popularity.products.length === 0) return [];
    const order = new Map(popularity.products.map((p, i) => [p.slug, i] as const));
    return recentItems
      .filter((p) => order.has(p.slug))
      .sort((a, b) => (order.get(a.slug) ?? 99) - (order.get(b.slug) ?? 99))
      .slice(0, 4);
  }, [recentItems, popularity, popularityError]);

  const popularIsMeasured = !popularityError && popularity != null && popularity.products.length > 0;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate("catalog", { catalogQuery: q.trim() || undefined });
  };

  const disclosure = seedAware(
    settings.outboundNotice,
    SEED_DEFAULTS.outbound,
    "home.disclosureFallback",
    t
  );

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-10 text-center lg:pb-14 lg:pt-16">
          <FadeUp>
            <Badge variant="outline" className="mb-4 gap-1.5 border-primary/30 bg-white text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t("home.badge")}
            </Badge>
            <h1 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight lg:text-5xl">
              {seedAware(settings.brandTagline, SEED_DEFAULTS.tagline, "home.titleFallback", t)}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground lg:text-lg">
              {t("home.subtitle", { count: categories.length || 7 })}
            </p>
          </FadeUp>

          <FadeUp delay={0.08}>
            <form
              onSubmit={submitSearch}
              role="search"
              className="mx-auto mt-7 flex max-w-xl items-center gap-2 rounded-full border bg-white p-1.5 shadow-sm"
            >
              <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={t("header.searchAria")}
                placeholder={t("home.searchPlaceholder")}
                className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button type="submit" className="h-11 shrink-0 rounded-full px-5 min-h-[44px]">
                {t("home.searchButton")}
              </Button>
            </form>
          </FadeUp>

          <FadeUp delay={0.14}>
            {/* suppressHydrationWarning : parent direct du hero <img> marqué par
                l'outillage de prévisualisation avant hydratation (Task 36). */}
            <div className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl border shadow-sm" suppressHydrationWarning>
              {heroFailed ? (
                <div className="brand-gradient flex aspect-[21/9] w-full flex-col items-center justify-center gap-2.5 text-white" aria-hidden="true">
                  <ShieldCheck className="h-10 w-10 opacity-90" />
                  <p className="text-lg font-semibold">{settings.brandName}</p>
                  <p className="text-sm opacity-85">{t("home.heroFallbackTagline")}</p>
                </div>
              ) : (
                <img
                  src="/demo/hero-velmora.png"
                  alt={t("home.heroImageAlt")}
                  className="aspect-[21/9] w-full object-cover"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setHeroFailed(true)}
                  /* L'outillage de prévisualisation marque les <img> (attributs __processed_*)
                     avant hydratation → on ignore ces attributs étrangers, sans effet sinon. */
                  suppressHydrationWarning
                />
              )}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Catégories (Task 17 — refonte premium, périmètre limité à cette section) ── */}
      <section className="mx-auto max-w-6xl px-4 py-8 lg:py-10" aria-labelledby="categories-title">
        <FadeUp>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="brand-gradient block h-1 w-10 rounded-full" aria-hidden="true" />
              <h2 id="categories-title" className="mt-3 text-2xl font-extrabold tracking-tight lg:text-3xl">
                {t("home.categoriesTitle")} <span className="brand-gradient-text">{t("home.categoriesAccent")}</span>
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{t("home.categoriesSubtitle")}</p>
            </div>
            <Button
              variant="ghost"
              onClick={() => onNavigate("catalog", { catalogCat: "", catalogQuery: "" })}
              className="group min-h-[44px] gap-2 pr-1.5 font-semibold text-primary hover:text-primary"
            >
              {t("home.allCatalog")}
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/20 bg-primary/5 transition-colors duration-200 group-hover:border-primary group-hover:bg-primary group-hover:text-white motion-reduce:transition-none"
                aria-hidden="true"
              >
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
              </span>
            </Button>
          </div>
        </FadeUp>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-7">
          {categories.map((c, i) => {
            const Icon = categoryIcon(c.icon);
            const catName = localizeCategoryName(c.slug, c.name, lang);
            return (
              <FadeUp key={c.slug} delay={Math.min(i * 0.05, 0.3)} className="h-full">
                <button
                  type="button"
                  onClick={() => onNavigate("catalog", { catalogCat: c.slug })}
                  className="group flex h-full w-full min-h-[44px] flex-col rounded-2xl border border-border/80 bg-white p-3.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  aria-label={t("home.categoryAria", { name: catName, count: c.productCount })}
                >
                  <span
                    className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    aria-hidden="true"
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>

                  <span className="mt-3 block">
                    <CategoryArt slug={c.slug} icon={Icon} />
                  </span>

                  <span className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug tracking-tight">
                    {catName}
                  </span>

                  <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <span className="whitespace-nowrap rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {t("home.productCount", { count: c.productCount })}
                    </span>
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/70 bg-muted/50 text-muted-foreground transition-colors duration-200 group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none"
                      aria-hidden="true"
                    >
                      <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
                    </span>
                  </span>
                </button>
              </FadeUp>
            );
          })}
          {categories.length === 0
            ? Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-2xl" />
              ))
            : null}
        </div>
      </section>

      {/* ── Nouveautés ── */}
      <ProductRow
        id="nouveautes"
        title={t("home.newTitle")}
        subtitle={t("home.newSubtitle")}
        icon={Sparkles}
        items={newest}
        error={listError}
        popularityList={popularity?.products ?? null}
        onOpenProduct={onOpenProduct}
        onViewAll={() => onNavigate("catalog", { catalogCat: "", catalogQuery: "" })}
      />

      {/* ── Les plus consultés (classement réel par clics ; masqué sans mesure) ── */}
      {popular === null || popular.length > 0 ? (
        <ProductRow
          id="plus-consultes"
          title={t("home.popularTitle")}
          subtitle={
            popularIsMeasured
              ? t("home.popularSubtitleMeasured")
              : t("home.popularSubtitleDefault")
          }
          icon={Eye}
          items={popular}
          error={listError}
          popularityList={popularity?.products ?? null}
          onOpenProduct={onOpenProduct}
          onViewAll={() => onNavigate("catalog", { catalogCat: "", catalogQuery: "" })}
        />
      ) : null}

      {/* ── Bandeau « Comment ça marche » ── */}
      <section className="mx-auto max-w-6xl px-4 pb-10 lg:pb-14" aria-labelledby="transparence-title">
        <FadeUp>
          <div className="flex flex-col gap-3.5 rounded-2xl border border-primary/20 bg-white p-5 shadow-sm sm:flex-row sm:items-start lg:p-6">
            <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" aria-hidden="true">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 id="transparence-title" className="text-base font-bold">{t("home.howTitle")}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{disclosure}</p>
              <Button
                variant="link"
                onClick={() => onNavigate("legal:disclosure")}
                className="mt-1 h-auto min-h-[44px] justify-start p-0 text-primary"
              >
                {t("home.howLink")}
              </Button>
            </div>
          </div>
        </FadeUp>
      </section>
    </div>
  );
}

/* ─────────────── Rangée de produits (accueil) ─────────────── */

function ProductRow({
  id,
  title,
  subtitle,
  icon: Icon,
  items,
  error,
  popularityList = null,
  onOpenProduct,
  onViewAll,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  items: CatalogProduct[] | null;
  error: boolean;
  popularityList?: PopularityProduct[] | null;
  onOpenProduct: (slug: string) => void;
  onViewAll: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-6xl px-4 py-6 lg:py-8" aria-labelledby={`${id}-title`}>
      <FadeUp>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-primary shadow-sm" aria-hidden="true">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 id={`${id}-title`} className="text-xl font-bold tracking-tight lg:text-2xl">{title}</h2>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onViewAll} className="min-h-[44px] gap-1.5">
            {t("home.viewAll")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </FadeUp>

      {error ? (
        <div className="mt-6 rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">
            {t("home.rowError")}
          </p>
        </div>
      ) : items === null ? (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true" aria-label={t("home.rowLoadingAria", { title })}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-white p-8 text-center shadow-sm">
          <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm text-muted-foreground">{t("home.rowEmpty")}</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onOpen={onOpenProduct}
              popularity={popularityFor(popularityList, p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
