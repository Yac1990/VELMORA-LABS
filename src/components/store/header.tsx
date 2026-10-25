"use client";

/**
 * En-tête de la boutique publique : logo, marque (paramètres publics), recherche
 * (ouvre le catalogue avec q), menu catégories (dropdown desktop / sheet mobile),
 * liens FAQ / Contact / À propos et bouton icône discret d'accès administrateur.
 */
import { useState } from "react";
import type { CategoryInfo, NavigateFn, StoreSettings, StoreView } from "./store-app";
import { categoryIcon } from "./catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Menu, Search, UserCog } from "lucide-react";

const MAIN_LINKS: { view: StoreView; label: string; opts?: Parameters<NavigateFn>[1] }[] = [
  { view: "catalog", label: "Catalogue", opts: { catalogCat: "", catalogQuery: "" } },
  { view: "faq", label: "FAQ" },
  { view: "contact", label: "Contact" },
  { view: "legal:about", label: "À propos" },
];

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
  const brandName = settings?.brandName || "VELMORA LABS";
  const logo = settings?.brandLogo || "/velmora-logo.png";

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

  return (
    <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1.5 px-4">
        {/* Menu mobile */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu de la boutique"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>

        {/* Marque */}
        <button
          type="button"
          onClick={() => go("home")}
          className="flex min-h-[44px] items-center gap-2.5 rounded-lg px-1"
          aria-label={`${brandName} — retour à l'accueil`}
        >
          <img src={logo} alt={`Logo ${brandName}`} className="h-9 w-9 rounded-lg object-cover shadow-sm" suppressHydrationWarning />
          <span className="flex flex-col items-start leading-tight">
            <span className="brand-gradient-text whitespace-nowrap text-sm font-bold sm:text-base">{brandName}</span>
            {settings?.brandTagline ? (
              <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground sm:block">{settings.brandTagline}</span>
            ) : null}
          </span>
        </button>

        {/* Liens principaux (desktop) */}
        <nav className="ml-3 hidden items-center gap-0.5 md:flex" aria-label="Navigation principale">
          {MAIN_LINKS.map((l) => (
            <button key={l.view} type="button" onClick={() => go(l.view, l.opts)} className={linkClass(l.view)} aria-current={current === l.view ? "page" : undefined}>
              {l.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Recherche (desktop) */}
          <form onSubmit={submitSearch} role="search" className="hidden w-60 lg:block xl:w-72">
            <div className="relative">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher un produit…"
                aria-label="Rechercher un produit"
                className="h-10 rounded-full pr-11"
              />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Lancer la recherche"
                className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>

          {/* Catégories (desktop) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="hidden min-h-[44px] gap-1.5 rounded-full md:inline-flex">
                Catégories
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 thin-scrollbar max-h-[70vh] overflow-y-auto">
              <DropdownMenuLabel>Explorer par catégorie</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {categories.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">Aucune catégorie disponible pour le moment.</p>
              ) : (
                categories.map((c) => {
                  const Icon = categoryIcon(c.icon);
                  return (
                    <DropdownMenuItem
                      key={c.slug}
                      onClick={() => go("catalog", { catalogCat: c.slug })}
                      className="cursor-pointer gap-2.5 py-2.5"
                      aria-label={`Voir la catégorie ${c.name} — ${c.productCount} produit(s)`}
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

          {/* Espace administrateur — bouton icône seul (libellé conservé pour lecteurs d'écran + infobulle) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenAdmin}
            aria-label="Ouvrir l'espace administrateur (back-office)"
            title="Espace administrateur"
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
            <SheetTitle className="flex items-center gap-2.5">
              <img src={logo} alt={`Logo ${brandName}`} className="h-9 w-9 rounded-lg object-cover" suppressHydrationWarning />
              <span className="brand-gradient-text font-bold">{brandName}</span>
            </SheetTitle>
            {settings?.brandTagline ? (
              <SheetDescription className="text-xs">{settings.brandTagline}</SheetDescription>
            ) : null}
          </SheetHeader>

          <div className="space-y-6 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <form onSubmit={submitSearch} role="search" className="flex gap-2">
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher…"
                aria-label="Rechercher un produit"
                className="h-11"
              />
              <Button type="submit" size="icon" aria-label="Lancer la recherche" className="h-11 w-11 shrink-0">
                <Search className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>

            <nav aria-label="Navigation mobile" className="space-y-1">
              <button type="button" onClick={() => go("home")} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${current === "home" ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`} aria-current={current === "home" ? "page" : undefined}>
                Accueil
              </button>
              {MAIN_LINKS.map((l) => (
                <button key={l.view} type="button" onClick={() => go(l.view, l.opts)} className={`w-full rounded-lg px-3 py-2.5 text-left text-sm ${current === l.view ? "bg-primary/10 font-semibold text-primary" : "hover:bg-muted"}`} aria-current={current === l.view ? "page" : undefined}>
                  {l.label}
                </button>
              ))}
            </nav>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Catégories</p>
              {categories.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">Aucune catégorie disponible.</p>
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
                        aria-label={`Voir la catégorie ${c.name} — ${c.productCount} produit(s)`}
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
              Espace administrateur
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
