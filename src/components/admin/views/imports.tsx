"use client";

/**
 * Vue Imports CSV — collage/upload, mapping des colonnes (parse client, séparateur , ou ;),
 * simulation (dry-run) puis import réel, rapport d'erreurs/doublons et historique des jobs.
 * Le mini-parseur CSV est réimplémenté côté client (aucune dépendance ajoutée).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiPost, apiGet, formatDate } from "@/lib/client";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CircleCheck, FileUp, Loader2, Play, RefreshCcwDot, TriangleAlert } from "lucide-react";

/* ───────── Mini-parseur CSV (séparateur , ou ; + guillemets) ───────── */

function parseCsvMini(text: string): { headers: string[]; rows: Record<string, string>[]; rowCount: number } {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] || "";
  const semis = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  const delimiter = semis > commas ? ";" : ",";

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const pushRecord = () => {
    if (record.some((f) => f.trim() !== "") || records.length > 0) records.push(record);
    record = [];
  };
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { record.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      record.push(field); field = ""; pushRecord();
    } else field += ch;
  }
  if (field !== "" || record.length > 0) { record.push(field); pushRecord(); }

  const [headers, ...rest] = records;
  const rows = rest.map((r) => Object.fromEntries((headers || []).map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers: headers || [], rows, rowCount: rows.length };
}

function guessMapping(headers: string[], patterns: Record<string, RegExp>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, rx] of Object.entries(patterns)) {
    const found = headers.find((h) => rx.test(h.trim().toLowerCase()));
    if (found) out[field] = found;
  }
  return out;
}

/* ───────── Types ───────── */

const PRODUCT_FIELDS: { key: string; label: string; rx: RegExp }[] = [
  { key: "title", label: "Titre du produit", rx: /^(titre|title|nom|name)/ },
  { key: "description", label: "Description", rx: /desc/ },
  { key: "price", label: "Prix", rx: /^(prix|price|montant|tarif)/ },
  { key: "currency", label: "Devise", rx: /devise|currency/ },
  { key: "category", label: "Catégorie (slug ou nom)", rx: /categ/ },
  { key: "partner", label: "Partenaire (nom exact)", rx: /partenaire|partner/ },
  { key: "url", label: "URL de destination", rx: /url|lien|link/ },
];

const CONVERSION_FIELDS: { key: string; label: string; rx: RegExp }[] = [
  { key: "partner", label: "Partenaire (nom exact)", rx: /partenaire|partner/ },
  { key: "externalId", label: "ID externe de conversion", rx: /external|conversion.?id|^id/ },
  { key: "date", label: "Date du signalement", rx: /date/ },
  { key: "status", label: "Statut", rx: /statut|status/ },
  { key: "orderValue", label: "Valeur commande", rx: /order|commande|valeur/ },
  { key: "orderCurrency", label: "Devise commande", rx: /order.?currency|devise.?commande/ },
  { key: "commission", label: "Commission", rx: /commission(?!.*(currency|devise))/ },
  { key: "commissionCurrency", label: "Devise commission", rx: /commission.?currency|devise.?commission/ },
  { key: "offerExternalId", label: "ID externe d'offre (rattachement)", rx: /offer|offre/ },
];

interface ImportError { row: number; field?: string; message: string }
interface ImportDuplicate { row: number; slug?: string; externalId?: string }
interface ImportReport {
  jobId: string; dryRun: boolean;
  counts: Record<string, number>;
  errors: ImportError[]; duplicates: ImportDuplicate[];
}
interface HistoryRow {
  id: string; importType: string; status: string; startedAt: string; finishedAt: string | null;
  counts: Record<string, number>; errorSummary: string | null;
}

const COUNT_LABELS: Record<string, string> = {
  totalRows: "Lignes détectées", created: "Créations", updated: "Mises à jour",
  imported: "Conversions importées", errors: "Erreurs", duplicates: "Doublons", skipped: "Ignorées",
};

function HistoryStatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Terminé</Badge>;
  if (status === "partial") return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Partiel</Badge>;
  return <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Échec</Badge>;
}

/* ───────── Onglet d'import générique ───────── */

interface ImportTabProps {
  kind: "products" | "conversions";
  fields: { key: string; label: string; rx: RegExp }[];
  allowed: boolean;
  onDone: () => void;
}

