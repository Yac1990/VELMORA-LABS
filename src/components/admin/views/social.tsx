"use client";

/**
 * Vue Réseaux sociaux — workflow transparent : brouillon → approuvé → export manuel → publié (preuve).
 * AUCUNE publication directe : aucune autorisation API n'est configurée (note exacte renvoyée par l'API).
 * Contrat API : GET/POST/PUT /api/admin/social/posts.
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Archive, Check, CircleAlert, Copy, ExternalLink, Facebook, FileDown, Instagram,
  Loader2, Plus, X, Youtube,
} from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface SocialAssetRef { id: string; assetType: string; content: string; prompt: string; }

interface SocialPostItem {
  id: string;
  aiAssetId: string | null;
  asset: SocialAssetRef | null;
  platform: string;
  caption: string;
  hashtags: string | null;
  campaignLink: string | null;
  scheduledAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishStatus: string;
  externalPostId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IntegrationStatus { configured: boolean; note: string; }

interface PostsResponse {
  items: SocialPostItem[];
  integrationStatus: Record<string, IntegrationStatus>;
  policy: string;
}

interface AssetOption { id: string; prompt: string; }

// ─────────────────────────── Libellés & helpers ───────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook", youtube: "YouTube Shorts",
};

const PLATFORM_BADGE: Record<string, string> = {
  tiktok: "border-zinc-700 bg-zinc-900 text-white",
  instagram: "border-pink-200 bg-pink-50 text-pink-700",
  facebook: "border-blue-200 bg-blue-50 text-blue-700",
  youtube: "border-red-200 bg-red-50 text-red-700",
};

const POST_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "border-zinc-200 bg-zinc-100 text-zinc-600" },
  approved: { label: "Approuvé", cls: "border-green-200 bg-green-50 text-green-700" },
  scheduled: { label: "Programmé", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  published_manual: { label: "Publié manuellement", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  failed: { label: "Échec", cls: "border-red-200 bg-red-50 text-red-700" },
  archived: { label: "Archivé", cls: "border-zinc-200 bg-zinc-50 text-zinc-500" },
};

const PLATFORM_KEYS = ["tiktok", "instagram", "facebook", "youtube"];

async function copyToClipboard(text: string, label = "Copié dans le presse-papiers") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Copie impossible — sélectionnez le texte manuellement");
  }
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

// ─────────────────────────── Vue ───────────────────────────

export function SocialView({ user }: { user: AdminUser }) {
  const canWrite = hasPermission(user.role, "social.write");
  const canApprove = hasPermission(user.role, "ai.approve");

  const [posts, setPosts] = useState<SocialPostItem[]>([]);
  const [integrationStatus, setIntegrationStatus] = useState<Record<string, IntegrationStatus>>({});
  const [policy, setPolicy] = useState("");
  const [loading, setLoading] = useState(true);

  // Création
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [campaignLink, setCampaignLink] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [assetId, setAssetId] = useState("none");
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [creating, setCreating] = useState(false);

  // Actions
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportPost, setExportPost] = useState<SocialPostItem | null>(null);
  const [publishPost, setPublishPost] = useState<SocialPostItem | null>(null);
  const [externalPostId, setExternalPostId] = useState("");
  const [failPost, setFailPost] = useState<SocialPostItem | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<PostsResponse>("/api/admin/social/posts");
      setPosts(data.items);
      setIntegrationStatus(data.integrationStatus || {});
      setPolicy(data.policy || "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des publications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // Options d'assets texte liables (bibliothèque IA)
  useEffect(() => {
    if (!canWrite) return;
    apiGet<{ items: AssetOption[] }>("/api/admin/ai/assets?assetType=text")
      .then((d) => setAssetOptions(d.items))
      .catch(() => setAssetOptions([])); // le lien d'asset reste optionnel
  }, [canWrite]);

  const createPost = async () => {
    if (caption.trim().length < 5) { toast.error("Légende requise (5 caractères minimum)."); return; }
    setCreating(true);
    try {
      await apiPost("/api/admin/social/posts", {
        platform,
        caption: caption.trim(),
        hashtags: hashtags.trim() || undefined,
        campaignLink: campaignLink.trim() || undefined,
        aiAssetId: assetId !== "none" ? assetId : undefined,
        scheduledAt: scheduledAt || undefined,
      });
      toast.success("Brouillon de publication créé");
      setCaption(""); setHashtags(""); setCampaignLink(""); setScheduledAt(""); setAssetId("none");
      loadPosts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de création de la publication");
    } finally {
      setCreating(false);
    }
  };

  const act = async (post: SocialPostItem, body: Record<string, unknown>, successMsg: string) => {
    setBusyId(post.id);
    try {
      await apiPut("/api/admin/social/posts", { id: post.id, ...body });
      toast.success(successMsg);
      loadPosts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  };

  const markPublished = async () => {
    if (!publishPost) return;
    await act(publishPost, { action: "mark_published_manual", externalPostId: externalPostId.trim() || undefined },
      "Marqué comme publié manuellement — preuve enregistrée");
    setPublishPost(null);
    setExternalPostId("");
  };

  const markFailed = async () => {
    if (!failPost) return;
    await act(failPost, { action: "fail", errorMessage: errorMessage.trim() || undefined }, "Marqué en échec");
    setFailPost(null);
    setErrorMessage("");
  };

  const exportAllText = (p: SocialPostItem) => {
    const parts = [
      p.caption,
      p.hashtags ? `\n${p.hashtags}` : "",
      p.campaignLink ? `\nLien : ${p.campaignLink}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  };

  return (
    <div className="space-y-4">
      {/* Intégrations — état exact renvoyé par l'API */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATFORM_KEYS.map((key) => {
          const info = integrationStatus[key];
          const icons: Record<string, React.ReactNode> = {
            tiktok: <CircleAlert className="h-4 w-4" />,
            instagram: <Instagram className="h-4 w-4" />,
            facebook: <Facebook className="h-4 w-4" />,
            youtube: <Youtube className="h-4 w-4" />,
          };
          return (
            <Card key={key} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {icons[key]} {PLATFORM_LABELS[key]}
                </p>
                {info?.configured
                  ? <Badge className="border-green-200 bg-green-50 text-green-700" variant="outline">Configuré</Badge>
                  : <Badge variant="outline" className="border-zinc-200 bg-zinc-100 text-zinc-500">Non configuré</Badge>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{info?.note || "Statut d'intégration indisponible."}</p>
            </Card>
          );
        })}
      </div>

      <Alert className="border-blue-200 bg-blue-50 text-blue-900">
        <ExternalLink className="h-4 w-4" />
        <AlertTitle>Politique de publication</AlertTitle>
        <AlertDescription>
          {policy || "Aucune publication directe possible tant que les autorisations API ne sont pas obtenues — export manuel de secours."}
        </AlertDescription>
      </Alert>

      {/* Création de post */}
      {canWrite ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> Nouvelle publication</CardTitle>
            <CardDescription>Le post est créé en brouillon. Publication finale : export manuel, puis saisie de la preuve.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Plateforme</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORM_KEYS.map((p) => <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-asset">Asset IA lié (optionnel)</Label>
                <Select value={assetId} onValueChange={setAssetId}>
                  <SelectTrigger id="sp-asset" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {assetOptions.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{truncate(a.prompt, 48)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-date">Programmation (optionnelle)</Label>
                <Input id="sp-date" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-caption">Légende *</Label>
              <Textarea id="sp-caption" rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Texte du post…" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sp-hashtags">Hashtags</Label>
                <Input id="sp-hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#astuce #bienetre" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sp-link">Lien de campagne</Label>
                <Input id="sp-link" value={campaignLink} onChange={(e) => setCampaignLink(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <Button onClick={createPost} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} Créer le brouillon
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Votre rôle autorise la consultation des publications (permission social.write requise pour en créer).
          </CardContent>
        </Card>
      )}

      {/* Table des posts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Publications</CardTitle>
          <CardDescription>Workflow : brouillon → approuvé → export manuel → publié (avec preuve) — ou échec / archivage.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plateforme</TableHead>
                  <TableHead>Légende</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Approuvé par</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : posts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Aucune publication. Créez un brouillon ci-dessus pour préparer le calendrier social.
                    </TableCell>
                  </TableRow>
                ) : (
                  posts.map((p) => {
                    const st = POST_STATUS[p.publishStatus];
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Badge variant="outline" className={PLATFORM_BADGE[p.platform] || ""}>
                            {PLATFORM_LABELS[p.platform] || p.platform}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-56"><span className="line-clamp-2 text-sm">{p.caption}</span></TableCell>
                        <TableCell>
                          <Badge variant="outline" className={st?.cls || ""}>{st?.label || p.publishStatus}</Badge>
                          {p.externalPostId && (
                            <p className="mt-1 text-[10px] text-muted-foreground" title={p.externalPostId}>Preuve : {truncate(p.externalPostId, 18)}</p>
                          )}
                          {p.errorMessage && (
                            <p className="mt-1 text-[10px] text-red-600" title={p.errorMessage}>{truncate(p.errorMessage, 30)}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.approvedBy || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.scheduledAt ? (
                            <span title="Programmée">Prévue : {formatDate(p.scheduledAt)}</span>
                          ) : (
                            <span title="Créée le">{formatDate(p.createdAt)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {canApprove && p.publishStatus === "draft" && (
                              <Button variant="outline" size="sm" disabled={busyId === p.id}
                                onClick={() => act(p, { action: "approve" }, "Publication approuvée — export manuel disponible")}>
                                <Check className="h-3.5 w-3.5" /> Approuver
                              </Button>
                            )}
                            {p.publishStatus === "approved" && (
                              <Button variant="outline" size="sm" onClick={() => setExportPost(p)}>
                                <FileDown className="h-3.5 w-3.5" /> Exporter
                              </Button>
                            )}
                            {canWrite && (p.publishStatus === "approved" || p.publishStatus === "scheduled") && (
                              <Button variant="outline" size="sm" onClick={() => { setPublishPost(p); setExternalPostId(""); }}>
                                Marquer publié
                              </Button>
                            )}
                            {canWrite && ["draft", "approved", "scheduled"].includes(p.publishStatus) && (
                              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700"
                                onClick={() => { setFailPost(p); setErrorMessage(""); }}>
                                <X className="h-3.5 w-3.5" /> Échec
                              </Button>
                            )}
                            {canWrite && p.publishStatus !== "archived" && (
                              <Button variant="ghost" size="sm" disabled={busyId === p.id}
                                onClick={() => act(p, { action: "archive" }, "Publication archivée")}>
                                <Archive className="h-3.5 w-3.5" /> Archiver
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog export pour publication manuelle (secours) */}
      <Dialog open={!!exportPost} onOpenChange={(open) => { if (!open) setExportPost(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Export pour publication manuelle</DialogTitle>
            <DialogDescription>
              Copiez les éléments ci-dessous et publiez-les manuellement sur {exportPost ? PLATFORM_LABELS[exportPost.platform] || exportPost.platform : "la plateforme"}.
            </DialogDescription>
          </DialogHeader>
          {exportPost && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Légende</p>
                <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">{exportPost.caption}</pre>
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(exportPost.caption, "Légende copiée")}>
                  <Copy className="h-3.5 w-3.5" /> Copier la légende
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Hashtags</p>
                <p className="rounded-md border bg-muted/30 p-3 text-sm">{exportPost.hashtags || "—"}</p>
                {exportPost.hashtags && (
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(exportPost.hashtags as string, "Hashtags copiés")}>
                    <Copy className="h-3.5 w-3.5" /> Copier les hashtags
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Lien de campagne</p>
                <p className="rounded-md border bg-muted/30 p-3 break-all text-sm">{exportPost.campaignLink || "—"}</p>
                {exportPost.campaignLink && (
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(exportPost.campaignLink as string, "Lien copié")}>
                    <Copy className="h-3.5 w-3.5" /> Copier le lien
                  </Button>
                )}
              </div>
              {exportPost.asset && exportPost.asset.assetType === "image" && (
                <div className="space-y-1 rounded-md border border-violet-200 bg-violet-50/50 p-3">
                  <p className="text-sm font-medium">Média à télécharger (image)</p>
                  <a
                    href={exportPost.asset.content}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    Ouvrir le média : {exportPost.asset.content}
                  </a>
                  <p className="text-xs text-muted-foreground">Téléchargez ce fichier et joignez-le lors de la publication manuelle.</p>
                </div>
              )}
              <DialogFooter>
                <Button onClick={() => copyToClipboard(exportAllText(exportPost), "Contenu complet copié")}>
                  <Copy className="h-4 w-4" /> Copier tout (légende + hashtags + lien)
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog « publié manuellement » avec preuve */}
      <Dialog open={!!publishPost} onOpenChange={(open) => { if (!open) setPublishPost(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marquer comme publié manuellement</DialogTitle>
            <DialogDescription>
              Conservez la preuve de publication (URL ou identifiant du post sur la plateforme) pour la traçabilité.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ext-id">Identifiant / URL du post externe (optionnel)</Label>
            <Input id="ext-id" value={externalPostId} onChange={(e) => setExternalPostId(e.target.value)} placeholder="ex. https://www.tiktok.com/@compte/video/…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishPost(null)}>Annuler</Button>
            <Button onClick={markPublished}>Confirmer la publication</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog « échec » */}
      <Dialog open={!!failPost} onOpenChange={(open) => { if (!open) setFailPost(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marquer en échec</DialogTitle>
            <DialogDescription>Indiquez éventuellement la raison (service externe, contenu refusé…).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="err-msg">Raison de l&apos;échec (optionnel)</Label>
            <Input id="err-msg" value={errorMessage} onChange={(e) => setErrorMessage(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailPost(null)}>Annuler</Button>
            <Button variant="destructive" onClick={markFailed}>Marquer en échec</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
