"use client";

/**
 * Catalogue public VELMORA LABS + briques de carte produit partagées avec l'accueil.
 * Filtres : recherche, catégorie, type, tri — pagination Précédent/Suivant + pages.
 * Les filtres sont synchronisés (optionnel) avec le hash #/store?cat=…&q=… via replaceState.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, formatPriceRange } from "@/lib/client";
import type { CatalogProduct, CatalogResponse, CategoryInfo, CatalogSeed } from "./store-app";
import { popularityFor, usePopularity, type PopularityProduct } from "./popularity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Building2, Car, ChevronLeft, ChevronRight, Cpu, FileText, GraduationCap, Lamp,
  Package, PackageSearch, RefreshCw, RotateCcw, Search, Star, TriangleAlert,
} from "lucide-react";

/* ─────────────── Étiquettes & helpers partagés ─────────────── */

export const PRODUCT_TYPES: { value: string; label: string }[] = [
  { value: "digital", label: "Produits numériques" },
  { value: "training", label: "Formations" },
  { value: "subscription", label: "Abonnements & SaaS" },
  { value: "home", label: "Maison" },
  { value: "electronics", label: "Électronique" },
  { value: "real_estate", label: "Immobilier" },
  { value: "vehicle", label: "Véhicules" },
  { value: "other", label: "Autres" },
];

export function productTypeLabel(value: string): string {
  return PRODUCT_TYPES.find((t) => t.value === value)?.label || "Produit";
}

/** Libellés de disponibilité — formulations claires pour le visiteur. */
export function availabilityLabel(availability: string): string {
  if (availability === "in_stock") return "En stock (selon le vendeur)";
  if (availability === "out_of_stock") return "Rupture signalée";
  return "Disponibilité à vérifier sur le site du vendeur";
}

export function availabilityBadgeClass(availability: string): string {
  if (availability === "in_stock") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (availability === "out_of_stock") return "border-red-300 bg-red-50 text-red-700";
  return "border-zinc-300 bg-zinc-50 text-zinc-600";
}

/** Icônes lucide mappées depuis le champ `icon` des catégories (fallback : Package). */
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, GraduationCap, RefreshCw, Lamp, Cpu, Building2, Car,
};

export function categoryIcon(icon: string | null | undefined): React.ComponentType<{ className?: string }> {
  return (icon && CATEGORY_ICONS[icon]) || Package;
}

/* ─────────────── Image produit avec repli sur dégradé de marque ─────────────── */

export function ProductImage({
  src, alt, className, iconClassName = "h-9 w-9",
}: {
  src: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`brand-gradient flex items-center justify-center ${className ?? ""}`} aria-hidden="true">
        <Package className={`${iconClassName} text-white/85`} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      /* Attributs externes (marquage d'images du panneau de prévisualisation) ignorés. */
      suppressHydrationWarning
    />
  );
}

/* ─────────────── Étoiles de popularité (clics réels, jamais des avis) ─────────────── */

/**
 * Étoiles mesurant l'intérêt des visiteurs : clics sortants enregistrés sur 30 jours.
 * Échelle relative côté serveur (le plus cliqué = 5). Aucun clic → aucune étoile.
 * Ce composant n'est PAS un système d'avis : le libellé accessible le précise.
 */
export function PopularityStars({
  popularity,
  size = "sm",
}: {
  popularity: PopularityProduct | null;
  size?: "sm" | "md";
}) {
  if (!popularity || popularity.clicks30d <= 0) return null;
  const starCls = size === "md" ? "h-4 w-4" : "h-3 w-3";
  const label = `Popularité : ${popularity.stars} sur 5, mesurée par ${popularity.clicks30d} clic${popularity.clicks30d > 1 ? "s" : ""} sortant${popularity.clicks30d > 1 ? "s" : ""} vers les offres sur 30 jours. Ce ne sont ni des notes d'acheteurs ni des ventes.`;
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={label}>
      <span className="flex" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`${starCls} ${i < popularity.stars ? "fill-amber-400 text-amber-400" : "fill-zinc-200 text-zinc-300"}`}
          />
        ))}
      </span>
      <span className={`tabular-nums text-muted-foreground ${size === "md" ? "text-xs" : "text-[11px]"}`}>
        {popularity.clicks30d.toLocaleString("fr-FR")} clic{popularity.clicks30d > 1 ? "s" : ""} · 30 j
      </span>
    </span>
  );
}

