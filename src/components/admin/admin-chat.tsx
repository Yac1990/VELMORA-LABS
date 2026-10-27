"use client";

/**
 * Chat support côté back-office (Task 37-d) — conversations visiteurs.
 *
 * Authentification : ticket signé HMAC (5 min) récupéré auprès de
 * /api/admin/chat-ticket (session admin : cookie httpOnly + en-tête de repli
 * X-Session-Token via apiGet), présenté au mini-service via `admin:hello`.
 * Le service déconnecte tout socket admin sans ticket valide sous 10 s.
 *
 * Principe « données honnêtes » : aucune conversation ni réponse n'est simulée ;
 * si le service est injoignable ou le ticket refusé, l'état réel est affiché.
 *
 * Montage : dernier enfant du wrapper racine de admin-app.tsx (uniquement pour
 * un utilisateur authentifié — le composant n'apparaît pas sur l'écran de login).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MessagesSquare, SendHorizonal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/client";
import {
  connectChat,
  emitChat,
  isChatConnected,
  onChatEvent,
  type ChatMessage,
  type ConversationPayload,
} from "@/lib/chat-socket";

interface AdminConversation {
  id: string;
  name: string | null;
  lastMessage: ChatMessage | null;
  unread: number;
  connected?: boolean;
}

type AuthState = "connecting" | "online" | "offline" | "denied";

export function AdminChat() {
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState<AuthState>("connecting");
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ConversationPayload | null>(null);
  const [draft, setDraft] = useState("");

  const ticketRef = useRef<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const authenticate = useCallback(async () => {
    try {
      const data = await apiGet<{ ticket: string }>("/api/admin/chat-ticket");
      ticketRef.current = data.ticket;
      if (isChatConnected() && data.ticket) {
        emitChat("admin:hello", { ticket: data.ticket });
      }
    } catch {
      // 401/403 (session expirée) ou 503 (CHAT_SECRET absente) — état réel affiché
      ticketRef.current = null;
      setAuth("denied");
    }
  }, []);

  /* Bus partagé (Task 38) : abonnements aux événements du mini-service. */
  useEffect(() => {
    const onConnect = () => {
      setAuth("connecting");
      if (ticketRef.current) {
        emitChat("admin:hello", { ticket: ticketRef.current });
      } else {
        void authenticate();
      }
    };
    const onDisconnect = () => setAuth((a) => (a === "denied" ? a : "offline"));
    const onConversations = (data: { conversations: AdminConversation[] }) => {
      setAuth("online");
      setConversations(data.conversations || []);
    };
    const onDenied = () => {
      setAuth("denied");
      ticketRef.current = null; // ticket expiré → un neuf sera récupéré à la reconnexion
    };
    const onConversation = (payload: ConversationPayload) => {
      seenIdsRef.current = new Set(payload.messages.map((m) => m.id));
      setThread(payload);
      setActiveId(payload.visitorId);
      setConversations((prev) =>
        prev.map((c) => (c.id === payload.visitorId ? { ...c, unread: 0 } : c))
      );
    };
    const onUpdated = (data: { conversationId: string; lastMessage: ChatMessage | null; unreadDelta: boolean }) => {
      const { conversationId, lastMessage, unreadDelta } = data;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: lastMessage ?? c.lastMessage,
                unread: unreadDelta && conversationId !== activeIdRef.current ? c.unread + 1 : 0,
              }
            : c
        )
      );
      // Fil ouvert : le dernier message arrive aussi via admin:updated (dédoublonné).
      if (conversationId === activeIdRef.current && lastMessage && !seenIdsRef.current.has(lastMessage.id)) {
        seenIdsRef.current.add(lastMessage.id);
        setThread((prev) =>
          prev && prev.visitorId === conversationId
            ? { ...prev, messages: [...prev.messages, lastMessage] }
            : prev
        );
      }
    };

    const unsubs = [
      onChatEvent("chat:connected", onConnect),
      onChatEvent("chat:disconnected", onDisconnect),
      onChatEvent("admin:conversations", onConversations),
      onChatEvent("admin:denied", onDenied),
      onChatEvent("conversation", onConversation),
      onChatEvent("admin:updated", onUpdated),
    ];
    return () => unsubs.forEach((u) => u());
  }, [authenticate]);

  /* Auto-scroll du fil ouvert. */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread, open]);

  const openConversation = useCallback((conversationId: string) => {
    if (!isChatConnected()) return;
    emitChat("admin:open", { conversationId });
  }, []);

  const sendReply = useCallback(() => {
    const text = draft.trim();
    if (!text || !isChatConnected() || !activeIdRef.current) return;
    emitChat("admin:reply", { conversationId: activeIdRef.current, text });
    setDraft("");
  }, [draft]);

  const retry = useCallback(() => {
    setAuth("connecting");
    connectChat();
    void authenticate();
  }, [authenticate]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);
  const statusDot =
    auth === "online" ? "bg-emerald-500" : auth === "connecting" || auth === "offline" ? "bg-amber-500" : "bg-red-500";

  return (
    <>
      {/* Bouton flottant (cible tactile ≥ 44 px) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Chat support — conversations visiteurs"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {totalUnread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        ) : null}
        <MessagesSquare className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Chat support"
          className="fixed z-50 inset-x-0 bottom-0 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-2xl md:inset-x-auto md:bottom-20 md:right-4 md:w-[420px] md:rounded-2xl md:border"
        >
          {/* En-tête */}
          <div className="flex items-center gap-2 border-b px-3 py-2.5">
            {thread ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { setThread(null); setActiveId(null); }}
                aria-label="Retour à la liste"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : (
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Chat support</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {auth === "online"
                  ? "Service connecté — les visiteurs peuvent vous écrire."
                  : auth === "connecting"
                    ? "Connexion au service de chat…"
                    : auth === "offline"
                      ? "Service momentanément indisponible (reconnexion automatique)."
                      : "Connexion impossible — session admin expirée ou chat non configuré."}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setOpen(false)}
              aria-label="Fermer le chat"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {auth === "denied" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Ticket de chat refusé ou indisponible. Reconnectez-vous si votre session a expiré, puis réessayez.
              </p>
              <Button size="sm" className="min-h-[44px]" onClick={retry}>Réessayer</Button>
            </div>
          ) : thread ? (
            <>
              {/* Fil de discussion */}
              <div ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto px-3 py-3">
                <p className="mb-2 text-center text-[11px] text-muted-foreground">
                  Conversation avec {thread.name || `visiteur ${thread.visitorId.slice(0, 8)}…`}
                </p>
                {thread.messages.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">Aucun message dans ce fil.</p>
                ) : (
                  <ul className="space-y-2">
                    {thread.messages.map((m) => {
                      const mine = m.from === "support";
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
                            {mine ? "Vous (support)" : m.name || "Visiteur"} · {new Date(m.at).toLocaleTimeString()}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="border-t px-3 py-2.5">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); sendReply(); }}
                >
                  <label htmlFor="admin-chat-reply" className="sr-only">Répondre au visiteur</label>
                  <Input
                    id="admin-chat-reply"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder="Votre réponse…"
                    maxLength={2000}
                    autoComplete="off"
                    disabled={auth !== "online"}
                    className="min-h-[44px] flex-1"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    className="min-h-[44px] shrink-0 gap-1.5"
                    disabled={auth !== "online" || !draft.trim()}
                  >
                    <SendHorizonal className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Répondre</span>
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <>
              {/* Liste des conversations */}
              <div className="thin-scrollbar flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Aucune conversation pour l'instant. Les messages envoyés depuis la boutique apparaîtront ici.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {conversations.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => openConversation(c.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted"
                        >
                          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                            {(c.name || "V").slice(0, 2)}
                            {c.connected ? (
                              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" aria-hidden="true" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {c.name || `Visiteur ${c.id.slice(0, 8)}…`}
                              </span>
                              {c.lastMessage ? (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {new Date(c.lastMessage.at).toLocaleTimeString()}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              <span className="truncate text-xs text-muted-foreground">
                                {c.lastMessage ? c.lastMessage.text : "—"}
                              </span>
                              {c.unread > 0 ? (
                                <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                                  {c.unread > 9 ? "9+" : c.unread}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
