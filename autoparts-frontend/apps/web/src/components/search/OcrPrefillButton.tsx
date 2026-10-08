// ── Préremplissage OEM par photo (vendeur — Mes produits) ──────
import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ocrApi } from '@autoparts/api';

/**
 * Petit bouton d'aide dans le formulaire produit : photographier
 * l'étiquette de la pièce → la référence OEM détectée remplit le champ.
 */
export function OcrPrefillButton({ onReference }: { onReference: (ref: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const analyze = useMutation({
    mutationFn: (file: File) => ocrApi.parseImage(file),
    onSuccess: (r) => {
      const first = r.references.oem[0];
      if (first) {
        onReference(first);
        toast.success(`Référence détectée : ${first}${r.references.oem.length > 1 ? ` (+${r.references.oem.length - 1} autres)` : ''}`);
      } else {
        toast.info('Aucune référence détectée — photo plus rapprochée de l\'étiquette ?');
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Analyse impossible'),
  });

  return (
    <>
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
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={analyze.isPending}
        className="flex w-full items-center justify-center gap-2 rounded-input border border-dashed border-accent/50 bg-accent/5 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:opacity-60"
      >
        {analyze.isPending
          ? <><Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" /> Lecture de l'étiquette…</>
          : <><Camera strokeWidth={1.5} className="h-4 w-4" /> Photographier l'étiquette pour remplir la référence OEM</>}
      </button>
    </>
  );
}
