"use client";

/**
 * Vue Paramètres — marque & international (PUT si settings.write), état des intégrations
 * (notes exactes renvoyées par l'API, jamais interprétées) et documentation d'environnement.
 * Contrat API : GET/PUT /api/admin/settings.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPut } from "@/lib/client";
import { CURRENCIES } from "@/lib/money";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsFxCard } from "@/components/admin/settings-fx-card";
import { SettingsEmailCard } from "@/components/admin/settings-email-card";
import { toast } from "sonner";
import {
  ArrowLeftRight, Clapperboard, Globe, Handshake, ImageIcon, Info, Lock,
  Save, Server, Share2, ShieldCheck, Sparkles,
} from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface IntegrationInfo {
  provider: string | null;
  configured: boolean;
  note: string;
}

interface SettingsResponse {
  settings: Record<string, string>;
  editableKeys: string[];
  integrationsStatus: Record<string, IntegrationInfo>;
  envDocumentation: { required: string[]; optional: string[] };
}

// ─────────────────────────── Champs & libellés ───────────────────────────

const FORM_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "brand_name", label: "Nom de la marque" },
  { key: "brand_tagline", label: "Slogan de la marque" },
  { key: "brand_logo", label: "Logo (chemin ou URL)" },
  { key: "reference_currency", label: "Devise de référence", hint: "EUR, USD, MAD, CHF, CAD, XOF ou XAF — conversions affichées via les taux de change réels (carte Taux de change, onglet Intégrations)." },
  { key: "display_currencies", label: "Devises affichées (séparées par des virgules)" },
  { key: "target_countries", label: "Pays cibles (séparés par des virgules)" },
  { key: "default_language", label: "Langue par défaut" },
  { key: "timezone", label: "Fuseau horaire", hint: "UTC par défaut." },
  { key: "cookie_consent", label: "Consentement cookies" },
  { key: "demo_mode_notice", label: "Mention du mode démo" },
  { key: "outbound_notice", label: "Message « Comment ça marche »", hint: "Affiché sous forme neutre sur l'accueil (bandeau) et dans le pied de page publics — description du regroupement de produits et de la redirection vers le site du vendeur." },
  { key: "ai_monthly_quota", label: "Quota IA mensuel", hint: "Nombre maximal de générations IA par mois (contrôlé côté serveur)." },
];

const EMPTY_FORM: Record<string, string> = {
  brand_name: "", brand_tagline: "", brand_logo: "", reference_currency: "EUR",
  display_currencies: "", target_countries: "", default_language: "fr", timezone: "UTC",
  cookie_consent: "banner", demo_mode_notice: "", outbound_notice: "", ai_monthly_quota: "",
};

const INTEGRATION_CARDS: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "ai_text", label: "IA texte (LLM)", icon: Sparkles },
  { key: "ai_image", label: "IA images", icon: ImageIcon },
  { key: "ai_video_render", label: "Rendu vidéo", icon: Clapperboard },
  { key: "social_apis", label: "Réseaux sociaux", icon: Share2 },
  { key: "partner_apis", label: "API partenaires", icon: Handshake },
  { key: "exchange_rates", label: "Taux de change", icon: ArrowLeftRight },
];

// ─────────────────────────── Vue ───────────────────────────

export function SettingsView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "settings.write");

  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet<SettingsResponse>("/api/admin/settings");
      setData(d);
      const next: Record<string, string> = { ...EMPTY_FORM };
      for (const f of FORM_FIELDS) {
        next[f.key] = d.settings?.[f.key] ?? EMPTY_FORM[f.key] ?? "";
      }
      setForm(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des paramètres");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      for (const f of FORM_FIELDS) body[f.key] = form[f.key] ?? "";
      const res = await apiPut<{ updated: number; keys: string[] }>("/api/admin/settings", body);
      toast.success(`Paramètres enregistrés (${res.updated} clé${res.updated > 1 ? "s" : ""} mise${res.updated > 1 ? "s" : ""} à jour)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="brand">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="brand" className="gap-1.5"><Globe className="h-4 w-4" /> Marque &amp; international</TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5"><Server className="h-4 w-4" /> Intégrations</TabsTrigger>
          <TabsTrigger value="env" className="gap-1.5"><Lock className="h-4 w-4" /> Environnement</TabsTrigger>
        </TabsList>

        {/* ── Marque & international ── */}
        <TabsContent value="brand" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Marque, devises &amp; mentions légales</CardTitle>
              <CardDescription>
                Configuration utilisée par la boutique publique et le back-office.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : canWrite ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Nom de la marque">
                      <Input value={form.brand_name || ""} onChange={(e) => setForm({ ...form, brand_name: e.target.value })} />
                    </Field>
                    <Field label="Slogan de la marque">
                      <Input value={form.brand_tagline || ""} onChange={(e) => setForm({ ...form, brand_tagline: e.target.value })} />
                    </Field>
                    <Field label="Logo (chemin ou URL)">
                      <Input value={form.brand_logo || ""} onChange={(e) => setForm({ ...form, brand_logo: e.target.value })} placeholder="/velmora-logo.png" />
                    </Field>
                    <Field label="Devise de référence">
                      <Select value={form.reference_currency || "EUR"} onValueChange={(v) => setForm({ ...form, reference_currency: v })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Devises affichées (virgules)">
                      <Input value={form.display_currencies || ""} onChange={(e) => setForm({ ...form, display_currencies: e.target.value })} placeholder="EUR,USD,XOF" />
                    </Field>
                    <Field label="Pays cibles (virgules)">
                      <Input value={form.target_countries || ""} onChange={(e) => setForm({ ...form, target_countries: e.target.value })} placeholder="FR,BE,CH" />
                    </Field>
                    <Field label="Langue par défaut">
                      <Select value={form.default_language || "fr"} onValueChange={(v) => setForm({ ...form, default_language: v })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">Français</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Fuseau horaire" hint="UTC par défaut.">
                      <Input value={form.timezone || ""} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="UTC" />
                    </Field>
                    <Field label="Consentement cookies">
                      <Select value={form.cookie_consent || "banner"} onValueChange={(v) => setForm({ ...form, cookie_consent: v })}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="banner">Bandeau de consentement</SelectItem>
                          <SelectItem value="none">Aucun</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Quota IA mensuel" hint="Contrôlé côté serveur à chaque génération.">
                      <Input type="number" min={1} value={form.ai_monthly_quota || ""} onChange={(e) => setForm({ ...form, ai_monthly_quota: e.target.value })} />
                    </Field>
                    <Field label="Mention du mode démo" className="sm:col-span-2">
                      <Textarea rows={2} value={form.demo_mode_notice || ""} onChange={(e) => setForm({ ...form, demo_mode_notice: e.target.value })} />
                    </Field>
                    <Field label="Message « Comment ça marche »" className="sm:col-span-2">
                      <Textarea rows={2} value={form.outbound_notice || ""} onChange={(e) => setForm({ ...form, outbound_notice: e.target.value })} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={save} disabled={saving}>
                      {saving ? <LoaderInline /> : <Save className="h-4 w-4" />} Enregistrer les paramètres
                    </Button>
                    <p className="text-xs text-muted-foreground">Le serveur n&apos;accepte que les clés éditables connues.</p>
                  </div>
                </>
              ) : (
                <div className="space-y-3 text-sm">
                  <Alert className="border-blue-200 bg-blue-50 text-blue-900">
                    <Info className="h-4 w-4" />
                    <AlertTitle>Lecture seule</AlertTitle>
                    <AlertDescription>
                      La modification des paramètres nécessite la permission settings.write (RBAC vérifié côté serveur).
                    </AlertDescription>
                  </Alert>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                    {FORM_FIELDS.map((f) => (
                      <div key={f.key}>
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="whitespace-pre-wrap">{data?.settings?.[f.key] && data.settings[f.key] !== "" ? data.settings[f.key] : "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Intégrations ── */}
        <TabsContent value="integrations" className="mt-4">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {loading
                ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
                : INTEGRATION_CARDS.map(({ key, label, icon: Icon }) => {
                const info = data?.integrationsStatus?.[key];
                return (
                  <Card key={key} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-primary" /> {label}</p>
                      {info?.configured
                        ? <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">Configurée</Badge>
                        : <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-500">Non configurée</Badge>}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Fournisseur : {info?.provider || "—"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{info?.note || "Statut indisponible — aucune information renvoyée par l'API."}</p>
                  </Card>
                );
              })}
            </div>

            {/* Sprint B — cartes opérationnelles : taux de change réels + e-mails SMTP */}
            <div className="grid gap-4 lg:grid-cols-2">
              <SettingsFxCard />
              <SettingsEmailCard />
            </div>
          </div>
        </TabsContent>

        {/* ── Environnement ── */}
        <TabsContent value="env" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Variables d&apos;environnement</CardTitle>
                <CardDescription>Documentation renvoyée par l&apos;API — les secrets ne sont jamais exposés côté navigateur.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <>
                    <div>
                      <p className="mb-1.5 text-sm font-medium">Requises</p>
                      <div className="flex flex-wrap gap-2">
                        {(data?.envDocumentation?.required || []).length === 0
                          ? <span className="text-sm text-muted-foreground">—</span>
                          : data?.envDocumentation?.required?.map((v) => (
                            <Badge key={v} variant="outline" className="font-mono text-[11px]">{v}</Badge>
                          ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-sm font-medium">Optionnelles / recommandées</p>
                      <ul className="space-y-1.5">
                        {(data?.envDocumentation?.optional || []).length === 0
                          ? <li className="text-sm text-muted-foreground">—</li>
                          : data?.envDocumentation?.optional?.map((v) => (
                            <li key={v} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {v}
                            </li>
                          ))}
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Alert className="border-green-200 bg-green-50 text-green-900">
              <ShieldCheck className="h-4 w-4" />
              <AlertTitle>Sécurité d&apos;accès</AlertTitle>
              <AlertDescription>
                RLS/RBAC : le contrôle d&apos;accès est appliqué côté serveur sur chaque endpoint d&apos;administration
                (sessions httpOnly signées, permissions vérifiées par rôle). Le filtrage de l&apos;interface est purement indicatif.
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function LoaderInline() {
  return <span className="mr-1 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" aria-hidden="true" />;
}
