/**
 * Sprint B — Migration one-shot SQLite → PostgreSQL.
 * Lit l'ancienne base SQLite (bun:sqlite) et écrit dans la base cible configurée
 * par DATABASE_URL (PostgreSQL) via le client Prisma régénéré.
 *
 * Garanties :
 * - IDs, hachages de mots de passe et timestamps préservés à l'identique (le login owner continue de fonctionner).
 * - Ordre d'insertion respectant les clés étrangères.
 * - Refus si la cible contient déjà des données (sécurité anti-écrasement) sauf --force.
 * - Rapport de contrôle : comptes source vs cible table par table.
 *
 * Usage : bun scripts/sqlite-to-postgres.ts [--from db/custom.db] [--force]
 */
import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const force = args.includes("--force");
const fromPath = resolve(getArg("--from") ?? "db/custom.db");

if (!existsSync(fromPath)) {
  console.error(`✗ Base source introuvable : ${fromPath}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL?.startsWith("postgres")) {
  console.error("✗ DATABASE_URL ne pointe pas vers PostgreSQL — abandon.");
  process.exit(1);
}

// Champs DateTime (stockés en ms INTEGER par Prisma/SQLite) → Date
const DATETIME_FIELDS: Record<string, string[]> = {
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

// Champs Boolean (stockés 0/1 par SQLite) → boolean
const BOOLEAN_FIELDS: Record<string, string[]> = {
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

// Ordre d'insertion respectant les FK (parents avant enfants)
const TABLE_ORDER = [
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
];

const prisma = new PrismaClient();
const sqlite = new Database(fromPath, { readonly: true });

function toModel(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    if ((DATETIME_FIELDS[table] ?? []).includes(key)) {
      out[key] = new Date(value as number);
    } else if ((BOOLEAN_FIELDS[table] ?? []).includes(key)) {
      out[key] = Boolean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function main() {
  // Garde-fou : cible vide obligatoire
  const existing: Record<string, number> = {};
  for (const table of TABLE_ORDER) {
    existing[table] = await prisma[table].count();
  }
  const nonEmpty = Object.entries(existing).filter(([, n]) => n > 0);
  if (nonEmpty.length > 0 && !force) {
    console.error(`✗ Cible non vide (${nonEmpty.map(([t, n]) => `${t}=${n}`).join(", ")}) — utilisez --force pour écraser.`);
    process.exit(1);
  }
  if (force && nonEmpty.length > 0) {
    console.log(`⚠ --force : purge de la cible (${nonEmpty.map(([t, n]) => `${t}=${n}`).join(", ")})…`);
    // Purge en ordre inverse des FK
    for (const table of [...TABLE_ORDER].reverse()) {
      await prisma[table].deleteMany();
    }
  }

  let totalSource = 0;
  let totalTarget = 0;
  const report: string[] = [];

  for (const table of TABLE_ORDER) {
    let rows: Record<string, unknown>[];
    try {
      rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
    } catch {
      rows = [];
    }
    if (rows.length === 0) {
      report.push(`  ${table}: 0 → 0`);
      continue;
    }
    const data = rows.map((r) => toModel(table, r));
    // Insertion par lots (createMany ne gère pas tous les cas avec skipDuplicates implicite)
    for (let i = 0; i < data.length; i += 100) {
      await prisma[table].createMany({ data: data.slice(i, i + 100) });
    }
    const target = await prisma[table].count();
    report.push(`  ${table}: ${rows.length} → ${target}${rows.length !== target ? "  ⚠ ÉCART" : ""}`);
    totalSource += rows.length;
    totalTarget += target;
  }

  console.log("Rapport de migration :");
  console.log(report.join("\n"));
  console.log(`Total : ${totalSource} → ${totalTarget} enregistrements`);
  if (totalSource !== totalTarget) {
    console.error("✗ Écart détecté — vérifiez les warnings ⚠ ci-dessus.");
    process.exit(2);
  }
  console.log("✓ Migration terminée.");
}

main()
  .catch((e) => {
    console.error("✗ Échec migration :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    sqlite.close();
  });
