"use client";

/**
 * Connexion socket.io partagée vers le mini-service de chat (Task 37-d, durcie Task 38).
 *
 * URL : « /?XTransformPort=3003 » — NE JAMAIS mettre de port dans l'URL ni
 * changer le chemin : la passerelle du sandbox route le port via le paramètre
 * XTransformPort, et socket.io sert sur path "/".
 *
 * Architecture « bus » (Task 38) : les consommateurs (chat visiteur, cloche
 * notifications, chat admin) ne manipulent JAMAIS l'objet socket directement.
 * Ils s'abonnent via `onChatEvent()` et émettent via `emitChat()` — toutes ces
 * fonctions opèrent sur LA MÊME instance de socket que le module. Ainsi, quel
 * que soit le découpage en chunks, le re-montage React (StrictMode) ou le
 * remplacement de module par Fast Refresh, « hello », « emit » et « écouteurs »
 * restent TOUJOURS sur la même connexion : plus de message émis sur un socket
 * mort ni d'écouteur branché sur une autre connexion.
 */
import { io, type Socket } from "socket.io-client";

export const CHAT_SOCKET_URL = "/?XTransformPort=3003";

/* Formes partagées des messages du chat (cf. mini-services/chat-service/index.ts). */
export interface ChatMessage {
  id: string;
  from: "visitor" | "support";
  name: string;
  text: string;
  at: string; // ISO
}

export interface ConversationPayload {
  visitorId: string;
  name: string | null;
  messages: ChatMessage[];
}

export interface NewProductNotification {
  type: "new-product";
  product: {
    slug: string;
    title: string;
    image: string | null;
    priceLabel: string | null;
  };
}

/* ── Socket unique du module + registre d'écouteurs ── */

let socket: Socket | null = null;
const listeners = new Map<string, Set<(payload: unknown) => void>>();

function ensureSocket(): Socket {
  if (socket) return socket;
  socket = io(CHAT_SOCKET_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    /* Reconnexion sans limite : le mini-service peut redémarrer (bun --hot) ou
       être momentanément absent (production Vercel) ; les widgets affichent
       alors leur état « indisponible » honnête et repartent dès le retour. */
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  /* Les événements serveur sont redistribués aux abonnés du registre.
     onAny capte tout, y compris les événements inconnus — simple et sûr. */
  socket.onAny((event: string, ...args: unknown[]) => {
    const set = listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(args[0]);
        } catch {
          /* un abonné défaillant ne casse jamais les autres */
        }
      }
    }
  });

  /* Événements de connexion exposés comme événements de bus ordinaires. */
  socket.on("connect", () => forward("chat:connected", undefined));
  socket.on("disconnect", () => forward("chat:disconnected", undefined));
  socket.on("connect_error", () => forward("chat:disconnected", undefined));

  return socket;
}

function forward(event: string, payload: unknown) {
  const set = listeners.get(event);
  if (set) {
    for (const listener of set) {
      try {
        listener(payload);
      } catch {
        /* ignore */
      }
    }
  }
}

/** S'abonne à un événement serveur (ou chat:connected/chat:disconnected). Retourne le désabonnement. */
export function onChatEvent<T = unknown>(event: string, listener: (payload: T) => void): () => void {
  ensureSocket();
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  const wrapped = listener as (payload: unknown) => void;
  set.add(wrapped);
  return () => {
    set.delete(wrapped);
  };
}

/** Émet un événement vers le mini-service (connexion établie au besoin). */
export function emitChat(event: string, payload?: unknown): void {
  ensureSocket().emit(event, payload);
}

/** État de connexion réel du socket partagé. */
export function isChatConnected(): boolean {
  return socket?.connected ?? false;
}

/** Force une tentative immédiate (bouton « Réessayer » éventuel). */
export function connectChat(): void {
  const s = ensureSocket();
  if (!s.connected) s.connect();
}
