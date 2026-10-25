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

export function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function requireSession(req: Request): SessionPayload | null {
  return sessionFromRequest(req);
}

/** Garde RBAC : renvoie la session ou une réponse d'erreur prête à retourner. */
export async function requirePermission(
  req: Request,
  permission: Permission
): Promise<{ session: SessionPayload } | { error: NextResponse }> {
  const session = sessionFromRequest(req);
  if (!session) return { error: err("Authentification requise", 401) };
  if (!hasPermission(session.role, permission)) {
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

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",;\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
