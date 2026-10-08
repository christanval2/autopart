"""
AutoParts Voice Agent — LiveKit Agents + Groq
=============================================
Commande vocale intelligente pour le marché camerounais.

Installation :
    pip install "livekit-agents[groq,silero,deepgram]~=1.0"
    pip install livekit-plugins-groq
    pip install requests python-dotenv

Lancement :
    python agent.py dev     # développement
    python agent.py start   # production
"""

import asyncio
import logging
import json
import os
import requests
from typing import Optional

from dotenv import load_dotenv

from livekit import agents
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    RoomInputOptions,
    function_tool,
    RunContext,
    llm as agent_llm,
)
from livekit.plugins import groq as livekit_groq, silero

load_dotenv()
logger = logging.getLogger("autoparts-voice-agent")

# ─── Config ──────────────────────────────────────────────────
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3000/api/v1")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
AGENT_SECRET = os.getenv("VOICE_AGENT_SECRET", "change-me-in-prod")

# ─── Session de commande en cours ────────────────────────────
class OrderSession:
    def __init__(self, user_id: str):
        self.user_id   = user_id
        self.cart:   list[dict] = []
        self.context: dict      = {}
        self.auth_token: str    = ""

    def add_to_cart(self, variant_id: str, name: str, price: float, quantity: int):
        existing = next((i for i in self.cart if i["variantId"] == variant_id), None)
        if existing:
            existing["quantity"] += quantity
        else:
            self.cart.append({
                "variantId": variant_id,
                "name":      name,
                "price":     price,
                "quantity":  quantity,
            })

    def get_total(self) -> float:
        return sum(i["price"] * i["quantity"] for i in self.cart)

    def clear(self):
        self.cart = []


