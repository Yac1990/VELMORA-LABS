# VELMORA LABS — Plateforme e-commerce d'affiliation internationale

Boutique comparative multi-plateformes : catalogue éditorial de produits issus de partenaires, redirection d'achat suivie et transparente via liens affiliés, back-office complet (dashboard réel, catalogue, imports CSV, conversions, CRM, studio IA, social assisté, paramètres internationaux).

**Nom de marque configurable** : toutes les identités (nom, logo, devise, pays, divulgation) se modifient dans Paramètres sans réécriture du code.

---

## 1. Architecture effective

| Couche | Choix | Notes |
|---|---|---|
| Frontend | Next.js 16 App Router, React 19, TypeScript strict, Tailwind 4, shadcn/ui, recharts, framer-motion | Une seule route publique `/` (SPA à vues : boutique + back-office) conformément à l'environnement d'exécution |
| Backend | API Routes Next.js (serveur) | RBAC vérifié sur chaque endpoint ; aucune logique sensible côté client |
| Base | Prisma ORM + SQLite (`db/custom.db`) | Modèle du cahier des charges §13 intégral (20 tables). *Adaptation assumée : Supabase/PostgreSQL n'est pas disponible dans cet environnement ; le schéma est directement portable vers PostgreSQL* |
| Auth | Sessions maison : scrypt + cookie httpOnly signé HMAC-SHA256 (`AUTH_SECRET`) | 5 rôles RBAC : owner, catalog_manager, marketing_editor, crm_manager, analyst |
| IA | z-ai-web-dev-sdk côté serveur (réel) | Génération de textes, images publicitaires, storyboards vidéo |
| Sécurité | Rate-limit mémoire, liste blanche de domaines anti open-redirect, validation serveur (zod-free, contrôles explicites), journal d'audit append-only, minimisation des données | |

### Adaptations par rapport au cahier des charges (transparence)
- **Supabase → Prisma/SQLite** : même modèle de données, RLS remplacée par un RBAC serveur strict sur chaque endpoint (testable par rôle, cf. §Tests).
- **Route unique `/`** : environnement monoroute ; la navigation boutique/back-office est interne (hash `#/admin`).
- **Publication sociale directe** : non implémentée volontairement — aucune autorisation API obtenue. Workflow de secours complet (approbation → export manuel MP4/légende/hashtags/lien), conformément à la règle « ne pas prétendre ».
- **Rendu vidéo** : aucun fournisseur configuré → storyboards réels générés par IA + export JSON, jamais de faux MP4.
- **Taux de change** : aucun fournisseur configuré → montants conservés en devise source, table `exchange_rates` prête.

## 2. Démarrage local

```bash
bun install
cp .env.example .env            # renseigner AUTH_SECRET (obligatoire en production)
bun run db:push                 # crée/synchronise la base SQLite
bun prisma/seed.ts              # données de DÉMONSTRATION (flag isDemo=true partout) — cf. avertissement ci-dessous
bun run dev                     # http://localhost:3000 (log : dev.log)
bun run lint                    # ESLint
bunx tsc --noEmit               # vérification TypeScript
```

### Comptes

- Le compte **propriétaire** est personnel. Secours : `OWNER_EMAIL=… OWNER_PASSWORD=… bun run scripts/set-owner-credentials.ts`, sinon Paramètres → Utilisateurs (réservé au propriétaire).
- Les 4 comptes de démonstration RBAC ont été **purgés (Sprint A)** — la page de connexion ne les annonce plus.
- ⚠️ `bun prisma/seed.ts` vide TOUTES les tables (y compris le compte propriétaire et les données réelles) avant de recréer un jeu de démonstration : à réserver à un environnement de test. Pour revenir à l'état pré-seed : `bun run db:restore --latest --yes`.

### Exploitation (Sprint A)

```bash
bun run db:backup               # sauvegarde : copie physique cohérente (VACUUM INTO) + export JSON + manifeste SHA-256 (rétention 12)
bun run db:restore --latest     # restauration : simulation ; ajouter --yes pour exécuter (état courant mis à l'abri avant)
bun run db:purge-demo           # purge des données démo : export de traçabilité puis suppression ; --yes pour exécuter
bun run check:offers            # vérification serveur des URLs d'offres — cron-able, code de sortie 2 si liens cassés
```

Emplacements : `backups/backup-<ts>/` (sauvegardes), `backups/demo-export-<ts>.json` (traçabilité des purges).
Planification cron exemple : sauvegarde `30 4 * * *`, vérification d'URLs `0 4 * * *` (cf. en-têtes des scripts).

## 3. Données de démonstration vs réelles

