"use client";

/**
 * Vue Utilisateurs — gestion des comptes et rôles (users.manage, owner uniquement).
 * Contrat API : GET/POST/PUT /api/admin/users. Mots de passe hashés scrypt côté serveur.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, formatDate } from "@/lib/client";
import type { AdminUser } from "@/components/admin/admin-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Loader2, Plus, ShieldAlert, UserPlus } from "lucide-react";

// ─────────────────────────── Types (formes exactes de l'API) ───────────────────────────

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoleOption { value: string; label: string; }

interface UsersResponse { users: UserRow[]; roles: RoleOption[]; }

// ─────────────────────────── Libellés ───────────────────────────

const ROLE_BADGE: Record<string, string> = {
  owner: "border-blue-200 bg-blue-50 text-blue-700",
  catalog_manager: "border-violet-200 bg-violet-50 text-violet-700",
  marketing_editor: "border-cyan-200 bg-cyan-50 text-cyan-700",
  crm_manager: "border-green-200 bg-green-50 text-green-700",
  analyst: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ─────────────────────────── Vue ───────────────────────────

export function UsersView({ user }: { user: AdminUser }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Création
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", displayName: "", role: "", password: "" });
  const [showCreatePass, setShowCreatePass] = useState(false);

  // Édition
  const [editTarget, setEditTarget] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [showEditPass, setShowEditPass] = useState(false);
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<UsersResponse>("/api/admin/users");
      setUsers(data.users);
      setRoles(data.roles);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setForm({ email: "", displayName: "", role: roles[0]?.value || "", password: "" });
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!EMAIL_RE.test(form.email.trim())) { toast.error("E-mail invalide."); return; }
    if (form.displayName.trim().length < 2) { toast.error("Nom d'affichage requis (2 caractères minimum)."); return; }
    if (!form.role) { toast.error("Choisissez un rôle."); return; }
    if (form.password.length < 10) { toast.error("Mot de passe requis (10 caractères minimum)."); return; }
    setCreating(true);
    try {
      await apiPost("/api/admin/users", {
        email: form.email.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        password: form.password,
      });
      toast.success("Utilisateur créé");
      setCreateOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de création de l'utilisateur");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (u: UserRow) => {
    setEditTarget(u);
    setEditRole(u.role);
    setEditPassword("");
    setShowEditPass(false);
    setEditActive(u.isActive);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    if (editPassword && editPassword.length < 10) { toast.error("Nouveau mot de passe trop court (10 caractères minimum)."); return; }
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = { id: editTarget.id };
      if (editRole && editRole !== editTarget.role) body.role = editRole;
      if (editPassword) body.password = editPassword;
      if (editActive !== editTarget.isActive) body.isActive = editActive;
      await apiPut("/api/admin/users", body);
      toast.success("Utilisateur mis à jour");
      setEditTarget(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de la mise à jour");
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (u: UserRow, next: boolean) => {
    try {
      await apiPut("/api/admin/users", { id: u.id, isActive: next });
      toast.success(next ? "Compte activé" : "Compte désactivé");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action refusée par le serveur");
      load();
    }
  };

  return (
    <div className="space-y-4">
      <Alert className="border-amber-300 bg-amber-50 text-amber-900">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Authentification à deux facteurs</AlertTitle>
        <AlertDescription>
          MFA non configuré dans cette version — à activer avant production.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Utilisateurs du back-office</CardTitle>
              <CardDescription>
                Rôles et accès — chaque modification est journalisée. Le serveur refuse toute auto-désactivation.
              </CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nouvel utilisateur
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Actif</TableHead>
                  <TableHead>Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Aucun utilisateur retourné par l&apos;API.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => {
                    const isSelf = u.id === user.id;
                    const roleMeta = roles.find((r) => r.value === u.role);
                    return (
                      <TableRow key={u.id} className={!u.isActive ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {u.displayName}
                            {isSelf && <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Vous</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={ROLE_BADGE[u.role] || ""}>
                            {roleMeta?.label || u.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={u.isActive}
                            disabled={isSelf}
                            aria-label={isSelf ? "Votre propre compte ne peut pas être désactivé" : `Activer ou désactiver ${u.displayName}`}
                            onCheckedChange={(v) => toggleActive(u, v)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                            <KeyRound className="h-3.5 w-3.5" /> Modifier
                          </Button>
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

      {/* Dialog création */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Nouvel utilisateur</DialogTitle>
            <DialogDescription>
              Le mot de passe est hashé scrypt côté serveur — il n&apos;est jamais stocké ni journalisé en clair.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-email">E-mail *</Label>
              <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-name">Nom d&apos;affichage *</Label>
              <Input id="u-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Rôle *</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choisir un rôle…" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">Mot de passe *</Label>
              <div className="relative">
                <Input
                  id="u-pass"
                  type={showCreatePass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  minLength={10}
                  className="pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePass((v) => !v)}
                  aria-label={showCreatePass ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showCreatePass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">10 caractères minimum — hashé scrypt côté serveur.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Annuler</Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />} Créer l&apos;utilisateur
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog édition */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto thin-scrollbar sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier : {editTarget?.displayName}</DialogTitle>
            <DialogDescription>
              Changez le rôle, réinitialisez le mot de passe (optionnel) ou activez/désactivez le compte.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-newpass">Réinitialiser le mot de passe (optionnel)</Label>
                <div className="relative">
                  <Input
                    id="u-newpass"
                    type={showEditPass ? "text" : "password"}
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Laisser vide pour conserver"
                    minLength={10}
                    className="pr-10"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowEditPass((v) => !v)}
                    aria-label={showEditPass ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    {showEditPass ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
                {editPassword && <p className="text-xs font-medium text-amber-700">Notez-le précieusement : aucun e-mail de récupération n&apos;est envoyé, et l&apos;ancien mot de passe cesse immédiatement de fonctionner.</p>}
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Compte actif</p>
                  <p className="text-xs text-muted-foreground">
                    {editTarget.id === user.id
                      ? "Vous ne pouvez pas désactiver votre propre compte (refusé aussi par le serveur)."
                      : "Un compte désactivé ne peut plus se connecter."}
                  </p>
                </div>
                <Switch
                  checked={editActive}
                  disabled={editTarget.id === user.id}
                  onCheckedChange={setEditActive}
                  aria-label="Activer ou désactiver le compte"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>Annuler</Button>
            <Button onClick={submitEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
