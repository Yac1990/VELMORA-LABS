"use client";

/**
 * Vue Partenaires — cartes détaillées (intégrations, liste blanche de domaines, règle de commission),
 * création/édition et suppression (le serveur renvoie `deactivated` en cas d'historique rattaché).
 */
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, formatCents, formatDate } from "@/lib/client";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  BookOpen, ExternalLink, Globe, Handshake, Link2, Loader2, MousePointerClick, Pencil, Plus,
  ReceiptText, Save, ShieldCheck, ShoppingBag, Trash2, TriangleAlert,
} from "lucide-react";

interface IntegrationRow {
  id: string; integrationType: string; status: string; statusDetail: string | null;
  lastSyncAt: string | null; secretRefName: string | null;
}

interface CommissionRuleRow {
  id: string; ruleType: string; rate: number | null; fixedAmountCents: number | null;
  currency: string; note: string | null; termsUrl: string | null;
}

interface PartnerRow {
  id: string; name: string; website: string; programType: string; status: string;
  documentationUrl: string | null; supportedCountries: string[]; allowedDomains: string[];
  trackingTemplate: string | null; trackingDocUrl: string | null;
  isDemo: boolean; note: string | null; createdAt: string;
  integrations: IntegrationRow[]; commissionRule: CommissionRuleRow | null;
  offerCount: number; clickCount: number; conversionCount: number;
}

interface PartnerForm {
  name: string; website: string; programType: string; status: string;
  allowedDomainsText: string; supportedCountriesText: string; documentationUrl: string;
  note: string; integrationType: string;
}

const EMPTY_FORM: PartnerForm = {
  name: "", website: "", programType: "affiliate", status: "active",
  allowedDomainsText: "", supportedCountriesText: "", documentationUrl: "", note: "", integrationType: "csv",
};

