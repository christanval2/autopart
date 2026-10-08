# Roadmap de tests — App mobile AutoParts (routes UI × backend)

> Dernière exécution : 2026-10-07 — API : `http://localhost:3000/api/v1` (backend natif, ts-node)
> Origine web testée : `http://localhost:8082` (ajoutée à `ALLOWED_ORIGINS` du backend)

## 0. Pré-requis

| # | Étape | Statut |
|---|---|---|
| 0.1 | Backend démarré sur :3000 (`ts-node src/server.ts`) | ✅ |
| 0.2 | CORS : `http://localhost:8082` présent dans `ALLOWED_ORIGINS` (backend `.env`) | ✅ corrigé |
| 0.3 | Docker : postgres (:5433), redis (:6379) actifs | ✅ |
| 0.4 | Entité `Promotion.orgId` typée explicitement (`varchar`) sinon crash TypeORM au boot | ✅ corrigé |
| 0.5 | Serveur Expo : `npm run dev:mobile` (natif) ou `npx expo start --web --port 8082` | ✅ |

## 1. Vérification backend d'abord (script : `scripts/test-backend-routes.sh`)

Règle : **public → 200**, **protégé → 401** (la route existe, auth exigée), **validation → 400/422**, **jamais 404**.

| Méthode | Route | Reçu | Verdict |
|---|---|---|---|
| GET | `/catalog/categories` | 200 | ✅ |
| GET | `/products?limit=20` | 200 | ✅ |
| GET | `/products/:id` | 200 | ✅ |
| GET | `/search?q=…` | 200 | ✅ |
| GET | `/reviews?productId=…` | 200 | ✅ |
| GET | `/reviews/product/:id/rating` | 200 | ✅ |
| GET | `/promotions?active=true` | 200 | ✅ |
| POST | `/promotions/validate` | 422 (code inconnu) | ✅ |
| GET | `/shipping/zones` | 401 — **auth requise** | ⚠️ voir note A |
| GET | `/shipping/quote` | non testable — 0 zone en base | ⚠️ voir note A |
| GET | `/chatbot/status` | 200 | ✅ |
| POST | `/chatbot/message` | 200 | ✅ |
| GET | `/voice-order/status` | 200 (`available:false`) | ✅ |
| POST | `/voice-order/session` | 401 | ✅ |
| GET | `/shipments/track/:code` | 404 (n° inconnu) | ✅ |
| POST | `/auth/login` (mauvais identifiants) | 401 | ✅ |
| POST | `/auth/register` (payload vide) | 422 | ✅ |
| POST | `/auth/verify-email` · `/auth/otp/resend` | 401 | ✅ |
| GET/POST | `/cart`, `/orders`, `/payments`, `/addresses`, `/wishlist`, `/wallet/balance`, `/loyalty/balance`, `/messages*`, `/disputes`, `/reviews` | 401 | ✅ |
| GET | `/analytics/conversion·top·categories·timeline` | 401 | ✅ |

**Aucun 404 — toutes les routes appelées par l'app existent côté backend.**

Notes :
- **A. Livraison** : `/shipping/zones` est protégé. Pour tester le checkout connecté, créer des zones (admin ou seed) puis `GET /shipping/quote?zoneId=…&subtotal=…`.
- Le conteneur Docker `autoparts-api` (:3005) ne répond plus ; le backend actif tourne en natif sur :3000.

## 2. Tests UI route par route (web :420px, non connecté)

| Route | Attendu | Reçu | Verdict |
|---|---|---|---|
| `/` | catégories + produits + 3 boutons (scan/bot/micro) | conforme | ✅ |
| `/produits/:id` | fiche + section Avis clients | conforme | ✅ |
| `/promotions` | liste des promos actives | 4 promos réelles (FREIN10, BIENVENUE10, FRAIS0, PROMO5000) | ✅ |
| `/chatbot` | chat + statut + envoi | conversation réelle (réponse LLM) | ✅ |
| `/vocal` | session ou message d'indisponibilité | « service non disponible » (LiveKit hors ligne) | ✅ |
| `/scanner` | cadre caméra | conforme | ✅ |
| `/suivi/:code` | formulaire de suivi | conforme | ✅ |
| `/(auth)/login` | formulaire + Google dégradé | conforme après fix C | ✅ |
| `/(auth)/register` | formulaire (Particulier/Pro) | conforme | ✅ |
| `/(auth)/otp` | code 6 chiffres + renvoi | conforme | ✅ |
| `/(tabs)/panier` | panier vide + lien catalogue | conforme | ✅ |
| `/(tabs)/commandes` | mur d'auth | conforme | ✅ |
| `/(tabs)/compte` | mur d'auth | conforme | ✅ |
| `/checkout` | 4 sections (adresse/promo/livraison/paiement) | conforme | ✅ |
| `/favoris` | vide (anonyme) | conforme | ✅ |
| `/messages` | mur d'auth | conforme | ✅ |
| `/stats` | mur d'auth | conforme | ✅ |
| `/litiges/nouveau` | mur d'auth | conforme | ✅ |

## 3. Corrections issues de cette campagne

- **C** — Crash du login : `Google.useAuthRequest` exige un `webClientId` dès l'init → placeholder quand les IDs ne sont pas configurés + message « En attente des client_id Google » (`src/lib/useGoogleSignIn.ts`).
- **B** — Icône micro (commande vocale) ajoutée sur l'accueil, à côté du scan et d'AutoBot.
- **A** (backend, fait précédemment) — CORS `:8082` + entité `Promotion.orgId`.

## 4. Reste à tester avec un compte (manuel)

1. ~~Google OAuth web~~ ✅ **fonctionnel** : redirection acceptée par Google (`webClientId` = client web de l'app web, ajouté à `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`) ; URI `http://localhost:8082/auth/google` enregistrée dans la console Google Cloud. Reste à saisir les identifiants Google pour valider l'échange `POST /auth/google`.
2. `POST /auth/register` réel → réception OTP email → `/(auth)/otp`.
3. Checkout complet : adresse + zone de livraison (créer des zones) + code promo valide + paiement MoMo test.
4. Avis : `POST /reviews` sur un produit acheté (badge « Achat vérifié »).
5. Litige : bouton « Signaler un problème » sur une commande → `POST /disputes`.
6. Statistiques : données analytics avec un compte vendeur/admin.
7. Vocal : audio temps réel → nécessite le SDK LiveKit natif (build de développement EAS, pas Expo Go).

## 5. Relancer la campagne

```bash
# backend
bash apps/mobile/scripts/test-backend-routes.sh
# UI : parcourir http://localhost:8082 + les routes du tableau §2
```
