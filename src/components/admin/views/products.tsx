"use client";

/**
 * Vue Produits — liste filtrable, création/édition complète (produit + médias + fonctionnalités),
 * gestion des offres par partenaire, actions de publication (RBAC côté serveur en dernier recours).
 */
import { useCallback, useEffect, useState } from "react";
import {
  apiDelete, apiGet, apiPost, apiPut, formatDate, formatPriceRange,
} from "@/lib/client";
import { CURRENCIES } from "@/lib/money";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Archive, Check, ImageOff, Link2, Loader2, Package, Pencil, Plus, Search, Trash2, TriangleAlert, X,
} from "lucide-react";

/* ───────────────────────── Types & libellés ───────────────────────── */

interface OfferRow {
  id: string;
  partnerName: string;
  destinationUrl: string;
  priceCents: number | null;
  currency: string;
  availability: string;
  isActive: boolean;
  urlCheckStatus: string | null;
  lastSyncedAt: string | null;
  externalId: string | null;
}

interface ProductRow {
  id: string; title: string; slug: string; status: string; productType: string; isDemo: boolean;
  category: { id: string; name: string } | null;
  image: string | null;
  priceMinCents: number | null; priceMaxCents: number | null; currency: string;
  priceNote: string | null; allowInquiry: boolean;
  offers: OfferRow[]; updatedAt: string;
}

interface ProductDetail {
  id: string; title: string; slug: string; shortDescription: string | null; description: string;
  status: string; productType: string; language: string;
  countries: string; features: string;
  categoryId: string | null;
  priceMinCents: number | null; priceMaxCents: number | null;
  currency: string; priceNote: string | null; allowInquiry: boolean; isDemo: boolean;
  media: { id: string; url: string; altText: string | null }[];
  offers: (OfferRow & { partner: { id: string; name: string } })[];
  category: { id: string; name: string } | null;
}

interface CategoryItem { id: string; name: string; slug: string; isActive: boolean }
interface PartnerItem { id: string; name: string; isDemo: boolean }

