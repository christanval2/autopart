# AutoParts Marketplace — Backend API

API REST pour la marketplace B2B/B2C de pièces automobiles.

## Stack

- **Runtime** : Node.js 20 + TypeScript 5
- **Framework** : Express 4
- **ORM** : TypeORM 0.3 + PostgreSQL 16
- **Validation** : Zod 3
- **Cache / Sessions** : Redis 7
- **File de jobs** : BullMQ 5
- **Temps réel** : Socket.io 4
- **Paiement** : MTN MoMo + Orange Money

## Démarrage rapide

```bash
# 1. Copier les variables d'environnement
cp .env.example .env   # puis remplir les secrets

# 2. Lancer l'infrastructure (PostgreSQL + Redis)
docker-compose up -d postgres redis

# 3. Installer les dépendances
npm install

# 4. Créer le schéma via les migrations puis peupler la base
npm run db:setup

# 5. Lancer en développement (hot-reload)
npm run dev
```

> ⚠️ `synchronize` est désactivé : toute évolution des entités doit passer
> par `npm run migration:generate -- --name=NomMigration`. Pour vérifier
> l'écart entre les entités et la base : `npm run schema:drift`.

## Docker complet

```bash
docker-compose up -d
# API : http://localhost:3000
# Adminer : http://localhost:8080
# BullBoard : http://localhost:3001
```

## Scripts disponibles

| Commande | Description |
|---|---|
| `npm run dev` | Développement avec hot-reload |
| `npm run build` | Compilation TypeScript |
| `npm start` | Production |
| `npm test` | Tests Jest |
| `npm run migration:generate -- --name=NomMigration` | Générer une migration |
| `npm run migration:run` | Appliquer les migrations |
| `npm run migration:revert` | Annuler la dernière migration |
| `npm run schema:drift` | Afficher l'écart entités ↔ base (DDL en attente) |
| `npm run db:setup` | Migrations + seed |

## Structure

```
src/
├── config/         # env, database, redis
├── entities/       # 20 entités TypeORM
├── modules/        # 9 modules (auth, products, orders, payments, stock…)
├── middlewares/    # validate, authenticate, authorize, errorHandler…
├── shared/         # types, utils (response, helpers, logger)
├── jobs/           # Workers BullMQ (email, stock, invoice, notif)
├── app.ts          # Configuration Express
└── server.ts       # Bootstrap + HTTP + WebSocket + graceful shutdown
```

## Variables d'environnement requises

Voir `.env.example` pour la liste complète.

Variables obligatoires :
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET` (min. 32 caractères)
- `JWT_REFRESH_SECRET` (min. 32 caractères)
- `ENCRYPTION_KEY` (exactement 32 caractères)

## API Endpoints

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET  /api/v1/auth/me`

### Products
- `GET    /api/v1/products` — liste avec filtres (search, category, brand, make/model/year)
- `GET    /api/v1/products/:id`
- `POST   /api/v1/products` — créer (org_admin)
- `PATCH  /api/v1/products/:id`
- `POST   /api/v1/products/:id/variants`
- `POST   /api/v1/products/:id/compatibilities`
- `POST   /api/v1/products/bulk-import`

### Orders
- `GET    /api/v1/orders`
- `POST   /api/v1/orders` — créer avec réservation stock atomique
- `GET    /api/v1/orders/stats`
- `PATCH  /api/v1/orders/:id/status`
- `POST   /api/v1/orders/:id/confirm`

### Payments
- `POST   /api/v1/payments` — initier (MoMo, Orange, virement…)
- `GET    /api/v1/payments/:id/status`
- `POST   /api/v1/payments/:id/confirm` — confirmation manuelle
- `POST   /api/v1/payments/webhook/mtn`
- `POST   /api/v1/payments/webhook/orange`

### Stock
- `GET    /api/v1/stock` — niveaux par entrepôt
- `GET    /api/v1/stock/alerts` — produits sous le seuil
- `POST   /api/v1/stock/set`
- `POST   /api/v1/stock/adjust`
- `POST   /api/v1/stock/transfer`
- `POST   /api/v1/stock/warehouses`

### Search
- `GET    /api/v1/search?q=...`
- `GET    /api/v1/search/vehicle?make=Toyota&model=Hilux&year=2019`
- `GET    /api/v1/search/autocomplete?q=...`
- `GET    /api/v1/search/vehicle/makes`
- `GET    /api/v1/search/vehicle/models/:make`

### Catalogs, Organizations, Notifications
- Voir `/src/modules/` pour le détail de chaque module.

## Sécurité

- JWT dual-token (access 15min + refresh 30j avec rotation)
- Bcrypt 12 rounds
- Rate limiting Redis (300 req/15min global, 10/15min sur /auth)
- RBAC granulaire (6 rôles)
- Blacklist des tokens révoqués en Redis
- Chiffrement AES-256-GCM des données sensibles
- Headers sécurité (Helmet)

## Paiements Mobile Money

### MTN MoMo
Configurer `MOMO_API_URL`, `MOMO_API_KEY`, `MOMO_SUBSCRIPTION_KEY`.
En développement, utiliser le sandbox : `https://sandbox.momodeveloper.mtn.com`

### Orange Money
Configurer `ORANGE_API_URL`, `ORANGE_API_TOKEN`.

## Licence

MIT

netstat -ano | findstr ":3000"
taskkill /PID <PID> /F


admin@test.cm / Test1234! → 200 super_admin
seller@test.cm / Test1234! → 200 org_admin + seller
buyer@test.cm / Test1234! → 200 buyer
admin@autoparts.cm / Admin1234! → 200 super_admin
