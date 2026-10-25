/**
 * POST /api/admin/imports/conversions — import CSV de relevés de conversions.
 * Déduplication stricte : partner_id + external_conversion_id (contrainte d'unicité DB).
 * Corps : { csv, mapping: {partner, externalId, date, status, orderValue, orderCurrency, commission, commissionCurrency, offerExternalId?}, dryRun }
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit, parseCsv } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const VALID_STATUSES = ["estimated", "pending", "confirmed", "cancelled", "paid", "unknown"];

function parseMoneyToCents(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const v = parseFloat(normalized);
  return Number.isNaN(v) ? null : Math.round(v * 100);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "conversions.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body?.csv || typeof body.csv !== "string") return err("Contenu CSV manquant.");
  const mapping = body.mapping || {};
  const dryRun = body.dryRun !== false;

  const { rows } = parseCsv(body.csv);
  if (rows.length === 0) return err("Aucune ligne détectée.");

  const partners = await db.partner.findMany();
  const job = await db.importJob.create({
    data: { importType: "conversions", status: "partial", startedAt: new Date(), actorId: session.uid },
  });

  const errors: { row: number; message: string }[] = [];
  const duplicates: { row: number; externalId: string }[] = [];
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2;
    const get = (field: string, fallback?: string) => (mapping[field] ? row[mapping[field]] : row[field]) ?? fallback ?? "";
    const partnerName = String(get("partner")).trim();
    const externalId = String(get("externalId")).trim();
    if (!partnerName) { errors.push({ row: rowNo, message: "Partenaire manquant." }); continue; }
    if (!externalId) { errors.push({ row: rowNo, message: "Identifiant externe de conversion manquant." }); continue; }

    const partner = partners.find((p) => p.name.toLowerCase() === partnerName.toLowerCase() || p.name.toLowerCase().includes(partnerName.toLowerCase()));
    if (!partner) { errors.push({ row: rowNo, message: `Partenaire « ${partnerName} » introuvable.` }); continue; }

    const statusRaw = String(get("status", "pending")).trim().toLowerCase();
    const status = VALID_STATUSES.includes(statusRaw) ? statusRaw : "unknown";

    const dateRaw = String(get("date")).trim();
    let reportedAt = new Date();
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (Number.isNaN(d.getTime())) { errors.push({ row: rowNo, message: `Date invalide : « ${dateRaw} ».` }); continue; }
      reportedAt = d;
    }

    const orderValueCents = parseMoneyToCents(String(get("orderValue")));
    const orderCurrency = String(get("orderCurrency", "")).trim().toUpperCase().slice(0, 3) || null;
    const commissionCents = parseMoneyToCents(String(get("commission")));
    const commissionCurrency = String(get("commissionCurrency", "")).trim().toUpperCase().slice(0, 3) || null;

    // Rattachement d'offre optionnel via identifiant externe
    const offerExt = String(get("offerExternalId")).trim();
    let offerId: string | null = null;
    if (offerExt) {
      const offer = await db.productOffer.findFirst({ where: { externalId: offerExt, partnerId: partner.id } });
      offerId = offer?.id || null;
    }

    // Déduplication : partnerId + externalConversionId
    const existing = await db.conversion.findUnique({
      where: { partnerId_externalConversionId: { partnerId: partner.id, externalConversionId: externalId } },
    });
    if (existing) {
      duplicates.push({ row: rowNo, externalId });
      continue;
    }

    if (dryRun) { imported++; continue; }

    const created = await db.conversion.create({
      data: {
        partnerId: partner.id,
        externalConversionId: externalId.slice(0, 120),
        offerId,
        reportedAt,
        status,
        orderValueCents, orderCurrency,
        commissionAmountCents: commissionCents, commissionCurrency,
        sourceReportId: `import-${job.id}`,
        isDemo: false,
        note: "Importé via CSV.",
      },
    });
    await db.commissionTransaction.create({
      data: {
        conversionId: created.id,
        eventType: status,
        amountCents: commissionCents,
        currency: commissionCurrency,
        occurredAt: reportedAt,
        externalReference: externalId,
        notes: "Créé à l'import CSV.",
      },
    });
    imported++;
  }

  const counts = { totalRows: rows.length, imported, errors: errors.length, duplicates: duplicates.length };
  await db.importJob.update({
    where: { id: job.id },
    data: {
      finishedAt: new Date(),
      status: imported === 0 && errors.length > 0 ? "failed" : errors.length === 0 && duplicates.length === 0 ? "completed" : "partial",
      countsJson: JSON.stringify(counts),
      errorSummary: errors.slice(0, 20).map((e) => `Ligne ${e.row} : ${e.message}`).join(" | ") || null,
    },
  });
  await audit(session, dryRun ? "import.conversions.dry_run" : "import.conversions.run", "import_job", job.id, counts);

  return ok({ jobId: job.id, dryRun, counts, errors: errors.slice(0, 50), duplicates: duplicates.slice(0, 50) });
}
