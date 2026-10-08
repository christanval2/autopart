import { Router, Request, Response, NextFunction } from 'express';
import Groq                   from 'groq-sdk';
import { z }                  from 'zod';
import { AppDataSource }      from '../../config/database';
import { ChatSession, ChatMessage } from '../../entities/ChatSession';
import { ApiError, ApiResponse }    from '../../shared/utils/response';
import { validate, authenticate, optionalAuthenticate } from '../../middlewares';
import { AUTOPARTS_TOOLS }          from './tools';
import { executeTool }              from './executor';
import { env }                      from '../../config/env';
import { logger }                   from '../../shared/utils/logger';

// ─── Groq client (lazy init) ──────────────────────────────────
let groq: Groq;
function getGroq(): Groq {
  if (!groq) {
    if (!env.GROQ_API_KEY) throw ApiError.badRequest('Chatbot non configuré (GROQ_API_KEY manquant)');
    groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }
  return groq;
}

// ─── Prompt système ────────────────────────────────────────────
const SYSTEM_PROMPT = `Tu es AutoBot, l'assistant intelligent de la marketplace AutoParts Cameroun.
Tu aides les clients à trouver des pièces automobiles, suivre leurs commandes, et découvrir les meilleures offres.

Tes capacités :
- Recherche de pièces par nom, référence OEM, ou compatibilité véhicule
- Suivi de commandes et de colis
- Informations sur les promotions en cours
- Recommandations personnalisées
- Consultation du solde de fidélité

Règles importantes :
- Réponds toujours en français sauf si l'utilisateur parle anglais
- Sois concis et précis (2-3 phrases max sauf si plus de détails sont demandés)
- Cite toujours les prix en XAF (Franc CFA)
- Si une pièce est trouvée, donne le prix, l'état (neuf/occasion), et la disponibilité
- Si une commande est introuvable, suggère de vérifier le numéro de commande
- Pour les véhicules, demande la marque, le modèle et l'année si non précisés
- Ne fais jamais de promesses sur les délais de livraison que tu ne peux pas garantir
- Redirige vers le support humain pour les remboursements et litiges complexes
- Marché camerounais : connais les marques populaires (Toyota, Peugeot, Renault, Mercedes, Mitsubishi, Nissan)

Contexte : Marketplace B2B/B2C de pièces automobiles au Cameroun, paiement par MTN MoMo et Orange Money.`;

// ─── Schémas ──────────────────────────────────────────────────
const MessageSchema = z.object({
  message:    z.string().min(1).max(2000).trim(),
  sessionKey: z.string().max(100).optional(),
  context:    z.object({
    vehicle: z.object({ make: z.string(), model: z.string(), year: z.number().optional() }).optional(),
    currentPage: z.string().optional(),
    productId:   z.string().uuid().optional(),
  }).optional(),
});

const repo = () => AppDataSource.getRepository(ChatSession);
const MAX_HISTORY = 20; // garder 20 messages max en mémoire

