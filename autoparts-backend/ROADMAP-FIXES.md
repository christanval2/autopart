# Roadmap de correction — autoparts-backend

> État : **Phases 1 à 6 implémentées le 2026-09-16** — voir « Reste à faire (manuel) » en bas.

---

## Phase 1 — Secrets & OAuth (CRITIQUE) · ✅ IMPLÉMENTÉ (code)

### Fait
- [x] `.env.example` réécrit avec placeholders uniquement (il contenait les VRAIS secrets)
- [x] `.env` nettoyé : doublons `SMS_API_KEY`/`GROQ_API_KEY` supprimés, espaces parasites retirés, `GOOGLE_CLIENT_SECRET` renommé `GOOGLE_SECRET` (aligné sur `env.ts`)
- [x] Secrets **générés localement** rotés : `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (aucune donnée chiffrée avec l'ancienne — helpers encrypt/decrypt non utilisés), `VOICE_AGENT_SECRET`
- [x] Fail-fast `env.ts` : superRefine qui impose les configs couplées complètes (Google, Cloudinary, LiveKit, SMTP)
- [x] `docker-compose.yml` : mots de passe paramétrables (`${POSTGRES_PASSWORD:-123}`) + **healthcheck Postgres corrigé** (`pg_isready -U autoparts` → `-U postgres`, il échouait silencieusement)
- [x] `LOG_LEVEL` passé à `info` dans `.env`

### ⚠️ Reste MANUEL (dashboards externes — impossible depuis le code)
- [ ] Gmail : révoquer le mot de passe d'application (myaccount.google.com → Sécurité → Mots de passe d'application), en créer un neuf, remplacer `SMTP_PASS`
- [ ] Cloudinary : Console → Settings → API Keys → régénérer, remplacer `CLOUDINARY_API_KEY/SECRET`
- [ ] Groq : console.groq.com/keys → révoquer/régénérer, remplacer `GROQ_API_KEY`
- [ ] Africa's Talking : dashboard → régénérer l'API key, remplacer `SMS_API_KEY`
- [ ] LiveKit : project settings → régénérer le secret, remplacer `LIVEKIT_API_SECRET`
- [ ] Google Cloud Console : révoquer le client secret OAuth, en créer un, remplacer `GOOGLE_SECRET`
- [ ] Sentry : rotater le DSN si possible, sinon nouveau projet
- [ ] En prod : sortir les secrets du fichier `.env` vers les variables d'environnement de la plateforme

---

## Phase 2 — Modules sans authentification (CRITIQUE) · ✅ IMPLÉMENTÉ

- [x] Audit complet : `push-notifications` n'expose **aucune route** (module utilitaire) ; `catalog` et `legal` = GET publics en lecture seule, légitimes
- [x] **Faille IDOR trouvée et corrigée dans le chatbot** (`src/modules/chatbot/index.ts`) : n'importe qui pouvait lire/vider/injecter dans l'historique d'un utilisateur via `sessionKey=user:<id>`. Correction : clé forcée `user:{id}` pour les connectés (middleware `optionalAuthenticate` ajouté), refus des clés `user:*` pour les anonymes
- [x] Test sentinelle `tests/routes-sentinel.test.ts` : parcourt la stack Express réelle, échoue si une mutation n'est pas protégée + test anti-pourrissement de la whitelist
- [x] **Bug découvert par le sentinelle** : `voice-order` était importé mais **jamais monté** (fonctionnalité inaccessible) → monté sur `/api/v1/voice-order`

---

## Phase 3 — Migrations & synchronize (IMPORTANT) · ✅ IMPLÉMENTÉ (code)

- [x] Chemins corrigés : les 2 DataSources pointaient vers `src/migrations/` (inexistant) alors que les migrations sont dans `migrations/` → `migration:run` ne trouvait **rien**
- [x] `synchronize: false` **partout** (`src/config/database.ts`) — plus de risque de drift
- [x] DataSources unifiées : `src/data-source.ts` hérite de `baseOptions` exporté par `src/config/database.ts` (une seule source de vérité)
- [x] Scripts ajoutés : `npm run schema:drift` (écart entités↔base) et `npm run db:setup` (migrations + seed)
- [x] README mis à jour avec le workflow migrations

### ⚠️ Reste à faire (nécessite PostgreSQL lancé)
- [ ] `docker-compose up -d postgres` puis `npm run migration:run && npm run seed` sur base vierge
- [ ] Si erreurs : générer la migration de réconciliation `npm run migration:generate -- --name=ReconcileSchema` et vérifier le DDL produit avant de l'appliquer
- [ ] Vérifier `npm run schema:drift` → doit être vide après migrations

---

## Phase 4 — Redis KEYS → SCAN · ✅ IMPLÉMENTÉ

- [x] `resetPassword` : `redis.keys('rt:*')` remplacé par un **index par utilisateur** (`rt-index:<userId>`, sets Redis) — révocation en O(tokens du user) via `revokeAllUserRefreshTokens()` dans `src/config/redis.ts`
- [x] `storeRefreshToken`/`revokeRefreshToken` maintiennent l'index (branchés sur register/login/refresh/logout)
- [x] `invalidate()` : KEYS → `scanStream` non bloquant
- [x] Grep vérifié : plus aucun `redis.keys` dans `src/`
- [x] Tests unitaires du cycle store/revoke/revokeAll avec ioredis mocké (`refresh-token-index.test.ts`)

---

## Phase 5 — Uploads & catalog · ✅ IMPLÉMENTÉ

- [x] Fallback uploads corrigé : plus jamais de data-URL tronquée en base — stockage réel sur disque `uploads/products/`, servi statiquement sous `/uploads` (`app.ts`), suppression du fichier au delete. Mimetype respecté pour l'extension.
- [x] `uploads/` ajouté au `.gitignore`
- [x] **catalog vs catalogs = FAUX doublon** (constaté à la lecture) : `catalog` = catégories/marques publiques (GET), `catalogs` = catalogues B2B par organisation. Aucune fusion nécessaire.

---

## Phase 6 — Nettoyage & tests · ✅ IMPLÉMENTÉ

### Nettoyage
- [x] Supprimés : `check-db.js`, `check-db2.js`, `test-catalog.js`, `test-login.js`, `dist/`
- [x] Dépendances retirées : `class-validator`, `sharp` (jamais importées)
- [x] Config Jest dupliquée supprimée (`package.json` jest key) → `jest.config.ts` unique, incluant `setupFiles` et les deux répertoires de tests
- [x] Chatbot monté via `${v1}` (cohérence du préfixe versionné)
- [x] `req.headers.authorization!` (logout) remplacé par une garde explicite
- [x] ESLint réparé : migration `.eslintrc.json` → `eslint.config.js` (flat config ESLint 9) — le lint ne tournait plus du tout ; **0 erreur** désormais
- [x] Newsletter : Queue BullMQ créée paresseusement (une instanciation à l'import bouclait sur Redis ECONNREFUSED et **bloquait toute la suite de tests**)

### Tests (31/31 verts — `npx jest`)
- [x] Machine à états commandes : extraite du module en `ORDER_TRANSITIONS` + `canOrderTransition()` exportés et **testés contre le code de production** (l'ancien test recopiait les transitions — il testait aussi un statut `pending_payment` qui n'existe plus dans le code !)
- [x] Index refresh tokens : 4 tests (store/revoke/revokeAll/iso entre users)
- [x] Sentinelle routes : 2 tests (mutations protégées + whitelist à jour)
- [x] Helpers : 7 tests existants conservés
- [x] Tests d'intégration (nécessitent Postgres+Redis) exclus du run par défaut → `RUN_INTEGRATION=1 npm run test:integration`

### Validation finale
- `tsc --noEmit` : 0 erreur · `eslint` : 0 erreur · `npm run build` : OK · `jest` : **4 suites / 31 tests passés**

---

## Reste à faire (récapitulatif manuel)

1. **Révoquer/régénérer les secrets externes** (liste détaillée Phase 1) — les anciens sont compromis
2. **Init git** : le projet n'est pas versionné ; premier commit recommandé maintenant que `.env` est propre et gitignored
3. **Avec PostgreSQL lancé** : `npm run db:setup` + vérifier le drift (Phase 3) et générer la migration de réconciliation si besoin
4. **CI** : brancher `npm test` + `npm run lint` + `tsc --noEmit` sur un pipeline (GitHub Actions)
