# Roadmap Features manquantes — les 15 restants

> **État : Phases F1 à F6 IMPLÉMENTÉES le 2026-09-17.**
> Validation : `tsc` 0 erreur · ESLint 0 erreur · `npm run build` OK · Jest **6 suites / 52 tests verts** (sentinelle incluse).
> Migration à appliquer : `1700000005000-MissingFeatures.ts` → `npm run db:setup`, puis
> `npx ts-node --transpile-only -r tsconfig-paths/register scripts/encrypt-phones.ts` (chiffrement des téléphones existants).

---

## Phase F1 — Sécurité & conformité · 2 j

### 1.1 Chiffrement AES des téléphones
- [ ] Dans `src/entities/User.ts` : renommer la colonne en `phone_enc` (chiffrée) + colonne `phone_hash` (SHA-256, indexée) pour la recherche/existence — migration
- [ ] Utiliser les helpers **existants** `encrypt`/`decrypt` de `src/shared/utils/helpers.ts` (AES-256-GCM, clé `ENCRYPTION_KEY` — rotaée en phase sécurité, aucune donnée chiffrée avant, démarrage propre)
- [ ] Intercepter lecture/écriture : `phone` exposé en clair par l'API (decrypt), stocké chiffré ; recherche par téléphone via `phone_hash` (`hashSHA256` existe aussi)
- [ ] Migrer les téléphones existants dans la migration (chiffrement en SQL impossible → script one-shot `scripts/encrypt-phones.ts`)
- [ ] ⚠️ Documenter : rotater `ENCRYPTION_KEY` rendra les téléphones illisibles — procédure de re-chiffrement nécessaire le jour où
- [ ] Test : write → read rond-trip, recherche par hash, champs `phone*` absents des exports bruts

### 1.2 Impersonation admin
- [ ] `POST /users/:id/impersonate` (super_admin uniquement) : émet un access token court (15 min, non renouvelable) avec claims `impersonatorId` + `impersonatedId`
- [ ] Interdire l'impersonation d'un autre super_admin ; refléter dans `req.user` un champ `impersonating: true` (middleware `authenticate`)
- [ ] **Log obligatoire** dans `AuditLog` à chaque impersonation (qui, qui est imité, quand, IP)
- [ ] Route `POST /auth/stop-impersonation` : invalide le token (blacklist existante)
- [ ] Test : super_admin OK, non-admin 403, impersonation super_admin→super_admin 403, entry audit créée

