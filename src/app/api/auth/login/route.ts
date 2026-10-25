/**
 * POST /api/auth/login — connexion back-office.
 * Cookie httpOnly signé, journal d'audit, limitation de débit.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, err, audit } from "@/lib/api-utils";
import { authenticate, createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`login:${ip}`, 8, 10 * 60_000);
  if (!rl.allowed) return err("Trop de tentatives de connexion — réessayez plus tard.", 429, { retryAfterSec: rl.retryAfterSec });

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) return err("E-mail et mot de passe requis.", 400);

  const profile = await authenticate(email, password);
  if (!profile) {
    await audit(null, "auth.login_failed", "profile", undefined, { email });
    return err("Identifiants invalides ou compte désactivé.", 401);
  }

  const token = createSessionToken({
    uid: profile.id, email: profile.email, role: profile.role, displayName: profile.displayName,
  });

  await audit({ uid: profile.id, email: profile.email, role: profile.role, displayName: profile.displayName, exp: 0 }, "auth.login", "profile", profile.id);

  const res = NextResponse.json({
    user: { id: profile.id, email: profile.email, role: profile.role, displayName: profile.displayName },
    // Repli pour les contextes intégrés (iframe de prévisualisation) où le cookie
    // SameSite=Lax n'est pas renvoyé : le client le transmet via X-Session-Token.
    // Le cookie httpOnly reste le mécanisme principal en navigation classique.
    token,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    path: "/",
  });
  return res;
}
