/**
 * POST /api/public/inquiry — demande de renseignements (immobilier / véhicules).
 * Crée un contact CRM avec consentement, rattaché au produit consulté.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, err } from "@/lib/api-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sendEmail, sendAdminNotification, renderInquiryNotification, renderContactConfirmation } from "@/lib/email";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`inquiry:${ip}`, 5, 10 * 60_000);
  if (!rl.allowed) return err("Trop de demandes depuis cette adresse — réessayez plus tard.", 429, { retryAfterSec: rl.retryAfterSec });

  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");

  const productSlug = String(body.productSlug || "").trim();
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 180);
  const phone = String(body.phone || "").trim().slice(0, 40) || null;
  const message = String(body.message || "").trim().slice(0, 2000);
  const consent = body.consent === true;

  if (!productSlug) return err("Produit manquant.");
  if (name.length < 2) return err("Merci d'indiquer votre nom.");
  if (!EMAIL_RE.test(email)) return err("Adresse e-mail invalide.");
  if (!consent) return err("Votre consentement est requis pour transmettre votre demande au partenaire.");

  const product = await db.product.findUnique({ where: { slug: productSlug } });
  if (!product || product.status !== "published" || !product.allowInquiry) {
    return err("Ce produit n'accepte pas les demandes de renseignements.", 404);
  }

  const contact = await db.crmContact.create({
    data: {
      name, email, phone,
      status: "new",
      source: "inquiry",
      sourceProductId: product.id,
      consentStatus: "granted",
      consentPurpose: `Demande de renseignements sur « ${product.title} » — transmission au partenaire annonceur`,
      consentAt: new Date(),
      notes: message || null,
      isDemo: false,
    },
  });

  await db.consentRecord.create({
    data: {
      subjectType: "crm_contact",
      subjectId: contact.id,
      purpose: "demande_renseignements_partenaire",
      status: "granted",
      source: "inquiry",
      recordedAt: new Date(),
    },
  });

  await db.crmActivity.create({
    data: {
      contactId: contact.id,
      activityType: "inquiry",
      notes: `Demande de renseignements : ${product.title}. ${message || ""}`.slice(0, 1000),
    },
  });

  // E-mails RÉELS (fire-and-forget — ne bloquent ni n'échouent jamais la réponse) :
  // 1. notification administrateur (SMTP_TO_ADMIN) avec le contenu réel de la demande ;
  // 2. accusé de réception au demandeur UNIQUEMENT si son consentement est "granted"
  //    (case à cocher obligatoire — consentement explicite enregistré en base).
  // Sans SMTP configuré, les envois sont journalisés "queued" — jamais "sent".
  const notif = renderInquiryNotification({
    name, email, phone,
    productTitle: product.title,
    message,
    source: "demande de renseignements produit",
  });
  sendAdminNotification(notif.subject, notif.text, contact.id).catch(() => {});
  if (contact.consentStatus === "granted" && contact.email) {
    const confirm = renderContactConfirmation(
      name,
      `votre demande de renseignements concernant « ${product.title} »`
    );
    sendEmail({
      to: contact.email,
      subject: confirm.subject,
      text: confirm.text,
      html: confirm.html,
      purpose: "contact_confirmation",
      relatedContactId: contact.id,
    }).catch(() => {});
  }

  return ok({ success: true, message: "Votre demande a été enregistrée. Le partenaire ou notre équipe vous recontactera." });
}
