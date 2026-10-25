"use client";

/**
 * Vue CRM — contacts, pipeline de statuts, consentements RGPD, journal d'activités.
 * Contrat API : /api/admin/crm/contacts (+ [id], [id]/anonymize), /api/admin/export/contacts.
 */
import { useCallback, useEffect, useState } from "react";
import { apiDownload, apiGet, apiPost, apiPut, formatDate } from "@/lib/client";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Fingerprint, Info, Loader2, Plus, Search, ShieldAlert } from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface CrmActivityItem {
  id: string;
  activityType: string;
  notes: string;
  dueAt: string | null;
  createdAt: string;
}

interface ContactListItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  language: string;
  status: string;
  source: string | null;
  consentStatus: string;
  consentAt: string | null;
  tags: string[];
  isDemo: boolean;
  anonymizedAt: string | null;
  createdAt: string;
  lastActivity: CrmActivityItem | null;
}

interface ConsentRecordItem {
  id: string;
  subjectType: string;
  subjectId: string;
  purpose: string;
  status: string; // granted | withdrawn
  source: string;
  recordedAt: string;
  withdrawnAt: string | null;
}

/** Détail : le contact brut Prisma est renvoyé (tags = chaîne JSON, activités incluses). */
interface ContactDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  language: string;
  status: string;
  source: string | null;
  consentStatus: string;
  consentPurpose: string | null;
  consentAt: string | null;
  tags: string;
  notes: string | null;
  isDemo: boolean;
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activities: CrmActivityItem[];
  sourceProduct: { title: string; slug: string } | null;
}

// ─────────────────────────── Libellés & styles ───────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  to_contact: "À contacter",
  in_discussion: "En discussion",
  qualified: "Qualifié",
  converted: "Converti",
  lost: "Perdu",
  unsubscribed: "Désabonné",
};

const STATUS_BADGE: Record<string, string> = {
  new: "border-blue-200 bg-blue-50 text-blue-700",
  to_contact: "border-amber-200 bg-amber-50 text-amber-700",
  in_discussion: "border-violet-200 bg-violet-50 text-violet-700",
  qualified: "border-cyan-200 bg-cyan-50 text-cyan-700",
  converted: "border-green-200 bg-green-50 text-green-700",
  lost: "border-red-200 bg-red-50 text-red-700",
  unsubscribed: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Saisie manuelle",
  contact_form: "Formulaire de contact",
  inquiry: "Demande produit",
  import: "Import CSV",
};

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Note",
  task: "Tâche",
  call: "Appel",
  email: "E-mail",
  status_change: "Changement de statut",
  inquiry: "Demande produit",
};

const STATUS_VALUES = Object.keys(STATUS_LABELS);
const SOURCE_VALUES = ["manual", "contact_form", "inquiry", "import"];

function DemoBadge() {
  return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>;
}

