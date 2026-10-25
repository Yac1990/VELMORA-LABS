"use client";

/**
 * Carte « E-mails (SMTP) » — vue Paramètres de l'administration.
 * Contrat API :
 *  - GET  /api/admin/email/config  → état réel de la configuration (aucun secret renvoyé) ;
 *  - POST /api/admin/email/test    → envoi d'un e-mail de test RÉEL (owner / catalog_manager) ;
 *  - GET  /api/admin/email/logs    → journal d'envoi (aperçus tronqués, jamais les corps complets).
 * Honnêteté d'affichage : le statut renvoyé par l'API est affiché tel quel —
 * "sent" uniquement si le serveur SMTP a accepté le message, "failed" avec
 * l'erreur réelle, "queued" si SMTP n'est pas configuré. Aucune réussite simulée.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, formatDate } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Mail, Send, ShieldCheck } from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface EmailConfig {
  configured: boolean;
  host: string | null;
  port: number | null;
  from: string | null;
  toAdmin: string | null;
  secure: boolean;
  hasAuth: boolean;
}

interface EmailLogRow {
  id: string;
  toEmail: string;
  subject: string;
  purpose: string;
  status: string; // queued | sent | failed | suppressed
  provider: string | null;
  smtpHost: string | null;
  errorMessage: string | null;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
  bodyPreview: string;
}

interface EmailLogsResponse {
  logs: EmailLogRow[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  countsByStatus: Record<string, number>;
}

interface TestEmailResponse {
  ok: boolean;
  status: string;
  logId: string;
  error?: string;
  reason?: string;
}

const SMTP_ENV_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "SMTP_USER", "SMTP_PASS", "SMTP_TO_ADMIN"];

const PURPOSE_LABELS: Record<string, string> = {
  inquiry_notification: "Notification demande",
  admin_test: "Test SMTP",
  crm_followup: "Relance CRM",
  contact_confirmation: "Accusé de réception",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "sent") {
    return <Badge variant="outline" className="shrink-0 border-green-200 bg-green-50 text-green-700">Envoyé</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="outline" className="shrink-0 border-red-200 bg-red-50 text-red-700">Échec</Badge>;
  }
  if (status === "queued") {
    return <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-50 text-amber-700">En file</Badge>;
  }
  return <Badge variant="outline" className="shrink-0 border-zinc-200 bg-zinc-100 text-zinc-500">{status}</Badge>;
}

// ─────────────────────────── Composant ───────────────────────────

export function SettingsEmailCard() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [logsData, setLogsData] = useState<EmailLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);

  const loadConfig = useCallback(async () => {
    const d = await apiGet<EmailConfig>("/api/admin/email/config");
    setConfig(d);
  }, []);

  const loadLogs = useCallback(async () => {
    const d = await apiGet<EmailLogsResponse>("/api/admin/email/logs?perPage=8");
    setLogsData(d);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadConfig(), loadLogs()])
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erreur de chargement de la configuration e-mail"))
      .finally(() => setLoading(false));
  }, [loadConfig, loadLogs]);

  const sendTest = async () => {
    const to = testTo.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
      toast.error("Merci de saisir une adresse e-mail valide.");
      return;
    }
    setSending(true);
    try {
      const res = await apiPost<TestEmailResponse>("/api/admin/email/test", { to });
      // Résultat affiché tel quel — aucune réussite simulée.
      if (res.ok && res.status === "sent") {
        toast.success("E-mail de test envoyé : le serveur SMTP a accepté le message (statut « sent »).");
      } else if (res.status === "queued") {
        toast.info("SMTP non configuré : l'e-mail est en file d'attente (statut « queued »). Il partira lors d'une prochaine tentative d'envoi une fois le SMTP configuré.");
      } else if (res.status === "failed") {
        toast.error(`Échec de l'envoi SMTP : ${res.error || "erreur inconnue"}`);
      } else {
        toast.warning(`Statut renvoyé : ${res.status}${res.reason ? ` — ${res.reason}` : ""}`);
      }
      await loadLogs().catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'envoi de l'e-mail de test");
    } finally {
      setSending(false);
    }
  };

  const counts = logsData?.countsByStatus || {};

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> E-mails (SMTP)</CardTitle>
        <CardDescription>
          Envoi réel via nodemailer (SMTP). Chaque tentative est journalisée avec son résultat authentique —
          un e-mail n&apos;est jamais marqué « envoyé » sans acceptation du serveur SMTP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-52" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {/* ── Statut honnête de la configuration ── */}
            <div className="flex flex-wrap items-center gap-2">
              {config?.configured ? (
                <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                  <ShieldCheck className="mr-1 h-3 w-3" /> Configuré ({config.host})
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Non configuré</Badge>
              )}
              {config?.configured && (
                <span className="text-xs text-muted-foreground">
                  port {config.port}{config.secure ? " (TLS implicite)" : ""} · depuis « {config.from} »
                  {config.hasAuth ? " · authentification activée" : " · sans authentification"}
                </span>
              )}
              {config?.toAdmin && (
                <span className="text-xs text-muted-foreground">Notifications admin → {config.toAdmin}</span>
              )}
            </div>

            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              <p className="mb-2">
                Configuration pilotée par les variables d&apos;environnement (côté serveur uniquement, aucun secret
                n&apos;est exposé dans cette interface) :
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SMTP_ENV_VARS.map((v) => <Badge key={v} variant="outline" className="font-mono text-[11px]">{v}</Badge>)}
              </div>
              <p className="mt-2">
                Tant que <code className="font-mono">SMTP_HOST</code>, <code className="font-mono">SMTP_PORT</code> et{" "}
                <code className="font-mono">SMTP_FROM</code> sont absents, aucun envoi n&apos;est tenté : les e-mails
                restent en file d&apos;attente (statut « queued », jamais « envoyé ») et partiront lors d&apos;une
                prochaine tentative d&apos;envoi une fois le SMTP configuré.
              </p>
            </div>

            {/* ── Compteurs réels par statut ── */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Journal :</span>
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">En file : {counts["queued"] || 0}</Badge>
              <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Envoyés : {counts["sent"] || 0}</Badge>
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Échecs : {counts["failed"] || 0}</Badge>
              <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-500">Total : {logsData?.total ?? 0}</Badge>
            </div>

            {/* ── E-mail de test réel ── */}
            <form
              className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => { e.preventDefault(); if (!sending) void sendTest(); }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="smtp-test-email">Adresse de destination du test</Label>
                <Input
                  id="smtp-test-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="vous@exemple.com"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  disabled={sending}
                />
              </div>
              <Button type="submit" disabled={sending} className="w-full sm:w-auto">
                {sending ? <LoaderInline /> : <Send className="h-4 w-4" />} Envoyer un e-mail de test
              </Button>
            </form>
            <p className="-mt-1 text-xs text-muted-foreground">
              Le test effectue une véritable connexion SMTP : en cas d&apos;échec réseau ou d&apos;authentification,
              l&apos;erreur réelle du serveur est affichée et journalisée.
            </p>

            {/* ── Journal récent ── */}
            <div>
              <p className="mb-2 text-sm font-medium">Envois récents</p>
              {!logsData || logsData.logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun e-mail envoyé pour l&apos;instant.</p>
              ) : (
                <ul
                  className="max-h-48 space-y-1.5 overflow-y-auto thin-scrollbar rounded-md border p-2"
                  aria-label="Journal des envois d'e-mails récents"
                >
                  {logsData.logs.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-start justify-between gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/60"
                      title={l.errorMessage ? `Erreur : ${l.errorMessage}` : l.bodyPreview}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.subject}</p>
                        <p className="truncate text-muted-foreground">
                          {l.toEmail} · {PURPOSE_LABELS[l.purpose] || l.purpose} · tentative&nbsp;{l.attempts}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="hidden text-muted-foreground sm:inline">{formatDate(l.createdAt)}</span>
                        <StatusBadge status={l.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LoaderInline() {
  return <span className="mr-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden="true" />;
}
