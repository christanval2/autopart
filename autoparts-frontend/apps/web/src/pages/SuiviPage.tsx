import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageSearch } from 'lucide-react';
import { Button, Card, CardContent, Input, StatusBadge } from '@autoparts/ui';
import { shipmentsApi } from '@autoparts/api';
import { formatDateTime } from '@autoparts/utils';
import type { ShipmentStatus } from '@autoparts/types';
import { ShipmentRouteMap, cityCoords, STATUS_LABEL } from '@/components/logistics/ShipmentRouteMap';

const STEPS: Array<{ key: ShipmentStatus; label: string }> = [
  { key: 'preparing', label: 'Préparation' },
  { key: 'in_transit', label: 'En transit' },
  { key: 'out_for_delivery', label: 'En livraison' },
  { key: 'delivered', label: 'Livré' },
];

export default function SuiviPage() {
  const { tracking } = useParams<{ tracking: string }>();
  const [value, setValue] = useState(tracking ?? '');
  const [active, setActive] = useState(tracking ?? '');

  const { data: shipment, isLoading, error } = useQuery({
    queryKey: ['shipments', 'track', active],
    queryFn: () => shipmentsApi.track(active),
    enabled: active.length >= 4,
  });

  const statusIndex = shipment ? STEPS.findIndex((s) => s.key === shipment.status) : -1;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Suivre mon colis</h1>
        <p className="text-sm text-muted-foreground">
          Saisissez votre numéro de suivi — aucun compte requis.
        </p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setActive(value.trim());
          window.history.replaceState(null, '', `/suivi/${encodeURIComponent(value.trim())}`);
        }}
      >
        <Input
          placeholder="Ex. DHL123456789"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" disabled={value.trim().length < 4}>Suivre</Button>
      </form>

      {isLoading && <p className="text-sm text-muted-foreground">Recherche du colis…</p>}

      {error && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <PackageSearch strokeWidth={1.5} className="h-10 w-10 text-muted-foreground/70" />
            <p className="text-sm text-muted-foreground">
              Aucune expédition trouvée pour ce numéro. Vérifiez le numéro ou contactez le support.
            </p>
          </CardContent>
        </Card>
      )}

      {shipment && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Transporteur</div>
                <div className="font-semibold">{shipment.carrier ?? '—'}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">N° de suivi</div>
                <div className="font-mono text-sm">{shipment.trackingNumber ?? '—'}</div>
              </div>
              <StatusBadge status={shipment.status} />
            </div>

            {shipment.status === 'returned' ? (
              <p className="text-sm text-destructive">Ce colis a été retourné à l'expéditeur.</p>
            ) : (
              <ol className="flex items-center">
                {STEPS.map((s, i) => (
                  <li key={s.key} className="flex flex-1 items-center last:flex-none">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                          i <= statusIndex ? 'bg-success text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <span className="mt-1 text-[10px] font-medium uppercase text-muted-foreground">{s.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`mx-2 h-0.5 flex-1 ${i < statusIndex ? 'bg-success' : 'bg-muted'}`} />
                    )}
                  </li>
                ))}
              </ol>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-muted-foreground">Expédié le</div>
                <div>{formatDateTime(shipment.shippedAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Livré le</div>
                <div>{formatDateTime(shipment.deliveredAt)}</div>
              </div>
            </div>

            {/* Trajet du colis sur carte : dépôt → position estimée → adresse */}
            {shipment.status !== 'returned' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Trajet du colis</span>
                  <span className="text-muted-foreground">
                    {shipment.originCity ?? '—'} → {shipment.destinationCity ?? '—'} ·{' '}
                    {Math.round((shipment.progress ?? 0) * 100)}% du trajet
                  </span>
                </div>
                <ShipmentRouteMap
                  origin={cityCoords(shipment.originCity)}
                  destination={cityCoords(shipment.destinationCity)}
                  progress={shipment.progress ?? 0}
                  status={shipment.status}
                  originLabel={shipment.originWarehouse ?? shipment.originCity ?? 'Dépôt'}
                  destinationLabel={shipment.destinationLabel ?? shipment.destinationCity ?? 'Adresse de livraison'}
                  trackingNumber={shipment.trackingNumber ?? undefined}
                  height={340}
                />
                <p className="text-xs text-muted-foreground">
                  Position estimée à partir du statut « {STATUS_LABEL[shipment.status] ?? shipment.status} » —
                  le point exact est communiqué par le transporteur lors de la livraison.
                </p>
              </div>
            )}

            {shipment.pickupCode && (
              <div className="rounded-input bg-primary/10 p-3 text-sm">
                <span className="font-semibold">Retrait en boutique — code : </span>
                <span className="font-mono text-lg font-bold">{shipment.pickupCode}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
