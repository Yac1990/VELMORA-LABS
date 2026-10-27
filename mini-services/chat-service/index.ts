/**
 * VELMORA LABS — mini-service de chat client + notifications « nouveau produit ».
 *
 * Service indépendant (bun) sur le port 3003 — NE JAMAIS lire process.env.PORT
 * (contrainte passerelle Caddy du sandbox : le port est routé via XTransformPort=3003).
 *
 * Design :
 *  - Conversations visiteurs indexées par visitorId (uuid généré côté client,
 *    conservé dans localStorage). Historique 100 % en mémoire (LRU 60 conversations,
 *    200 messages max chacune — les plus anciennes sont retirées).
 *  - Les admins s'authentifient avec un « ticket » signé HMAC-SHA256 émis par
 *    l'API Next.js /api/admin/chat-ticket (validité 5 min).
 *  - POST /broadcast (header x-chat-secret) : relais de notifications
 *    { type: "new-product", product } et endpoint de test { type: "chat-ticket-check" }.
 *
 * Principe « données honnêtes » : ce service ne simule JAMAIS un agent de support —
 * il relaie uniquement les messages réels du back-office.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Server, type Socket } from "socket.io";

/* CHAT_SECRET : bun charge automatiquement le .env du répertoire courant
   (mini-services/chat-service/.env) au démarrage de `bun run dev`. */

const CHAT_SECRET = process.env.CHAT_SECRET || "";
const PORT = 3003; // port codé en dur — exigence passerelle Caddy (XTransformPort)
const TICKET_VALIDITY_MS = 5 * 60 * 1000;
const MAX_CONVERSATIONS = 60; // LRU : au-delà, la conversation la plus ancienne est supprimée
const MAX_MESSAGES = 200; // par conversation : les plus anciens messages sont tronqués

/* ─────────────── Modèle en mémoire ─────────────── */

interface ChatMessage {
  id: string;
  from: "visitor" | "support";
  name: string;
  text: string;
  at: string; // ISO
}

interface Conversation {
  id: string; // = visitorId
  name: string;
  messages: ChatMessage[];
  unread: number;
  connected: boolean;
  lastActivity: number; // epoch ms (LRU)
}

const conversations = new Map<string, Conversation>();

function getOrCreateConversation(visitorId: string, name?: string): Conversation {
  let convo = conversations.get(visitorId);
  if (!convo) {
    convo = { id: visitorId, name: name || "", messages: [], unread: 0, connected: false, lastActivity: Date.now() };
    conversations.set(visitorId, convo);
    enforceLruCap();
  } else if (name && name !== convo.name) {
    convo.name = name;
  }
  convo.lastActivity = Date.now();
  return convo;
}

function enforceLruCap() {
  while (conversations.size > MAX_CONVERSATIONS) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [key, c] of conversations) {
      if (c.lastActivity < oldestTs) {
        oldestTs = c.lastActivity;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    conversations.delete(oldestKey);
    console.log(`[lru] conversation ${oldestKey} retirée (cap ${MAX_CONVERSATIONS})`);
  }
}

function appendMessage(convo: Conversation, msg: ChatMessage) {
  convo.messages.push(msg);
  convo.lastActivity = Date.now();
  if (convo.messages.length > MAX_MESSAGES) {
    convo.messages.splice(0, convo.messages.length - MAX_MESSAGES);
  }
}

function lastMessage(convo: Conversation): ChatMessage | null {
  return convo.messages.length ? convo.messages[convo.messages.length - 1] : null;
}

/* ─────────────── Tickets admin (HMAC-SHA256) ─────────────── */

interface TicketPayload {
  exp: number; // epoch ms
}

function signPayload(payload: string): string {
  return createHmac("sha256", CHAT_SECRET).update(payload).digest("base64url");
}