const PROGRAM_TYPES: Record<string, string> = { affiliate: "Affiliation", direct: "Direct", other: "Autre" };
const PARTNER_STATUSES: Record<string, { label: string; cls: string }> = {
  active: { label: "Actif", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  inactive: { label: "Inactif", cls: "border-zinc-200 bg-zinc-100 text-zinc-500" },
  pending: { label: "En attente", cls: "border-amber-200 bg-amber-50 text-amber-700" },
};

function IntegrationBadge({ status }: { status: string }) {
  if (status === "configured") return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Configuré</Badge>;
  if (status === "error") return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Erreur</Badge>;
  return <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-500">Non configuré</Badge>;
}

/** Slug cohérent avec le serveur (clés Setting tracking.<slug>.*). */
function partnerSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const TOKEN_LABELS: Record<string, string> = {
  affiliateId: "ID d'affilié",
  merchantId: "ID annonceur / programme",
  sharedId: "ID partagé (sharedId)",
  linkId: "LinkId annonceur",
  campaignId: "ID de campagne",
};

/**
 * Sprint B — bloc « Tracking réel » d'une carte partenaire : gabarit documenté du réseau,
 * IDs d'affilié/annonceur éditables (clés Setting tracking.<slug>.* — RBAC settings.write)
 * et lien vers la doc officielle du format. Jamais d'ID inventé : champs vides = non configuré.
 */
function PartnerTracking({ partner, canEdit }: { partner: PartnerRow; canEdit: boolean }) {
  const slug = partnerSlug(partner.name);
  const tokens = Array.from(
    new Set(
      (partner.trackingTemplate ?? "")
        .match(/\{([a-zA-Z0-9]+)\}/g)
        ?.map((t) => t.slice(1, -1))
        .filter((t) => t !== "destUrl" && t !== "destUrlEnc" && t !== "subId") ?? [],
    ),
  );

  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!partner.trackingTemplate || tokens.length === 0) { setCfg({}); return; }
    let alive = true;
    apiGet<{ settings: Record<string, string> }>("/api/admin/settings")
      .then((d) => { if (alive) setCfg(d.settings ?? {}); })
      .catch(() => { if (alive) setCfg({}); });
    return () => { alive = false; };
  }, [partner.id]);

  const valueOf = (f: string) => draft[f] ?? cfg?.[`tracking.${slug}.${f}`] ?? "";

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const f of tokens) body[`tracking.${slug}.${f}`] = valueOf(f).trim();
      await apiPut("/api/admin/settings", body);
      toast.success("Identifiants de tracking enregistrés.");
      setDraft({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  if (!partner.trackingTemplate) {
    return (
      <div className="rounded-md border border-dashed p-2.5">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Link2 className="h-3 w-3" /> Tracking réel</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Format de tracking à confirmer lors de l&apos;activation du programme (jamais inventé) —
          redirection directe vers la destination en attendant.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground"><Link2 className="h-3 w-3" /> Tracking réel (gabarit réseau documenté)</p>
        {tokens.length > 0 && cfg && tokens.every((f) => valueOf(f).trim() !== "")
          ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">IDs configurés</Badge>
          : <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">IDs à saisir</Badge>}
      </div>
      <code className="block overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1 font-mono text-[11px] thin-scrollbar">{partner.trackingTemplate}</code>
      {canEdit && tokens.length > 0 && cfg !== null && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tokens.map((f) => (
            <div key={f} className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">{TOKEN_LABELS[f] ?? f}</Label>
              <Input
                value={valueOf(f)}
                onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
                className="h-8 font-mono text-xs"
                placeholder="Non configuré"
                autoComplete="off"
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <Button size="sm" variant="outline" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer les identifiants
            </Button>
          </div>
        </div>
      )}
      {partner.trackingDocUrl && (
        <a href={partner.trackingDocUrl} target="_blank" rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <BookOpen className="h-3.5 w-3.5" /> Documentation officielle du format <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

export function PartnersView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "partners.write");
  const canTrackingWrite = hasPermission(user.role, "settings.write");
  const [items, setItems] = useState<PartnerRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PartnerForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PartnerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: PartnerRow[] }>("/api/admin/partners");
      setItems(d.items);
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des partenaires");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (p: PartnerRow) => {
    setEditingId(p.id);
    setForm({
      name: p.name, website: p.website, programType: p.programType, status: p.status,
      allowedDomainsText: p.allowedDomains.join("\n"),
      supportedCountriesText: p.supportedCountries.join(", "),
      documentationUrl: p.documentationUrl ?? "", note: p.note ?? "", integrationType: "csv",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (form.name.trim().length < 2) { toast.error("Nom du partenaire requis."); return; }
    const domains = form.allowedDomainsText.split(/\r?\n/).map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean);
    if (domains.length === 0) { toast.error("Au moins un domaine autorisé est requis (liste blanche anti open-redirect)."); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        website: form.website.trim(),
        programType: form.programType,
        status: form.status,
        allowedDomains: domains,
        supportedCountries: form.supportedCountriesText.split(",").map((c) => c.trim().toUpperCase()).filter((c) => c.length === 2),
        documentationUrl: form.documentationUrl.trim() || null,
        note: form.note.trim() || null,
      };
      if (editingId) {
        await apiPut(`/api/admin/partners/${editingId}`, body);
        toast.success("Partenaire mis à jour.");
      } else {
        await apiPost("/api/admin/partners", { ...body, integrationType: form.integrationType });
        toast.success("Partenaire créé (intégration non configurée).");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ deactivated?: boolean; deleted?: boolean; message?: string }>(`/api/admin/partners/${deleteTarget.id}`);
      if (res.deactivated) toast.info(res.message ?? "Partenaire désactivé (historique conservé).");
      else toast.success("Partenaire supprimé.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  const commissionLabel = (rule: CommissionRuleRow | null): string => {
    if (!rule || rule.ruleType === "unknown") return "Commission : inconnue";
    if (rule.ruleType === "percentage" && rule.rate != null) return `Commission : ${rule.rate} % du montant commande`;
    if (rule.ruleType === "fixed" && rule.fixedAmountCents != null) return `Commission : ${formatCents(rule.fixedAmountCents, rule.currency)} / vente`;
    return "Commission : inconnue";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nouveau partenaire</Button>
        )}
      </div>

      {loading && !items ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
        </div>
      ) : items && items.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((p) => {
            const st = PARTNER_STATUSES[p.status] ?? { label: p.status, cls: "border-zinc-200 bg-zinc-100 text-zinc-600" };
            return (
              <Card key={p.id} className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    {p.isDemo && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>}
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                    <Badge variant="secondary">{PROGRAM_TYPES[p.programType] ?? p.programType}</Badge>
                    {canWrite && (
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} aria-label={`Modifier ${p.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(p)} aria-label={`Supprimer ${p.name}`}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </span>
                    )}
                  </div>
                  <a href={p.website} target="_blank" rel="noopener noreferrer nofollow"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                    <Globe className="h-3.5 w-3.5" /> {p.website} <ExternalLink className="h-3 w-3" />
                  </a>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 text-sm">
                  <p className="font-medium text-foreground">{commissionLabel(p.commissionRule)}</p>
                  {p.commissionRule?.note && <p className="text-xs text-muted-foreground">{p.commissionRule.note}</p>}

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border p-2 text-center">
                      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><ShoppingBag className="h-3 w-3" /> Offres</p>
                      <p className="text-lg font-semibold tabular-nums">{p.offerCount}</p>
                    </div>
                    <div className="rounded-md border p-2 text-center">
                      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><MousePointerClick className="h-3 w-3" /> Clics</p>
                      <p className="text-lg font-semibold tabular-nums">{p.clickCount.toLocaleString("fr-FR")}</p>
                    </div>
                    <div className="rounded-md border p-2 text-center">
                      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><ReceiptText className="h-3 w-3" /> Conversions</p>
                      <p className="text-lg font-semibold tabular-nums">{p.conversionCount.toLocaleString("fr-FR")}</p>
                    </div>
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Pays supportés</p>
                    {p.supportedCountries.length ? (
                      <div className="flex flex-wrap gap-1">
                        {p.supportedCountries.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
                      </div>
                    ) : <p className="text-xs text-muted-foreground">—</p>}
                  </div>

                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <ShieldCheck className="h-3 w-3" /> Domaines autorisés (liste blanche anti open-redirect)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {p.allowedDomains.length
                        ? p.allowedDomains.map((d) => <Badge key={d} variant="secondary" className="font-mono text-[11px]">{d}</Badge>)
                        : <p className="text-xs text-muted-foreground">Aucun — redirection suivie bloquée.</p>}
                    </div>
                  </div>

                  <PartnerTracking partner={p} canEdit={canTrackingWrite} />

                  {p.integrations.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Intégrations</p>
                      <ul className="space-y-1.5">
                        {p.integrations.map((i) => (
                          <li key={i.id} className="rounded-md border px-2.5 py-1.5 text-xs">
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="uppercase">{i.integrationType}</Badge>
                              <IntegrationBadge status={i.status} />
                              {i.lastSyncAt && <span className="text-muted-foreground">Sync : {formatDate(i.lastSyncAt)}</span>}
                              {i.secretRefName && <span className="font-mono text-muted-foreground">Secret : {i.secretRefName} (réf. serveur)</span>}
                            </span>
                            {i.statusDetail && <p className="mt-1 text-muted-foreground">{i.statusDetail}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {p.documentationUrl && (
                    <a href={p.documentationUrl} target="_blank" rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <BookOpen className="h-3.5 w-3.5" /> Documentation du programme <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {p.note && <p className="text-xs text-muted-foreground">{p.note}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <Handshake className="h-10 w-10 opacity-40" />
            <p className="text-sm">Aucun partenaire{canWrite ? " — créez-en un" : ""}.</p>
          </CardContent>
        </Card>
      )}

      {!canWrite && (
        <Alert>
          <Handshake className="h-4 w-4" />
          <AlertTitle>Lecture seule</AlertTitle>
          <AlertDescription>Votre rôle ne permet pas de gérer les partenaires — le serveur refuse toute écriture.</AlertDescription>
        </Alert>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto thin-scrollbar max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier le partenaire" : "Nouveau partenaire"}</DialogTitle>
            <DialogDescription>
              Les domaines autorisés protègent la redirection suivie contre l&apos;open-redirect : une URL de destination hors liste blanche est refusée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Nom *</Label>
                <Input id="p-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-web">Site web *</Label>
                <Input id="p-web" type="url" placeholder="https://…" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type de programme</Label>
                <Select value={form.programType} onValueChange={(v) => setForm((f) => ({ ...f, programType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PROGRAM_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PARTNER_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-domains">Domaines autorisés * (un par ligne)</Label>
              <Textarea id="p-domains" rows={3} placeholder={"partenaire-exemple.com\nshop.partenaire-exemple.com"}
                value={form.allowedDomainsText} onChange={(e) => setForm((f) => ({ ...f, allowedDomainsText: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-countries">Pays supportés (codes, virgules)</Label>
                <Input id="p-countries" placeholder="FR, BE, MA" value={form.supportedCountriesText} onChange={(e) => setForm((f) => ({ ...f, supportedCountriesText: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-doc">URL de documentation</Label>
                <Input id="p-doc" type="url" placeholder="https://…" value={form.documentationUrl} onChange={(e) => setForm((f) => ({ ...f, documentationUrl: e.target.value }))} />
              </div>
            </div>
            {!editingId && (
              <div className="space-y-1.5">
                <Label>Type d&apos;intégration initiale</Label>
                <Select value={form.integrationType} onValueChange={(v) => setForm((f) => ({ ...f, integrationType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV / relevé</SelectItem>
                    <SelectItem value="api">API</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                    <SelectItem value="feed">Flux produit</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Créée au statut « Non configuré » — les secrets ne sont jamais stockés en clair (référence de variable d&apos;environnement uniquement).</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="p-note">Note interne</Label>
              <Textarea id="p-note" rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le partenaire « {deleteTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Si des clics ou conversions historiques y sont rattachés, il sera désactivé au lieu d&apos;être supprimé.
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
    </div>
  );
}
