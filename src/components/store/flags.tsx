"use client";

/**
 * Task 42 — drapeaux nationaux en SVG inline pour le sélecteur de langue.
 *
 * Pourquoi du SVG plutôt que les emoji 🇫🇷/🇬🇧 : Windows ne rend PAS les
 * drapeaux emoji (il affiche « FR »/« GB » en texte) — le SVG garantit un
 * rendu identique sur tous les OS et reste net à toutes les tailles.
 *
 * Chaque drapeau est dessiné dans le même repère 30×20 et affiché dans un
 * cadre uniforme arrondi avec fin liseré ; preserveAspectRatio="slice"
 * recadre façon object-fit: cover sans jamais déformer les proportions.
 *
 * Accessibilité : aria-hidden — le libellé de langue est porté par le bouton /
 * l'item de menu adjacent (pas de redondance pour les lecteurs d'écran).
 */
import type { ReactNode } from "react";

interface FlagProps {
  /** Taille du cadre (défaut compact en-tête). Surchargable, ex. "h-4 w-6". */
  className?: string;
}

function FlagFrame({ children, className = "h-3.5 w-5" }: FlagProps & { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[3px] ring-1 ring-black/10 ${className}`}
    >
      <svg
        viewBox="0 0 30 20"
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full"
        focusable="false"
      >
        {children}
      </svg>
    </span>
  );
}

/** Drapeau France — tricolore bleu/blanc/rouge (officiel #0055A4 / #EF4135). */
export function FlagFR(props: FlagProps) {
  return (
    <FlagFrame {...props}>
      <rect width="10" height="20" fill="#0055A4" />
      <rect x="10" width="10" height="20" fill="#FFFFFF" />
      <rect x="20" width="10" height="20" fill="#EF4135" />
    </FlagFrame>
  );
}

/** Drapeau Royaume-Uni — Union Jack simplifiée (bleu #012169, rouge #C8102E). */
export function FlagGB(props: FlagProps) {
  return (
    <FlagFrame {...props}>
      <rect width="30" height="20" fill="#012169" />
      {/* Diagonales : blanches puis rouges (croix de saint Patrick) */}
      <path d="M0,0 L30,20 M30,0 L0,20" stroke="#FFFFFF" strokeWidth="4" />
      <path d="M0,0 L30,20 M30,0 L0,20" stroke="#C8102E" strokeWidth="1.6" />
      {/* Croix : blanche (contrefond) puis rouge (croix de saint George) */}
      <path d="M15,0 V20 M0,10 H30" stroke="#FFFFFF" strokeWidth="6.6" />
      <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="4" />
    </FlagFrame>
  );
}
