// ── Autocomplete d'adresse (Geoapify, biais Cameroun) ──────────
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { geoApi, type AddressSuggestion } from '@autoparts/api';

export function AddressAutocomplete({
  value,
  onSelect,
  placeholder = "Commencez à taper votre adresse…",
  className,
}: {
  value: string;
  /** Reçoit le label ET les coordonnées géocodées (pour seller_location). */
  onSelect: (s: { address: string; city?: string; lat?: number; lng?: number }) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setText(value); }, [value]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ['geo', 'autocomplete', debounced],
    queryFn: () => geoApi.autocomplete(debounced),
    enabled: debounced.length >= 3,
    staleTime: 86_400_000, // le backend cache déjà 24 h
  });

  const pick = (s: AddressSuggestion) => {
    setText(s.label);
    setOpen(false);
    onSelect({ address: s.label, city: s.city, lat: s.lat, lng: s.lng });
  };

  return (
    <div ref={boxRef} className={`relative ${className ?? ''}`}>
      <div className="flex items-center gap-2 rounded-input border border-input bg-card px-3">
        <MapPin strokeWidth={1.5} className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 text-sm outline-none"
        />
        {isFetching && (
          <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-card border border-border bg-card py-1 shadow-xl">
          {suggestions.map((s, i) => (
            <button
              key={`${s.lat}-${s.lng}-${i}`}
              type="button"
              className="flex w-full items-start gap-2 px-4 py-2 text-left text-sm hover:bg-muted"
              onClick={() => pick(s)}
            >
              <MapPin strokeWidth={1.5} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="line-clamp-2">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
