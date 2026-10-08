import { Router, Request, Response, NextFunction } from 'express';
import multer            from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { Readable }      from 'stream';
import sharp             from 'sharp';
import { promises as fs } from 'fs';
import * as path         from 'path';
import { AppDataSource } from '../../config/database';
import { ProductImage }  from '../../entities/ProductImage';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { authenticate, authorize } from '../../middlewares';
import { env }           from '../../config/env';
import { logger }        from '../../shared/utils/logger';

cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET });

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg','image/jpg','image/png','image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté (JPEG, PNG, WebP)'));
    }
  },
});

// Stockage local de repli (dev) — servi statiquement par app.ts sous /uploads
const LOCAL_UPLOAD_DIR = path.resolve('uploads', 'products');

async function toCloudinary(buffer: Buffer, folder: string, publicId?: string): Promise<{ url:string; publicId:string }> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder:`autoparts/${folder}`, public_id:publicId, resource_type:'image', quality:'auto:good', fetch_format:'auto', transformation:[{ width:1200, height:1200, crop:'limit' }] },
      (err, result) => err || !result ? reject(err) : resolve({ url:result.secure_url, publicId:result.public_id }),
    );
    Readable.from(buffer).pipe(stream);
  });
}

// E5 — 3 tailles générées localement (webp) puis poussées sur Cloudinary
const SIZES = { thumb: 150, medium: 600, large: 1200 } as const;
type SizeKey = keyof typeof SIZES;

async function generateSizes(buffer: Buffer): Promise<Record<SizeKey, Buffer>> {
  const out = {} as Record<SizeKey, Buffer>;
  for (const [name, width] of Object.entries(SIZES) as Array<[SizeKey, number]>) {
    out[name] = await sharp(buffer)
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: name === 'thumb' ? 70 : 82 })
      .toBuffer();
  }
  return out;
}

async function uploadSizes(
  buffer: Buffer, productId: string, useCloudinary: boolean,
): Promise<{ url: string; publicId: string; sizes: Record<SizeKey, string> }> {
  const sizeBuffers = await generateSizes(buffer);
  const stamp = Date.now();

  if (useCloudinary) {
    const uploaded: Record<SizeKey, string> = {} as Record<SizeKey, string>;
    for (const [name, buf] of Object.entries(sizeBuffers) as Array<[SizeKey, Buffer]>) {
      const r = await toCloudinary(buf, 'products', `product_${productId}_${stamp}_${name}`);
      uploaded[name] = r.url;
    }
    return { url: uploaded.large, publicId: `autoparts/products/product_${productId}_${stamp}_large`, sizes: uploaded };
  }

  // Stockage local : thumb/medium/large côte à côte
  await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  const ext = '.webp';
  const uploaded: Record<SizeKey, string> = {} as Record<SizeKey, string>;
  for (const [name, buf] of Object.entries(sizeBuffers) as Array<[SizeKey, Buffer]>) {
    const filename = `product_${productId}_${stamp}_${name}${ext}`;
    await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, filename), buf);
    uploaded[name] = `/uploads/products/${filename}`;
  }
  return { url: uploaded.large, publicId: `local/products/product_${productId}_${stamp}_large`, sizes: uploaded };
}


export const UploadsService = {
  async uploadProductImage(productId:string, buffer:Buffer, originalname:string, isPrimary=false, mimetype='image/jpeg'): Promise<ProductImage> {
    let url: string; let pid: string; let sizes: Record<SizeKey, string> | undefined;
    const useCloudinary = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY);
    if (useCloudinary) {
      try {
        const r = await uploadSizes(buffer, productId, true);
        url = r.url; pid = r.publicId; sizes = r.sizes;
      } catch (e) {
        // Cloudinary invalide/indisponible : repli transparent sur le stockage
        // local plutôt qu'un 500 — les images restent servies par le backend.
        logger.warn('Cloudinary échoué — repli stockage local:', (e as Error).message);
        const r = await uploadSizes(buffer, productId, false);
        url = r.url; pid = r.publicId; sizes = r.sizes;
      }
    } else {
      logger.warn('Cloudinary non configuré — stockage local (dev)');
      const r = await uploadSizes(buffer, productId, false);
      url = r.url; pid = r.publicId; sizes = r.sizes;
    }
    if (isPrimary) await AppDataSource.getRepository(ProductImage).update({ product:{ id:productId } as any }, { isPrimary:false });
    const repo = AppDataSource.getRepository(ProductImage);
    return repo.save(repo.create({
      product:{ id:productId } as any,
      url, sizes,
      altText: originalname.replace(/\.[^.]+$/,'').replace(/_/g,' '),
      isPrimary,
    }));
  },
  async deleteProductImage(imageId:string): Promise<void> {
    const repo  = AppDataSource.getRepository(ProductImage);
    const image = await repo.findOneByOrFail({ id: imageId });
    if (env.CLOUDINARY_CLOUD_NAME && image.url.includes('cloudinary.com')) {
      const pub = image.url.split('/').slice(-2).join('/').replace(/\.[^.]+$/,'');
      await cloudinary.uploader.destroy(pub).catch(e => logger.warn('Cloudinary delete:',e));
    } else if (image.url.startsWith('/uploads/products/')) {
      // Fichiers locaux : supprimer les 3 tailles (même préfixe) pour éviter les orphelins
      const files = await fs.readdir(LOCAL_UPLOAD_DIR).catch(() => [] as string[]);
      const stamp = path.basename(image.url).replace(/\.(webp|jpg|jpeg|png)$/i, '').replace(/_(thumb|medium|large)$/, '');
      for (const f of files.filter(name => name.startsWith(`${stamp}`))) {
        await fs.unlink(path.join(LOCAL_UPLOAD_DIR, f)).catch(() => undefined);
      }
    }
    await repo.remove(image);
  },
};

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);

uploadsRouter.post('/products/:productId',
  authorize('seller','org_admin','super_admin'),
  upload.single('image'),
  async (req:Request,res:Response,next:NextFunction) => {
    try {
      if (!req.file) return next(ApiError.badRequest('Aucun fichier envoyé'));
      const img = await UploadsService.uploadProductImage(req.params.productId, req.file.buffer, req.file.originalname, req.body.isPrimary==='true', req.file.mimetype);
      res.status(201).json(ApiResponse.created(img,'Image uploadée'));
    } catch(e){next(e);}
  },
);

uploadsRouter.delete('/images/:imageId',
  authorize('seller','org_admin','super_admin'),
  async (req:Request,res:Response,next:NextFunction) => {
    try { await UploadsService.deleteProductImage(req.params.imageId); res.json(ApiResponse.noContent()); } catch(e){next(e);}
  },
);

uploadsRouter.post('/products/:productId/bulk',
  authorize('seller','org_admin','super_admin'),
  upload.array('images', 8),
  async (req:Request,res:Response,next:NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files?.length) return next(ApiError.badRequest('Aucun fichier envoyé'));
      const results = await Promise.all(files.map((f,i) => UploadsService.uploadProductImage(req.params.productId, f.buffer, f.originalname, i===0)));
      res.status(201).json(ApiResponse.success(results,`${results.length} image(s) uploadée(s)`));
    } catch(e){next(e);}
  },
);
