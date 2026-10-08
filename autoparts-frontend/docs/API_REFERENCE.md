# AutoParts API — Postman Collection

## Configuration

**Base URL:** `http://127.0.0.1:3000/api/v1`

**Health Check:** `GET http://127.0.0.1:3000/health`

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `baseUrl` | `http://127.0.0.1:3000/api/v1` | API base URL |
| `token` | *(auto-set after login)* | JWT access token |
| `refreshToken` | *(auto-set after login)* | JWT refresh token |

### Postman Pre-request Script (auto-save token)

In the Collection's **Pre-request Script** tab, add:
```javascript
// Auto-attach token to all requests
const token = pm.variables.get("token");
if (token) {
    pm.request.headers.upsert({ key: "Authorization", value: `Bearer ${token}` });
}
```

---

## 1. AUTHENTICATION

### 1.1 Register
**POST** `{{baseUrl}}/auth/register`

**Body (JSON):**
```json
{
  "email": "newuser@example.com",
  "password": "Test1234!",
  "firstName": "Jean",
  "lastName": "Dupont",
  "accountType": "individual"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "newuser@example.com", "roles": ["buyer"] },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

---

### 1.2 Login
**POST** `{{baseUrl}}/auth/login`

**Body (JSON):**
```json
{
  "email": "buyer@test.cm",
  "password": "Test1234!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { "id": "...", "email": "buyer@test.cm", "roles": ["buyer"] }
  }
}
```

**Test Script** (auto-save tokens):
```javascript
const json = pm.response.json();
pm.variables.set("token", json.data.accessToken);
pm.variables.set("refreshToken", json.data.refreshToken);
```

---

### 1.3 Refresh Token
**POST** `{{baseUrl}}/auth/refresh`

**Body (JSON):**
```json
{
  "refreshToken": "{{refreshToken}}"
}
```

---

### 1.4 Logout
**POST** `{{baseUrl}}/auth/logout`

**Headers:** `Authorization: Bearer {{token}}`

---

### 1.5 Verify Email
**POST** `{{baseUrl}}/auth/verify-email`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "token": "123456"
}
```

---

### 1.6 Forgot Password
**POST** `{{baseUrl}}/auth/forgot-password`

**Body (JSON):**
```json
{
  "email": "buyer@test.cm"
}
```

---

### 1.7 Reset Password
**POST** `{{baseUrl}}/auth/reset-password`

**Body (JSON):**
```json
{
  "token": "reset-token-from-email",
  "password": "NewPass123!"
}
```

---

### 1.8 Change Password
**PATCH** `{{baseUrl}}/auth/change-password`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "currentPassword": "Test1234!",
  "newPassword": "NewPass123!"
}
```

---

### 1.9 Get Current User
**GET** `{{baseUrl}}/auth/me`

**Headers:** `Authorization: Bearer {{token}}`

---

## 2. 2FA (TWO-FACTOR AUTH)

### 2.1 Get 2FA Status
**GET** `{{baseUrl}}/auth/2fa/status`

**Headers:** `Authorization: Bearer {{token}}`

---

### 2.2 Setup 2FA
**POST** `{{baseUrl}}/auth/2fa/setup`

**Headers:** `Authorization: Bearer {{token}}`

---

### 2.3 Enable 2FA
**POST** `{{baseUrl}}/auth/2fa/enable`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "token": "123456"
}
```

---

### 2.4 Disable 2FA
**POST** `{{baseUrl}}/auth/2fa/disable`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "token": "123456"
}
```

---

## 3. USERS

### 3.1 Get Current User Profile
**GET** `{{baseUrl}}/users/me`

**Headers:** `Authorization: Bearer {{token}}`

---

### 3.2 Update Current User Profile
**PATCH** `{{baseUrl}}/users/me`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "firstName": "Jean",
  "lastName": "Dupont",
  "phone": "+237690000000"
}
```

---

### 3.3 Delete Current User Account
**DELETE** `{{baseUrl}}/users/me`

**Headers:** `Authorization: Bearer {{token}}`

---

### 3.4 List All Users (Admin)
**GET** `{{baseUrl}}/users?page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

---

### 3.5 Get User by ID
**GET** `{{baseUrl}}/users/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`

---

### 3.6 Update User Roles
**PATCH** `{{baseUrl}}/users/:id/roles`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`

**Body (JSON):**
```json
{
  "roles": ["seller", "org_admin"]
}
```

---

