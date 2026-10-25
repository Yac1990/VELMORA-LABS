# Task 25-c — Taux de change réels (Sprint B) — full-stack-developer (fx)

Date : 2026-10-24 · Statut : TERMINÉ ET VÉRIFIÉ

## Livrables (4 fichiers créés, aucun autre fichier modifié)

1. `src/lib/fx.ts` — service backend FX (aucune simulation) :
   - `fetchLatestRates()` : appel réel `https://open.er-api.com/v6/latest/EUR` (AbortSignal.timeout 8 s, no-store), sanitization stricte (nombres finis > 0 uniquement), payload brut truncaté à 200 Ko ;
   - `refreshExchangeRates()` : upserts `ExchangeRate` (15 paires EUR→USD/MAD/GBP/CHF/CAD/XOF/XAF/CNY/INR/BRL/JPY/AED/SAR/AUD/NGN, upsert `baseCurrency_quoteCurrency`) + archivage matrice complète dans `Setting` (`fx.latest.json`, `fx.latest.fetchedAt`) ; déduplication des refresh simultanés (promesse partagée) ; anti-martelage 60 s après échec ;
   - `getLatestRates()` : lecture base + actualisation paresseuse si > 6 h ; flag `stale` honnête ; `{ rates:{}, fetchedAt:null }` si table vide + échec — JAMAIS de valeur inventée ;
   - `convert(cents, from, to)` : pivot EUR sur taux stockés uniquement, `null` si impossible, identité EUR exacte.
2. `src/app/api/admin/rates/route.ts` — GET (`settings.read`, les 5 rôles y compris analyste) = taux + config display_currencies ; POST (`settings.write`) = refresh + audit `rates.refresh` + données fraîches ; échec fournisseur → 502 exact.
3. `src/app/api/public/rates/route.ts` — GET public sans auth, 60 req/min/IP (`checkRateLimit`, 429 + retryAfterSec), filtre sur `display_currencies`, `EUR:1` (identité de base, commentée).
4. `src/components/admin/settings-fx-card.tsx` — carte autonome « use client » « Taux de change (temps réel) » : Skeletons, fournisseur + date (formatDate fr-FR UTC), Badges « À jour »/« périmé » (ambre), état vide explicite, Table shadcn (th scope="col"), note « N paires EUR stockées · matrice archivée fx.latest.json », bouton « Actualiser maintenant » (RefreshCw spin, aria-label, toasts sonner), prop `user` optionnelle (masque le bouton si `settings.write` absent ; le serveur applique le RBAC de toute façon), try/catch partout.

## Valeurs RÉELLES récupérées (24/10/2026 12:13 UTC, provider https://www.exchangerate-api.com)

EUR/USD = **1,120092** (indicatif tâche 0,9–1,2 ✓) · EUR/MAD = **10,998293** (indicatif 10–12 ✓) · EUR/GBP = 0,837491 · EUR/CHF = 0,923747 · EUR/CAD = 1,568163 · EUR/XOF = EUR/XAF = 655,957 · EUR/JPY = 175,69 · 15/15 paires stockées · fx.latest.json = 3 053 caractères (result=success, base=EUR).

## Vérifications

- Script temporaire fx (créé puis SUPPRIMÉ) : refresh ok, plausibilité validée, getLatestRates → database/stale:false/15 paires, convert() OK (10000 EUR→USD = 11 200,92 ; USD→MAD croisé ; identité ; casse ; inconnu → null).
- Script temporaire handlers (créé puis SUPPRIMÉ — serveur dev arrêté à ce moment, non redémarré, non géré ici) : admin GET/POST sans session → 401 ; public GET → 200 `{EUR:1, USD:1,120092, MAD:10,998293}`, filtrage display_currencies exact.
- `bunx tsc --noEmit` : **0 erreur dans les 4 fichiers créés**. 4 erreurs PRÉEXISTANTES hors périmètre : `scripts/sqlite-to-postgres.ts` lignes 122/134/157/160 (directives `@ts-expect-error` devenues inutiles après régénération du client Prisma ; mtime 12:00:04 < mon premier fichier 12:10:34 ; non modifié conformément à la consigne ; correctif trivial : supprimer ces 4 directives — à router vers l'agent de migration Sprint B).
- `bun run lint` : exit 0, 0 erreur.
- À intégrer : `<SettingsFxCard user={user} />` dans la vue Paramètres (settings.tsx non modifié — hors périmètre de 25-c).
