# Déploiement VELMORA LABS — Vercel + Supabase

Guide pas-à-pas pour mettre la plateforme en ligne. Durée réelle : **30 à 45 minutes**
(hors achat du nom de domaine). Tous les coûts peuvent commencer à 0 € (offres gratuites
Vercel Hobby + Supabase Free).

## Architecture cible

| Composant | Service | Rôle |
|---|---|---|
| Site + API + back-office | **Vercel** | Pages statiques sur CDN, routes API en fonctions serverless, proxy de bordure (src/proxy.ts) sur le réseau Edge |
| Base de données | **Supabase** | PostgreSQL managé (sauvegardes, pooler de connexions) |
| Machine locale | ce projet | Développement + opérations de schéma/restauration vers Supabase |

---

## Étape 0 — Prérequis

- Un compte [github.com](https://github.com) (le code y est poussé, cf. Étape 4)
- Un compte [supabase.com](https://supabase.com) (gratuit)
- Un compte [vercel.com](https://vercel.com) — **« Sign up with GitHub »** recommandé

---

## Étape 1 — Créer le projet Supabase

1. supabase.com → **New project**
2. Nom : `velmora-labs` · Mot de passe base : en générer un fort et **le conserver**
3. Région : **Europe (Frankfurt)** ou **Europe (London)** — la plus proche de la France
4. Attendre le provisionnement (~2 min)

## Étape 2 — Récupérer les deux chaînes de connexion

**Project Settings → Database → Connection string** :

| À copier | Port | Usage | Variable |
|---|---|---|---|
| **Transaction pooler** | 6543 | Runtime Vercel (serverless) | `DATABASE_URL` |
| **Direct connection** | 5432 | Migrations, restauration, owner | `DIRECT_URL` |

- Remplacer `[YOUR-PASSWORD]` dans chaque chaîne par le mot de passe de l'Étape 1.
- Pour `DATABASE_URL` (pooler), compléter les paramètres :
  `?pgbouncer=true&connection_limit=1&sslmode=require`
- Le pooler transactionnel ne supporte pas les opérations de schéma : **db push /
  restauration passent toujours par la connexion directe (5432)**.

## Étape 3 — Créer le schéma + migrer les données (depuis ce projet)

Méthode déterministe : on pointe **temporairement** le `.env` local vers Supabase
(les scripts bun/prisma lisent le `.env` — aucune surprise d'environnement).

```bash
cd /home/z/my-project

# 0) sauvegarde fraîche de la base locale (bonne pratique)
bun run db:backup

# 1) éditer .env : remplacer les 2 lignes DATABASE_URL et DIRECT_URL
#    par les URLs Supabase DIRECTES (5432) — les deux identiques pour ces opérations :
#    DATABASE_URL=postgresql://postgres.<ref>:<pass>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
#    DIRECT_URL=<même valeur>

# 2) créer le schéma sur Supabase
bun run db:push

# 3) restaurer les données réelles (16 partenaires, 8 produits, 8 offres, taux, réglages…)
bun scripts/db-restore.ts --from=backups/backup-20261024-122436 --yes

# 4) recréer le compte owner (le hash du mot de passe n'est volontairement
#    pas dans les sauvegardes)
OWNER_EMAIL="vous@exemple.tld" OWNER_PASSWORD="MotDePasseFort123!" \
  bun scripts/set-owner-credentials.ts

# 5) REMETTRE .env tel qu'au départ (URLs locales velmora 127.0.0.1)
```

> 💡 Alternative sans éditer `.env` : précéder chaque commande des deux variables
> (`DATABASE_URL=... DIRECT_URL=... bun run db:push`) — l'environnement du shell
> l'emporte alors sur le `.env`. Les deux méthodes sont sûres ; n'en utiliser qu'une.

## Étape 4 — Pousser le code sur GitHub

Le dépôt est prêt : **historique propre, aucun secret** (`.env`, `db/`, `backups/`
sont ignorés — vérifié). Créer un dépôt **vide** nommé `velmora-labs` sur GitHub, puis :

```bash
git remote add origin https://github.com/<votre-compte>/velmora-labs.git
git push -u origin main
```

## Étape 5 — Vercel : importer et configurer

1. vercel.com → **Add New… → Project** → importer `velmora-labs`
2. Framework Preset : **Next.js** (auto-détecté) — laisser Build/Install par défaut
3. **Environment Variables** (les ajouter pour Production, Preview et Development) :

| Variable | Valeur | Notes |
|---|---|---|
| `DATABASE_URL` | pooler **6543** + `?pgbouncer=true&connection_limit=1&sslmode=require` | requêtes runtime |
| `DIRECT_URL` | direct **5432** | migrations |
| `AUTH_SECRET` | `openssl rand -hex 32` (nouveau, ≠ local) | **avant le premier build** — inliné dans le proxy Edge au build |
| `SECURITY_FRAME_ANCESTORS` | `'self'` | anti-framing en production |
| `SECURITY_HSTS` | `true` | HTTPS est actif sur Vercel |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM/TO_ADMIN` | (optionnel) | sans elles, les e-mails restent honnêtement en file (EmailLog `queued`) |

4. Settings → Functions → **Function Region** : `Paris (cdg1)` — proche de la France ;
   idéalement la même région que Supabase pour minimiser la latence base
5. **Deploy** (~2-3 min)

## Étape 6 — Nom de domaine

1. Acheter le domaine (ex. `velmoralabs.com`) chez n'importe quel registrar
2. Vercel → Project → Settings → **Domains** → ajouter `velmoralabs.com` et `www.…`
3. Suivre les DNS indiqués par Vercel (`CNAME` sur `cname.vercel-dns.com` ou `A` record)
4. HTTPS : certificat automatique (Let's Encrypt) — HSTS déjà actif via `SECURITY_HSTS`

## Étape 7 — Vérifications post-déploiement

- [ ] `https://<domaine>` — accueil avec les vrais produits, aucune erreur console
- [ ] `https://<domaine>/#/admin` — connexion owner → dashboard avec données
- [ ] Cliquer un produit → `/api/go/<slug>` renvoie 302 vers le vendeur + ClickEvent en base
- [ ] Formulaire de contact → EmailLog (`sent` si SMTP configuré, `queued` sinon)
- [ ] `curl -I https://<domaine>` — présence de `Content-Security-Policy`, `x-request-id`, `Strict-Transport-Security`
- [ ] Vercel → Deployments → Logs : aucune erreur de fonction

---

## Comportements honnêtes à connaître (serverless)

- **Limiteur de connexion en mémoire** : sur Vercel, chaque instance de fonction
  compte séparément (8 essais / 10 min par instance). Protection réelle mais répartie.
- **AUTH_SECRET inliné au build** dans le proxy Edge : après rotation du secret,
  **redéployer** (un simple Redeploy suffit, les variables sont relues au build).
  Depuis Task 45, **l'absence d'AUTH_SECRET en production est fatale** (repli dev
  supprimé) : sans la variable, les routes admin répondent en erreur et le build
  doit être refait après l'avoir définie.
- **RBAC faisant autorité (Task 45)** : chaque route admin relit le rôle et l'état
  actif du compte en base (cache 30 s). Désactiver ou rétrograder un utilisateur
  dans Admin → Utilisateurs prend effet au plus tard 30 s après, sans attendre
  l'expiration de son jeton (8 h).
- **Supabase Free** : un projet sans activité est mis en pause après ~7 jours —
  le réactiver depuis le dashboard (les données sont conservées).
- **IDs affiliés** : tant que `tracking.<slug>.affiliateId` n'est pas renseigné dans
  Réglages admin, `/api/go` redirige vers les vendeurs **sans tracking de commission**.

## Sécurité — historique des mesures (Task 45, mise en production)

1. **Dumps SQL purgés** : `public/demo/velmora-install.sql` et `supabase-import.sql`
   (contenant le hachage du mot de passe owner, l'historique d'audit réel et les
   gabarits de tracking) ont été retirés du projet — le premier était **téléchargeable
   publiquement** sous `/demo/velmora-install.sql`. Le mot de passe owner a été
   **rotaté** (l'ancien hachage est invalide). `.gitignore` interdormit désormais
   tout `*.sql` à la racine et sous `public/`.
   ⚠️ **GitHub (`Yac1990/VELMORA-LABS`) contient encore ces fichiers dans
   l'historique** : supprimer le dépôt et re-pousser l'historique nettoyé, ou
   réécrire l'historique (`git filter-repo --path public/demo/velmora-install.sql
   --path supabase-import.sql --invert-paths`) avant tout nouveau push.
2. **Secret de signature** : plus aucun repli en production (fail-fast).
3. **RBAC** : relecture rôle/état actif en base (cache 30 s) à chaque route admin.
4. **Limites de débit** : IP client issue de `x-real-ip` (proxy de confiance) ou du
   dernier saut `X-Forwarded-For` — un en-tête forgé par le client ne contourne
   plus les limites.
5. **Exports CSV** : neutralisation des formules (`= + - @` → apostrophe initiale).
6. **Uploads** : octets magiques vérifiés (MIME falsifié rejeté), SVG/HEIC refusés.

## Dépannage rapide

| Symptôme | Cause probable | Correctif |
|---|---|---|
| 500 sur les API + log `Environment variable not found: DIRECT_URL` | variable absente sur Vercel | l'ajouter puis Redeploy |
| `P1001: Can't reach database` | pooler mal formé / mauvais port | `DATABASE_URL` = port **6543** + `pgbouncer=true` ; `DIRECT_URL` = **5432** |
| Connexion admin boucle sur 401 après login | `AUTH_SECRET` ≠ celui du build | Redeploy après toute rotation |
| Fonctions lentes / timeouts | connexion directe 5432 en runtime | `DATABASE_URL` doit être le **pooler** |
| Schéma désynchronisé après évolution du modèle | push non refait vers Supabase | `.env` → URLs directes Supabase → `bun run db:push` → restaurer `.env` |
| Admin inaccessible depuis l'iframe de préview | normal en prod (`frame-ancestors 'self'`) | ouvrir `/#/admin` dans un onglet dédié |
