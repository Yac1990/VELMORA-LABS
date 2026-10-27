"use client";

/**
 * VELMORA LABS — Application à vue unique (route `/`).
 * Deux univers : la boutique publique et le back-office protégé.
 * Aucune autre page n'est exposée : la navigation est interne (état React).
 *
 * Task 35 (perf mobile) : AdminApp est chargé dynamiquement (code-splitting).
 * Avant, tout le back-office (recharts, 13 vues admin) était inclus dans le bundle
 * initial téléchargé par chaque visiteur — y compris sur téléphone — avant le
 * premier rendu de la boutique. Désormais le paquet admin n'est téléchargé QUE
 * lorsqu'un administrateur ouvre #/admin : la boutique s'affiche nettement plus vite.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { StoreApp } from "@/components/store/store-app";

export type AppMode = "store" | "admin";

/* Chargement à la demande : le paquet admin part du bundle initial.
   `ssr:false` — l'admin n'est jamais rendu côté serveur (mode initial = store,
   activation par hash côté client uniquement). */
const AdminApp = dynamic(
  () => import("@/components/admin/admin-app").then((m) => ({ default: m.AdminApp })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100" role="status" aria-live="polite">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span
            className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-primary"
            aria-hidden="true"
          />
          Chargement de l'espace administrateur…
        </div>
      </div>
    ),
  }
);

export function AppShell() {
  const [mode, setMode] = useState<AppMode>("store");

  // Synchronisation légère avec le hash pour permettre le retour navigateur
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace("#/", "");
      if (hash === "admin") setMode("admin");
      else if (hash === "store" || hash === "") setMode("store");
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const switchMode = (m: AppMode) => {
    setMode(m);
    window.location.hash = m === "admin" ? "#/admin" : "#/store";
    window.scrollTo({ top: 0 });
  };

  if (mode === "admin") {
    return <AdminApp onExitToStore={() => switchMode("store")} />;
  }
  return <StoreApp onOpenAdmin={() => switchMode("admin")} />;
}
