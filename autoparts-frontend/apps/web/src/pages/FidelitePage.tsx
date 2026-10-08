// ── Programme de fidélité (V3) : points, paliers, rédemption ──
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, Input } from '@autoparts/ui';
import { loyaltyApi } from '@autoparts/api';
import { formatDate, formatPrice } from '@autoparts/utils';

const TIERS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 500 },
  { name: 'Gold', min: 2000 },
];

export default function FidelitePage() {
  const qc = useQueryClient();
  const [redeemPoints, setRedeemPoints] = useState('100');

  const { data: balance } = useQuery({
    queryKey: ['loyalty', 'balance'],
    queryFn: loyaltyApi.balance,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['loyalty', 'history'],
    queryFn: loyaltyApi.history,
  });

  const redeem = useMutation({
    mutationFn: () => loyaltyApi.redeem(Number(redeemPoints)),
    onSuccess: () => {
      toast.success('Points convertis — votre remise est disponible');
      setRedeemPoints('100');
      void qc.invalidateQueries({ queryKey: ['loyalty'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const points = balance?.points ?? 0;
  const tier = [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0];
  const nextTier = TIERS.find((t) => t.min > points);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Fidélité</h1>
        <p className="text-sm text-muted-foreground">
          1 point par 100 XAF dépensés · 100 points = 500 XAF de remise · expiration après 12 mois d'inactivité.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Gift strokeWidth={1.5} className="h-10 w-10 text-accent" />
            <div className="flex-1">
              <div className="text-3xl font-extrabold">{points.toLocaleString('fr-FR')} points</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge tone={tier.name === 'Gold' ? 'accent' : tier.name === 'Silver' ? 'info' : 'neutral'}>
                  Palier {tier.name}
                </Badge>
                {nextTier && (
                  <span className="text-xs text-muted-foreground">
                    {nextTier.min - points} points avant {nextTier.name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Convertir (multiple de 100)</label>
                <Input
                  className="w-32"
                  type="number"
                  min={100}
                  step={100}
                  value={redeemPoints}
                  onChange={(e) => setRedeemPoints(e.target.value)}
                />
              </div>
              <Button
                loading={redeem.isPending}
                disabled={Number(redeemPoints) < 100 || Number(redeemPoints) > points}
                onClick={() => redeem.mutate()}
              >
                → {formatPrice((Number(redeemPoints) / 100) * 500)}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-semibold">Historique des points</h2>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune transaction de points pour l'instant.</p>
          ) : (
            <ul className="divide-y divide-border ">
              {history.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <div className="font-medium">{t.description ?? t.type}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</div>
                  </div>
                  <span className={`font-semibold ${t.points >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {t.points >= 0 ? `+${t.points}` : t.points} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