# ─── Définition des outils (Tool Calling) ────────────────────
class AutoPartsAgent(Agent):
    """Agent vocal AutoParts — comprend et passe les commandes."""

    def __init__(self, session: OrderSession):
        self._session = session
        super().__init__(
            instructions="""Tu es AutoBot, l'assistant vocal de la marketplace AutoParts Cameroun.
Tu aides les clients à commander des pièces automobiles par téléphone/voix.

Langue : Français (tu peux comprendre le pidgin et le franglais camerounais).

Ton flux de conversation :
1. Accueille le client chaleureusement
2. Demande son véhicule (marque, modèle, année) si pas encore donné
3. Identifie les pièces qu'il cherche
4. Recherche et propose les pièces disponibles avec prix
5. Ajoute au panier sur confirmation
6. Récapitule et confirme la commande

Règles :
- Cite les prix en Francs CFA (XAF), jamais en euros
- Sois concis — c'est une conversation téléphonique
- Confirme toujours avant de passer la commande finale
- Propose MTN MoMo ou Orange Money pour le paiement
- Si une pièce n'est pas disponible, propose une alternative
- Marché camerounais : Toyota, Peugeot, Renault, Mitsubishi très populaires"""
        )

    @function_tool(
        description="Recherche des pièces automobiles par nom, référence ou véhicule."
    )
    async def search_products(
        self,
        ctx: RunContext,
        query: str,
        vehicle_make: Optional[str] = None,
        vehicle_model: Optional[str] = None,
        vehicle_year: Optional[int] = None,
    ) -> str:
        # Avec véhicule complet → recherche par compatibilité ; sinon full-text
        if vehicle_make and vehicle_model:
            params = {"make": vehicle_make, "model": vehicle_model, "limit": 5}
            if vehicle_year:
                params["year"] = str(vehicle_year)
            if query:
                params["category"] = query
            endpoint = f"{BACKEND_URL}/search/vehicle"
        else:
            params = {"q": query, "limit": 5}
            endpoint = f"{BACKEND_URL}/search"

        try:
            r = requests.get(endpoint, params=params, timeout=8)
            data = r.json().get("data", [])
            if not data:
                return f"Aucune pièce trouvée pour '{query}'."

            results = []
            for p in data[:4]:
                price = p.get("basePrice") or p.get("price", 0)
                cond_map = {
                    "new": "Neuf",
                    "genuine_used": "Occasion vérifiée",
                    "reconditioned": "Reconditionné"
                }
                cond = cond_map.get(p.get("condition", ""), "")
                # Le panier vocal travaille en variantes : première variante active
                variants = p.get("variants") or []
                variant_id = variants[0].get("id") if variants else p.get("id")
                results.append(
                    f"• {p.get('name')} ({cond}) — {int(price):,} XAF"
                    f" | variantId: {variant_id}"
                )
            return (
                "Pièces disponibles (retiens le variantId pour le panier) :\n"
                + "\n".join(results)
            )

        except Exception as e:
            logger.error(f"search_products error: {e}")
            return "Erreur lors de la recherche. Veuillez réessayer."

    @function_tool(
        description="Ajoute une pièce au panier vocal après confirmation du client. "
                    "Utilise le variantId renvoyé par search_products."
    )
    async def add_to_cart(
        self,
        ctx: RunContext,
        variant_id: str,
        product_name: str,
        unit_price: float,
        quantity: int = 1,
    ) -> str:
        self._session.add_to_cart(
            variant_id, product_name, unit_price, quantity
        )
        total = self._session.get_total()
        cart_summary = ", ".join(
            f"{i['name']} ×{i['quantity']}" for i in self._session.cart
        )
        return (
            f"✓ {product_name} ×{quantity} ajouté au panier.\n"
            f"Panier actuel : {cart_summary}\n"
            f"Total : {int(total):,} XAF"
        )

    @function_tool(
        description="Affiche le contenu du panier en cours."
    )
    async def show_cart(self, ctx: RunContext) -> str:
        if not self._session.cart:
            return "Votre panier est vide."
        lines = [f"• {i['name']} ×{i['quantity']} — {int(i['price'] * i['quantity']):,} XAF"
                 for i in self._session.cart]
        return (
            "Votre panier :\n" + "\n".join(lines)
            + f"\n\nTotal : {int(self._session.get_total()):,} XAF"
        )

    @function_tool(
        description="Vide le panier ou retire un article."
    )
    async def remove_from_cart(
        self,
        ctx: RunContext,
        product_name: Optional[str] = None,
    ) -> str:
        if not product_name:
            self._session.clear()
            return "Panier vidé."
        self._session.cart = [
            i for i in self._session.cart
            if product_name.lower() not in i["name"].lower()
        ]
        return f"Article(s) contenant '{product_name}' retirés du panier."

    @function_tool(
        description="Confirme et passe la commande finale après validation du client."
    )
    async def confirm_order(
        self,
        ctx: RunContext,
        phone_number: str,
        payment_method: str = "mtn_momo",  # "mtn_momo" ou "orange_money"
    ) -> str:
        if not self._session.cart:
            return "Votre panier est vide, impossible de commander."

        if not self._session.auth_token:
            return (
                "Je n'ai pas pu vous identifier pour passer la commande. "
                "Veuillez utiliser l'application AutoParts pour finaliser."
            )

        # Le backend résout vendeurs + adresses par défaut et regroupe par vendeur
        order_payload = {
            "lines": [
                {"variantId": i["variantId"], "quantity": i["quantity"]}
                for i in self._session.cart
            ],
            "paymentMethod": "mtn_momo" if "mtn" in payment_method.lower() else "orange_money",
            "phone":         phone_number,
            "notes":         "Commande passée par appel vocal AutoBot",
        }

        try:
            headers = {"Authorization": f"Bearer {self._session.auth_token}"}
            r = requests.post(
                f"{BACKEND_URL}/voice-order/order",
                json=order_payload,
                headers=headers,
                timeout=20,
            )

            if r.status_code not in (200, 201):
                detail = ""
                try:
                    detail = r.json().get("message", "")
                except Exception:
                    pass
                return (
                    f"La commande n'a pas abouti ({r.status_code}). "
                    f"{detail} Veuillez réessayer ou utiliser l'application."
                )

            data  = r.json().get("data", {})
            total = data.get("total", self._session.get_total())
            numbers = ", ".join(o.get("orderNumber", "—") for o in data.get("orders", []))
            self._session.clear()

            return (
                f"✅ Commande {numbers} passée avec succès !\n"
                f"Total : {int(total):,} XAF\n"
                f"Une demande de paiement a été envoyée au {phone_number}.\n"
                f"Confirmez le paiement sur votre téléphone pour valider la commande."
            )

        except Exception as e:
            logger.error(f"confirm_order error: {e}")
            return "Erreur lors de la création de la commande. Veuillez contacter le support."

    @function_tool(
        description="Annule la session et met fin à l'appel."
    )
    async def end_call(self, ctx: RunContext, reason: str = "") -> str:
        self._session.clear()
        return (
            "D'accord, je mets fin à notre appel. "
            "Merci d'avoir contacté AutoParts Cameroun. "
            "N'hésitez pas à rappeler ou à utiliser notre application. "
            "Bonne journée !"
        )


