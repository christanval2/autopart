import type { Request, Response, NextFunction } from 'express';
export type Lang = 'fr' | 'en';

const msgs = {
  fr: {
    errors:   { notFound:'Ressource introuvable', forbidden:'Accès refusé', unauthorized:'Authentification requise', badRequest:'Requête invalide', internal:'Erreur serveur interne', validation:'Données invalides' },
    auth:     { loginSuccess:'Connexion réussie', registerSuccess:'Compte créé avec succès', invalidCredentials:'Email ou mot de passe incorrect', emailUsed:'Cet email est déjà utilisé', tokenExpired:'Session expirée — reconnectez-vous', passwordChanged:'Mot de passe modifié' },
    orders:   { created:'Commande créée avec succès', statusUpdated:'Statut mis à jour', notFound:'Commande introuvable', forbidden:"Vous n'êtes pas autorisé", refundedAdminOnly:'Réservé aux administrateurs', insufficientStock:(q:number,av:number)=>`Stock insuffisant: ${av} dispo, ${q} demandé(s)`, minOrderAmount:(a:number)=>`Montant minimum B2B: ${a.toLocaleString('fr-FR')} XAF` },
    payments: { initiated:'Paiement initié — vérifiez votre téléphone Mobile Money', confirmed:'Paiement confirmé', failed:'Paiement échoué', blocked:(s:number,r:string)=>`Transaction bloquée (score: ${s}). Motifs: ${r}` },
    stock:    { adjusted:'Stock ajusté avec succès', transferred:'Transfert effectué' },
    products: { created:'Produit créé', updated:'Produit mis à jour', deleted:'Produit désactivé', notFound:'Produit introuvable', forbidden:'Vous ne gérez pas ce produit' },
    invoices: { notReady:'Facture disponible uniquement pour les commandes confirmées', generated:'Facture générée' },
  },
  en: {
    errors:   { notFound:'Resource not found', forbidden:'Access denied', unauthorized:'Authentication required', badRequest:'Invalid request', internal:'Internal server error', validation:'Invalid data' },
    auth:     { loginSuccess:'Login successful', registerSuccess:'Account created successfully', invalidCredentials:'Invalid email or password', emailUsed:'This email is already in use', tokenExpired:'Session expired — please log in again', passwordChanged:'Password changed' },
    orders:   { created:'Order created successfully', statusUpdated:'Status updated', notFound:'Order not found', forbidden:'You are not authorised', refundedAdminOnly:'Reserved for administrators', insufficientStock:(q:number,av:number)=>`Insufficient stock: ${av} available, ${q} requested`, minOrderAmount:(a:number)=>`Minimum B2B order: ${a.toLocaleString('en-US')} XAF` },
    payments: { initiated:'Payment initiated — check your Mobile Money phone', confirmed:'Payment confirmed', failed:'Payment failed', blocked:(s:number,r:string)=>`Transaction blocked (score: ${s}). Reasons: ${r}` },
    stock:    { adjusted:'Stock adjusted', transferred:'Transfer completed' },
    products: { created:'Product created', updated:'Product updated', deleted:'Product deactivated', notFound:'Product not found', forbidden:'You do not manage this product' },
    invoices: { notReady:'Invoice available only for confirmed orders', generated:'Invoice generated' },
  },
} as const;

export type I18n = typeof msgs.fr | typeof msgs.en;
export const t = (lang: Lang = 'fr'): I18n => msgs[lang] ?? msgs.fr;
export const detectLang = (req: Request): Lang => (req.headers['accept-language'] ?? '').toLowerCase().startsWith('en') ? 'en' : 'fr';
export function i18nMiddleware(req: Request & { lang?: Lang; t?: I18n }, _res: Response, next: NextFunction) {
  req.lang = detectLang(req); req.t = t(req.lang); next();
}
