/**
 * GET /api/admin/chat-ticket — émet un « ticket » signé pour le mini-service
 * de chat (socket.io, port 3003). Le back-office présente ce ticket via
 * `admin:hello` ; le service vérifie la signature HMAC-SHA256 et l'expiration
 * (5 min) avant d'autoriser la réception des conversations visiteurs.
 *
 * Garde : session admin requise (même mécanisme que /api/admin/products —
 * requirePermission, cookie httpOnly ou en-tête X-Session-Token).
 * Permission « dashboard.read » : détenue par tous les rôles back-office,
 * le chat support est donc accessible à toute l'équipe connectée.
 */
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { ok, err, requirePermission } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const TICKET_TTL_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, "dashboard.read");
  if ("error" in guard) return guard.error;

  const secret = process.env.CHAT_SECRET;
  if (!secret) {
    return err("Service de chat non configuré (CHAT_SECRET absente côté serveur).", 503);
  }

  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + TICKET_TTL_MS }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return ok({ ticket: `${payload}.${signature}` });
}
