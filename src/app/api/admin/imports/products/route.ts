/**
 * POST /api/admin/imports/products — import CSV avec mapping, prévisualisation,
 * validation, déduplication et rapport d'erreurs.
 * Corps : { csv: string, mapping: {title, description, categorySlug?, slug?, price?, currency?, url?, partnerId?, ...}, dryRun: boolean }
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err, requirePermission, audit, parseCsv, parseJsonArray } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || `produit-${Date.now().toString(36)}`;
}

function parsePriceToCents(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/\s/g, "");
  // 1 234,56 → 1234.56 ; 1,234.56 → 1234.56
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }
  const value = parseFloat(normalized);
  if (Number.isNaN(value) || value < 0) return null;
  return Math.round(value * 100);
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "imports.run");
  if ("error" in guard) return guard.error;
  const session = guard.session;
  const body = await req.json().catch(() => null);
  if (!body?.csv || typeof body.csv !== "string") return err("Contenu CSV manquant.");
  const mapping = body.mapping || {};
  const dryRun = body.dryRun !== false;

  const { rows } = parseCsv(body.csv);
  if (rows.length === 0) return err("Aucune ligne de données détectée dans le CSV.");

  const categories = await db.category.findMany();
  const partners = await db.partner.findMany();
  const job = await db.importJob.create({
    data: { importType: "products", status: dryRun ? "completed" : "partial", startedAt: new Date(), actorId: session.uid },
  });

  const errors: { row: number; field?: string; message: string }[] = [];
  const duplicates: { row: number; slug: string }[] = [];
  let created = 0, updated = 0, skipped = 0;

  const seenSlugs = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNo = i + 2; // + en-tête
    const title = (mapping.title ? row[mapping.title] : row.title) || "";
    const description = (mapping.description ? row[mapping.description] : row.description) || "";
    const priceRaw = (mapping.price ? row[mapping.price] : row.price) || "";
    const currency = ((mapping.currency ? row[mapping.currency] : row.currency) || "EUR").trim().toUpperCase().slice(0, 3);
    const categorySlug = ((mapping.category ? row[mapping.category] : row.category) || "").trim().toLowerCase();
    const url = (mapping.url ? row[mapping.url] : row.url) || "";
    const partnerName = (mapping.partner ? row[mapping.partner] : row.partner) || "";

    if (!title || title.length < 3) { errors.push({ row: rowNo, field: "title", message: "Titre manquant ou trop court." }); continue; }
    if (!description || description.length < 20) { errors.push({ row: rowNo, field: "description", message: "Description manquante ou trop courte (20 caractères min.)." }); continue; }

    let slug = slugify(title);
    if (seenSlugs.has(slug)) { duplicates.push({ row: rowNo, slug }); continue; }
    seenSlugs.add(slug);

    const existing = await db.product.findUnique({ where: { slug } });
    if (existing) {
      if (dryRun) { duplicates.push({ row: rowNo, slug }); continue; }
      // Mise à jour du contenu si le produit existe déjà (déduplication par slug)
      await db.product.update({
        where: { slug },
        data: { description: description.slice(0, 8000), shortDescription: description.slice(0, 300), updatedAt: new Date() },
      });
      updated++;
      continue;
    }

    const priceCents = parsePriceToCents(priceRaw);
    const category = categories.find((c) => c.slug === categorySlug || c.name.toLowerCase() === categorySlug.toLowerCase());
    let partner = partners.find((p) => p.name.toLowerCase() === partnerName.toLowerCase() || p.name.toLowerCase().includes(partnerName.toLowerCase()));

    if (url && !partner) {
      errors.push({ row: rowNo, field: "partner", message: "Partenaire introuvable pour l'URL fournie — ligne ignorée." });
      continue;
    }
    if (url && partner) {
      const allowed: string[] = parseJsonArray(partner.allowedDomains);
      try {
        const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
        if (!allowed.some((d) => host === d || host.endsWith("." + d))) {
          errors.push({ row: rowNo, field: "url", message: `Domaine ${host} hors liste blanche du partenaire « ${partner.name} ».` });
          continue;
        }
      } catch {
        errors.push({ row: rowNo, field: "url", message: "URL invalide." });
        continue;
      }
    }

    if (dryRun) { created++; continue; }

    const product = await db.product.create({
      data: {
        title: title.slice(0, 200),
        slug,
        description: description.slice(0, 8000),
        shortDescription: description.slice(0, 300),
        status: "draft", // import → toujours brouillon, publication manuelle
        productType: category?.slug === "numerique" ? "digital" : category?.slug === "immobilier" ? "real_estate" : category?.slug === "vehicules" ? "vehicle" : category?.slug === "formations" ? "training" : category?.slug === "abonnements" ? "subscription" : "other",
        currency,
        priceMinCents: priceCents,
        priceMaxCents: priceCents,
        categoryId: category?.id || null,
        isDemo: false,
      },
    });
    if (url && partner) {
      await db.productOffer.create({
        data: {
          productId: product.id, partnerId: partner.id,
          destinationUrl: url, currency,
          priceCents, urlCheckStatus: "unverified",
        },
      });
    }
    created++;
  }

  if (!dryRun) skipped = rows.length - created - updated - errors.length - duplicates.length;

  const counts = { totalRows: rows.length, created, updated, errors: errors.length, duplicates: duplicates.length, skipped };
  await db.importJob.update({
    where: { id: job.id },
    data: {
      finishedAt: new Date(),
      status: errors.length === 0 ? "completed" : created + updated > 0 ? "partial" : "failed",
      countsJson: JSON.stringify(counts),
      errorSummary: errors.slice(0, 20).map((e) => `Ligne ${e.row} : ${e.message}`).join(" | ") || null,
    },
  });
  await audit(session, dryRun ? "import.products.dry_run" : "import.products.run", "import_job", job.id, counts);

  return ok({ jobId: job.id, dryRun, counts, errors: errors.slice(0, 50), duplicates: duplicates.slice(0, 50) });
}