### 3.7 Delete User (Admin)
**DELETE** `{{baseUrl}}/users/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

---

## 4. ORGANIZATIONS

### 4.1 List Organizations
**GET** `{{baseUrl}}/organizations?page=1&limit=20`

---

### 4.2 Get Organization by ID
**GET** `{{baseUrl}}/organizations/:id`

---

### 4.3 Create Organization
**POST** `{{baseUrl}}/organizations`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "name": "My Auto Parts Shop",
  "orgType": "seller",
  "email": "shop@example.com",
  "phone": "+237690000000"
}
```

---

### 4.4 Update Organization
**PATCH** `{{baseUrl}}/organizations/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 4.5 Verify Organization
**POST** `{{baseUrl}}/organizations/:id/verify`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

---

### 4.6 Set Credit Limit
**POST** `{{baseUrl}}/organizations/:id/credit-limit`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

**Body (JSON):**
```json
{
  "creditLimit": 5000000
}
```

---

### 4.7 Get Organization Members
**GET** `{{baseUrl}}/organizations/:id/members`

---

### 4.8 Update Member Role
**PATCH** `{{baseUrl}}/organizations/:id/members/:userId/roles`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 4.9 Assign Tier
**POST** `{{baseUrl}}/organizations/:id/assign-tier`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

---

### 4.10 List Tiers
**GET** `{{baseUrl}}/organizations/tiers/list`

---

### 4.11 Create Tier
**POST** `{{baseUrl}}/organizations/tiers`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

**Body (JSON):**
```json
{
  "name": "Gold",
  "discountPercent": 15,
  "minOrderAmount": 100000
}
```

---

## 5. PRODUCTS

### 5.1 List Products
**GET** `{{baseUrl}}/products?page=1&limit=20&make=Toyota&model=Hilux&year=2019`

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20) |
| `make` | string | Vehicle make filter |
| `model` | string | Vehicle model filter |
| `year` | number | Vehicle year filter |
| `categoryId` | string | Category UUID filter |
| `brandId` | string | Brand UUID filter |
| `minPrice` | number | Minimum price filter |
| `maxPrice` | number | Maximum price filter |
| `condition` | string | `new` / `genuine_used` / `reconditioned` |

---

### 5.2 Get Product by ID
**GET** `{{baseUrl}}/products/:id`

---

### 5.3 Create Product
**POST** `{{baseUrl}}/products`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "name": "Disque de frein Toyota Hilux",
  "sku": "SKU-BRK-001",
  "basePrice": 25000,
  "categoryId": "category-uuid",
  "brandId": "brand-uuid",
  "condition": "new",
  "description": "Disque de frein avant pour Toyota Hilux 2015-2020"
}
```

---

### 5.4 Update Product
**PATCH** `{{baseUrl}}/products/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 5.5 Delete Product
**DELETE** `{{baseUrl}}/products/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 5.6 Add Product Variant
**POST** `{{baseUrl}}/products/:id/variants`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "sku": "SKU-BRK-001-RED",
  "name": "Version Rouge",
  "priceModifier": 0,
  "stockQuantity": 50
}
```

---

### 5.7 Add Product Compatibility
**POST** `{{baseUrl}}/products/:id/compatibilities`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "make": "Toyota",
  "model": "Hilux",
  "yearStart": 2015,
  "yearEnd": 2020
}
```

---

### 5.8 Bulk Import Products
**POST** `{{baseUrl}}/products/bulk-import`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

## 6. CATALOGS

### 6.1 List Catalogs
**GET** `{{baseUrl}}/catalogs?page=1&limit=20`

---

### 6.2 Get Catalog by ID
**GET** `{{baseUrl}}/catalogs/:id`

---

### 6.3 Get Public Catalogs
**GET** `{{baseUrl}}/catalogs/public`

---

### 6.4 Get Catalog Products
**GET** `{{baseUrl}}/catalogs/:id/products`

---

### 6.5 Create Catalog
**POST** `{{baseUrl}}/catalogs`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "name": "Promo Fin d'Année",
  "description": "Catalogue promotionnel",
  "visibility": "public"
}
```

---

### 6.6 Update Catalog
**PATCH** `{{baseUrl}}/catalogs/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 6.7 Add Product to Catalog
**POST** `{{baseUrl}}/catalogs/:id/products`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "variantId": "variant-uuid",
  "discountPercent": 10
}
```

---

### 6.8 Bulk Add Products to Catalog
**POST** `{{baseUrl}}/catalogs/:id/products/bulk`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 6.9 Remove Product from Catalog
**DELETE** `{{baseUrl}}/catalogs/:id/products/:variantId`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

## 7. ORDERS

### 7.1 List Orders
**GET** `{{baseUrl}}/orders?page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

