"use client";

/**
 * Task 37-b — PWA installable : enregistrement du service worker (/sw.js) et
 * popup de première visite invitant à installer l'application sur le téléphone.
 *
 * Comportement :
 * - `beforeinstallprompt` capturé (preventDefault) pour déclencher l'invite
 *   native au clic ; sur iOS (pas d'événement natif) le bouton devient
 *   « Voir les étapes » et déplie un mini-guide Safari (Partager → Accueil → Ajouter).
 * - Première visite UNIQUEMENT, via localStorage « velmora-install-state » :
 *   « never » → plus jamais ; horodatage ISO (« plus tard ») → re-proposition
 *   après 3 jours ; absent → première visite → popup après 3,5 s.
 * - Jamais affiché si l'app tourne déjà en standalone (display-mode ou iOS
 *   navigator.standalone).
 *
 * Hydratation : rend `null` côté serveur ET pendant la première passe client
 * (motif useSyncExternalStore/emptySubscribe copié de src/store/lang.ts), puis
 * décide après montage uniquement — localStorage n'est JAMAIS lu pendant le rendu.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang, type Lang } from "@/store/lang";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallCopy {
  dialogLabel: string;
  title: string;
  description: string;
  install: string;
  later: string;
  stepsCta: string;
  close: string;
  steps: string[];
}

const COPY: Record<Lang, InstallCopy> = {
  fr: {
    dialogLabel: "Suggestion d'installation de l'application VELMORA LABS",
    title: "Installez VELMORA LABS sur votre téléphone",
    description: "Accès rapide à la boutique depuis votre écran d'accueil, comme une véritable application.",
    install: "Installer",
    later: "Plus tard",
    stepsCta: "Voir les étapes",
    close: "Ne plus afficher cette suggestion",
    steps: [
      "Touchez l'icône Partager dans la barre de Safari.",
      "Choisissez « Sur l'écran d'accueil ».",
      "Touchez « Ajouter » pour confirmer.",
    ],
  },
  en: {
    dialogLabel: "VELMORA LABS app install suggestion",
    title: "Install VELMORA LABS on your phone",
    description: "Quick access to the store from your home screen, just like a native app.",
    install: "Install",
    later: "Later",
    stepsCta: "See the steps",
    close: "Don't show this suggestion again",
    steps: ["Tap the Share icon in the Safari toolbar.", 'Choose "Add to Home Screen".', 'Tap "Add" to confirm.'],
  },
};

const STORAGE_KEY = "velmora-install-state";
const SHOW_DELAY_MS = 3500;
const LATER_DELAY_MS = 3 * 24 * 60 * 60 * 1000; // « Plus tard » → re-proposition après 3 jours

/* Aucun abonnement réel : bascule du snapshot serveur (false) au snapshot client
   (true) après hydratation — sans setState dans un effet. (src/store/lang.ts) */
const emptySubscribe = () => () => {};

export function InstallPrompt() {
  const { lang } = useLang();
  const t = COPY[lang];
  /* « false » pendant le SSR ET l'hydratation, puis true après montage. */
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  const remember = useCallback((value: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* stockage indisponible (mode privé…) : la popup réapparaîtra, tolérable */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    /* 1) Service worker : enregistrement UNIQUEMENT en production.
       Task 38 (correctif) : en développement (serveur dev + panneau de
       prévisualisation), un SW qui met en cache les chunks HTML/JS entre en
       conflit avec le HMR et fabrique des écarts d'hydratation (HTML d'une
       version + chunks d'une autre). En production il est inoffensif et rend
       l'application installable (critère Chrome). */
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    /* 2) Détection standalone post-montage uniquement (la détection iOS est
          différée avec l'affichage de la popup — pas de setState synchrone ici,
          règle react-hooks/set-state-in-effect). */
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setCanPrompt(true);
    };
    const onAppInstalled = () => {
      remember("never");
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    /* 3) Première visite uniquement : « never » → jamais ; ISO « plus tard » →
          +3 jours ; absent → première visite → popup après 3,5 s. */
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!standalone) {
      let state: string | null = null;
      try {
        state = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        state = null;
      }
      const elapsed = state ? Date.now() - new Date(state).getTime() : Number.NaN;
      const eligible = state === null || (state !== "never" && !Number.isNaN(elapsed) && elapsed >= LATER_DELAY_MS);
      if (eligible) {
        timer = setTimeout(() => {
          /* Détection iOS différée : asynchrone (≤3,5 s après montage), la popup
             est de toute façon `null` avant setVisible(true). */
          setIsIOS(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
          setVisible(true);
        }, SHOW_DELAY_MS);
      }
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (timer) clearTimeout(timer);
    };
  }, [remember]);

  const closeNever = useCallback(() => {
    remember("never");
    setVisible(false);
  }, [remember]);

  const closeLater = useCallback(() => {
    remember(new Date().toISOString());
    setVisible(false);
  }, [remember]);

  const useNativePrompt = canPrompt && !isIOS;

  const onMainAction = useCallback(async () => {
    const deferred = deferredRef.current;
    if (!useNativePrompt || !deferred) {
      setShowSteps(true); // iOS / invite native indisponible → mini-guide
      return;
    }
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") closeNever();
      else closeLater();
    } catch {
      /* invite annulée par le navigateur : on laisse la popup ouverte */
    }
  }, [useNativePrompt, closeNever, closeLater]);

  /* Rendu : rien côté serveur ni à l'hydratation ; décision après montage. */
  if (!mounted || !visible) return null;

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:px-0 sm:pb-0"
    >
      <div
        role="dialog"
        aria-label={t.dialogLabel}
        className="mx-auto w-full max-w-sm rounded-2xl border bg-white p-4 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <img
            src="/velmora-logo.png"
            alt="VELMORA LABS"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl border object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-snug text-foreground">{t.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.close}
            onClick={closeNever}
            className="-mt-1 -mr-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X />
          </Button>
        </div>

        {showSteps && !useNativePrompt ? (
          <ol className="mt-3 space-y-2 rounded-xl border border-primary/15 bg-primary/5 p-3">
            {t.steps.map((step, index) => (
              <li key={step} className="flex items-center gap-2 text-xs text-foreground/85">
                <span className="brand-gradient flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-3 flex items-center gap-2">
          <Button onClick={onMainAction} className="brand-gradient flex-1 text-white shadow-sm">
            {useNativePrompt ? t.install : t.stepsCta}
          </Button>
          <Button variant="ghost" onClick={closeLater}>
            {t.later}
          </Button>
        </div>
      </div>
    </div>
  );
}
