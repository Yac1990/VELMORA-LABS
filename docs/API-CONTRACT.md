# VELMORA LABS — Contrat d'API

- **Date de régénération : 24 octobre 2026**
- **Périmètre** : la totalité des API Routes Next.js (App Router) sous `src/app/api/**` — endpoint racine, 7 endpoints publics, 3 endpoints d'authentification, 1 endpoint de redirection suivie et 47 endpoints d'administration (27 chemins), soit **59 endpoints (méthode × chemin)**.
- **Note** : document **reconstruit (Sprint A)** conformément à `RAPPORT-DEVELOPPEMENT.md` §5.1 item 1 / §6 item 1 — le fichier d'origine (`docs/API-CONTRACT.md`, Task 10-11) avait disparu du dépôt. Chaque champ, validation, valeur par défaut et message d'erreur ci-dessous est recopié du code source ; rien n'est inventé.
- Sources de vérité : `src/lib/rbac.ts`, `src/lib/auth.ts`, `src/lib/api-utils.ts`, `src/lib/rate-limit.ts`, `src/lib/offer-check.ts`, `src/lib/url-guard.ts`, `src/lib/client.ts` et les fichiers `route.ts` sous `src/app/api/`.

---

## 1. Conventions générales

### 1.1 Chemins et format

- Tous les chemins sont **relatifs** à l'origine de l'application (le front appelle `/api/…` sans domaine, cf. `src/lib/client.ts`). Le site expose une seule page publique `/` ; le back-end est intégralement en API Routes.
- Toutes les réponses sont en **JSON** (`Content-Type: application/json`), sauf les exports CSV (`text/csv; charset=utf-8`).
- Toute méthode non prévue renvoie le comportement standard du routeur Next.js (405).

### 1.2 Enveloppe de réponse