// ─── Service principal ────────────────────────────────────────
export const ChatbotService = {
  async chat(
    userMessage: string,
    sessionKey: string,
    userId?: string,
    context?: Record<string, unknown>,
  ): Promise<{ reply: string; sessionKey: string; toolsUsed: string[] }> {

    // 1. Récupérer ou créer la session
    let session = await repo().findOne({ where: { sessionKey } });
    if (!session) {
      session = repo().create({
        sessionKey,
        user:     userId ? { id: userId } as any : undefined,
        messages: [],
        context,
      });
    }

    // 2. Ajouter le message utilisateur à l'historique
    const userMsg: ChatMessage = { role: 'user', content: userMessage, ts: Date.now() };
    session.messages.push(userMsg);

    // Garder seulement les N derniers messages
    if (session.messages.length > MAX_HISTORY) {
      session.messages = session.messages.slice(-MAX_HISTORY);
    }

    // 3. Construire le prompt avec contexte véhicule si disponible
    let systemPrompt = SYSTEM_PROMPT;
    if (context?.vehicle) {
      const v = context.vehicle as { make: string; model: string; year?: number };
      systemPrompt += `\n\nVéhicule de l'utilisateur : ${v.make} ${v.model}${v.year ? ' (' + v.year + ')' : ''}. Priorise les pièces compatibles avec ce véhicule.`;
    }
    if (context?.currentPage) {
      systemPrompt += `\n\nPage actuelle : ${context.currentPage}.`;
    }

    // 4. Boucle agentique : chaque appel repasse `tools` + tool_choice 'auto'.
    // (Les modèles de raisonnement type gpt-oss re-émettent des tool_calls au
    // tour suivant — sans la liste des tools Groq répond 400
    // « Tool choice is none, but model called a tool ».)
    const toolsUsed: string[] = [];
    let finalReply = '';

    const runToolCalls = async (toolCalls: NonNullable<Record<string, any>['tool_calls']>) => {
      const results = await Promise.all(
        (toolCalls as any[]).map(async tc => {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* args invalides → {} */ }
          logger.info(`Chatbot tool: ${tc.function.name}`, args);
          toolsUsed.push(tc.function.name);
          try {
            const result = await executeTool(tc.function.name, args, userId);
            return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result) };
          } catch (err) {
            return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify({ error: String(err) }) };
          }
        }),
      );
      return results;
    };

    try {
      const conversation: any[] = [
        { role: 'system', content: systemPrompt },
        ...session.messages.map(m => ({ role: m.role, content: m.content })),
      ];

      // Max 4 tours d'outils : cherche → détail → répond (les modèles de
      // raisonnement peuvent chaîner plusieurs requêtes BD).
      for (let round = 0; round < 4; round++) {
        const response = await getGroq().chat.completions.create({
          model:       env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
          messages:    conversation,
          tools:       AUTOPARTS_TOOLS as any,
          tool_choice: 'auto',
          max_tokens:  2048,
          temperature: 0.3,
          // gpt-oss raisonne longuement par défaut → effort bas pour tenir
          // sous le timeout frontend (raisonnement court, réponse rapide).
          ...(String(env.GROQ_MODEL ?? '').includes('gpt-oss')
            ? { reasoning_effort: 'low' } as any
            : {}),
        });

        const choice = response.choices[0];

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
          conversation.push({
            role: 'assistant',
            content: choice.message.content ?? '',
            tool_calls: choice.message.tool_calls,
          });
          conversation.push(...await runToolCalls(choice.message.tool_calls));
          continue; // redonne la main au modèle avec les résultats BD
        }

        finalReply = choice.message.content ?? 'Désolé, je n\'ai pas pu générer une réponse.';
        break;
      }

      if (!finalReply) finalReply = 'Désolé, je n\'ai pas pu générer une réponse.';

    } catch (err: any) {
      logger.error('Groq API error:', err);
      if (err?.status === 401) throw ApiError.badRequest('Clé API Groq invalide');
      throw ApiError.internal('Erreur du service de chatbot');
    }

    // 6. Sauvegarder la réponse dans l'historique
    const assistantMsg: ChatMessage = { role: 'assistant', content: finalReply, ts: Date.now() };
    session.messages.push(assistantMsg);
    await repo().save(session);

    return { reply: finalReply, sessionKey, toolsUsed };
  },

  async getHistory(sessionKey: string): Promise<ChatMessage[]> {
    const session = await repo().findOne({ where: { sessionKey } });
    return session?.messages.filter(m => m.role !== 'system') ?? [];
  },

  async clearHistory(sessionKey: string): Promise<void> {
    const session = await repo().findOne({ where: { sessionKey } });
    if (session) { session.messages = []; await repo().save(session); }
  },
};

// ─── Routes ──────────────────────────────────────────────────
export const chatbotRouter = Router();

/**
 * Une clé de session `user:<id>` n'est accessible qu'à son propriétaire
 * authentifié (anti-IDOR). Les clés anonymes restent libres.
 */
function assertSessionKeyAccess(sessionKey: string, req: Request): void {
  if (sessionKey.startsWith('user:')) {
    if (!req.user || sessionKey !== `user:${req.user.id}`) {
      throw ApiError.forbidden('Cette session appartient à un autre utilisateur');
    }
  }
}

chatbotRouter.post('/message',
  validate(MessageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, context } = req.body;
      const userId = req.user?.id;

      // Clé de session : l'utilisateur connecté est toujours rattaché à SA clé ;
      // un anonyme ne peut jamais cibler une session `user:*`
      let sessionKey: string;
      if (userId) {
        sessionKey = `user:${userId}`;
      } else {
        const provided: string | undefined = req.body.sessionKey;
        if (provided?.startsWith('user:')) {
          return next(ApiError.forbidden('Session utilisateur accessible uniquement connecté'));
        }
        sessionKey = provided
          ?? `anon:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      }

      const result = await ChatbotService.chat(message, sessionKey, userId, context);
      res.json(ApiResponse.success(result));
    } catch(e) { next(e); }
  },
);

chatbotRouter.get('/history/:sessionKey',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertSessionKeyAccess(req.params.sessionKey, req);
      const history = await ChatbotService.getHistory(req.params.sessionKey);
      res.json(ApiResponse.success(history));
    } catch(e) { next(e); }
  },
);

chatbotRouter.delete('/history/:sessionKey',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      assertSessionKeyAccess(req.params.sessionKey, req);
      await ChatbotService.clearHistory(req.params.sessionKey);
      res.json(ApiResponse.noContent());
    } catch(e) { next(e); }
  },
);

// Endpoint santé du chatbot
chatbotRouter.get('/status',
  async (req: Request, res: Response) => {
    const configured = !!env.GROQ_API_KEY;
    res.json(ApiResponse.success({
      configured,
      model:       env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
      toolsCount:  AUTOPARTS_TOOLS.length,
      provider:    'Groq',
    }));
  },
);
