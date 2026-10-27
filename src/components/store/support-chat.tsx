"use client";

/**
 * Widget de chat support (Task 37-d) — côté visiteur de la boutique.
 *
 * Principe « données honnêtes » : si le mini-service de chat est injoignable,
 * le panneau l'affiche tel quel (message bilingue) et n'invente JAMAIS un agent
 * de support ni une réponse automatique. Les messages « Support » affichés
 * proviennent uniquement d'une vraie réponse écrite depuis le back-office.
 *
 * Hydratation : rendu null côté serveur ET à la première passe client
 * (pattern useSyncExternalStore de src/store/lang.ts) — tout ce qui dépend de
 * localStorage/sockets n'existe qu'après le montage.
 *
 * Montage : orchestrateur dans store-app.tsx — <SupportChat /> (aucune props
 * requise ; prop optionnelle onOpenContact pour pré-remplir la vue Contact).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, SendHorizonal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLang } from "@/store/lang";
import {
  emitChat,
  isChatConnected,
  onChatEvent,
  type ChatMessage,
  type ConversationPayload,
} from "@/lib/chat-socket";

const VISITOR_ID_KEY = "velmora-visitor-id";
const VISITOR_NAME_KEY = "velmora-visitor-name";
const VISITOR_READY_KEY = "velmora-visitor-ready";

function getVisitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(VISITOR_ID_KEY, id);
    return id;
  } catch {
    // localStorage indisponible (navigation privée stricte) : id de session seulement
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

const DICT = {
  fr: {
    open: "Ouvrir le chat avec notre équipe",
    close: "Fermer le chat",
    title: "Chat VELMORA",
    subtitleConnected: "Connecté — votre message est transmis à notre équipe (réponse par un humain, pas un robot).",
    subtitleConnecting: "Connexion au chat…",
    offline: "Le chat en direct est momentanément indisponible. Utilisez la page Contact pour nous écrire.",
    nameField: "Votre prénom (optionnel)",
    namePlaceholder: "Prénom",
    start: "Commencer la discussion",
    inputPlaceholder: "Écrivez votre message…",
    send: "Envoyer",
    you: "Vous",
    historyEmpty: "Aucun message pour l'instant — écrivez-nous !",
    offlineBanner: "Service momentanément indisponible — vos messages partiront dès la reconnexion.",
  },
  en: {
    open: "Open the chat with our team",
    close: "Close the chat",
    title: "VELMORA Chat",
    subtitleConnected: "Connected — your message is forwarded to our team (answered by a human, not a bot).",
    subtitleConnecting: "Connecting to chat…",
    offline: "Live chat is temporarily unavailable. Please use the Contact page to reach us.",
    nameField: "Your first name (optional)",
    namePlaceholder: "First name",
    start: "Start the conversation",
    inputPlaceholder: "Type your message…",
    send: "Send",
    you: "You",
    historyEmpty: "No messages yet — write to us!",
    offlineBanner: "Service temporarily unavailable — your messages will be sent once reconnected.",
  },
} as const;

type ConnState = "connecting" | "online" | "offline";

export function SupportChat({ onOpenContact }: { onOpenContact?: () => void }) {
  const { lang, mounted } = useLang();
  const t = DICT[lang];

  const [open, setOpen] = useState(false);
  const [conn, setConn] = useState<ConnState>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nameReady, setNameReady] = useState(false);
  const [unread, setUnread] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false); // état « panneau ouvert » lisible dans les handlers socket
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => { openRef.current = open; }, [open]);

  /* Connexion socket — uniquement après montage (client). Bus partagé (Task 38) :
     hello, emit et écouteurs passent TOUJOURS par la même connexion. */
  useEffect(() => {
    const visitorId = getVisitorId();
    let storedName = "";
    let ready = false;
    try {
      storedName = window.localStorage.getItem(VISITOR_NAME_KEY) || "";
      ready = window.localStorage.getItem(VISITOR_READY_KEY) === "1";
    } catch {
      // stockage indisponible — on continue sans nom
    }
    /* Task 37-b (lint) : setState différé d'un microtask — la règle
       react-hooks/set-state-in-effect interdit un setState synchrone dans le
       corps d'un effet ; timing identique en pratique. */
    queueMicrotask(() => setNameReady(ready));

    const hello = () => {
      emitChat("visitor:hello", { visitorId, name: storedName || undefined });
    };

    const unsubConnected = onChatEvent("chat:connected", () => {
      setConn("online");
      hello(); // (re)joint la room à chaque (re)connexion
    });
    const unsubDisconnected = onChatEvent("chat:disconnected", () => setConn("offline"));
    const unsubConversation = onChatEvent<ConversationPayload>("conversation", (payload) => {
      seenIdsRef.current = new Set(payload.messages.map((m) => m.id));
      setMessages(payload.messages);
    });
    const unsubMessage = onChatEvent<ChatMessage>("message", (msg) => {
      if (!msg?.id || seenIdsRef.current.has(msg.id)) return; // dédoublonnage par id
      seenIdsRef.current.add(msg.id);
      setMessages((prev) => [...prev, msg]);
      if (msg.from === "support" && !openRef.current) {
        // Panneau fermé → badge de messages non lus.
        setUnread((u) => Math.min(u + 1, 99));
      }
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubConversation();
      unsubMessage();
    };
  }, []);

  /* Auto-scroll en bas à chaque nouveau message / ouverture. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, nameReady]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setUnread(0);
  }, []);

  const confirmName = useCallback(() => {
    const name = nameInput.trim().slice(0, 40);
    try {
      window.localStorage.setItem(VISITOR_NAME_KEY, name);
      window.localStorage.setItem(VISITOR_READY_KEY, "1");
    } catch {
      // stockage indisponible
    }
    setNameReady(true);
    if (isChatConnected()) {
      emitChat("visitor:hello", { visitorId: getVisitorId(), name: name || undefined });
    }
  }, [nameInput]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || !isChatConnected()) return;
    emitChat("visitor:message", { text });
    setDraft("");
  }, [draft]);

  if (!mounted) return null; // hydratation : rien côté serveur, rien à la 1re passe client

  const statusDot =
    conn === "online" ? "bg-emerald-500" : conn === "connecting" ? "bg-amber-500" : "bg-red-500";

  return (
    <>
      {/* Bouton flottant (cible tactile ≥ 44 px) */}
      <button
        type="button"
        onClick={openPanel}
        aria-label={t.open}
        className="brand-gradient fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Panneau : bottom-sheet mobile / carte desktop */}
      {open ? (
        <div
          role="dialog"
          aria-label={t.title}
          className="fixed z-50 inset-x-0 bottom-0 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl md:inset-x-auto md:bottom-20 md:right-4 md:w-96 md:rounded-2xl md:border"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {conn === "online" ? t.subtitleConnected : conn === "connecting" ? t.subtitleConnecting : t.offlineBanner}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setOpen(false)}
              aria-label={t.close}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t.historyEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {messages.map((m) => {
                  const mine = m.from === "visitor";
                  return (
                    <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                          mine ? "brand-gradient text-white" : "bg-muted text-foreground"
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                        {mine ? t.you : m.name || "Support"} · {new Date(m.at).toLocaleTimeString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Pied : étape prénom optionnelle puis saisie */}
          <div className="border-t px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] md:pb-2.5">
            {!nameReady ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmName();
                }}
              >
                <label htmlFor="support-chat-name" className="sr-only">{t.nameField}</label>
                <Input
                  id="support-chat-name"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={t.nameField}
                  maxLength={40}
                  className="min-h-[44px] flex-1"
                />
                <Button type="submit" size="sm" className="min-h-[44px] shrink-0">
                  {t.start}
                </Button>
              </form>
            ) : (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <label htmlFor="support-chat-input" className="sr-only">{t.inputPlaceholder}</label>
                <Input
                  id="support-chat-input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={t.inputPlaceholder}
                  maxLength={2000}
                  autoComplete="off"
                  disabled={conn !== "online"}
                  className="min-h-[44px] flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="min-h-[44px] shrink-0 gap-1.5"
                  disabled={conn !== "online" || !draft.trim()}
                >
                  <SendHorizonal className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t.send}</span>
                </Button>
              </form>
            )}
            {conn === "offline" ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-900">
                {t.offline}
                {onOpenContact ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      onClick={() => {
                        setOpen(false);
                        onOpenContact();
                      }}
                    >
                      Contact →
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
