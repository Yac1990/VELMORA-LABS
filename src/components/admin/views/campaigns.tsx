"use client";

/**
 * Vue Campagnes — tableau des campagnes d'acquisition, création et changement de statut
 * (draft / active / paused / ended) via PUT, permission content.write vérifiée côté serveur.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, formatDate } from "@/lib/client";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Megaphone, MousePointerClick, Plus } from "lucide-react";

const CHANNELS: Record<string, { label: string; cls: string }> = {
  social: { label: "Réseaux sociaux", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  email: { label: "E-mail", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  content: { label: "Contenu / SEO", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  paid: { label: "Payant", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  other: { label: "Autre", cls: "border-zinc-200 bg-zinc-100 text-zinc-600" },
};

const STATUSES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "border-zinc-200 bg-zinc-100 text-zinc-600" },
  active: { label: "Active", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  paused: { label: "En pause", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  ended: { label: "Terminée", cls: "border-zinc-200 bg-zinc-50 text-zinc-400" },
};

interface CampaignRow {
  id: string; name: string; channel: string; objective: string | null; targetCountry: string | null;
  status: string; startAt: string | null; endAt: string | null; isDemo: boolean; clickCount: number;
}

export function CampaignsView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "content.write");
  const [items, setItems] = useState<CampaignRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", channel: "social", objective: "", targetCountry: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: CampaignRow[] }>("/api/admin/campaigns");
      setItems(d.items);
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des campagnes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (form.name.trim().length < 3) { toast.error("Nom de campagne requis (3 caractères minimum)."); return; }
    const country = form.targetCountry.trim().toUpperCase();
    if (country && country.length !== 2) { toast.error("Le pays cible doit être un code à 2 lettres (ex. FR)."); return; }
    setSaving(true);
    try {
      await apiPost("/api/admin/campaigns", {
        name: form.name.trim(),
        channel: form.channel,
        objective: form.objective.trim() || null,
        targetCountry: country || null,
      });
      toast.success("Campagne créée (statut brouillon).");
      setDialogOpen(false);
      setForm({ name: "", channel: "social", objective: "", targetCountry: "" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (c: CampaignRow, next: string) => {
    try {
      await apiPut(`/api/admin/campaigns/${c.id}`, { status: next });
      toast.success(`Campagne « ${c.name} » : ${STATUSES[next]?.label ?? next}.`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> Nouvelle campagne</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Nom</th>
                  <th className="px-3 py-2.5 font-medium">Canal</th>
                  <th className="px-3 py-2.5 font-medium">Objectif</th>
                  <th className="px-3 py-2.5 font-medium">Pays cible</th>
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  <th className="px-3 py-2.5 font-medium">Clics attribués</th>
                  <th className="px-3 py-2.5 font-medium">Période</th>
                  {canWrite && <th className="px-3 py-2.5 font-medium">Statut (action)</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && !items ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={canWrite ? 8 : 7} className="px-4 py-3"><Skeleton className="h-7 w-full" /></td></tr>
                  ))
                ) : items && items.length > 0 ? (
                  items.map((c) => {
                    const ch = CHANNELS[c.channel] ?? CHANNELS.other;
                    return (
                      <tr key={c.id} className="hover:bg-zinc-50/70">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="truncate max-w-56" title={c.name}>{c.name}</span>
                            {c.isDemo && <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={ch.cls}>{ch.label}</Badge>
                        </td>
                        <td className="px-3 py-2.5 max-w-56">
                          <span className="block truncate text-muted-foreground" title={c.objective ?? ""}>{c.objective ?? "—"}</span>
                        </td>
                        <td className="px-3 py-2.5">{c.targetCountry ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={(STATUSES[c.status] ?? STATUSES.draft).cls}>
                            {(STATUSES[c.status] ?? { label: c.status }).label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-1.5 tabular-nums">
                            <MousePointerClick className="h-3.5 w-3.5 text-muted-foreground" />
                            {c.clickCount.toLocaleString("fr-FR")}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">
                          {c.startAt ? formatDate(c.startAt) : "—"} → {c.endAt ? formatDate(c.endAt) : "—"}
                        </td>
                        {canWrite && (
                          <td className="px-3 py-2.5">
                            <Select value={c.status} onValueChange={(v) => { if (v !== c.status) changeStatus(c, v); }}>
                              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={canWrite ? 8 : 7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <Megaphone className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      Aucune campagne{canWrite ? " — créez-en une" : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!canWrite && (
        <p className="text-xs text-muted-foreground">
          Lecture seule : votre rôle ne permet pas de créer ou modifier des campagnes (le serveur refuse toute écriture).
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne</DialogTitle>
            <DialogDescription>Créée en brouillon — attribuez-lui ensuite un canal actif et suivez ses clics.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Nom *</Label>
              <Input id="c-name" placeholder="ex. Soldes d'hiver FR" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={form.channel} onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(CHANNELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-country">Pays cible (2 lettres)</Label>
                <Input id="c-country" maxLength={2} placeholder="FR" value={form.targetCountry}
                  onChange={(e) => setForm((f) => ({ ...f, targetCountry: e.target.value.toUpperCase() }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-objective">Objectif</Label>
              <Input id="c-objective" placeholder="ex. Générer du trafic vers les offres formations" value={form.objective}
                onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
