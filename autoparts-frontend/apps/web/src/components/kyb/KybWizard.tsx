// ── Wizard KYB : activer la vente (documents de vérification) ──
// Bloque l'espace vendeur tant que l'organisation n'est pas vérifiée :
//  1. téléverser les documents (RCCM, patente, statuts, CNI)
//  2. statut « en attente » visible en direct
//  3. refus → motif affiché + re-téléversement possible
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BadgeCheck, Building2, CheckCircle2, Clock3, FileText, Loader2,
  ShieldCheck, Upload, XCircle,
} from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@autoparts/ui';
import { orgsApi } from '@autoparts/api';
import type { OrgDocument, OrgDocumentType } from '@autoparts/types';
import { useAuthStore } from '@/store/auth.store';

const DOC_LABELS: Record<OrgDocumentType, { label: string; hint: string }> = {
  rccm:   { label: 'RCCM', hint: 'Registre du Commerce et du Crédit Mobilier' },
  patente:{ label: 'Patente', hint: 'Carte de contribuable / patente' },
  statuts:{ label: 'Statuts', hint: 'Statuts juridiques de la société' },
  id_card:{ label: 'CNI du dirigeant', hint: 'Pièce d\'identité du représentant légal' },
};

const DOC_ORDER: OrgDocumentType[] = ['rccm', 'patente', 'statuts', 'id_card'];

function DocSlot({
  type,
  doc,
  onUpload,
  uploading,
}: {
  type: OrgDocumentType;
  doc?: OrgDocument;
  onUpload: (type: OrgDocumentType, file: File) => void;
  uploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = DOC_LABELS[type];
  const status = doc?.status;

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-card p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
        status === 'approved' ? 'bg-success/15 text-success'
        : status === 'pending' ? 'bg-primary/10 text-primary'
        : status === 'rejected' ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'
      }`}>
        {status === 'approved' ? <CheckCircle2 strokeWidth={1.5} className="h-5 w-5" />
          : status === 'pending' ? <Clock3 strokeWidth={1.5} className="h-5 w-5" />
          : status === 'rejected' ? <XCircle strokeWidth={1.5} className="h-5 w-5" />
          : <FileText strokeWidth={1.5} className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {meta.label}
          {status === 'approved' && <Badge tone="success">Validé</Badge>}
          {status === 'pending' && <Badge tone="info">En attente</Badge>}
          {status === 'rejected' && <Badge tone="danger">Refusé</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {status ? doc?.originalName ?? 'Document envoyé' : meta.hint}
        </p>
        {status === 'rejected' && doc?.rejectionReason && (
          <p className="mt-0.5 text-xs text-destructive">Motif : {doc.rejectionReason}</p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(type, f);
          e.target.value = '';
        }}
      />
      <Button
        size="sm"
        variant={status === 'approved' ? 'ghost' : 'outline'}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 strokeWidth={1.5} className="h-4 w-4 animate-spin" />
          : status === 'approved' ? 'Remplacer'
          : <><Upload strokeWidth={1.5} className="h-4 w-4" /> {status ? 'Re-soumettre' : 'Téléverser'}</>}
      </Button>
    </div>
  );
}

export function KybWizard() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const orgId = user?.org?.id ?? user?.orgId;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['kyb', 'documents', orgId],
    queryFn: () => orgsApi.kybDocuments(orgId!),
    enabled: Boolean(orgId),
  });

  const upload = useMutation({
    mutationFn: ({ type, file }: { type: OrgDocumentType; file: File }) =>
      orgsApi.uploadKybDocument(orgId!, file, type),
    onSuccess: () => {
      toast.success('Document reçu — vérification en cours');
      void qc.invalidateQueries({ queryKey: ['kyb', 'documents', orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Dernier document par type (les re-soumissions remplacent l'affichage)
  const latestByType = new Map<OrgDocumentType, OrgDocument>();
  (docs as OrgDocument[]).forEach((d) => {
    const prev = latestByType.get(d.type);
    if (!prev || new Date(d.createdAt ?? 0) > new Date(prev.createdAt ?? 0)) latestByType.set(d.type, d);
  });

  const submitted = DOC_ORDER.filter((t) => latestByType.has(t)).length;
  const approved = DOC_ORDER.filter((t) => latestByType.get(t)?.status === 'approved').length;
  const allSubmitted = submitted === DOC_ORDER.length;
  const anyPending = DOC_ORDER.some((t) => latestByType.get(t)?.status === 'pending');
  const hasRejected = DOC_ORDER.some((t) => latestByType.get(t)?.status === 'rejected');

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-10">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck strokeWidth={1.5} className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Activez la vente sur AutoParts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Avant de vendre, votre organisation <span className="font-medium">{user?.org?.name}</span> doit être
          vérifiée. Téléversez vos documents — vérification sous 24-48 h ouvrées.
        </p>
      </div>

      {/* Progression */}
      <div className="flex items-center justify-center gap-2 text-sm">
        <Badge tone={allSubmitted ? 'success' : 'neutral'}>
          <CheckCircle2 strokeWidth={1.5} className="mr-1 h-3.5 w-3.5" />
          {submitted}/{DOC_ORDER.length} documents
        </Badge>
        {anyPending && (
          <Badge tone="info">
            <Clock3 strokeWidth={1.5} className="mr-1 h-3.5 w-3.5" /> En cours de vérification
          </Badge>
        )}
        {approved > 0 && approved < DOC_ORDER.length && (
          <Badge tone="success"><BadgeCheck strokeWidth={1.5} className="mr-1 h-3.5 w-3.5" /> {approved} validé(s)</Badge>
        )}
      </div>

      {hasRejected && (
        <div className="rounded-input border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Un ou plusieurs documents ont été refusés — corrigez-les puis re-soumettez (le motif est indiqué sous chaque document).
        </div>
      )}

      {allSubmitted && !hasRejected && (
        <div className="rounded-input border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-semibold text-primary">Dossier complet — en attente de validation.</span>{' '}
          <span className="text-muted-foreground">
            Vous recevrez un email dès la décision. Vous pouvez déjà acheter sur la marketplace pendant ce temps.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 strokeWidth={1.5} className="mr-2 h-4 w-4 animate-spin" /> Chargement de votre dossier…
            </div>
          ) : (
            DOC_ORDER.map((t) => (
              <DocSlot
                key={t}
                type={t}
                doc={latestByType.get(t)}
                uploading={upload.isPending && upload.variables?.type === t}
                onUpload={(type, file) => upload.mutate({ type, file })}
              />
            ))
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Building2 strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Formats acceptés : PDF, JPG, PNG, WebP (5 Mo max par document). Vos documents sont conservés de
        manière confidentielle et accessibles uniquement à l'équipe de vérification.
      </p>
    </div>
  );
}
