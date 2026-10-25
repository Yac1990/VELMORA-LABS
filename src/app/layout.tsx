import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  icons: { icon: "/velmora-logo.png", apple: "/velmora-logo.png" },
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
