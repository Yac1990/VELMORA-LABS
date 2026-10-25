"use client";

/**
 * Formulaire de demande de renseignements — produits allowInquiry (immobilier / véhicules).
 * La case de consentement est OBLIGATOIRE : après acceptation, les coordonnées sont
 * transmises au vendeur concerné (cf. POST /api/public/inquiry).
 */
import { useState } from "react";
import { apiPost } from "@/lib/client";
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Merci d'indiquer votre nom.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("Adresse e-mail invalide.");
      return;
    }
    if (!consent) {
      toast.error("Votre consentement est requis pour transmettre votre demande au vendeur.");
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
      const msg = res.message || "Votre demande a été enregistrée. Le vendeur ou notre équipe vous recontactera.";
      setDone(msg);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi — réessayez dans quelques instants.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm lg:p-6" aria-labelledby="inquiry-title">
      <h2 id="inquiry-title" className="text-lg font-bold tracking-tight">Demander des renseignements</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Ce produit est proposé par un vendeur. Envoyez votre demande via VELMORA LABS :
        après votre consentement explicite, vos coordonnées sont transmises au vendeur,
        qui vous recontacte directement. Aucun achat ne se fait sur VELMORA LABS.
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
        <form onSubmit={submit} className="mt-4 space-y-4" aria-label="Formulaire de demande de renseignements">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inquiry-name">Nom complet *</Label>
              <Input
                id="inquiry-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Votre nom"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inquiry-email">E-mail *</Label>
              <Input
                id="inquiry-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                autoComplete="email"
                required
                maxLength={180}
                className="min-h-[44px]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inquiry-phone">Téléphone (facultatif)</Label>
            <Input
              id="inquiry-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+33 6 12 34 56 78"
              autoComplete="tel"
              maxLength={40}
              className="min-h-[44px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inquiry-message">Votre message</Label>
            <Textarea
              id="inquiry-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Précisez votre demande : visite, disponibilité, options…"
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
              J'accepte que mes informations (nom, adresse e-mail et téléphone si renseigné) soient
              transmises au vendeur de « {productTitle} » afin d'être recontacté(e) au sujet
              de ma demande. Ce consentement est nécessaire pour envoyer le formulaire ; je peux le
              retirer à tout moment via la page Contact. Consultez notre{" "}
              <span className="font-medium underline underline-offset-2">politique de confidentialité</span>.
            </Label>
          </div>

          <Button type="submit" disabled={submitting} className="w-full gap-2 min-h-[44px] sm:w-auto sm:px-6">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Envoyer ma demande
          </Button>
        </form>
      )}
    </div>
  );
}
