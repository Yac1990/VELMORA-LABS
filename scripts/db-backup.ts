/// <reference types="bun-types" />
/**
 * Sauvegarde de la base VELMORA LABS — Sprint A (RAPPORT §6 item 5), étendu Sprint B (PostgreSQL).
 *
 * Produit un dossier backups/backup-<horodatage>/ contenant :
 *  - SQLite  : custom.db (copie physique cohérente VACUUM INTO) + data.json + manifest.json
 *  - PostgreSQL : data.json (export logique complet) + manifest.json
 *    (pg_dump indisponible dans le sandbox — en production préférer pg_dump -Fc ;
 *     data.json n'expose jamais les hachages de mots de passe → restauration du owner
 *     via scripts/set-owner-credentials.ts, voir db-restore.ts)
 *
 * Usage :
 *   bun scripts/db-backup.ts                # sauvegarde dans backups/ (rétention 12 par défaut)
 *   bun scripts/db-backup.ts --out=backups  # dossier cible
 *   bun scripts/db-backup.ts --keep=6       # nombre de sauvegardes conservées
 *
 * Planification (cron) : 30 4 * * * cd /home/z/my-project && bun scripts/db-backup.ts >> logs/backup.log 2>&1
 * Restauration : bun scripts/db-restore.ts --latest (ou --from=backups/backup-…)
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";
import { exportDataJson } from "./db-shared";

const ROOT = process.cwd();
const DB_FILE = resolve(ROOT, "db/custom.db");
const db = new PrismaClient();

/** DATABASE_URL réel : priorité au shell si PostgreSQL, sinon lecture directe du .env (immune aux exports sandbox). */
function resolveDatabase(): { url: string; provider: "postgresql" | "sqlite" } {
  if (process.env.DATABASE_URL?.startsWith("postgres")) {
    return { url: process.env.DATABASE_URL, provider: "postgresql" };
  }
  try {
    const envFile = readFileSync(join(ROOT, ".env"), "utf8");
    const m = envFile.match(/^DATABASE_URL=(.+)$/m);
    const url = m?.[1]?.trim() || process.env.DATABASE_URL || "";
    return { url, provider: url.startsWith("postgres") ? "postgresql" : "sqlite" };
  } catch {
    return { url: process.env.DATABASE_URL ?? "", provider: "sqlite" };
  }
}

/** URL rédigée pour le manifeste (mot de passe masqué). */
function redactUrl(url: string): string {
  return url.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith("--out="));
  const keepArg = args.find((a) => a.startsWith("--keep="));
  const outDir = resolve(ROOT, outArg ? outArg.split("=")[1] : "backups");
  const keep = Math.max(1, parseInt(keepArg ? keepArg.split("=")[1] : "12", 10) || 12);

  const { url, provider } = resolveDatabase();
  const stamp = timestamp();
  const backupDir = join(outDir, `backup-${stamp}`);
  mkdirSync(backupDir, { recursive: true });

  let physicalFile: string | null = null;
  let digest = "";

  if (provider === "sqlite") {
    if (!existsSync(DB_FILE)) {
      console.error(`✗ Base SQLite introuvable : ${DB_FILE}`);
      process.exit(1);
    }
    // Copie physique cohérente via VACUUM INTO (fonctionne même pendant que le serveur tourne).
    const physTarget = join(backupDir, "custom.db");
    const sqlite = new Database(DB_FILE);
    try {
      const escaped = physTarget.replace(/'/g, "''");
      sqlite.exec(`VACUUM INTO '${escaped}'`);
    } finally {
      sqlite.close();
    }
    physicalFile = "custom.db";
    digest = sha256(physTarget);
  }

  // Export logique JSON (toutes les tables — hachages de mots de passe rédigés).
  const { data, counts } = await exportDataJson(db);
  writeFileSync(join(backupDir, "data.json"), JSON.stringify({ exportedAt: new Date().toISOString(), tables: data }, null, 1), { mode: 0o600 });

  // Manifeste.
  const manifest = {
    createdAt: new Date().toISOString(),
    provider,
    sourceDatabase: redactUrl(url),
    physicalFile,
    sha256: digest || null,
    tables: counts,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    note: provider === "postgresql"
      ? "Sauvegarde VELMORA LABS (PostgreSQL). Restauration : bun scripts/db-restore.ts --from=<dossier> — le hash du mot de passe owner n'est pas dans data.json : recréer via scripts/set-owner-credentials.ts. En production, préférer pg_dump -Fc."
      : "Sauvegarde VELMORA LABS (SQLite). Restauration : bun scripts/db-restore.ts --from=<dossier>",
  };
  writeFileSync(join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });

  // Rétention : supprimer les sauvegardes au-delà de --keep.
  const siblings = readdirSync(outDir)
    .filter((n) => /^backup-\d{8}-\d{6}$/.test(n))
    .sort()
    .reverse();
  let pruned = 0;
  for (const old of siblings.slice(keep)) {
    rmSync(join(outDir, old), { recursive: true, force: true });
    pruned++;
  }

  console.log(`✓ Sauvegarde créée : ${backupDir}`);
  console.log(`  Fournisseur : ${provider}${physicalFile ? ` · Copie physique : ${physicalFile} (${digest.slice(0, 12)}…)` : " · Export logique : data.json (copie physique pg_dump recommandée en production)"}`);
  console.log(`  Tables : ${Object.entries(counts).filter(([, c]) => c > 0).map(([t, c]) => `${t}=${c}`).join(", ") || "aucune donnée"}`);
  console.log(`  Rétention : ${siblings.length} sauvegarde(s) présente(s), ${pruned} supprimée(s) (conservation ${keep}).`);
}

main()
  .catch((e) => {
    console.error("✗ Échec de la sauvegarde :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
