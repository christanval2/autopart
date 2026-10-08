// ── Wizard recherche par véhicule : VIN ou marque → modèle → année ──
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Car, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Select, Spinner } from '@autoparts/ui';
import { searchApi, vinApi } from '@autoparts/api';

export function VehicleSearchWizard({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [vin, setVin] = useState('');

  const { data: makes = [], isLoading: makesLoading } = useQuery({
    queryKey: ['vehicle', 'makes'],
    queryFn: () => searchApi.vehicleMakes(),
    staleTime: 24 * 3600_000,
  });

  const { data: models = [], isLoading: modelsLoading } = useQuery({
    queryKey: ['vehicle', 'models', make],
    queryFn: () => searchApi.vehicleModels(make),
    enabled: make.length > 0,
    staleTime: 24 * 3600_000,
  });

  const modelNames = Array.from(new Set(models.map((m) => m.model)));
  const years = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i);

  const submit = () => {
    const params = new URLSearchParams();
    if (make) params.set('make', make);
    if (model) params.set('model', model);
    if (year) params.set('year', year);
    navigate(`/recherche?${params.toString()}`);
  };

  // Décodage VIN (CarAPI + repli vPIC) : préremplit marque/modèle/année
  const decodeVin = useMutation({
    mutationFn: () => vinApi.decode(vin),
    onSuccess: (d) => {
      setMake(d.make);
      setModel(d.model || '');
      if (d.year) setYear(String(d.year));
      toast.success(`${d.make} ${d.model ?? ''} ${d.year ?? ''} — véhicule reconnu (${d.source === 'vpic' ? 'base NHTSA' : 'CarAPI'})`);
    },
    onError: (e: Error) => toast.error(e.message || 'VIN non reconnu'),
  });

  return (
    <div className="rounded-card border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Car strokeWidth={1.5} className="h-4 w-4 text-accent" /> Trouver les pièces compatibles
      </div>

      {/* VIN : le plus rapide pour l'acheteur (carte grise) */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <ScanLine strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            placeholder="VIN (carte grise) — décode le véhicule"
            className="pl-9 uppercase"
            maxLength={17}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => decodeVin.mutate()}
          disabled={vin.length < 11 || decodeVin.isPending}
        >
          {decodeVin.isPending ? <Spinner /> : 'Décoder'}
        </Button>
      </div>

      <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-4'}`}>
        <Select value={make} onChange={(e) => { setMake(e.target.value); setModel(''); }}>
          <option value="">{makesLoading ? 'Chargement…' : 'Marque du véhicule'}</option>
          {makes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
        <Select value={model} onChange={(e) => setModel(e.target.value)} disabled={!make}>
          <option value="">{modelsLoading ? <Spinner /> : 'Modèle'}</option>
          {modelNames.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
        <Select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Année (optionnel)</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <Button onClick={submit} disabled={!make}>Rechercher</Button>
      </div>
    </div>
  );
}
