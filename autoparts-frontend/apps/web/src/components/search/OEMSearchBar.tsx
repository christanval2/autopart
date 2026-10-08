// ── OEMSearchBar : recherche + autocomplete (debounce 300 ms) ──
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Clock, X } from 'lucide-react';
import { searchApi } from '@autoparts/api';
import { storage, STORAGE_KEYS } from '@autoparts/utils';

interface Suggestion {
  type?: string;
  label?: string;
  id?: string;
  productId?: string;
  name?: string;
  [key: string]: unknown;
}

async function getRecent(): Promise<string[]> {
  return (await storage.get<string[]>(STORAGE_KEYS.RECENT_SEARCHES)) ?? [];
}

export function saveRecentSearch(q: string): void {
  if (!q.trim()) return;
  void getRecent().then((list) => {
    const next = [q.trim(), ...list.filter((s) => s !== q.trim())].slice(0, 10);
    void storage.set(STORAGE_KEYS.RECENT_SEARCHES, next);
  });
}

export function OEMSearchBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    if (focused) void getRecent().then(setRecent);
  }, [focused]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['autocomplete', debounced],
    queryFn: () => searchApi.autocomplete(debounced) as Promise<Suggestion[]>,
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const go = (q: string) => {
    saveRecentSearch(q);
    setFocused(false);
    navigate(`/recherche?q=${encodeURIComponent(q)}`);
  };

  const showDropdown = focused && (debounced.length >= 2 || recent.length > 0);

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) go(value);
        }}
      >
        <div className="flex items-center gap-2 rounded-input border border-input bg-card px-3">
          <Search strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder="Référence OEM, SKU, nom de pièce…"
            className="w-full bg-transparent py-2 text-sm outline-none"
          />
          {value && (
            <button type="button" onClick={() => { setValue(''); setDebounced(''); }}>
              <X strokeWidth={1.5} className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </form>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-96 overflow-y-auto rounded-card border border-border bg-card py-1 shadow-xl">
          {debounced.length < 2 && recent.length > 0 && (
            <>
              <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Recherches récentes
              </div>
              {recent.map((r) => (
                <button
                  key={r}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => { setValue(r); go(r); }}
                >
                  <Clock strokeWidth={1.5} className="h-3.5 w-3.5 text-muted-foreground" /> {r}
                </button>
              ))}
            </>
          )}

          {debounced.length >= 2 && (
            <>
              {isFetching && suggestions.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">Suggestions…</div>
              )}
              {!isFetching && suggestions.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  Aucune suggestion — appuyez sur Entrée pour lancer la recherche.
                </div>
              )}
              {suggestions.map((s, i) => {
                const label = String(s.label ?? s.name ?? '');
                return (
                  <button
                    key={s.productId ?? s.id ?? i}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      if (s.productId || s.type === 'product') {
                        const id = String(s.productId ?? s.id);
                        saveRecentSearch(label);
                        setFocused(false);
                        navigate(`/produits/${id}`);
                      } else {
                        go(label);
                      }
                    }}
                  >
                    {s.type && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {s.type}
                      </span>
                    )}
                    <span className="line-clamp-1">{label}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
