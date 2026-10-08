// ── OCR : lecture photo d'étiquette / carte grise (OCR.space) ──
// POST /ocr/parse  (multipart image) → texte + références détectées
//
// Cas d'usage marketplace :
//  - vendeur : photographier l'étiquette d'une pièce pour préremplir
//    la référence OEM lors de la création produit ;
//  - acheteur : photographier une pièce pour lancer la recherche.
import { Router, Request, Response, NextFunction } from 'express';
import multer            from 'multer';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { authenticate }   from '../../middlewares';
import { env }            from '../../config/env';
import { logger }         from '../../shared/utils/logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non supporté (JPEG, PNG, WebP)'));
  },
});

/**
 * Extrait les références auto du texte OCR :
 *  - à tirets : 58411-1G300, 0-986-494-557 (ex. Toyota, Bosch)
 *  - alphanumériques mixtes : EA770, 0K986 (≥5 caractères, lettres+chiffres)
 */
function extractReferences(text: string): { oem: string[]; skus: string[] } {
  const isCode = (s: string) => /\d/.test(s) && /[A-Z]/.test(s) && s.length >= 5 && s.length <= 18;
  // Références à tirets (58411-1G300) — les espaces les séparent des mots
  const dashRefs = text.match(/\b[A-Z0-9]{2,}(?:-[A-Z0-9]{1,7}){1,3}\b/g) ?? [];
  // Codes mixtes compacts (EA770, 0K986)
  const plainRefs = text.match(/\b(?=[A-Z0-9]{5,14}\b)(?=[A-Z]*\d)[A-Z0-9]+\b/g) ?? [];
  const oem = [...new Set(
    [...dashRefs, ...plainRefs].filter(isCode),
  )].slice(0, 6);
  const skuMatches = text.match(/\b(?:SKU|VAR)-\d{3,8}\b/gi) ?? [];
  const skus = [...new Set(skuMatches.map(s => s.toUpperCase()))].slice(0, 5);
  return { oem, skus };
}

async function ocrSpace(buffer: Buffer, language: string): Promise<string> {
  const key = env.OCR_API_KEY;
  if (!key) throw ApiError.badRequest('OCR non configuré (OCR_API_KEY manquant)');

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)]), 'upload.jpg');
  form.append('language', language);
  form.append('OCREngine', '2'); // moteur 2 : meilleur sur texte imprimé/étiquettes
  form.append('scale', 'true');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { apikey: key },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    logger.warn(`OCR.space → ${res.status}`);
    throw ApiError.internal('Service OCR indisponible');
  }
  const json: any = await res.json();
  if (json.IsErroredOnProcessing) {
    throw ApiError.badRequest((json.ErrorMessage?.[0] as string) ?? 'Image illisible');
  }
  return (json.ParsedResults ?? [])
    .map((r: any) => String(r.ParsedText ?? ''))
    .join('\n')
    .replace(/\r/g, '')
    .trim();
}

export const ocrRouter = Router();

ocrRouter.use(authenticate);
ocrRouter.post('/parse', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return next(ApiError.badRequest('Aucune image envoyée'));
    const language = String(req.body.language ?? 'fre');
    const text = await ocrSpace(req.file.buffer, language);
    res.json(ApiResponse.success({
      text,
      references: extractReferences(text),
      confidence: text.length > 0,
    }, 'Image analysée'));
  } catch (e) { next(e); }
});
