"use client";

/**
 * Boutique publique VELMORA LABS — coque SPA à vues internes.
 * Vues : accueil, catalogue, fiche produit, FAQ, contact et pages légales.
 * La navigation est un état React ; le hash optionnel #/store?cat=…&q=…&p=…
 * est lu au montage (liens directs) puis réécrit par remplacement (sans historique).
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { StoreHeader } from "./header";
import { StoreFooter } from "./footer";
import { LandingView } from "./landing";
import { CatalogView } from "./catalog";
import { ProductDetailView } from "./product-detail";
import { LegalPage, type LegalKind } from "./legal";
import { FaqView, ContactView } from "./contact-view";

/* ─────────────── Types partagés (formes exactes des API publiques) ─────────────── */

export type StoreView =
  | "home" | "catalog" | "product" | "faq" | "contact"
  | "legal:privacy" | "legal:terms" | "legal:disclosure" | "legal:cookies" | "legal:about";

/** GET /api/public/settings */
export interface StoreSettings {
  brandName: string;
  brandTagline: string;
  brandLogo: string;
  referenceCurrency: string;
  displayCurrencies: string[];
  targetCountries: string[];
  defaultLanguage: string;
  timezone: string;
  demoNotice: string;
  outboundNotice: string;
}

/** GET /api/public/categories */
export interface CategoryInfo {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  productCount: number;
}

/** Item de GET /api/public/catalog */
export interface CatalogProduct {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  productType: string;
  category: { slug: string; name: string } | null;
  image: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  priceNote: string | null;
  allowInquiry: boolean;
  isDemo: boolean;
  updatedAt: string;
  partnerCount: number;
  partnerName: string | null;
  availability: string;
}

