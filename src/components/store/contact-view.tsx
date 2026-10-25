"use client";

/**
 * FAQ (accordéon, 8 questions réelles sur le fonctionnement du site, les prix,
 * la transparence et les devises) + formulaire de contact public avec
 * consentement explicite obligatoire → POST /api/public/contact.
 */
import { useState } from "react";
import { apiPost } from "@/lib/client";
import type { NavigateFn } from "./store-app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { CheckCircle2, HelpCircle, Loader2, Send } from "lucide-react";

/* ─────────────── FAQ ─────────────── */

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Comment fonctionne la plateforme VELMORA LABS ?",
    a: "VELMORA LABS est une plateforme multi-produits : vous parcourez le catalogue, comparez les produits, les prix et les disponibilités, puis vous cliquez sur « Voir l'offre » pour être redirigé vers le site du vendeur. La redirection est mesurée de façon totalement anonyme, et c'est sur le site du vendeur que l'achat se déroule — nous ne vendons rien nous-mêmes.",
  },
  {
    q: "Est-ce que j'achète directement sur VELMORA LABS ?",
    a: "Non, jamais. Le paiement, la facturation, la livraison, la garantie et le service après-vente sont assurés par le vendeur, selon ses propres conditions générales. VELMORA LABS ne vous demande jamais de coordonnées bancaires et ne traite aucune commande.",
  },
  {
    q: "La consultation du site est-elle payante ?",
    a: "Non. Parcourir le catalogue, comparer les prix et consulter les fiches produits est entièrement gratuit, sans compte à créer. Si vous décidez d'acheter, cela se fait directement sur le site du vendeur, selon ses propres conditions et prix.",
  },
  {
    q: "Les prix affichés sont-ils fiables ?",
    a: "Les prix et disponibilités sont synchronisés régulièrement avec les données des vendeurs, et chaque fiche indique la date de dernière mise à jour de chaque offre. Ils restent toutefois indicatifs : les vendeurs peuvent modifier leurs prix à tout moment. Avant d'acheter, vérifiez toujours le prix final affiché sur le site du vendeur — c'est lui qui fait foi.",
  },
  {
    q: "Que signifie le badge « Démo » ?",
    a: "Le badge « Démo » signale un contenu de démonstration : vendeur ou produit fictif, utilisé pour montrer le fonctionnement de la plateforme. Aucune vraie offre ne se cache derrière un élément marqué « Démo », et le bandeau affiché en haut du site vous prévient lorsque le catalogue est en mode démonstration.",
  },
  {
    q: "Pourquoi certains biens (immobilier, véhicules) affichent-ils une fourchette de prix ?",
    a: "Pour les annonces de vendeurs (appartements, maisons, véhicules), le prix dépend de l'état, des options et de la négociation : nous affichons donc une fourchette indicative plutôt qu'un faux prix unique. Pour obtenir le prix réel et les conditions, utilisez le formulaire « Demander des renseignements » de la fiche : après votre consentement, votre demande est transmise au vendeur qui vous recontacte.",
  },
  {
    q: "Comment poser une question sur un bien immobilier ou un véhicule ?",
    a: "Ouvrez la fiche du bien et complétez le formulaire « Demander des renseignements » (nom, e-mail, téléphone facultatif, message). Votre demande part vers le vendeur uniquement si vous cochez la case de consentement — sans elle, rien n'est envoyé. Vous pouvez retirer votre consentement à tout moment via la page Contact.",
  },
  {
    q: "Dans quelle devise les prix sont-ils affichés ?",
    a: "La boutique utilise une devise de référence (l'euro par défaut), identique pour toutes les fiches afin de permettre la comparaison. Le vendeur peut toutefois facturer dans sa propre devise : le montant final facturé, le taux de change appliqué et d'éventuels frais bancaires dépendent du vendeur et de votre moyen de paiement — vérifiez-les sur le site du vendeur avant de valider.",
  },
];

export function FaqView({ onNavigate }: { onNavigate: NavigateFn }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <div className="mb-6 text-center">
        <span className="brand-gradient mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" aria-hidden="true">
          <HelpCircle className="h-5 w-5" />
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Foire aux questions</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Fonctionnement, prix, transparence, devises : les réponses aux questions que l'on nous pose le plus souvent.
        </p>
      </div>

      <Accordion type="single" collapsible className="rounded-2xl border bg-white px-5 shadow-sm">
        {FAQ_ITEMS.map((item, i) => (
          <AccordionItem key={i} value={`q-${i}`} className={i === FAQ_ITEMS.length - 1 ? "border-b-0" : undefined}>
            <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-foreground/80">
              {item.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium">Vous ne trouvez pas la réponse à votre question ?</p>
        <p className="text-xs text-muted-foreground">Écrivez-nous : nous lisons tous les messages.</p>
        <Button onClick={() => onNavigate("contact")} className="mt-1 min-h-[44px]">
          Nous contacter
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
    if (message.trim().length < 10) {
      toast.error("Merci de détailler votre message (10 caractères minimum).");
      return;
    }
    if (!consent) {
      toast.error("Votre consentement est requis pour traiter votre demande.");
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
      const msg = res.message || "Votre message a bien été enregistré. Notre équipe vous répondra par e-mail.";
      setDone(msg);
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Échec de l'envoi — réessayez dans quelques minutes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Contact</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Une question sur une offre, un vendeur, vos données ou le fonctionnement du site ? Écrivez-nous.
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
            <form onSubmit={submit} className="space-y-4" aria-label="Formulaire de contact">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Nom complet *</Label>
                  <Input
                    id="contact-name"
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
                  <Label htmlFor="contact-email">E-mail *</Label>
                  <Input
                    id="contact-email"
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
                <Label htmlFor="contact-country">Pays (facultatif)</Label>
                <Input
                  id="contact-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="France, Belgique, Maroc, Canada…"
                  maxLength={60}
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="contact-message">Votre message *</Label>
                <Textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Décrivez votre question ou votre demande (10 caractères minimum)."
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
                  J'accepte que mes informations (nom, adresse e-mail, pays si renseigné et message) soient
                  enregistrées afin de traiter et répondre à ma demande. Ce consentement est nécessaire pour
                  envoyer le formulaire ; je peux le retirer à tout moment. Consultez notre{" "}
                  <span className="font-medium underline underline-offset-2">politique de confidentialité</span>.
                </Label>
              </div>

              <Button type="submit" disabled={submitting} className="w-full gap-2 min-h-[44px] sm:w-auto sm:px-6">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                Envoyer le message
              </Button>
            </form>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">Avant d'écrire</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Les réponses aux questions fréquentes (fonctionnement, prix, badges « Démo », devises)
              se trouvent dans la FAQ. Les demandes concernant un bien immobilier ou un véhicule passent par
              le formulaire de la fiche produit.
            </p>
            <Button variant="outline" onClick={() => onNavigate("faq")} className="mt-3 w-full min-h-[44px]">
              Consulter la FAQ
            </Button>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold">Transparence des données</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Votre message est enregistré uniquement pour traiter votre demande, conservé au maximum 3 ans,
              jamais revendu. Détails et droits RGPD dans la politique de confidentialité.
            </p>
            <Button
              variant="link"
              onClick={() => onNavigate("legal:privacy")}
              className="mt-1 h-auto p-0 text-primary"
            >
              Lire la politique de confidentialité
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
