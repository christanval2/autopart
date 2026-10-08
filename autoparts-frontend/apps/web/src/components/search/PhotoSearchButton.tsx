// ── Recherche par photo : OCR de l'étiquette → référence OEM ──
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ocrApi } from '@autoparts/api';
import { Modal, Button, Badge } from '@autoparts/ui';
import { useAuthStore } from '@/store/auth.store';

/**
 * Photographiez (ou choisissez) l'étiquette d'une pièce : l'OCR extrait
 * le texte, détecte les références OEM et lance la recherche catalogue.
 */
export function PhotoSearchButton({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ text: string; oem: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = useMutation({
    mutationFn: (file: File) => ocrApi.parseImage(file),
    onSuccess: (r) => {
      setResult({ text: r.text, oem: r.references.oem });
      if (!r.text.trim()) toast.info('Aucun texte détecté sur l\'image — photo plus nette ?');
    },
    onError: (e: Error) => {
      if (String(e.message).includes('401')) toast.info('Connectez-vous pour la recherche par photo.');
      else toast.error(e.message || 'Analyse impossible');
    },
  });

  const searchRef = (ref: string) => {
    setOpen(false);
    navigate(`/recherche?q=${encodeURIComponent(ref)}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (isAuthenticated ? setOpen(true) : toast.info('Connectez-vous pour la recherche par photo.'))}
        className={`flex items-center gap-2 rounded-input border border-input bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary ${compact ? '' : 'w-full'}`}
        title="Rechercher par photo de l'étiquette"
      >
        <Camera strokeWidth={1.5} className="h-4 w-4" />
        {!compact && <span>Recherche par photo</span>}
      </button>

      <Modal open={open} onClose={() => !analyze.isPending && setOpen(false)} title="Recherche par photo">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Prenez en photo l'étiquette de la pièce ou sa carte grise — nous extrayons les références
            et lançons la recherche.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) analyze.mutate(f);
              e.target.value = '';
            }}
          />

          {!result && (
            <Button className="w-full" onClick={() => fileRef.current?.click()} loading={analyze.isPending}>
              <Camera strokeWidth={1.5} className="h-4 w-4" />
              {analyze.isPending ? 'Analyse de l\'image…' : 'Choisir / prendre une photo'}
            </Button>
          )}

          {result && (
            <>
              {result.oem.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Références détectées :</div>
                  <div className="flex flex-wrap gap-2">
                    {result.oem.map((ref) => (
                      <button key={ref} onClick={() => searchRef(ref)}>
                        <Badge tone="primary" className="cursor-pointer hover:opacity-80">{ref}</Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="rounded-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                  Aucune référence OEM détectée automatiquement — copiez un mot-clé depuis le texte ci-dessous.
                </p>
              )}

              <div className="max-h-40 overflow-y-auto rounded-input bg-muted px-3 py-2">
                <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                  {result.text.slice(0, 600) || '—'}
                </pre>
              </div>

              <Button variant="outline" className="w-full" onClick={() => setResult(null)} disabled={analyze.isPending}>
                Analyser une autre photo
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
