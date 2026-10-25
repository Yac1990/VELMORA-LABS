# RAPPORT DE DÉVELOPPEMENT — VELMORA LABS
**Date du scan :** 24 octobre 2026 · **Périmètre :** site complet (boutique publique + back-office + APIs + base de données + journaux) · **Objectif :** état exact du projet et feuille de route pour poursuivre le développement.

---

## 1. Synthèse exécutive

La plateforme est **complète et fonctionnelle de bout en bout** : boutique publique (catalogue, fiches, tracking d'achat, formulaires consentis), back-office 13 vues (RBAC 5 rôles vérifié côté serveur), IA réelle (textes, images, storyboards), imports CSV, CRM conforme RGPD, journal d'audit. Le scan du jour ne relève **aucune erreur bloquante** : `tsc` 0 erreur, `lint` 0 erreur, 0 erreur applicative en console, 0 erreur 5xx serveur, redirections de tracking fonctionnelles (302), RBAC effectif (401/403 vérifiés).

Le site tourne aujourd'hui **exclusivement sur des données de démonstration, toutes flaggées `isDemo`** (14 produits, 4 partenaires, 788 clics, 46 conversions). Le prochain chapitre du projet n'est donc pas « coder des fonctionnalités », mais **1) recréer deux livrables de documentation disparus, 2) durcir pour la production, 3) brancher des données/intégrations réelles**.

---

## 2. Ce qui est livré et vérifié (scan du jour)

### 2.1 Boutique publique — ✅ intégral
| Élément | État | Preuve du scan |
|---|---|---|
| Accueil (hero, catégories premium, bandeaux logos défilants, Nouveautés, Les plus consultés) | ✅ | 4 sections rendues, marquee présent, hero image OK |
| Bandeaux de logos défilants (sens opposés) | ✅ | Présents, moteur JS, pause au survol, hors hydratation |
| Catalogue : filtres, recherche, tri, pagination | ✅ | Recherche « excel » → résultats ; filtres catégorie actifs |
| Fiche produit : galerie, offres, disponibilité, étoiles de popularité, fonctionnalités | ✅ | `#/store?p=cours-excel-professionnels` — offre + mention vendeur |
| Bloc « Offres disponibles » + transparence achat chez le vendeur | ✅ | « L'achat, le paiement et le SAV s'effectuent sur le site du vendeur » |
| FAQ (accordéon), Contact (formulaire + consentement obligatoire), À propos, 5 pages légales | ✅ | Rendus et navigables |
| Étoiles de popularité (clics réels 30 j, échelle relative) | ✅ | Rendues sur cartes et fiches, mention anti-avis |
| Responsive mobile 390 px | ✅ | 0 débordement (scrollWidth 390), menu hamburger OK |
| Bandeau démo permanent | ✅ | Présent |

### 2.2 Back-office — ✅ intégral (RBAC effectif)
| Vue | État | Notes du scan |
|---|---|---|
| Tableau de bord | ✅ | KPI clics/conversions/commissions, graphique recharts rendu, filtres période + données démo |
| Conversions | ✅ | Table + alerte « rapportées ≠ ventes certaines », changement de statut tracé |
| Produits | ✅ | 14 produits, badges Démo, CRUD complet (créé/vérifié aux tâches 12-13) |
| Catégories | ✅ | 7 catégories réelles |
| Partenaires | ✅ | Visible owner/catalog (masqué analyste — RBAC UI + serveur 403 vérifié) |
| Imports CSV | ✅ | Onglets Produits/Conversions, dry-run coché par défaut, 2 jobs d'historique |
| Campagnes | ✅ | 3 campagnes démo, statut modifiable selon rôle |
| Studio IA | ✅ | 4 onglets, quota affiché, avertissement anti-invention permanent |
| Réseaux sociaux | ✅ | 4 plateformes « Non configuré » (honnête), workflow export manuel |
| CRM | ✅ | Contacts, activités, consentements, anonymisation |
| Utilisateurs | ✅ | Owner uniquement ; œil afficher/masquer mot de passe (ajouté ce jour) |
| Paramètres | ✅ | 12 clés éditables (marque, devises, pays, messages) |
| Journal d'audit | ✅ | 45 entrées, append-only |

