// ── Wrapper AnyChart — types variés, chargement dynamique ─────
// Le bundle npm de base n'expose pas tous les types (donut/treemap/pyramid
// vivent dans des modules séparés) : on les charge par effets de bord puis
// on utilise window.anychart (le namespace complet).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from '@autoparts/ui';

export type AnyChartType =
  | 'line' | 'bar' | 'hbar' | 'column' | 'pie' | 'donut' | 'gauge'
  | 'area' | 'splineArea' | 'treemap' | 'pyramid';

/** Charge anychart + les modules complémentaires (idempotent). */
let libPromise: Promise<any> | null = null;
async function loadAnyChart(): Promise<any> {
  if (!libPromise) {
    libPromise = (async () => {
      const mod: any = await import('anychart');
      const base = mod.default || mod;
      try {
        // Modules complémentaires : s'enregistrent sur window.anychart
        await import('anychart/dist/js/anychart-pie.min.js');
        await import('anychart/dist/js/anychart-treemap.min.js');
        await import('anychart/dist/js/anychart-pyramid-funnel.min.js');
      } catch { /* optionnels */ }
      // window.anychart est le namespace le plus complet (base + extras)
      return (window as any).anychart || base || mod;
    })();
  }
  return libPromise;
}

export function AnyChart({
  type,
  data,
  title,
  height = 300,
  xKey = 'period',
  yKeys = ['value'],
  seriesNames,
}: {
  type: AnyChartType;
  data: Array<Record<string, unknown>>;
  title?: string;
  height?: number;
  xKey?: string;
  yKeys?: string[];
  seriesNames?: string[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [anychart, setAnychart] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAnyChart().then((lib) => {
      if (!cancelled) setAnychart(lib);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!anychart || !containerRef.current || data.length === 0) return;

    // Palette maison depuis les tokens CSS — aucun jaune/ambre.
    const css = getComputedStyle(document.documentElement);
    const tok = (n: string) => css.getPropertyValue(n).trim();
    const PALETTE = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5']
      .map(tok)
      .filter(Boolean);

    // Garde-fou : si une usine manque, on retombe sur un type disponible.
    const FACTORY_FALLBACK: Record<string, string> = {
      treemap: 'pie', donut: 'pie', pyramid: 'hbar',
      splineArea: 'area', column: 'bar', hbar: 'bar', gauge: 'pie',
    };
    let effective: AnyChartType = type;
    let guard = 0;
    while (typeof anychart[effective] !== 'function' && guard < 3) {
      effective = (FACTORY_FALLBACK[effective] ?? 'bar') as AnyChartType;
      guard++;
    }

    let chart: any;
    switch (effective) {
      case 'pie':
      case 'donut':
        chart = anychart[effective](data);
        chart.labels().format('{%x}: {%value}');
        if (effective === 'donut' && typeof chart.innerRadius === 'function') {
          chart.innerRadius('58%');
        }
        break;
      case 'treemap':
        chart = anychart.treemap(anychart.data.tree(data, 'as-table'));
        chart.labels().format('{%name}\n{%value}');
        break;
      case 'pyramid':
        chart = anychart.pyramid(data);
        chart.labels().format('{%x}: {%value}');
        break;
      case 'gauge': {
        chart = anychart.gauge();
        chart.data([Number(data[0]?.value ?? 0)]);
        chart.scale().minimum(0).maximum(Number(data[0]?.max ?? 100));
        break;
      }
      default: {
        chart = anychart[effective]();
        const dataSet = anychart.data.set(data);
        yKeys.forEach((key, i) => {
          // x ET value mappés : AnyChart utilise alors x comme catégorie
          const seriesData = dataSet.mapAs({ x: xKey, value: key });
          const name = seriesNames?.[i] ?? key;
          chart[effective === 'hbar' ? 'bar' : effective](seriesData).name(name);
        });
      }
    }

    chart.palette(PALETTE);
    const axisColor = tok('--chart-axis') || undefined;
    const cartesian = !['pie', 'donut', 'gauge', 'pyramid', 'treemap'].includes(effective);
    if (cartesian && axisColor) {
      chart.xAxis().labels({ fontColor: axisColor, fontSize: 10 });
      chart.yAxis().labels({ fontColor: axisColor, fontSize: 10 });
      chart.xAxis().ticks().stroke(axisColor + '55');
      chart.yAxis().ticks().stroke(axisColor + '55');
    }
    if (chart.legend) {
      chart.legend().enabled(yKeys.length > 1 || ['pie', 'donut', 'pyramid', 'treemap'].includes(effective));
      if (axisColor) chart.legend().fontColor(axisColor);
    }

    chart.container(containerRef.current);
    if (title) chart.title(title);
    chart.animation(true);
    chart.background().fill('transparent');
    chart.draw();

    const el = containerRef.current;
    return () => {
      if (el) el.innerHTML = '';
      chart.dispose?.();
    };
  }, [anychart, type, data, title, xKey, yKeys, seriesNames]);

  return (
    <div>
      <div ref={containerRef} style={{ height }} />
      {(!anychart || data.length === 0) && (
        <div style={{ height }}>
          <Skeleton className="w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

/** Carte de KPI (inspiration antrepo) : libellé, icône en carré teinté, valeur display. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone = 'primary',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: 'primary' | 'accent' | 'success';
}) {
  const tones = {
    primary: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon && (
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-2xl font-bold text-foreground">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
