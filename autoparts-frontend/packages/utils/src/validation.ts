// ── Schémas Zod partagés (web + mobile) ────────────────────────
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  rememberMe: z.boolean().optional(),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: z.string().min(2, 'Prénom requis'),
    lastName: z.string().min(2, 'Nom requis'),
    email: z.string().email('Email invalide'),
    password: z
      .string()
      .min(8, '8 caractères minimum')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmPassword: z.string(),
    accountType: z.enum(['individual', 'pro']).default('individual'),
    orgName: z.string().optional(),
    orgType: z.enum(['importer', 'wholesaler', 'retailer', 'garage']).optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })
  .refine((d) => d.accountType !== 'pro' || (d.orgName ?? '').length >= 2, {
    message: "Nom de l'organisation requis pour un compte pro",
    path: ['orgName'],
  })
  .refine((d) => d.accountType !== 'pro' || Boolean(d.orgType), {
    message: "Type d'activité requis pour un compte pro",
    path: ['orgType'],
  });
export type RegisterDto = z.infer<typeof registerSchema>;

export const otpSchema = z.object({
  token: z.string().length(6, 'Code à 6 chiffres'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Token requis'),
    password: z
      .string()
      .min(8, '8 caractères minimum')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z
      .string()
      .min(8, '8 caractères minimum')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export const addressSchema = z.object({
  label: z.string().min(1, 'Libellé requis'),
  street: z.string().min(5, 'Adresse (rue) requise — 5 caractères min.'),
  city: z.string().min(2, 'Ville requise'),
  postalCode: z.string().max(20).optional(),
  countryCode: z.string().length(2).default('CM'),
  isDefault: z.boolean().optional(),
});
export type AddressDto = z.infer<typeof addressSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10, 'Commentaire trop court (10 caractères min.)'),
});

export const checkoutSchema = z.object({
  shippingAddressId: z.string().uuid('Choisissez une adresse de livraison'),
  billingAddressId: z.string().uuid().optional(),
  note: z.string().optional(),
  poNumber: z.string().optional(),
});
