/**
 * GET /api/admin/email/config — état de la configuration SMTP, SANS aucun secret.
 * Renvoie uniquement des booléens et des valeurs non sensibles (nom d'hôte, port,
 * adresses) afin que l'interface puisse afficher un statut honnête.
 * Tout rôle d'administration peut consulter (settings.read vérifié côté serveur).
 */
import { ok, requirePermission } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requirePermission(req, "settings.read");
  if ("error" in guard) return guard.error;

  const host = process.env.SMTP_HOST || null;
  const portRaw = process.env.SMTP_PORT || null;
  const port = portRaw && !Number.isNaN(Number(portRaw)) ? Number(portRaw) : null;
  const secure =
    process.env.SMTP_SECURE === "true" ? true
    : process.env.SMTP_SECURE === "false" ? false
    : port === 465;

  return ok({
    configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM),
    host, // nom d'hôte uniquement — jamais d'identifiants
    port,
    from: process.env.SMTP_FROM || null,
    toAdmin: process.env.SMTP_TO_ADMIN || null,
    secure,
    hasAuth: Boolean(process.env.SMTP_USER),
  });
}
