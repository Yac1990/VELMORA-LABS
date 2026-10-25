"use client";

/**
 * Vue Tableau de bord — indicateurs RÉELS (clics ≠ ventes), source de données explicite,
 * filtres de période, séries quotidiennes, top listes et exports CSV.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDownload, apiGet, formatCents, formatDate } from "@/lib/client";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  AlertTriangle, Download, Info, Link2Off, MousePointerClick, Percent, RefreshCw,
  ShoppingBag, TrendingUp, Trophy,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const CONV_STATUS_LABELS: Record<string, string> = {
  estimated: "Estimée",
  pending: "En attente",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  paid: "Payée",
  unknown: "Inconnu",
};

const PERIODS: { value: string; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "7d", label: "7 derniers jours" },
  { value: "month", label: "Mois courant" },
  { value: "quarter", label: "Trimestre courant" },
  { value: "year", label: "Année courante" },
  { value: "30d", label: "30 derniers jours" },
  { value: "custom", label: "Personnalisée…" },
];

interface DashboardData {
  meta: {
    periodLabel: string;
    start: string;
    end: string;
    timezone: string;
    includeDemo: boolean;
    dataSource: string;
    generatedAt: string;
    comparisonLabel: string;
  };
  clicks: { total: number; unique: number; previous: number; deltaPct: number | null; note: string };
  conversions: { byStatus: Record<string, number>; total: number; note: string };
  commissions: { byStatus: Record<string, number>; totalCents: number; prevTotalCents: number; note: string };
  series: { clicks: { day: string; count: number }[]; conversions: { day: string; count: number }[] };
  topOffers: { offerId: string; clicks: number; title: string; slug: string | null }[];
  topCategories: { name: string; clicks: number }[];
  topPartners: { name: string; clicks: number; isDemo: boolean }[];
  topConversions: {
    productId: string;
    title: string;
    slug: string;
    isDemo: boolean;
    total: number;
    byStatus: { estimated: number; pending: number; confirmed: number; cancelled: number; paid: number; unknown: number };
    commissionTotals: { currency: string; amountCents: number }[];
  }[];
  bestSeller: { productId: string; title: string; slug: string; isDemo: boolean; conversions: number; basis: string } | null;
  topConversionsNote: string;
  health: { campaignsCount: number; brokenLinks: number };
}

export function DashboardView({ user: _user }: { user: AdminUser }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeDemo, setIncludeDemo] = useState(true);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period, includeDemo: includeDemo ? "true" : "false" });
      if (period === "custom") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }
      setData(await apiGet<DashboardData>(`/api/admin/dashboard?${params.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [period, from, to, includeDemo]);

  useEffect(() => { load(); }, [load]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const days = Array.from(new Set([
      ...data.series.clicks.map((p) => p.day),
      ...data.series.conversions.map((p) => p.day),
    ])).sort();
    const clicksByDay = new Map(data.series.clicks.map((p) => [p.day, p.count]));
    const convByDay = new Map(data.series.conversions.map((p) => [p.day, p.count]));
    return days.map((d) => ({
      day: d.slice(5),
      clics: clicksByDay.get(d) ?? 0,
      conversions: convByDay.get(d) ?? 0,
    }));
  }, [data]);

  const exportCsv = async (type: "dashboard" | "clicks" | "conversions") => {
    try {
      await apiDownload(
        `/api/admin/export/${type}?days=90&includeDemo=${includeDemo ? "true" : "false"}`,
        `velmora-export-${type}-${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast.info("Export CSV téléchargé (90 derniers jours, fuseau UTC).");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'export");
    }
  };

  const convEntries = Object.entries(data?.conversions.byStatus ?? {}).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6">
      {/* Bandeau d'explicitation des données */}
      <Alert className="border-blue-200 bg-blue-50/60">
        <Info className="h-4 w-4 text-primary" />
        <AlertTitle>Source des données affichées</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-foreground/90 max-w-2xl">
            {data?.meta.dataSource ?? "Chargement de la source…"}
          </span>
          <label className="flex items-center gap-2 shrink-0 text-sm font-medium">
            <Switch
              checked={includeDemo}
              onCheckedChange={(v) => setIncludeDemo(v === true)}
              aria-label="Inclure les données de démonstration"
            />
            Inclure les données de démonstration
          </label>
        </AlertDescription>
      </Alert>

      {/* Filtres + exports */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="dash-period">Période</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger id="dash-period" className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dash-from">Du</Label>
                <Input id="dash-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dash-to">Au</Label>
                <Input id="dash-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
            </>
          )}
          <Button variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => exportCsv("dashboard")}>
              <Download className="h-4 w-4" /> Export synthèse
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportCsv("clicks")}>
              <Download className="h-4 w-4" /> Export clics
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportCsv("conversions")}>
              <Download className="h-4 w-4" /> Export conversions
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Erreur de chargement</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-3 w-40" />
            </CardContent></Card>
          ))}
        </div>
      ) : data ? (
        <>
          {/* Alerte liens cassés */}
          {data.health.brokenLinks > 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <Link2Off className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">{data.health.brokenLinks} lien(s) de redirection cassé(s)</AlertTitle>
              <AlertDescription className="text-amber-800/90">
                Des offres pointent vers des URL inaccessibles. Corrigez-les dans Catalogue → Produits (section offres).
              </AlertDescription>
            </Alert>
          )}

          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5 text-primary" /> Clics sortants
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{data.clicks.total.toLocaleString("fr-FR")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>{data.clicks.unique.toLocaleString("fr-FR")} session(s) unique(s)</p>
                <p>
                  Évolution :{" "}
                  <span className={`font-semibold ${data.clicks.deltaPct == null ? "" : data.clicks.deltaPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {data.clicks.deltaPct == null ? "—" : `${data.clicks.deltaPct > 0 ? "+" : ""}${data.clicks.deltaPct} %`}
                  </span>{" "}
                  <span className="opacity-70">({data.meta.comparisonLabel})</span>
                </p>
                <p className="italic">{data.clicks.note} <strong>Un clic ≠ une vente.</strong></p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5 text-primary" /> Conversions rapportées
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{data.conversions.total.toLocaleString("fr-FR")}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1.5">
                {convEntries.length === 0 ? (
                  <p>Aucune conversion rapportée sur la période.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {convEntries.map(([status, n]) => (
                      <Badge key={status} variant="outline" className="text-[11px]">
                        {CONV_STATUS_LABELS[status] ?? status} : {n.toLocaleString("fr-FR")}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="italic">{data.conversions.note}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-primary" /> Commissions du site
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{formatCents(data.commissions.totalCents)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>Période précédente : {formatCents(data.commissions.prevTotalCents)}</p>
                <p className="italic">{data.commissions.note} <strong>Commissions du site ≠ CA marchand.</strong></p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Link2Off className="h-3.5 w-3.5 text-primary" /> Liens cassés
                </CardDescription>
                <CardTitle className={`text-3xl tabular-nums ${data.health.brokenLinks > 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {data.health.brokenLinks}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <p>{data.health.campaignsCount} campagne(s) enregistrée(s)</p>
                <p className="italic">Vérification des URL de destination des offres (statut « broken »).</p>
              </CardContent>
            </Card>
          </div>

          {/* Série quotidienne */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" /> Clics et conversions par jour
              </CardTitle>
              <CardDescription>
                {data.meta.periodLabel} — fuseau {data.meta.timezone}. Clics = redirections vers les partenaires (pas des ventes).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée sur la période sélectionnée.
                </div>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gConv" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                        formatter={(value: number | string) => (typeof value === "number" ? value.toLocaleString("fr-FR") : value)}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="clics" stroke="var(--chart-1)" fill="url(#gClicks)" strokeWidth={2} />
                      <Area type="monotone" dataKey="conversions" stroke="var(--chart-2)" fill="url(#gConv)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Produits les plus achetés — conversions rapportées, jamais des ventes certaines */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                Produits les plus achetés
              </CardTitle>
              <CardDescription>
                {data.meta.periodLabel} — classement par conversions rapportées (signalées par les partenaires ou importées). Un statut « confirmée » ou « payée » est plus fiable qu'une simple estimation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.bestSeller ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3" role="status">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700" aria-hidden="true">
                    <Trophy className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight">
                      Le mieux acheté : {data.bestSeller.title}
                      {data.bestSeller.isDemo ? " " : ""}
                      {data.bestSeller.isDemo && <Badge variant="outline" className="ml-1 border-amber-300 bg-white text-amber-700">Démo</Badge>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {data.bestSeller.conversions.toLocaleString("fr-FR")} conversion{data.bestSeller.conversions > 1 ? "s" : ""} — {data.bestSeller.basis}.
                    </p>
                  </div>
                </div>
              ) : null}
              {data.topConversions.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucune conversion rapportée sur la période — le classement apparaîtra dès que des conversions seront enregistrées ou importées.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-1.5 pr-2 font-medium">#</th>
                        <th scope="col" className="py-1.5 pr-2 font-medium">Produit</th>
                        <th scope="col" className="py-1.5 pr-2 font-medium text-right">Rapportées</th>
                        <th scope="col" className="py-1.5 pr-2 font-medium">Répartition par statut</th>
                        <th scope="col" className="py-1.5 font-medium text-right">Commissions (devise d'origine)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topConversions.map((p, i) => (
                        <tr key={p.productId} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-2">
                            <span className="flex flex-wrap items-center gap-1.5 font-medium">
                              <span className="max-w-[220px] truncate" title={p.title}>{p.title}</span>
                              {p.isDemo && <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>}
                            </span>
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums font-semibold">{p.total.toLocaleString("fr-FR")}</td>
                          <td className="py-2 pr-2">
                            <span className="flex flex-wrap gap-1">
                              {Object.entries(p.byStatus).filter(([, n]) => n > 0).map(([status, n]) => (
                                <Badge
                                  key={status}
                                  variant="outline"
                                  className={
                                    status === "confirmed" ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : status === "paid" ? "border-violet-300 bg-violet-50 text-violet-700"
                                    : status === "pending" ? "border-amber-300 bg-amber-50 text-amber-700"
                                    : status === "cancelled" ? "border-red-300 bg-red-50 text-red-700"
                                    : status === "estimated" ? "border-sky-300 bg-sky-50 text-sky-700"
                                    : "border-zinc-300 bg-zinc-50 text-zinc-600"
                                  }
                                >
                                  {CONV_STATUS_LABELS[status] || status} : {n}
                                </Badge>
                              ))}
                            </span>
                          </td>
                          <td className="py-2 text-right tabular-nums text-xs text-muted-foreground">
                            {p.commissionTotals.length === 0
                              ? "—"
                              : p.commissionTotals.map((c) => formatCents(c.amountCents, c.currency)).join(" + ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{data.topConversionsNote}</p>
            </CardContent>
          </Card>

          {/* Top listes */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top produits cliqués</CardTitle></CardHeader>
              <CardContent>
                {data.topOffers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aucun clic enregistré sur la période.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topOffers.map((o) => (
                      <li key={o.offerId} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate" title={o.title}>{o.title}</span>
                        <Badge variant="secondary" className="shrink-0 tabular-nums">{o.clicks.toLocaleString("fr-FR")} clics</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top catégories</CardTitle></CardHeader>
              <CardContent>
                {data.topCategories.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topCategories.map((c) => (
                      <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{c.name}</span>
                        <Badge variant="secondary" className="shrink-0 tabular-nums">{c.clicks.toLocaleString("fr-FR")} clics</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Top partenaires</CardTitle></CardHeader>
              <CardContent>
                {data.topPartners.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Aucune donnée sur la période.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topPartners.map((p) => (
                      <li key={p.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{p.name}</span>
                          {p.isDemo && <Badge variant="outline" className="shrink-0 border-amber-300 bg-amber-50 text-amber-700">Démo</Badge>}
                        </span>
                        <Badge variant="secondary" className="shrink-0 tabular-nums">{p.clicks.toLocaleString("fr-FR")} clics</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Footer de section */}
          <p className="text-xs text-muted-foreground">
            Période : {data.meta.periodLabel} ({formatDate(data.meta.start)} → {formatDate(data.meta.end)}) ·
            Fuseau de référence : {data.meta.timezone} ·
            Généré le {formatDate(data.meta.generatedAt)} ·
            <span className="normal-case"> {data.meta.includeDemo ? "Données démo incluses" : "Données réelles uniquement"}</span>
          </p>
        </>
      ) : null}
    </div>
  );
}
