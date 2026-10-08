import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@autoparts/utils';
import { Button } from './button';
import { Skeleton } from './badge';

/** Taille de page standard de tous les tableaux de l'application. */
export const TABLE_PAGE_SIZE = 10;

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyLabel?: string;
  // pagination serveur (page/total/onPageChange)
  page?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  // tri local
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
}

/** Lignes squelettes pendant le chargement (shadcn Skeleton). */
function SkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="bg-card">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <Skeleton className={cn('h-4', j === 0 ? 'w-3/4' : 'w-1/2')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Tableau standard.
 * • `onPageChange` fourni  → pagination serveur (page/total/limit).
 * • `onPageChange` absent  → pagination client automatique, 10 lignes/page.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  emptyLabel = 'Aucune donnée',
  page,
  total,
  limit = TABLE_PAGE_SIZE,
  onPageChange,
  onSort,
  onRowClick,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [localPage, setLocalPage] = useState(1);

  const isServerPagination = typeof onPageChange === 'function';

  // Nouvelles données (filtre, refresh) → retour à la première page client
  useEffect(() => {
    setLocalPage(1);
  }, [rows]);

  const totalPages = isServerPagination
    ? total != null
      ? Math.max(1, Math.ceil(total / limit))
      : undefined
    : Math.max(1, Math.ceil(rows.length / limit));

  const currentPage = isServerPagination ? (page ?? 1) : localPage;

  const visibleRows = isServerPagination
    ? rows
    : rows.slice((localPage - 1) * limit, localPage * limit);

  const handleSort = (key: string) => {
    const dir = sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc';
    setSort({ key, dir });
    onSort?.(key, dir);
  };

  const goToPage = (p: number) => {
    if (isServerPagination) onPageChange?.(p);
    else setLocalPage(p);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm [font-variant-numeric:tabular-nums]">
          <thead className="border-b border-border bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cn('px-4 py-2.5 font-semibold', c.className)}>
                  {c.sortable && onSort ? (
                    <button
                      type="button"
                      className={cn(
                        'group inline-flex items-center gap-1 transition-colors hover:text-foreground',
                        sort?.key === c.key && 'text-foreground',
                      )}
                      onClick={() => handleSort(c.key)}
                    >
                      {c.header}
                      {sort?.key === c.key ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="h-3 w-3" strokeWidth={1.5} />
                        ) : (
                          <ArrowDown className="h-3 w-3" strokeWidth={1.5} />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-40 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <SkeletonRows cols={columns.length} />}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14">
                  <div className="flex flex-col items-center justify-center gap-2.5 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Inbox className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-medium text-foreground">{emptyLabel}</p>
                    <p className="text-xs text-muted-foreground">Modifiez vos filtres ou revenez plus tard.</p>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              visibleRows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'bg-card text-foreground transition-colors duration-150',
                    onRowClick && 'cursor-pointer hover:bg-muted/60',
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3', c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <PaginationFooter
          page={currentPage}
          totalPages={totalPages}
          total={total}
          onPageChange={goToPage}
        />
      )}
    </div>
  );
}

/** Pied de pagination réutilisable (aussi utilisé par les tableaux manuels). */
export function PaginationFooter({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2.5">
      <span className="text-xs text-muted-foreground">
        Page {page} / {totalPages}
        {total != null ? ` — ${total} résultats` : ''}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} /> Précédent
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Suivant <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
