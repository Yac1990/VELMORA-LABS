"use client";

/**
 * Studio IA — génération de textes, d'images et de storyboards vidéo 30 s (réel via SDK),
 * + bibliothèque d'assets avec workflow de vérification humaine (draft → pending_review → approved).
 * Contrat API : /api/admin/ai/generate | /image | /storyboard | /assets ; /api/admin/products?perPage=100.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, formatDate } from "@/lib/client";
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
import { toast } from "sonner";
import {
  AlertTriangle, Clapperboard, Copy, Download, Film, Image as ImageIcon, Library,
  Loader2, Send, Sparkles, Type,
} from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface ProductOption { id: string; title: string; }

interface AiAssetDto {
  id: string;
  assetType: string; // text | image | video_storyboard
  provider: string;
  prompt: string;
  content: string;
  status: string; // draft | pending_review | approved | rejected | archived
  costEstimate: number | null;
  createdBy: string | null;
  createdAt: string;
  product: { title: string; slug: string } | null;
}

interface UsageInfo { monthlyUsed: number; monthlyQuota: number; }

interface GenerateResponse {
  asset: AiAssetDto;
  usage?: UsageInfo;
  note?: string;
  renderingStatus?: string;
  renderingNote?: string;
}

interface StoryboardScene {
  scene?: number;
  duration_seconds?: number;
  visual?: string;
  on_screen_text?: string;
  voiceover?: string;
}

interface StoryboardData {
  title?: string;
  total_duration_seconds?: number;
  scenes?: StoryboardScene[];
  cta?: string;
  music_suggestion?: string;
  disclaimer?: string;
  raw?: string;
}

// ─────────────────────────── Libellés & helpers ───────────────────────────

const TEXT_TASKS: { value: string; label: string }[] = [
  { value: "hooks", label: "Accroches publicitaires" },
  { value: "description", label: "Description produit" },
  { value: "social_caption", label: "Légende réseaux sociaux" },
  { value: "script_video", label: "Script vidéo 30 s" },
  { value: "email_subjects", label: "Objets d'e-mail" },
  { value: "cta", label: "Appels à l'action" },
];

const IMAGE_SIZES: { value: string; label: string }[] = [
  { value: "1024x1024", label: "1024×1024 — Carré" },
  { value: "768x1344", label: "768×1344 — Story portrait" },
  { value: "1344x768", label: "1344×768 — Paysage" },
  { value: "720x1440", label: "720×1440 — Vertical 9:16" },
];

const ASSET_TYPE_LABELS: Record<string, string> = {
  text: "Texte",
  image: "Image",
  video_storyboard: "Storyboard vidéo",
};

const ASSET_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "border-zinc-200 bg-zinc-100 text-zinc-600" },
  pending_review: { label: "À vérifier", cls: "border-amber-300 bg-amber-50 text-amber-700" },
  approved: { label: "Approuvé", cls: "border-green-200 bg-green-50 text-green-700" },
  rejected: { label: "Rejeté", cls: "border-red-200 bg-red-50 text-red-700" },
  archived: { label: "Archivé", cls: "border-zinc-200 bg-zinc-50 text-zinc-500" },
};

async function copyToClipboard(text: string, label = "Copié dans le presse-papiers") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Copie impossible — sélectionnez le texte manuellement");
  }
}

function parseStoryboard(content: string): StoryboardData | null {
  try {
    const parsed = JSON.parse(content) as StoryboardData;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function downloadJson(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function AssetStatusBadge({ status }: { status: string }) {
  const meta = ASSET_STATUS[status];
  return <Badge variant="outline" className={meta?.cls || ""}>{meta?.label || status}</Badge>;
}

/** Bouton commun « Soumettre à vérification » (PUT action:submit). */
function useSubmitAsset(onSaved: (asset: AiAssetDto) => void) {
  const [submitting, setSubmitting] = useState(false);
  const submit = async (id: string) => {
    setSubmitting(true);
    try {
      const data = await apiPut<{ asset: AiAssetDto }>("/api/admin/ai/assets", { id, action: "submit" });
      toast.success("Soumis à vérification — en attente d'un valideur");
      onSaved(data.asset);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la soumission");
    } finally {
      setSubmitting(false);
    }
  };
  return { submitting, submit };
}

// ─────────────────────────── Vue ───────────────────────────

