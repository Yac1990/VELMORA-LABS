"use client";

/**
 * VELMORA LABS — Application à vue unique (route `/`).
 * Deux univers : la boutique publique et le back-office protégé.
 * Aucune autre page n'est exposée : la navigation est interne (état React).
 */
import { useEffect, useState } from "react";
import { StoreApp } from "@/components/store/store-app";
import { AdminApp } from "@/components/admin/admin-app";

export type AppMode = "store" | "admin";

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
