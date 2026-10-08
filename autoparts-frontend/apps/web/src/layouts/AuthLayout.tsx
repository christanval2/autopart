import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';

export function AuthLayout({ children }: { children: ReactNode }) {
  // Light mode par défaut sur l'authentification
  useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-xl font-bold text-primary">
          <Wrench strokeWidth={1.5} className="h-7 w-7 text-accent" />
          AutoParts <span className="text-accent">Cameroun</span>
        </Link>
        <div className="rounded-card border border-border bg-card p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
