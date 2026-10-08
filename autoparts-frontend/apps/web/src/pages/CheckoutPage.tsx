// ── Checkout : adresse → paiement → confirmation ───────────────
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Banknote, CheckCircle2, CreditCard, Smartphone, Store, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, EmptyState, Input, PriceTag } from '@autoparts/ui';
import { addressesApi, ordersApi, paymentsApi } from '@autoparts/api';
import type { MomoProvider } from '@autoparts/types';
import { formatPrice } from '@autoparts/utils';
import { useCartStore, selectCartItems, selectCartCount, selectCartSubtotal } from '@/store/cart.store';
import { useAuthStore } from '@/store/auth.store';
import type { Order, PaymentStatus } from '@autoparts/types';

type Step = 'address' | 'payment' | 'waiting' | 'done' | 'failed';

type MethodChoice = 'mobile_money' | 'bank_transfer' | 'cash' | 'credit';

const METHOD_LABELS: Record<MethodChoice, { label: string; icon: ReactNode; hint: string }> = {
  mobile_money: {
    label: 'Mobile Money',
    icon: <Smartphone strokeWidth={1.5} className="h-5 w-5" />,
    hint: 'MTN MoMo (push USSD) ou Orange Money',
  },
  bank_transfer: {
    label: 'Virement bancaire',
    icon: <Banknote strokeWidth={1.5} className="h-5 w-5" />,
    hint: 'Instructions envoyées par email, confirmation par le comptable',
  },
  cash: {
    label: 'Espèces à la livraison',
    icon: <Store strokeWidth={1.5} className="h-5 w-5" />,
    hint: 'Payez en recevant votre colis',
  },
  credit: {
    label: 'Crédit B2B (30j)',
    icon: <CreditCard strokeWidth={1.5} className="h-5 w-5" />,
    hint: 'Sous réserve de la limite de crédit de votre organisation',
  },
};

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const serverItems = useCartStore(selectCartItems);
  const count = useCartStore(selectCartCount);
  const subtotal = useCartStore(selectCartSubtotal);
  const fetchCart = useCartStore((s) => s.fetchServerCart);

  const [step, setStep] = useState<Step>('address');
  const [shippingAddressId, setShippingAddressId] = useState('');
  const [method, setMethod] = useState<MethodChoice>('mobile_money');
  const [provider, setProvider] = useState<MomoProvider>('mtn');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: addresses = [] } = useQuery({
    queryKey: ['addresses'],
    queryFn: addressesApi.list,
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (addresses.length > 0 && !shippingAddressId) {
      setShippingAddressId(addresses.find((a) => a.isDefault)?.id ?? addresses[0].id);
    }
  }, [addresses, shippingAddressId]);

  const estimatedTax = subtotal * 0.1925;

  const lines = useMemo(
    () =>
      serverItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    [serverItems],
  );

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Connectez-vous pour finaliser votre commande"
          description="Votre panier sera conservé et fusionné après connexion."
          action={<Link to="/auth/connexion"><Button>Se connecter</Button></Link>}
        />
      </div>
    );
  }

  if (count === 0 && step !== 'done' && step !== 'waiting' && step !== 'failed') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Panier vide"
          description="Ajoutez des articles avant de passer au checkout."
          action={<Link to="/catalogue"><Button>Voir le catalogue</Button></Link>}
        />
      </div>
    );
  }

  const submitOrder = async () => {
    try {
      const created = await ordersApi.create({
        channel: (user?.accountType ?? 'individual') === 'pro' ? 'b2b' : 'b2c',
        shippingAddressId,
        lines,
        currency: 'XAF',
        note: note || undefined,
      });
      setOrder(created);

      if (method === 'credit') {
        // Paiement différé : la commande part en pending côté comptabilité
        toast.success('Commande enregistrée — paiement à crédit soumis à validation');
        await fetchCart();
        setStep('done');
        return;
      }

      const useCinetpay = method === 'mobile_money' && provider === 'cinetpay';
      const payment = await paymentsApi.create({
        orderId: created.id,
        method,
        phone: method === 'mobile_money' && !useCinetpay ? phone : undefined,
        provider: method === 'mobile_money' ? provider : undefined,
      });
      setPaymentId(payment.id);
      setStep('waiting');

      // CinetPay : redirection vers la page de paiement hébergée
      // (paymentUrl renvoyé par l'API, stocké dans gatewayResponse)
      const redirectUrl = (payment.gatewayResponse as { paymentUrl?: string } | null)?.paymentUrl;
      if (useCinetpay && redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }

      // Polling statut (webhook absent) — 30 min max côté backend, UI : 2 min
      pollRef.current = setInterval(async () => {
        try {
          const st = await paymentsApi.status(payment.id);
          if (st.status === ('completed' as PaymentStatus)) {
            stopPoll();
            await fetchCart();
            setStep('done');
          } else if (st.status === ('failed' as PaymentStatus)) {
            stopPoll();
            setStep('failed');
          }
        } catch {
          // ignore, on retente au tick suivant
        }
      }, 3000);
    } catch (e) {
      toast.error((e as Error).message ?? 'Commande impossible');
    }
  };

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  // ── Écrans finaux ────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <CheckCircle2 strokeWidth={1.5} className="mx-auto h-16 w-16 text-success" />
        <h1 className="mt-4 text-2xl font-bold">Commande enregistrée !</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Numéro de commande : <span className="font-mono font-semibold">{order?.orderNumber}</span>
          <br />
          {method === 'bank_transfer' && 'Les instructions de virement vous ont été envoyées par email.'}
          {method === 'credit' && 'Le paiement à crédit est en attente de validation comptable.'}
          {(method === 'mobile_money' || method === 'cash') && 'Vous recevrez un email de confirmation.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/commandes"><Button>Mes commandes</Button></Link>
          <Link to="/catalogue"><Button variant="outline">Continuer mes achats</Button></Link>
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <Loader2 strokeWidth={1.5} className="mx-auto h-14 w-14 animate-spin text-accent" />
        <h1 className="mt-4 text-xl font-bold">
          {method === 'mobile_money' && provider === 'cinetpay'
            ? 'Redirection vers la page de paiement sécurisée CinetPay…'
            : method === 'mobile_money'
            ? `Confirmez sur votre téléphone ${provider === 'mtn' ? 'MTN' : 'Orange'}…`
            : 'Paiement en cours de vérification…'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {method === 'mobile_money' && provider === 'cinetpay'
            ? 'Vous allez choisir MTN MoMo ou Orange Money et valider sur votre téléphone.'
            : method === 'mobile_money'
            ? `Une demande de paiement a été envoyée au ${phone}. Validez avec votre code secret.`
            : 'Nous vérifions votre paiement, ne fermez pas cette page.'}
        </p>
      </div>
    );
  }

  if (step === 'failed') {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-destructive">Le paiement a échoué ou a expiré</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Votre commande est conservée en brouillon — vous pouvez réessayer le paiement.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => setStep('payment')}>
          Réessayer le paiement
        </Button>
      </div>
    );
  }

  const stepIndex = step === 'address' ? 0 : 1;
  const STEP_LABELS = ['Adresses', 'Paiement', 'Confirmation'];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 font-display text-2xl font-bold">Finaliser ma commande</h1>

      {/* Indicateur d'étapes */}
      <ol className="mb-8 flex items-center gap-2">
        {STEP_LABELS.map((label, i) => {
          const cls =
            i < stepIndex
              ? 'bg-success text-success-foreground'
              : i === stepIndex
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground';
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${cls}`}>
                {i + 1}
              </span>
              <span className={`hidden text-xs font-medium sm:block ${i === stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          );
        })}
      </ol>


      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Étape 1 : adresse */}
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
                <h2 className="font-semibold">Adresse de livraison</h2>
              </div>
              {addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune adresse — <Link to="/compte" className="text-primary hover:underline">ajoutez-en une dans votre compte</Link>.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {addresses.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setShippingAddressId(a.id)}
                      className={`rounded-input border p-3 text-left text-sm ${
                        shippingAddressId === a.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border'
                      }`}
                    >
                      <div className="font-medium">{a.label}</div>
                      <div className="text-muted-foreground">{a.street}, {a.city}</div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Étape 2 : paiement */}
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
                <h2 className="font-semibold">Mode de paiement</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(METHOD_LABELS) as MethodChoice[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    disabled={m === 'credit' && user?.accountType !== 'pro'}
                    className={`flex items-start gap-3 rounded-input border p-3 text-left text-sm disabled:opacity-40 ${
                      method === m
                        ? 'border-primary bg-primary/10'
                        : 'border-border'
                    }`}
                  >
                    {METHOD_LABELS[m].icon}
                    <span>
                      <span className="block font-medium">{METHOD_LABELS[m].label}</span>
                      <span className="block text-xs text-muted-foreground">{METHOD_LABELS[m].hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              {method === 'mobile_money' && provider !== 'cinetpay' && (
                <div className="space-y-3 rounded-input bg-muted/50 p-3">
                  <div className="flex gap-2">
                    {(['mtn', 'orange', 'cinetpay'] as MomoProvider[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setProvider(p)}
                        className={`flex-1 rounded-input border py-2 text-sm font-semibold ${
                          provider === p ? 'border-primary bg-card' : 'border-border text-muted-foreground'
                        }`}
                      >
                        {p === 'mtn' ? 'MTN MoMo' : p === 'orange' ? 'Orange Money' : 'CinetPay (MoMo/Orange)'}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="+237 6XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Vous recevrez une demande de confirmation (push USSD) sur ce numéro. Commande
                    annulée après 30 min sans paiement.
                  </p>
                </div>
              )}

              {method === 'bank_transfer' && (
                <p className="rounded-input bg-muted/50 p-3 text-xs text-muted-foreground">
                  Les coordonnées bancaires (RIB + référence unique) seront envoyées par email.
                  La commande est expédiée après confirmation du virement par notre comptabilité.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Récap */}
        <Card className="h-fit">
          <CardContent className="space-y-3">
            <h2 className="font-semibold">Récapitulatif ({count} article(s))</h2>
            <div className="flex justify-between text-sm"><span>Sous-total</span><span>{formatPrice(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-muted-foreground"><span>dont TVA 19,25%</span><span>{formatPrice(estimatedTax)}</span></div>
            <div className="flex justify-between text-sm text-muted-foreground"><span>Livraison</span><span>selon zone</span></div>
            <div className="border-t border-border pt-3">
              <PriceTag amount={subtotal} size="lg" />
            </div>
            <Input
              placeholder="Note (optionnel) — livraison express…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!shippingAddressId || (method === 'mobile_money' && phone.length < 9)}
              onClick={() => {
                setStep('payment');
                void submitOrder();
              }}
            >
              Payer {formatPrice(subtotal)}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              En validant vous acceptez les CGV (facture en XAF, TVA 19,25%).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