/** Réponse GET /api/public/catalog */
export interface CatalogResponse {
  items: CatalogProduct[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
}

/** GET /api/public/products/[slug] — offre d'un vendeur */
export interface ProductOfferData {
  id: string;
  partnerName: string;
  partnerIsDemo: boolean;
  programType: string;
  priceCents: number | null;
  currency: string;
  availability: string;
  lastSyncedAt: string | null;
  urlCheckStatus: string | null;
  commission: {
    ruleType: string; // percentage | fixed | unknown
    rate?: number | null;
    fixedAmountCents?: number | null;
    currency?: string;
    termsUrl?: string | null;
    note?: string;
  };
}

/** Réponse GET /api/public/products/[slug] */
export interface ProductDetailData {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  description: string;
  status: string;
  productType: string;
  language: string;
  countries: string[];
  features: { label: string; value: string }[];
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  priceNote: string | null;
  allowInquiry: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  category: { slug: string; name: string } | null;
  media: { url: string; altText: string | null }[];
  offers: ProductOfferData[];
}

/** Graine de filtres transmise au catalogue depuis l'extérieur (menu, recherche, hash). */
export interface CatalogSeed {
  cat: string | null;
  q: string | null;
  ts: number;
}

export interface NavigationOptions {
  productSlug?: string;
  catalogCat?: string;
  catalogQuery?: string;
}
export type NavigateFn = (view: StoreView, options?: NavigationOptions) => void;

/* ─────────────── Hash optionnel : #/store?cat=…&q=…&p=… ─────────────── */

function parseStoreHash(): { view: StoreView; productSlug: string | null; cat: string | null; q: string | null } {
  const fallback = { view: "home" as StoreView, productSlug: null, cat: null, q: null };
  if (typeof window === "undefined") return fallback;
  const hash = window.location.hash;
  if (!hash.startsWith("#/store")) return fallback;
  const params = new URLSearchParams(hash.slice("#/store".length).replace(/^\?/, ""));
  const slug = params.get("p");
  const cat = params.get("cat");
  const q = params.get("q");
  if (slug) return { view: "product", productSlug: slug, cat, q };
  if (cat || q) return { view: "catalog", productSlug: null, cat, q };
  return { view: "home", productSlug: null, cat, q };
}

/* ─────────────── Racine ─────────────── */

export function StoreApp({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const [view, setView] = useState<StoreView>("home");
  const [productSlug, setProductSlug] = useState<string | null>(null);
  const [catalogSeed, setCatalogSeed] = useState<CatalogSeed>({ cat: null, q: null, ts: 0 });
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");

  const loadBase = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        apiGet<StoreSettings>("/api/public/settings"),
        // Les catégories ne doivent pas bloquer la boutique en cas d'échec.
        apiGet<{ items: CategoryInfo[] }>("/api/public/categories").catch(() => ({ items: [] as CategoryInfo[] })),
      ]);
      setSettings(s);
      setCategories(c.items);
      setBootState("ready");
    } catch {
      setBootState("error");
    }
  }, []);

  /** Nouvelle tentative déclenchée par l'utilisateur (événement, pas un effet). */
  const retryLoadBase = useCallback(() => {
    setBootState("loading");
    loadBase();
  }, [loadBase]);

  // Chargement initial des paramètres publics et des catégories.
  // Modèle standard de fetch au montage : tous les setState de loadBase s'exécutent
  // après résolution des promesses (jamais synchrone dans le corps de l'effet).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadBase(); }, [loadBase]);

  const navigate = useCallback<NavigateFn>((next, opts) => {
    if (next === "product") setProductSlug(opts?.productSlug ?? null);
    if (opts?.catalogCat !== undefined || opts?.catalogQuery !== undefined) {
      setCatalogSeed({ cat: opts?.catalogCat ?? null, q: opts?.catalogQuery ?? null, ts: Date.now() });
    }
    setView(next);
    window.scrollTo({ top: 0 });
    // Synchronisation du hash (remplacement, sans entrée d'historique) : #/store?cat=…&q=…&p=…
    const params = new URLSearchParams();
    if (next === "product" && opts?.productSlug) params.set("p", opts.productSlug);
    if (next === "catalog") {
      if (opts?.catalogCat) params.set("cat", opts.catalogCat);
      if (opts?.catalogQuery) params.set("q", opts.catalogQuery);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `#/store?${qs}` : "#/store");
  }, []);

  // Liens directs : #/store?cat=…&q=… ou #/store?p=… — adoptés après hydratation
  // (lecture du hash = système externe ; les setStates passent par un setTimeout pour
  // éviter tout setState synchrone dans le corps de l'effet et tout écart SSR/client).
  useEffect(() => {
    const parsed = parseStoreHash();
    if (parsed.view === "home") return;
    const t = window.setTimeout(() => {
      if (parsed.view === "product" && parsed.productSlug) {
        setProductSlug(parsed.productSlug);
        setView("product");
      } else if (parsed.view === "catalog") {
        setCatalogSeed({ cat: parsed.cat, q: parsed.q, ts: Date.now() });
        setView("catalog");
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const openProduct = useCallback(
    (slug: string) => navigate("product", { productSlug: slug }),
    [navigate]
  );

  return (
    <div className="flex min-h-screen flex-col bg-zinc-100">
      {/* Bandeau fin de démonstration (transparence — jamais masquable) */}
      {settings?.demoNotice ? (
        <div role="status" className="border-b border-amber-200 bg-amber-50 text-amber-900">
          <p className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-1.5 text-xs leading-snug sm:items-center">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" aria-hidden="true" />
            <span>{settings.demoNotice}</span>
          </p>
        </div>
      ) : null}

      <StoreHeader
        settings={settings}
        categories={categories}
        current={view}
        onNavigate={navigate}
        onOpenAdmin={onOpenAdmin}
      />

      <main className="flex-1">
        {bootState === "loading" ? <BootSkeleton /> : null}
        {bootState === "error" ? <BootError onRetry={retryLoadBase} /> : null}
        {bootState === "ready" && settings ? (
          <>
            {view === "home" ? (
              <LandingView
                settings={settings}
                categories={categories}
                onNavigate={navigate}
                onOpenProduct={openProduct}
              />
            ) : null}
            {view === "catalog" ? (
              <CatalogView
                categories={categories}
                seed={catalogSeed}
                currency={settings.referenceCurrency}
                onOpenProduct={openProduct}
              />
            ) : null}
            {view === "product" ? (
              productSlug ? (
                <ProductDetailView slug={productSlug} settings={settings} onNavigate={navigate} />
              ) : (
                <CatalogView
                  categories={categories}
                  seed={catalogSeed}
                  currency={settings.referenceCurrency}
                  onOpenProduct={openProduct}
                />
              )
            ) : null}
            {view === "faq" ? <FaqView onNavigate={navigate} /> : null}
            {view === "contact" ? <ContactView onNavigate={navigate} /> : null}
            {view.startsWith("legal:") ? (
              <LegalPage kind={view.slice("legal:".length) as LegalKind} />
            ) : null}
          </>
        ) : null}
      </main>

      <StoreFooter settings={settings} onNavigate={navigate} />
    </div>
  );
}

/* ─────────────── États de démarrage ─────────────── */

function BootSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 lg:py-14" aria-busy="true" aria-label="Chargement de la boutique">
      <div className="mx-auto max-w-2xl space-y-3 text-center">
        <Skeleton className="mx-auto h-6 w-52 rounded-full" />
        <Skeleton className="mx-auto h-12 w-full max-w-xl" />
        <Skeleton className="mx-auto h-5 w-3/4" />
        <Skeleton className="mx-auto h-11 w-full max-w-md rounded-full" />
      </div>
      <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function BootError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 lg:py-24">
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-bold">Impossible de charger la boutique</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Les paramètres du site n'ont pas pu être récupérés. Vérifiez votre connexion, puis réessayez.
        </p>
        <Button onClick={onRetry} className="mt-5 gap-2 min-h-[44px]">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </Button>
      </div>
    </div>
  );
}
