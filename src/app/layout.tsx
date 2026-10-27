import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ReactDOM from "react-dom";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VELMORA LABS — Découvrez plus. Choisissez mieux.",
    template: "%s | VELMORA LABS",
  },
  description:
    "Plateforme multi-produits internationale : produits numériques, formations, abonnements, maison, électronique, immobilier et véhicules, regroupés depuis des vendeurs partenaires vérifiés. L'achat final s'effectue sur le site du vendeur partenaire choisi.",
  keywords: ["plateforme multi-produits", "comparateur", "boutique en ligne", "produits numériques", "formations", "abonnements SaaS", "immobilier", "véhicules"],
  authors: [{ name: "VELMORA LABS" }],
  /* Task 37-b (PWA installable) : manifeste + icônes dédiées (voir public/manifest.webmanifest).
     Le logo source reste favicon ; icon-192/512 servent l'installation, apple-touch-icon iOS. */
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/velmora-logo.png", type: "image/png", sizes: "any" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "VELMORA LABS", statusBarStyle: "default" },
  openGraph: {
    title: "VELMORA LABS — Découvrez plus. Choisissez mieux.",
    description: "Plateforme internationale multi-catégories regroupant les produits de vendeurs partenaires vérifiés.",
    siteName: "VELMORA LABS",
    type: "website",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "VELMORA LABS",
    description: "Plateforme multi-catégories regroupant les produits de vendeurs partenaires vérifiés.",
  },
  robots: { index: true, follow: true },
};

/* Task 37-b : thème PWA aligné sur --primary (oklch(0.5 0.22 264) → sRGB #1D52DE,
   conversion vérifiée ; l'estimation approximative « #4340BE » du cahier des charges
   sous-estimait la vivacité de la teinte 264). */
export const viewport: Viewport = {
  themeColor: "#1D52DE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* Task 36 (hydratation) : préchargement du hero via l'API de ressources React 19
     (ReactDOM.preload) au lieu d'un <link rel="preload"> manuel rendu dans le corps.
     - Le lien reste émis dans <head> dès le HTML serveur (même gain de perf : le
       téléchargement démarre en parallèle du JavaScript).
     - Il n'existe plus comme nœud « hoistable » parmi les enfants du body : côté
       serveur comme côté client, React le traite comme une ressource (aucun fiber
       positionné dans l'arbre du corps). L'outillage externe qui manipule le DOM
       (panneau de prévisualisation, extensions) ne peut plus désynchroniser
       l'hydratation — c'était la cause la plus probable des écarts d'identifiants
       Radix (useId) signalés dans le panneau.
     - Dédupliqué automatiquement par React (un seul lien, quelle que soit la vue). */
  ReactDOM.preload("/demo/hero-velmora.png", { as: "image" });

  return (
    <html lang="fr" suppressHydrationWarning>
      {/* suppressHydrationWarning : l'environnement de prévisualisation (iframe/extension)
          injecte des attributs de mesure externes (bis_*, __processed_*) avant hydratation.
          Inoffensif pour React (« won't be patched up ») — on évite juste le bruit d'avertissement. */}
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <Sonner position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
