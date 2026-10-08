import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button, Input, Checkbox, GoogleAuthButton } from '@autoparts/ui';
import { loginSchema } from '@autoparts/utils';
import { authApi, type AuthPayload } from '@autoparts/api';
import { useAuthStore, homeForRoles } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';

type LoginValues = { email: string; password: string; rememberMe?: boolean };

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const syncGuestCart = useCartStore((s) => s.syncGuestCartAfterLogin);
  const [twoFA, setTwoFA] = useState<{ twoFAToken: string } | null>(null);
  const [twofaCode, setTwofaCode] = useState('');
  const [twofaLoading, setTwofaLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from;
  const showForgot = new URLSearchParams(location.search).has('forgot');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const finalize = async (result: AuthPayload) => {
    setSession(
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      result.user,
    );
    await syncGuestCart();
    toast.success(`Bienvenue ${result.user.firstName} !`);
    navigate(from ?? homeForRoles(result.user.roles), { replace: true });
  };

  const handleGoogleCredential = async (idToken: string) => {
    const result = await authApi.googleLogin({ idToken });
    await finalize({ ...result });
    if (result.created) {
      toast.success('Compte créé via Google — bienvenue !');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await authApi.login({
        email: values.email,
        password: values.password,
        remember: values.rememberMe,
      });
      if ('requiresTwoFA' in result) {
        setTwoFA({ twoFAToken: result.twoFAToken });
        return;
      }
      await finalize(result);
    } catch (e) {
      const apiErr = e as { statusCode?: number; message?: string };
      if (apiErr.statusCode === 403) {
        // Compte non vérifié : pas de formulaire OTP ici — la validation se
        // fait uniquement dans le flux d'inscription. On informe l'utilisateur.
        setFormError(
          "Compte non vérifié. Un code de validation à 6 chiffres vous a été envoyé par email lors de la création de votre compte (valable 10 min). Code perdu ? Contactez le support pour en recevoir un nouveau.",
        );
        return;
      }
      setFormError(apiErr.message ?? 'Connexion impossible');
    }
  });

  const onVerify2FA = async () => {
    if (!twoFA) return;
    setTwofaLoading(true);
    try {
      const result = await authApi.loginVerify2FA(twoFA.twoFAToken, twofaCode);
      await finalize(result);
    } catch (e) {
      toast.error((e as Error).message ?? 'Code 2FA invalide');
    } finally {
      setTwofaLoading(false);
    }
  };

  if (twoFA) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Double authentification</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez le code à 6 chiffres de votre application d'authentification.
        </p>
        <Input
          placeholder="123456"
          maxLength={6}
          inputMode="numeric"
          value={twofaCode}
          onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, ''))}
        />
        <Button className="w-full" loading={twofaLoading} disabled={twofaCode.length !== 6} onClick={onVerify2FA}>
          Valider
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Connexion</h1>
        <p className="mt-1 text-sm text-muted-foreground">Accédez à votre compte acheteur ou vendeur.</p>
      </div>

      {showForgot && <ForgotPasswordInline />}

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <Input type="email" placeholder="vous@example.cm" {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Mot de passe</label>
          <Input type="password" placeholder="••••••••" {...register('password')} />
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <div className="flex items-center justify-between">
          <Checkbox id="remember" label="Se souvenir de moi" {...register('rememberMe')} />
          <Link to="?forgot=1" className="text-xs text-primary hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Se connecter
        </Button>
      </form>

      <div className="relative text-center">
        <span className="relative z-10 bg-card px-2 text-xs text-muted-foreground">ou</span>
        <div className="absolute left-0 top-1/2 w-full border-t border-border" />
      </div>

      <GoogleAuthButton onCredential={handleGoogleCredential} />

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link to="/auth/inscription" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  );
}

/** Réinitialisation de mot de passe (routes réelles /auth/forgot-password + /auth/reset-password). */
function ForgotPasswordInline() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  if (sent) {
    return (
      <p className="rounded-input bg-success/10 px-3 py-2 text-sm text-success">
        Si un compte existe pour {email}, un email de réinitialisation vient d'être envoyé (valable 1 h).
      </p>
    );
  }

  return (
    <form
      className="space-y-2 rounded-card bg-muted/50 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await authApi.forgotPassword(email);
          setSent(true);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <label className="block text-sm font-medium">Réinitialiser le mot de passe</label>
      <Input
        type="email"
        required
        placeholder="Votre email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="sm" variant="outline" loading={loading}>
        Envoyer le lien
      </Button>
    </form>
  );
}