### 2.3 Authentification & sécurité — ✅ + 1 incident résolu aujourd'hui
- Connexion propriétaire : **fonctionnelle** (l'éditeur a changé son mot de passe et s'est reconnecté avec succès à 10:42 — preuve au journal d'audit).
- Chaîne mot de passe vérifiée symétrique de bout en bout (formulaire → scrypt → login).
- Session hybride cookie httpOnly signé + jeton de repli `X-Session-Token` (fonctionne en iframe de prévisualisation).
- RBAC serveur vérifié : 401 sans session, 403 analyste sur `partners`.
- Rate-limit connexion : 8 tentatives / 10 min / IP.
- Anti open-redirect par liste blanche de domaines (testé aux tâches antérieures).

### 2.4 APIs — ✅
- Publiques : `catalog`, `categories`, `products`, `settings`, `popularity`, `inquiry`, `contact` → 200.
- Tracking : `GET /api/go/[offerId]` → **302** vers l'URL partenaire + clic anonyme enregistré.
- Admin : 15 groupes d'endpoints (`dashboard`, `products`, `categories`, `partners`, `offers`, `conversions`, `campaigns`, `imports`, `crm`, `ai`, `social`, `users`, `settings`, `export`, `audit`).
- Auth : `login` / `logout` / `me`.

---

## 3. Données actuelles (base `db/custom.db`)

| Table | Volume | Observation |
|---|---|---|
| Profiles (utilisateurs) | 5 | 1 propriétaire (vôtre) + 4 comptes de démonstration RBAC |
| Partenaires / règles de commission | 4 / 4 | Tous démo, URL `example.com` |
| Catégories | 7 | Slugs réels (numerique, formations, abonnements, maison, electronique, immobilier, vehicules) |
| Produits / médias / offres | 14 / 14 / 14 | **14/14 publiés, 14/14 `isDemo=true`** |
| Clics / Conversions / Transactions de commission | 788 / 46 / 46 | 100 % démo (produits démo) ; 55 clics sur 7 j |
| CRM : contacts / activités / consentements | 8 / 8 / 7 | Inclut vos vraies soumissions de test |
| Assets IA | 1 | Quota : `ai_monthly_quota` = 200/mois |
| Posts sociaux | 0 | Export manuel uniquement (choix assumé) |
| Taux de change | **0** | Table prête, **non alimentée** |
| Réglages | 12 clés | Marque, devises (7 dont XOF/XAF), messages transparence |
| Journal d'audit | 45 | Append-only |

> **Conséquence importante :** tant que des produits/partenaires réels ne sont pas saisis (ou importés), tout ce qui s'affiche publiquement est de la démonstration — le bandeau démo et les badges le disent honnêtement.

---

## 4. Qualité mesurée lors du scan

| Contrôle | Résultat |
|---|---|
| `bunx tsc --noEmit` | **0 erreur** |
| `bun run lint` | **0 erreur** |
| Erreurs console (parcours complet public + admin) | 0 erreur applicative ; 1 avertissement d'hydratation = bruit externe connu du panneau de prévisualisation (attributs `bis_*` injectés avant hydratation — documenté Tasks 15/18/21, inoffensif, géré) |
| Erreurs serveur (dev.log récent) | 0 erreur 5xx ; uniquement 401/403 attendus (tests RBAC) |
| Code | 124 fichiers TS/TSX, ≈ 18 300 lignes |
| Assets | 16 visuels produits IA + 7 illustrations catégories + 16 logos de plateformes (servis localement) |
| Volume de travail tracé | 23 tâches journalisées dans `worklog.md` |

---

## 5. Écarts, risques et points d'attention

### 5.1 Lacunes à combler (constatées au scan)
1. **`docs/API-CONTRACT.md` et `.env.example` sont ABSENTS** du dépôt alors qu'ils furent annoncés livrés (Task 10-11). À recréer : ils sont indispensables pour onboarder un développeur et pour configurer l'environnement.
2. **Vérification des URLs d'offres : inexistante côté serveur.** Les champs `urlCheckedAt`/`urlCheckStatus` existent en base et le dashboard expose `health.brokenLinks`, mais aucun processus ne vérifie les URLs — le bouton « Tester » de l'admin est purement informatif. Risque : liens d'achat morts en production.
3. **Taux de change : table vide, aucune conversion** — les montants restent en devise source (affichage OK multi-devises, mais pas d'unification vers la devise de référence).
4. **MFA non configuré** (l'application l'affiche elle-même en alerte ambre).
5. **`README.md` : section tests/démarrage à actualiser** (références aux comptes démo, maintenant propriétaire personnel + 4 rôles démo).

### 5.2 Choix assumés à garder en tête (non des bugs)
- **Publication sociale** : export manuel uniquement (aucune autorisation API obtenue — règle « ne pas prétendre »).
- **Rendu vidéo** : storyboards + export JSON seulement, jamais de faux MP4.
- **Rate-limit et cache de popularité en mémoire** : perdus au redémarrage, non distribuables (OK mono-instance).
- **Mots de passe** : pas de récupération par e-mail (pas de SMTP configuré) ; les espaces ne sont pas tronqués volontairement ; réinitialisation uniquement par un owner (ou le script `scripts/set-owner-credentials.ts`).
- **Hydratation** : le bandeau de logos est volontairement rendu après montage (aucun coût visible) ; le panneau de prévisualisation peut continuer d'afficher ponctuellement son bruit d'attributs externes — sans effet.
- **`.next` corrompu** (incident Task 14) : si l'identité visuelle disparaît (thème par défaut), purger le cache (`rm -rf .next`) et redémarrer.

### 5.3 Limites structurelles à trancher pour la production
- **SQLite → PostgreSQL** : SQLite est adapté au sandbox (mono-processus). Pour la production (multi-instances, sauvegardes, volumétrie de clics), migrer — le schéma Prisma est portable tel quel.
- **Un seul port / SPA à route unique** : architecture imposée par l'environnement ; un déploiement classique pourra éclater en routes réelles (`/`, `/admin`) sans logique à réécrire.
- **i18n** : interface 100 % française ; la clé `default_language` existe, aucune traduction implémentée.

---

## 6. Checklist « avant mise en production »

| # | Action | Priorité | Effort estimé |
|---|---|---|---|
| 1 | Recréer `docs/API-CONTRACT.md` (contrat exact des 15 groupes d'endpoints) et `.env.example` (AUTH_SECRET, etc.) | P0 | ½ j |
| 2 | Migrer SQLite → PostgreSQL (Prisma : changer le provider + `db push`, tester les raw SQL `strftime` → `to_timestamp`) | P0 | 1-2 j |
| 3 | MFA/TOTP sur les comptes owner & managers (bibliothèque otplib + QR) | P0 | 1 j |
| 4 | Vérification serveur des URLs d'offres (cron : HEAD/GET + statut `urlCheckStatus` + alerte liens cassés) | P0 | 1 j |
| 5 | Procédure de sauvegarde/restauration de la base (cron dump + stockage externe) | P0 | ½ j |
| 6 | Purge/export des données de démonstration (script : tout `isDemo=true` exporté puis supprimé) | P0 | ½ j |
| 7 | En-têtes de sécurité (CSP, X-Frame-Options, HSTS) + `AUTH_SECRET` fort + HTTPS | P0 | ½ j |
| 8 | Alimenter `exchange_rates` (fournisseur réel) + conversion d'affichage vers devise de référence | P1 | 1 j |
| 9 | Saisie/import des partenaires et produits RÉELS (imports CSV prêts) + vraies URLs de tracking | P0 métier | variable |
| 10 | Tests E2E automatisés (Playwright) sur le chemin critique : achat → clic → conversion | P1 | 2 j |
| 11 | Monitoring des erreurs (Sentry ou équivalent) + alertes | P1 | ½ j |
| 12 | i18n EN (au moins catalogue + légal) | P1 | 2-3 j |
| 13 | SMTP transactionnel (contact, demandes, réinitialisation mot de passe) | P1 | 1 j |
| 14 | Intégrations partenaires réelles (API d'affiliation : import automatique d'offres) | P2 | 2-5 j / plateforme |
| 15 | Publication sociale semi-automatisée (si autorisations obtenues) | P2 | 2-3 j |

---

## 7. Feuille de route recommandée (3 sprints)

**Sprint A — Remise en ordre (immédiat)**
Recréer la documentation disparue (contrat API, `.env.example`) · script de purge des données démo · sauvegarde base · en-têtes de sécurité · vérification serveur des URLs d'offres.

**Sprint B — Passage en réel**
Migration PostgreSQL · saisie/imports des vrais partenaires + produits + URLs de tracking · alimentation des taux de change · SMTP.

**Sprint C — Durcissement & croissance**
MFA/TOTP · tests E2E automatisés · monitoring · i18n EN · rapports avancés (funnel de conversion, cohortes, exports planifiés) · intégrations partenaires API.

---

## 8. Commandes de travail

```bash
bun run dev            # serveur de développement (port 3000, log : dev.log)
bun run lint           # ESLint
bunx tsc --noEmit      # vérification TypeScript
bun run db:push        # appliquer prisma/schema.prisma à la base
# Comptes : votre e-mail propriétaire (mot de passe personnel)
# Rôles démo : catalogue@ / marketing@ / crm@ / analyste@velmora.demo — mot de passe : velmora-demo-2024
# Identifiants propriétaire (secours) : OWNER_EMAIL=... OWNER_PASSWORD=... bun run scripts/set-owner-credentials.ts
```

Historique complet des décisions et correctifs : `worklog.md` (23 tâches).

---

## 9. Verdict

**Le socle produit est terminé et sain.** La phase suivante n'est plus du développement de fonctionnalités mais de la **mise en production** : documentation, durcissement, données réelles. La feuille de route ci-dessus (§6-7) est l'ordre recommandé.
