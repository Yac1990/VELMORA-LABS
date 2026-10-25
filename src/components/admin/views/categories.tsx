"use client";

/**
 * Vue Catégories — tableau + création/édition, activation/désactivation, suppression
 * (le serveur renvoie `deactivated` si des produits y sont rattachés).
 */
import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, formatDate } from "@/lib/client";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";

interface CategoryRow {
  id: string; slug: string; name: string; description: string | null; icon: string | null;
  sortOrder: number; isActive: boolean; productCount: number; updatedAt: string;
}

interface CategoryForm {
  name: string; slug: string; slugTouched: boolean; description: string; icon: string; sortOrder: string;
}

const EMPTY_FORM: CategoryForm = { name: "", slug: "", slugTouched: false, description: "", icon: "", sortOrder: "100" };

export function CategoriesView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "catalog.write");
  const [items, setItems] = useState<CategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<{ items: CategoryRow[] }>("/api/admin/categories");
      setItems(d.items);
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des catégories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };

  const openEdit = (c: CategoryRow) => {
    setEditingId(c.id);
    setForm({ name: c.name, slug: c.slug, slugTouched: true, description: c.description ?? "", icon: c.icon ?? "", sortOrder: String(c.sortOrder) });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (form.name.trim().length < 2) { toast.error("Nom de catégorie requis (2 caractères minimum)."); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        slug: (form.slug.trim() || form.name.trim()).toLowerCase(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        sortOrder: parseInt(form.sortOrder, 10) || 100,
      };
      if (editingId) {
        await apiPut(`/api/admin/categories/${editingId}`, body);
        toast.success("Catégorie mise à jour.");
      } else {
        await apiPost("/api/admin/categories", body);
        toast.success("Catégorie créée.");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: CategoryRow, next: boolean) => {
    try {
      await apiPut(`/api/admin/categories/${c.id}`, { isActive: next });
      toast.success(next ? "Catégorie activée." : "Catégorie désactivée.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiDelete<{ deactivated?: boolean; deleted?: boolean; message?: string }>(`/api/admin/categories/${deleteTarget.id}`);
      if (res.deactivated) toast.info(res.message ?? "Catégorie désactivée (des produits y sont rattachés).");
      else toast.success("Catégorie supprimée.");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Suppression impossible");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canWrite && (
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nouvelle catégorie</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Slug</th>
                  <th className="px-3 py-2.5 font-medium">Nom</th>
                  <th className="px-3 py-2.5 font-medium">Icône</th>
                  <th className="px-3 py-2.5 font-medium">Ordre</th>
                  <th className="px-3 py-2.5 font-medium">Active</th>
                  <th className="px-3 py-2.5 font-medium">Produits</th>
                  <th className="px-3 py-2.5 font-medium">Mise à jour</th>
                  {canWrite && <th className="px-3 py-2.5 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && !items ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}><td colSpan={canWrite ? 8 : 7} className="px-4 py-3"><Skeleton className="h-7 w-full" /></td></tr>
                  ))
                ) : items && items.length > 0 ? (
                  items.map((c) => (
                    <tr key={c.id} className={`hover:bg-zinc-50/70 ${c.isActive ? "" : "opacity-60"}`}>
                      <td className="px-4 py-2.5 font-mono text-xs">/{c.slug}</td>
                      <td className="px-3 py-2.5 font-medium">{c.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.icon ?? "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{c.sortOrder}</td>
                      <td className="px-3 py-2.5">
                        {canWrite ? (
                          <Switch checked={c.isActive} onCheckedChange={(v) => toggleActive(c, v === true)}
                            aria-label={`Activer/désactiver ${c.name}`} />
                        ) : (
                          <Badge variant="outline" className={c.isActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-zinc-200 bg-zinc-100 text-zinc-500"}>
                            {c.isActive ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{c.productCount}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{formatDate(c.updatedAt)}</td>
                      {canWrite && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)} aria-label={`Modifier ${c.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(c)} aria-label={`Supprimer ${c.name}`}>
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
                      <Tags className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      Aucune catégorie{canWrite ? " — créez-en une" : ""}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle>
            <DialogDescription>Le slug sert d&apos;identifiant stable (URL, imports CSV).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Nom *</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm((f) => ({
                ...f, name: e.target.value, slug: f.slugTouched ? f.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
              }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-slug">Slug *</Label>
              <Input id="cat-slug" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase(), slugTouched: true }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea id="cat-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cat-icon">Icône (nom lucide)</Label>
                <Input id="cat-icon" placeholder="ex. Laptop" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-order">Ordre d&apos;affichage</Label>
                <Input id="cat-order" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
              </div>
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
            <AlertDialogTitle>Supprimer la catégorie « {deleteTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Si des produits y sont rattachés, elle sera désactivée au lieu d&apos;être supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} className="bg-red-600 hover:bg-red-700">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
