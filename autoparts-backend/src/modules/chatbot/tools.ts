/**
 * Définition des outils que le chatbot peut appeler sur l'API AutoParts.
 * Chaque outil correspond à un endpoint backend existant.
 */

import type { ChatCompletionTool } from 'groq-sdk/resources/chat/completions';

export const AUTOPARTS_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Recherche des pièces automobiles par nom, OEM, marque ou catégorie. Utiliser pour trouver des produits spécifiques.',
      parameters: {
        type: 'object',
        properties: {
          query:     { type: 'string',  description: 'Terme de recherche (nom pièce, référence OEM, marque)' },
          condition: { type: 'string',  enum: ['new','genuine_used','reconditioned'], description: 'État de la pièce' },
          minPrice:  { type: 'number',  description: 'Prix minimum en XAF' },
          maxPrice:  { type: 'number',  description: 'Prix maximum en XAF' },
          limit:     { type: 'integer', description: 'Nombre de résultats (max 5)', default: 5 },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_by_vehicle',
      description: 'Trouve les pièces compatibles avec un véhicule précis (marque, modèle, année). À utiliser quand l\'utilisateur mentionne sa voiture.',
      parameters: {
        type: 'object',
        properties: {
          make:       { type: 'string',  description: 'Marque du véhicule (ex: Toyota, Peugeot, Mercedes)' },
          model:      { type: 'string',  description: 'Modèle (ex: Hilux, 306, C180)' },
          year:       { type: 'integer', description: 'Année de fabrication' },
          engineCode: { type: 'string',  description: 'Code moteur si connu (ex: 1KD-FTV)' },
          partType:   { type: 'string',  description: 'Type de pièce recherché (ex: frein, filtre, amortisseur)' },
        },
        required: ['make', 'model'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_status',
      description: 'Vérifie le statut d\'une commande. Utiliser quand l\'utilisateur demande où est sa commande.',
      parameters: {
        type: 'object',
        properties: {
          orderNumber: { type: 'string', description: 'Numéro de commande (ex: ORD-2024-12345)' },
        },
        required: ['orderNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'track_shipment',
      description: 'Suit un colis en transit. Utiliser quand l\'utilisateur donne un numéro de suivi.',
      parameters: {
        type: 'object',
        properties: {
          trackingNumber: { type: 'string', description: 'Numéro de suivi du colis' },
        },
        required: ['trackingNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_promotions',
      description: 'Liste les promotions et codes promo actifs. Utiliser quand l\'utilisateur demande des réductions ou offres.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Récupère les détails complets d\'un produit (prix, stock, compatibilités, avis).',
      parameters: {
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'ID du produit' },
        },
        required: ['productId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recommendations',
      description: 'Obtient des recommandations de produits personnalisées pour l\'utilisateur.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['popular','for-me','similar'], description: 'Type de recommandation' },
          productId: { type: 'string', description: 'ID produit de référence (pour similar)' },
        },
        required: ['type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_loyalty_balance',
      description: 'Consulte le solde de points fidélité de l\'utilisateur connecté.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];