function verifyTicket(ticket: string): boolean {
  if (!CHAT_SECRET) return false;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  const expected = signPayload(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TicketPayload;
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

/* ─────────────── Serveur HTTP + socket.io ─────────────── */

const httpServer = createServer();

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

/* POST /broadcast : endpoint HTTP relais de notifications.
 *
 * Piège connu : avec `path: "/"` (exigence passerelle Caddy), engine.io
 * s'approprie TOUTES les requêtes HTTP du serveur (il retire les listeners
 * "request" existants et ne les rappelle jamais, puisque toute URL commence
 * par "/") — les requêtes non socket.io reçoivent son 400 "Transport unknown".
 * Solution : récupérer le listener d'engine.io et installer notre routeur —
 * POST /broadcast est traité ici, tout le reste (websocket + polling
 * long-polling avec leurs paramètres EIO) est délégué à engine.io inchangé.
 */
function handleBroadcast(req: IncomingMessage, res: ServerResponse) {
  // Garde secrète partagée : l'API Next.js signe ses appels avec x-chat-secret.
  const provided = req.headers["x-chat-secret"] || "";
  const expected = CHAT_SECRET;
  const secretOk =
    typeof provided === "string" &&
    expected.length > 0 &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!secretOk) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) req.destroy(); // garde-fou taille
  });
  req.on("end", () => {
    try {
      const body = JSON.parse(raw) as { type?: string; product?: Record<string, unknown> };
      if (body.type === "new-product" && body.product) {
        io.emit("notification", { type: "new-product", product: body.product });
        console.log("[broadcast] new-product diffusé");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (body.type === "chat-ticket-check") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "velmora-chat-service" }));
        return;
      }
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Type inconnu" }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "JSON invalide" }));
    }
  });
}

const engineListener = httpServer.listeners("request")[0] as
  | ((req: IncomingMessage, res: ServerResponse) => void)
  | undefined;
httpServer.removeAllListeners("request");
httpServer.on("request", (req, res) => {
  const pathname = (req.url || "").split("?")[0];
  if (req.method === "POST" && pathname === "/broadcast") {
    handleBroadcast(req, res);
    return;
  }
  if (engineListener) engineListener.call(httpServer, req, res);
});

function adminSummary() {
  return Array.from(conversations.values())
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map((c) => ({
      id: c.id,
      name: c.name || null,
      lastMessage: lastMessage(c),
      unread: c.unread,
      connected: c.connected,
    }));
}

const adminTimers = new WeakMap<Socket, ReturnType<typeof setTimeout>>();