const PRODUCT_STATUSES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "border-zinc-200 bg-zinc-100 text-zinc-600" },
  pending_review: { label: "En revue", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  published: { label: "Publié", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  suspended: { label: "Suspendu", cls: "border-red-200 bg-red-50 text-red-700" },
  archived: { label: "Archivé", cls: "border-zinc-200 bg-zinc-50 text-zinc-400" },
};

const PRODUCT_TYPES: Record<string, string> = {
  digital: "Produit numérique", training: "Formation", subscription: "Abonnement",
  home: "Maison & déco", electronics: "Électronique", real_estate: "Immobilier",
  vehicle: "Véhicule", other: "Autre",
};

const LANGUAGES: Record<string, string> = { fr: "Français", en: "English", es: "Español", de: "Deutsch", it: "Italiano", ar: "العربية" };
const AVAILABILITY: Record<string, string> = { in_stock: "En stock", out_of_stock: "Rupture", unknown: "Inconnu" };

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function eurosToCents(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (!t) return null;
  const v = Number.parseFloat(t);
  if (Number.isNaN(v) || v < 0) return null;
  return Math.round(v * 100);
}

function parseJsonArrayField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

function StatusBadge({ status }: { status: string }) {
  const s = PRODUCT_STATUSES[status] ?? { label: status, cls: "border-zinc-200 bg-zinc-100 text-zinc-600" };
  return <Badge variant="outline" className={`shrink-0 ${s.cls}`}>{s.label}</Badge>;
}

function UrlCheckBadge({ status }: { status: string | null }) {
  if (status === "ok") return <Badge variant="outline" className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700">URL vérifiée</Badge>;
  if (status === "broken") return <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 text-red-700">Lien cassé</Badge>;
  return <Badge variant="outline" className="shrink-0 border-zinc-200 bg-zinc-100 text-zinc-600">Non vérifié</Badge>;
}

interface ProductForm {
  title: string; slug: string; slugTouched: boolean; description: string; shortDescription: string;
  status: string; productType: string; language: string; countriesText: string;
  categoryId: string; priceMin: string; priceMax: string; currency: string;
  priceNote: string; allowInquiry: boolean;
  features: { label: string; value: string }[];
  media: { url: string; altText: string }[];
}

const EMPTY_FORM: ProductForm = {
  title: "", slug: "", slugTouched: false, description: "", shortDescription: "",
  status: "draft", productType: "digital", language: "fr", countriesText: "",
  categoryId: "", priceMin: "", priceMax: "", currency: "EUR", priceNote: "",
  allowInquiry: false, features: [], media: [],
};

interface OfferDraft {
  id: string; partnerId: string; partnerName: string; destinationUrl: string; price: string;
  currency: string; availability: string; urlCheckStatus: string | null; isActive: boolean;
  externalId: string | null; lastSyncedAt: string | null;
}

/* ───────────────────────── Vue ───────────────────────── */

export function ProductsView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "catalog.write");

  const [items, setItems] = useState<ProductRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [partners, setPartners] = useState<PartnerItem[]>([]);

  // Dialog produit
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  // Offres (mode édition)
  const [offers, setOffers] = useState<OfferDraft[]>([]);
  const [newOffer, setNewOffer] = useState({ partnerId: "", destinationUrl: "", price: "", availability: "unknown", externalId: "" });
  const [initialOffer, setInitialOffer] = useState({ partnerId: "", destinationUrl: "", price: "", availability: "unknown", externalId: "" });
  const [offersBusy, setOffersBusy] = useState(false);

  // Suppression
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [offerDeleteTarget, setOfferDeleteTarget] = useState<OfferDraft | null>(null);

  const perPage = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), perPage: String(perPage) });
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      if (categoryId !== "all") params.set("categoryId", categoryId);
      const data = await apiGet<{ items: ProductRow[]; total: number }>(`/api/admin/products?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des produits");
    } finally {
      setLoading(false);
    }
  }, [q, status, categoryId]);

  // Chargement à chaque changement de page ou de filtres appliqués
  useEffect(() => { void load(page); }, [load, page]);

  const applyFilters = () => { setQ(qInput); setPage(1); };

  useEffect(() => {
    apiGet<{ items: CategoryItem[] }>("/api/admin/categories")
      .then((d) => setCategories(d.items))
      .catch(() => setCategories([]));
    apiGet<{ items: PartnerItem[] }>("/api/admin/partners")
      .then((d) => setPartners(d.items))
      .catch(() => setPartners([])); // analyste : pas de partners.read → ajout d'offre désactivé
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setInitialOffer({ partnerId: "", destinationUrl: "", price: "", availability: "unknown", externalId: "" });
    setDialogOpen(true);
  };

  const openEdit = async (id: string) => {
    setDialogOpen(true);
    setDetailLoading(true);
    try {
      const d = await apiGet<{ product: ProductDetail }>(`/api/admin/products/${id}`);
      const p = d.product;
      setEditingId(p.id);
      setForm({
        title: p.title, slug: p.slug, slugTouched: true, description: p.description,
        shortDescription: p.shortDescription ?? "",
        status: p.status, productType: p.productType, language: p.language,
        countriesText: parseJsonArrayField(p.countries).join(", "),
        categoryId: p.categoryId ?? "", priceMin: p.priceMinCents != null ? String(p.priceMinCents / 100) : "",
        priceMax: p.priceMaxCents != null ? String(p.priceMaxCents / 100) : "",
        currency: p.currency || "EUR", priceNote: p.priceNote ?? "", allowInquiry: p.allowInquiry,
        features: (() => { try { const f = JSON.parse(p.features); return Array.isArray(f) ? f.map((x: { label?: string; value?: string }) => ({ label: String(x.label ?? ""), value: String(x.value ?? "") })) : []; } catch { return []; } })(),
        media: p.media.map((m) => ({ url: m.url, altText: m.altText ?? "" })),
      });
      setOffers(p.offers.map((o) => ({
        id: o.id, partnerId: o.partner.id, partnerName: o.partner.name, destinationUrl: o.destinationUrl,
        price: o.priceCents != null ? String(o.priceCents / 100) : "", currency: o.currency,
        availability: o.availability, urlCheckStatus: o.urlCheckStatus, isActive: o.isActive, externalId: o.externalId,
        lastSyncedAt: o.lastSyncedAt,
      })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Produit introuvable");
      setDialogOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Vérification serveur réelle de l'URL d'une offre (POST /api/admin/offers/check, Sprint A)
  const testOfferUrl = async (o: OfferDraft) => {
    setOffersBusy(true);
    try {
      const data = await apiPost<{ check: { status: string; httpStatus: number | null; reason: string | null; finalUrl: string | null } }>(
        "/api/admin/offers/check",
        { offerId: o.id }
      );
      const c = data.check;
      setOffers((arr) => arr.map((x) => (x.id === o.id ? { ...x, urlCheckStatus: c.status } : x)));
      if (c.status === "ok") {
        toast.success(`URL joignable${c.httpStatus ? ` — HTTP ${c.httpStatus}` : ""}. Statut mis à jour.`);
      } else {
        toast.error(`Lien cassé : ${c.reason || "injoignable"}. À corriger avant mise en avant.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du test d'URL");
    } finally {
      setOffersBusy(false);
    }
  };

  const buildBody = () => ({
    title: form.title.trim(),
    slug: form.slug.trim() || slugify(form.title),
    description: form.description.trim(),
    shortDescription: form.shortDescription.trim() || null,
    status: form.status,
    productType: form.productType,
    language: form.language,
    countries: form.countriesText.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c.length === 2),
    features: form.features.filter((f) => f.label.trim() || f.value.trim()),
    categoryId: form.categoryId || null,
    priceMinCents: eurosToCents(form.priceMin),
    priceMaxCents: eurosToCents(form.priceMax),
    currency: form.currency,
    priceNote: form.priceNote.trim() || null,
    allowInquiry: form.allowInquiry,
    media: form.media.filter((m) => m.url.trim()).map((m) => ({ url: m.url.trim(), altText: m.altText.trim() || undefined })),
  });

  const submitProduct = async () => {
    if (form.title.trim().length < 3) { toast.error("Le titre doit faire au moins 3 caractères."); return; }
    if (form.description.trim().length < 20) { toast.error("La description doit faire au moins 20 caractères."); return; }
    setSaving(true);
    try {
      if (editingId) {
        await apiPut(`/api/admin/products/${editingId}`, buildBody());
        toast.success("Produit mis à jour.");
      } else {
        const body: Record<string, unknown> = { ...buildBody() };
        if (initialOffer.partnerId && initialOffer.destinationUrl.trim()) {
          body.offer = {
            partnerId: initialOffer.partnerId,
            destinationUrl: initialOffer.destinationUrl.trim(),
            priceCents: eurosToCents(initialOffer.price),
            currency: form.currency,
            availability: initialOffer.availability,
            externalId: initialOffer.externalId.trim() || undefined,
          };
        }
        await apiPost("/api/admin/products", body);
        toast.success("Produit créé (brouillon par défaut).");
      }
      setDialogOpen(false);
      load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const setStatusOf = async (row: ProductRow, next: string) => {
    try {
      await apiPut(`/api/admin/products/${row.id}`, { status: next });
      toast.success(`Statut mis à jour : ${PRODUCT_STATUSES[next]?.label ?? next}.`);
      load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ archived?: boolean; deleted?: boolean; message?: string }>(`/api/admin/products/${deleteTarget.id}`);
      if (res.archived) toast.info(res.message ?? "Produit archivé (historique de clics conservé).");
      else toast.success("Produit supprimé.");
      setDeleteTarget(null);
      load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  const reloadOffers = async (productId: string) => {
    const d = await apiGet<{ product: ProductDetail }>(`/api/admin/products/${productId}`);
    setOffers(d.product.offers.map((o) => ({
      id: o.id, partnerId: o.partner.id, partnerName: o.partner.name, destinationUrl: o.destinationUrl,
      price: o.priceCents != null ? String(o.priceCents / 100) : "", currency: o.currency,
      availability: o.availability, urlCheckStatus: o.urlCheckStatus, isActive: o.isActive, externalId: o.externalId,
      lastSyncedAt: o.lastSyncedAt,
    })));
    load(page);
  };

  const addOffer = async () => {
    if (!editingId) return;
    if (!newOffer.partnerId) { toast.error("Sélectionnez un partenaire."); return; }
    if (!newOffer.destinationUrl.trim()) { toast.error("L'URL de destination est requise."); return; }
    setOffersBusy(true);
    try {
      await apiPost("/api/admin/offers", {
        productId: editingId, partnerId: newOffer.partnerId,
        destinationUrl: newOffer.destinationUrl.trim(),
        priceCents: eurosToCents(newOffer.price), currency: form.currency,
        availability: newOffer.availability,
        externalId: newOffer.externalId.trim() || undefined,
      });
      toast.success("Offre ajoutée (URL non vérifiée).");
      setNewOffer({ partnerId: "", destinationUrl: "", price: "", availability: "unknown", externalId: "" });
      await reloadOffers(editingId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ajout impossible");
    } finally {
      setOffersBusy(false);
    }
  };

  const saveOffer = async (o: OfferDraft) => {
    setOffersBusy(true);
    try {
      await apiPut("/api/admin/offers", {
        id: o.id, destinationUrl: o.destinationUrl.trim(),
        priceCents: eurosToCents(o.price), availability: o.availability,
      });
      toast.success("Offre mise à jour — statut de vérification remis à « non vérifié ».");
      if (editingId) await reloadOffers(editingId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setOffersBusy(false);
    }
  };

  const confirmDeleteOffer = async () => {
    if (!offerDeleteTarget) return;
    setOffersBusy(true);
    try {
      const res = await apiDelete<{ deactivated?: boolean; deleted?: boolean; message?: string }>(`/api/admin/offers?id=${offerDeleteTarget.id}`);
      if (res.deactivated) toast.info(res.message ?? "Offre désactivée.");
      else toast.success("Offre supprimée.");
      setOfferDeleteTarget(null);
      if (editingId) await reloadOffers(editingId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setOffersBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5 min-w-56 flex-1 max-w-sm">
            <Label htmlFor="prod-q">Recherche</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input id="prod-q" placeholder="Titre ou slug…" value={qInput} onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }} className="pl-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-status">Statut</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger id="prod-status" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(PRODUCT_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prod-cat">Catégorie</Label>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
              <SelectTrigger id="prod-cat" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={applyFilters} disabled={loading}>Filtrer</Button>
          {canWrite && (
            <Button onClick={openCreate} className="ml-auto">
              <Plus className="h-4 w-4" /> Nouveau produit
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-auto thin-scrollbar">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Produit</th>
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  <th className="px-3 py-2.5 font-medium">Catégorie</th>
                  <th className="px-3 py-2.5 font-medium">Prix</th>
                  <th className="px-3 py-2.5 font-medium">Offres</th>
                  <th className="px-3 py-2.5 font-medium">Partenaire(s)</th>
                  <th className="px-3 py-2.5 font-medium">Maj</th>
                  {canWrite && <th className="px-3 py-2.5 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && !items ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={canWrite ? 8 : 7} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td></tr>
                  ))
                ) : items && items.length > 0 ? (
                  items.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {p.image ? (
                            <img src={p.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-md border object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-zinc-50 text-muted-foreground">
                              <ImageOff className="h-4 w-4" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5">
                              <span className="block max-w-56 truncate font-medium" title={p.title}>{p.title}</span>
                              {p.isDemo && <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>}
                            </span>
                            <span className="block max-w-56 truncate text-xs text-muted-foreground" title={p.slug}>/{p.slug}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                      <td className="px-3 py-2.5 text-muted-foreground">{p.category?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {p.priceMinCents == null && p.priceMaxCents == null
                          ? "—"
                          : formatPriceRange(p.priceMinCents, p.priceMaxCents, p.currency, p.priceNote)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{p.offers.length}</td>
                      <td className="px-3 py-2.5">
                        <span className="block max-w-40 truncate text-muted-foreground" title={p.offers.map((o) => o.partnerName).join(", ")}>
                          {p.offers.length ? Array.from(new Set(p.offers.map((o) => o.partnerName))).join(", ") : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{formatDate(p.updatedAt)}</td>
                      {canWrite && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p.id)} aria-label={`Modifier ${p.title}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {p.status === "published" ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStatusOf(p, "suspended")} aria-label={`Suspendre ${p.title}`} title="Suspendre">
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            ) : p.status !== "archived" ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStatusOf(p, "published")} aria-label={`Publier ${p.title}`} title="Publier">
                                <Check className="h-4 w-4 text-emerald-600" />
                              </Button>
                            ) : null}
                            {p.status !== "archived" && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStatusOf(p, "archived")} aria-label={`Archiver ${p.title}`} title="Archiver">
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(p)} aria-label={`Supprimer ${p.title}`} title="Supprimer">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canWrite ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <Package className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      Aucun produit{canWrite ? " — créez-en un" : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {total > perPage && (
        <div className="flex items-center justify-end gap-3 text-sm text-muted-foreground">
          <span>Page {page} / {totalPages} — {total} produit(s)</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Précédent</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)}>Suivant</Button>
        </div>
      )}

      {/* Dialog création / édition */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto thin-scrollbar max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
            <DialogDescription>
              Les données sont enregistrées côté serveur (catalog.write). Slug auto-dérivé du titre si vide.
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="space-y-3 py-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="f-title">Titre *</Label>
                  <Input id="f-title" value={form.title} onChange={(e) => setForm((f) => ({
                    ...f, title: e.target.value, slug: f.slugTouched ? f.slug : slugify(e.target.value),
                  }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-slug">Slug</Label>
                  <Input id="f-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value), slugTouched: true }))} placeholder="auto" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-desc">Description * (20 caractères minimum)</Label>
                <Textarea id="f-desc" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-short">Résumé (accroche boutique)</Label>
                <Textarea id="f-short" rows={2} value={form.shortDescription} onChange={(e) => setForm((f) => ({ ...f, shortDescription: e.target.value }))} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Statut</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRODUCT_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={form.productType} onValueChange={(v) => setForm((f) => ({ ...f, productType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRODUCT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Langue</Label>
                  <Select value={form.language} onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(LANGUAGES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select value={form.categoryId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v === "none" ? "" : v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Aucune —</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Pays (codes, séparés par des virgules)</Label>
                  <Input placeholder="FR, BE, MA" value={form.countriesText} onChange={(e) => setForm((f) => ({ ...f, countriesText: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Devise</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="f-pmin">Prix min ({form.currency})</Label>
                  <Input id="f-pmin" inputMode="decimal" placeholder="ex. 29.90" value={form.priceMin} onChange={(e) => setForm((f) => ({ ...f, priceMin: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-pmax">Prix max ({form.currency})</Label>
                  <Input id="f-pmax" inputMode="decimal" placeholder="ex. 199" value={form.priceMax} onChange={(e) => setForm((f) => ({ ...f, priceMax: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="f-pnote">Note de prix</Label>
                  <Input id="f-pnote" placeholder="ex. par mois" maxLength={80} value={form.priceNote} onChange={(e) => setForm((f) => ({ ...f, priceNote: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Les prix sont saisis en unités et convertis en centimes (× 100) avant envoi.</p>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.allowInquiry} onCheckedChange={(v) => setForm((f) => ({ ...f, allowInquiry: v === true }))} />
                Autoriser les demandes de devis (immobilier, véhicules…)
              </label>

              <Separator />

              {/* Fonctionnalités */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Fonctionnalités (label + valeur)</Label>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setForm((f) => ({ ...f, features: [...f.features, { label: "", value: "" }] }))}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter une ligne
                  </Button>
                </div>
                {form.features.length === 0 && <p className="text-xs text-muted-foreground">Aucune fonctionnalité renseignée.</p>}
                {form.features.map((ft, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="Label (ex. Garantie)" value={ft.label}
                      onChange={(e) => setForm((f) => ({ ...f, features: f.features.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} />
                    <Input placeholder="Valeur (ex. 2 ans)" value={ft.value}
                      onChange={(e) => setForm((f) => ({ ...f, features: f.features.map((x, j) => j === i ? { ...x, value: e.target.value } : x) }))} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setForm((f) => ({ ...f, features: f.features.filter((_, j) => j !== i) }))} aria-label="Retirer la ligne">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Médias */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Médias (URL + texte alternatif)</Label>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setForm((f) => ({ ...f, media: [...f.media, { url: "", altText: "" }] }))}>
                    <Plus className="h-3.5 w-3.5" /> Ajouter un média
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Astuce : les visuels générés par IA sont servis depuis <code>/demo/…</code> (dossier public/demo).
                  Suggestion : <code>/demo/velmora-{form.slug || "produit"}.jpg</code>
                </p>
                {form.media.length === 0 && <p className="text-xs text-muted-foreground">Aucun média — un visuel générique sera affiché en boutique.</p>}
                {form.media.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input placeholder="URL (ex. /demo/velmora-x.jpg)" value={m.url}
                      onChange={(e) => setForm((f) => ({ ...f, media: f.media.map((x, j) => j === i ? { ...x, url: e.target.value } : x) }))} />
                    <Input placeholder="Texte alternatif" value={m.altText}
                      onChange={(e) => setForm((f) => ({ ...f, media: f.media.map((x, j) => j === i ? { ...x, altText: e.target.value } : x) }))} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => setForm((f) => ({ ...f, media: f.media.filter((_, j) => j !== i) }))} aria-label="Retirer le média">
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              {/* Offres */}
              {editingId ? (
                <div className="space-y-3">
                  <Label>Offres partenaires ({offers.length})</Label>
                  {offers.length === 0 && (
                    <p className="text-sm text-muted-foreground">Aucune offre — ajoutez au moins une URL partenaire pour générer des clics.</p>
                  )}
                  {offers.map((o, i) => (
                    <div key={o.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{o.partnerName}</Badge>
                        <UrlCheckBadge status={o.urlCheckStatus} />
                        {!o.isActive && <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-500">Désactivée</Badge>}
                        <div className="ml-auto flex items-center gap-1">
                          <Button type="button" variant="outline" size="sm" disabled={offersBusy}
                            onClick={() => void testOfferUrl(o)}
                            title="Vérifie l'URL côté serveur (liste blanche, HTTP, redirections)">
                            {offersBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Tester
                          </Button>
                          <Button type="button" variant="outline" size="sm" disabled={offersBusy} onClick={() => saveOffer(offers[i])}>
                            {offersBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Enregistrer
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOfferDeleteTarget(o)} aria-label="Supprimer l'offre">
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-4">
                        <Input className="sm:col-span-2" placeholder="URL de destination (http…)" value={o.destinationUrl}
                          onChange={(e) => setOffers((arr) => arr.map((x, j) => j === i ? { ...x, destinationUrl: e.target.value } : x))} />
                        <Input inputMode="decimal" placeholder={`Prix (${form.currency})`} value={o.price}
                          onChange={(e) => setOffers((arr) => arr.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                        <Select value={o.availability} onValueChange={(v) => setOffers((arr) => arr.map((x, j) => j === i ? { ...x, availability: v } : x))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(AVAILABILITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {o.lastSyncedAt && <p className="text-[11px] text-muted-foreground">Dernière synchronisation : {formatDate(o.lastSyncedAt)}</p>}
                    </div>
                  ))}
                  <div className="rounded-md border border-dashed p-3 space-y-2">
                    <p className="text-sm font-medium">Ajouter une offre</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Select value={newOffer.partnerId || "none"} onValueChange={(v) => setNewOffer((s) => ({ ...s, partnerId: v === "none" ? "" : v }))}>
                        <SelectTrigger><SelectValue placeholder="Partenaire" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" disabled>Partenaire…</SelectItem>
                          {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.isDemo ? " (démo)" : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input className="sm:col-span-2" placeholder="URL de destination" value={newOffer.destinationUrl}
                        onChange={(e) => setNewOffer((s) => ({ ...s, destinationUrl: e.target.value }))} />
                      <Input inputMode="decimal" placeholder={`Prix (${form.currency})`} value={newOffer.price}
                        onChange={(e) => setNewOffer((s) => ({ ...s, price: e.target.value }))} />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input placeholder="ID externe (optionnel)" value={newOffer.externalId}
                        onChange={(e) => setNewOffer((s) => ({ ...s, externalId: e.target.value }))} />
                      <Select value={newOffer.availability} onValueChange={(v) => setNewOffer((s) => ({ ...s, availability: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(AVAILABILITY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button type="button" variant="secondary" onClick={addOffer} disabled={offersBusy || partners.length === 0}>
                        <Plus className="h-4 w-4" /> Ajouter
                      </Button>
                    </div>
                    {partners.length === 0 && (
                      <p className="text-xs text-muted-foreground">Liste des partenaires indisponible pour votre rôle — enregistrez le produit puis ajoutez l&apos;offre depuis un compte autorisé.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Offre initiale (optionnelle)</Label>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <Select value={initialOffer.partnerId || "none"} onValueChange={(v) => setInitialOffer((s) => ({ ...s, partnerId: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="Partenaire" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Aucune —</SelectItem>
                        {partners.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.isDemo ? " (démo)" : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="sm:col-span-2" placeholder="URL de destination (http…)" value={initialOffer.destinationUrl}
                      onChange={(e) => setInitialOffer((s) => ({ ...s, destinationUrl: e.target.value }))} />
                    <Input inputMode="decimal" placeholder={`Prix (${form.currency})`} value={initialOffer.price}
                      onChange={(e) => setInitialOffer((s) => ({ ...s, price: e.target.value }))} />
                  </div>
                  <p className="text-xs text-muted-foreground">Une fois le produit créé, gérez toutes ses offres dans la fenêtre d&apos;édition.</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={submitProduct} disabled={saving || detailLoading}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Enregistrer" : "Créer le produit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression produit */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {deleteTarget?.title} » sera définitivement supprimé. S&apos;il a un historique de clics, il sera archivé au lieu d&apos;être supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} className="bg-red-600 hover:bg-red-700">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TriangleAlert className="h-4 w-4" />} Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression offre */}
      <AlertDialog open={!!offerDeleteTarget} onOpenChange={(o) => { if (!o) setOfferDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette offre ?</AlertDialogTitle>
            <AlertDialogDescription>
              Redirection partenaire « {offerDeleteTarget?.partnerName} ». Si des clics y sont rattachés, elle sera simplement désactivée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={offersBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDeleteOffer(); }} className="bg-red-600 hover:bg-red-700">
              {offersBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!canWrite && (
        <Alert>
          <Package className="h-4 w-4" />
          <AlertTitle>Lecture seule</AlertTitle>
          <AlertDescription>Votre rôle ne permet pas de modifier le catalogue — les boutons d&apos;écriture sont masqués et le serveur refuserait toute modification.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