---

### 7.2 Get Order Statistics
**GET** `{{baseUrl}}/orders/stats`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`, `accountant`

---

### 7.3 Get Order by ID
**GET** `{{baseUrl}}/orders/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

### 7.4 Create Order
**POST** `{{baseUrl}}/orders`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `buyer`, `org_admin`

**Body (JSON):**
```json
{
  "sellerOrgId": "org-uuid",
  "channel": "b2c",
  "billingAddressId": "address-uuid",
  "shippingAddressId": "address-uuid",
  "lines": [
    { "variantId": "variant-uuid", "quantity": 2 }
  ],
  "currency": "XAF",
  "note": "Livraison express souhaitée"
}
```

---

### 7.5 Update Order Status
**PATCH** `{{baseUrl}}/orders/:id/status`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `seller`, `org_admin`, `super_admin`, `logistics`

**Body (JSON):**
```json
{
  "status": "confirmed"
}
```

**Valid statuses:** `draft` → `confirmed` → `processing` → `shipped` → `delivered` → `cancelled`

---

### 7.6 Confirm Order (Buyer)
**POST** `{{baseUrl}}/orders/:id/confirm`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `buyer`, `org_admin`

---

### 7.7 List Pending Approvals (B2B)
**GET** `{{baseUrl}}/orders/approvals/pending`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

---

### 7.8 Approve Order (B2B)
**POST** `{{baseUrl}}/orders/approvals/:id/approve`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "reason": "Crédit vérifié"
}
```

---

### 7.9 Reject Order (B2B)
**POST** `{{baseUrl}}/orders/approvals/:id/reject`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `org_admin`, `super_admin`

**Body (JSON):**
```json
{
  "reason": "Crédit insuffisant"
}
```

---

## 8. RECURRING ORDERS

### 8.1 List Recurring Orders
**GET** `{{baseUrl}}/orders/recurring`

**Headers:** `Authorization: Bearer {{token}}`

---

### 8.2 Create Recurring Order
**POST** `{{baseUrl}}/orders/recurring`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "sellerOrgId": "org-uuid",
  "lines": [{ "variantId": "variant-uuid", "quantity": 1 }],
  "frequency": "monthly",
  "nextRun": "2026-09-01"
}
```

---

### 8.3 Toggle Recurring Order
**PATCH** `{{baseUrl}}/orders/recurring/:id/toggle`

**Headers:** `Authorization: Bearer {{token}}`

---

### 8.4 Delete Recurring Order
**DELETE** `{{baseUrl}}/orders/recurring/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

## 9. PAYMENTS

### 9.1 Create Payment
**POST** `{{baseUrl}}/payments`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `buyer`, `org_admin`

**Body (JSON):**
```json
{
  "orderId": "order-uuid",
  "method": "mtn_momo",
  "phone": "+237690000000"
}
```

**Methods:** `mtn_momo`, `orange_money`, `bank_transfer`, `cash`, `wallet`

---

### 9.2 Get Payment Status
**GET** `{{baseUrl}}/payments/:id/status`

**Headers:** `Authorization: Bearer {{token}}`

---

### 9.3 Confirm Manual Payment
**POST** `{{baseUrl}}/payments/:id/confirm`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `accountant`, `org_admin`, `super_admin`

---

### 9.4 MTN Webhook (Public)
**POST** `{{baseUrl}}/payments/webhook/mtn`

---

### 9.5 Orange Webhook (Public)
**POST** `{{baseUrl}}/payments/webhook/orange`

---

## 10. STOCK

### 10.1 Get Stock Levels
**GET** `{{baseUrl}}/stock?warehouseId=uuid&page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

---

### 10.2 Get Stock Alerts
**GET** `{{baseUrl}}/stock/alerts`

**Headers:** `Authorization: Bearer {{token}}`

---

### 10.3 Set Stock
**POST** `{{baseUrl}}/stock/set`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "warehouseId": "warehouse-uuid",
  "variantId": "variant-uuid",
  "quantity": 100
}
```

---

### 10.4 Adjust Stock
**POST** `{{baseUrl}}/stock/adjust`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "warehouseId": "warehouse-uuid",
  "variantId": "variant-uuid",
  "delta": -5,
  "reason": "correction"
}
```

---

### 10.5 Transfer Stock
**POST** `{{baseUrl}}/stock/transfer`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "fromWarehouseId": "warehouse-uuid",
  "toWarehouseId": "warehouse-uuid",
  "variantId": "variant-uuid",
  "quantity": 10
}
```

---

### 10.6 Create Warehouse
**POST** `{{baseUrl}}/stock/warehouses`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "name": "Entrepôt Principal",
  "location": "Douala, Cameroon"
}
```

