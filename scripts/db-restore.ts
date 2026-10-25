/// <reference types="bun-types" />
/**
 * Restauration de la base VELMORA LABS depuis une sauvegarde (scripts/db-backup.ts).
 *
 * Usage :
 *   bun scripts/db-restore.ts --latest            # restaure la sauvegarde la plus récente (simulation)
 *   bun scripts/db-restore.ts --latest --yes      # exécute réellement la restauration
 *   bun scripts/db-restore.ts --from=backups/backup-20261024-101500 --yes
 *
 * Deux chemins selon la sauvegarde :
 *  - SQLite (custom.db + manifeste) : vérification SHA-256 puis copie physique — hachages inclus.
 *  - PostgreSQL / data.json : purge + réinsertion logique en ordre FK. Le hash du mot de passe
 *    owner N'EST PAS dans data.json (rédaction volontaire) → le profil owner est sauté :
 *    recréer via scripts/set-owner-credentials.ts après restauration.
 *
 * Sécurité :
 *  - empreinte SHA-256 vérifiée contre manifest.json (chemin SQLite) ;
 *  - AVANT d'écraser, sauvegarde d'urgence de l'état actuel dans backups/pre-restore-<ts>/ ;
 *  - sans --yes, se contente d'afficher ce qui serait fait (simulation).
 *
 * ⚠️ Après restauration : redémarrer le serveur (bun run dev) pour que Prisma
 * rouvre la base — un serveur en cours d'exécution peut conserver l'ancien descripteur.
 */
