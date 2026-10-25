"use client";

/**
 * Carte « Taux de change (temps réel) » — vue Paramètres du back-office (composant autonome).
 * Données RÉELLES du fournisseur open.er-api.com stockées en base — aucun taux simulé,
 * aucun repli approximé : en cas d'échec, l'état vide ou périmé est affiché tel quel.
 * Contrat API : GET /api/admin/rates (settings.read) · POST /api/admin/rates (settings.write).
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, formatDate } from "@/lib/client";
import { currencyLabel } from "@/lib/money";
import { hasPermission } from "@/lib/rbac";
import type { AdminUser } from "@/components/admin/admin-app";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeftRight, RefreshCw } from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface RatesResponse {
  source: string;
  base: string;
  provider: string | null;
  fetchedAt: string | null;
  stale: boolean;
  rates: Record<string, number>;
  error?: string;
  config: { displayCurrencies: string[]; referenceCurrency: string };
}

function formatRate(rate: number): string {
  try {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(rate);
  } catch {
    return String(rate);
  }
}

// ─────────────────────────── Composant ───────────────────────────

export function SettingsFxCard({ user }: { user?: AdminUser | null }) {
  // Sans prop user (non câblée), on affiche le bouton : le serveur applique de toute façon le RBAC.
  const canRefresh = user ? hasPermission(user.role, "settings.write") : true;

  const [data, setData] = useState<RatesResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<RatesResponse>("/api/admin/rates");
      setData(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erreur de chargement des taux de change");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await apiPost<RatesResponse>("/api/admin/rates", {});
      setData(fresh);
      setLoadError(null);
      const pairs = Object.keys(fresh.rates).filter((c) => c !== fresh.base).length;
      toast.success(`Taux réels actualisés depuis ${fresh.provider || "le fournisseur"} (${pairs} paire${pairs > 1 ? "s" : ""} stockée${pairs > 1 ? "s" : ""}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'actualisation des taux");
    } finally {
      setRefreshing(false);
    }
  };

  const rates = data?.rates ?? {};
  const displayRows = (data?.config.displayCurrencies ?? []).filter((c) => c !== (data?.base || "EUR"));
  const hasRates = Object.keys(rates).length > 0;
  const totalPairs = Object.keys(rates).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden="true" />
              Taux de change (temps réel)
            </CardTitle>
            <CardDescription>
              Taux réels base EUR fournis par une API de change publique, stockés en base et
              actualisés automatiquement au-delà de 6 h — jamais de valeur simulée.
            </CardDescription>
          </div>
          {canRefresh && (
            <Button onClick={refresh} disabled={refreshing} aria-label="Actualiser les taux de change depuis le fournisseur">
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              {refreshing ? "Actualisation…" : "Actualiser maintenant"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement des taux de change">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : !data ? (
          <p className="text-sm text-destructive" role="alert">
            Chargement impossible : {loadError || "erreur inconnue"}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <span>
                Fournisseur : <span className="font-medium">{data.provider || "—"}</span>
              </span>
              <span className="text-muted-foreground">
                Dernière récupération : {formatDate(data.fetchedAt)}
              </span>
              {hasRates ? (
                data.stale ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">périmé</Badge>
                ) : (
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">À jour</Badge>
                )
              ) : null}
            </div>

            {data.error && (
              <p className="text-xs text-amber-700">
                Dernière tentative d&apos;actualisation automatique : {data.error}
              </p>
            )}

            {!hasRates ? (
              <p className="text-sm text-muted-foreground">
                Aucun taux disponible — lancez une actualisation.
              </p>
            ) : displayRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune devise d&apos;affichage configurée en dehors de la devise de base ({data.base}).
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Devise</TableHead>
                    <TableHead scope="col">Taux (1 EUR = …)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map((code) => {
                    const rate = rates[code];
                    return (
                      <TableRow key={code}>
                        <TableCell>
                          <span className="font-medium">{code}</span>
                          <span className="text-muted-foreground"> — {labelSuffix(code)}</span>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {typeof rate === "number" ? formatRate(rate) : <span title="Taux absent de la dernière récupération — actualisez.">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <p className="text-xs text-muted-foreground">
              {totalPairs} paire{totalPairs > 1 ? "s" : ""} EUR stockée{totalPairs > 1 ? "s" : ""} au total
              {" "}· la matrice complète du fournisseur (~160 devises) est archivée dans les réglages
              (clé <span className="font-mono">fx.latest.json</span>).
            </p>
            {!canRefresh && (
              <p className="text-xs text-muted-foreground">
                L&apos;actualisation manuelle nécessite la permission settings.write (RBAC vérifié côté serveur).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Nom lisible de la devise (« Dollar américain ») à partir de la liste connue du back-office ;
 * devise hors liste → le code brut s'affiche, rien n'est inventé.
 */
function labelSuffix(code: string): string {
  const label = currencyLabel(code);
  return label === code ? code : label.replace(/^[A-Z]{3} — /, "");
}
