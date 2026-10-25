/**
 * Sprint B — helpers communs aux scripts de maintenance base de données.
 * Ordre des tables (respect des clés étrangères), typage SQLite→Prisma,
 * export/restore JSON provider-agnostique (SQLite comme PostgreSQL).
 */
import { PrismaClient } from "@prisma/client";

export const TABLE_ORDER = [
  "Profile",
  "Setting",
  "Category",
  "Partner",
  "PartnerIntegration",
  "Product",
  "ProductMedia",
  "ProductOffer",
  "CommissionRule",
  "Campaign",
  "ClickEvent",
  "Conversion",
  "CommissionTransaction",
  "CrmContact",
  "CrmActivity",
  "ConsentRecord",
  "AiAsset",
  "SocialPost",
  "ImportJob",
  "AuditLog",
  "ExchangeRate",
  "EmailLog",
] as const;

export type TableModel = (typeof TABLE_ORDER)[number];

/** Tables côté Prisma en camelCase (délégués clients) — même ordre. */
export const PRISMA_TABLES: readonly string[] = [
  "profile", "setting", "category", "partner", "partnerIntegration",
  "product", "productMedia", "productOffer", "commissionRule",
  "campaign", "clickEvent", "conversion", "commissionTransaction",
  "crmContact", "crmActivity", "consentRecord",
  "aiAsset", "socialPost", "importJob", "auditLog", "exchangeRate", "emailLog",
];

export const DATETIME_FIELDS: Record<string, string[]> = {
  Profile: ["createdAt", "updatedAt"],
  Setting: ["updatedAt"],
  Partner: ["createdAt", "updatedAt"],
  PartnerIntegration: ["lastSyncAt", "createdAt", "updatedAt"],
  Category: ["createdAt", "updatedAt"],
  Product: ["createdAt", "updatedAt"],
  ProductMedia: [],
  ProductOffer: ["lastSyncedAt", "urlCheckedAt", "createdAt", "updatedAt"],
  CommissionRule: ["validFrom", "validTo", "createdAt"],
  Campaign: ["startAt", "endAt", "createdAt", "updatedAt"],
  ClickEvent: ["clickedAt"],
  Conversion: ["reportedAt", "createdAt"],
  CommissionTransaction: ["occurredAt"],
  CrmContact: ["consentAt", "anonymizedAt", "createdAt", "updatedAt"],
  CrmActivity: ["dueAt", "createdAt"],
  ConsentRecord: ["recordedAt", "withdrawnAt"],
  AiAsset: ["createdAt"],
  SocialPost: ["scheduledAt", "approvedAt", "createdAt", "updatedAt"],
  ImportJob: ["startedAt", "finishedAt"],
  AuditLog: ["createdAt"],
  ExchangeRate: ["fetchedAt"],
  EmailLog: ["sentAt", "createdAt", "updatedAt"],
};

export const BOOLEAN_FIELDS: Record<string, string[]> = {
  Profile: ["isActive"],
  Partner: ["isDemo"],
  Category: ["isActive"],
  Product: ["allowInquiry", "isDemo"],
  ProductOffer: ["isActive"],
  Campaign: ["isDemo"],
  ClickEvent: ["isDemo"],
  Conversion: ["isDemo"],
  CrmContact: ["isDemo"],
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** Convertit une ligne exportée JSON en entrée Prisma (ISO → Date, 0/1 → boolean). */
export function toModelRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    if ((DATETIME_FIELDS[table] ?? []).includes(key)) {
      if (typeof value === "string" && ISO_DATE.test(value)) out[key] = new Date(value);
      else if (typeof value === "number") out[key] = new Date(value);
    } else if ((BOOLEAN_FIELDS[table] ?? []).includes(key)) {
      out[key] = Boolean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

type Delegate = { findMany: (o?: unknown) => Promise<Record<string, unknown>[]>; createMany: (o: unknown) => Promise<unknown>; deleteMany: (o?: unknown) => Promise<unknown>; count: (o?: unknown) => Promise<number> };

/** Export JSON complet (rédaction du hachage de mot de passe — jamais en clair dans data.json). */
export async function exportDataJson(db: PrismaClient): Promise<{ data: Record<string, unknown[]>; counts: Record<string, number> }> {
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of PRISMA_TABLES) {
    const model = (db as unknown as Record<string, Delegate>)[table];
    const rows = await model.findMany();
    data[table] = table === "profile"
      ? rows.map((r) => ({ ...r, passwordHash: "[rédigé — non exportable en JSON]" }))
      : rows;
    counts[table] = rows.length;
  }
  return { data, counts };
}

/**
 * Restaure data.json dans la base cible (purge + réinsertion en ordre FK).
 * Le profil owner est TOUJOURS sauté si son hash est rédigé (le JSON n'expose jamais les
 * hachages) — affiche un avertissement explicite : recréer le owner via set-owner-credentials.
 */
export async function restoreFromDataJson(db: PrismaClient, tables: Record<string, unknown[]>, options: { dryRun?: boolean } = {}): Promise<{ restored: Record<string, number>; skipped: string[] }> {
  const restored: Record<string, number> = {};
  const skipped: string[] = [];

  if (!options.dryRun) {
    for (const table of [...TABLE_ORDER].reverse()) {
      const model = (db as unknown as Record<string, Delegate>)[table];
      await model.deleteMany();
    }
  }

  for (const table of TABLE_ORDER) {
    const camel = table.charAt(0).toLowerCase() + table.slice(1);
    const rows = tables[camel];
    if (!rows || rows.length === 0) continue;
    if (table === "Profile") {
      const first = rows[0] as Record<string, unknown>;
      if (typeof first.passwordHash === "string" && first.passwordHash.startsWith("[rédigé")) {
        skipped.push("profile (hachage non exporté en JSON — recréer le owner via scripts/set-owner-credentials.ts)");
        continue;
      }
    }
    const data = rows.map((r) => toModelRow(table, r as Record<string, unknown>));
    if (options.dryRun) { restored[camel] = data.length; continue; }
    const model = (db as unknown as Record<string, Delegate>)[table];
    for (let i = 0; i < data.length; i += 100) {
      await model.createMany({ data: data.slice(i, i + 100) });
    }
    restored[camel] = data.length;
  }
  return { restored, skipped };
}
