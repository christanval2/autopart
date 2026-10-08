# AutoParts Cameroun — Frontend (web + mobile)

Monorepo Turborepo du frontend AutoParts Cameroun (marketplace B2B & B2C de pièces auto).
Le backend (`../autoparts-backend`) a été **étendu** (routes demandées après clarification) ;
le frontend s'aligne exactement sur ses routes (référence : `docs/API_REFERENCE.md`).

## Stack

- **apps/web** — React 18 + Vite + React Router v6 + Tailwind v3 + TanStack Query v5 + Zustand + RHF/Zod + AnyChart (darkEarth) + Socket.io + LiveKit
- **apps/mobile** — Expo SDK 54 + expo-router v6 + NativeWind v4 + TanStack Query + Zustand + expo-secure-store + expo-camera
- **packages/api · types · ui · utils** — client axios (JWT + refresh), types, design system, formatage Zod/XAF

## Démarrage

```bash
npm install
npm run dev          # web sur http://localhost:5173 (CORS backend déjà ouvert sur 5173)
npm run dev:mobile   # Expo
```

- Backend : `../autoparts-backend` — comptes seed `buyer@test.cm` / `seller@test.cm` / `admin@test.cm` (`Test1234!`).
- Web : `apps/web/.env` (`VITE_API_URL`, `VITE_SOCKET_URL`, `VITE_LIVEKIT_URL`, `VITE_GOOGLE_CLIENT_ID`).
- Mobile : `apps/mobile/.env` (`EXPO_PUBLIC_API_URL` — mettre l'IP LAN pour un appareil physique).

## État — V2 + V3 + mobile livrés

### Web (MVP + V2 + V3)
- **Auth** : login (2FA TOTP), inscription pro/particulier, OTP (+ renvoi, cooldown 60 s),
  forgot/reset, **Google OAuth** (bouton GIS → `POST /auth/google` + callback redirect),
  page Compte (profil, adresses, sécurité, wallet, fidélité, **export RGPD JSON**, suppression).
- **Catalogue / Recherche** : filtres, OEM autocomplete, wizard véhicule, favoris, Q&A produits, vendeurs proches (géoloc).
- **Commandes / Paiements** : panier invité→serveur, checkout MoMo/Orange/virement/cash/crédit, suivi colis public, commande vocale LiveKit.
- **V2** : devis (envoi/acceptation/refus), bons de commande fournisseur (réception → stock), prix contractuels,
  gestion stock multi-entrepôts (niveaux, alertes, mouvements, transferts, inventaires), logistique (zones, picking, simulateur frais),
  promotions (CRUD + validation code), analytics avancé vendeur/admin (top/slow movers, funnel, timelines AnyChart),
  badge vendeur vérifié + score de performance, TVA **configurable** via `GET/PUT /admin/tax-config`.
- **V3** : fidélité (solde, paliers Bronze/Silver/Gold, rédemption 100 pts = 500 XAF), wallet (solde + historique),
  Q&A sur fiches produit, géolocalisation (`PUT /geo` admin, `GET /geo/nearby` public).
- **Notifications** : Socket.io temps réel (badge + toasts), AutoBot chatbot, messagerie interne.

### Mobile (Expo)
`app/` : `(auth)/login|register|otp` · `(tabs)/index|panier|commandes|compte` · `produits/[id]` ·
`checkout/index` (MoMo avec polling) · `messages/index|[id]` · `scanner/index` (camera OEM) ·
`suivi/[tracking]` · `favoris/index`. Tokens JWT en SecureStore (`src/lib/storage.ts`),
stores `src/store/`, hydratation au démarrage dans `app/_layout.tsx`.
Support Google OAuth via GIS selon la config (`loginWithGoogleIdToken` prêt côté store).

**Vérifications : TypeScript 0 erreur sur les 6 workspaces, build web OK, backend compile.**

## Extensions backend livrées (à la demande)

| Route | Détail |
|---|---|
| `POST /auth/google` | id_token GIS **ou** code+redirectUri → JWT applicatifs ; crée un buyer `isVerified` si email inconnu, connecte sinon, journalise le consentement CGV |
| `GET /auth/google/callback` | flow redirect serveur : valide `state` contre ALLOWED_ORIGINS puis 302 vers le front avec tokens en fragment |
| `POST /auth/otp/resend` | renvoi OTP 6 chiffres (Redis 10 min) + email, rate-limité |
| `GET/PUT /admin/tax-config` | TVA lisible/éditable (super_admin, accountant en lecture) — défaut 19,25 % CM, `ratePercent` en entrée/sortie |
| `GET /users/me/export` *(déjà présent)* | export RGPD JSON (profil, adresses, commandes, avis, consentements) |
| `GET /reviews?status=` *(déjà présent)* | `visible` (défaut) / `pending` / `rejected` / `all` |

Deps backend ajoutées : `google-auth-library`. `.env` : `ALLOWED_ORIGINS` inclut 5173 ; renseigner
`GOOGLE_CLIENT_ID`/`GOOGLE_SECRET` ( déjà prévus dans `config/env.ts` ) pour activer Google.

## Points de vigilance restants

- **Anti-fraude** (cpl-3) : aucune route backend exposée — non implémenté (aucune page prévue au plan de routes).
- **Retrait/recharge wallet mobile** : routes `POST /wallet/credit|debit` existent (admin) ; l'UI de recharge
  self-service attendra les routes de retrait.

## Push mobile (livré)

- Backend : module `push-notifications` monté dans `app.ts` — **`POST /notifications/push-token`**
  (`{ token }`, auth requis, valide le format `ExponentPushToken[…]`, enregistre sur `user.expoPushToken`).
  Les helpers `notifyUser` / `PushTemplates` du même module sont prêts pour les envois serveur.
- Mobile : `src/lib/push.ts` (permission iOS/Android, canal « default », token Expo avec
  `projectId` EAS si présent dans `app.json` → `extra.eas.projectId`, POST de la route).
  Appelé **à chaque connexion** (`setSession`) et **à la restauration de session** (`hydrateAuth`),
  donc couvre login + refresh/démarrage. Handler foreground actif (bannière + son + badge).
  ⚠️ Les pushes ne fonctionnent pas sur émulateur — tester sur appareil physique, et après
  `eas build` avec un `projectId` renseigné.

## Google mobile (prêt — client_id en attente)

- `src/lib/google.ts` lit `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` / `_IOS` (env,placeholders dans
  `apps/mobile/.env` et `eas.json`) **ou** `app.json` → `extra.googleClientIdAndroid` / `googleClientIdIOS`.
- `src/lib/useGoogleSignIn.ts` : flow complet expo-auth-session (`Google.useAuthRequest` →
  `promptAsync` → `params.id_token` → `loginWithGoogleIdToken` → `POST /auth/google` → session +
  fusion panier). Le bouton « Continuer avec Google » est sur l'écran de connexion ; sans client_id
  il est grisé avec un message explicite, et s'active dès qu'ils sont renseignés.
  redirect URI natif basé sur le scheme `autoparts://` (déjà configuré).
- À faire de votre côté : transmettre les client_id Android + iOS (et un `projectId` EAS pour les
  pushes), puis les coller dans `.env`/`app.json`/`eas.json`.
