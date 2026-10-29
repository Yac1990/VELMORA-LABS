"use client";

/**
 * En-tête de la boutique publique : logo, marque (paramètres publics), recherche
 * (ouvre le catalogue avec q), menu catégories (dropdown desktop / sheet mobile),
 * liens FAQ / Contact / À propos, sélecteur de langue en menu déroulant à drapeaux
 * (Task 42 — FR 🇫🇷 / EN 🇬🇧, remplace le contrôle segmenté de la Task 37-c) et
 * bouton icône discret d'accès administrateur.
 */
import { useState } from "react";
import type { ComponentType } from "react";
import type { CategoryInfo, NavigateFn, StoreSettings, StoreView } from "./store-app";
import { categoryIcon } from "./catalog";
import { useI18n, seedAware, SEED_DEFAULTS } from "./i18n";
import { FlagFR, FlagGB } from "./flags";
import type { Lang } from "@/store/lang";
import { NotificationBell } from "./notification-bell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Menu, Search, UserCog } from "lucide-react";

/* ─────────────── Sélecteur de langue (Task 42) ─────────────── */

interface LangOption {
  code: Lang;
  Flag: ComponentType<{ className?: string }>;
  labelKey: string;
}

/** Deux langues disponibles — drapeau SVG + libellé natif (« Français », « English »). */
const LANG_OPTIONS: LangOption[] = [
  { code: "fr", Flag: FlagFR, labelKey: "lang.fr" },
  { code: "en", Flag: FlagGB, labelKey: "lang.en" },
];

/**
 * Menu déroulant compact à drapeaux (Task 42) : le déclencheur affiche la langue
 * courante (drapeau + code), le menu liste chaque langue avec son drapeau, son
 * nom natif et une coche sur l'option active. La bascule est instantanée (état
 * zustand persisté « velmora-lang ») — TOUTES les sections de la boutique se
 * re-rendent automatiquement (elles lisent la langue via useI18n()/useLang()).
 * Cible tactile ≥ 44 px ; fermeture au clic extérieur / Échap (Radix).
 */