io.on("connection", (socket: Socket) => {
  console.log(`connect: ${socket.id}`);

  /* ── Visiteur ── */

  socket.on("visitor:hello", (data: { visitorId?: string; name?: string }) => {
    const visitorId = typeof data?.visitorId === "string" && data.visitorId.length >= 8 ? data.visitorId : null;
    if (!visitorId) {
      socket.emit("error-msg", { message: "visitorId invalide" });
      return;
    }
    const name = typeof data?.name === "string" ? data.name.trim().slice(0, 40) : "";
    const convo = getOrCreateConversation(visitorId, name || undefined);
    convo.connected = true;
    socket.join(visitorId);
    socket.data.visitorId = visitorId;
    socket.emit("conversation", {
      visitorId: convo.id,
      name: convo.name,
      messages: convo.messages,
    });
    console.log(`visitor hello: ${visitorId.slice(0, 8)}… (${convo.messages.length} messages)`);
  });

  socket.on("visitor:message", (data: { text?: string }) => {
    const visitorId = socket.data.visitorId as string | undefined;
    const text = typeof data?.text === "string" ? data.text.trim().slice(0, 2000) : "";
    if (!visitorId || !text) {
      console.log(`visitor:message ignoré (visitorId=${visitorId ? "ok" : "ABSENT"}, text=${text ? "ok" : "VIDE"})`);
      return;
    }
    const convo = conversations.get(visitorId);
    if (!convo) return;
    const msg: ChatMessage = {
      id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      from: "visitor",
      name: convo.name || "Visiteur",
      text,
      at: new Date().toISOString(),
    };
    appendMessage(convo, msg);
    socket.emit("message", msg); // écho au visiteur
    io.to("admins").emit("admin:updated", {
      conversationId: convo.id,
      lastMessage: msg,
      unreadDelta: true,
    });
  });

  /* ── Admin ── */

  /* L'admin doit présenter un ticket valide sous 10 s — sinon déconnexion.
     Task 38 (correctif) : les sockets VISITEURS (visitor:hello envoyé) et les
     sockets déjà identifiés ne sont PAS concernés — l'ancien test `!isAdmin`
     déconnectait aussi les visiteurs 10 s après leur connexion (chat « en ligne »
     puis « indisponible » sans raison). Seuls les sockets muets (ni visiteur,
     ni admin — ex. connexions fantômes) sont coupés. */
  adminTimers.set(
    socket,
    setTimeout(() => {
      if (!socket.data.isAdmin && !socket.data.visitorId) {
        console.log(`mute socket timeout (ni admin ni visiteur): ${socket.id}`);
        socket.disconnect(true);
      }
    }, 10_000)
  );

  socket.on("admin:hello", (data: { ticket?: string }) => {
    const ticket = typeof data?.ticket === "string" ? data.ticket : "";
    if (!verifyTicket(ticket)) {
      socket.emit("admin:denied", { reason: "Ticket invalide ou expiré" });
      socket.disconnect(true);
      return;
    }
    clearTimeout(adminTimers.get(socket));
    socket.data.isAdmin = true;
    socket.join("admins");
    socket.emit("admin:conversations", { conversations: adminSummary() });
    console.log(`admin authentifié: ${socket.id}`);
  });

  socket.on("admin:open", (data: { conversationId?: string }) => {
    if (!socket.data.isAdmin) return;
    const id = typeof data?.conversationId === "string" ? data.conversationId : "";
    const convo = conversations.get(id);
    if (!convo) {
      socket.emit("conversation-not-found", { conversationId: id });
      return;
    }
    convo.unread = 0;
    socket.emit("conversation", {
      visitorId: convo.id,
      name: convo.name,
      messages: convo.messages,
    });
    io.to("admins").emit("admin:updated", {
      conversationId: convo.id,
      lastMessage: lastMessage(convo),
      unreadDelta: false, // remise à zéro de l'unread
    });
  });

  socket.on("admin:reply", (data: { conversationId?: string; text?: string }) => {
    if (!socket.data.isAdmin) return;
    const id = typeof data?.conversationId === "string" ? data.conversationId : "";
    const text = typeof data?.text === "string" ? data.text.trim().slice(0, 2000) : "";
    if (!id || !text) return;
    const convo = conversations.get(id);
    if (!convo) return;
    const msg: ChatMessage = {
      id: `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      from: "support",
      name: "Support VELMORA",
      text,
      at: new Date().toISOString(),
    };
    appendMessage(convo, msg);
    io.to(id).emit("message", msg); // au visiteur (et à l'admin ouvert sur ce fil)
    io.to("admins").emit("admin:updated", {
      conversationId: convo.id,
      lastMessage: msg,
      unreadDelta: false,
    });
  });

  socket.on("disconnect", () => {
    const visitorId = socket.data.visitorId as string | undefined;
    if (visitorId) {
      const convo = conversations.get(visitorId);
      if (convo) convo.connected = false; // la conversation reste en mémoire
    }
    clearTimeout(adminTimers.get(socket));
    console.log(`disconnect: ${socket.id}`);
  });

  socket.on("error", (error) => {
    console.error(`socket error (${socket.id}):`, error);
  });
});

httpServer.listen(PORT, () => {
  console.log(`velmora-chat-service listening on port ${PORT} (secret ${CHAT_SECRET ? "chargé" : "ABSENT — tickets refusés"})`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM — arrêt du chat-service");
  httpServer.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("SIGINT — arrêt du chat-service");
  httpServer.close(() => process.exit(0));
});
