import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, Input } from '@autoparts/ui';
import { authApi } from '@autoparts/api';
import { useAuthStore } from '@/store/auth.store';
import { homeForRoles } from '@/store/auth.store';

export default function OtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? '';
  const { user, isAuthenticated, setSession } = useAuthStore();

  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  // Cooldown 60 s après un renvoi
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

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

  const code = digits.join('');

  const setDigit = (i: number, v: string) => {
    const next = [...digits];
    next[i] = v.replace(/\D/g, '').slice(-1);
    setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
  };

  const verify = async () => {
    if (code.length !== 6) return;
    if (!isAuthenticated) {
      toast.error('Session introuvable — reconnectez-vous.');
      navigate('/auth/connexion');
      return;
    }
    setLoading(true);
    try {
      await authApi.verifyEmail(code);
      const me = await authApi.me();
      if (user) setSession(useAuthStore.getState().tokens!, { ...user, ...me });
      toast.success('Email vérifié — votre compte est actif !');
      navigate(homeForRoles(me.roles), { replace: true });
    } catch (e) {
      toast.error((e as Error).message ?? 'Code invalide');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 text-center">
      <div>
        <h1 className="text-xl font-bold">Vérification email</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saisissez le code à 6 chiffres envoyé à{' '}
          <span className="font-medium text-foreground">{email || user?.email || 'votre adresse'}</span>.
          <br />
          Le code est valable 10 minutes.
        </p>
      </div>

      <div className="flex justify-center gap-2">
        {digits.map((d, i) => (
          <Input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="h-12 w-11 text-center text-lg font-bold"
            maxLength={2}
            inputMode="numeric"
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
          />
        ))}
      </div>

      <Button className="w-full" loading={loading} disabled={code.length !== 6} onClick={verify}>
        Vérifier mon email
      </Button>

      <div className="text-xs text-muted-foreground">
        {resent && <p className="mb-1 text-success">Un nouveau code vient d'être envoyé.</p>}
        Code non reçu ?{' '}
        {cooldown > 0 ? (
          <span>Nouveau code possible dans {cooldown} s</span>
        ) : (
          <button className="font-medium text-primary hover:underline" onClick={() => void resend()}>
            Renvoyer le code
          </button>
        )}
        <br />
        Vérifiez aussi vos spams — le code est valable 10 minutes.
      </div>
    </div>
  );
}
