/// <reference types="bun-types" />
/**
 * Task 30 — Génère supabase-import.sql : DDL complet + données réelles de la base
 * locale PostgreSQL, pour import via l'éditeur SQL Supabase (sans partager de mot de passe).
 *
 * 1. Introspection pg_catalog / information_schema → CREATE TABLE IF NOT EXISTS,
 *    clés primaires inline, FK en ALTER TABLE (après toutes les tables), index non-PK.
 * 2. Données via Prisma (ordre TABLE_ORDER respectant les FK) → INSERT ... ON CONFLICT ("id")
 *    DO NOTHING (idempotent : le script peut être relancé sans erreur).
 * 3. VALIDATION : applique le SQL sur une base scratch locale (vml_scratch), compare
 *    les compteurs table par table avec la source, puis détruit la base scratch.
 *
 * Usage : bun scripts/gen-supabase-import.ts
 * Sortie : supabase-import.sql à la racine du projet.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { Pool } from "pg";
import { TABLE_ORDER } from "./db-shared";

// ── Résolution déterministe de l'URL locale (ignore l'environnement ambiant) ──
const envText = readFileSync(".env", "utf8");
const localUrlRaw = envText.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!localUrlRaw || !localUrlRaw.startsWith("postgresql://")) {
  console.error("DATABASE_URL locale introuvable/valide dans .env");
  process.exit(1);
}
const localUrl: string = localUrlRaw; // type explicite (utilisable dans les fermetures)
process.env.DATABASE_URL = localUrl; // pour PrismaClient (url + directUrl)

type Col = {
  table_name: string; column_name: string; data_type: string;
  is_nullable: string; column_default: string | null;
  character_maximum_length: number | null; datetime_precision: number | null;
  numeric_precision: number | null; numeric_scale: number | null;
};

const pool = new Pool({ connectionString: localUrl, max: 2 });
const db = new PrismaClient({ datasourceUrl: localUrl });

function sqlString(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "bigint") return String(v);
  if (v instanceof Date) return sqlString(v.toISOString());
  if (typeof v === "object") return sqlString(JSON.stringify(v)); // colonnes jsonb
  return sqlString(String(v));
}

function mapType(c: Col): string {
  switch (c.data_type) {
    case "character varying":
      return c.character_maximum_length ? `VARCHAR(${c.character_maximum_length})` : "TEXT";
    case "text": return "TEXT";
    case "timestamp with time zone": return `TIMESTAMPTZ(${c.datetime_precision ?? 3})`;
    case "timestamp without time zone": return `TIMESTAMP(${c.datetime_precision ?? 3})`;
    case "integer": return "INTEGER";
    case "bigint": return "BIGINT";
    case "smallint": return "SMALLINT";
    case "boolean": return "BOOLEAN";
    case "jsonb": return "JSONB";
    case "json": return "JSON";
    case "uuid": return "UUID";
    case "numeric": {
      const p = c.numeric_precision, s = c.numeric_scale;
      return p !== null ? `NUMERIC(${p},${s ?? 0})` : "NUMERIC";
    }
    case "double precision": return "DOUBLE PRECISION";
    case "real": return "REAL";
    case "date": return "DATE";
    default: return c.data_type.toUpperCase();
  }
}

async function main() {
  // ── 1. Introspection ────────────────────────────────────────────────
  const cols = (await pool.query<Col>(
    `SELECT table_name, column_name, data_type, is_nullable, column_default,
            character_maximum_length, datetime_precision, numeric_precision, numeric_scale
     FROM information_schema.columns WHERE table_schema='public'
     ORDER BY table_name, ordinal_position`
  )).rows;

  const pks = (await pool.query<{ table_name: string; pkcols: string }>(
    `SELECT tc.table_name, string_agg(kc.column_name, ',' ORDER BY kc.ordinal_position) AS pkcols
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kc
       ON tc.constraint_name=kc.constraint_name AND tc.table_schema=kc.table_schema
     WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'
     GROUP BY tc.table_name`
  )).rows;
  const pkMap = new Map<string, string[]>(
    pks.map((r): [string, string[]] => [r.table_name, r.pkcols.split(",")])
  );

  const fks = (await pool.query<{
    table_name: string; column_name: string; ref_table: string;
    ref_column: string; constraint_name: string; delete_rule: string;
  }>(
    `SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_table,
            ccu.column_name AS ref_column, tc.constraint_name, rc.delete_rule
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name=kcu.constraint_name AND tc.table_schema='public'
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name=ccu.constraint_name AND tc.table_schema='public'
     JOIN information_schema.referential_constraints rc
       ON tc.constraint_name=rc.constraint_name AND tc.table_schema='public'
     WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public'
     ORDER BY tc.table_name`
  )).rows;

  const idxs = (await pool.query<{ tablename: string; indexname: string; indexdef: string }>(
    `SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE schemaname='public' AND indexname NOT LIKE '%\\_pkey' ESCAPE '\\'
     ORDER BY tablename, indexname`
  )).rows;

  // ── 2. Génération DDL ───────────────────────────────────────────────
  const tables: string[] = Array.from<string>(new Set<string>(cols.map((c: Col) => c.table_name))).sort();
  const ddl: string[] = [];
  ddl.push(`-- ============================================================`);
  ddl.push(`-- VELMORA LABS — import Supabase (schéma + données réelles)`);
  ddl.push(`-- Généré le ${new Date().toISOString()} depuis la base de développement.`);
  ddl.push(`-- Idempotent : peut être relancé sans erreur.`);
  ddl.push(`-- ============================================================`);
  ddl.push(``);
  for (const t of tables) {
    const tcols = cols.filter(c => c.table_name === t);
    const pk = pkMap.get(t);
    const lines = tcols.map(c => {
      const def = c.column_default ? ` DEFAULT ${c.column_default}` : "";
      const nn = c.is_nullable === "NO" ? " NOT NULL" : "";
      return `  "${c.column_name}" ${mapType(c)}${def}${nn}`;
    });
    if (pk) lines.push(`  PRIMARY KEY (${pk.map(p => `"${p}"`).join(", ")})`);
    ddl.push(`CREATE TABLE IF NOT EXISTS "${t}" (`);
    ddl.push(lines.join(",\n"));
    ddl.push(`);`);
    ddl.push(``);
  }
  for (const f of fks) {
    const onDelete = f.delete_rule && f.delete_rule !== "NO ACTION" ? ` ON DELETE ${f.delete_rule}` : "";
    ddl.push(`ALTER TABLE "${f.table_name}" ADD CONSTRAINT "${f.constraint_name}"`);
    ddl.push(`  FOREIGN KEY ("${f.column_name}") REFERENCES "${f.ref_table}"("${f.ref_column}")${onDelete};`);
  }
  for (const i of idxs) {
    ddl.push(i.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ") + ";");
  }

  // ── 3. Données ──────────────────────────────────────────────────────
  const data: string[] = [];
  data.push(``);
  data.push(`-- ============ DONNÉES RÉELLES (idempotent) ============`);
  let totalRows = 0;
  const countsSource: Record<string, number> = {};
  for (const t of TABLE_ORDER) {
    if (!tables.includes(t)) { console.log(`(table absente localement: ${t})`); continue; }
    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "${t}" ORDER BY 1`
    );
    countsSource[t] = rows.length;
    if (rows.length === 0) continue;
    const colNames = Object.keys(rows[0]);
    const colList = colNames.map(c => `"${c}"`).join(", ");
    const BATCH = 40;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values = chunk.map(r => `(${colNames.map(c => sqlValue(r[c])).join(", ")})`).join(",\n  ");
      data.push(`INSERT INTO "${t}" (${colList}) VALUES\n  ${values}\nON CONFLICT ("${(pkMap.get(t) || ["id"]).join('","')}") DO NOTHING;`);
    }
    totalRows += rows.length;
    console.log(`${t}: ${rows.length} ligne(s)`);
  }

  const sql = [...ddl, ...data].join("\n") + "\n";
  writeFileSync("supabase-import.sql", sql);
  const sizeKb = Math.round(sql.length / 1024);
  console.log(`\nsupabase-import.sql écrit : ${tables.length} tables, ${totalRows} lignes, ${sizeKb} Ko`);

  // ── 4. Validation sur base scratch locale ───────────────────────────
  console.log(`\n== Validation sur base scratch locale ==`);
  await pool.query(`DROP DATABASE IF EXISTS vml_scratch WITH (FORCE);`);
  await pool.query(`CREATE DATABASE vml_scratch;`);
  const scratch = new Pool({ connectionString: localUrl.replace(/\/velmora(\?|$)/, "/vml_scratch$1"), max: 1 });
  let applied = 0;
  try {
    for (const stmt of sql.split(/;\n/).map(s =>
      s.split("\n").filter(line => !line.trim().startsWith("--")).join("\n").trim()
    ).filter(s => s.length > 0)) {
      await scratch.query(stmt.endsWith(";") ? stmt : stmt + ";");
      applied++;
    }
    let mismatches = 0;
    for (const t of tables) {
      const src = countsSource[t] ?? 0;
      const dst = (await scratch.query(`SELECT COUNT(*)::int AS c FROM "${t}"`)).rows[0].c;
      const status = dst === src ? "OK " : (src === 0 ? "ok (vide)" : "!! DIVERGENCE");
      if (dst !== src) mismatches++;
      console.log(`${status} ${t}: source=${src} scratch=${dst}`);
    }
    console.log(mismatches === 0 ? `\n✓ VALIDATION RÉUSSIE — ${applied} instructions appliquées, données identiques` : `\n!! ${mismatches} divergence(s)`);
  } finally {
    await scratch.end();
    await pool.query(`DROP DATABASE IF EXISTS vml_scratch WITH (FORCE);`);
  }

  await pool.end();
  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