- Toutes les données du seed portent `isDemo=true` : produits, partenaires, offres, clics, conversions, contacts, campagnes.
- **Purge (Sprint A)** : `bun run db:purge-demo --yes` exporte puis supprime tout le contenu `isDemo` (partenaires, produits, campagnes, contacts démo, comptes `@velmora.demo` sauf owner, et clics/conversions réels rattachés à un partenaire démo). Les catégories, réglages, journal d'audit et contacts CRM réels sont préservés ; le bandeau boutique passe sur un message neutre « Catalogue en préparation ».
- Le dashboard affiche un **bandeau d'explicitation** et un interrupteur « Inclure les données de démonstration » ; désactivé, seules les données réelles (clics via `/api/go`, conversions importées) apparaissent.
- Les exports CSV annotent chaque ligne `is_demo: OUI/non` et chaque fichier mentionne période, devise, fuseau et source.
- Aucun bouton n'invente de valeur : commission inconnue → « inconnue » ; disponibilité inconnue → « à vérifier chez le partenaire ».

## 4. Flux affilié (bout en bout)

1. Le visiteur clique « Voir sur {partenaire} » sur une fiche.
2. `GET /api/go/[offerId]` : vérifie offre active + produit publié, contrôle la destination contre la **liste blanche de domaines** du partenaire (anti open-redirect), enregistre le clic (identifiant de session **anonyme minimisé**, aucune donnée personnelle), préserve les paramètres UTM autorisés, puis 302 vers le partenaire.
3. Offre désactivée ou URL hors liste blanche → bouton retiré / redirection bloquée (403) et offre marquée `broken`.
4. Les conversions arrivent par **import CSV** (`/api/admin/imports/conversions`) avec déduplication stricte `partnerId + externalConversionId` et statuts : estimée, en attente, confirmée, annulée, payée, inconnue.
5. Le dashboard sépare : clics ≠ conversions ≠ commissions ; commissions du site ≠ CA marchand.

## 5. Studio marketing IA (réel)

- **Textes** : accroches, descriptions, légendes sociales, scripts vidéo, objets d'e-mail, CTA — via LLM serveur, garde-fous anti-invention (prix/garanties/avis interdits), quota mensuel configurable.
- **Images** : génération réelle via SDK, stockées sous `public/ai-assets/`, prompt + fournisseur journalisés.
- **Storyboard vidéo 30 s (9:16)** : scènes, textes à l'écran, voix off, musique libre — export JSON. *Aucun rendu MP4 n'est prétendu* tant qu'aucun fournisseur vidéo n'est configuré.
- **Workflow** : brouillon → à vérifier → approuvé/rejeté (owner uniquement) → export. Aucune publication sans approbation explicite.

## 6. Sécurité et conformité

