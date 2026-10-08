// ── Design tokens AutoParts — source unique des mesures ────────
// Langage visuel inspiré d'un système "dock flottant + pilules" :
// surfaces neutres, cartes blanches sur fond gris-clair, rayons généreux,
// une seule couleur d'action (bleu AutoParts), accent orange pour le scan/CTA.

/** Échelle typographique — police système (pas d'assets de polices). */
export const type = {
  display: { fontSize: 34, lineHeight: 40, letterSpacing: -0.6, fontWeight: '700' },
  h1: { fontSize: 25, lineHeight: 31, letterSpacing: -0.3, fontWeight: '700' },
  h2: { fontSize: 19, lineHeight: 25, letterSpacing: -0.1, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: 0.1 },
  label: { fontSize: 12, lineHeight: 16, letterSpacing: 1.1, fontWeight: '600' },
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const motion = {
  fast: 180,
  base: 280,
  slow: 420,
  easingStandard: [0.22, 1, 0.36, 1] as const,
};

/** Couleurs de marque — palette fournie : primaire rouge, accent cobalt, succès émeraude. */
export const brand = {
  primary: '#C92F3E',
  primaryPressed: '#A82634',
  accent: '#3874FF',
  accentPressed: '#2C5CE0',
  success: '#22C55E',
  danger: '#C92F3E',
} as const;

export const layout = {
  screenPadding: space.xl,
  dockHeight: 64,
  dockRadius: 26,
  scanButtonSize: 58,
} as const;
