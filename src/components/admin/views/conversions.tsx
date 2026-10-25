"use client";

/**
 * Vue Conversions rapportées — filtres (statut, données de démo), pagination,
 * changement de statut avec confirmation (conversions.write, vérifié côté serveur).
 * Rappel métier : conversions rapportées ≠ ventes certaines.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut, formatCents, formatDate } from "@/lib/client";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Info, Loader2, ReceiptText } from "lucide-react";

const CONV_STATUSES: Record<string, { label: string; cls: string }> = {
  estimated: { label: "Estimée", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  pending: { label: "En attente", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  confirmed: { label: "Confirmée", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Annulée", cls: "border-red-200 bg-red-50 text-red-700" },
  paid: { label: "Payée", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  unknown: { label: "Inconnu", cls: "border-zinc-200 bg-zinc-100 text-zinc-600" },
};

interface ConversionRow {
  id: string; partnerName: string; isDemo: boolean; externalConversionId: string | null;
  reportedAt: string; status: string;
  orderValueCents: number | null; orderCurrency: string | null;
  commissionAmountCents: number | null; commissionCurrency: string | null;
  sourceReportId: string | null; productTitle: string | null; note: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const s = CONV_STATUSES[status] ?? CONV_STATUSES.unknown;
  return <Badge variant="outline" className={`shrink-0 ${s.cls}`}>{s.label}</Badge>;
}

export function ConversionsView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "conversions.write");
  const [items, setItems] = useState<ConversionRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [includeDemo, setIncludeDemo] = useState(true);
  // Changement de statut : cible + nouveau statut, confirmé via AlertDialog
  const [statusTarget, setStatusTarget] = useState<{ row: ConversionRow; next: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  const perPage = 25;

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), perPage: String(perPage), includeDemo: includeDemo ? "true" : "false" });
      if (status !== "all") params.set("status", status);
      const d = await apiGet<{ items: ConversionRow[]; total: number }>(`/api/admin/conversions?${params.toString()}`);
      setItems(d.items);
      setTotal(d.total);
    } catch (e) {
      setItems([]);
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des conversions");
    } finally {
      setLoading(false);
    }
  }, [status, includeDemo]);

  useEffect(() => { load(1); setPage(1); }, [load]);

  const applyStatusChange = async () => {
    if (!statusTarget) return;
    setUpdating(true);
    try {
      await apiPut("/api/admin/conversions", { id: statusTarget.row.id, status: statusTarget.next });
      toast.success(`Statut mis à jour : ${CONV_STATUSES[statusTarget.next]?.label ?? statusTarget.next} (transaction de commission journalisée).`);
      setStatusTarget(null);
      load(page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50/60">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle>Conversions rapportées ≠ ventes certaines</AlertTitle>
        <AlertDescription>
          Ces signalements proviennent des partenaires ou des imports CSV. Leur statut suit le cycle estimée → en attente → confirmée → payée (ou annulée). Les commissions associées ne deviennent un revenu certain qu&apos;une fois confirmées puis payées.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="conv-status">Statut</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="conv-status" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                {Object.entries(CONV_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium pb-2">
            <Switch checked={includeDemo} onCheckedChange={(v) => setIncludeDemo(v === true)}
              aria-label="Inclure les données de démonstration" />
            Inclure les données de démonstration
          </label>
          <div className="ml-auto pb-2 text-sm text-muted-foreground">{total.toLocaleString("fr-FR")} conversion(s) au total</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Partenaire</th>
                  <th className="px-3 py-2.5 font-medium">Produit</th>
                  <th className="px-3 py-2.5 font-medium">ID externe</th>
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  <th className="px-3 py-2.5 font-medium">Valeur commande</th>
                  <th className="px-3 py-2.5 font-medium">Commission</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  {canWrite && <th className="px-3 py-2.5 font-medium">Changer le statut</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && !items ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}><td colSpan={canWrite ? 9 : 8} className="px-4 py-3"><Skeleton className="h-7 w-full" /></td></tr>
                  ))
                ) : items && items.length > 0 ? (
                  items.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{formatDate(c.reportedAt)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{c.partnerName}</span>
                          {c.isDemo && <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 max-w-48">
                        <span className="block truncate" title={c.productTitle ?? ""}>{c.productTitle ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.externalConversionId ?? "—"}</td>
                      <td className="px-3 py-2.5"><StatusBadge status={c.status} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                        {c.orderValueCents != null ? formatCents(c.orderValueCents, c.orderCurrency || "EUR") : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                        {c.commissionAmountCents != null ? formatCents(c.commissionAmountCents, c.commissionCurrency || "EUR") : "inconnu"}
                      </td>
                      <td className="px-3 py-2.5 max-w-40">
                        <span className="block truncate font-mono text-xs text-muted-foreground" title={c.sourceReportId ?? ""}>{c.sourceReportId ?? "—"}</span>
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2.5">
                          <Select value={c.status} onValueChange={(v) => { if (v !== c.status) setStatusTarget({ row: c, next: v }); }}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(CONV_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={canWrite ? 9 : 8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      <ReceiptText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      Aucune conversion rapportée pour ces filtres.
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
          <span>Page {page} / {totalPages} — {total} conversion(s)</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Précédent</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((v) => v + 1)}>Suivant</Button>
        </div>
      )}

      <AlertDialog open={!!statusTarget} onOpenChange={(o) => { if (!o) setStatusTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Changer le statut de la conversion ?</AlertDialogTitle>
            <AlertDialogDescription>
              « {statusTarget?.row.externalConversionId ?? statusTarget?.row.id} » ({statusTarget?.row.partnerName}) :{" "}
              {statusTarget && <strong>{CONV_STATUSES[statusTarget.row.status]?.label} → {CONV_STATUSES[statusTarget.next]?.label}</strong>}.
              Une transaction de commission sera journalisée pour tracer ce changement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); applyStatusChange(); }} disabled={updating}>
              {updating && <Loader2 className="h-4 w-4 animate-spin" />} Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
