/**
 * Service d'envoi d'e-mails RÉELS via SMTP (nodemailer).
 *
 * Règle d'honnêteté (non négociable) :
 *  - Aucune simulation : chaque appel à sendEmail crée une ligne EmailLog qui
 *    reflète un état réel — "queued" (SMTP non configuré), "sent" (accusé
 *    d'acceptation SMTP reçu) ou "failed" (erreur SMTP/authentification réelle).
 *  - Si SMTP n'est pas configuré (SMTP_HOST / SMTP_PORT / SMTP_FROM absents),
 *    l'e-mail reste en file d'attente (statut "queued") et n'est JAMAIS marqué
 *    "sent". Il partira lors d'une prochaine tentative d'envoi une fois le
 *    SMTP configuré.
 *  - Les erreurs renvoyées par le serveur SMTP sont stockées telles quelles
 *    (tronquées à 500 caractères) — jamais inventées, jamais masquées.
 *  - Aucun secret (mot de passe SMTP, clés API) n'est écrit en base ni journalisé.
 */
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

export type EmailPurpose =
  | "inquiry_notification"
  | "admin_test"
  | "crm_followup"
  | "contact_confirmation";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  purpose: EmailPurpose;
  relatedContactId?: string | null;
}

export type SendEmailResult =
  | { ok: true; queued: false; status: "sent"; logId: string }
  | { ok: false; queued: true; status: "queued"; reason: string; logId: string }
  | { ok: false; queued: false; status: "failed"; error: string; logId: string }
  | { ok: false; queued: false; status: "skipped"; reason: string };

/** SMTP est considéré configuré uniquement si hôte, port et expéditeur sont présents. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function formatSmtpError(err: unknown): string {
  const e = err as { code?: string; message?: string; response?: string } | null;
  const parts: string[] = [];
  if (e?.code) parts.push(e.code);
  if (e?.message) parts.push(e.message);
  if (e?.response) parts.push(e.response);
  const raw = parts.join(" — ") || "Erreur SMTP inconnue";
  return truncate(raw, 500);
}

/**
 * Envoi réel d'un e-mail via SMTP avec journalisation honnête dans EmailLog.
 * 1. La ligne EmailLog est créée d'abord (statut "queued").
 * 2. SMTP non configuré → la ligne reste "queued", attempts inchangé, résultat honnête.
 * 3. SMTP configuré → tentative réelle ; succès → "sent" ; échec → "failed" + erreur réelle.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const to = String(opts.to || "").trim();
  const subject = String(opts.subject || "").trim();

  // Ligne de journal créée AVANT toute tentative — état initial honnête : "queued".
  const log = await db.emailLog.create({
    data: {
      toEmail: to,
      subject: subject || "(sans objet)",
      bodyText: opts.text,
      bodyHtml: opts.html ?? null,
      purpose: opts.purpose,
      status: "queued",
      relatedContactId: opts.relatedContactId ?? null,
    },
    select: { id: true },
  });

  if (!isSmtpConfigured()) {
    // Aucune tentative effectuée : la ligne reste "queued" (attempts inchangé).
    return {
      ok: false,
      queued: true,
      status: "queued",
      reason: "SMTP non configuré — l'e-mail reste en file d'attente (variables requises : SMTP_HOST, SMTP_PORT, SMTP_FROM).",
      logId: log.id,
    };
  }

  const host = process.env.SMTP_HOST as string;
  const port = Number(process.env.SMTP_PORT);
  // SMTP_SECURE peut forcer le mode ; sinon règle standard : 465 = TLS implicite.
  const secure =
    process.env.SMTP_SECURE === "true" ? true
    : process.env.SMTP_SECURE === "false" ? false
    : String(process.env.SMTP_PORT) === "465";
  const user = process.env.SMTP_USER || undefined;
  const pass = process.env.SMTP_PASS || undefined;

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 10_000, // 10 s max pour établir la connexion
      greetingTimeout: 10_000,
    });

    // Envoi réel — sendMail ne se résout que si le serveur SMTP accepte le message.
    await transporter.sendMail({
      from: process.env.SMTP_FROM as string,
      to,
      subject,
      text: opts.text,
      html: opts.html,
    });

    // Succès réel : le serveur SMTP a accepté le message (accusé d'acceptation reçu).
    const updated = await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: "sent",
        provider: "smtp",
        smtpHost: host,
        errorMessage: null,
        attempts: { increment: 1 },
        sentAt: new Date(),
      },
      select: { id: true },
    });

    return { ok: true, queued: false, status: "sent", logId: updated.id };
  } catch (err) {
    // Échec réel : erreur SMTP authentique stockée telle quelle (tronquée à 500 caractères).
    const errorMessage = formatSmtpError(err);
    await db.emailLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        provider: "smtp",
        smtpHost: host,
        errorMessage,
        attempts: { increment: 1 },
      },
    }).catch(() => {
      // la mise à jour du journal ne doit jamais masquer l'erreur d'origine
    });
    return { ok: false, queued: false, status: "failed", error: errorMessage, logId: log.id };
  }
}

/**
 * Notification administrateur : envoie vers SMTP_TO_ADMIN si défini.
 * Si SMTP_TO_ADMIN est absent, aucun e-mail n'est tenté et aucun log trompeur
 * n'est créé — le résultat est explicitement "skipped".
 */