- Sessions httpOnly signées, mots de passe scrypt, expiration 8 h. `AUTH_SECRET` fort requis en production (variable documentée dans `.env.example` ; le changer invalide toutes les sessions).
- **En-têtes de sécurité (Sprint A, `next.config.ts`)** : `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (caméra/micro/géo/payment/usb coupés), CSP (`default-src 'self'`, `object-src 'none'`, `base-uri`/`form-action 'self'`, `connect-src 'self'`). Anti-framing (`X-Frame-Options: SAMEORIGIN` + `frame-ancestors`) et HSTS s'activent par variables : `SECURITY_FRAME_ANCESTORS` (volontairement vide dans le sandbox — le panneau de prévisualisation intègre le site en iframe cross-origin) et `SECURITY_HSTS=true` (uniquement derrière HTTPS).
- RBAC serveur sur **toutes** les routes admin (`requirePermission`) + masquage UI parallèle.
- Rate limiting : login (8/10 min), redirections (30/min), contact (3/10 min), IA (par utilisateur).
- Journal d'audit append-only : connexions, CRUD catalogue/partenaires/CRM, imports, changements de statut, paramètres.
- CRM : consentement tracé (`consent_records` : finalité, source, dates, retrait), anonymisation RGPD irréversible, pas de profilage à partir des clics anonymes.
- Secrets : jamais en clair dans les tables (références `encrypted_secret_ref`), jamais exposés au navigateur (cf. `.env.example`).
- Sauvegardes : copier `db/custom.db` (SQLite) hors ligne ; en production PostgreSQL : `pg_dump` quotidien + test de restauration documenté.

## 7. Checklist avant lancement (cahier des charges §20)

- [ ] Remplacer le nom/logo par défaut si besoin (Paramètres → Marque) et valider le domaine.
- [ ] Signer au moins un programme partenaire réel ; remplacer les partenaires « Démo » ; mettre à jour les listes blanches de domaines.
- [x] Supprimer les comptes de démonstration (fait — Sprint A, purge `isDemo`) et définir `AUTH_SECRET` fort (fait — `.env`).
- [ ] Créer les comptes admin supplémentaires si besoin (Paramètres → Utilisateurs) et activer MFA si l'hébergeur le propose.
- [ ] Tester les redirections de bout en bout avec une URL partenaire réelle + paramètres de suivi du programme.
- [ ] Importer un premier relevé de conversions CSV réel (données de test séparées : `isDemo=false` mais environnement de préproduction recommandé).
- [ ] Rejouer les tests RBAC par rôle (§8).
- [ ] Adapter les pages légales aux pays cibles (confidentialité, cookies, divulgation des liens rémunérés) — revue juridique recommandée.
- [ ] Configurer les quotas IA et vérifier le workflow d'approbation avec deux rôles (éditeur soumet, owner approuve).
- [ ] Vérifier que la publication sociale reste bloquée sans approbation et que l'export manuel fonctionne.
- [ ] Mettre en place sauvegardes automatiques + procédure de restauration + monitoring des erreurs.
- [ ] Vérifier performances mobiles, SEO technique (métadonnées, sitemap), accessibilité et formulaires.

## 8. Tests

> L'environnement demande de ne pas inclure de suite de tests automatisés dans le dépôt ; les scénarios ci-dessous sont exécutables manuellement (curl/navigateur) et ont été validés pendant le développement :

- **RBAC** : login analyste → `GET /api/admin/users` → 403 « Permission insuffisante » ✔ ; login owner → 200 ✔ (comptes démo purgés depuis le Sprint A — recréer via seed dans un environnement de test pour rejouer)
- **Vérification d'URLs d'offres (Sprint A)** : `POST /api/admin/offers/check` (bouton « Tester » de la vue Produits) ou `bun run check:offers` — liste blanche du partenaire, refus des adresses privées (anti-SSRF), redirections suivies manuellement (max 3, revalidées à chaque saut), timeout 8 s ; statut `urlCheckStatus` mis à jour + entrée d'audit `offers.url_check` ✔
- **Redirection** : `GET /api/go/{offerId}` → 302 vers `https://example.com/go/...` + clic enregistré ✔ ; domaine hors liste blanche → 403 + offre marquée `broken` (code présent, test unitaire serveur)
- **Déduplication conversions** : réimporter le même CSV → toutes les lignes en `duplicates`, aucune double création (contrainte d'unicité DB) ✔
- **Import produits** : dry-run → rapport d'erreurs ligne par ligne ; exécution → produits en brouillon ✔
- **Contact/Inquiry** : sans consentement → 400 ; avec → contact CRM + consent_record ✔
- **Rate limit** : >8 logins échoués → 429 ✔
- **Responsive** : parcours mobile/desktop via Agent Browser ✔

## 9. Déploiement (GitHub + Vercel)

1. Pousser le dépôt sur GitHub (branche `main` protégée, PR obligatoires).
2. Sur Vercel : importer le repo, définir les variables d'environnement (`.env.example`) : `DATABASE_URL` (PostgreSQL en prod : `prisma://...` ou direct), `AUTH_SECRET`.
3. Migrer le schéma : `prisma db push` ou générer des migrations `prisma migrate dev --name init` et les committer (dossier `prisma/migrations`), exécutées au déploiement.
4. Provisionner la base (Neon/Supabase Postgres), restaurer une sauvegarde de référence, ne JAMAIS importer le seed de démonstration en production.
5. Après déploiement : rejouer la checklist §7, vérifier `/api/go` avec une vraie URL partenaire, activer le monitoring d'erreurs.

## 10. Limites connues (honnêteté d'intégration)

| Intégration | État | Contournement livré |
|---|---|---|
| Sauvegarde/restauration | **Opérationnelle (Sprint A)** : `bun run db:backup` / `db:restore` | Cron recommandé en production + stockage externe des dossiers `backups/` |
| API partenaires (flux produits) | Non configurée (aucune clé) | Import CSV complet avec mapping/validation |
| Relevés de conversions via API/webhook | Non configuré | Import CSV + déduplication + statuts |
| Rendu vidéo IA | Non configuré | Storyboard IA réel + export JSON |
| Publication TikTok/IG/FB/YT | Non autorisée (aucune app validée) | Workflow approbation + export manuel |
| Taux de change | Non configuré | Montants en devise source, table prête |
| Vérification d'URL serveur | **Opérationnelle depuis le Sprint A** : `POST /api/admin/offers/check` + `bun run check:offers` (cron, exit 2 = alerte) | Liste blanche + anti-SSRF + redirections contrôlées ; les pare-feux anti-robots (403/429) peuvent donner un faux « broken » — rapport relu par un humain, aucune désactivation automatique |
| MFA admin | Non disponible dans cet environnement | Documenté dans la checklist de production |
