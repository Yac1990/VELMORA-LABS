"use client";

/**
 * Fiche produit publique : galerie, description, caractéristiques, prix (fourchette si min≠max),
 * badges (Démo + disponibilité), date de mise à jour, bloc d'offres disponibles avec
 * redirection suivie (/api/go/[offerId]) et bandeau « Comment ça marche ».
 * Produits allowInquiry (immobilier / véhicules) : formulaire de demande de renseignements.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, formatCents, formatDate, formatPriceRange } from "@/lib/client";
import type { NavigateFn, ProductDetailData, StoreSettings } from "./store-app";
import { availabilityBadgeClass, availabilityLabel, productTypeLabel, PopularityStars, ProductImage } from "./catalog";
import { popularityFor, usePopularity } from "./popularity";
import { InquiryForm } from "./inquiry-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, CalendarClock, ExternalLink, Globe, Handshake, PackageSearch, RotateCcw, TriangleAlert,
} from "lucide-react";

function globalAvailability(offers: { availability: string }[]): string {
  if (offers.some((o) => o.availability === "in_stock")) return "in_stock";
  if (offers.length > 0 && offers.every((o) => o.availability === "out_of_stock")) return "out_of_stock";
  return "unknown";
}

export function ProductDetailView({
  slug,
  settings,
  onNavigate,
}: {
  slug: string;
  settings: StoreSettings;
  onNavigate: NavigateFn;
}) {
  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState(0);
  const { data: popularity } = usePopularity();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ProductDetailData>(`/api/public/products/${encodeURIComponent(slug)}`);
      setData(res);
      setImgIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement du produit");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const goToOffer = (offerId: string) => {
    // Redirection suivie côté serveur (clic enregistré de façon anonyme, puis 302 vers le site du vendeur).
    window.location.href = `/api/go/${offerId}`;
  };

  if (loading && !data) return <DetailSkeleton />;

  if (error && (!data || data.slug !== slug)) {
    const notFound = error.includes("introuvable") || error.includes("404");
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold">{notFound ? "Produit introuvable" : "Erreur de chargement"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {notFound
              ? "Ce produit n'existe plus ou n'est pas publié. Il a peut-être été retiré du catalogue."
              : error}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={load} className="min-h-[44px] gap-2">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer
            </Button>
            <Button onClick={() => onNavigate("catalog")} className="min-h-[44px] gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour au catalogue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.slug !== slug) {
    // Aucune donnée exploitable pour ce slug (échec sans données précédentes).
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-bold">Erreur de chargement</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error || "Réessayez dans un instant."}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={load} className="min-h-[44px] gap-2">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer
            </Button>
            <Button onClick={() => onNavigate("catalog")} className="min-h-[44px] gap-2">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour au catalogue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const media = data.media ?? [];
  const current = media[imgIndex] ?? media[0] ?? null;
  const availability = globalAvailability(data.offers);
  const price = formatPriceRange(data.priceMinCents, data.priceMaxCents, data.currency, data.priceNote);
  const hasRange = data.priceMinCents != null && data.priceMaxCents != null && data.priceMinCents !== data.priceMaxCents;
  const pop = popularityFor(popularity?.products, data.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:py-8">
      <Button
        variant="ghost"
        onClick={() => onNavigate("catalog")}
        className="-ml-2 mb-4 min-h-[44px] gap-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour au catalogue
      </Button>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Galerie */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <ProductImage
              key={current?.url || "empty"}
              src={current?.url ?? null}
              alt={current?.altText || `Illustration — ${data.title}`}
              className="aspect-[4/3] w-full object-cover"
              iconClassName="h-14 w-14"
            />
          </div>
          {media.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 thin-scrollbar" role="listbox" aria-label="Vignettes du produit">
              {media.map((m, i) => (
                <button
                  key={m.url}
                  type="button"
                  onClick={() => setImgIndex(i)}
                  className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border-2 transition ${i === imgIndex ? "border-primary" : "border-transparent opacity-75 hover:opacity-100"}`}
                  aria-label={`Afficher l'image ${i + 1} sur ${media.length}`}
                  aria-selected={i === imgIndex}
                  role="option"
                >
                  <ProductImage
                    src={m.url}
                    alt={m.altText || `Miniature ${i + 1} — ${data.title}`}
                    className="h-full w-full object-cover"
                    iconClassName="h-5 w-5"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Informations */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm lg:p-6">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {data.category ? (
              <span className="inline-flex items-center gap-1.5">{data.category.name}</span>
            ) : (
              productTypeLabel(data.productType)
            )}
            <span aria-hidden="true">·</span>
            <span className="normal-case">{productTypeLabel(data.productType)}</span>
          </p>

          <h1 className="mt-2 text-2xl font-bold tracking-tight lg:text-3xl">{data.title}</h1>
          {data.shortDescription ? (
            <p className="mt-2 text-sm text-muted-foreground lg:text-base">{data.shortDescription}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data.isDemo ? (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>
            ) : null}
            <Badge variant="outline" className={availabilityBadgeClass(availability)}>
              {availabilityLabel(availability)}
            </Badge>
          </div>
          {pop ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PopularityStars popularity={pop} size="md" />
              <span className="text-[11px] text-muted-foreground">
                Intérêt des visiteurs — mesuré par les clics sortants, pas une note d'acheteurs.
              </span>
            </div>
          ) : null}

          <div className="mt-4">
            <p className={hasRange ? "text-xl font-bold lg:text-2xl" : "text-3xl font-bold"}>
              {price}
            </p>
            {data.priceNote ? (
              <p className="text-xs text-muted-foreground">{data.priceNote}</p>
            ) : null}
            {hasRange ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Fourchette indicative — le prix final est celui affiché sur le site du vendeur.
              </p>
            ) : null}
          </div>

          <Separator className="my-4" />

          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h2>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{data.description}</p>

          {data.features.length > 0 ? (
            <>
              <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Caractéristiques</h2>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {data.features.map((f, i) => (
                  <div key={i} className="rounded-xl border bg-white px-3 py-2">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{f.label}</dt>
                    <dd className="text-sm font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mis à jour le {formatDate(data.updatedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>Langue : {data.language.toUpperCase()}</span>
          </div>

          {data.countries.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {data.countries.slice(0, 12).map((c) => (
                <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
              ))}
              {data.countries.length > 12 ? (
                <span className="text-[10px] text-muted-foreground">+{data.countries.length - 12}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Offres disponibles */}
      <section className="mt-8" aria-labelledby="offers-title">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white text-primary shadow-sm" aria-hidden="true">
            <Handshake className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 id="offers-title" className="text-xl font-bold tracking-tight">
              Offres disponibles ({data.offers.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              L'achat, le paiement et le service après-vente s'effectuent sur le site du vendeur.
            </p>
          </div>
        </div>

        {data.offers.length === 0 ? (
          <div className="mt-4 rounded-2xl border bg-white p-8 text-center shadow-sm">
            <PackageSearch className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              Aucune offre active pour ce produit actuellement — revenez bientôt.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {data.offers.map((o) => (
              <div
                key={o.id}
                className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between lg:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{o.partnerName}</p>
                    {o.partnerIsDemo ? (
                      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>
                    ) : null}
                    <Badge variant="outline" className={availabilityBadgeClass(o.availability)}>
                      {availabilityLabel(o.availability)}
                    </Badge>
                  </div>
                  {o.priceCents != null ? (
                    <p className="mt-0.5 text-sm">
                      Prix sur le site du vendeur : <span className="font-semibold">{formatCents(o.priceCents, o.currency)}</span>
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Dernière synchronisation : {formatDate(o.lastSyncedAt)}
                    {o.urlCheckStatus === "broken" ? " — lien en cours de vérification" : ""}
                  </p>
                  {o.commission.termsUrl ? (
                    <a
                      href={o.commission.termsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-block text-xs text-primary underline underline-offset-2"
                    >
                      Conditions de l'offre
                    </a>
                  ) : null}
                </div>

                <div className="shrink-0 space-y-1.5 sm:text-right">
                  <Button onClick={() => goToOffer(o.id)} className="w-full gap-2 min-h-[44px] sm:w-auto">
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    Voir sur {o.partnerName}
                  </Button>
                  <p className="max-w-xs text-[11px] leading-snug text-muted-foreground sm:ml-auto">
                    Vous serez redirigé vers le site du vendeur pour finaliser votre achat.
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Demande de renseignements (immobilier / véhicules) */}
      {data.allowInquiry ? (
        <section className="mt-8" aria-labelledby="inquiry-title">
          <InquiryForm productSlug={data.slug} productTitle={data.title} />
        </section>
      ) : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8" aria-busy="true" aria-label="Chargement de la fiche produit">
      <Skeleton className="mb-4 h-9 w-44 rounded-full" />
      <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="space-y-3">
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-20 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border bg-white p-6 shadow-sm">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
