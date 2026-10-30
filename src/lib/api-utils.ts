/**
 * Utilitaires API — réponses JSON normalisées, garde RBAC, journal d'audit.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessionFromRequest, type SessionPayload } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/rbac";

/** Sérialisation JSON sûre : SQLite renvoie des BigInt pour COUNT(*) en requêtes brutes. */
function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? Number(value) : value;
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(JSON.parse(JSON.stringify(data ?? null, jsonReplacer)), init);
}

/**
 * Cache CDN Vercel pour les réponses publiques GET peu volatiles (routes /api/public/*).
 * - s-maxage=120 : la réponse est servie depuis le cache edge pendant 2 min (latence
 *   quasi nulle, aucune invocation serverless) ;
 * - stale-while-revalidate=300 : une réponse périmée est servie immédiatement pendant
 *   qu'une fraîche est recalculée en arrière-plan (aucun « coup de froid » visible).
 * Les URLs avec paramètres (catalogue : ?cat=&q=&page=) sont cachées par URL — le
 * contenu public ne varie pas à cette échelle de temps.
 */
export const PUBLIC_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
};

export function okCached<T>(data: T, extraHeaders?: Record<string, string>) {
  return ok(data, { headers: { ...PUBLIC_CACHE_HEADERS, ...extraHeaders } });
}

export function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function requireSession(req: Request): SessionPayload | null {
  return sessionFromRequest(req);
}

/**
 * Cache rôle/état actif (Task 45 — RBAC faisant autorité).
 * Le jeton de session est stateless : le rôle y est figé à la connexion. Sans
 * relecture, un compte rétrogradé ou désactivé conserve ses privilèges jusqu'à
 * l'expiration du jeton (8 h). On relit donc Profile en base, avec un TTL court
 * (30 s) pour éviter une requête SQL par appel d'API — une rétrogradation ou une
 * désactivation prend effet au plus tard 30 s après l'écriture en base.
 */
const ROLE_CACHE_TTL_MS = 30_000;
const roleCache = new Map<string, { role: string; isActive: boolean; at: number }>();

async function currentRole(uid: string, fallbackRole: string): Promise<{ role: string; isActive: boolean } | null> {
  const cached = roleCache.get(uid);
  const now = Date.now();
  if (cached && now - cached.at < ROLE_CACHE_TTL_MS) return cached;
  try {
    const profile = await db.profile.findUnique({
      where: { id: uid },
      select: { role: true, isActive: true },
    });
    if (!profile) return null; // compte supprimé → accès immédiatement coupé
    const entry = { role: profile.role, isActive: profile.isActive, at: now };
    roleCache.set(uid, entry);
    if (roleCache.size > 500) roleCache.clear(); // garde-fou mémoire
    return entry;
  } catch {
    // Base injoignable : on retombe sur le rôle du jeton (disponibilité > fraîcheur),
    // la signature HMAC reste la garantie d'authenticité.
    return { role: fallbackRole, isActive: true };
  }
}

/** Garde RBAC : renvoie la session ou une réponse d'erreur prête à retourner. */
export async function requirePermission(
  req: Request,
  permission: Permission
): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = sessionFromRequest(req);
  if (!session) return { error: err("Authentification requise", 401) };
  const live = await currentRole(session.uid, session.role);
  if (!live || !live.isActive) {
    return { error: err("Compte désactivé ou supprimé", 401) };
  }
  if (!hasPermission(live.role, permission)) {
    return { error: err("Permission insuffisante pour cette action", 403, { required: permission }) };
  }
  return { session };
}

export async function audit(
  session: SessionPayload | null,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.auditLog.create({
      data: {
        actorId: session?.uid ?? null,
        actorEmail: session?.email ?? null,
        action,
        entityType: entityType ?? null,
        entityId: entityId ?? null,
        metadataJson: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch {
    // le journal ne doit jamais bloquer l'opération métier
  }
}

export function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export { isDomainAllowed } from "./url-guard";

/**
 * Task 45 — neutralisation des formules CSV : un champ commençant par = + - @ ou
 * une tabulation/retour chariot serait interprété comme une formule à l'ouverture
 * dans Excel/LibreOffice (injection via des données saisies dans les formulaires
 * publics, exécutée par le destinataire de l'export). Une apostrophe initiale
 * désactive l'interprétation formule dans tous les tableurs.
 */
export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  if (/[",;\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function toCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  if (rows.length === 0) return headers ? headers.join(";") + "\n" : "";
  const cols = headers || Object.keys(rows[0]);
  const lines = [cols.join(";")];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(";"));
  }
  return lines.join("\n") + "\n";
}

/** Parseur CSV minimal (guillemets RFC 4180, séparateur , ou ;). */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ";" : ",";

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      record.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      record.push(field); field = "";
      if (record.some((f) => f.trim() !== "") || records.length > 0) records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  record.push(field);
  if (record.some((f) => f.trim() !== "")) records.push(record);

  const headers = (records.shift() || []).map((h) => h.trim());
  const rows = records.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
    return obj;
  });
  return { headers, rows };
}