---

## 11. SEARCH

### 11.1 Search Products
**GET** `{{baseUrl}}/search?q=disque+frein&page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

---

### 11.2 Search by Vehicle
**GET** `{{baseUrl}}/search/vehicle?make=Toyota&model=Hilux&year=2019`

**Headers:** `Authorization: Bearer {{token}}`

---

### 11.3 Autocomplete
**GET** `{{baseUrl}}/search/autocomplete?q=dis`

**Headers:** `Authorization: Bearer {{token}}`

---

### 11.4 Get Vehicle Makes
**GET** `{{baseUrl}}/search/vehicle/makes`

**Headers:** `Authorization: Bearer {{token}}`

---

### 11.5 Get Vehicle Models
**GET** `{{baseUrl}}/search/vehicle/models/:make`

**Headers:** `Authorization: Bearer {{token}}`

---

### 11.6 Get Search History
**GET** `{{baseUrl}}/search/history`

**Headers:** `Authorization: Bearer {{token}}`

---

### 11.7 Clear Search History
**DELETE** `{{baseUrl}}/search/history`

**Headers:** `Authorization: Bearer {{token}}`

---

## 12. NOTIFICATIONS

### 12.1 List Notifications
**GET** `{{baseUrl}}/notifications?page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

---

### 12.2 Get Unread Count
**GET** `{{baseUrl}}/notifications/unread-count`

**Headers:** `Authorization: Bearer {{token}}`

---

### 12.3 Mark as Read
**PATCH** `{{baseUrl}}/notifications/:id/read`

**Headers:** `Authorization: Bearer {{token}}`

---

### 12.4 Mark All as Read
**PATCH** `{{baseUrl}}/notifications/read-all`

**Headers:** `Authorization: Bearer {{token}}`

---

## 13. ADDRESSES

### 13.1 List Addresses
**GET** `{{baseUrl}}/addresses`

**Headers:** `Authorization: Bearer {{token}}`

---

### 13.2 Create Address
**POST** `{{baseUrl}}/addresses`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "label": "Bureau",
  "line1": "123 Rue de la Paix",
  "city": "Douala",
  "region": "Littoral",
  "country": "CM",
  "isDefault": true
}
```

---

### 13.3 Update Address
**PATCH** `{{baseUrl}}/addresses/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

### 13.4 Delete Address
**DELETE** `{{baseUrl}}/addresses/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

## 14. REVIEWS

### 14.1 List Reviews
**GET** `{{baseUrl}}/reviews?page=1&limit=20&productId=uuid`

---

### 14.2 Get Product Rating
**GET** `{{baseUrl}}/reviews/product/:productId/rating`

---

### 14.3 Create Review
**POST** `{{baseUrl}}/reviews`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "productId": "product-uuid",
  "rating": 5,
  "comment": "Excellent produit, livraison rapide!"
}
```

---

### 14.4 Delete Review
**DELETE** `{{baseUrl}}/reviews/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

## 15. SHIPMENTS

### 15.1 Track Shipment (Public)
**GET** `{{baseUrl}}/shipments/track/:trackingNumber`

---

### 15.2 List Shipments
**GET** `{{baseUrl}}/shipments?page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `seller`, `org_admin`, `logistics`, `super_admin`

---

### 15.3 Get Shipment by ID
**GET** `{{baseUrl}}/shipments/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

### 15.4 Create Shipment
**POST** `{{baseUrl}}/shipments`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `seller`, `org_admin`, `logistics`

**Body (JSON):**
```json
{
  "orderId": "order-uuid",
  "carrier": "DHL",
  "trackingNumber": "DHL123456789"
}
```

---

### 15.5 Update Shipment
**PATCH** `{{baseUrl}}/shipments/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

### 15.6 Click & Collect
**POST** `{{baseUrl}}/shipments/click-collect`

**Headers:** `Authorization: Bearer {{token}}`

---

## 16. QUOTES

### 16.1 List My Quotes
**GET** `{{baseUrl}}/quotes`

**Headers:** `Authorization: Bearer {{token}}`

---

### 16.2 List Organization Quotes
**GET** `{{baseUrl}}/quotes/org`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `seller`, `org_admin`

---

### 16.3 Create Quote
**POST** `{{baseUrl}}/quotes`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "buyerId": "user-uuid",
  "items": [{ "variantId": "variant-uuid", "quantity": 5, "unitPrice": 20000 }],
  "validUntil": "2026-09-30"
}
```

---

### 16.4 Get Quote by ID
**GET** `{{baseUrl}}/quotes/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

