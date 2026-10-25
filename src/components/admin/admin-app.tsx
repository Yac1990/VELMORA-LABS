"use client";

/**
 * Back-office VELMORA LABS — coque avec connexion, sidebar sombre (réf. maquette Mint),
 * filtrage des entrées par rôle (affichage) ; le RBAC est de toute façon vérifié côté serveur.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/client";
import { hasPermission, ROLE_LABELS, type Permission } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  LayoutDashboard, Package, Tags, Handshake, FileUp, ReceiptText, Megaphone,
  Users, Sparkles, Share2, Settings, UserCog, ScrollText, Store, LogOut, Loader2, Globe, ShieldCheck,
} from "lucide-react";
import { DashboardView } from "@/components/admin/views/dashboard";
import { ProductsView } from "@/components/admin/views/products";
import { CategoriesView } from "@/components/admin/views/categories";
import { PartnersView } from "@/components/admin/views/partners";
import { ImportsView } from "@/components/admin/views/imports";
import { ConversionsView } from "@/components/admin/views/conversions";
import { CampaignsView } from "@/components/admin/views/campaigns";
import { CrmView } from "@/components/admin/views/crm";
import { AiStudioView } from "@/components/admin/views/ai-studio";
import { SocialView } from "@/components/admin/views/social";
import { SettingsView } from "@/components/admin/views/settings";
import { UsersView } from "@/components/admin/views/users";
import { AuditView } from "@/components/admin/views/audit";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  roleLabel?: string;
  displayName: string;
}

type ViewKey =
  | "dashboard" | "products" | "categories" | "partners" | "imports" | "conversions"
  | "campaigns" | "crm" | "ai-studio" | "social" | "settings" | "users" | "audit";

const NAV: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }>; permission: Permission; group: string }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, permission: "dashboard.read", group: "Pilotage" },
  { key: "products", label: "Produits", icon: Package, permission: "catalog.read", group: "Catalogue" },
  { key: "categories", label: "Catégories", icon: Tags, permission: "catalog.read", group: "Catalogue" },
  { key: "partners", label: "Partenaires", icon: Handshake, permission: "partners.read", group: "Catalogue" },
  { key: "imports", label: "Imports CSV", icon: FileUp, permission: "catalog.read", group: "Catalogue" },
  { key: "conversions", label: "Conversions", icon: ReceiptText, permission: "conversions.read", group: "Pilotage" },
  { key: "campaigns", label: "Campagnes", icon: Megaphone, permission: "content.read", group: "Marketing" },
  { key: "ai-studio", label: "Studio IA", icon: Sparkles, permission: "content.read", group: "Marketing" },
  { key: "social", label: "Réseaux sociaux", icon: Share2, permission: "social.read", group: "Marketing" },
  { key: "crm", label: "CRM", icon: Users, permission: "crm.read", group: "Relations" },
  { key: "users", label: "Utilisateurs", icon: UserCog, permission: "users.manage", group: "Administration" },
  { key: "settings", label: "Paramètres", icon: Settings, permission: "settings.read", group: "Administration" },
  { key: "audit", label: "Journal d'audit", icon: ScrollText, permission: "audit.read", group: "Administration" },
];

export function AdminApp({ onExitToStore }: { onExitToStore: () => void }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const data = await apiGet<{ user: AdminUser | null }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMe(); }, [loadMe]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement du back-office…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLoggedIn={loadMe} onExitToStore={onExitToStore} />;
  }

  const allowedNav = NAV.filter((n) => hasPermission(user.role, n.permission));
  const currentNav = NAV.find((n) => n.key === view);
  const viewAllowed = currentNav && hasPermission(user.role, currentNav.permission);
  const groups = Array.from(new Set(allowedNav.map((n) => n.group)));

  return (
    <div className="min-h-screen flex bg-zinc-100">
      {/* Sidebar sombre (réf. maquette) */}
      <aside
        className={`admin-sidebar-dark fixed inset-y-0 left-0 z-40 w-64 flex flex-col transition-transform lg:translate-x-0 lg:static ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
          <img src="/velmora-logo.png" alt="Logo VELMORA LABS" className="h-8 w-8 rounded-md object-cover" />
          <div>
            <p className="text-sm font-semibold text-white leading-tight">VELMORA LABS</p>
            <p className="text-[11px] text-zinc-400 leading-tight">Back-office</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto thin-scrollbar px-3 py-4 space-y-4" aria-label="Navigation back-office">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group}</p>
              <ul className="space-y-0.5">
                {allowedNav.filter((n) => n.group === group).map((n) => {
                  const Icon = n.icon;
                  const active = view === n.key;
                  return (
                    <li key={n.key}>
                      <button
                        onClick={() => { setView(n.key); setSidebarOpen(false); window.scrollTo({ top: 0 }); }}
                        className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${active ? "bg-white/10 text-white font-medium" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100"}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {n.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-2 mb-2">
            <p className="text-sm font-medium text-white truncate">{user.displayName}</p>
            <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
            <Badge className="mt-1.5 bg-white/10 text-zinc-200 hover:bg-white/10 border-0 text-[10px]">
              {ROLE_LABELS[user.role] || user.role}
            </Badge>
          </div>
          <Separator className="bg-white/10 mb-2" />
          <div className="space-y-1">
            <button onClick={onExitToStore} className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-100">
              <Store className="h-4 w-4" /> Retour à la boutique
            </button>
            <button
              onClick={async () => { await apiPost("/api/auth/logout", {}).catch(() => {}); setUser(null); toast.success("Déconnecté"); }}
              className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            >
              <LogOut className="h-4 w-4" /> Déconnexion
            </button>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fermer le menu"
        />
      )}

      {/* Contenu */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-white px-4 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Ouvrir le menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </Button>
          <h1 className="text-lg font-semibold">{currentNav?.label || "Back-office"}</h1>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">RBAC actif — {ROLE_LABELS[user.role] || user.role}</span>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">
          {!viewAllowed ? (
            <Card>
              <CardHeader>
                <CardTitle>Accès non autorisé</CardTitle>
                <CardDescription>Votre rôle ne permet pas d'accéder à cette section.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <>
              {view === "dashboard" && <DashboardView user={user} />}
              {view === "products" && <ProductsView user={user} />}
              {view === "categories" && <CategoriesView user={user} />}
              {view === "partners" && <PartnersView user={user} />}
              {view === "imports" && <ImportsView user={user} />}
              {view === "conversions" && <ConversionsView user={user} />}
              {view === "campaigns" && <CampaignsView user={user} />}
              {view === "crm" && <CrmView user={user} />}
              {view === "ai-studio" && <AiStudioView user={user} />}
              {view === "social" && <SocialView user={user} />}
              {view === "settings" && <SettingsView user={user} />}
              {view === "users" && <UsersView user={user} />}
              {view === "audit" && <AuditView user={user} />}
            </>
          )}
        </main>
        <footer className="mt-auto border-t bg-white px-4 lg:px-8 py-3 text-xs text-muted-foreground flex flex-wrap gap-2 justify-between">
          <span>VELMORA LABS — back-office. Sessions sécurisées, actions journalisées.</span>
          <span>Fuseau horaire de référence : UTC</span>
        </footer>
      </div>
    </div>
  );
}

function LoginScreen({ onLoggedIn, onExitToStore }: { onLoggedIn: () => void; onExitToStore: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost("/api/auth/login", { email, password });
      toast.success("Connexion réussie");
      onLoggedIn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de connexion");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <img src="/velmora-logo.png" alt="Logo VELMORA LABS" className="h-16 w-16 rounded-xl object-cover shadow-sm" />
          <p className="mt-3 text-lg font-bold brand-gradient-text">VELMORA LABS</p>
          <p className="text-sm text-muted-foreground">Accès back-office protégé</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
            <CardDescription>Authentification serveur — session httpOnly signée (HMAC).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email">E-mail</Label>
                <Input id="login-email" type="email" required placeholder="vous@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="login-password">Mot de passe</Label>
                <Input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                Se connecter
              </Button>
            </form>
            <div className="mt-4 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Accès administrateur</p>
              <p>
                Les comptes de démonstration ont été supprimés lors de la remise en ordre
                (Sprint A — données de démo purgées). Les accès réels sont créés par le
                propriétaire dans Paramètres → Utilisateurs.
              </p>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              La session utilise un cookie httpOnly signé, complété par un jeton de repli
              lorsque les cookies sont bloqués (prévisualisation intégrée). Si le tableau
              de bord ne s'affiche pas malgré une connexion réussie, ouvrez l'application
              dans un nouvel onglet via le bouton « Open in New Tab ».
            </p>
            <button onClick={onExitToStore} className="mt-4 w-full text-center text-sm text-primary hover:underline">
              ← Retour à la boutique publique
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
