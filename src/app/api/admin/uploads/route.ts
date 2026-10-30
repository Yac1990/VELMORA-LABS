/**
 * POST /api/admin/uploads — téléversement d'images produit (multipart/form-data, champ « files »).
 *
 * Task 44 : depuis le formulaire produit, l'admin clique « Téléverser 1 à 5 images » et
 * choisit 1 à 5 fichiers d'un coup. Contraintes serveur (redondantes avec le client) :
 *  - 1 à 5 fichiers par requête ;
 *  - images uniquement : JPEG, PNG, WebP, AVIF, GIF — MIME déclaré ET octets
 *    magiques vérifiés (Task 45) ;
 *  - 5 Mo maximum par fichier ;
 *  - permission RBAC catalog.write (gardée côté serveur, en dernier recours) ;
 *  - audit « media.upload » horodaté.
 *
 * Stockage : public/uploads/<instant>-<aléatoire>.<ext> — servi comme fichier statique
 * sous /uploads/<nom>. Le nom d'origine n'est JAMAIS réutilisé (pas d'écrasement, pas
 * de traversal : le nom est entièrement généré côté serveur).
 */
import { NextRequest } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { ok, err, requirePermission, audit } from "@/lib/api-utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo par fichier

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

/**
 * Task 45 — détection des octets magiques : le type MIME déclaré par le client
 * (file.type) n'est pas une preuve — un fichier HTML/PHP renommé .jpg arrive avec
 * un MIME falsifié. On rejette tout fichier dont le contenu réel ne correspond
 * pas au type annoncé. SVG volontairement absent (XSS stockée), HEIC refusé.
 */
function sniffImageExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg"; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png"; // PNG
  if (buf.toString("latin1", 0, 4) === "GIF8") return "gif"; // GIF87a/89a
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "avif";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, "catalog.write");
  if ("error" in guard) return guard.error;
  const session = guard.session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return err("Requête invalide — envoi multipart attendu.", 400);
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return err("Aucun fichier reçu.");
  if (files.length > MAX_FILES) return err(`Maximum ${MAX_FILES} images par téléversement (${files.length} reçues).`);

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });

  const urls: string[] = [];
  for (const file of files) {
    const ext = EXT_BY_MIME[file.type];
    if (!ext) {
      return err(
        `Format non pris en charge : ${file.type || file.name || "inconnu"} — JPEG, PNG, WebP, AVIF ou GIF uniquement.`,
        415
      );
    }
    if (file.size > MAX_BYTES) {
      return err(`« ${file.name} » dépasse la taille maximale de 5 Mo.`, 413);
    }
    const name = `${Date.now().toString(36)}-${randomBytes(6).toString("hex")}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    // Task 45 : le contenu doit réellement être l'image annoncée (octets magiques).
    if (sniffImageExt(buffer) !== ext) {
      return err(
        `« ${file.name} » n'est pas une image ${file.type} valide (contenu refusé).`,
        415
      );
    }
    await writeFile(path.join(dir, name), buffer);
    urls.push(`/uploads/${name}`);
  }

  await audit(session, "media.upload", "upload", undefined, { count: urls.length });

  return ok({ urls }, { status: 201 });
}
