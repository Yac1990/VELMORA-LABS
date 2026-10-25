"use client";

/**
 * Journal d'audit — lecture seule (append-only côté serveur), pagination simple,
 * métadonnées dépliables. Contrat API : GET /api/admin/audit?page=&perPage=.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import { apiGet, formatDate } from "@/lib/client";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronRight, Lock } from "lucide-react";

// ─────────────────────────── Types (forme exacte de l'API) ───────────────────────────

interface AuditItem {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  perPage: number;
}

// ─────────────────────────── Vue ───────────────────────────

export function AuditView({ user }: { user: AdminUser }) {
  void user; // vue en lecture seule : aucune action dépendante du rôle
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const data = await apiGet<AuditResponse>(`/api/admin/audit?page=${targetPage}&perPage=${perPage}`);
      setItems(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement du journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50 text-blue-900">
        <Lock className="h-4 w-4" />
        <AlertTitle>Journal append-only, lecture seule</AlertTitle>
        <AlertDescription>
          Aucune entrée ne peut être modifiée ou supprimée depuis l&apos;interface — le journal est écrit uniquement par le serveur.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Journal d&apos;audit</CardTitle>
              <CardDescription>
                {loading ? "Chargement…" : `${total} entrée${total > 1 ? "s" : ""} — page ${page} sur ${totalPages}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => load(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Précédent
              </Button>
              <Button variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => load(page + 1)}>
                Suivant <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" aria-label="Détails" />
                  <TableHead>Date</TableHead>
                  <TableHead>Acteur</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Aucune entrée dans le journal pour le moment.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((a) => (
                    <Fragment key={a.id}>
                      <TableRow
                        className={a.metadata ? "cursor-pointer" : undefined}
                        onClick={() => { if (a.metadata) setExpandedId(expandedId === a.id ? null : a.id); }}
                        title={a.metadata ? "Cliquer pour afficher les métadonnées" : undefined}
                      >
                        <TableCell>
                          {a.metadata ? (
                            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === a.id ? "rotate-180" : ""}`} />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(a.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground">{a.actorEmail || "système"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[11px]">{a.action}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.entityType ? `${a.entityType}${a.entityId ? ` · ${a.entityId.slice(-8)}` : ""}` : "—"}
                        </TableCell>
                      </TableRow>
                      {expandedId === a.id && a.metadata && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/40">
                            <pre className="max-h-48 overflow-auto thin-scrollbar rounded-md border bg-white p-3 text-xs">
                              {JSON.stringify(a.metadata, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
