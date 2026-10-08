# Roadmap Features — combler les fonctionnalités partielles

> **État : Phases E1 à E6 IMPLÉMENTÉES le 2026-09-17.**
> Validation : `tsc` 0 erreur · ESLint 0 erreur · `npm run build` OK · Jest **5 suites / 35 tests verts** (sentinelle incluse).
> Migration unique à appliquer : `1700000004000-RoadmapFeatures.ts` → `npm run db:setup`.

---

## Phase E1 — Emails transactionnels 🔴 (DÉBLOQUANT) · 2 j

**Pourquoi en premier :** l'OTP d'inscription est stocké en Redis mais jamais
délivré → personne ne peut activer son compte en prod. Et les phases E4 (instructions
virement), E6 (invitation membres, alertes prix) dépendent toutes de l'envoi d'emails.

**Constat :** worker + queue BullMQ complets (`src/jobs/index.ts`), mais tous les
`emailQueue.add` sont commentés. De plus l'appel commenté
`emailQueue.add('verify-email', { userId, email, otp })` ne correspond pas au
contrat du worker (`EmailJobData = { to, subject, template, context }`).

- [ ] Aligner le contrat : corriger les payloads sur `EmailJobData` (`to`, `subject`, `template`, `context`)
- [ ] Brancher `register` → email `verify-email` avec l'OTP (`src/modules/auth/index.ts:125`)
- [ ] Brancher `forgotPassword` → email `password-reset` avec le lien/token (`:203`)
- [ ] Brancher la confirmation de commande → email `order-confirmed` après paiement confirmé (`src/modules/payments/index.ts`)
- [ ] Brancher l'expédition → email avec numéro de suivi (`src/modules/shipments/index.ts`)
- [ ] Brancher la facture → email `invoice` avec PDF en pièce jointe (worker déjà prévu)
- [ ] Smoke test : script `scripts/smoke-email.ts` (envoi réel en dev avec MailHog/Mailtrap si possible)
- [ ] Test unitaire : mock de la queue, assertion qu'un job est ajouté à chaque événement

**✅ Validation :** inscription en dev → OTP reçu par email ; reset password → email reçu ; commande payée → email de confirmation.

---

## Phase E2 — Push mobile · 1 j

- [ ] Ajouter la colonne `expoPushToken` (nullable, unique) à l'entité `User` + migration
- [ ] Route `POST /notifications/push-token` (authenticate) : enregistre/renouvelle le token ; `DELETE` pour le retirer (opt-out)
- [ ] Supprimer les casts `as any` dans `src/modules/push-notifications/index.ts:20-21`
- [ ] Brancher `notifyUser()` sur : changement de statut commande, paiement reçu, expédition (utiliser `PushTemplates` existant)
- [ ] Test unitaire : enregistrement de token + notification envoyée (fetch vers Expo mocké)

