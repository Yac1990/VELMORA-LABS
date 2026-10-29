"use client";

/**
 * Helpers client pour appeler les API internes (chemins relatifs uniquement).
 *
 * Session :
 *  - mécanisme principal : cookie httpOnly posé par /api/auth/login ;
 *  - repli : jeton signé conservé en sessionStorage et transmis via l'en-tête
 *    `X-Session-Token`, car les cookies SameSite=Lax ne sont pas renvoyés dans
 *    les iframes tierces (panneau de prévisualisation intégré). sessionStorage
 *    est cloisonné par onglet et vidée à la fermeture ; accès protégé par
 *    try/catch (certains navigateurs le désactivent en contexte tiers).
 */

const TOKEN_KEY = "vml_session_token";

function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible (contexte tiers restreint) — le cookie reste utilisé
  }
}

function authHeaders(): Record<string, string> {
  const token = readStoredToken();
  return token ? { "X-Session-Token": token } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle<T>(res: Response): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // réponse non JSON (ex: CSV)
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error || `Erreur ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { cache: "no-store", headers: authHeaders() }));
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  // Conserve le jeton de session (repli iframe) ou le supprime à la déconnexion.
  if (url === "/api/auth/login" || url === "/api/auth/logout") {
    try {
      const data = (await res.clone().json()) as { token?: string } | null;
      storeToken(res.ok && data?.token ? data.token : null);
    } catch {
      // réponse non JSON — rien à faire
    }
  }
  return handle<T>(res);
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  return handle<T>(await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }));
}

/**
 * Task 44 : téléverse des fichiers en multipart/form-data avec la session
 * (cookie + en-tête de repli). Aucun « Content-Type » manuel : le navigateur
 * génère lui-même l'en-tête multipart avec sa frontière (boundary).
 */
export async function apiUpload<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form, headers: authHeaders() });
  return handle<T>(res);
}

export async function apiDelete<T>(url: string): Promise<T> {
  return handle<T>(await fetch(url, { method: "DELETE", headers: authHeaders() }));
}

/**
 * Télécharge un fichier (ex : export CSV) en transmettant la session
 * (cookie + en-tête de repli), puis déclenche l'enregistrement côté navigateur.
 * Contrairement à window.open, fonctionne même si les cookies tiers sont bloqués.
 */
export async function apiDownload(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store", headers: authHeaders() });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // corps non JSON
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Task 37-c : les helpers de formatage acceptent une langue optionnelle (« fr » par
 * défaut → comportement inchangé pour l'admin) ; la boutique passe « en » pour des
 * prix/dates/formatages de nombres localisés côté EN.
 */
export type UiLang = "fr" | "en";

const intlLocale = (lang: UiLang): string => (lang === "en" ? "en-US" : "fr-FR");

export function formatCents(cents: number | null | undefined, currency = "EUR", lang: UiLang = "fr"): string {
  if (cents === null || cents === undefined) return lang === "en" ? "Unknown price" : "Prix inconnu";
  try {
    return new Intl.NumberFormat(intlLocale(lang), { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatPriceRange(
  minCents: number | null | undefined,
  maxCents: number | null | undefined,
  currency = "EUR",
  note?: string | null,
  lang: UiLang = "fr"
): string {
  if (minCents != null && maxCents != null && minCents !== maxCents) {
    return `${formatCents(minCents, currency, lang)} – ${formatCents(maxCents, currency, lang)}${note ? ` ${note}` : ""}`;
  }
  return `${formatCents(minCents ?? maxCents, currency, lang)}${note ? ` ${note}` : ""}`;
}

export function formatDate(iso: string | Date | null | undefined, lang: UiLang = "fr"): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(intlLocale(lang), { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC";
  } catch {
    return "—";
  }
}