### 16.5 Send Quote
**POST** `{{baseUrl}}/quotes/:id/send`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `seller`, `org_admin`

---

### 16.6 Accept Quote
**POST** `{{baseUrl}}/quotes/:id/accept`

**Headers:** `Authorization: Bearer {{token}}`

---

### 16.7 Reject Quote
**POST** `{{baseUrl}}/quotes/:id/reject`

**Headers:** `Authorization: Bearer {{token}}`

---

## 17. PROMOTIONS

### 17.1 List Promotions
**GET** `{{baseUrl}}/promotions?active=true`

---

### 17.2 Validate Promo Code
**POST** `{{baseUrl}}/promotions/validate`

**Body (JSON):**
```json
{
  "code": "PROMO20",
  "orderAmount": 50000,
  "userId": "user-uuid"
}
```

---

### 17.3 Create Promotion
**POST** `{{baseUrl}}/promotions`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`

**Body (JSON):**
```json
{
  "code": "PROMO20",
  "type": "percentage",
  "value": 20,
  "minOrderAmount": 50000,
  "expiresAt": "2026-12-31"
}
```

---

### 17.4 Toggle Promotion
**PATCH** `{{baseUrl}}/promotions/:id/toggle`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`

---

## 18. BUNDLES

### 18.1 List Bundles
**GET** `{{baseUrl}}/bundles`

---

### 18.2 Get Bundle by ID
**GET** `{{baseUrl}}/bundles/:id`

---

### 18.3 Create Bundle
**POST** `{{baseUrl}}/bundles`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`, `seller`

**Body (JSON):**
```json
{
  "name": "Kit Freinage Complet",
  "productIds": ["product-uuid-1", "product-uuid-2"],
  "discountPercent": 10
}
```

---

### 18.4 Toggle Bundle
**PATCH** `{{baseUrl}}/bundles/:id/toggle`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`

---

## 19. RETURNS

### 19.1 List Returns
**GET** `{{baseUrl}}/returns`

**Headers:** `Authorization: Bearer {{token}}`

---

### 19.2 Create Return
**POST** `{{baseUrl}}/returns`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "orderId": "order-uuid",
  "reason": "defective",
  "items": [{ "variantId": "variant-uuid", "quantity": 1 }]
}
```

---

### 19.3 Update Return
**PATCH** `{{baseUrl}}/returns/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`, `logistics`

---

## 20. DISPUTES

### 20.1 List Disputes
**GET** `{{baseUrl}}/disputes`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

---

### 20.2 Create Dispute
**POST** `{{baseUrl}}/disputes`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "orderId": "order-uuid",
  "reason": "Produit non conforme",
  "description": "La pièce reçue ne correspond pas à la commande"
}
```

---

### 20.3 Update Dispute
**PATCH** `{{baseUrl}}/disputes/:id`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`

---

## 21. COMMISSIONS

### 21.1 List Commissions
**GET** `{{baseUrl}}/commissions`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `accountant`

---

### 21.2 Get Commission Summary
**GET** `{{baseUrl}}/commissions/summary`

**Headers:** `Authorization: Bearer {{token}}`

---

### 21.3 Validate Commission
**POST** `{{baseUrl}}/commissions/:id/validate`

**Headers:** `Authorization: Bearer {{token}}`

---

### 21.4 Mark Commission as Paid
**POST** `{{baseUrl}}/commissions/:id/pay`

**Headers:** `Authorization: Bearer {{token}}`

---

## 22. PICKING

### 22.1 List Pick Lists
**GET** `{{baseUrl}}/picking?page=1&limit=20`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`, `logistics`

---

### 22.2 Create Pick List
**POST** `{{baseUrl}}/picking`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "orderId": "order-uuid",
  "warehouseId": "warehouse-uuid"
}
```

---

### 22.3 Assign Pick List
**POST** `{{baseUrl}}/picking/:id/assign`

**Headers:** `Authorization: Bearer {{token}}`

---

### 22.4 Update Pick List
**PATCH** `{{baseUrl}}/picking/:id`

**Headers:** `Authorization: Bearer {{token}}`

---

## 23. STOCK AUDITS

### 23.1 List Stock Audits
**GET** `{{baseUrl}}/stock-audits`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`, `logistics`

---

