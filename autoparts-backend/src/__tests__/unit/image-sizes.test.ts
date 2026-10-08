// ═══════════════════════════════════════════════════════════════
//  TESTS — Génération multi-tailles d'images produits (E5)
//  Vérifie que sharp produit bien 3 buffers webp aux dimensions
//  attendues (thumb 150 / medium 600 / large 1200, fit inside).
// ═══════════════════════════════════════════════════════════════

import sharp from 'sharp';

// PNG 1200x900 généré à la volée (pas de fixture nécessaire)
async function makeTestImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 60 } },
  }).png().toBuffer();
}

const TARGETS = { thumb: 150, medium: 600, large: 1200 } as const;

describe('Images multi-tailles (sharp)', () => {
  for (const [name, width] of Object.entries(TARGETS) as Array<[keyof typeof TARGETS, number]>) {
    it(`${name} : largeur ≤ ${width}px et format webp`, async () => {
      const input = await makeTestImage(2000, 1400); // plus grand que toutes les cibles
      const out = await sharp(input)
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const meta = await sharp(out).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBeDefined();
      expect(meta.width!).toBeLessThanOrEqual(width);
      expect(meta.height!).toBeLessThanOrEqual(width);
    });
  }

  it('withoutEnlargement : une petite image n\'est pas agrandie', async () => {
    const input = await makeTestImage(80, 60);
    const out = await sharp(input)
      .resize({ width: 150, height: 150, fit: 'inside', withoutEnlargement: true })
      .webp().toBuffer();
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(80);
  });
});