import { existsSync, readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { PrismaClient } from "@prisma/client";
import { PRISMA_TABLES, exportDataJson, restoreFromDataJson } from "./db-shared";

const ROOT = process.cwd();
const DB_FILE = resolve(ROOT, "db/custom.db");
const BACKUPS_DIR = resolve(ROOT, "backups");
const db = new PrismaClient();

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function latestBackup(): string | null {
  if (!existsSync(BACKUPS_DIR)) return null;
  const dirs = readdirSync(BACKUPS_DIR)
    .filter((n) => /^backup-\d{8}-\d{6}$/.test(n))
    .sort()
    .reverse();
  return dirs[0] ? join(BACKUPS_DIR, dirs[0]) : null;
}

function currentProvider(): "postgresql" | "sqlite" {
  if (process.env.DATABASE_URL?.startsWith("postgres")) return "postgresql";
  try {
    const envFile = readFileSync(join(ROOT, ".env"), "utf8");
    const m = envFile.match(/^DATABASE_URL=(.+)$/m);
    return (m?.[1]?.trim() || "").startsWith("postgres") ? "postgresql" : "sqlite";
  } catch {
    return "sqlite";
  }
}

/** Sauvegarde d'urgence JSON de l'état actuel (chemin PostgreSQL). */
async function emergencyJsonExport(targetDir: string): Promise<string> {
  mkdirSync(targetDir, { recursive: true });
  const { data, counts } = await exportDataJson(db);
  const file = join(targetDir, "data.json");
  writeFileSync(file, JSON.stringify({ exportedAt: new Date().toISOString(), tables: data }, null, 1), { mode: 0o600 });
  return `data.json (${Object.values(counts).reduce((a, b) => a + b, 0)} lignes)`;
}

async function main() {
  const args = process.argv.slice(2);
  const fromArg = args.find((a) => a.startsWith("--from="));
  const apply = args.includes("--yes");

  let backupDir: string | null = null;
  if (fromArg) {
    backupDir = resolve(ROOT, fromArg.split("=")[1]);
  } else if (args.includes("--latest")) {
    backupDir = latestBackup();
  } else {
    console.error("✗ Précisez --latest ou --from=backups/backup-… (sans --yes : simple simulation).");
    process.exit(1);
  }

  if (!backupDir || !existsSync(join(backupDir, "manifest.json"))) {
    console.error(`✗ Sauvegarde invalide ou introuvable : ${backupDir ?? "(aucune)"}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(join(backupDir, "manifest.json"), "utf8")) as {
    sha256: string | null; createdAt: string; totalRows: number; provider?: string;
  };
  const hasSqliteFile = existsSync(join(backupDir, "custom.db"));
  const hasDataJson = existsSync(join(backupDir, "data.json"));
  const mode: "sqlite" | "json" | "invalid" = hasSqliteFile ? "sqlite" : hasDataJson ? "json" : "invalid";

  if (mode === "invalid") {
    console.error(`✗ Sauvegarde sans custom.db ni data.json : ${backupDir}`);
    process.exit(1);
  }

  if (mode === "sqlite") {
    const actual = sha256(join(backupDir, "custom.db"));
    if (actual !== manifest.sha256) {
      console.error(`✗ Empreinte SHA-256 différente du manifeste (${actual} ≠ ${manifest.sha256}) — sauvegarde corrompue, restauration refusée.`);
      process.exit(1);
    }
    if (currentProvider() !== "sqlite") {
      console.error("✗ La sauvegarde est SQLite mais la base courante est PostgreSQL — migration requise (scripts/sqlite-to-postgres.ts), pas une restauration.");
      process.exit(1);
    }
  }

  console.log(`→ Sauvegarde sélectionnée : ${backupDir}`);
  console.log(`  Créée : ${manifest.createdAt} · ${manifest.totalRows} lignes · mode ${mode === "sqlite" ? "SQLite (copie physique)" : "JSON (PostgreSQL)"}${mode === "sqlite" ? " · SHA-256 vérifié ✓" : ""}`);
  if (!apply) {
    console.log("→ SIMULATION — relancez avec --yes pour restaurer réellement.");
    process.exit(0);
  }

  // Sauvegarde d'urgence de l'état actuel avant écrasement.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
  const preRestoreDir = join(BACKUPS_DIR, `pre-restore-${stamp}`);

  if (mode === "sqlite") {
    mkdirSync(preRestoreDir, { recursive: true });
    const sqlite = new Database(DB_FILE);
    try {
      sqlite.exec(`VACUUM INTO '${join(preRestoreDir, "custom.db").replace(/'/g, "''")}'`);
    } finally {
      sqlite.close();
    }
    console.log(`  État actuel mis à l'abri : ${preRestoreDir}/custom.db`);
    copyFileSync(join(backupDir, "custom.db"), DB_FILE);
    console.log("✓ Base SQLite restaurée depuis la sauvegarde.");
  } else {
    const parsed = JSON.parse(readFileSync(join(backupDir, "data.json"), "utf8")) as { tables: Record<string, unknown[]> };
    const tables = parsed.tables ?? {};
    // Contrôle : export cohérent. Les tables ajoutées après la sauvegarde (ex: emailLog)
    // sont absentes des anciens exports → avertissement, restauration des autres tables.
    const present = PRISMA_TABLES.filter((t) => t in tables);
    const missing = PRISMA_TABLES.filter((t) => !(t in tables));
    if (present.length === 0 || !("profile" in tables) || !("setting" in tables)) {
      console.error("✗ Export inutilisable (tables de base profile/setting absentes) — restauration refusée.");
      process.exit(1);
    }
    if (missing.length > 0) {
      console.log(`  Tables absentes de l'export (ajouts postérieurs, ignorées) : ${missing.join(", ")}`);
    }
    const emergency = await emergencyJsonExport(preRestoreDir);
    console.log(`  État actuel mis à l'abri : ${preRestoreDir}/${emergency}`);
    const { restored, skipped } = await restoreFromDataJson(db, tables);
    console.log(`✓ Base PostgreSQL restaurée : ${Object.entries(restored).map(([t, n]) => `${t}=${n}`).join(", ") || "aucune donnée"}`);
    for (const s of skipped) console.log(`⚠ Sauté : ${s}`);
  }
  console.log("⚠ Redémarrez le serveur (bun run dev) pour que Prisma rouvre la base restaurée.");
}

main().catch((e) => {
  console.error("✗ Échec de la restauration :", e instanceof Error ? e.message : e);
  process.exit(1);
}).finally(() => db.$disconnect());
