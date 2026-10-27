"use client";

/**
 * Cloche de notifications « nouveau produit » (Task 37-d) — en-tête boutique.
 *
 * - Compteur : produits du catalogue publiés depuis la dernière visite
 *   (localStorage « velmora-notif-lastseen », ISO). Aucun compteur inventé :
 *   la source de vérité est GET /api/public/catalog?sort=recent&perPage=10.
 * - Temps réel : socket.io partagé avec le chat (même URL) ; événement
 *   « notification » { type: "new-product", product } → toast sonner +
 *   rafraîchissement de la liste + (si onglet masqué ET permission accordée)
 *   Notification navigateur. La permission n'est JAMAIS demandée automatiquement :
 *   uniquement via le bouton « Activer les alertes » du pied du menu.
 * - Clic sur un produit : CustomEvent « velmora:open-product » { detail: { slug } }
 *   sur window — l'orchestrateur (store-app) l'écoute pour ouvrir la fiche produit
 *   (pas de reload, navigation SPA).
 *
 * Hydratation : null côté serveur et à la première passe client
 * (pattern useSyncExternalStore de src/store/lang.ts).
 *
 * Montage : orchestrateur dans le header boutique — <NotificationBell />.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLang } from "@/store/lang";
import { apiGet } from "@/lib/client";
import {
  emitChat,
  onChatEvent,
  type NewProductNotification,
} from "@/lib/chat-socket";

const LASTSEEN_KEY = "velmora-notif-lastseen";
const OPEN_PRODUCT_EVENT = "velmora:open-product";

interface CatalogItem {
  slug: string;
  title: string;
  image: string | null;
  updatedAt: string;
}

const DICT = {
  fr: {
    aria: "Nouveautés produits",
    title: "Nouveautés depuis votre dernière visite",
    empty: "Aucun nouveau produit récemment.",
    loading: "Chargement…",
    error: "Impossible de charger les nouveautés pour l'instant.",
    enable: "Activer les alertes",
    enabled: "Alertes navigateur activées",
    newProduct: "Nouveau produit :",
    view: "Voir",
  },
  en: {
    aria: "New products",
    title: "New since your last visit",
    empty: "No new products recently.",
    loading: "Loading…",
    error: "Could not load new products right now.",
    enable: "Enable alerts",
    enabled: "Browser alerts enabled",
    newProduct: "New product:",
    view: "View",
  },
} as const;

function relativeDate(iso: string, lang: "fr" | "en"): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return lang === "fr" ? "à l'instant" : "just now";
  if (diffMin < 60) return lang === "fr" ? `il y a ${diffMin} min` : `${diffMin} min ago`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return lang === "fr" ? `il y a ${hours} h` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return lang === "fr" ? `il y a ${days} j` : `${days} d ago`;
  return new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US");
}

export function NotificationBell() {
  const { lang, mounted } = useLang();
  const t = DICT[lang];

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [badge, setBadge] = useState(0);
  const [perm, setPerm] = useState<"default" | "granted" | "denied" | "unsupported">("unsupported");

  const lastSeenRef = useRef<number>(Date.now());
  const itemsRef = useRef<CatalogItem[]>([]);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const recomputeBadge = useCallback(() => {
    const count = itemsRef.current.filter((i) => new Date(i.updatedAt).getTime() > lastSeenRef.current).length;
    setBadge(count);
  }, []);

  const loadItems = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await apiGet<{ items: CatalogItem[] }>("/api/public/catalog?sort=recent&perPage=10");
      itemsRef.current = data.items || [];
      setItems(itemsRef.current);
      setLoadState("ready");
      recomputeBadge();
    } catch {
      setLoadState("error"); // état honnête, pas de liste bidon
    }
  }, [recomputeBadge]);

  /* Montage (post-hydratation) : baseline lastseen + premier chargement. */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LASTSEEN_KEY);
      const parsed = raw ? new Date(raw).getTime() : NaN;
      if (!Number.isNaN(parsed)) {
        lastSeenRef.current = parsed;
      } else {
        // Première visite : baseline silencieuse (rien n'est « nouveau » pour l'instant)
        lastSeenRef.current = Date.now();
        window.localStorage.setItem(LASTSEEN_KEY, new Date(lastSeenRef.current).toISOString());
      }
    } catch {
      // stockage indisponible — baseline session uniquement
    }
    void loadItems();
    setPerm(typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported");
  }, [loadItems]);

  const markSeen = useCallback(() => {
    lastSeenRef.current = Date.now();
    try {
      window.localStorage.setItem(LASTSEEN_KEY, new Date(lastSeenRef.current).toISOString());
    } catch {
      // stockage indisponible
    }
    setBadge(0);
  }, []);

  const openProduct = useCallback((slug: string) => {
    // Navigation SPA : l'orchestrateur écoute cet événement dans store-app.
    window.dispatchEvent(new CustomEvent(OPEN_PRODUCT_EVENT, { detail: { slug } }));
  }, []);

  /* Socket : notifications temps réel (nouveau produit) — via le bus partagé
     (Task 38) : plus de manipulation directe du socket, plus de déconnexion
     accidentelle lors des rejeux d'effet (changement de langue, etc.). */
  useEffect(() => {
    const onNotification = (payload: NewProductNotification) => {
      if (!payload?.product?.title) return;
      const product = payload.product;
      toast.success(`${t.newProduct} ${product.title}`, {
        description: product.priceLabel ?? undefined,
        action: { label: t.view, onClick: () => openProduct(product.slug) },
      });
      void loadItems(); // rafraîchit la liste + recalcule le badge
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("VELMORA LABS", { body: product.title, icon: "/velmora-logo.png" });
        } catch {
          // certains navigateurs exigent un ServiceWorker — le toast reste la source
        }
      }
    };
    const unsubscribe = onChatEvent("notification", onNotification);
    return unsubscribe;
  }, [lang, loadItems, t, openProduct]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        markSeen(); // ouverture = tout vu
        void loadItems();
      }
    },
    [markSeen, loadItems]
  );

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
      if (result === "granted") toast.success(t.enabled);
    } catch {
      // demande refusée par le navigateur — on ne force pas
    }
  }, [t]);

  if (!mounted) return null; // hydratation : rien côté serveur, rien à la 1re passe client

  const enableAlerts = perm === "default";

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t.aria}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {badge > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {badge > 9 ? "9+" : badge}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2.5">
          <p className="text-sm font-semibold leading-tight">{t.aria}</p>
          <p className="text-[11px] leading-tight text-muted-foreground">{t.title}</p>
        </div>

        <div className="thin-scrollbar max-h-72 overflow-y-auto">
          {loadState === "loading" ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t.loading}</p>
          ) : loadState === "error" ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t.error}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t.empty}</p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const isNew = new Date(item.updatedAt).getTime() > lastSeenRef.current;
                return (
                  <li key={item.slug}>
                    <button
                      type="button"
                      onClick={() => openProduct(item.slug)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted"
                    >
                      {item.image ? (
                        <img
                          src={item.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md border object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">—</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium">{item.title}</span>
                          {isNew ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" /> : null}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{relativeDate(item.updatedAt, lang)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t px-3 py-2">
          {enableAlerts ? (
            <Button variant="outline" size="sm" className="min-h-[44px] w-full" onClick={requestPermission}>
              <Bell className="h-4 w-4" aria-hidden="true" />
              {t.enable}
            </Button>
          ) : perm === "granted" ? (
            <p className="text-center text-[11px] text-muted-foreground">{t.enabled}</p>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