# ─── Point d'entrée LiveKit ───────────────────────────────────
async def entrypoint(ctx: JobContext):
    """Appelé par LiveKit quand un agent doit rejoindre une room."""

    logger.info(f"Agent démarré pour la room: {ctx.room.name}")

    await ctx.connect()

    # Extraire les métadonnées (userId transmis via room metadata)
    metadata = {}
    try:
        if ctx.room.metadata:
            metadata = json.loads(ctx.room.metadata)
    except Exception:
        pass

    user_id = metadata.get("userId", "anonymous")
    session = OrderSession(user_id=user_id)
    session.auth_token = metadata.get("authToken", "")

    agent_instance = AutoPartsAgent(session=session)

    # STT : Groq Whisper (modèle multilingue)
    stt = livekit_groq.STT(
        model="whisper-large-v3",
        language="fr",   # Français par défaut, Whisper détecte aussi le pidgin
    )

    # LLM : Groq LLaMA 3.3 70B (très rapide)
    lm = livekit_groq.LLM(
        model="llama-3.3-70b-versatile",
        temperature=0.3,
    )

    # VAD : Silero (Voice Activity Detection) — détecte quand le client parle
    vad = silero.VAD.load()

    # TTS : Groq PlayAI TTS (voix francophone naturelle)
    tts = livekit_groq.TTS(
        model="playai-tts",
        voice="Celeste-PlayAI",  # Voix féminine française claire
    )

    agent_session = AgentSession(
        vad=vad,
        stt=stt,
        llm=lm,
        tts=tts,
        turn_detection=agent_llm.TurnDetection(
            silence_duration_ms=800,   # Attente 800ms de silence avant de répondre
            threshold=0.5,
        ),
    )

    await agent_session.start(
        agent    = agent_instance,
        room     = ctx.room,
        room_input_options=RoomInputOptions(
            noise_cancellation=True,  # Filtre bruit environnemental
        ),
    )

    # Message d'accueil
    await agent_session.say(
        "Bonjour ! Je suis AutoBot, l'assistant vocal d'AutoParts Cameroun. "
        "Je suis là pour vous aider à commander des pièces automobiles. "
        "Quel véhicule avez-vous et quelle pièce recherchez-vous ?",
        allow_interruptions=True,
    )


if __name__ == "__main__":
    agents.cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            # Doit correspondre à VOICE_AGENT_NAME du backend
            # (src/modules/voice-order/index.ts) — le backend crée le dispatch
            # vers cet agent via AgentDispatchClient.createDispatch(room, agent_name).
            agent_name="autoparts-voice-agent",
            api_key    =os.getenv("LIVEKIT_API_KEY"),
            api_secret =os.getenv("LIVEKIT_API_SECRET"),
            ws_url     =os.getenv("LIVEKIT_URL"),
        )
    )
