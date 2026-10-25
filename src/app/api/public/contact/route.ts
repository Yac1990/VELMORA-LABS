/**
 * POST /api/public/contact — formulaire de contact public.
 * Stocke le contact en CRM avec consentement explicite (case à cocher obligatoire).
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
  const rl = checkRateLimit(`contact:${ip}`, 3, 10 * 60_000);
  if (!rl.allowed) return err("Trop de soumissions depuis cette adresse — réessayez dans quelques minutes.", 429, { retryAfterSec: rl.retryAfterSec });

  const body = await req.json().catch(() => null);
  if (!body) return err("Requête invalide");

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 180);
  const country = String(body.country || "").trim().slice(0, 60) || null;
  const message = String(body.message || "").trim().slice(0, 4000);
  const consent = body.consent === true;

  if (name.length < 2) return err("Merci d'indiquer votre nom.");
  if (!EMAIL_RE.test(email)) return err("Adresse e-mail invalide.");
  if (message.length < 10) return err("Merci de détailler votre message (10 caractères minimum).");
  if (!consent) return err("Votre consentement est requis pour traiter votre demande.");

  const contact = await db.crmContact.create({
    data: {
      name, email, country,
      status: "new",
      source: "contact_form",
      consentStatus: "granted",
      consentPurpose: "Répondre à la demande de contact (formulaire du site)",
      consentAt: new Date(),
      notes: message,
      isDemo: false,
    },
  });

  await db.consentRecord.create({
    data: {
      subjectType: "crm_contact",
      subjectId: contact.id,
      purpose: "traitement_demande_contact",
      status: "granted",
      source: "contact_form",
      recordedAt: new Date(),
    },
  });

  await db.crmActivity.create({
    data: {
      contactId: contact.id,
      activityType: "note",
      notes: `Message via formulaire de contact : ${message.slice(0, 500)}`,
    },
  });

  // E-mails RÉELS (fire-and-forget — ne bloquent ni n'échouent jamais la réponse) :
  // 1. notification administrateur (SMTP_TO_ADMIN) avec le contenu réel de la demande ;
  // 2. accusé de réception au demandeur UNIQUEMENT si son consentement est "granted"
  //    (c'est le cas ici : case à cocher obligatoire avant création du contact).
  // Sans SMTP configuré, les envois sont journalisés "queued" — jamais "sent".
  const notif = renderInquiryNotification({
    name, email, country,
    message,
    source: "formulaire de contact",
  });
  sendAdminNotification(notif.subject, notif.text, contact.id).catch(() => {});
  if (contact.consentStatus === "granted" && contact.email) {
    const confirm = renderContactConfirmation(name, "votre message envoyé via le formulaire de contact");
    sendEmail({
      to: contact.email,
      subject: confirm.subject,
      text: confirm.text,
      html: confirm.html,
      purpose: "contact_confirmation",
      relatedContactId: contact.id,
    }).catch(() => {});
  }

  return ok({ success: true, message: "Votre message a bien été enregistré. Notre équipe vous répondra par e-mail." });
}