function ConsentBadge({ status }: { status: string }) {
  if (status === "granted") return <Badge className="border-green-200 bg-green-50 text-green-700" variant="outline">Accordé</Badge>;
  if (status === "withdrawn") return <Badge className="border-red-200 bg-red-50 text-red-700" variant="outline">Retiré</Badge>;
  return <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-500">Aucun</Badge>;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─────────────────────────── Vue ───────────────────────────

export function CrmView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "crm.write");

  // Liste
  const [items, setItems] = useState<ContactListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Création
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", country: "", status: "new",
    source: "manual", consent: "none", consentPurpose: "", tags: "", notes: "",
  });

  // Détail
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [consents, setConsents] = useState<ConsentRecordItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activityType, setActivityType] = useState("note");
  const [activityNotes, setActivityNotes] = useState("");
  const [activityDueAt, setActivityDueAt] = useState("");
  const [activitySaving, setActivitySaving] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [anonymizeOpen, setAnonymizeOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQApplied(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", perPage: "100" });
      if (qApplied) params.set("q", qApplied);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await apiGet<{ items: ContactListItem[]; total: number }>(`/api/admin/crm/contacts?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des contacts");
    } finally {
      setLoading(false);
    }
  }, [qApplied, statusFilter]);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Chargement du détail
  useEffect(() => {
    if (!detailId) { setDetail(null); setConsents([]); return; }
    let cancelled = false;
    setDetailLoading(true);
    apiGet<{ contact: ContactDetail; consents: ConsentRecordItem[] }>(`/api/admin/crm/contacts/${detailId}`)
      .then((data) => {
        if (!cancelled) { setDetail(data.contact); setConsents(data.consents); }
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "Erreur de chargement du contact");
          setDetailId(null);
        }
      })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [detailId]);

  const refreshAfterDetailChange = useCallback(() => {
    loadContacts();
    if (detailId) {
      apiGet<{ contact: ContactDetail; consents: ConsentRecordItem[] }>(`/api/admin/crm/contacts/${detailId}`)
        .then((data) => { setDetail(data.contact); setConsents(data.consents); })
        .catch(() => {});
    }
  }, [loadContacts, detailId]);

  const openCreate = () => {
    setForm({ name: "", email: "", phone: "", country: "", status: "new", source: "manual", consent: "none", consentPurpose: "", tags: "", notes: "" });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const name = form.name.trim();
    const email = form.email.trim();
    if (name.length < 2) { toast.error("Nom requis (2 caractères minimum)."); return; }
    if (email && !EMAIL_RE.test(email)) { toast.error("E-mail invalide."); return; }
    if (form.consent === "granted" && !form.consentPurpose.trim()) {
      toast.error("La finalité du consentement est requise quand il est accordé.");
      return;
    }
    setCreating(true);
    try {
      await apiPost("/api/admin/crm/contacts", {
        name,
        email: email || undefined,
        phone: form.phone.trim() || undefined,
        country: form.country.trim() || undefined,
        status: form.status,
        source: form.source,
        consentStatus: form.consent,
        consentPurpose: form.consent === "granted" ? form.consentPurpose.trim() : undefined,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: form.notes.trim() || undefined,
      });
      toast.success("Contact créé");
      setCreateOpen(false);
      loadContacts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de création du contact");
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!detail || status === detail.status) return;
    setActionBusy(true);
    try {
      await apiPut(`/api/admin/crm/contacts/${detail.id}`, { status });
      toast.success(`Statut mis à jour : ${STATUS_LABELS[status] || status}`);
      refreshAfterDetailChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du changement de statut");
    } finally {
      setActionBusy(false);
    }
  };

  const addActivity = async () => {
    if (!detail) return;
    if (!activityNotes.trim()) { toast.error("La note d'activité est requise."); return; }
    setActivitySaving(true);
    try {
      await apiPut(`/api/admin/crm/contacts/${detail.id}`, {
        activityType,
        activityNotes: activityNotes.trim(),
        activityDueAt: activityDueAt || undefined,
      });
      toast.success("Activité ajoutée");
      setActivityNotes("");
      setActivityDueAt("");
      setActivityType("note");
      refreshAfterDetailChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'ajout d'activité");
    } finally {
      setActivitySaving(false);
    }
  };

  const withdrawConsent = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      await apiPut(`/api/admin/crm/contacts/${detail.id}`, { withdrawConsent: true });
      toast.success("Consentement retiré — contact désabonné");
      setWithdrawOpen(false);
      refreshAfterDetailChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec du retrait de consentement");
    } finally {
      setActionBusy(false);
    }
  };

  const anonymize = async () => {
    if (!detail) return;
    setActionBusy(true);
    try {
      await apiPost(`/api/admin/crm/contacts/${detail.id}/anonymize`, {});
      toast.success("Contact anonymisé (irréversible) — tracé de consentement conservé");
      setAnonymizeOpen(false);
      setDetailId(null);
      loadContacts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'anonymisation");
    } finally {
      setActionBusy(false);
    }
  };

  const shown = items.length;
  const canWithdraw = canWrite && detail?.consentStatus === "granted";
  const canAnonymize = canWrite && detail !== null && !detail.anonymizedAt;

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50 text-blue-900">
        <Info className="h-4 w-4" />
        <AlertTitle>Éthique & données personnelles</AlertTitle>
        <AlertDescription>
          Les clics anonymes ne sont jamais transformés en profils identifiés.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Contacts</CardTitle>
              <CardDescription>
                {loading ? "Chargement…" : `${total} contact${total > 1 ? "s" : ""} au total`}
                {!loading && total > shown ? ` — ${shown} plus récents affichés` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Rechercher nom ou e-mail…"
                  className="w-56 pl-8"
                  aria-label="Rechercher un contact"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" aria-label="Filtrer par statut">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await apiDownload("/api/admin/export/contacts", `velmora-contacts-${new Date().toISOString().slice(0, 10)}.csv`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Échec de l'export");
                  }
                }}
              >
                <Download className="h-4 w-4" /> Export CSV
              </Button>
              {canWrite && (
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Nouveau contact
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto thin-scrollbar overflow-x-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-white">
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Pays</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Consentement</TableHead>
                  <TableHead>Dernière activité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Aucun contact{statusFilter !== "all" || qApplied ? " pour ces critères" : ""}. Les contacts apparaissent ici après une demande produit, le formulaire de contact ou une saisie manuelle.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => setDetailId(c.id)}
                      title="Ouvrir la fiche du contact"
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {truncate(c.name, 32)}
                          {c.isDemo && <DemoBadge />}
                          {c.anonymizedAt && <Badge variant="outline" className="border-zinc-300 text-zinc-500">Anonymisé</Badge>}
                        </span>
                      </TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.country || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_BADGE[c.status] || ""}>
                          {STATUS_LABELS[c.status] || c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{SOURCE_LABELS[c.source || ""] || c.source || "—"}</TableCell>
                      <TableCell><ConsentBadge status={c.consentStatus} /></TableCell>
                      <TableCell className="text-muted-foreground">{c.lastActivity ? truncate(c.lastActivity.notes, 40) : "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog création ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouveau contact</DialogTitle>
            <DialogDescription>
              Minimisation des données : ne saisissez que les champs utiles au suivi relationnel.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nom *</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-email">E-mail</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Téléphone</Label>
              <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-country">Pays</Label>
              <Input id="c-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Statut</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCE_VALUES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Consentement</Label>
              <Select value={form.consent} onValueChange={(v) => setForm({ ...form, consent: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun</SelectItem>
                  <SelectItem value="granted">Accordé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tags">Tags (séparés par des virgules)</Label>
              <Input id="c-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vip, newsletter" />
            </div>
            {form.consent === "granted" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-purpose">Finalité du consentement *</Label>
                <Input
                  id="c-purpose"
                  value={form.consentPurpose}
                  onChange={(e) => setForm({ ...form, consentPurpose: e.target.value })}
                  placeholder="Communications commerciales"
                  required
                />
                <p className="text-xs text-muted-foreground">Requis RGPD : la finalité sera tracée dans le journal des consentements.</p>
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="c-notes">Notes</Label>
              <Textarea id="c-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Annuler</Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} Créer le contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog détail ── */}
      <Dialog open={!!detailId} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Fiche contact
              {detail?.isDemo && <DemoBadge />}
              {detail?.anonymizedAt && <Badge variant="outline" className="border-zinc-300 text-zinc-500">Anonymisé</Badge>}
            </DialogTitle>
            <DialogDescription>
              Historique, consentements et actions RGPD — chaque action est journalisée.
            </DialogDescription>
          </DialogHeader>

          {detailLoading && !detail ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <p><span className="font-medium">Nom :</span> {detail.name}</p>
                <p><span className="font-medium">E-mail :</span> {detail.email || "—"}</p>
                <p><span className="font-medium">Téléphone :</span> {detail.phone || "—"}</p>
                <p><span className="font-medium">Pays :</span> {detail.country || "—"}</p>
                <p><span className="font-medium">Langue :</span> {detail.language || "—"}</p>
                <p><span className="font-medium">Source :</span> {SOURCE_LABELS[detail.source || ""] || detail.source || "—"}</p>
                {detail.sourceProduct && (
                  <p className="sm:col-span-2"><span className="font-medium">Produit d&apos;origine :</span> {detail.sourceProduct.title}</p>
                )}
                <p className="flex items-center gap-2">
                  <span className="font-medium">Statut :</span>
                  {canWrite && !detail.anonymizedAt ? (
                    <Select value={detail.status} onValueChange={changeStatus} disabled={actionBusy}>
                      <SelectTrigger className="h-8 w-44" aria-label="Changer le statut"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUS_VALUES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={STATUS_BADGE[detail.status] || ""}>{STATUS_LABELS[detail.status] || detail.status}</Badge>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Consentement :</span>
                  <ConsentBadge status={detail.consentStatus} />
                  {detail.consentPurpose && <span className="text-xs text-muted-foreground">({detail.consentPurpose})</span>}
                </p>
                <p><span className="font-medium">Consenti le :</span> {formatDate(detail.consentAt)}</p>
                <p><span className="font-medium">Créé le :</span> {formatDate(detail.createdAt)}</p>
                {detail.anonymizedAt && (
                  <p className="sm:col-span-2"><span className="font-medium">Anonymisé le :</span> {formatDate(detail.anonymizedAt)}</p>
                )}
                {parseTags(detail.tags).length > 0 && (
                  <p className="flex flex-wrap items-center gap-1.5 sm:col-span-2">
                    <span className="font-medium">Tags :</span>
                    {parseTags(detail.tags).map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                    ))}
                  </p>
                )}
                <p className="sm:col-span-2"><span className="font-medium">Notes :</span> {detail.notes ? <span className="whitespace-pre-wrap">{detail.notes}</span> : "—"}</p>
              </div>

              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setWithdrawOpen(true)} disabled={!canWithdraw}>
                    <ShieldAlert className="h-4 w-4" /> Retirer le consentement
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setAnonymizeOpen(true)} disabled={!canAnonymize}>
                    <Fingerprint className="h-4 w-4" /> Anonymiser
                  </Button>
                  {!canWithdraw && detail.consentStatus !== "granted" && (
                    <span className="self-center text-xs text-muted-foreground">Le retrait s&apos;applique uniquement à un consentement accordé.</span>
                  )}
                </div>
              )}

              {/* Ajout d'activité */}
              {canWrite && !detail.anonymizedAt && (
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="text-sm font-medium">Ajouter une activité</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="a-type">Type</Label>
                      <Select value={activityType} onValueChange={setActivityType}>
                        <SelectTrigger id="a-type" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="note">Note</SelectItem>
                          <SelectItem value="task">Tâche</SelectItem>
                          <SelectItem value="call">Appel</SelectItem>
                          <SelectItem value="email">E-mail</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="a-due">Échéance (optionnelle)</Label>
                      <Input id="a-due" type="datetime-local" value={activityDueAt} onChange={(e) => setActivityDueAt(e.target.value)} />
                    </div>
                    <div className="space-y-1.5 sm:col-span-3">
                      <Label htmlFor="a-notes">Notes *</Label>
                      <Textarea id="a-notes" rows={2} value={activityNotes} onChange={(e) => setActivityNotes(e.target.value)} />
                    </div>
                  </div>
                  <Button size="sm" onClick={addActivity} disabled={activitySaving}>
                    {activitySaving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer l&apos;activité
                  </Button>
                </div>
              )}

              {/* Historique activités */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Historique des activités ({detail.activities.length})</p>
                {detail.activities.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Aucune activité enregistrée pour ce contact.</p>
                ) : (
                  <ul className="max-h-56 space-y-2 overflow-y-auto thin-scrollbar pr-1">
                    {detail.activities.map((a) => (
                      <li key={a.id} className="rounded-md border p-2.5 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">{ACTIVITY_LABELS[a.activityType] || a.activityType}</Badge>
                          <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
                          {a.dueAt && <span className="text-xs text-amber-700">Échéance : {formatDate(a.dueAt)}</span>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap">{a.notes}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Journal des consentements */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Journal des consentements ({consents.length})</p>
                {consents.length === 0 ? (
                  <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Aucun enregistrement de consentement.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Finalité</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Enregistré le</TableHead>
                          <TableHead>Retiré le</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {consents.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell>{c.purpose || "—"}</TableCell>
                            <TableCell>
                              {c.status === "granted"
                                ? <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Accordé</Badge>
                                : <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Retiré</Badge>}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{c.source || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(c.recordedAt)}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(c.withdrawnAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Confirmation retrait de consentement ── */}
      <AlertDialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer le consentement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le contact passera en « Désabonné » et ne devra plus recevoir de communications commerciales.
              Le retrait est tracé dans le journal des consentements (RGPD).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={withdrawConsent} disabled={actionBusy}>
              {actionBusy && <Loader2 className="h-4 w-4 animate-spin" />} Retirer le consentement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirmation anonymisation (irréversible) ── */}
      <AlertDialog open={anonymizeOpen} onOpenChange={setAnonymizeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonymiser ce contact ?</AlertDialogTitle>
            <AlertDialogDescription>
              Action <strong>irréversible</strong> (droit à l&apos;effacement RGPD) : nom, e-mail, téléphone et notes
              personnelles seront définitivement supprimés. Seul le tracé de consentement est conservé.
              Cette action ne peut pas être annulée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={anonymize}
              disabled={actionBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {actionBusy && <Loader2 className="h-4 w-4 animate-spin" />} Anonymiser définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