**✅ Validation :** cycle token → événement commande → appel Expo (mocké en test, réel avec l'app Expo).

---

## Phase E3 — Commandes B2B : crédit, seuils, timeout · 3 j

### 3.1 Limite de crédit appliquée
- [ ] Calcul de l'encours : somme des commandes `credit` non réglées par org (query de dédoublonnage avec les remboursements) — ou colonne `outstandingBalance` maintenue sur `Organization` (plus simple à lire, à mettre à jour dans une transaction)
- [ ] Dans `OrdersService.create` (`src/modules/orders/index.ts`) : si `method=credit` → vérifier `creditLimit - encours >= totalAmount`, sinon 402/403 avec message explicite
- [ ] Déduire l'encours à la création, le libérer à l'annulation/au remboursement, l'apurer au paiement
- [ ] Alerte à 80 % de la limite (notification + email org_admin)
- [ ] Tests : commande refusée au-delà de la limite, acceptée en-dessous, encours recalculé après annulation

### 3.2 Seuil d'approbation configurable
- [ ] Champ `approvalThreshold` sur `Organization` (nullable = pas d'approbation) + migration
- [ ] Dans `create` : si total > seuil → statut `pending_approval` + `OrderApproval` créée + notification manager
- [ ] Route `GET /organizations/:id/approvals/pending` déjà présente — vérifier l'intégration

### 3.3 Timeout d'approbation 48 h
- [ ] Job BullMQ retardé (`delay: 48h`) à la création d'une approbation → si toujours `pending`, annuler la commande + libérer le stock (réutiliser la logique d'annulation existante)
- [ ] Annuler le job si approbée/refusée avant (job ID stocké dans l'entité ou clé Redis)

**✅ Validation :** scénario complet — commande à crédit > seuil → approbation manager → sinon annulation auto à 48 h (job testé avec delay court).

---

## Phase E4 — Paiements : virement, remboursements, wallet · 3-4 j

### 4.1 Virement bancaire
- [ ] À l'initiation `method=bank_transfer` : générer une référence de paiement (`PAY-XXXX`), envoyer l'email d'instructions (RIB, référence, montant) — dépend de E1
- [ ] Statut `pending` avec expiration configurable (job retardé → annulation commande si non confirmé, ex. 72 h)
- [ ] Confirmation comptable : restreindre `POST /payments/:id/confirm` à `accountant`/`super_admin` + champ `proof` optionnel (référence d'avis de crédit)
- [ ] Vue comptable : `GET /payments/pending` (rôle accountant) + export CSV existant

### 4.2 Remboursements
- [ ] `POST /payments/:id/refund` (authorize seller/org_admin/super_admin) : montant total ou partiel
  - MoMo : appeler l'API de transfert/remboursement MTN (endpoint refund/transfer du contrat Collection — à confirmer avec le compte marchand)
  - Virement : remboursement manuel → statut `refund_pending` + preuve à uploader par le comptable
  - Avoir : crédit du wallet via `WalletService.credit` (rôle accountant déjà en place)
- [ ] Entité `Refund` (paymentId, montant, méthode, statut, preuve) + migration
- [ ] À la validation du remboursement : commande → `refunded` (déjà dans la machine à états), stock re-ajusté si retour produit lié (lien avec module returns existant)
- [ ] Tests : remboursement partiel/total, échec API MoMo géré, avoir wallet crédité

### 4.3 Recharge wallet autonome
- [ ] `POST /wallet/recharge` : initie un paiement MoMo du montant → à la réception du webhook, créditer le wallet (idempotence via référence)
- [ ] `POST /wallet/withdraw` : demande de retrait vers numéro MoMo (statut pending → validé par accountant)
- [ ] Tests : webhook crédite une seule fois (idempotence), solde cohérent

**✅ Validation :** virement confirmé par comptable → commande payée ; remboursement MoMo simulé ; recharge wallet par webhook.

---

## Phase E5 — Catalogue : import CSV + images multi-tailles · 2-3 j

### 5.1 Import CSV/Excel serveur
- [ ] Dépendance `papaparse` (+ `xlsx` si Excel exigé — sinon CSV only, plus léger)
- [ ] `POST /products/import` (multipart, seller/org_admin) : parse le CSV, valide **ligne par ligne** avec les schémas Zod existants
- [ ] Traitement par batch de 50 en transaction ; compatibilités acceptées dans le même fichier
- [ ] Réponse = rapport : `{ created, updated, errors: [{ line, field, message }] }`
- [ ] `GET /products/import/template` : renvoie le CSV template avec ligne d'exemple
- [ ] Test : fichier avec 2 lignes valides + 1 invalide → 2 insérées, erreur rapportée à la bonne ligne, transaction non avortée

### 5.2 Images multi-tailles
- [ ] Réintégrer `sharp` (retirée lors du nettoyage car inutilisée)
- [ ] Dans `toCloudinary`/`toLocalFile` : générer 3 buffers (thumb 150, medium 600, large 1200, format webp) et uploader chacun
- [ ] Colonne `sizes jsonb` sur `ProductImage` (`{thumb, medium, large}`) + migration ; `url` garde la large pour compatibilité
- [ ] Ordonnancement : colonne `position int` + `PATCH /uploads/images/:id/position` (drag & drop côté front)
- [ ] Test : upload d'un buffer PNG → 3 tailles enregistrées

**✅ Validation :** import CSV de 10 produits avec erreurs → rapport exact ; image uploadée → 3 variantes servies.

---

## Phase E6 — Confiance & finitions · 3-4 j

### 6.1 Avis produits
- [ ] Badge achat vérifié : dans `ReviewsService.create`, vérifier une commande `delivered` contenant le produit pour ce user → `verifiedPurchase boolean` + migration
- [ ] Réponse vendeur : colonne `sellerReply` + `sellerRepliedAt` ; route `POST /reviews/:id/reply` (seller/org_admin de l'org vendeuse)
- [ ] Modération : colonne `status` (`pending`/`approved`/`rejected`) + file `GET /admin/reviews/pending`, actions approve/reject avec motif ; avis publics = `approved` seulement (ou tout sauf rejected si modération a posteriori — à décider)
- [ ] Tests : avis sans achat → pas de badge ; réponse vendeur ; rejet masque l'avis

### 6.2 Invitation membres organisation
- [ ] Entité `OrgInvitation` (orgId, email, role, token, expiresAt, status) + migration
- [ ] `POST /organizations/:id/invitations` : envoie l'email d'invitation (E1), limite de membres par tier vérifiée
- [ ] `POST /organizations/invitations/:token/accept` : lie l'utilisateur existant ou crée le compte, assigne org + role
- [ ] `DELETE /organizations/:id/members/:userId` (existant à compléter : révocation immédiate + invalidation refresh tokens)

### 6.3 Multi-devises
- [ ] Job quotidien BullMQ : taux XAF/USD/EUR via API (ex. exchangerate.host), cache Redis `fx:rates`
- [ ] Helper `convert(amount, from, to)` utilisé aux endpoints de lecture prix ; **commandes et paiements restent en XAF** (réglementation BEAC) avec affichage converti indicatif
- [ ] `GET /payments/rates` public pour le front

### 6.4 RGPD
- [ ] `GET /users/me/export` : export JSON/CSV de toutes les données liées (profil, adresses, commandes, avis) — stream pour éviter l'explosion mémoire
- [ ] `ConsentLog` (userId, type, version CGV, IP, date) écrit à l'inscription et à chaque mise à jour CGV
- [ ] Purge des `AuditLog` > 90 jours (job mensuel)

### 6.5 TVA configurable
- [ ] Entité `TaxConfig` (pays/région, taux, exemptions catégories B2B) + migration + routes admin
- [ ] Remplacer les `TVA = 0.1925` codés en dur (`invoices/index.ts:8`, calculs orders/payments) par la config, avec seed Cameroun 19,25 %

### 6.6 Analytics funnel
- [ ] Entité `ProductEvent` (productId, userId, type view/cart/purchase, ts) + migration
- [ ] `POST /analytics/track` (public, rate-limité) + hooks internes (view produit, ajout panier front → cart, commande → purchase)
- [ ] `GET /analytics/products/funnel` : vues → paniers → commandes par produit, produits 0 vente 90 j

### 6.7 Facettes complètes
- [ ] Dans `search` : retourner `facets: { categories: [{id, name, count}], brands: [...], priceRange }` via GROUP BY sur le résultat filtré
- [ ] Cache Redis 60 s des facettes

**✅ Validation :** avis avec badge + réponse vendeur ; invitation acceptée ; taux du jour servis ; export RGPD téléchargeable ; TVA modifiable sans redéploiement ; funnel affiché ; facettes avec compteurs.

---

## Vue d'ensemble

| Phase | Contenu | Effort | État |
|-------|---------|--------|------|
| E1 | Emails transactionnels (déblocage OTP) | 2 j | ✅ Fait |
| E2 | Push mobile (colonne + route + branchement) | 1 j | ✅ Fait |
| E3 | Crédit B2B + seuil + timeout approbation | 3 j | ✅ Fait |
| E4 | Virement + remboursements + recharge wallet | 3-4 j | ✅ Fait |
| E5 | Import CSV + images multi-tailles | 2-3 j | ✅ Fait |
| E6 | Avis, invitations, devises, RGPD, TVA, funnel, facettes | 3-4 j | ✅ Fait |

## Récapitulatif de l'implémentation (2026-09-17)

**E1 — Emails** : `src/jobs/queues.ts` (queues BullMQ lazy, plus aucun socket ouvert à l'import) + workers dans `src/jobs/index.ts`. Templates ajoutés : `order-shipped`, `bank-transfer-instructions`, `invitation`. Branché sur : OTP d'inscription, reset password, paiement confirmé (webhook + polling + confirm manuel), expédition, facture par email, alerte stock aux org_admins (l'email hardcoded `admin@org.cm` est supprimé).

**E2 — Push mobile** : colonne `users.expo_push_token` + routes `POST/DELETE /notifications/push-token` + `notifyUser()` branché sur les transitions de commande + in-app via `Jobs.notify`. Casts `as any` supprimés du helper Expo.

**E3 — B2B** : vérification `creditLimit` à la création de commande (encours calculé, alerte 80 %), `organizations.approval_threshold` → `OrderApproval` automatique au-delà du seuil + worker `orders` qui annule la commande et libère le stock après 48 h sans décision. Worker `payments` qui expire les virements non confirmés à 72 h.

**E4 — Paiements** : instructions de virement par email (vars `BANK_NAME`/`BANK_RIB`) + expiration 72 h ; `POST /payments/:id/refund` (momo via API Disbursement avec bascule `pending_manual`, bank_transfer manuel, wallet = avoir immédiat) + `POST /payments/refunds/:id/complete` (comptable + preuve) ; `POST /payments/wallet/recharge` (MoMo, créditée au webhook de façon idempotente) ; `POST /wallet/withdraw` (débit immédiat anti double-dépense) + décision comptable `POST /payments/wallet/withdrawals/:id/decision`. Entités `Refund`, `WalletRecharge`, `WalletWithdrawal`.

**E5 — Catalogue** : `POST /products/import` (multipart CSV, Papa Parse, validation Zod ligne par ligne avec numéro de ligne dans le rapport, upsert par SKU, batchs de 50) + `GET /products/import/template`. Images : sharp génère thumb/medium/large en webp (Cloudinary ou local), stockées dans `product_images.sizes` jsonb, suppression des 3 tailles au delete. Déps réintégrées : `papaparse`, `sharp`.

**E6 — Finitions** :
- Avis : badge achat vérifié par détection automatique (commande livrée contenant le produit), réponse vendeur `POST /reviews/:id/reply` (vérifie l'org détentrice du stock via StockLevel→Warehouse), modération `POST /reviews/:id/moderate` (status/reason, les rejetés sont masqués du list/rating).
- Invitations : entité `OrgInvitation` (token 48 hex, 7 j) + `POST /organizations/:id/invitations` (email avec lien) + `POST /organizations/invitations/:token/accept` **avant `authenticate`** (acceptation par possession du token, avec `optionalAuthenticate` pour rattacher un compte existant).
- FX : `shared/utils/fx.ts` (API open.er-api.com, cache Redis 24 h, fallback statique) + `GET /payments/rates` public.
- RGPD : `GET /users/me/export` (profil, adresses, commandes, avis, consentements en JSON téléchargeable), `POST /users/me/consent`, consentement CGV journalisé à l'inscription, purge des `AuditLog` > 90 j dans le cron quotidien.
- TVA : entité `TaxConfig` (seed CM = 19,25 %) + `shared/utils/tax.ts` (cache Redis 1 h) + `GET/PUT /invoices/tax` — les taux en dur de orders et invoices ont été remplacés.
- Funnel : entité `ProductEvent` + `POST /analytics/track` (public view/cart, rate-limité) + `GET /analytics/products/funnel` (vues→paniers→achats, conversion, produits 0 vente 90 j) ; events `purchase` émis à la création de commande.
- Facettes : la recherche retourne `facets: { categories, brands, priceRange }` avec compteurs calculés sur le résultat filtré (cache 60 s).

### Reste manuel / externe
- [ ] Appliquer la migration : `docker-compose up -d postgres && npm run db:setup` puis `npm run schema:drift` (doit être vide)
- [ ] Révoquer/régénérer les secrets externes (cf. ROADMAP-FIXES.md Phase 1) — notamment SMTP pour que E1 fonctionne réellement
- [ ] Contrat marchand MTN : activer la souscription **Disbursement** pour les remboursements/retraits MoMo automatiques (sinon tout reste en traitement manuel comptable, ce qui est fonctionnel)
- [ ] Brancher `npm test` + `npm run lint` + `tsc --noEmit` dans la CI

Règles transverses :
- Une entité modifiée = une migration générée + `schema:drift` vide.
- Toute mutation : `authenticate` (le test sentinelle veille).
- Chaque nouvelle route critique couverte par au moins un test (objectif : garder 100 % de la suite verte).