export function AiStudioView({ user }: { user: AdminUser }) {
  const canUse = hasPermission(user.role, "ai.use");
  const canApprove = hasPermission(user.role, "ai.approve");
  const canWrite = hasPermission(user.role, "content.write");
  const canReadCatalog = hasPermission(user.role, "catalog.read");

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [libRefresh, setLibRefresh] = useState(0);

  const refreshLibrary = useCallback(() => setLibRefresh((k) => k + 1), []);

  useEffect(() => {
    if (!canReadCatalog) return;
    apiGet<{ items: ProductOption[] }>("/api/admin/products?perPage=100")
      .then((d) => setProducts(d.items))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Impossible de charger la liste des produits"));
  }, [canReadCatalog]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Génération réelle via le SDK IA interne — tout contenu produit reste un <strong>brouillon</strong> jusqu&apos;à validation humaine.
        </p>
        {usage && (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            Quota IA ce mois : {usage.monthlyUsed} / {usage.monthlyQuota}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="text">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="text" className="gap-1.5"><Type className="h-4 w-4" /> Générer du texte</TabsTrigger>
          <TabsTrigger value="image" className="gap-1.5"><ImageIcon className="h-4 w-4" /> Générer une image</TabsTrigger>
          <TabsTrigger value="storyboard" className="gap-1.5"><Film className="h-4 w-4" /> Storyboard vidéo 30 s</TabsTrigger>
          <TabsTrigger value="library" className="gap-1.5"><Library className="h-4 w-4" /> Bibliothèque</TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="mt-4">
          <TextPanel products={products} canUse={canUse} canWrite={canWrite}
            onUsage={setUsage} onSaved={refreshLibrary} />
        </TabsContent>

        <TabsContent value="image" className="mt-4">
          <ImagePanel canUse={canUse} canWrite={canWrite}
            onUsage={setUsage} onSaved={refreshLibrary} />
        </TabsContent>

        <TabsContent value="storyboard" className="mt-4">
          <StoryboardPanel products={products} canUse={canUse} canWrite={canWrite}
            onUsage={setUsage} onSaved={refreshLibrary} />
        </TabsContent>

        <TabsContent value="library" className="mt-4">
          <LibraryPanel canApprove={canApprove} canWrite={canWrite} refreshKey={libRefresh} />
        </TabsContent>
      </Tabs>

      <Alert className="border-amber-300 bg-amber-50 text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Règle IA obligatoire</AlertTitle>
        <AlertDescription>
          Le contenu IA ne doit pas inventer prix, garanties, caractéristiques, résultats ou avis clients.
          Vérification humaine obligatoire.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ─────────────────────────── Onglet Texte ───────────────────────────

function TextPanel({
  products, canUse, canWrite, onUsage, onSaved,
}: {
  products: ProductOption[];
  canUse: boolean;
  canWrite: boolean;
  onUsage: (u: UsageInfo) => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("context");
  const [context, setContext] = useState("");
  const [task, setTask] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAssetDto | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { submitting, submit } = useSubmitAsset((a) => { setResult(a); onSaved(); });

  const generate = async () => {
    if (!task) { toast.error("Choisissez un type de génération."); return; }
    if (productId === "context" && context.trim().length < 10) {
      toast.error("Sélectionnez un produit ou saisissez un contexte produit (10 caractères minimum).");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<GenerateResponse>("/api/admin/ai/generate", {
        task,
        productId: productId !== "context" ? productId : undefined,
        productContext: productId === "context" ? context.trim() : undefined,
        audience: audience.trim() || undefined,
        tone: tone.trim() || undefined,
      });
      setResult(data.asset);
      setNote(data.note || null);
      if (data.usage) onUsage(data.usage);
      toast.success("Texte généré — relisez-le avant toute utilisation");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Génération de texte</CardTitle>
          <CardDescription>Le contexte produit vérifié est transmis à l&apos;IA — elle ne doit rien inventer d&apos;autre.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Produit</Label>
            <Select value={productId} onValueChange={setProductId} disabled={!canUse}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="context">Contexte libre (saisie manuelle)</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {productId === "context" && (
            <div className="space-y-1.5">
              <Label htmlFor="ai-context">Contexte produit vérifié</Label>
              <Textarea
                id="ai-context"
                rows={4}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Nom du produit, caractéristiques factuelles, bénéfices vérifiés…"
                disabled={!canUse}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tâche</Label>
            <Select value={task} onValueChange={setTask} disabled={!canUse}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Choisir une tâche…" /></SelectTrigger>
              <SelectContent>
                {TEXT_TASKS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-audience">Audience (optionnel)</Label>
              <Input id="ai-audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="ex. femmes 25-40" disabled={!canUse} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-tone">Ton (optionnel)</Label>
              <Input id="ai-tone" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="ex. chaleureux, factuel" disabled={!canUse} />
            </div>
          </div>
          <Button onClick={generate} disabled={!canUse || loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Génération en cours…" : "Générer"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {canUse ? "La génération peut prendre 10 à 30 secondes." : "Votre rôle ne permet pas d'utiliser le studio IA (permission ai.use requise)."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Résultat</CardTitle>
          <CardDescription>{note || "Brouillon enregistré dans la bibliothèque d'assets."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <p className="text-xs text-muted-foreground">Le modèle rédige… cela peut prendre 10 à 30 secondes.</p>
            </div>
          ) : result ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AssetStatusBadge status={result.status} />
                <span>{formatDate(result.createdAt)}</span>
                {result.product && <span>— {result.product.title}</span>}
              </div>
              <pre className="max-h-72 overflow-y-auto thin-scrollbar whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{result.content}</pre>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(result.content)}>
                  <Copy className="h-4 w-4" /> Copier
                </Button>
                {canWrite && (result.status === "draft" || result.status === "rejected") && (
                  <Button size="sm" onClick={() => submit(result.id)} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Soumettre à vérification
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucun résultat — lancez une génération pour voir le texte ici.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────── Onglet Image ───────────────────────────

function ImagePanel({
  canUse, canWrite, onUsage, onSaved,
}: {
  canUse: boolean;
  canWrite: boolean;
  onUsage: (u: UsageInfo) => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAssetDto | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { submitting, submit } = useSubmitAsset((a) => { setResult(a); onSaved(); });

  const generate = async () => {
    if (prompt.trim().length < 10) { toast.error("Décrivez le visuel souhaité (10 caractères minimum)."); return; }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<GenerateResponse>("/api/admin/ai/image", { prompt: prompt.trim(), size });
      setResult(data.asset);
      setNote(data.note || null);
      if (data.usage) onUsage(data.usage);
      toast.success("Image générée — vérifiez droits et exactitude avant publication");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération d'image");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" /> Génération d&apos;image</CardTitle>
          <CardDescription>Le visuel est enregistré sous /public/ai-assets/ et référencé dans la bibliothèque.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ai-img-prompt">Prompt du visuel</Label>
            <Textarea
              id="ai-img-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décrivez précisément la scène, le style, l'ambiance…"
              disabled={!canUse}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Format</Label>
            <Select value={size} onValueChange={setSize} disabled={!canUse}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {IMAGE_SIZES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={generate} disabled={!canUse || loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            {loading ? "Génération en cours…" : "Générer"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {canUse ? "La génération d'image peut prendre quelques dizaines de secondes." : "Votre rôle ne permet pas d'utiliser le studio IA (permission ai.use requise)."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prévisualisation</CardTitle>
          <CardDescription>{note || "Le média généré reste un brouillon jusqu'à validation."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Skeleton className="aspect-square w-full max-w-sm rounded-lg" />
          ) : result ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <AssetStatusBadge status={result.status} />
                <span>{formatDate(result.createdAt)}</span>
              </div>
              <img src={result.content} alt={`Visuel généré : ${result.prompt.slice(0, 80)}`} className="max-h-80 w-auto rounded-lg border" />
              <p className="text-xs text-muted-foreground">Fichier : {result.content}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => window.open(result.content, "_blank")}>
                  <Download className="h-4 w-4" /> Ouvrir le média
                </Button>
                {canWrite && (result.status === "draft" || result.status === "rejected") && (
                  <Button size="sm" onClick={() => submit(result.id)} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Soumettre à vérification
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Aucune image — lancez une génération pour voir l&apos;aperçu ici.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────── Onglet Storyboard ───────────────────────────

function StoryboardPanel({
  products, canUse, canWrite, onUsage, onSaved,
}: {
  products: ProductOption[];
  canUse: boolean;
  canWrite: boolean;
  onUsage: (u: UsageInfo) => void;
  onSaved: () => void;
}) {
  const [productId, setProductId] = useState("context");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AiAssetDto | null>(null);
  const [renderingNote, setRenderingNote] = useState<string | null>(null);
  const { submitting, submit } = useSubmitAsset((a) => { setResult(a); onSaved(); });

  const generate = async () => {
    if (productId === "context" && context.trim().length < 10) {
      toast.error("Sélectionnez un produit ou saisissez un contexte (10 caractères minimum).");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await apiPost<GenerateResponse>("/api/admin/ai/storyboard", {
        productId: productId !== "context" ? productId : undefined,
        productContext: productId === "context" ? context.trim() : undefined,
      });
      setResult(data.asset);
      setRenderingNote(data.renderingNote || "Aucun fournisseur de rendu vidéo n'est configuré — livrable : storyboard exportable, PAS de MP4. Aucune vidéo ne sera prétendument créée.");
      if (data.usage) onUsage(data.usage);
      toast.success("Storyboard généré — livrable exportable (pas de vidéo)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la génération du storyboard");
    } finally {
      setLoading(false);
    }
  };

  const sb = result ? parseStoryboard(result.content) : null;

  return (
    <div className="space-y-4">
      <Alert className="border-amber-300 bg-amber-50 text-amber-900">
        <Clapperboard className="h-4 w-4" />
        <AlertTitle>Transparence sur le rendu vidéo</AlertTitle>
        <AlertDescription>
          {renderingNote || "Aucun fournisseur de rendu vidéo n'est configuré — livrable : storyboard exportable, PAS de MP4. Aucune vidéo ne sera prétendument créée."}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Film className="h-4 w-4 text-primary" /> Storyboard vidéo 30 s (9:16)</CardTitle>
            <CardDescription>Découpage en 4 à 6 scènes avec visuels, textes à l&apos;écran et voix off — pour montage externe.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Produit</Label>
              <Select value={productId} onValueChange={setProductId} disabled={!canUse}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="context">Contexte libre (saisie manuelle)</SelectItem>
                  {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {productId === "context" && (
              <div className="space-y-1.5">
                <Label htmlFor="sb-context">Contexte produit vérifié</Label>
                <Textarea
                  id="sb-context"
                  rows={4}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Produit, bénéfices factuels, cible…"
                  disabled={!canUse}
                />
              </div>
            )}
            <Button onClick={generate} disabled={!canUse || loading} className="w-full sm:w-auto">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
              {loading ? "Génération en cours…" : "Générer le storyboard"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {canUse ? "La génération peut prendre 10 à 30 secondes." : "Votre rôle ne permet pas d'utiliser le studio IA (permission ai.use requise)."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storyboard généré</CardTitle>
            <CardDescription>Livrable : JSON exportable pour montage externe — aucun MP4.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : result ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <AssetStatusBadge status={result.status} />
                  <span>{formatDate(result.createdAt)}</span>
                </div>
                {sb && Array.isArray(sb.scenes) && sb.scenes.length > 0 ? (
                  <div className="space-y-2">
                    {sb.title && <p className="font-medium">{sb.title}</p>}
                    {typeof sb.total_duration_seconds === "number" && (
                      <p className="text-xs text-muted-foreground">Durée totale indiquée : {sb.total_duration_seconds} s</p>
                    )}
                    {sb.scenes.map((s, i) => (
                      <div key={i} className="space-y-1 rounded-lg border p-3">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary text-primary-foreground">Scène {s.scene ?? i + 1}</Badge>
                          <span className="text-xs text-muted-foreground">{typeof s.duration_seconds === "number" ? `${s.duration_seconds} s` : "durée —"}</span>
                        </div>
                        <p className="text-sm"><span className="font-medium">Visuel :</span> {s.visual || "—"}</p>
                        <p className="text-sm"><span className="font-medium">Texte à l&apos;écran :</span> {s.on_screen_text || "—"}</p>
                        <p className="text-sm"><span className="font-medium">Voix off :</span> {s.voiceover || "—"}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border border-primary/30 bg-blue-50/50 p-3">
                      <p className="text-sm"><span className="font-medium">CTA :</span> {sb.cta || "—"}</p>
                      <p className="mt-1 text-sm"><span className="font-medium">Musique suggérée :</span> {sb.music_suggestion || "—"}</p>
                    </div>
                    {sb.disclaimer && <p className="text-xs italic text-muted-foreground">{sb.disclaimer}</p>}
                  </div>
                ) : (
                  <pre className="max-h-72 overflow-y-auto thin-scrollbar whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">{result.content}</pre>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { downloadJson(result.content, `storyboard-${result.id}.json`); toast.success("Storyboard téléchargé (JSON)"); }}>
                    <Download className="h-4 w-4" /> Télécharger le storyboard (JSON)
                  </Button>
                  {canWrite && (result.status === "draft" || result.status === "rejected") && (
                    <Button size="sm" onClick={() => submit(result.id)} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Soumettre à vérification
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucun storyboard — lancez une génération.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────── Onglet Bibliothèque ───────────────────────────

function LibraryPanel({
  canApprove, canWrite, refreshKey,
}: {
  canApprove: boolean;
  canWrite: boolean;
  refreshKey: number;
}) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [items, setItems] = useState<AiAssetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("assetType", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data = await apiGet<{ items: AiAssetDto[] }>(`/api/admin/ai/assets?${params.toString()}`);
      setItems(data.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement de la bibliothèque");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const act = async (asset: AiAssetDto, body: Record<string, unknown>, successMsg: string) => {
    setBusyId(asset.id);
    try {
      await apiPut("/api/admin/ai/assets", { id: asset.id, ...body });
      toast.success(successMsg);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  };

  const actionable = (a: AiAssetDto) => ["draft", "pending_review", "rejected"].includes(a.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Bibliothèque d&apos;assets IA</CardTitle>
            <CardDescription>Chaque génération est tracée (prompt, fournisseur, statut, auteur).</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-36" aria-label="Filtrer par type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les types</SelectItem>
                <SelectItem value="text">Texte</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="video_storyboard">Storyboard vidéo</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" aria-label="Filtrer par statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="draft">Brouillon</SelectItem>
                <SelectItem value="pending_review">À vérifier</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
                <SelectItem value="archived">Archivé</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Aucun asset pour ces filtres. Générez du contenu dans les onglets précédents.
          </p>
        ) : (
          <div className="space-y-3">
            {items.map((a) => (
              <div key={a.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{ASSET_TYPE_LABELS[a.assetType] || a.assetType}</Badge>
                  <AssetStatusBadge status={a.status} />
                  <span className="text-xs text-muted-foreground">{formatDate(a.createdAt)} — {a.createdBy || "—"}</span>
                  {a.product && <span className="text-xs text-muted-foreground">Produit : {a.product.title}</span>}
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground" title={a.prompt}>Prompt : {a.prompt || "—"}</p>
                {a.assetType === "image" ? (
                  <img src={a.content} alt={`Visuel IA : ${a.prompt.slice(0, 60)}`} className="max-h-40 w-auto rounded border" />
                ) : (
                  <pre className="max-h-40 overflow-y-auto thin-scrollbar whitespace-pre-wrap rounded border bg-muted/30 p-2 text-xs">{a.content}</pre>
                )}
                <div className="flex flex-wrap gap-2">
                  {canWrite && (a.status === "draft" || a.status === "rejected") && (
                    <Button variant="outline" size="sm" disabled={busyId === a.id}
                      onClick={() => act(a, { action: "submit" }, "Soumis à vérification")}>
                      <Send className="h-3.5 w-3.5" /> Soumettre
                    </Button>
                  )}
                  {canApprove && actionable(a) && (
                    <>
                      <Button size="sm" disabled={busyId === a.id}
                        onClick={() => act(a, { action: "approve" }, "Asset approuvé")}>
                        <Send className="h-3.5 w-3.5" /> Approuver
                      </Button>
                      <Button variant="destructive" size="sm" disabled={busyId === a.id}
                        onClick={() => act(a, { action: "reject" }, "Asset rejeté")}>
                        Rejeter
                      </Button>
                    </>
                  )}
                  {canWrite && actionable(a) && (
                    <Button variant="ghost" size="sm" disabled={busyId === a.id}
                      onClick={() => act(a, { status: "archived" }, "Asset archivé")}>
                      Archiver
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
