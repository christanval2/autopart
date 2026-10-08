#!/bin/bash
# ── Vérification des routes backend utilisées par l'app mobile ──
# Publics    → 200 attendu
# Protégés   → 401 attendu (la route existe, l'authentification est exigée)
# Validation → 400 accepté (route existe, payload invalide rejeté)
BASE="http://localhost:3000/api/v1"
ORIGIN="Origin: http://localhost:8082"
CT="Content-Type: application/json"
PRODUCT_ID="98865cd9-693a-4374-96b2-580e5158f2a1"

check() {
  local method=$1 path=$2 data=$3 expect=$4
  local code
  if [ "$method" = "GET" ]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "$ORIGIN" --max-time 60 "$BASE$path")
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" -H "$ORIGIN" -H "$CT" -d "$data" --max-time 90 "$BASE$path")
  fi
  local status="?"
  case "$expect" in
    "$code") status="OK" ;;
    "200|400" ) [ "$code" = "200" ] || [ "$code" = "400" ] && status="OK" ;;
    *) status="VOIR" ;;
  esac
  printf "%-7s %-52s → %s   [%s] (attendu %s)\n" "$method" "$path" "$code" "$status" "$expect"
}

echo "═══ PUBLIC — catalogue & recherche"
check GET  "/catalog/categories"                                   -        "200"
check GET  "/products?limit=20"                                    -        "200"
check GET  "/products/$PRODUCT_ID"                                 -        "200"
check GET  "/search?q=plaquette&limit=5"                           -        "200"
check GET  "/reviews?productId=$PRODUCT_ID&limit=10"               -        "200"
check GET  "/reviews/product/$PRODUCT_ID/rating"                   -        "200"

echo "═══ PUBLIC — promotions & livraison"
check GET  "/promotions?active=true"                               -        "200"
check POST "/promotions/validate"  '{"code":"TESTZCODE","orderAmount":10000}' "200|400"
check GET  "/shipping/zones"                                       -        "200"

# zone réelle pour le devis
ZONE_ID=$(curl -s -H "$ORIGIN" "$BASE/shipping/zones" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);const items=Array.isArray(j.data)?j.data:(j.data?.items??[]);console.log(items[0]?.id||'')}catch{console.log('')}})")
if [ -n "$ZONE_ID" ]; then
  check GET  "/shipping/quote?zoneId=$ZONE_ID&subtotal=50000"      -        "200"
else
  printf "%-7s %-52s → (aucune zone en base)\n" "GET" "/shipping/quote"
fi

echo "═══ PUBLIC — AutoBot & vocal"
check GET  "/chatbot/status"                                       -        "200"
check GET  "/voice-order/status"                                   -        "200"
check POST "/voice-order/session"  '{}'                            "200|400|401|503"

echo "═══ PUBLIC — suivi colis & auth"
check GET  "/shipments/track/TESTZCODE123"                         -        "200|400|404"
check POST "/auth/login"  '{"email":"test@zcode.cm","password":"x"}'        "400|401"
check POST "/auth/register" '{}'                                   "400"
check POST "/auth/verify-email" '{"email":"test@zcode.cm","code":"000000"}' "400|401"
check POST "/auth/otp/resend" '{}'                                 "400|401"

echo "═══ PROTÉGÉ — panier, commandes, paiement"
check GET  "/cart"                                                 -        "401"
check POST "/cart/items"  '{"variantId":"x","quantity":1}'         "401"
check GET  "/orders"                                               -        "401"
check POST "/orders"      '{}'                                     "401"
check GET  "/payments"                                             -        "401"
check POST "/payments"    '{}'                                     "401"

echo "═══ PROTÉGÉ — compte, favoris, messages"
check GET  "/addresses"                                            -        "401"
check GET  "/wishlist"                                             -        "401"
check GET  "/wallet/balance"                                       -        "401"
check GET  "/loyalty/balance"                                      -        "401"
check GET  "/messages/inbox"                                       -        "401"
check GET  "/messages/thread/test"                                 -        "401"
check POST "/messages"    '{}'                                     "401"

echo "═══ PROTÉGÉ — litiges, avis, analytics, vocal"
check GET  "/disputes"                                             -        "401"
check POST "/disputes"    '{}'                                     "401"
check POST "/reviews"     '{}'                                     "401"
check GET  "/analytics/conversion"                                 -        "401|403"
check GET  "/analytics/products/top"                               -        "401|403"
check GET  "/analytics/categories"                                 -        "401|403"
check GET  "/analytics/timeline?granularity=month"                 -        "401|403"
check POST "/chatbot/message" '{"message":"ping","sessionKey":"zcode-roadmap"}' "200"
