"use client";

/**
 * Task 37 — état global de la langue de la boutique (FR par défaut, EN disponible).
 * Persisté dans localStorage (« velmora-lang ») via zustand/persist.
 *
 * Hydratation : `useLang()` renvoie TOUJOURS « fr » pendant le rendu serveur ET la
 * première passe client (useSyncExternalStore), puis bascule vers la langue persistée
 * APRÈS le montage (re-rendu post-hydratation) — aucun écart SSR/client possible,
 * quel que soit l'environnement (panneau de prévisualisation inclus).
 */
import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Lang = "fr" | "en";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "fr",
      setLang: (lang) => set({ lang }),
    }),
    { name: "velmora-lang" }
  )
);

/* Aucun abonnement réel : bascule simplement du snapshot serveur (false) au snapshot
   client (true) après hydratation — sans setState dans un effet. */
const emptySubscribe = () => () => {};

export function useLang() {
  const storeLang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  /* « fr » pendant le SSR ET l'hydratation, puis langue persistée après montage. */
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const lang: Lang = mounted ? storeLang : "fr";
  return { lang, setLang, mounted };
}