### 1.3 Archivage légal 10 ans (commandes/factures)
- [ ] Politique : interdire tout `onDelete: CASCADE` remontant aux commandes (vérifier `OrderLine`, `Payment` — `Payment` est déjà CASCADE sur l'order : à passer en RESTRICT)
- [ ] Job mensuel : export JSON/CSV des commandes clôturées de l'année N-3 vers MinIO/S3 (`archive/orders/<annee>/`), avec manifeste + hash SHA-256 par fichier
- [ ] Route admin `GET /archives/manifests` : liste des archives générées
- [ ] Ne **jamais** supprimer de la base chaude — l'archive est une copie de conformité
- [ ] Test : génération d'archive sur jeu de données de test, manifeste cohérent

**✅ Validation :** téléphone chiffré en base mais lisible via API ; impersonation tracée ; archive annuelle générée et vérifiable.

---

## Phase F2 — Checkout : panier + zones de livraison · 3-3,5 j

### 2.1 Panier persistant
- [ ] Entités `Cart` (userId unique) + `CartItem` (cartId, variantId, quantity, `priceAtAdd`, `addedAt`) + migration
- [ ] Routes : `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`, `DELETE /cart` (authenticate)
- [ ] Vérification stock à la lecture (`GET /cart` renvoie `issues: [{itemId, reason: 'out_of_stock'|'price_changed'}]` en comparant `priceAtAdd` vs prix courant — la spec l'exige)
- [ ] Fusion panier invité : le front envoie un panier anonyme (header `X-Cart-Token` UUID stocké en Redis) → `POST /cart/merge` à la connexion fusionne sans doublons de variante
- [ ] Conversion : `POST /orders` accepte optionnellement `fromCart: true` → vide le panier après création réussie
- [ ] Test : ajout, conflit de stock signalé, changement de prix signalé, fusion invité, vidage après commande

### 2.2 Zones de livraison & frais
- [ ] Entité `ShippingZone` (orgId vendeur, nom, `zoneType: 'city'|'national'|'international'`, tarif fixe OU tarif/kg, seuil livraison gratuite, délai estimé jours, `isExpress` bool avec surcoût) + migration
- [ ] CRUD vendeur `GET/POST/PATCH/DELETE /shipping/zones` (seller/org_admin, scoped à son org)
- [ ] Calcul dans `OrdersService.create` : remplacer `shippingCost: 0` en dur (`src/modules/orders/index.ts:200`) — le checkout envoie `shippingZoneId` (+ `isExpress`) ; frais = base ou base×poids total ; 0 si total ≥ seuil gratuit
- [ ] `GET /shipping/zones/quote?sellerOrgId=&weightKg=&orderValue=` : endpoint public de simulation pour le front
- [ ] Default safe : si le vendeur n'a défini aucune zone, `shippingCost = 0` + flag `shippingEstimated: true` dans la réponse (comportement actuel préservé)
- [ ] Test : calcul fixe, calcul au kg, seuil gratuit atteint/pas atteint, express, fallback 0

**✅ Validation :** panier complet persisté entre sessions avec alertes stock/prix ; une commande est créée avec les vrais frais de port.

---

## Phase F3 — Logistique : traçabilité stock + QR · 3-3,5 j

### 3.1 Table StockMovement (audit avant/après)
- [ ] Entité `StockMovement` (stockLevelId, variantId, warehouseId, `reason: purchase|sale|return|damage|correction|transfer_in|transfer_out|inventory`, qtyDelta, qtyBefore, qtyAfter, userId, orderId nullable, note) + migration + index sur (variantId, createdAt)
- [ ] Écrire un mouvement dans **chaque** point de mutation du stock : réception PO (existe `purchase-orders`), vente/réservation à la création de commande, libération à l'annulation (2 endroits : `orders/index.ts` + worker `jobs/index.ts` — factoriser dans un `stockService.applyDelta` unique), transfert inter-entrepôts, ajustement d'inventaire, retour produit
- [ ] Écrire les mouvements **dans la même transaction** que la mutation (sinon pas d'audit fiable)
- [ ] Routes : `GET /stock/movements` (filtres variante/entrepôt/période/raison, paginé) + export CSV (réutiliser le pattern `exports`)
- [ ] Test : création commande → mouvement `sale` avec before/after corrects ; annulation → `return` symétrique ; transfert → 2 mouvements liés

### 3.2 QR Click & Collect
- [ ] Dép `qrcode` ; à la mise en statut « prête » (C&C) : générer un code de retrait court (6-8 chars, `generateOTP` existe) stocké sur l'Order/Shipment + PNG QR via `GET /orders/:id/pickup-qr` (acheteur uniquement)
- [ ] `POST /orders/:id/pickup/validate` (seller/logistics du vendeur) : vérifie le code, passe la commande `delivered`, log l'agent
- [ ] Test : génération, validation OK, code invalide rejeté, double validation rejetée

### 3.3 Scan picking
- [ ] `POST /picking/:id/scan` (logistics) : body `{ sku|barcode, quantity }` — confirme les lignes une à une ; statut de la picklist passe `partial` si des articles manquent (le flux existant bascule déjà vers expédition partielle)
- [ ] Le scan accepte `variantSku` ou `product.oemReference` (les codes scannés par l'app mobile)
- [ ] Test : scan complet → picklist `ready`, scan partiel → `partial`

**✅ Validation :** chaque mouvement de stock a une trace before/after consultable ; un retrait C&C se fait par QR ; une picklist se scanne.

---

## Phase F4 — Confiance vendeurs : KYB + score · 3-3,5 j

### 4.1 KYB (Know Your Business)
- [ ] Entité `OrgDocument` (orgId, `type: rccm|patente|statuts|id_card`, fileUrl, uploadedBy, `status: pending|approved|rejected`, reviewedBy, reviewedAt, rejectionReason) + migration
- [ ] Upload : `POST /organizations/:id/documents` (org_admin, multipart PDF/images, réutiliser le pattern uploads local/Cloudinary) — stocker hors dossier public
- [ ] File admin : `GET /admin/kyb/pending` + `POST /admin/kyb/:documentId/decide` (super_admin) → approve → `org.isVerified = true` + badge, reject → motif + email
- [ ] Emails : validation (félicitations) / rejet (motif) — brancher sur E1
- [ ] Test : upload, file admin, approve → org vérifiée, reject → email avec motif

### 4.2 Score de performance vendeur + badge dynamique
- [ ] Colonnes sur `Organization` : `performanceScore decimal`, `performanceComputedAt` + migration
- [ ] Job quotidien : pour chaque org vendeuse, calculer — taux de livraison à temps (shipments delivered vs promised), taux d'annulation, note moyenne des avis produits de son stock, délai moyen de confirmation — score 0-100 pondéré
- [ ] Badge dérivé du score : `platinum ≥ 90`, `gold ≥ 75`, `silver ≥ 60`, sinon aucun ; exposé dans `GET /organizations/:id` et sur les produits (`sellerBadge`) pour le front
- [ ] Retrait automatique du badge si le score passe sous le seuil (la spec l'exige)
- [ ] Test : org avec bonnes métriques → badge, dégradation → badge retiré

**✅ Validation :** une org peut uploader son RCCM, être vérifiée par l'admin, et son badge évolue avec ses performances.

---

## Phase F5 — Engagement : notifications manquantes · 3,5-4 j

### 5.1 Relance messagerie 24 h
- [ ] Job horaire : messages `Message` sans réponse du destinataire > 24 h → notification + email de relance (une seule fois, flag `reminderSentAt`)
- [ ] Colonne `reminderSentAt` sur `Message` + migration

### 5.2 Stats newsletter (ouverture/clic)
- [ ] Entité `Campaign` (subject, body/HTML, segment, status, sentAt) persistée par `NewsletterService.send` (actuellement tout part en queue sans trace) + `CampaignRecipient` (campaignId, userId, email, token unique, openedAt, clickedAt) + migration
- [ ] Pixel d'ouverture : `GET /campaigns/track/open/:recipientToken` (public, image 1×1) — injecté dans le HTML envoyé
- [ ] Clic : `GET /campaigns/track/click/:recipientToken?url=...` (public, redirect 302 après enregistrement, whitelist de domaine)
- [ ] `GET /campaigns/:id/stats` (super_admin) : envoyés, taux d'ouverture, taux de clic
- [ ] Désinscription 1 clic (RGPD) : `GET /campaigns/unsubscribe/:recipientToken` → `smsOptOut`/`marketingOptOut` sur User + page de confirmation

### 5.3 Opt-out SMS
- [ ] Colonne `smsOptOut` sur `User` + route `PATCH /users/me/notification-prefs` (sms, email, push)
- [ ] Vérifier l'opt-out **dans** `src/shared/utils/sms.ts` (point de passage unique) — sauf OTP de sécurité qui reste toujours envoyé
- [ ] Test : opt-out → plus de SMS marketing mais OTP 2FA toujours délivré

### 5.4 Alertes wishlist
- [ ] Colonnes sur l'item wishlist : `priceAtAdd`, `wasInStockAtAdd` + migration
- [ ] Job quotidien : pour chaque item, comparer prix courant (< priceAtAdd × 0.95 = baisse) et retour en stock → notification push/in-app/email (utiliser `notifyUser` E2), puis mettre à jour le snapshot pour ne pas re-notifier
- [ ] Test : baisse de prix → 1 notification, pas de re-notification au run suivant

### 5.5 Alerte fin de contrat de prix (30 j avant)
- [ ] Job quotidien : `PriceContract` avec `endsAt` dans ≤ 30 j → email + notification aux org_admin des deux parties (une seule fois, flag `expiryNotifiedAt` sur le contrat) + migration
- [ ] Test : contrat finissant dans 20 j → notifié une fois

**✅ Validation :** relance auto constatée ; stats campagne affichées ; opt-out SMS respecté ; alertes wishlist et fin de contrat émises une seule fois.

---

## Phase F6 — IA & data : réconciliation, forecasting, vision · 4,5-6 j

### 6.1 Réconciliation MoMo
- [ ] Entité `MomoStatement` (provider, période, importedBy, fileUrl, totals jsonb) + `MomoStatementLine` (statementId, referenceId, amount, status, ts, `matchedPaymentId` nullable) + migration
- [ ] Import CSV : `POST /payments/reconciliation/import` (accountant, multipart) — format statement MTN (colonnes externalId/financialTransactionId/status/amount) mappées via Papa Parse (déjà installé)
- [ ] Matching automatique par `gatewayRef` puis `gatewayResponse.financialTransactionId` → statut : `matched` / `missing_in_platform` (paiement chez l'opérateur, absent chez nous) / `missing_at_operator` (l'inverse) / `amount_mismatch`
- [ ] `GET /payments/reconciliation/:statementId` : rapport des écarts ; `POST /payments/reconciliation/lines/:id/resolve` (comptable : force complete ou ignore avec note)
- [ ] Test : statement de 5 lignes dont 2 écarts → matching correct, rapport exploitable

### 6.2 Prévisions stock / forecasting
- [ ] Job hebdomadaire : ventes passées (OrderLine × 180 j) par variante → moyenne mobile 30 j + facteur saisonnier simple (mois vs moyenne), prévision 30/60/90 j
- [ ] Entité `StockForecast` (variantId, orgId, horizonDays, forecastQty, recommendedReorderQty, computedAt, method: 'moving_average') + migration — réappro = forecast − stock dispo + reorderPoint, plancher 0
- [ ] `GET /stock/forecasts?orgId=` (seller) : prévisions + recommandations + produits en rupture prévue (forecast > dispo dans l'horizon)
- [ ] Honnêteté méthodo : rester sur moving average (pas de ML lourd) ; la colonne `method` permettra de brancher un modèle plus tard
- [ ] Test : historique de ventes constant → forecast ≈ moyenne, réappro cohérente

### 6.3 Recherche par image (AI vision)
- [ ] `POST /search/by-image` (buyer, multipart 1 image, rate-limité) : envoyer à une API vision (provider abstrait derrière `VISION_API_KEY`/`VISION_API_URL` en env — ex. Groq vision ou autre) avec un prompt « identifie cette pièce automobile : catégorie probable, référence visible »
- [ ] Parser la réponse → requête full-text existante (SearchService.search) sur catégorie + termes extraits ; renvoyer produits + `confidence` + `extractedTerms`
- [ ] Fallback si l'API échoue/non configurée : 422 avec message clair invitant à la recherche textuelle (la spec l'exige)
- [ ] Limiter : 5 Mo, JPEG/PNG/WebP, 10 req/h/user
- [ ] Test (mocké) : image → termes extraits → produits pertinents ; API down → 422 propre

**✅ Validation :** un statement CSV importé révèle les écarts ; des prévisions de réappro sont générées et consultables ; une photo de pièce renvoie des produits similaires.

---

## Vue d'ensemble

| Phase | Contenu | Effort | État |
|-------|---------|--------|------|
| F1 | Chiffrement AES téléphones, impersonation, archivage 10 ans | 2 j | ✅ Fait |
| F2 | Panier persistant + zones de livraison/frais | 3-3,5 j | ✅ Fait |
| F3 | StockMovement (audit) + QR Click&Collect + scan picking | 3-3,5 j | ✅ Fait |
| F4 | KYB (documents + revue admin) + score/badge vendeur | 3-3,5 j | ✅ Fait |
| F5 | Relance 24 h, stats newsletter, opt-out SMS, alertes wishlist, fin de contrat | 3,5-4 j | ✅ Fait |
| F6 | Réconciliation MoMo, forecasting stock, recherche par image | 4,5-6 j | ✅ Fait |

## Récapitulatif de l'implémentation (2026-09-17)

**F1 — Sécurité** : `users.phone_enc` (AES-256-GCM via les helpers existants) + `phone_hash` SHA-256 pour la recherche (`shared/utils/phone.ts`) ; register/updateProfile/anonymize passent par `phoneFields()`, l'API expose `phone` déchiffré sans jamais fuiter `phoneEnc/phoneHash` ; script one-shot `scripts/encrypt-phones.ts`. Impersonation : `POST /users/:id/impersonate` (super_admin, cible super_admin interdite) — token 15 min avec claim `impersonatorId` propagé par `authenticate`, **entrée AuditLog obligatoire**. Archivage légal : `shared/utils/archive.ts` (export annuel JSON + manifeste SHA-256, cron mensuel).

**F2 — Checkout** : entités `Cart`/`CartItem` + module `cart` (CRUD, alertes stock/prix à la lecture via `issues`, fusion panier invité par `X-Cart-Token` Redis). Entité `ShippingZone` + module `shipping` (CRUD vendeur, cotation publique `/shipping/quote`) ; `OrdersService.create` calcule les frais réels (fixe + tarif×poids + express, seuil gratuit) — **fallback `shippingCost = 0` si aucune zone configurée**.

**F3 — Logistique** : entité `StockMovement` + `recordStockMovement()` appelé **dans la transaction** de chaque mutation : réservation et libération (orders + worker), transfert (2 mouvements liés), ajustement, réception PO (`purchase`) ; routes `GET /stock/movements` filtrables. QR Click&Collect : `pickup_code` unique sur Shipment, `GET /shipments/pickup/:orderId/qr` (PNG qrcode, acheteur), `POST /shipments/pickup/:orderId/validate` (vendeur → commande livrée + audit). Scan picking : `POST /picking/:id/scan` (SKU/UUID, garde-fous de dépassement, complétion auto).

**F4 — Confiance** : KYB complet (`OrgDocument`, upload PDF/images en stockage **privé** `private_uploads/kyb`, file `GET /organizations/kyb/pending`, téléchargement sécurisé super_admin, décision approve→`isVerified`+email / reject→motif+email). Score vendeur : formule pure testable (`shared/utils/seller-score.ts` : base 100, −50×annulations, −30×non-livraison, ±20 note) recalculée quotidiennement, badge platinum/gold/silver exposé sur `GET /organizations/:id`.

**F5 — Engagement** : relance 24 h (cron horaire, `reminder_sent_at` anti-double, notification+push). Newsletter réécrite : campagnes **persistées** (`Campaign`/`CampaignRecipient`), envoi via la queue email (l'ancienne queue `newsletter` n'avait **aucun worker** — bug corrigé), HTML par destinataire avec pixel d'ouverture + liens trackés (anti open-redirect) + désinscription 1 clic (RGPD, `marketingOptOut`), stats `GET /newsletter/campaigns/:id/stats`. Opt-out SMS : `PATCH /users/me/notification-prefs` + `smsUserService.sendToUser` (l'OTP critique contourne l'opt-out). Alertes wishlist quotidiennes (baisse > 5 % ou retour en stock, snapshot mis à jour anti re-notification). Alerte fin de contrat 30 j avant (une seule fois, emails aux org_admins des deux parties).

**F6 — Data** : réconciliation MoMo (`POST /payments/reconciliation/import` CSV avec mapping d'en-têtes tolérant, matching gatewayRef→financialTransactionId, statuts matched/amount_mismatch/missing_in_platform + détection missing_at_operator, rapport + résolution comptable) ; logique pure dans `payments/reconciliation.ts`. Forecasting : `computeForecast()` pure (moyenne mobile pondérée 70/30 + tendance bornée [0.5, 2]), cron hebdo → `StockForecast`, lecture `GET /stock/forecasts`. Recherche par image : `POST /search/by-image` (API vision OpenAI-compatible via `VISION_API_URL/KEY/MODEL`, 422 propre si non configurée, rate-limit 10/h, fallback vers recherche full-text avec les termes extraits).

### Reste manuel / externe
- [ ] `npm run db:setup` (migration 1700000005000) puis `npm run schema:drift` vide
- [ ] `npx ts-node --transpile-only -r tsconfig-paths/register scripts/encrypt-phones.ts` (si téléphones existants en clair)
- [ ] Configurer `VISION_API_URL`/`VISION_API_KEY` (ex. Groq vision) pour activer la recherche par image
- [ ] Le scoring vendeur exige ≥ 5 commandes sur 180 j avant de publier un score (évite les badges immérités)
- [ ] ⚠️ Toute rotation future d'`ENCRYPTION_KEY` exige un re-chiffrement des `phone_enc`
