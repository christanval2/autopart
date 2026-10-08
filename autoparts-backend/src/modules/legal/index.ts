import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../shared/utils/response';
export const legalRouter = Router();
const CGV = { version:'1.0', updatedAt:'2024-01-01', company:'AutoParts Marketplace SARL', rccm:'RC/DLA/2024/B/1234',
  sections:[
    { title:'1. Objet', content:'Les présentes CGV régissent les ventes de pièces automobiles sur AutoParts Marketplace Cameroun.' },
    { title:'2. Prix', content:'Tous les prix sont en XAF TTC incluant la TVA camerounaise de 19,25% (Loi de Finances 2024).' },
    { title:'3. Paiement', content:'Modes acceptés : MTN MoMo, Orange Money, virement bancaire, crédit B2B (sur validation).' },
    { title:'4. Livraison', content:'Expédition sous 48h ouvrées. Livraisons dans les principales villes camerounaises.' },
    { title:'5. Retours', content:'14 jours pour pièces défectueuses. 7 jours pour changement d\'avis (non montées). Remboursement sous 5 jours ouvrés.' },
    { title:'6. Garantie', content:'Pièces neuves: 2 ans. Occasion vérifiées: 6 mois. Reconditionnées: 3 mois.' },
    { title:'7. Droit applicable', content:'Droit camerounais. Litiges soumis aux tribunaux de Douala.' },
  ],
};
const RETURN_POLICY = {
  summary:'Retour gratuit sous 14 jours (pièces défectueuses) — 7 jours (changement d\'avis, non montées)',
  steps:[
    { step:1, title:'Créer la demande', desc:'Espace client → Mes commandes → Retourner un article' },
    { step:2, title:'Emballer la pièce', desc:'Emballage d\'origine avec numéro de commande' },
    { step:3, title:'Déposer le colis', desc:'Point de collecte partenaire ou enlèvement à domicile' },
    { step:4, title:'Remboursement', desc:'Vérification sous 48h — remboursement sous 5 jours ouvrés' },
  ],
  reasons:[
    { code:'defective',        label:'Pièce défectueuse',        delay:14, frais:'AutoParts' },
    { code:'wrong_item',       label:'Mauvaise pièce reçue',     delay:14, frais:'AutoParts' },
    { code:'damaged_shipping', label:'Endommagé au transport',   delay:14, frais:'AutoParts' },
    { code:'not_as_described', label:'Non conforme à l\'annonce',delay:14, frais:'AutoParts' },
    { code:'changed_mind',     label:'Changement d\'avis',       delay:7,  frais:'Client' },
  ],
  exclusions:['Pièces montées ou utilisées','Fluides (huiles, liquides de frein)','Commandes sur mesure'],
};
legalRouter.get('/cgv',     (_req:Request,res:Response) => res.json(ApiResponse.success(CGV)));
legalRouter.get('/returns', (_req:Request,res:Response) => res.json(ApiResponse.success(RETURN_POLICY)));
legalRouter.get('/privacy', (_req:Request,res:Response) => res.json(ApiResponse.success({ version:'1.0', rights:'Accès, rectification, suppression via espace client ou privacy@autoparts.cm.', contact:'privacy@autoparts.cm' })));
legalRouter.get('/summary', (_req:Request,res:Response) => res.json(ApiResponse.success({ cgv:'1.0', returns:'1.0', privacy:'1.0', updatedAt:'2024-01-01' })));
