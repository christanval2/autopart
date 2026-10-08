import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button, Input, Select, GoogleAuthButton } from '@autoparts/ui';
import { registerSchema } from '@autoparts/utils';
import { authApi } from '@autoparts/api';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';

type RegisterValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  accountType: 'individual' | 'pro';
  orgName?: string;
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const syncGuestCart = useCartStore((s) => s.syncGuestCartAfterLogin);

  // Le formulaire OTP est affiché en place, juste après la création du compte
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [pendingEmail, setPendingEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { accountType: 'individual' },
  });

  const accountType = watch('accountType');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await authApi.register({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
        accountType: values.accountType,
        orgName: values.orgName,
      });
      setSession(
        { accessToken: result.accessToken, refreshToken: result.refreshToken },
        result.user,
      );
      await syncGuestCart();
      setPendingEmail(values.email);
      setStep('otp');
    } catch (e) {
      const apiErr = e as { message?: string; details?: Array<{ field: string; message: string }> };
      if (apiErr.details?.length) {
        setError('root', { message: apiErr.details.map((d) => d.message).join(' · ') });
      } else {
        setError('root', { message: apiErr.message ?? 'Inscription impossible' });
      }
    }
  });

  // ── Étape 2 : vérification OTP (affichée sur cette même page) ──
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      await authApi.verifyEmail(code);
      const me = await authApi.me();
      const { user, tokens } = useAuthStore.getState();
      if (tokens) setSession(tokens, { ...user!, ...me });
      await syncGuestCart();
      toast.success('Email vérifié — bienvenue !');
      navigate('/', { replace: true });
    } catch (e) {
      toast.error((e as Error).message ?? 'Code invalide');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    try {
      await authApi.resendOtp();
      setCooldown(60);
      setResent(true);
      toast.success('Nouveau code envoyé par email');
    } catch (e) {
      toast.error((e as Error).message ?? 'Renvoi impossible');
    }
  };

  if (step === 'otp') {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-bold">Vérification email</h1>
          <p className="mt-1 text-sm text-slate-500">
            Un code à 6 chiffres a été envoyé à{' '}
            <span className="font-medium text-foreground">{pendingEmail}</span>.
            <br />
            Il est valable 10 minutes.
          </p>
        </div>

        <Input
          className="h-12 text-center text-lg font-bold tracking-[8px]"
          placeholder="000000"
          maxLength={6}
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && verify()}
        />

        <Button className="w-full" loading={verifying} disabled={code.length !== 6} onClick={verify}>
          Vérifier mon email
        </Button>

        <div className="text-center text-xs text-muted-foreground">
          {resent && <p className="mb-1 text-success">Un nouveau code vient d'être envoyé.</p>}
          {cooldown > 0 ? (
            <span>Nouveau code possible dans {cooldown} s</span>
          ) : (
            <button className="font-medium text-primary hover:underline" onClick={() => void resend()}>
              Renvoyer le code
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleGoogleCredential = async (idToken: string) => {
    const result = await authApi.googleLogin({ idToken });
    // Un compte créé via Google est déjà vérifié par Google : pas d'étape OTP
    setSession(
      { accessToken: result.accessToken, refreshToken: result.refreshToken },
      result.user,
    );
    await syncGuestCart();
    toast.success(result.created ? 'Compte créé via Google — bienvenue !' : 'Connexion réussie');
    navigate('/', { replace: true });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Créer un compte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Particulier ou professionnel (importateur, grossiste, garage…).
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <div className="grid grid-cols-2 gap-2">
          {(['individual', 'pro'] as const).map((t) => (
            <label
              key={t}
              className={`cursor-pointer rounded-input border px-3 py-2 text-center text-sm font-medium ${
                accountType === t
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input text-muted-foreground'
              }`}
            >
              <input type="radio" value={t} className="hidden" {...register('accountType')} />
              {t === 'individual' ? 'Particulier' : 'Professionnel'}
            </label>
          ))}
        </div>

        {accountType === 'pro' && (
          <div className='space-y-3'>
            <div>
              <label className="mb-1 block text-sm font-medium">Nom de l'organisation</label>
              <Input placeholder="Garage Dupont SARL" {...register('orgName')} />
              {errors.orgName && <p className="mt-1 text-xs text-destructive">{errors.orgName.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Type d'activité</label>
              <select
                className="w-full rounded-input border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                {...register('orgType')}
              >
                <option value="">Choisir…</option>
                <option value="importer">Importateur (vente par palette)</option>
                <option value="wholesaler">Grossiste (vente par carton)</option>
                <option value="retailer">Détaillant (acheteur)</option>
                <option value="garage">Garage (acheteur)</option>
              </select>
              {errors.orgType && <p className="mt-1 text-xs text-destructive">{errors.orgType.message}</p>}
              <p className="mt-1 text-xs text-muted-foreground">
                Documents requis pour vendre (après activation du compte) : RCCM, patente, statuts, CNI.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Prénom</label>
            <Input placeholder="Jean" {...register('firstName')} />
            {errors.firstName && <p className="mt-1 text-xs text-destructive">{errors.firstName.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Nom</label>
            <Input placeholder="Dupont" {...register('lastName')} />
            {errors.lastName && <p className="mt-1 text-xs text-destructive">{errors.lastName.message}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <Input type="email" placeholder="vous@example.cm" {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Mot de passe</label>
            <Input type="password" placeholder="••••••••" {...register('password')} />
            {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Confirmation</label>
            <Input type="password" placeholder="••••••••" {...register('confirmPassword')} />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
        </div>

        {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Créer mon compte
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          En créant un compte vous acceptez les CGV (TVA 19,25% applicable).
        </p>
      </form>

      <GoogleAuthButton label="S'inscrire avec Google" onCredential={handleGoogleCredential} />

      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{' '}
        <a href="/auth/connexion" className="font-medium text-primary hover:underline">
          Se connecter
        </a>
      </p>
    </div>
  );
}