function LangSwitcher() {
  const { lang, setLang, t } = useI18n();
  const active = LANG_OPTIONS.find((o) => o.code === lang) ?? LANG_OPTIONS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label={t("lang.aria")}
          title={t("lang.label")}
          className="h-11 gap-2 rounded-full px-3.5 text-xs font-semibold"
        >
          <active.Flag />
          <span className="tracking-wide">{active.code.toUpperCase()}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("lang.label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANG_OPTIONS.map(({ code, Flag, labelKey }) => (
          <DropdownMenuItem
            key={code}
            aria-pressed={lang === code}
            aria-label={t(labelKey)}
            className="cursor-pointer gap-2.5 py-2.5"
            onSelect={() => setLang(code)}
          >
            <Flag />
            <span className="flex-1 text-sm">{t(labelKey)}</span>
            {lang === code ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StoreHeader({
  settings,
  categories,
  current,
  onNavigate,
  onOpenAdmin,
}: {
  settings: StoreSettings | null;
  categories: CategoryInfo[];
  current: StoreView;
  onNavigate: NavigateFn;
  onOpenAdmin: () => void;
}) {
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useI18n();
  const brandName = settings?.brandName || "VELMORA LABS";
  const logo = settings?.brandLogo || "/velmora-logo.png";
  /* Tagline seed-aware (Task 42) : suit la langue tant que l'admin ne l'a pas personnalisée. */
  const tagline = settings
    ? seedAware(settings.brandTagline, SEED_DEFAULTS.tagline, "home.titleFallback", t)
    : "";

  /* Liens principaux — libellés traduits (la vue reste la clé stable). */
  const mainLinks: { view: StoreView; label: string; opts?: Parameters<NavigateFn>[1] }[] = [
    { view: "catalog", label: t("nav.catalogue"), opts: { catalogCat: "", catalogQuery: "" } },
    { view: "faq", label: t("nav.faq") },
    { view: "contact", label: t("nav.contact") },
    { view: "legal:about", label: t("nav.about") },
  ];

  const go = (v: StoreView, opts?: Parameters<NavigateFn>[1]) => {
    setMenuOpen(false);
    onNavigate(v, opts);
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    go("catalog", { catalogQuery: query || undefined });
  };

  const linkClass = (v: StoreView) =>
    `inline-flex min-h-[44px] items-center rounded-full px-3 py-2 text-sm transition-colors ${
      current === v ? "bg-primary/10 font-semibold text-primary" : "text-foreground/75 hover:bg-muted hover:text-foreground"
    }`;

  // Task 35-bis : fond PLEIN sans backdrop-blur — le filtre d'arrière-plan corrompt
  // les textures GPU sur certains téléphones Android (neige à l'écran) et coûte
  // cher à recomposer à chaque frame de défilement. Rendu quasi identique.
  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1.5 px-4">
        {/* Menu mobile — visible JUSQU'À xl (Task 40 : à md, liens desktop + langue +
            catégories + cloche + admin débordaient de 112 px à 768 px ; le sheet
            contient déjà tout : liens, recherche, catégories, langue, admin). */}
        <Button
          variant="ghost"
          size="icon"
          className="xl:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label={t("header.openMenuAria")}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>

        {/* Marque */}
        {/* suppressHydrationWarning : parent direct d'une <img> marquée par l'outillage
            de prévisualisation avant hydratation (Task 36) — attributs étrangers ignorés. */}
        <button
          type="button"
          onClick={() => go("home")}
          className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1"
          aria-label={t("header.brandHomeAria", { brand: brandName })}
          suppressHydrationWarning
        >
          <img src={logo} alt={t("header.logoAlt", { brand: brandName })} className="h-9 w-9 rounded-lg object-cover shadow-sm" suppressHydrationWarning />
          <span className="flex flex-col items-start leading-tight">
            <span className="brand-gradient-text whitespace-nowrap text-sm font-bold sm:text-base">{brandName}</span>
            {tagline ? (
              <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground sm:block">{tagline}</span>
            ) : null}
          </span>
        </button>

        {/* Liens principaux (desktop large ≥ xl — Task 40 : md débordait sur tablette) */}
        <nav className="ml-3 hidden items-center gap-0.5 xl:flex" aria-label={t("nav.mainAria")}>
          {mainLinks.map((l) => (
            <button key={l.view} type="button" onClick={() => go(l.view, l.opts)} className={linkClass(l.view)} aria-current={current === l.view ? "page" : undefined}>
              {l.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Recherche (desktop large ≥ xl — Task 40 : la version lg débordait à 1024) */}
          <form onSubmit={submitSearch} role="search" className="hidden w-64 xl:block 2xl:w-72">
            <div className="relative">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("header.searchPlaceholder")}
                aria-label={t("header.searchAria")}
                className="h-10 rounded-full pr-11"
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label={t("header.searchSubmitAria")}
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>

          {/* Langue — menu déroulant à drapeaux (desktop, à côté de la recherche) */}
          <div className="hidden md:inline-flex">
            <LangSwitcher />
          </div>

          {/* Catégories (desktop) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden min-h-[44px] gap-1.5 rounded-full md:inline-flex">
                {t("header.categories")}
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 thin-scrollbar max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel>{t("header.categoriesAria")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {categories.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">{t("header.categoriesEmpty")}</p>
              ) : (
                categories.map((c) => {
                  const Icon = categoryIcon(c.icon);
                  return (
                    <DropdownMenuItem
                      key={c.slug}
                      onClick={() => go("catalog", { catalogCat: c.slug })}
                      className="cursor-pointer gap-2.5 py-2.5"
                      aria-label={t("header.categoryItemAria", { name: c.name, count: c.productCount })}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="flex-1 truncate">{c.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{c.productCount}</Badge>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Task 37-d — cloche de nouveautés produits (nouveaux produits + alerte en direct) */}
          <NotificationBell />

          {/* Espace administrateur — bouton icône seul (libellé conservé pour lecteurs d'écran + infobulle) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAdmin}
            aria-label={t("header.adminAria")}
            title={t("header.adminTitle")}
            className="min-h-[44px] min-w-[44px] rounded-full p-2.5 text-muted-foreground hover:text-foreground"
          >
            <UserCog className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Menu mobile (sheet) */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-80 overflow-y-auto p-0 thin-scrollbar">
          <SheetHeader className="border-b p-4 text-left">
            <SheetTitle className="flex items-center gap-2.5" suppressHydrationWarning>
              <img src={logo} alt={t("header.logoAlt", { brand: brandName })} className="h-9 w-9 rounded-lg object-cover" suppressHydrationWarning />
              <span className="brand-gradient-text font-bold">{brandName}</span>
            </SheetTitle>
            {tagline ? (
              <SheetDescription className="text-xs">{tagline}</SheetDescription>
            ) : null}
          </SheetHeader>

          <div className="space-y-6 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            {/* Langue (Task 42) — menu déroulant à drapeaux, rangée dédiée en haut du sheet */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("lang.label")}
              </span>
              <LangSwitcher />
            </div>

            <form onSubmit={submitSearch} role="search" className="flex gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("header.searchPlaceholderShort")}
                aria-label={t("header.searchAria")}
                className="h-11"
              />
              <Button type="submit" size="icon" aria-label={t("header.searchSubmitAria")} className="h-11 w-11 shrink-0">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>

            <nav aria-label={t("nav.mobileAria")} className="space-y-1">
              <button type="button" onClick={() => go("home")} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${current === "home" ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`} aria-current={current === "home" ? "page" : undefined}>
                {t("nav.home")}
              </button>
              {mainLinks.map((l) => (
                <button key={l.view} type="button" onClick={() => go(l.view, l.opts)} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${current === l.view ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`} aria-current={current === l.view ? "page" : undefined}>
                  {l.label}
                </button>
              ))}
            </nav>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t("header.categories")}</p>
              {categories.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">{t("header.categoriesEmptyShort")}</p>
              ) : (
                <div className="space-y-1">
                  {categories.map((c) => {
                    const Icon = categoryIcon(c.icon);
                    return (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => go("catalog", { catalogCat: c.slug })}
                        className="flex w-full min-h-[44px] items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                        aria-label={t("header.categoryItemAria", { name: c.name, count: c.productCount })}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="flex-1 truncate">{c.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{c.productCount}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full gap-2 min-h-[44px]"
              onClick={() => { setMenuOpen(false); onOpenAdmin(); }}
            >
              <UserCog className="h-4 w-4" aria-hidden="true" />
              {t("header.adminButton")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