### 23.2 Create Stock Audit
**POST** `{{baseUrl}}/stock-audits`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "warehouseId": "warehouse-uuid",
  "variantIds": ["variant-uuid-1", "variant-uuid-2"]
}
```

---

### 23.3 Start Audit
**POST** `{{baseUrl}}/stock-audits/:id/start`

**Headers:** `Authorization: Bearer {{token}}`

---

### 23.4 Submit Audit Results
**POST** `{{baseUrl}}/stock-audits/:id/submit`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "results": [
    { "variantId": "variant-uuid", "counted": 95 }
  ]
}
```

---

## 24. PURCHASE ORDERS

### 24.1 List Purchase Orders
**GET** `{{baseUrl}}/purchase-orders`

**Headers:** `Authorization: Bearer {{token}}`

**Roles:** `super_admin`, `org_admin`, `logistics`

---

### 24.2 Create Purchase Order
**POST** `{{baseUrl}}/purchase-orders`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "supplierId": "org-uuid",
  "items": [{ "variantId": "variant-uuid", "quantity": 100, "unitCost": 15000 }]
}
```

---

### 24.3 Send Purchase Order
**POST** `{{baseUrl}}/purchase-orders/:id/send`

**Headers:** `Authorization: Bearer {{token}}`

---

### 24.4 Receive Purchase Order
**POST** `{{baseUrl}}/purchase-orders/:id/receive`

**Headers:** `Authorization: Bearer {{token}}`

**Body (JSON):**
```json
{
  "items": [{ "variantId": "variant-uuid", "quantity": 100 }]
}
```

---

## 25. WISHLIST

### 25.1 Get Wishlist
**GET** `{{baseUrl}}/wishlist`

**Headers:** `Authorization: Bearer {{token}}`

---

### 25.2 Add to Wishlist
**
**POST** {{baseUrl}}/wishlist

**Headers:** Authorization: Bearer {{token}}

**Body (JSON):**
`json
{
   productId: product-uuid
}
`

---

### 25.3 Remove from Wishlist
**DELETE** {{baseUrl}}/wishlist/:productId

**Headers:** Authorization: Bearer {{token}}

---

### 25.4 Check Wishlist Item
**GET** {{baseUrl}}/wishlist/check/:productId

**Headers:** Authorization: Bearer {{token}}

---

## 26. MESSAGING

### 26.1 Get Inbox
**GET** {{baseUrl}}/messages/inbox

**Headers:** Authorization: Bearer {{token}}

---

### 26.2 Get Sent Messages
**GET** {{baseUrl}}/messages/sent

**Headers:** Authorization: Bearer {{token}}

---

### 26.3 Get Unread Count
**GET** {{baseUrl}}/messages/unread-count

**Headers:** Authorization: Bearer {{token}}

---

### 26.4 Get Thread
**GET** {{baseUrl}}/messages/thread/:userId

**Headers:** Authorization: Bearer {{token}}

---

### 26.5 Send Message
**POST** {{baseUrl}}/messages

**Headers:** Authorization: Bearer {{token}}

**Body (JSON):**
`json
{
  recipientId: user-uuid,
  subject: Question sur ma commande,
  body: Bonjour quand ma commande sera-t-elle expdie?
}
`

---

### 26.6 Mark as Read
**PATCH** {{baseUrl}}/messages/:id/read

**Headers:** Authorization: Bearer {{token}}

---

## 27. LOYALTY

### 27.1 Get Balance
**GET** {{baseUrl}}/loyalty/balance

**Headers:** Authorization: Bearer {{token}}

---

### 27.2 Get History
**GET** {{baseUrl}}/loyalty/history

**Headers:** Authorization: Bearer {{token}}

---

### 27.3 Redeem Points
**POST** {{baseUrl}}/loyalty/redeem

**Headers:** Authorization: Bearer {{token}}

**Body (JSON):**
`json
{
  points: 1000
}
`

---

### 27.4 Add Bonus (Admin)
**POST** {{baseUrl}}/loyalty/bonus

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin

**Body (JSON):**
`json
{
  userId: user-uuid,
  points: 500,
  description: Bonus inscription
}
`

---

## 28. Q&A (PRODUCT QUESTIONS)

### 28.1 Get Product Q&A
**GET** {{baseUrl}}/qa/product/:productId

---

### 28.2 Ask Question
**POST** {{baseUrl}}/qa

**Headers:** Authorization: Bearer {{token}}

**Body (JSON):**
`json
{
  productId: product-uuid,
  question: Est-ce compatible avec Toyota Hilux 2018?
}
`

---

### 28.3 Answer Question
**POST** {{baseUrl}}/qa/:id/answer

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin, org_admin, seller

**Body (JSON):**
`json
{
  answer: Oui cette pice est compatible Hilux 2015-2020.
}
`

---

### 28.4 Toggle Q&A Visibility
**PATCH** {{baseUrl}}/qa/:id/toggle

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin

---

## 29. NEWSLETTER

### 29.1 Get Newsletter Stats
**GET** {{baseUrl}}/newsletter/stats

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin

---

### 29.2 Send Campaign
**POST** {{baseUrl}}/newsletter/campaign

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin

**Body (JSON):**
`json
{
  subject: Promo de la semaine!,
  body: Dcouvrez nos nouvelles offres...
}
`

---

## 30. WALLET

### 30.1 Get Balance
**GET** {{baseUrl}}/wallet/balance

**Headers:** Authorization: Bearer {{token}}

---

### 30.2 Get Transaction History
**GET** {{baseUrl}}/wallet/history

**Headers:** Authorization: Bearer {{token}}

---

### 30.3 Debit Wallet
**POST** {{baseUrl}}/wallet/debit

**Headers:** Authorization: Bearer {{token}}

**Body (JSON):**
`json
{
  amount: 50000,
  description: Paiement commande,
  orderId: order-uuid
}
`

---

### 30.4 Credit Wallet (Admin)
**POST** {{baseUrl}}/wallet/credit

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin, ccountant

**Body (JSON):**
`json
{
  userId: user-uuid,
  amount: 100000,
  description: Remboursement,
  reference: REF-001
}
`

---

## 31. GEO

### 31.1 Find Nearby Sellers
**GET** {{baseUrl}}/geo/nearby?lat=4.05&lng=9.7&radius=50

**Body (JSON):**
`json
{
  lat: 4.05,
  lng: 9.7,
  radius: 50
}
`

---

### 31.2 Update Location
**PUT** {{baseUrl}}/geo

**Headers:** Authorization: Bearer {{token}}

**Roles:** org_admin, super_admin

**Body (JSON):**
`json
{
  lat: 4.05,
  lng: 9.7,
  name: Entrept Douala
}
`

---

### 31.3 Delete Location
**DELETE** {{baseUrl}}/geo

**Headers:** Authorization: Bearer {{token}}

**Roles:** org_admin, super_admin

---

## 32. ANALYTICS

### 32.1 Top Products
**GET** {{baseUrl}}/analytics/products/top?limit=10

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin, org_admin, ccountant

---

### 32.2 Slow Movers
**GET** {{baseUrl}}/analytics/products/slow?limit=10

**Headers:** Authorization: Bearer {{token}}

---

### 32.3 Revenue by Category
**GET** {{baseUrl}}/analytics/categories

**Headers:** Authorization: Bearer {{token}}

---

### 32.4 Revenue Timeline
**GET** {{baseUrl}}/analytics/timeline?granularity=month

**Headers:** Authorization: Bearer {{token}}

---

### 32.5 Conversion Stats
**GET** {{baseUrl}}/analytics/conversion

**Headers:** Authorization: Bearer {{token}}

---

### 32.6 Price History
**GET** {{baseUrl}}/analytics/price-history/:id

**Headers:** Authorization: Bearer {{token}}

---

## 33. PRICE CONTRACTS

### 33.1 List Contracts
**GET** {{baseUrl}}/price-contracts

**Headers:** Authorization: Bearer {{token}}

---

### 33.2 Create Contract
**POST** {{baseUrl}}/price-contracts

**Headers:** Authorization: Bearer {{token}}

**Roles:** seller, org_admin, super_admin

**Body (JSON):**
`json
{
  buyerOrgId: org-uuid,
  variantId: variant-uuid,
  contractPrice: 18000,
  validUntil: 2026-12-31
}
`

---

### 33.3 Deactivate Contract
**DELETE** {{baseUrl}}/price-contracts/:id

**Headers:** Authorization: Bearer {{token}}

**Roles:** seller, org_admin, super_admin

---

## 34. RECOMMENDATIONS

### 34.1 Popular Products
**GET** {{baseUrl}}/recommendations/popular?limit=8

---

### 34.2 Similar Products
**GET** {{baseUrl}}/recommendations/similar/:id?limit=8

---

### 34.3 For You (Personalized)
**GET** {{baseUrl}}/recommendations/for-me?limit=8

**Headers:** Authorization: Bearer {{token}}

---

### 34.4 From Activity
**GET** {{baseUrl}}/recommendations/from-activity?limit=8

**Headers:** Authorization: Bearer {{token}}

---

## 35. CHATBOT

### 35.1 Send Message
**POST** {{baseUrl}}/chatbot/message

**Body (JSON):**
`json
{
  message: Quel disque de frein pour Toyota Hilux 2018?,
  sessionKey: unique-session-key,
  context: { userId: optional-user-uuid }
}
`

---

### 35.2 Get Chat History
**GET** {{baseUrl}}/chatbot/history/:sessionKey

---

### 35.3 Clear Chat History
**DELETE** {{baseUrl}}/chatbot/history/:sessionKey

---

### 35.4 Chatbot Status
**GET** {{baseUrl}}/chatbot/status

---

## 36. INVOICES

### 36.1 Get Invoice PDF
**GET** {{baseUrl}}/invoices/:orderId/pdf

**Headers:** Authorization: Bearer {{token}}

---

### 36.2 Preview Invoice
**GET** {{baseUrl}}/invoices/:orderId/preview

**Headers:** Authorization: Bearer {{token}}

---

## 37. UPLOADS

### 37.1 Upload Product Image
**POST** {{baseUrl}}/uploads/products/:productId

**Headers:** Authorization: Bearer {{token}}

**Roles:** seller, org_admin, super_admin

**Body:** orm-data with key image (file)

---

### 37.2 Delete Product Image
**DELETE** {{baseUrl}}/uploads/images/:imageId

**Headers:** Authorization: Bearer {{token}}

**Roles:** seller, org_admin, super_admin

---

### 37.3 Bulk Upload Images
**POST** {{baseUrl}}/uploads/products/:productId/bulk

**Headers:** Authorization: Bearer {{token}}

**Roles:** seller, org_admin, super_admin

**Body:** orm-data with key images (multiple files)

---

## 38. EXPORTS

### 38.1 Export Orders
**GET** {{baseUrl}}/exports/orders?format=csv&startDate=2026-01-01

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin, org_admin, ccountant

---

### 38.2 Export Payments
**GET** {{baseUrl}}/exports/payments?format=csv

**Headers:** Authorization: Bearer {{token}}

---

### 38.3 Export Stock
**GET** {{baseUrl}}/exports/stock?format=csv

**Headers:** Authorization: Bearer {{token}}

---

## 39. AUDIT LOG

### 39.1 List Audit Logs
**GET** {{baseUrl}}/audit?page=1&limit=50

**Headers:** Authorization: Bearer {{token}}

**Roles:** super_admin

---

## 40. LEGAL

### 40.1 CGV
**GET** {{baseUrl}}/legal/cgv

---

### 40.2 Return Policy
**GET** {{baseUrl}}/legal/returns

---

### 40.3 Privacy Policy
**GET** {{baseUrl}}/legal/privacy

---

### 40.4 Legal Summary
**GET** {{baseUrl}}/legal/summary

---

## 41. VOICE ORDER (LIVEKIT)

### 41.1 Create Voice Session
**POST** {{baseUrl}}/voice-order/session

**Headers:** Authorization: Bearer {{token}}

---

### 41.2 Get Agent Token
**POST** {{baseUrl}}/voice-order/agent-token

**Headers:** Authorization: Bearer {{token}}

---

### 41.3 End Voice Session
**DELETE** {{baseUrl}}/voice-order/session/:roomName

**Headers:** Authorization: Bearer {{token}}

---

### 41.4 Voice Service Status
**GET** {{baseUrl}}/voice-order/status

---

## AUTHENTICATION GUIDE

### Getting a Token
1. Run **1.2 Login** with one of the seeded accounts:
   - uyer@test.cm / Test1234! (role: buyer)
   - seller@test.cm / Test1234! (role: seller/org_admin)
   - dmin@test.cm / Test1234! (role: super_admin)
2. The Test Script automatically saves 	oken and efreshToken
3. All subsequent requests with Authorization header will use the token

### Token Refresh
When the token expires (401 response), run **1.3 Refresh Token** to get a new one.

---

## ERROR CODES

| Code | Meaning |
|------|---------|
| UNAUTHORIZED | Missing or invalid token |
| FORBIDDEN | Valid token but insufficient role |
| NOT_FOUND | Resource not found |
| CONFLICT | Duplicate resource (e.g., email already used) |
| VALIDATION_ERROR | Request body failed validation |
| UNPROCESSABLE | Business logic error |

---

## STANDARD RESPONSE FORMAT

**Success:**
`json
{
  success: true,
  data: { ... },
  pagination: { page: 1, limit: 20, total: 100 }
}
`

**Error:**
`json
{
  success: false,
  code: VALIDATION_ERROR,
  message: Validation failed,
  details: [
    { field: email, message: Email invalide }
  ]
}
`