export async function sendAdminNotification(
  subject: string,
  text: string,
  relatedContactId?: string | null
): Promise<SendEmailResult> {
  const toAdmin = (process.env.SMTP_TO_ADMIN || "").trim();
  if (!toAdmin) {
    return { ok: false, queued: false, status: "skipped", reason: "SMTP_TO_ADMIN non configuré — aucune adresse de notification." };
  }
  return sendEmail({ to: toAdmin, subject, text, purpose: "inquiry_notification", relatedContactId: relatedContactId ?? null });
}

/**
 * Gabarit de notification d'une nouvelle demande (formulaire de contact ou
 * demande de renseignements). Français, factuel, sans marketing.
 * Contenu réel uniquement — appelé avec les données réelles de la soumission.
 */
export function renderInquiryNotification(fields: {
  name: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  productTitle?: string | null;
  message?: string | null;
  source?: string | null;
}): { subject: string; text: string; html: string } {
  const name = truncate(fields.name || "—", 120);
  const email = truncate(fields.email || "—", 180);
  const phone = fields.phone ? truncate(fields.phone, 40) : null;
  const country = fields.country ? truncate(fields.country, 60) : null;
  const product = fields.productTitle ? truncate(fields.productTitle, 200) : null;
  const message = fields.message ? truncate(fields.message, 2000) : null;
  const source = fields.source || "formulaire du site";

  const subject = `VELMORA LABS — nouvelle demande de ${name}`;

  const lines = [
    "Nouvelle demande reçue depuis le site VELMORA LABS.",
    "",
    `Origine : ${source}`,
    `Nom : ${name}`,
    `E-mail : ${email}`,
    `Téléphone : ${phone || "non renseigné"}`,
    `Pays : ${country || "non renseigné"}`,
    `Produit concerné : ${product || "—"}`,
    "",
    "Message :",
    message || "(aucun message)",
    "",
    "—",
    "E-mail transactionnel envoyé automatiquement par VELMORA LABS.",
    "Il notifie une demande réelle soumise sur le site ; il ne s'agit pas d'une prospection.",
  ];

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 12px 2px 0;color:#666;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:2px 0;">${esc(value)}</td></tr>`;

  const html = [
    '<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;font-size:14px;line-height:1.6;color:#18181b;">',
    `<p style="margin:0 0 12px;">Nouvelle demande reçue depuis le <strong>site VELMORA LABS</strong>.</p>`,
    "<table style=\"border-collapse:collapse;font-size:13px;\">",
    row("Origine", source),
    row("Nom", name),
    row("E-mail", email),
    row("Téléphone", phone || "non renseigné"),
    row("Pays", country || "non renseigné"),
    row("Produit concerné", product || "—"),
    "</table>",
    message
      ? `<p style="margin:14px 0 4px;color:#666;">Message :</p><blockquote style="margin:0;padding:10px 14px;border-left:3px solid #ddd;white-space:pre-wrap;background:#fafafa;">${esc(message)}</blockquote>`
      : '<p style="margin:14px 0 0;color:#666;">(aucun message)</p>',
    '<p style="margin:20px 0 0;padding-top:10px;border-top:1px solid #eee;color:#777;font-size:12px;">E-mail transactionnel envoyé automatiquement par VELMORA LABS — notification d\'une demande réelle soumise sur le site (pas une prospection).</p>',
    "</div>",
  ].join("");

  return { subject, text: lines.join("\n"), html };
}

/**
 * Gabarit d'accusé de réception envoyé au demandeur (uniquement si consentement
 * explicite "granted" — vérifié par l'appelant avant d'envoyer).
 */
export function renderContactConfirmation(name: string, context: string): { subject: string; text: string; html: string } {
  const firstName = name.split(/\s+/)[0] || name;
  const subject = "VELMORA LABS — accusé de réception de votre demande";
  const text = [
    `Bonjour ${firstName},`,
    "",
    `Nous confirmons la bonne réception de ${context}.`,
    "Notre équipe la traitera et vous recontactera si votre demande est éligible.",
    "Aucune inscription, aucun abonnement : cet envoi est uniquement l'accusé de réception de votre demande.",
    "",
    "— L'équipe VELMORA LABS",
  ].join("\n");

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const html = [
    '<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;font-size:14px;line-height:1.6;color:#18181b;">',
    `<p style="margin:0 0 10px;">Bonjour <strong>${esc(firstName)}</strong>,</p>`,
    `<p style="margin:0 0 10px;">Nous confirmons la bonne réception de ${esc(context)}.</p>`,
    '<p style="margin:0 0 10px;">Notre équipe la traitera et vous recontactera si votre demande est éligible.</p>',
    '<p style="margin:0 0 14px;color:#555;">Aucune inscription, aucun abonnement : cet envoi est uniquement l\'accusé de réception de votre demande.</p>',
    '<p style="margin:16px 0 0;padding-top:10px;border-top:1px solid #eee;color:#777;font-size:12px;">— L\'équipe VELMORA LABS</p>',
    "</div>",
  ].join("");

  return { subject, text, html };
}
