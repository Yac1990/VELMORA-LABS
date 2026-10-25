"use client";

/**
 * Pied de page VELMORA LABS — collé en bas (le parent gère min-h-screen flex flex-col).
 * Liens légaux, message « Comment ça marche », © année dynamique, safe-area iOS.
 */
import type { NavigateFn, StoreSettings, StoreView } from "./store-app";
import { LogoMarquee } from "./logo-marquee";

const LEGAL_LINKS: { view: StoreView; label: string }[] = [
  { view: "legal:privacy", label: "Politique de confidentialité" },
  { view: "legal:terms", label: "Conditions d'utilisation" },
  { view: "legal:disclosure", label: "Fonctionnement de la plateforme" },
  { view: "legal:cookies", label: "Politique cookies" },
];

const SITE_LINKS: { view: StoreView; label: string; opts?: Parameters<NavigateFn>[1] }[] = [
  { view: "home", label: "Accueil" },
  { view: "catalog", label: "Catalogue", opts: { catalogCat: "", catalogQuery: "" } },
  { view: "faq", label: "FAQ" },
  { view: "contact", label: "Contact" },
  { view: "legal:about", label: "À propos" },
];

export function StoreFooter({
  settings,
  onNavigate,
}: {
  settings: StoreSettings | null;
  onNavigate: NavigateFn;
}) {
  const year = new Date().getFullYear();
  const brandName = settings?.brandName || "VELMORA LABS";
  const logo = settings?.brandLogo || "/velmora-logo.png";
  const disclosure =
    settings?.outboundNotice ||
    "VELMORA LABS regroupe des produits de plusieurs vendeurs. Lorsque vous cliquez sur « Voir l'offre », vous êtes redirigé vers le site du vendeur, où l'achat s'effectue. L'achat ne se fait jamais sur VELMORA LABS.";

  const linkClass =
    "inline-flex min-h-[44px] items-center py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <footer className="mt-auto border-t bg-white">
      {/* Task 19 — deux bandes de logos défilants (sens opposés), ajout isolé sans titre ni texte. */}
      <LogoMarquee />
      <div className="border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src={logo} alt={`Logo ${brandName}`} className="h-9 w-9 rounded-lg object-cover shadow-sm" suppressHydrationWarning />
              <span className="brand-gradient-text font-bold">{brandName}</span>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">{disclosure}</p>
          </div>

          <nav aria-label="Liens de la boutique">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Boutique</p>
            <ul className="space-y-0.5">
              {SITE_LINKS.map((l) => (
                <li key={l.view}>
                  <button type="button" onClick={() => onNavigate(l.view, l.opts)} className={linkClass}>
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Informations légales">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">Informations légales</p>
            <ul className="space-y-0.5">
              {LEGAL_LINKS.map((l) => (
                <li key={l.view}>
                  <button type="button" onClick={() => onNavigate(l.view)} className={linkClass}>
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-[11px] leading-relaxed text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {brandName}. Tous droits réservés.</p>
          <p>Prix indicatifs fournis par les vendeurs — vérifiez toujours le prix final sur leur site.</p>
        </div>
      </div>
    </footer>
  );
}
