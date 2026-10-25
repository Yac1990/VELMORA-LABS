/**
 * GET / POST /api/admin/users — gestion des utilisateurs et rôles (owner uniquement)
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";
import { hashPassword } from "@/lib/auth";
import { ROLE_ORDER, ROLE_LABELS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requirePermission(req, "users.manage");
  if ("error" in guard) return guard.error;
  const users = await db.profile.findMany({
    select: { id: true, email: true, displayName: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return ok({ users, roles: ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] })) });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "users.manage");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const displayName = String(body?.displayName || "").trim();
  const role = String(body?.role || "analyst");
  const password = String(body?.password || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return err("E-mail invalide.");
  if (displayName.length < 2) return err("Nom d'affichage requis.");
  if (!ROLE_ORDER.includes(role)) return err("Rôle invalide.");
  if (password.length < 10) return err("Mot de passe requis (10 caractères minimum).");

  const exists = await db.profile.findUnique({ where: { email } });
  if (exists) return err("Un utilisateur avec cet e-mail existe déjà.");

  const created = await db.profile.create({
    data: { email, displayName, role, passwordHash: hashPassword(password) },
    select: { id: true, email: true, displayName: true, role: true, isActive: true },
  });
  await audit(session, "user.create", "profile", created.id, { email, role });
  return ok({ user: created }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, "users.manage");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body?.id) return err("id requis");
  const user = await db.profile.findUnique({ where: { id: String(body.id) } });
  if (!user) return err("Utilisateur introuvable", 404);

  const data: Record<string, unknown> = {};
  if (body.role && ROLE_ORDER.includes(body.role)) data.role = body.role;
  if (body.displayName) data.displayName = String(body.displayName).trim();
  if (typeof body.isActive === "boolean") {
    if (user.id === session.uid && !body.isActive) return err("Impossible de désactiver votre propre compte.");
    data.isActive = body.isActive;
  }
  if (body.password) {
    if (String(body.password).length < 10) return err("Mot de passe trop court (10 caractères min.).");
    data.passwordHash = hashPassword(String(body.password));
  }

  const updated = await db.profile.update({
    where: { id: user.id },
    data,
    select: { id: true, email: true, displayName: true, role: true, isActive: true },
  });
  await audit(session, "user.update", "profile", user.id, { fields: Object.keys(data) });
  return ok({ user: updated });
}