function ImportTab({ kind, fields, allowed, onDone }: ImportTabProps) {
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const parsed = useMemo(() => (csv.trim() ? parseCsvMini(csv) : null), [csv]);

  const onCsvChange = (text: string) => {
    setCsv(text);
    setReport(null);
    const p = parseCsvMini(text);
    setMapping(guessMapping(p.headers, Object.fromEntries(fields.map((f) => [f.key, f.rx]))));
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    onCsvChange(text);
    toast.info(`Fichier « ${file.name} » chargé (${parseCsvMini(text).rowCount} ligne(s) de données).`);
  };

  const run = async (forceReal: boolean) => {
    if (!csv.trim()) { toast.error("Collez un CSV ou chargez un fichier."); return; }
    const real = forceReal || !dryRun;
    setRunning(true);
    try {
      const res = await apiPost<ImportReport>(`/api/admin/imports/${kind}`, { csv, mapping, dryRun: !real });
      setReport(res);
      if (!real) {
        toast.success(`Simulation terminée : ${res.counts.created ?? res.counts.imported ?? 0} ligne(s) importable(s), ${res.counts.errors} erreur(s).`);
      } else {
        toast.success(`Import réel terminé — job ${res.jobId}.`);
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import impossible");
    } finally {
      setRunning(false);
    }
  };

  const dryRunOk = report?.dryRun && report.errors.length === 0;

  return (
    <div className="space-y-4">
      {!allowed && (
        <Alert>
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Permission d'import requise</AlertTitle>
          <AlertDescription>
            {kind === "products"
              ? "L'import de produits nécessite la permission imports.run (le serveur refuse sinon)."
              : "L'import de conversions nécessite la permission conversions.write (le serveur refuse sinon)."}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {kind === "products" ? "Importer des produits" : "Importer des conversions rapportées"}
          </CardTitle>
          <CardDescription>
            Collez un CSV (séparateur <code>,</code> ou <code>;</code>, guillemets acceptés) ou chargez un fichier. La première ligne sert d&apos;en-têtes pour le mapping.
            {kind === "products" && " Les produits importés arrivent toujours en brouillon, publication manuelle."}
            {kind === "conversions" && " Déduplication stricte partenaire + identifiant externe côté serveur."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`csv-${kind}`}>Contenu CSV</Label>
              <Textarea id={`csv-${kind}`} rows={6} className="font-mono text-xs"
                placeholder={"titre;description;prix;devise;categorie;partenaire;url\n…"}
                value={csv} onChange={(e) => onCsvChange(e.target.value)} disabled={!allowed} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`file-${kind}`}>… ou fichier</Label>
              <Input id={`file-${kind}`} type="file" accept=".csv,text/csv,text/plain"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)} disabled={!allowed} className="w-64" />
              {parsed && (
                <p className="text-xs text-muted-foreground">
                  {parsed.rowCount} ligne(s) de données · {parsed.headers.length} colonne(s) détectée(s)
                </p>
              )}
            </div>
          </div>

          {parsed && parsed.headers.length > 0 && (
            <div>
              <Label>Mapping des colonnes</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                    <Select value={mapping[f.key] || "__none__"}
                      onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v === "__none__" ? "" : v }))}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Colonne…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Ignorer —</SelectItem>
                        {parsed.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Switch checked={dryRun} onCheckedChange={(v) => setDryRun(v === true)} disabled={!allowed || running} />
              Simuler (dry-run — aucune écriture)
            </label>
            <Button onClick={() => run(false)} disabled={!allowed || running || !csv.trim()}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {dryRun ? "Lancer la simulation" : "Lancer l'import"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {report.dryRun ? <RefreshCcwDot className="h-4 w-4 text-primary" /> : <CircleCheck className="h-4 w-4 text-emerald-600" />}
              Rapport d&apos;import — job {report.jobId} {report.dryRun ? "(simulation)" : "(réel)"}
            </CardTitle>
            <CardDescription>Aucun chiffre estimé : ces compteurs proviennent du serveur.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(report.counts).map(([k, v]) => (
                <Badge key={k} variant={k === "errors" && v > 0 ? "outline" : "secondary"}
                  className={k === "errors" && v > 0 ? "border-red-200 bg-red-50 text-red-700" : k === "duplicates" && v > 0 ? "border-amber-200 bg-amber-50 text-amber-700" : ""}>
                  {COUNT_LABELS[k] ?? k} : {v.toLocaleString("fr-FR")}
                </Badge>
              ))}
            </div>

            {report.errors.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-red-700">Erreurs ({report.errors.length}, 50 max affichées)</p>
                <div className="overflow-x-auto rounded-md border max-h-60 overflow-y-auto thin-scrollbar">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-50 text-left text-muted-foreground">
                      <tr><th className="px-3 py-2 font-medium">Ligne</th><th className="px-3 py-2 font-medium">Champ</th><th className="px-3 py-2 font-medium">Message</th></tr>
                    </thead>
                    <tbody className="divide-y">
                      {report.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
                          <td className="px-3 py-1.5 font-mono">{e.field ?? "—"}</td>
                          <td className="px-3 py-1.5">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {report.duplicates.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-medium text-amber-700">Doublons ({report.duplicates.length})</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto thin-scrollbar rounded-md border p-2 text-xs text-muted-foreground">
                  {report.duplicates.map((d, i) => (
                    <li key={i}>Ligne {d.row} : {d.slug ? `slug « ${d.slug} »` : `ID externe « ${d.externalId ?? "?"} »`} déjà présent.</li>
                  ))}
                </ul>
              </div>
            )}

            {dryRunOk && (
              <Alert className="border-emerald-200 bg-emerald-50">
                <CircleCheck className="h-4 w-4 text-emerald-600" />
                <AlertTitle className="text-emerald-800">Simulation réussie sans erreur</AlertTitle>
                <AlertDescription className="text-emerald-800/90">
                  Vous pouvez lancer l&apos;import réel — les mêmes données seront écrites en base.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setReport(null)}>Fermer le rapport</Button>
              {dryRunOk && (
                <Button onClick={() => run(true)} disabled={running}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Lancer l&apos;import réel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ───────── Vue ───────── */

export function ImportsView({ user }: { user: AdminUser }) {
  const canProducts = hasPermission(user.role, "imports.run");
  const canConversions = hasPermission(user.role, "conversions.write");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const d = await apiGet<{ items: HistoryRow[] }>("/api/admin/imports/history");
      setHistory(d.items);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    // Différé en microtask : pas de setState synchrone dans l'effet (règle react-hooks)
    Promise.resolve().then(loadHistory);
  }, [loadHistory]);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products" className="gap-1.5"><FileUp className="h-3.5 w-3.5" /> Produits</TabsTrigger>
          <TabsTrigger value="conversions" className="gap-1.5"><FileUp className="h-3.5 w-3.5" /> Conversions</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ImportTab kind="products" fields={PRODUCT_FIELDS} allowed={canProducts} onDone={loadHistory} />
        </TabsContent>
        <TabsContent value="conversions">
          <ImportTab kind="conversions" fields={CONVERSION_FIELDS} allowed={canConversions} onDone={loadHistory} />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des imports (50 derniers)</CardTitle>
          <CardDescription>Statuts serveur : terminé, partiel ou échec — compteurs réels de chaque job.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  <th className="px-3 py-2.5 font-medium">Début</th>
                  <th className="px-3 py-2.5 font-medium">Fin</th>
                  <th className="px-3 py-2.5 font-medium">Compteurs</th>
                  <th className="px-3 py-2.5 font-medium">Erreurs (tronquées)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {history === null ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    <FileUp className="mx-auto mb-2 h-8 w-8 opacity-40" />
                    Aucun import enregistré — lancez votre première simulation ci-dessus.
                  </td></tr>
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-2.5 font-medium">{h.importType === "products" ? "Produits" : "Conversions"}</td>
                      <td className="px-3 py-2.5"><HistoryStatusBadge status={h.status} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{formatDate(h.startedAt)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{h.finishedAt ? formatDate(h.finishedAt) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs">
                        {Object.entries(h.counts).map(([k, v]) => `${COUNT_LABELS[k] ?? k} : ${v}`).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 max-w-72">
                        <span className="block truncate text-xs text-muted-foreground" title={h.errorSummary ?? ""}>{h.errorSummary ?? "—"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