/* ─────────────── Carte produit (catalogue + accueil) ─────────────── */

export function ProductCard({
  product,
  onOpen,
  popularity = null,
}: {
  product: CatalogProduct;
  onOpen: (slug: string) => void;
  popularity?: PopularityProduct | null;
}) {
  const price = formatPriceRange(product.priceMinCents, product.priceMaxCents, product.currency, product.priceNote);
  const partnerLabel = product.partnerName
    ? product.partnerName
    : product.partnerCount > 1
      ? `${product.partnerCount} offres disponibles`
      : "Offre à venir";
  return (
    <button
      type="button"
      onClick={() => onOpen(product.slug)}
      className="group flex w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Voir la fiche produit : ${product.title}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        <ProductImage
          src={product.image}
          alt={`Illustration — ${product.title}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        {product.isDemo ? (
          <span className="absolute left-2 top-2">
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {product.category?.name || productTypeLabel(product.productType)}
        </p>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{product.title}</h3>
        {product.shortDescription ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{product.shortDescription}</p>
        ) : null}
        <PopularityStars popularity={popularity} />
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-sm font-bold">{price}</span>
          <span className="max-w-[45%] truncate text-right text-[11px] text-muted-foreground">{partnerLabel}</span>
        </div>
      </div>
    </button>
  );
}

/* ─────────────── Vue catalogue ─────────────── */

const PER_PAGE = 12;

export function CatalogView({
  categories,
  seed,
  currency,
  onOpenProduct,
}: {
  categories: CategoryInfo[];
  seed: CatalogSeed;
  currency: string;
  onOpenProduct: (slug: string) => void;
}) {
  const [qInput, setQInput] = useState(seed.q ?? "");
  const [appliedQ, setAppliedQ] = useState(seed.q ?? "");
  const [cat, setCat] = useState(seed.cat ?? "all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(
    async (opts: { cat: string; type: string; sort: string; page: number; q: string }) => {
      const id = ++requestRef.current;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (opts.q) params.set("q", opts.q);
        if (opts.cat && opts.cat !== "all") params.set("category", opts.cat);
        if (opts.type && opts.type !== "all") params.set("type", opts.type);
        params.set("sort", opts.sort);
        params.set("page", String(opts.page));
        params.set("perPage", String(PER_PAGE));
        const res = await apiGet<CatalogResponse>(`/api/public/catalog?${params.toString()}`);
        if (requestRef.current === id) setData(res);
      } catch (e) {
        if (requestRef.current === id) {
          setError(e instanceof Error ? e.message : "Erreur de chargement du catalogue");
        }
      } finally {
        if (requestRef.current === id) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load({ cat, type, sort, page, q: appliedQ });
  }, [load, cat, type, sort, page, appliedQ]);

  // Filtres reçus de l'extérieur (menu catégories, recherche d'en-tête, hash).
  // Valeur "" (chaîne vide) = réinitialisation explicite vers « toutes les catégories ».
  useEffect(() => {
    setCat(seed.cat ? seed.cat : "all");
    setQInput(seed.q ?? "");
    setAppliedQ(seed.q ?? "");
    setPage(1);
  }, [seed]);

  // Synchronisation optionnelle du hash : #/store?cat=…&q=…
  useEffect(() => {
    const params = new URLSearchParams();
    if (cat !== "all") params.set("cat", cat);
    if (appliedQ) params.set("q", appliedQ);
    const qs = params.toString();
    const hash = qs ? `#/store?${qs}` : "#/store";
    if (typeof window !== "undefined" && window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }, [cat, appliedQ]);

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQ(qInput.trim());
    setPage(1);
  };

  const resetFilters = () => {
    setQInput("");
    setAppliedQ("");
    setCat("all");
    setType("all");
    setSort("recent");
    setPage(1);
  };

  const items = data?.items ?? [];
  const pages = Math.max(1, data?.pages ?? 1);
  const total = data?.total ?? 0;
  const pageNumbers = pages <= 9 ? Array.from({ length: pages }, (_, i) => i + 1) : [];
  const activeCategory = categories.find((c) => c.slug === cat);
  const { data: popularity } = usePopularity();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {activeCategory ? activeCategory.name : "Catalogue"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {activeCategory?.description ||
            "Parcourez les produits et offres de notre sélection multi-catégories. L'achat s'effectue sur le site du vendeur, en un clic."}
        </p>
      </header>

      {/* Filtres */}
      <form
        onSubmit={applySearch}
        role="search"
        aria-label="Filtres du catalogue"
        className="grid gap-3 rounded-2xl border bg-white p-4 shadow-sm md:grid-cols-[1fr_180px_170px_170px]"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Rechercher un produit…"
            aria-label="Rechercher dans le catalogue"
            className="h-11 pl-9"
          />
        </div>
        <Select value={cat} onValueChange={(v) => { setCat(v); setPage(1); }}>
          <SelectTrigger className="h-11 w-full" aria-label="Filtrer par catégorie">
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent className="max-h-72 thin-scrollbar">
            <SelectItem value="all">Toutes les catégories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.name} ({c.productCount})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="h-11 w-full" aria-label="Filtrer par type de produit">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {PRODUCT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
          <SelectTrigger className="h-11 w-full" aria-label="Trier les résultats">
            <SelectValue placeholder="Tri" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Plus récents</SelectItem>
            <SelectItem value="price_asc">Prix croissant</SelectItem>
            <SelectItem value="price_desc">Prix décroissant</SelectItem>
          </SelectContent>
        </Select>
      </form>

      {/* Compteur */}
      {!loading && !error ? (
        <p className="mt-4 text-xs text-muted-foreground" role="status">
          {total} produit{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}
          {appliedQ ? ` pour « ${appliedQ} »` : ""}
        </p>
      ) : null}
      {!loading && !error && popularity && popularity.products.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          ★ = intérêt des visiteurs mesuré par les clics sortants vers les offres (30 derniers jours) —
          ni des avis d'acheteurs ni des ventes.
        </p>
      ) : null}

      {/* Résultats */}
      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Chargement des produits">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border bg-white p-10 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold">Le catalogue n'a pas pu être chargé</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            onClick={() => load({ cat, type, sort, page, q: appliedQ })}
            className="mt-5 gap-2 min-h-[44px]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-2xl border bg-white p-10 text-center shadow-sm">
          <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold">Aucun produit ne correspond à votre recherche</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Essayez d'élargir vos filtres ou de réinitialiser la recherche.
          </p>
          <Button variant="outline" onClick={resetFilters} className="mt-5 min-h-[44px]">
            Réinitialiser les filtres
          </Button>
        </div>
      ) : (
        <div className={`mt-4 grid grid-cols-2 gap-4 transition-opacity lg:grid-cols-3 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onOpen={onOpenProduct}
              popularity={popularityFor(popularity?.products, p.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && items.length > 0 && pages > 1 ? (
        <nav className="mt-8 flex flex-col items-center gap-2" aria-label="Pagination du catalogue">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => { setPage((p) => Math.max(1, p - 1)); window.scrollTo({ top: 0 }); }}
              className="min-h-[44px] gap-1"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédent
            </Button>
            {pageNumbers.map((n) => (
              <Button
                key={n}
                variant={n === page ? "default" : "outline"}
                size="icon"
                onClick={() => { setPage(n); window.scrollTo({ top: 0 }); }}
                className="min-h-[44px] min-w-[44px]"
                aria-label={`Aller à la page ${n}`}
                aria-current={n === page ? "page" : undefined}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => { setPage((p) => Math.min(pages, p + 1)); window.scrollTo({ top: 0 }); }}
              className="min-h-[44px] gap-1"
            >
              Suivant <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Page {page} sur {pages} — devise de référence : {currency}
          </p>
        </nav>
      ) : null}
    </div>
  );
}
