"use client";

/**
 * Formulaire de demande de renseignements — produits allowInquiry (immobilier / véhicules).
 * La case de consentement est OBLIGATOIRE : après acceptation, les coordonnées sont
 * transmises au vendeur concerné (cf. POST /api/public/inquiry).
 * Task 37-c : libellés, consentement et messages de retour traduits (FR/EN).
 */
import { useState } from "react";
import { apiPost } from "@/lib/client";
import { useI18n } from "./i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function InquiryForm({
  productSlug,
  productTitle,
}: {
  productSlug: string;
  productTitle: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
    if (!consent) {
      toast.error(t("inquiry.errorConsent"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiPost<{ success: boolean; message: string }>("/api/public/inquiry", {
        productSlug,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        message: message.trim(),
        consent: true,
      });
      const msg = res.message || t("inquiry.successFallback");
      setDone(msg);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("inquiry.errorSend"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm lg:p-6" aria-labelledby="inquiry-title">
      <h2 id="inquiry-title" className="text-lg font-bold tracking-tight">{t("inquiry.title")}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {t("inquiry.body")}
      </p>

      {done ? (
        <div
          className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{done}</p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4" aria-label={t("inquiry.formAria")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inquiry-name">{t("form.nameLabel")}</Label>
              <Input
                id="inquiry-name"
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
              <Label htmlFor="inquiry-email">{t("form.emailLabel")}</Label>
              <Input
                id="inquiry-email"
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
            <Label htmlFor="inquiry-phone">{t("inquiry.phoneLabel")}</Label>
            <Input
              id="inquiry-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("inquiry.phonePlaceholder")}
              autoComplete="tel"
              maxLength={40}
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inquiry-message">{t("form.messageLabel")}</Label>
            <Textarea
              id="inquiry-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("inquiry.messagePlaceholder")}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <Checkbox
              id="inquiry-consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
              aria-required="true"
            />
            <Label
              htmlFor="inquiry-consent"
              className="cursor-pointer text-xs font-normal leading-relaxed text-amber-900"
            >
              {t("inquiry.consentA", { product: productTitle })}
              <span className="font-medium underline underline-offset-2">{t("common.privacyLink")}</span>
              {t("inquiry.consentC")}
            </Label>
          </div>

          <Button type="submit" disabled={submitting} className="w-full gap-2 min-h-[44px] sm:w-auto sm:px-6">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            {t("inquiry.submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
