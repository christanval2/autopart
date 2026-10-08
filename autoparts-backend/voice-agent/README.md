# AutoParts Voice Agent

Agent vocal LiveKit + Groq pour la commande par appel.

## Installation

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Configurer les clés
```

## Démarrage

```bash
# Développement (redémarrage auto)
python agent.py dev

# Production
python agent.py start

# Docker
docker build -t autoparts-voice-agent .
docker run --env-file .env autoparts-voice-agent
```

> ⚠️ L'agent s'enregistre comme **worker LiveKit** sous le nom
> `autoparts-voice-agent`. Le backend (`src/modules/voice-order`) crée le
> dispatch vers la room via `AgentDispatchClient.createDispatch()` quand un
> client appelle `POST /api/v1/voice-order/session`. Il n'y a **plus de serveur
> HTTP** à exposer : tant que ce worker tourne (avec les mêmes clés LiveKit
> que le backend), l'agent rejoint automatiquement chaque room.

## Architecture

```
Client WebRTC
    ↓ Audio (Opus/PCM)
LiveKit Room  ← dispatch créé par le backend (AgentDispatchClient)
    ↓ Track audio
Voice Agent (ce worker, agent_name="autoparts-voice-agent")
    ↓ Audio chunks
Groq Whisper STT → texte
    ↓
Groq LLaMA 3.3 + Tool Calling
    ↓ Appels outils
AutoParts API REST (JWT utilisateur transmis via room.metadata)
    ↓ Données
LLaMA → réponse texte
    ↓
Groq PlayAI TTS → audio
    ↓
Client (entend la réponse)
```

## Identité & sécurité

- À la création de la session, le backend place dans `room.metadata` :
  `{"userId": "...", "authToken": "<JWT 15 min>"}`
- L'agent utilise ce JWT en `Authorization: Bearer` pour passer la commande
  **au nom du client** sur `POST /api/v1/voice-order/order` — il n'a jamais
  accès aux mots de passe ni aux refresh tokens.
- Le backend résout lui-même vendeurs (stock) et adresse par défaut du client :
  l'agent ne manipule que des `variantId` + quantités.

## Flux de commande type

1. Client : "J'ai une Toyota Hilux 2018, je cherche des plaquettes de frein"
2. Agent  : appelle `search_products("plaquettes de frein", "Toyota", "Hilux", 2018)`
   → `GET /search/vehicle` (compatibilités) ou `GET /search` (full-text)
3. Agent  : "J'ai trouvé 3 références : Bosch BP1234 à 45 000 XAF..." (avec variantId)
4. Client : "Prends les Bosch"
5. Agent  : appelle `add_to_cart(variant_id, ...)`
6. Agent  : "Ajouté ! Voulez-vous passer la commande ?"
7. Client : "Oui, MTN MoMo au 650 00 00 00"
8. Agent  : appelle `confirm_order("+237650000000", "mtn_momo")`
   → `POST /voice-order/order` (groupement par vendeur, adresse par défaut,
     initiation Mobile Money)
9. Agent  : "Commande ORD-2026-xxxx passée ! Confirmez sur votre téléphone."

## Dépendances

Voir `requirements.txt` : `livekit-agents[groq,silero]`, `requests`, `python-dotenv`.
