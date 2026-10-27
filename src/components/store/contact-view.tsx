"use client";

/**
 * FAQ (accordéon, 8 questions réelles sur le fonctionnement du site, les prix,
 * la transparence et les devises) + formulaire de contact public avec
 * consentement explicite obligatoire → POST /api/public/contact.
 * Task 37-c : questions/réponses et libellés traduits (FR/EN) via le dictionnaire
 * i18n (faq.q1…q8 / faq.a1…a8, clés descriptives).
 */
import { useState } from "react";
import { apiPost } from "@/lib/client";
import type { NavigateFn } from "./store-app";
import { useI18n } from "./i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { CheckCircle2, HelpCircle, Loader2, Send } from "lucide-react";

/* ─────────────── FAQ ─────────────── */

/** Clés des 8 questions/réponses réelles (contenu traduit dans i18n.ts). */
const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "faq.q1", a: "faq.a1" },
  { q: "faq.q2", a: "faq.a2" },
  { q: "faq.q3", a: "faq.a3" },
  { q: "faq.q4", a: "faq.a4" },
  { q: "faq.q5", a: "faq.a5" },
  { q: "faq.q6", a: "faq.a6" },
  { q: "faq.q7", a: "faq.a7" },
  { q: "faq.q8", a: "faq.a8" },
];

export function FaqView({ onNavigate }: { onNavigate: NavigateFn }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <div className="mb-6 text-center">
        <span className="brand-gradient mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" aria-hidden="true">
          <HelpCircle className="h-5 w-5" />
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{t("faq.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {t("faq.subtitle")}
        </p>
      </div>

      <Accordion type="single" collapsible className="rounded-2xl border bg-white px-5 shadow-sm">
        {FAQ_ITEMS.map((item, i) => (
          <AccordionItem key={i} value={`q-${i}`} className={i === FAQ_ITEMS.length - 1 ? "border-b-0" : undefined}>
            <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
              {t(item.q)}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-foreground/80">
              {t(item.a)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium">{t("faq.notFound")}</p>
        <p className="text-xs text-muted-foreground">{t("faq.writeUs")}</p>
        <Button onClick={() => onNavigate("contact")} className="mt-1 min-h-[44px]">
          {t("faq.contactButton")}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────── Formulaire de contact ─────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function ContactView({ onNavigate }: { onNavigate: NavigateFn }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { t } = useI18n();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error(t("form.errorName"));
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error(t("form.errorEmail"));
      return;
    }
    if (message.trim().length < 10) {
      toast.error(t("contact.errorMinLength"));
      return;
    }
    if (!consent) {
      toast.error(t("contact.errorConsent"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ success: boolean; message: string }>("/api/public/contact", {
        name: name.trim(),
        email: email.trim(),
        country: country.trim() || null,
        message: message.trim(),
        consent: true,
      });
      const msg = res.message || t("contact.successFallback");
      setDone(msg);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("contact.errorSend"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("contact.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {t("contact.subtitle")}
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border bg-white p-5 shadow-sm lg:p-6">
          {done ? (
            <div
              className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{done}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" aria-label={t("contact.formAria")}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">{t("form.nameLabel")}</Label>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("form.namePlaceholder")}
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    className="min-h-[44px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">{t("form.emailLabel")}</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("form.emailPlaceholder")}
                    autoComplete="email"
                    required
                    maxLength={180}
                    className="min-h-[44px]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-country">{t("contact.countryLabel")}</Label>
                <Input
                  id="contact-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder={t("contact.countryPlaceholder")}
                  maxLength={60}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-message">{t("form.messageLabelRequired")}</Label>
                <Textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("contact.messagePlaceholder")}
                  rows={5}
                  required
                  minLength={10}
                  maxLength={4000}
                />
              </div>

              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                <Checkbox
                  id="contact-consent"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  className="mt-0.5"
                  aria-required="true"
                />
                <Label
                  htmlFor="contact-consent"
                  className="cursor-pointer text-xs font-normal leading-relaxed text-amber-900"
                >
                  {t("contact.consentA")}
                  <span className="font-medium underline underline-offset-2">{t("common.privacyLink")}</span>
                  {t("contact.consentC")}
                </Label>
              </div>

              <Button type="submit" disabled={submitting} className="w-full gap-2 min-h-[44px] sm:w-auto sm:px-6">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {t("contact.submit")}
              </Button>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">{t("contact.beforeTitle")}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t("contact.beforeBody")}
            </p>
            <Button variant="outline" onClick={() => onNavigate("faq")} className="mt-3 w-full min-h-[44px]">
              {t("contact.faqButton")}
            </Button>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">{t("contact.transparencyTitle")}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t("contact.transparencyBody")}
            </p>
            <Button
              variant="link"
              onClick={() => onNavigate("legal:privacy")}
              className="mt-1 h-auto p-0 text-primary"
            >
              {t("contact.privacyButton")}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
