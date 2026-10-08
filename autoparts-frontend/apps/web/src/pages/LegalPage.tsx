// ── Pages légales : CGV, retours, confidentialité ─────────────
// Contenu servi par GET /legal/* (public).
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { legalApi } from '@autoparts/api';
import type { CgvContent, PrivacyContent, ReturnPolicy } from '@autoparts/api';

const TABS = [
  { key: 'cgv', label: 'CGV' },
  { key: 'returns', label: 'Retours & garanties' },
  { key: 'privacy', label: 'Confidentialité' },
] as const;

export default function LegalPage() {
  const { tab = 'cgv' } = useParams<{ tab?: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['legal', tab],
    queryFn: async () => {
      if (tab === 'returns') return { kind: 'returns', body: await legalApi.returns() } as any;
      if (tab === 'privacy') return { kind: 'privacy', body: await legalApi.privacy() } as any;
      return { kind: 'cgv', body: await legalApi.cgv() } as any;
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold">Informations légales</h1>
        <nav className="mt-4 flex gap-2">
          {TABS.map((t) => (
            <a
              key={t.key}
              href={`/legal/${t.key}`}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ) : tab === 'cgv' && data ? (
        <article className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Version {data.body.version} · {data.body.company} · RCCM {data.body.rccm}
          </p>
          {(data.body.sections as Array<{ title: string; content: string }>).map((s) => (
            <section key={s.title}>
              <h2 className="font-display text-base font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.content}</p>
            </section>
          ))}
        </article>
      ) : tab === 'returns' && data ? (
        <article className="space-y-6">
          <p className="rounded-xl bg-success/10 p-4 text-sm font-medium text-success">
            {data.body.summary}
          </p>
          <ol className="space-y-3">
            {(data.body.steps as Array<{ step: number; title: string; desc: string }>).map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {s.step}
                </span>
                <div>
                  <div className="text-sm font-semibold">{s.title}</div>
                  <div className="text-sm text-muted-foreground">{s.desc}</div>
                </div>
              </li>
            ))}
          </ol>
          <h3 className="pt-2 font-display text-base font-semibold">Motifs et frais</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2.5">Motif</th><th className="px-4 py-2.5">Délai</th><th className="px-4 py-2.5">Frais</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data.body.reasons as Array<{ label: string; delay: number; frais: string }>).map((r) => (
                  <tr key={r.label}>
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5">{r.delay} jours</td>
                    <td className="px-4 py-2.5">{r.frais}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-display text-base font-semibold">Exclusions</h3>
            <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
              {(data.body.exclusions as string[]).map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </article>
      ) : data ? (
        <article className="space-y-4">
          <p className="rounded-xl bg-success/10 p-4 text-sm text-success">
            Version {data.body.version} — vos droits : {data.body.rights}
          </p>
          <p className="text-sm text-muted-foreground">
            Contact données personnelles : <span className="font-medium text-foreground">{data.body.contact}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Pour exporter ou supprimer vos données, rendez-vous dans
            <a href="/compte" className="mx-1 font-medium text-primary hover:underline">votre compte</a>
            (section Confidentialité).
          </p>
        </article>
      ) : null}
    </div>
  );
}