**Succès** : les données sont renvoyées **directement** à la racine du JSON (pas d'enveloppe `{ ok, data }`). Exemples réels : `{ items, total, page, perPage }` (listes), `{ product }` (création), `{ success: true, message }` (formulaires publics). Les créations renvoient **201** ; les autres succès renvoient 200.

**Erreur** : forme unique `{ "error": "message", ...extras }` construite par `err()` de `src/lib/api-utils.ts` (statut par défaut **400**). Extras observés dans le code :
- `{ retryAfterSec: number }` sur toutes les réponses **429** (rate limit / quota IA) ;
- `{ required: "<permission>" }` sur les **403** RBAC.

Codes utilisés réellement : **400** (validation, requête invalide, conflit), **401** (session absente/invalide), **403** (permission insuffisante, redirection bloquée), **404** (ressource introuvable/non publiée), **429** (limite de débit ou quota atteint), **500** (exception interne, ex. `/api/admin/offers/check`), **502** (échec du fournisseur IA, génération « NON confirmée »). Les exports inconnus renvoient un **404 en texte brut** (pas JSON). Détail complet en §6.

### 1.3 Authentification

- **Mécanisme principal** : cookie httpOnly **`vml_session`**, signé **HMAC-SHA256** (`AUTH_SECRET`, repli dev `velmora-dev-secret-change-me`), `SameSite=Lax`, `Secure` en production, `path=/`, durée de vie **8 h** (`SESSION_TTL_MS = 1000 * 60 * 60 * 8`).
- Le jeton est `base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(body))` avec `payload = { uid, email, role, displayName, exp }` (`exp` en epoch ms).
- **En-tête de repli `X-Session-Token`** : dans les iframes de prévisualisation (cookies tiers bloqués), le front (`src/lib/client.ts`) conserve le jeton en `sessionStorage` (clé `vml_session_token`) et le transmet via cet en-tête. `sessionFromRequest()` teste **d'abord l'en-tête**, puis le cookie.
- Mots de passe hachés **scrypt** (`salt:hash` hexadécimal, 64 octets), vérification à temps constant (`timingSafeEqual`).
- Endpoints : `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (§3).

### 1.4 RBAC — 5 rôles × 20 permissions

Tableau recopié **exactement** de `src/lib/rbac.ts` (constante `ROLE_PERMISSIONS`). Les permissions sont **vérifiées côté serveur sur CHAQUE endpoint d'administration** via `requirePermission(req, permission)` — 401 si pas de session, 403 `{ error, required }` si le rôle ne possède pas la permission.

| Permission | owner | catalog_manager | marketing_editor | crm_manager | analyst |
|---|:-:|:-:|:-:|:-:|:-:|
| `dashboard.read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `catalog.read` | ✔ | ✔ | ✔ | — | ✔ |
| `catalog.write` | ✔ | ✔ | — | — | — |
| `imports.run` | ✔ | ✔ | — | — | — |
| `partners.read` | ✔ | ✔ | — | — | — |
| `partners.write` | ✔ | ✔ | — | — | — |
| `conversions.read` | ✔ | ✔ | — | — | ✔ |
| `conversions.write` | ✔ | — | — | — | — |
| `content.read` | ✔ | ✔ | ✔ | — | ✔ |
| `content.write` | ✔ | — | ✔ | — | — |
| `ai.use` | ✔ | — | ✔ | — | — |
| `ai.approve` | ✔ | — | — | — | — |
| `social.read` | ✔ | — | ✔ | — | ✔ |
| `social.write` | ✔ | — | ✔ | — | — |
| `crm.read` | ✔ | — | — | ✔ | ✔ |
| `crm.write` | ✔ | — | — | ✔ | — |
| `settings.read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `settings.write` | ✔ | — | — | — | — |
| `users.manage` | ✔ | — | — | — | — |
| `audit.read` | ✔ | — | — | — | ✔ |

Libellés (`ROLE_LABELS`) : `owner` = « Administrateur propriétaire », `catalog_manager` = « Gestionnaire catalogue », `marketing_editor` = « Éditeur marketing », `crm_manager` = « Gestionnaire CRM », `analyst` = « Analyste (lecture seule) ». Ordre canonique (`ROLE_ORDER`) : owner, catalog_manager, marketing_editor, crm_manager, analyst.

### 1.5 Limites de débit (rate limits) — valeurs réelles du code

Limiteur **en mémoire locale** (par instance, clé fenêtre glissante, nettoyage toutes les 60 s) via `checkRateLimit(key, limit, windowMs)` ; IP déduite de `x-forwarded-for` (1er élément) sinon `x-real-ip` sinon `"local"`.

| Endpoint | Clé | Limite | Fenêtre | Message 429 |
|---|---|---|---|---|
| `POST /api/auth/login` | `login:{ip}` | **8 tentatives** | **10 min** / IP | « Trop de tentatives de connexion — réessayez plus tard. » |
| `GET /api/go/[offerId]` | `go:{ip}` | **30 redirections** | **60 s** / IP | « Trop de redirections depuis cette adresse — réessayez plus tard. » |
| `GET /api/public/catalog` | `catalog:{ip}` | **120 requêtes** | **60 s** / IP | « Trop de requêtes » |
| `POST /api/public/inquiry` | `inquiry:{ip}` | **5 demandes** | **10 min** / IP | « Trop de demandes depuis cette adresse — réessayez plus tard. » |
| `POST /api/public/contact` | `contact:{ip}` | **3 soumissions** | **10 min** / IP | « Trop de soumissions depuis cette adresse — réessayez dans quelques minutes. » |
| `POST /api/admin/ai/generate` | `ai:{uid}` | **12 générations** | **60 s** / utilisateur | « Limite de génération atteinte (12/minute) — patientez un instant. » |
| `POST /api/admin/ai/image` | `aiimg:{uid}` | **6 images** | **60 s** / utilisateur | « Limite de génération d'images atteinte (6/minute). » |
| `POST /api/admin/ai/storyboard` | `aisb:{uid}` | **6 storyboards** | **60 s** / utilisateur | « Limite atteinte (6/minute). » |

Chaque réponse 429 inclut `{ retryAfterSec }` (secondes restantes avant réinitialisation du bucket).

### 1.6 Conventions de données

- **Montants en centimes** (`Int`, ×100) : `priceMinCents`, `priceMaxCents`, `priceCents`, `orderValueCents`, `commissionAmountCents`. La devise est un champ séparé (`currency`, `orderCurrency`, `commissionCurrency`, code ISO 4217 — EUR, USD, MAD, CHF, CAD, XOF, XAF). L'affichage divise par 100 (`formatCents`). Les **exports CSV** convertissent les centimes en unités décimales (`/100`, 2 décimales).
- **Dates** : ISO 8601 **UTC** (Prisma `DateTime` ↔ ISO ; stockage SQLite en millisecondes epoch — le dashboard fait des requêtes brutes sur `/1000, 'unixepoch'`). Fuseau affiché : UTC.
- **Tableaux stockés en JSON-sous-chaîne** (SQLite sans listes natives) : `countries`, `features` (produits), `supportedCountries`, `allowedDomains` (partenaires), `tags` (CRM), `countsJson`/`metadataJson` (imports/audit). Les API renvoient ces tableaux **parsés** (`parseJsonArray`, `JSON.parse` avec repli `[]`).
- **Flag `isDemo`** sur produits, offres, partenaires, campagnes, clics, conversions, contacts : distingue les données de démonstration (`isDemo=true`) des données réelles. Les filtres `includeDemo` (valeur `!== "false"` = incluses par défaut) contrôlent l'inclusion côté serveur ; les données démo restent badgées.
- **Pagination** : paramètres `page` (≥ 1, défaut 1) et `perPage` (défaut selon endpoint, plafonné) ; réponse `{ items, total, page, perPage }` (le catalogue public ajoute `pages = ceil(total/perPage)`).
- **CSV** : séparateur **`;`** pour les exports (`toCsv`, échappement `"..."` si `",;\n`), en-tête de commentaires `#` (période, source, devise, générateur). L'importeur (`parseCsv`) accepte `,` ou `;` (détection automatique sur la 1re ligne), guillemets RFC 4180, BOM UTF-8 retiré.
- `ok()` sérialise en supprimant les `BigInt` (convertis en `Number`) — utile pour les `COUNT(*)` bruts.

### 1.7 Journal d'audit

Toute opération d'administration écrit une ligne `AuditLog` (`audit(session, action, entityType, entityId, metadata)`) — l'échec d'écriture du journal ne bloque jamais l'opération métier. Actions rencontrées dans les routes (49) :

| Groupe | Actions |
|---|---|
| Auth | `auth.login`, `auth.login_failed`, `auth.logout` |
| Produits | `product.create`, `product.update`, `product.delete`, `product.archive_soft_delete` |
| Catégories | `category.create`, `category.update`, `category.delete`, `category.deactivate_has_products` |
| Partenaires | `partner.create`, `partner.update`, `partner.delete`, `partner.deactivate_has_history` |
| Offres | `offer.create`, `offer.update`, `offer.delete`, `offer.deactivate_has_clicks`, `offers.url_check` |
| Campagnes | `campaign.create`, `campaign.update` |
| Conversions | `conversion.status_update` |
| Imports | `import.products.dry_run`, `import.products.run`, `import.conversions.dry_run`, `import.conversions.run` |
| CRM | `crm.contact.create`, `crm.contact.update`, `crm.contact.anonymize` |
| IA | `ai.generate`, `ai.generate_failed`, `ai.image`, `ai.image_failed`, `ai.storyboard`, `ai.storyboard_failed`, `ai.asset.approve`, `ai.asset.reject`, `ai.asset.status_update` |
| Social | `social.post.create`, `social.post.update`, `social.post.approve`, `social.post.schedule`, `social.post.mark_published_manual`, `social.post.mark_failed`, `social.post.archive` |
| Utilisateurs | `user.create`, `user.update` |
| Paramètres | `settings.update` |

---

## 2. Endpoints publics

Aucune session requise. Tous en `dynamic = "force-dynamic"` (pas de cache HTTP ; la popularité a un cache mémoire interne de 60 s).

### 2.1 `GET /api`

Health-check du scaffold : renvoie toujours `{ "message": "Hello, world!" }`.

### 2.2 `GET /api/public/catalog` — catalogue publié

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/public/catalog` | publique (rate limit 120/60 s/IP) |

**Paramètres d'URL** (tous optionnels) :

| Param | Défaut | Description |
|---|---|---|
| `q` | `""` | recherche, `contains` sur `title`, `shortDescription`, `description` (SQLite : insensible à la casse ASCII) |
| `category` | — | filtre `category.slug` |
| `type` | — | filtre `productType` |
| `sort` | `recent` | `recent` → `createdAt desc` ; `price_asc` / `price_desc` → tri sur `priceMinCents` |
| `page` | `1` | ≥ 1 |
| `perPage` | `12` | borné **6..48** |
| `includeDemo` | inclus | `"false"` → exclut `isDemo=true` |

**Réponse 200** :
```json
{
  "items": [{
    "id": "…", "slug": "…", "title": "…", "shortDescription": "…|null",
    "productType": "digital",
    "category": { "slug": "…", "name": "…" } | null,
    "image": "url|null",              // 1er média (sortOrder asc)
    "priceMinCents": 0, "priceMaxCents": 0, "currency": "EUR", "priceNote": "…|null",
    "allowInquiry": false, "isDemo": true, "updatedAt": "ISO",
    "partnerCount": 1,                // offres actives
    "partnerName": "…|null",          // 1re offre active (createdAt asc)
    "availability": "in_stock"        // 1re offre active, défaut "unknown"
  }],
  "total": 14, "page": 1, "perPage": 12, "pages": 2
}
```
Statuts renvoyés : uniquement `status = "published"`. Erreurs : **429** (rate limit).

### 2.3 `GET /api/public/categories` — catégories actives

**Réponse 200** : `{ "items": [{ "id", "slug", "name", "icon": "string|null", "description": "string|null", "productCount": number }] }` — triées par `sortOrder asc`, comptage des produits `status="published"` uniquement. Erreurs : aucune connue.

### 2.4 `GET /api/public/products/[slug]` — fiche produit publiée

**Réponse 200** (produit complet) :
```json
{
  "id", "slug", "title", "shortDescription", "description", "status": "published",
  "productType", "language", "countries": ["…"], "features": ["…"],
  "priceMinCents", "priceMaxCents", "currency", "priceNote", "allowInquiry", "isDemo",
  "createdAt", "updatedAt",
  "category": { "slug", "name" } | null,
  "media": [{ "url", "altText": "string|null" }],
  "offers": [{
    "id", "partnerName", "partnerIsDemo", "programType",
    "priceCents", "currency", "availability", "lastSyncedAt",
    "urlCheckStatus": "ok|broken|unverified|null",
    "commission": {
      "ruleType": "…", "rate": null, "fixedAmountCents": null, "currency": "…", "termsUrl": "…"
      // OU si non documentée : { "ruleType": "unknown", "note": "Règle de commission non documentée — affichée « inconnue »." }
    }
  }]
}
```
Règle de commission : lue dans `CommissionRule` (`validTo = null`) du partenaire ; affichée seulement si `ruleType ≠ "unknown"` **et** (`rate` ou `fixedAmountCents` renseigné), sinon forme « inconnue ».

**Erreurs** : **404** « Produit introuvable ou non publié » (slug inconnu ou `status ≠ "published"`).

### 2.5 `GET /api/public/settings` — paramètres publics

**Réponse 200** (clés DB `settings` mappées, valeurs par défaut incluses) :

| Champ | Clé DB | Défaut |
|---|---|---|
| `brandName` | `brand_name` | `"VELMORA LABS"` |
| `brandTagline` | `brand_tagline` | `""` |
| `brandLogo` | `brand_logo` | `"/velmora-logo.png"` |
| `referenceCurrency` | `reference_currency` | `"EUR"` |
| `displayCurrencies` | `display_currencies` | `["EUR"]` (JSON parsé) |
| `targetCountries` | `target_countries` | `[]` |
| `defaultLanguage` | `default_language` | `"fr"` |
| `timezone` | `timezone` | `"UTC"` |
| `demoNotice` | `demo_mode_notice` | `""` |
| `outboundNotice` | `outbound_notice` | `""` (message « Comment ça marche » — l'ancienne clé `affiliate_disclosure` n'est plus exposée) |

### 2.6 `GET /api/public/popularity` — popularité mesurée

**Réponse 200** (cache mémoire 60 s) :
```json
{
  "periodDays": 30, "generatedAt": "ISO", "maxClicks": 37,
  "note": "Popularité mesurée uniquement par les clics sortants…",
  "products": [{ "productId", "slug", "title", "isDemo", "clicks30d": 37, "stars": 5 }]
}
```
Échelle **relative** serveur : 5 ★ au produit le plus cliqué sur 30 jours (clics `ClickEvent` → offre → produit `published`), `round(5×clicks/max)` pour les autres, minimum 1 ★ dès 1 clic ; produits sans clic absents. Tri décroissant par clics. Vide si aucun clic.

### 2.7 `POST /api/public/contact` — formulaire de contact

| Méthode | Chemin | Permission |
|---|---|---|
| POST | `/api/public/contact` | publique (rate limit **3/10 min/IP**) |

**Corps JSON** : `name` (trim, **≥ 2**, ≤ 120), `email` (trim, minuscules, ≤ 180, regex `^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`), `country` (optionnel, ≤ 60), `message` (trim, **≥ 10**, ≤ 4000), `consent` (**doit être `true`**).
Effets : création `CrmContact` (`status: "new"`, `source: "contact_form"`, `consentStatus: "granted"`, `consentPurpose: "Répondre à la demande de contact (formulaire du site)"`, `consentAt: now`, `isDemo: false`, notes = message) + `ConsentRecord` (`purpose: "traitement_demande_contact"`) + `CrmActivity` (`activityType: "note"`).
**Réponse 200** : `{ "success": true, "message": "Votre message a bien été enregistré. Notre équipe vous répondra par e-mail." }`.
**Erreurs** : 400 « Requête invalide » / « Merci d'indiquer votre nom. » / « Adresse e-mail invalide. » / « Merci de détailler votre message (10 caractères minimum). » / « Votre consentement est requis pour traiter votre demande. » ; 429 rate limit.

### 2.8 `POST /api/public/inquiry` — demande de renseignements (immobilier / véhicules)

| Méthode | Chemin | Permission |
|---|---|---|
| POST | `/api/public/inquiry` | publique (rate limit **5/10 min/IP**) |

**Corps JSON** : `productSlug` (requis), `name` (≥ 2, ≤ 120), `email` (regex, ≤ 180), `phone` (optionnel, ≤ 40), `message` (optionnel, ≤ 2000), `consent` (**`true` obligatoire**).
Conditions serveur : produit existant, `status="published"` **et** `allowInquiry=true`, sinon **404** « Ce produit n'accepte pas les demandes de renseignements. »
Effets : `CrmContact` (`status: "new"`, `source: "inquiry"`, `sourceProductId`, `consentPurpose: "Demande de renseignements sur « {titre} » — transmission au partenaire annonceur"`, `isDemo: false`) + `ConsentRecord` (`purpose: "demande_renseignements_partenaire"`) + `CrmActivity` (`activityType: "inquiry"`).
**Réponse 200** : `{ "success": true, "message": "Votre demande a été enregistrée. Le partenaire ou notre équipe vous recontactera." }`.
**Erreurs** : 400 « Produit manquant. » / « Merci d'indiquer votre nom. » / « Adresse e-mail invalide. » / « Votre consentement est requis… » ; 404 produit non éligible ; 429 rate limit.

---

## 3. Authentification

### 3.1 `POST /api/auth/login`

| Méthode | Chemin | Permission |
|---|---|---|
| POST | `/api/auth/login` | publique (rate limit **8/10 min/IP**) |

**Corps JSON** : `{ email, password }` — 400 « E-mail et mot de passe requis. » si champ vide ; e-mail trim/minuscules.
**Réponse 200** :
```json
{
  "user": { "id", "email", "role", "displayName" },
  "token": "<jeton signé>"   // repli pour X-Session-Token (iframes)
}
```
Effets : cookie `vml_session` httpOnly (8 h, `maxAge: 28800`) ; audit `auth.login` (succès) ou `auth.login_failed` (`metadata: { email }`).
**Erreurs** : 400 champs manquants ; **401** « Identifiants invalides ou compte désactivé. » (`isActive=false` → même message) ; 429 rate limit.

### 3.2 `POST /api/auth/logout`

**Réponse 200** : `{ "success": true }` — cookie écrasé à vide (`maxAge: 0`). Audit `auth.logout` si session valide ; fonctionne aussi sans session.

### 3.3 `GET /api/auth/me`

**Réponse 200** :
```json
{ "user": null }
// ou
{ "user": { "id", "email", "role", "roleLabel": "Administrateur propriétaire", "displayName" } }
```
Ne renvoie **jamais 401** : `user: null` si session absente/expirée. `roleLabel` vient de `ROLE_LABELS` (repli = code brut).

---

## 4. Redirection d'achat suivie — `GET /api/go/[offerId]`

| Méthode | Chemin | Permission |
|---|---|---|
| GET | `/api/go/[offerId]` | publique (rate limit **30/60 s/IP**) |

**Paramètres d'URL** : `campaign` (identifiant de campagne, conservé si `< 40` caractères, sinon `null`), `subid` (tronqué à 64), et **paramètres UTM autorisés** `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` (recopiés sur l'URL de destination — tout autre paramètre est ignoré).

**Comportement** :
1. Offre doit exister, être `isActive=true` et son produit `status="published"` — sinon **404** « Offre indisponible ou désactivée. Le bouton d'achat est retiré conformément à nos règles de transparence. »
2. **Anti open-redirect** : `destinationUrl` validée contre la liste blanche `partner.allowedDomains` (hôte égal ou sous-domaine, `www.` ignoré, http/https uniquement). En cas d'échec : l'offre est marquée `urlCheckStatus="broken"` + `urlCheckedAt` et **403** « URL de destination non autorisée — redirection bloquée par mesure de sécurité. » (jamais de redirection ouverte).
3. Clic enregistré (`ClickEvent`) : `offerId`, `partnerId`, `campaignId`, `anonymousSessionId` = **HMAC-SHA256 court (12 hex)** de `ip|user-agent|jour` (aucune donnée personnelle), `subId`, `countryCoarse` (en-tête `x-vercel-ip-country`), `referrer` (tronqué 180), `isDemo` = flag du partenaire.
4. **302** vers `destinationUrl` (paramètres de l'offre préservés + UTMs autorisés), en-tête `Cache-Control: no-store`.

**Erreurs** : 429 (rate limit), 404 (offre indisponible), 403 (domaine non autorisé).

---

## 5. Endpoints d'administration

Tous exigent une session valide (**401** « Authentification requise ») et la permission indiquée (**403** « Permission insuffisante pour cette action » + `{ required }`). Body JSON invalide → 400 « Requête invalide ».

### 5.1 Dashboard

#### `GET /api/admin/dashboard` — permission `dashboard.read`

**Paramètres d'URL** : `period` (`today` | `7d` | `month` | `quarter` | `year` | `custom` | défaut `30d`), `from`/`to` (ISO, utilisés si `period=custom`, défaut : 30 derniers jours), `includeDemo` (`"false"` = réels uniquement).

**Réponse 200** :
```json
{
  "meta": { "periodLabel", "start", "end", "timezone": "UTC", "includeDemo",
            "dataSource", "generatedAt", "comparisonLabel": "vs période précédente équivalente" },
  "clicks": { "total", "unique", "previous", "deltaPct": "number|null", "note" },
  "conversions": { "byStatus": { "estimated": 0, "pending": 0, "confirmed": 0, "cancelled": 0, "paid": 0, "unknown": 0 }, "total", "note" },
  "commissions": { "byStatus": { … }, "totalCents", "prevTotalCents", "note" },
  "series": { "clicks": [{ "day": "YYYY-MM-DD", "count" }], "conversions": [{ "day", "count" }] },
  "topOffers": [{ "offerId", "clicks", "title", "slug": "string|null" }],          // top 6
  "topCategories": [{ "name", "clicks" }],                                          // top 6
  "topConversions": [{ "productId", "title", "slug", "isDemo", "total",          // top 8
                       "byStatus": { "estimated", "pending", "confirmed", "cancelled", "paid", "unknown" },
                       "commissionTotals": [{ "currency", "amountCents" }] }],
  "bestSeller": { "productId", "title", "slug", "isDemo", "conversions", "basis" } | null,
  "topConversionsNote", "topPartners": [{ "name", "clicks", "isDemo" }],           // top 5
  "health": { "campaignsCount", "brokenLinks" }                                     // offres urlCheckStatus="broken"
}
```
Notes : les commissions ne sont **jamais sommées inter-devises** (`commissionTotals` par devise d'origine) ; `bestSeller` priorise les conversions `confirmed`/`paid`, sinon le plus rapporté non annulé, avec `basis` expliquant la règle ; `null` si aucune donnée.

### 5.2 Produits

#### `GET /api/admin/products` — permission `catalog.read`
Paramètres : `q` (contains sur `title`/`slug`), `status`, `categoryId`, `page` (défaut 1), `perPage` (défaut **20**, max **100**).
Réponse : `{ items: [{ id, title, slug, status, productType, isDemo, category: {id, name}|null, image|null, priceMinCents, priceMaxCents, currency, priceNote|null, allowInquiry, offers: [{ id, partnerName, destinationUrl, priceCents, currency, availability, isActive, urlCheckStatus, lastSyncedAt, externalId|null }], updatedAt }], total, page, perPage }` — tri `updatedAt desc`.

#### `POST /api/admin/products` — permission `catalog.write`
Corps (validations exactes) :

| Champ | Type | Contrainte / défaut |
|---|---|---|
| `title` | string | requis, **≥ 3** caractères (400 « Le titre est obligatoire (3 caractères minimum). ») |
| `description` | string | requis, **≥ 20** caractères |
| `slug` | string, optionnel | défaut `slugify(title)` (minuscule, sans accents, max 80) ; collision → suffixe `-{Date.now().toString(36)}` |
| `shortDescription` | string, optionnel | ≤ 300 |
| `status` | enum, optionnel | `draft` \| `pending_review` \| `published` \| `suspended` \| `archived` — valeur inconnue → `draft` |
| `productType` | string, optionnel | défaut `digital` |
| `language` | string, optionnel | défaut `fr` |
| `countries` | array, optionnel | stocké JSON ; défaut `[]` |
| `features` | array, optionnel | **max 20** éléments ; défaut `[]` |
| `categoryId` | string, optionnel | défaut `null` |
| `priceMinCents` / `priceMaxCents` | int, optionnels | ≥ 0 (400 « Le prix ne peut pas être négatif. ») ; `max ≥ min` (400 « Le prix maximum doit être supérieur ou égal au prix minimum. ») |
| `currency` | string, optionnel | défaut `EUR` |
| `priceNote` | string, optionnel | ≤ 80 |
| `allowInquiry` | bool, optionnel | défaut `false` |
| `isDemo` | bool, optionnel | défaut `false` |
| `media` | array, optionnel | max **10** `{ url, altText? (≤ 160) }`, `sortOrder` = index |
| `offer` | objet, optionnel | si `partnerId` **et** `destinationUrl` : crée l'offre (`externalId?` ≤ 80, `priceCents?` défaut = priceMin, `currency?` défaut = produit, `availability?` ∈ `in_stock`/`out_of_stock`/`unknown` → défaut `unknown`, `urlCheckStatus: "unverified"`) |

Réponse **201** : `{ product }` (avec `media`). Audit `product.create`.

#### `GET /api/admin/products/[id]` — permission `catalog.read`
Réponse : `{ product }` (complet : catégorie, tous les médias, toutes les offres avec partenaires). **404** « Produit introuvable ».

#### `PUT /api/admin/products/[id]` — permission `catalog.write`
Mise à jour **partielle** (seuls les champs présents sont modifiés) : `title` (≥ 3, 400 « Titre trop court. »), `description` (≥ 20, 400 « Description trop courte (20 caractères minimum). »), `shortDescription` (≤ 300), `status` (enum valide, 400 « Statut invalide. »), `productType`, `language`, `categoryId` (`undefined` = non touché, `null` = délier), `countries`, `features` (max 20), `priceMinCents`/`priceMaxCents` (cohérence max ≥ min vérifiée après application), `currency`, `priceNote` (≤ 80), `allowInquiry`. Si `media` est un tableau : **remplacement complet** (suppression puis création, max 10).
Réponse : `{ product }`. Audit `product.update` (`{ fields }`).

#### `DELETE /api/admin/products/[id]` — permission `catalog.write`
Soft-delete si historique : si le produit a des clics (`ClickEvent` via offres), il passe `status="archived"` → `{ archived: true, message: "Produit archivé (des clics historiques y sont rattachés)." }`, audit `product.archive_soft_delete`. Sinon suppression physique → `{ deleted: true }`, audit `product.delete`. **404** si introuvable.

### 5.3 Catégories

#### `GET /api/admin/categories` — permission `catalog.read`
Réponse : `{ items: [{ …category, productCount }] }` (toutes, triées `sortOrder asc`, comptage **tous** produits, même non publiés).

#### `POST /api/admin/categories` — permission `catalog.write`
Corps : `name` (requis, ≥ 2), `slug` (requis ; normalisé minuscules `[a-z0-9-]` ; **400** « Une catégorie avec ce slug existe déjà. » si collision), `description?` (≤ 500), `icon?` (≤ 40), `sortOrder?` (défaut **100**), `isActive?` (défaut `true`).
Réponse **201** : `{ category }`. Audit `category.create`.

#### `PUT /api/admin/categories/[id]` — permission `catalog.write`
Partielle : `name`, `description?`, `icon?`, `sortOrder` (défaut 100 si parse invalide), `isActive`. Réponse : `{ category }`. Audit `category.update`. **404** « Catégorie introuvable ».

#### `DELETE /api/admin/categories/[id]` — permission `catalog.write`
Si des produits y sont rattachés → désactivation (`isActive=false`) : `{ deactivated: true, message: "Catégorie désactivée : N produit(s) y sont rattachés." }`, audit `category.deactivate_has_products`. Sinon suppression : `{ deleted: true }`, audit `category.delete`.

### 5.4 Partenaires

#### `GET /api/admin/partners` — permission `partners.read`
Réponse :
```json
{ "items": [{ "id", "name", "website", "programType", "status", "documentationUrl",
  "supportedCountries": ["…"], "allowedDomains": ["…"],
  "isDemo", "note": "string|null", "createdAt",
  "integrations": [{ "id", "integrationType", "status", "statusDetail", "lastSyncAt", "secretRefName": "nom de variable d'env uniquement" }],
  "commissionRule": { … } | null,          // 1re règle validTo=null
  "offerCount", "clickCount", "conversionCount" }] }
```
Aucun secret renvoyé — seulement le **nom** de la variable d'environnement (`encryptedSecretRef`).

#### `POST /api/admin/partners` — permission `partners.write`
Corps : `name` (≥ 2), `website` (URL valide — 400 « URL du site partenaire invalide. »), `allowedDomains` (array de strings, **1 à 20**, requis — 400 « Au moins un domaine autorisé est requis (liste blanche anti open-redirect). » ; normalisés : minuscules, trim, `www.` retiré), `programType?` (`affiliate` | `direct` | `other`, défaut `affiliate`), `status?` (`active` | `inactive` | `pending`, défaut `active`), `documentationUrl?`, `supportedCountries?`, `note?` (≤ 500).
Effet : crée aussi une `PartnerIntegration` (`integrationType` défaut `"csv"`, `status: "not_configured"`).
Réponse **201** : `{ partner }`. Audit `partner.create`.

#### `PUT /api/admin/partners/[id]` — permission `partners.write`
Partielle : `name`, `website` (URL valide), `programType`, `status`, `documentationUrl?`, `supportedCountries?`, `allowedDomains?` (si fourni : 1–20 requis), `note?`. Réponse : `{ partner }`. Audit `partner.update`. **404** « Partenaire introuvable ».

#### `DELETE /api/admin/partners/[id]` — permission `partners.write`
Si clics historiques → désactivation (`status="inactive"`) : `{ deactivated: true, message: "Partenaire désactivé : des clics/conversions historiques y sont rattachés." }`, audit `partner.deactivate_has_history`. Sinon suppression : `{ deleted: true }`, audit `partner.delete`.

### 5.5 Offres + vérification d'URLs

#### `GET /api/admin/offers` — permission `catalog.read`
Paramètre `productId` (optionnel). Réponse : `{ offers }` (avec `partner` complet et `product: { title }`, tri `createdAt desc`, **max 200**).

#### `POST /api/admin/offers` — permission `catalog.write`
Corps requis : `productId`, `partnerId`, `destinationUrl` (400 « productId, partnerId et destinationUrl sont requis. »). Partenaire inconnu → **404** « Partenaire introuvable. ». URL : valide et **http(s)** (400 « URL de destination invalide. » / « L'URL de destination doit être en http(s). »).
Optionnels : `externalId?` (≤ 80), `priceCents?`, `currency?` (défaut `EUR`), `availability?` (`in_stock`/`out_of_stock`/`unknown` → défaut `unknown`). `urlCheckStatus` initial : `"unverified"`.
Réponse **201** : `{ offer }`. Audit `offer.create`.

#### `PUT /api/admin/offers` — permission `catalog.write` (id dans le corps)
Corps : `id` requis (400 « id requis »). Champs modifiables : `destinationUrl` (URL valide ; **réinitialise `urlCheckStatus` à `"unverified"`**), `priceCents?`, `availability?`, `isActive?`, `externalId?` (≤ 80).
Réponse : `{ offer }`. Audit `offer.update`.

#### `DELETE /api/admin/offers?id=…` — permission `catalog.write`
Si clics rattachés → désactivation (`isActive=false`) : `{ deactivated: true, message: "Offre désactivée : des clics y sont rattachés." }`, audit `offer.deactivate_has_clicks`. Sinon suppression : `{ deleted: true }`, audit `offer.delete`. `id` manquant → 400 « id requis ».

#### `POST /api/admin/offers/check` — permission `catalog.write` *(NOUVEAU, Sprint A)*
Vérification serveur des URLs d'offres (réutilise `runOfferCheck` de `src/lib/offer-check.ts`, même logique que le cron `scripts/check-offer-urls.ts`).
**Corps JSON** (optionnel) : `{ offerId?: string }` (une seule offre) — sinon toutes les offres actives ; `{ limit?: number }` (défaut **100**, borné **1..200**), offres triées par `updatedAt asc`.
Garde-fous par requête : http/https uniquement ; domaine contre la liste blanche du partenaire (anti open-redirect) ; hôtes privés interdits (anti SSRF) ; redirections suivies manuellement (max **3**, revalidation à chaque saut) ; timeout **8 s** ; HEAD d'abord, repli GET si 405/501/400 ; User-Agent `VELMORA-Labs-UrlCheck/1.0 (vérification d'intégrité des liens)`.
Effet : met à jour `urlCheckStatus` (`ok` | `broken`) + `urlCheckedAt` sur chaque offre vérifiée ; audit `offers.url_check` (`{ checked, ok, broken, limit }`).
**Réponse 200** :
```json
{
  "summary": { "checked": 12, "ok": 11, "broken": 1 },
  "check":   { "offerId", "productTitle": "string|null", "partnerName", "destinationUrl",
               "status": "ok|broken", "httpStatus": "number|null", "finalUrl": "string|null", "reason": "string|null" },
  "results": [ /* idem "check" — présent UNIQUEMENT en vérification globale, absent pour une offre unique */ ]
}
```
**Erreurs** : 500 « Échec de la vérification des URLs » (message d'exception). Limites assumées (documentées dans le code) : pare-feux anti-robots (403/429) possibles faux « broken » ; jamais de désactivation automatique ; rebinding DNS non détecté.

### 5.6 Campagnes

#### `GET /api/admin/campaigns` — permission `content.read`
Réponse : `{ items: [{ id, name, channel, objective: "string|null", targetCountry: "string|null", status, startAt, endAt, isDemo, clickCount }] }` (tri `createdAt desc`).

#### `POST /api/admin/campaigns` — permission `content.write`
Corps : `name` (≥ 3 — 400 « Nom de campagne requis (3 caractères min.). »), `channel?` (`social` | `email` | `content` | `paid` | `other`, défaut `other`), `objective?` (≤ 200), `targetCountry?` (tronqué à 2, majuscules), `status?` (`draft` | `active` | `paused` | `ended`, défaut `draft`). `isDemo` forcé à `false`.
Réponse **201** : `{ campaign }`. Audit `campaign.create`.

#### `PUT /api/admin/campaigns/[id]` — permission `content.write`
Partielle : `name`, `status` (enum `draft`/`active`/`paused`/`ended` — ignoré sinon), `channel`, `objective?` (≤ 200). Réponse : `{ campaign }`. Audit `campaign.update`.

### 5.7 Conversions

#### `GET /api/admin/conversions` — permission `conversions.read`
Paramètres : `status` (enum), `page` (défaut 1), `perPage` (défaut **25**, max **100**), `includeDemo` (défaut inclus).
Réponse : `{ items: [{ id, partnerName, isDemo (conversion OU partenaire), externalConversionId, reportedAt, status, orderValueCents|null, orderCurrency|null, commissionAmountCents|null, commissionCurrency|null, sourceReportId|null, productTitle|null, note|null }], total, page, perPage }` (tri `reportedAt desc`).

#### `PUT /api/admin/conversions` — permission `conversions.write`
Corps : `id` + `status` requis (400 « id et status requis. ») ; `status` ∈ `estimated` | `pending` | `confirmed` | `cancelled` | `paid` | `unknown` (400 « Statut invalide. ») ; `note?` (≤ 500).
Effet : met à jour la conversion **et** crée une `CommissionTransaction` (`eventType = status`, montant/devise = commission d'origine, `notes: "Statut changé {ancien} → {nouveau} par {email}"`).
Réponse : `{ conversion }`. Audit `conversion.status_update` (`{ from, to }`). **404** « Conversion introuvable. ».

### 5.8 Imports CSV

#### `POST /api/admin/imports/products` — permission `imports.run`
**Corps** : `{ csv: string (requis), mapping?: { title?, description?, price?, currency?, category?, url?, partner? } (noms de colonnes du CSV), dryRun?: boolean }` — **`dryRun` vaut `true` par défaut** (`body.dryRun !== false`) ; en mode `dryRun` rien n'est écrit.
Traitement par ligne (numéro de ligne = index + 2, en-tête compté) :
- `title` ≥ 3 et `description` ≥ 20, sinon erreur `Ligne N : Titre manquant ou trop court.` / `…Description manquante ou trop courte (20 caractères min.).` ;
- slug dérivé du titre ; doublon **dans le fichier** → `duplicates` (ligne ignorée) ; produit existant en base → en mode réel, mise à jour de la description (déduplication par slug), compté `updated` ; en `dryRun` → `duplicates` ;
- prix : `parsePriceToCents` tolère `1 234,56` / `1,234.56` / `1234.56` (arrondi ×100) ;
- catégorie appariée par slug ou nom ; `productType` déduit du slug de catégorie (`numerique`→`digital`, `immobilier`→`real_estate`, `vehicules`→`vehicle`, `formations`→`training`, `abonnements`→`subscription`, sinon `other`) ;
- `url` fournie : partenaire apparié par nom (égalité ou inclusion insensible à la casse) — introuvable → erreur « Partenaire introuvable pour l'URL fournie — ligne ignorée. » ; domaine de l'URL hors liste blanche → erreur `Domaine {host} hors liste blanche du partenaire « … ».` ;
- produits créés en **`status="draft"`** (publication manuelle), `isDemo: false` ; offre créée si url+partenaire (`urlCheckStatus: "unverified"`).

Effet : `ImportJob` créé puis finalisé (`status: completed | partial | failed`, `countsJson`, `errorSummary` = 20 premières erreurs).
**Réponse 200** : `{ jobId, dryRun, counts: { totalRows, created, updated, errors, duplicates, skipped }, errors: [ { row, field?, message } ] (max 50), duplicates: [ { row, slug } ] (max 50) }`.
Audit `import.products.dry_run` / `import.products.run`. Erreurs : 400 « Contenu CSV manquant. » / « Aucune ligne de données détectée dans le CSV. ».

#### `POST /api/admin/imports/conversions` — permission `conversions.write`
**Corps** : `{ csv, mapping?: { partner?, externalId?, date?, status?, orderValue?, orderCurrency?, commission?, commissionCurrency?, offerExternalId? }, dryRun? }` (défaut `true`).
Par ligne : `partner` (nom) et `externalId` requis (erreurs « Partenaire manquant. » / « Identifiant externe de conversion manquant. » / « Partenaire « X » introuvable. ») ; `status` normalisé vers l'enum (inconnu → `unknown`) ; `date` parsée (invalide → erreur ; absente → maintenant) ; montants `parseMoneyToCents` ; rattachement d'offre optionnel par `offerExternalId` (offre du partenaire) ; **déduplication stricte** sur l'unicité DB `partnerId + externalConversionId` → `duplicates`. Chaque conversion importée crée aussi une `CommissionTransaction` (`notes: "Créé à l'import CSV."`, `sourceReportId: "import-{jobId}"`), `isDemo: false`.
**Réponse 200** : `{ jobId, dryRun, counts: { totalRows, imported, errors, duplicates }, errors (max 50), duplicates: [ { row, externalId } ] (max 50) }`.
Audit `import.conversions.dry_run` / `import.conversions.run`.

#### `GET /api/admin/imports/history` — permission `catalog.read`
Réponse : `{ items: [{ id, importType, status, startedAt, finishedAt, counts (JSON parsé), errorSummary|null }] }` — **50 derniers** jobs, tri `startedAt desc`.

### 5.9 CRM

#### `GET /api/admin/crm/contacts` — permission `crm.read`
Paramètres : `q` (contains sur `name`/`email`), `status`, `page` (défaut 1), `perPage` (défaut **25**, max **100**).
Réponse : `{ items: [{ id, name, email, phone, country, language, status, source, consentStatus, consentAt, tags: ["…"], isDemo, anonymizedAt|null, createdAt, lastActivity (activité la plus récente ou null) }], total, page, perPage }` (tri `createdAt desc`).

#### `POST /api/admin/crm/contacts` — permission `crm.write`
Corps : `name` (≥ 2), `email?` (validée si fournie), `phone?` (≤ 40), `country?` (≤ 60), `status?` (enum `new` | `to_contact` | `in_discussion` | `qualified` | `converted` | `lost` | `unsubscribed`, défaut `new`), `source?` (≤ 60, défaut `manual`), `consentStatus?` (`"granted"` ou `none`), `consentPurpose?` (≤ 300, requis pour tracer, défaut « Communications commerciales »), `tags?` (max **10** strings), `notes?` (≤ 2000).
Effet : si consentement accordé, crée un `ConsentRecord` (`source: "manual_entry"`).
Réponse **201** : `{ contact }`. Audit `crm.contact.create`.

#### `GET /api/admin/crm/contacts/[id]` — permission `crm.read`
Réponse : `{ contact (complet, avec toutes les activités et sourceProduct {title, slug}), consents: [ConsentRecord…] }` (tri `recordedAt desc`). **404** « Contact introuvable ».

#### `PUT /api/admin/crm/contacts/[id]` — permission `crm.write`
Partielle : `status?` (enum, 400 « Statut invalide. »), `tags?` (max 10), `notes?` (≤ 2000), `country?` (≤ 60), `phone?` (≤ 40). **`withdrawConsent: true`** → `consentStatus="withdrawn"` + `status="unsubscribed"` + tous les `ConsentRecord` "granted" passés à `withdrawn` (`withdrawnAt`). Ajout d'activité optionnel : `activityNotes` (≤ 2000) + `activityType?` (`note` | `task` | `call` | `email` | `status_change`, défaut `note`) + `activityDueAt?`.
Réponse : `{ contact }`. Audit `crm.contact.update` (`{ fields }`).

#### `POST /api/admin/crm/contacts/[id]/anonymize` — permission `crm.write`
Droit à l'effacement (RGPD), **irréversible** : déjà anonymisé → **400** « Contact déjà anonymisé. ». Effets : `name = "Anonymisé #{6 derniers caractères de l'id}"`, `email = null`, `phone = null`, `notes = "[Données personnelles supprimées à la demande de la personne concernée]"`, `status="unsubscribed"`, `consentStatus="withdrawn"`, `anonymizedAt=now` ; activité « Anonymisation effectuée (droit à l'effacement). » ; consentements "granted" retirés. Le tracé de consentement est conservé.
Réponse : `{ anonymized: true }`. Audit `crm.contact.anonymize` (`{ previousName }`).

### 5.10 Studio IA (z-ai-web-dev-sdk, réel)

Quota mensuel partagé : réglage `ai_monthly_quota` (défaut **200**), compté sur les `AiAsset` créés depuis le 1er du mois (tous types). Atteint → **429** `Quota mensuel IA atteint (X/Y)…`.

#### `POST /api/admin/ai/generate` — permission `ai.use` (rate limit 12/min/utilisateur)
**Corps** : `task` **requis** ∈ `hooks` | `description` | `social_caption` | `script_video` | `email_subjects` | `cta` (400 « Type de génération invalide. Valeurs : … ») ; `productId?` (construit le contexte : titre, résumé, description ≤ 1500, catégorie, caractéristiques — les **prix ne sont jamais transmis** au LLM) ; sinon `productContext?` (≤ 4000) ; `audience?`, `language?`, `tone?`.
Garde-fou factual injecté au prompt : interdiction d'inventer prix, réductions, garanties, délais, notes, avis, résultats chiffrés.
Effet : `AiAsset` (`assetType: "text"`, `provider: "zai-llm"`, `status: "draft"`, `costEstimate: null`, `createdBy: email`).
**Réponse 200** : `{ asset, usage: { monthlyUsed, monthlyQuota }, note: "Contenu généré par IA — vérification humaine requise avant toute utilisation." }`.
**Erreurs** : 400 (task invalide, aucun contexte produit) ; 429 (rate limit, quota) ; **502** « Le fournisseur IA n'a pas renvoyé de contenu — génération NON confirmée. » ou `Échec de la génération IA (NON confirmée) : {message}`. Audits `ai.generate` / `ai.generate_failed`.

#### `POST /api/admin/ai/image` — permission `ai.use` (rate limit 6/min/utilisateur)
**Corps** : `prompt` (≥ 10 — 400 « Décrivez le visuel souhaité (10 caractères minimum). », ≤ 2000), `size?` ∈ `1024x1024` | `768x1344` | `1344x768` | `720x1440` (défaut `1024x1024`), `productId?`.
Effet : PNG écrit sous `public/ai-assets/ai-{timestamp}-{rand}.png` ; `AiAsset` (`assetType: "image"`, `provider: "zai-image"`, `content: "/ai-assets/{filename}"`, `status: "draft"`).
**Réponse 200** : `{ asset, usage: { monthlyUsed, monthlyQuota }, note: "Image générée par IA — vérifier les droits et l'exactitude avant publication." }`. Erreurs : 429, **502** (fournisseur vide/échec). Audits `ai.image` (`{ size, bytes }`) / `ai.image_failed`.

#### `POST /api/admin/ai/storyboard` — permission `ai.use` (rate limit 6/min/utilisateur)
**Corps** : `productId?` **ou** `productContext?` (≤ 2000) — 400 « Fournissez un produit ou un contexte. » ; `tone?` (défaut « dynamique et sincère »), `audience?` (défaut « grand public »).
Le LLM répond en **JSON** strict : `{ title, total_duration_seconds: 30, scenes: [{ scene, duration_seconds, visual, on_screen_text, voiceover }], cta, music_suggestion, disclaimer }` (4 à 6 scènes ~30 s). JSON non parsable → stocké brut avec `title: "Storyboard (à reformater)"`, `scenes: []`.
Effet : `AiAsset` (`assetType: "video_storyboard"`, `provider: "zai-llm"`, `status: "draft"`).
**Réponse 200** : `{ asset, renderingStatus: "not_configured", renderingNote: "Aucun fournisseur de rendu vidéo n'est configuré… Aucun MP4 ne sera prétendument créé." }` (livrable = storyboard exportable, pas de vidéo). Erreurs : 429, **502**. Audits `ai.storyboard` / `ai.storyboard_failed`.

#### `GET /api/admin/ai/assets` — permission `content.read`
Filtres : `assetType`, `status`, `productId`. Réponse : `{ items: [{ id, assetType, provider, prompt (tronqué à 300), content, status, costEstimate, createdBy, createdAt, product: {title, slug}|null }] }` — **100 derniers** (tri `createdAt desc`).

#### `PUT /api/admin/ai/assets` — permission selon action (id dans le corps)
- `action: "approve"` ou `action: "reject"` → permission **`ai.approve`** (owner seul) ; statut → `approved`/`rejected` ; audit `ai.asset.approve`/`ai.asset.reject` (`{ previous }`).
- Autres actions → permission **`content.write`** : `action: "submit"` → `pending_review` ; sinon statut cible ∈ `draft` | `archived` uniquement. Asset non modifiable si statut actuel hors `draft`/`pending_review`/`rejected` (400 `Impossible de modifier un asset au statut « … ».`) ; toute tentative d'échapper au workflow → 400 « Seul un rôle autorisé peut approuver ou rejeter un contenu. » ; audit `ai.asset.status_update`.
- `id` manquant → 400 « id requis » ; **404** « Asset introuvable ».
Workflow : `draft → pending_review → approved | rejected → archived`.

### 5.11 Réseaux sociaux (calendrier assisté)

#### `GET /api/admin/social/posts` — permission `social.read`
Réponse : `{ items: [SocialPost… (avec asset {id, assetType, content, prompt})], integrationStatus: { tiktok|instagram|facebook|youtube: { configured: false, note } }, policy }` — **100 derniers**, tri `createdAt desc`. `policy` : aucune publication directe tant que les autorisations API ne sont pas obtenues ; export manuel requis.

#### `POST /api/admin/social/posts` — permission `social.write`
Corps : `caption` (≥ 5, ≤ 2200), `platform` **requis** ∈ `tiktok` | `instagram` | `facebook` | `youtube` (400 « Plateforme invalide. Valeurs : … »), `hashtags?` (≤ 500), `campaignLink?` (≤ 500), `aiAssetId?`, `scheduledAt?`. `publishStatus` initial : `"draft"`.
Réponse **201** : `{ post }`. Audit `social.post.create`.

#### `PUT /api/admin/social/posts` — permission selon `action` (id dans le corps)
| `action` | Permission requise | Effet / règles |
|---|---|---|
| `approve` | **`ai.approve`** | `publishStatus="approved"`, `approvedBy` (email), `approvedAt` — audit `social.post.approve` |
| `schedule` | `social.write` | exige statut **`approved`** (400 « Seule une publication APPROUVÉE peut être programmée. ») + `scheduledAt` (400 « Date de programmation requise. ») → `scheduled` — audit `social.post.schedule` |
| `mark_published_manual` | `social.write` | exige `approved` ou `scheduled` (400 « Marquer « publié manuellement » exige une publication approuvée. ») → `published_manual` + `externalPostId?` (≤ 120) — audit `social.post.mark_published_manual` |
| `fail` | `social.write` | → `failed` + `errorMessage?` (≤ 500) — audit `social.post.mark_failed` |
| `archive` | `social.write` | → `archived` — audit `social.post.archive` |
| (défaut) | `social.write` | édition `caption` (≤ 2200), `hashtags?`, `campaignLink?` — audit `social.post.update` |

Réponse : `{ post }`. `id` manquant → 400 « id requis » ; **404** « Publication introuvable ».

### 5.12 Utilisateurs (owner uniquement)

#### `GET /api/admin/users` — permission `users.manage`
Réponse : `{ users: [{ id, email, displayName, role, isActive, createdAt, updatedAt }], roles: [{ value, label }] }` (tri `createdAt asc`). Aucun hash renvoyé.

#### `POST /api/admin/users` — permission `users.manage`
Corps : `email` (regex — 400 « E-mail invalide. »), `displayName` (≥ 2), `role` ∈ `ROLE_ORDER` (défaut `analyst`, 400 « Rôle invalide. »), `password` (**≥ 10** — 400 « Mot de passe requis (10 caractères minimum). »), haché **scrypt** côté serveur. E-mail déjà pris → 400 « Un utilisateur avec cet e-mail existe déjà. ».
Réponse **201** : `{ user: { id, email, displayName, role, isActive } }`. Audit `user.create` (`{ email, role }`).

#### `PUT /api/admin/users` — permission `users.manage`
Corps : `id` requis (400 « id requis » ; **404** « Utilisateur introuvable »). Champs : `role?`, `displayName?`, `isActive?` — **auto-désactivation interdite** (400 « Impossible de désactiver votre propre compte. »), `password?` (≥ 10, re-haché scrypt).
Réponse : `{ user }` (sans hash). Audit `user.update` (`{ fields }`).

### 5.13 Paramètres (settings)

#### `GET /api/admin/settings` — permission `settings.read`
Réponse :
```json
{
  "settings": { "brand_name": "…", "reference_currency": "EUR", "ai_monthly_quota": "200", … },  // map clé→valeur brute
  "editableKeys": ["brand_name", "brand_tagline", "brand_logo", "reference_currency", "display_currencies",
                   "target_countries", "default_language", "timezone", "cookie_consent",
                   "demo_mode_notice", "outbound_notice", "ai_monthly_quota"],
  "integrationsStatus": { "ai_text", "ai_image", "ai_video_render", "social_apis", "partner_apis", "exchange_rates" },
      // ai_text / ai_image : { configured: true, provider: "z-ai-web-dev-sdk (…)" } ; les 4 autres : configured: false
  "envDocumentation": { "required": ["DATABASE_URL"], "optional": ["AUTH_SECRET (recommandé en production…)", …] }
}
```

#### `PUT /api/admin/settings` — permission `settings.write`
Corps : objet `clé → valeur` ; **seules les clés de `EDITABLE_KEYS`** (liste ci-dessus) sont upsertées (`String(value)`), les autres sont ignorées silencieusement. Corps vide/non objet → `{ updated: 0 }`.
Réponse : `{ updated: number, keys: ["…"] }`. Audit `settings.update` (`{ keys }`).

### 5.14 Journal d'audit

#### `GET /api/admin/audit` — permission `audit.read`
Paramètres : `page` (défaut 1), `perPage` (défaut **50**, max **100**).
Réponse : `{ items: [{ id, actorEmail|null, action, entityType|null, entityId|null, metadata (JSON parsé ou null), createdAt }], total, page, perPage }` (tri `createdAt desc`). Lecture seule.

### 5.15 Exports CSV

#### `GET /api/admin/export/[type]` — permission selon le type

| `type` | Permission | Contenu (colonnes) |
|---|---|---|
| `clicks` | `dashboard.read` | `date;product;offer_id;campaign;sub_id;country;is_demo` — **5 000 lignes max**, tri `clickedAt desc` |
| `conversions` | `dashboard.read` | `date;partner;external_id;product;status;order_value;order_currency;commission;commission_currency;is_demo` — 5 000 max |
| `contacts` | `crm.read` | `date;name;email;phone;country;status;source;consent;is_demo;anonymized` — 5 000 max |
| `products` | `catalog.read` | `title;slug;status;type;category;currency;price_min;price_max;is_demo;updated_at` — tous |
| `dashboard` | `dashboard.read` | lignes métriques : `metric;value;note` (clics + conversions par statut avec valeurs/commissions agrégées) |

Autres valeurs → **404 texte brut** « Type d'export inconnu. Valeurs : clicks, conversions, contacts, products, dashboard ».

**Paramètres d'URL** : `days` (défaut **90**, fenêtre glissante ; ignoré pour `products`/`contacts`), `includeDemo` (défaut inclus).
**Réponse 200** : `text/csv; charset=utf-8`, séparateur **`;`**, en-tête de commentaires `#` (type, période UTC, date de génération + e-mail de l'auteur, source des données, devise), `Content-Disposition: attachment; filename="velmora-{type}-{AAAA-MM-JJ}.csv"`. Colonnes monétaires en **unités décimales** (centimes/100, 2 décimales) ; `is_demo` = `OUI`/`non`. Erreurs : 401/403 selon la permission du type.

---

## 6. Codes d'erreur et limites

### 6.1 Codes d'erreur observés

| Code | Cas réels (extraits du code) |
|---|---|
| **400** | `err(msg)` par défaut — « Requête invalide » (body non JSON), validations (titre/description/prix/statut/slug/email/consentement…), « id requis », « Contact déjà anonymisé. », « Statut invalide. », « Impossible de désactiver votre propre compte. », règles workflow IA/social |
| **401** | « Authentification requise » (session absente/expirée sur endpoint admin) ; « Identifiants invalides ou compte désactivé. » (login) |
| **403** | « Permission insuffisante pour cette action » + `{ required }` (RBAC) ; « URL de destination non autorisée — redirection bloquée par mesure de sécurité. » (`/api/go`) |
| **404** | « Produit introuvable ou non publié », « Produit introuvable », « Catégorie introuvable », « Partenaire introuvable. », « Offre indisponible ou désactivée… » (`/api/go`), « Conversion introuvable. », « Contact introuvable », « Utilisateur introuvable », « Asset introuvable », « Publication introuvable », « Ce produit n'accepte pas les demandes de renseignements. » ; exports : type inconnu (texte brut) |
| **429** | rate limits (§1.5) + « Quota mensuel IA atteint (X/Y)… » — toujours avec `{ retryAfterSec }` pour les rate limits |
| **500** | « Échec de la vérification des URLs » (`offers/check`) ; exceptions non interceptées du runtime |
| **502** | fournisseur IA vide ou en échec : « … génération NON confirmée. » (`ai/generate`, `ai/image`, `ai/storyboard`) |

### 6.2 Limites et plafonds (toutes valeurs du code)

| Objet | Limite |
|---|---|
| Rate limits publics/admin | cf. tableau §1.5 (login 8/10 min/IP, go 30/60 s/IP, catalog 120/60 s/IP, inquiry 5/10 min/IP, contact 3/10 min/IP, IA 12 et 6/min/utilisateur) |
| **Quota IA mensuel** | réglage `ai_monthly_quota`, défaut **200** ; compte tous les `AiAsset` du mois courant (textes, images, storyboards) ; dépassement → 429 |
| Session | TTL **8 h**, cookie httpOnly signé HMAC-SHA256 |
| Pagination | `perPage` : catalogue public **6–48** (défaut 12) ; products/conversions/contacts/audit **≤ 100** (défauts 20/25/25/50) |
| Listes fixes | offres admin : **200** max ; assets IA et posts sociaux : **100** max ; imports en historique : **50** |
| Exports CSV | **5 000 lignes** max par export (clics, conversions, contacts) ; séparateur `;` |
| Redirections `/api/go` | 5 paramètres UTM autorisés ; `campaign` < 40 caractères ; `subId` ≤ 64 ; `referrer` ≤ 180 |
| Vérification d'URLs d'offres | timeout **8 s**/saut, max **3 redirections**, `limit` borné **1–200** (défaut 100), séquentiel |
| Champs tronqués | `shortDescription` ≤ 300, `priceNote` ≤ 80, `note` (partenaire) ≤ 500, `objective` ≤ 200, `caption` ≤ 2200, `hashtags` ≤ 500, `campaignLink` ≤ 500, `externalId` ≤ 80, `externalPostId` ≤ 120, `externalConversionId` ≤ 120, `altText` ≤ 160, tags CRM ≤ 10, `features` ≤ 20, `media` ≤ 10, `allowedDomains` ≤ 20 |
| Mots de passe | **≥ 10 caractères** (création et modification), hachage scrypt 64 octets |
| CSV importés | aucune limite de taille explicite dans le code (la limite est celle du body parser Next.js) ; 50 erreurs/doublons max renvoyés, 20 max dans `errorSummary` |
| Rate limiter | mémoire locale **par instance** (pas de stockage partagé) — un déploiement multi-instances multiplierait les quotas ; nettoyage des buckets toutes les 60 s |

### 6.3 Particularités à connaître

- **Désactivation plutôt que suppression** : produits, catégories, partenaires, offres et contacts porteurs d'historique (clics, conversions) sont archivés/désactivés, jamais détruits — la réponse indique `{ archived|deactivated: true, message }`.
- **Offres d'un produit** : l'import déduit `productType` du slug de catégorie ; toute offre créée démarre avec `urlCheckStatus: "unverified"`, puis `ok`/`broken` via `/api/admin/offers/check` ou le cron ; un changement d'`destinationUrl` repasse l'offre à `unverified`.
- **Anti open-redirect / anti SSRF** : `url-guard.ts` refuse http/https hors liste blanche du partenaire et tout hôte privé (boucle locale, RFC1918, link-local, IPv6 ULA/link-local) ; appliqué à `/api/go` et à `offer-check`.
- **Anonymisation des clics** : aucun identifiant personnel — `anonymousSessionId` = HMAC court (12 hex) de `ip|user-agent|jour`, renouvelé chaque jour.
- **IA** : les prix produits ne sont jamais envoyés au LLM ; `costEstimate` toujours `null` (coût réel indisponible — ne pas inventer) ; tout échec fournisseur est explicite (« NON confirmée ») et journalisé.
- **Social & rendu vidéo** : intégrations déclarées `configured: false` dans l'API — publication manuelle et storyboard exportable, aucune publication/rendering automatique prétendue.
- **Devise** : les commissions ne sont jamais sommées entre devises (dashboard, exports) ; conversion de devises non configurée (`exchange_rates` : fournisseur absent).
