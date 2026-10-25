/**
 * Authentification serveur — session par cookie httpOnly signé (HMAC-SHA256).
 * Les mots de passe sont hachés avec scrypt (node:crypto). Aucun secret côté navigateur.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "vml_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8h

function getSecret(): string {
  return process.env.AUTH_SECRET || "velmora-dev-secret-change-me";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export interface SessionPayload {
  uid: string;
  email: string;
  role: string;
  displayName: string;
  exp: number; // epoch ms
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(JSON.stringify(full));
  return `${body}.${sign(body)}`;
}

export function parseSessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Extrait la session d'une requête.
 * 1. Cookie httpOnly (mécanisme principal, navigateur de premier plan).
 * 2. En-tête `X-Session-Token` (repli pour les contextes intégrés — iframe de
 *    prévisualisation — où les navigateurs bloquent les cookies tiers SameSite=Lax).
 *    Le token est le même jeton signé HMAC, à durée de vie limitée (8 h).
 */
export function sessionFromRequest(req: Request): SessionPayload | null {
  const headerToken = req.headers.get("x-session-token");
  if (headerToken) {
    const fromHeader = parseSessionToken(headerToken.trim());
    if (fromHeader) return fromHeader;
  }
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return parseSessionToken(match ? decodeURIComponent(match[1]) : null);
}

export async function authenticate(email: string, password: string) {
  const profile = await db.profile.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!profile || !profile.isActive) return null;
  if (!verifyPassword(password, profile.passwordHash)) return null;
  return profile;
}

/** Identifiant de session anonyme minimisé (hash court, aucune donnée personnelle). */
export function anonymizedSessionId(ip: string, userAgent: string, day: string): string {
  return createHmac("sha256", getSecret()).update(`${ip}|${userAgent}|${day}`).digest("hex").slice(0, 12);
}
