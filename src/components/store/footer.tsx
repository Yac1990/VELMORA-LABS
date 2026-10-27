"use client";

/**
 * Pied de page VELMORA LABS — collé en bas (le parent gère min-h-screen flex flex-col).
 * Liens légaux, message « Comment ça marche », © année dynamique, safe-area iOS.
 * Task 37-c : libellés et texte de transparence traduits (FR/EN).
 */
import type { NavigateFn, StoreSettings, StoreView } from "./store-app";
import { LogoMarquee } from "./logo-marquee";
import { useI18n } from "./i18n";

export function StoreFooter({
  settings,
  onNavigate,
}: {
  settings: StoreSettings | null;
  onNavigate: NavigateFn;
}) {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const brandName = settings?.brandName || "VELMORA LABS";
  const logo = settings?.brandLogo || "/velmora-logo.png";
  const disclosure =
    settings?.outboundNotice ||
    t("footer.disclosureFallback");

  /* Liens — libellés traduits (la vue reste la clé stable). */
  const legalLinks: { view: StoreView; label: string }[] = [
    { view: "legal:privacy", label: t("footer.linkPrivacy") },
    { view: "legal:terms", label: t("footer.linkTerms") },
    { view: "legal:disclosure", label: t("footer.linkDisclosure") },
    { view: "legal:cookies", label: t("footer.linkCookies") },
  ];

  const siteLinks: { view: StoreView; label: string; opts?: Parameters<NavigateFn>[1] }[] = [
    { view: "home", label: t("nav.home") },
    { view: "catalog", label: t("nav.catalogue"), opts: { catalogCat: "", catalogQuery: "" } },
    { view: "faq", label: t("nav.faq") },
    { view: "contact", label: t("nav.contact") },
    { view: "legal:about", label: t("nav.about") },
  ];

  const linkClass =
    "inline-flex min-h-[44px] items-center py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <footer className="mt-auto border-t bg-white">
      {/* Task 19 — deux bandes de logos défilants (sens opposés), ajout isolé sans titre ni texte. */}
      <LogoMarquee />
      <div className="border-t">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            {/* suppressHydrationWarning : parent direct d'une <img> marquée par l'outillage
                de prévisualisation avant hydratation (Task 36). */}
            <div className="flex items-center gap-2.5" suppressHydrationWarning>
              <img src={logo} alt={t("header.logoAlt", { brand: brandName })} className="h-9 w-9 rounded-lg object-cover shadow-sm" suppressHydrationWarning />
              <span className="brand-gradient-text font-bold">{brandName}</span>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">{disclosure}</p>
          </div>

          <nav aria-label={t("footer.shopAria")}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{t("footer.shopTitle")}</p>
            <ul className="space-y-0.5">
              {siteLinks.map((l) => (
                <li key={l.view}>
                  <button type="button" onClick={() => onNavigate(l.view, l.opts)} className={linkClass}>
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t("footer.legalAria")}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{t("footer.legalTitle")}</p>
            <ul className="space-y-0.5">
              {legalLinks.map((l) => (
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
          <p>{t("footer.copyright", { year, brand: brandName })}</p>
          <p>{t("footer.priceNotice")}</p>
        </div>
      </div>
    </footer>
  );
}
