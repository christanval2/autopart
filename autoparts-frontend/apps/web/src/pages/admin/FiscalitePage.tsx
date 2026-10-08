// ── Fiscalité : TVA configurable, factures légales, exports ───
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Switch } from '@autoparts/ui';
import { fiscalApi, getBlob, taxConfigApi } from '@autoparts/api';
import type { TaxConfigDto } from '@autoparts/api';

export default function FiscalitePage() {
  const qc = useQueryClient();
  const [orderId, setOrderId] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  // ── TVA configurable (GET/PUT /admin/tax-config) ─────────────
  const { data: taxConfig } = useQuery({
    queryKey: ['admin', 'tax-config'],
    queryFn: taxConfigApi.get,
  });

  const [ratePercent, setRatePercent] = useState('19.25');
  const [taxActive, setTaxActive] = useState(true);

  useEffect(() => {
    if (taxConfig) {
      setRatePercent(String(taxConfig.ratePercent));
      setTaxActive(taxConfig.isActive);
    }
  }, [taxConfig]);

  const saveTax = useMutation({
    mutationFn: () =>
      taxConfigApi.put({ ratePercent: Number(ratePercent.replace(',', '.')), isActive: taxActive }),
    onSuccess: (t: TaxConfigDto) => {
      toast.success(`TVA mise à jour : ${t.ratePercent} %`);
      void qc.invalidateQueries({ queryKey: ['admin', 'tax-config'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doPreview = useMutation({
    mutationFn: async () => fiscalApi.invoicePreview(orderId.trim()),
    onSuccess: (p) => setPreview(p as Record<string, unknown>),
    onError: (e: Error) => toast.error(e.message),
  });

  const download = async (path: string, filename: string) => {
    try {
      const blob = await getBlob(path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message ?? 'Export indisponible');
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Fiscalité</h1>
        <p className="text-sm text-muted-foreground">TVA, factures légales camerounaises, déclarations.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Configuration TVA</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Taux de TVA (%)</span>
              <Input
                className="w-28 text-right"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={ratePercent}
                onChange={(e) => setRatePercent(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">TVA active</span>
              <Switch checked={taxActive} onChange={setTaxActive} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Devise de facturation</span>
              <Badge tone="success">XAF (FCFA) — obligatoire BEAC</Badge>
            </div>
            <div className="flex items-center justify-between">
              <Button size="sm" loading={saveTax.isPending} onClick={() => saveTax.mutate()}>
                Enregistrer le taux
              </Button>
              {taxConfig && (
                <span className="text-xs text-muted-foreground">
                  Actuel : {taxConfig.ratePercent} % ({taxConfig.countryCode})
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Les factures incluent RCCM, NIU et numéro TVA du vendeur ; mention de la TVA collectée.
              Archivage légal : 10 ans. Exemptions par catégorie B2B : extensions à prévoir.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Facture d'une commande</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Input
                placeholder="ID de commande (UUID)"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
              />
              <Button
                size="sm"
                loading={doPreview.isPending}
                disabled={orderId.trim().length < 8}
                onClick={() => doPreview.mutate()}
              >
                Aperçu
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={orderId.trim().length < 8}
              onClick={() => void download(`/invoices/${orderId.trim()}/pdf`, `facture-${orderId.trim()}.pdf`)}
            >
              Télécharger le PDF
            </Button>
            {preview && (
              <pre className="max-h-48 overflow-auto rounded-input bg-muted/50 p-3 text-xs">
                {JSON.stringify(preview, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Exports (déclarations)</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            <Button size="sm" variant="outline" onClick={() => void download('/exports/orders?format=csv', 'commandes.csv')}>
              Commandes (CSV)
            </Button>
            <Button size="sm" variant="outline" onClick={() => void download('/exports/payments?format=csv', 'paiements.csv')}>
              Paiements (CSV)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
