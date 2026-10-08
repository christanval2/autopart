// ── Guards de routes par rôle ──────────────────────────────────
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, homeForRoles } from '@/store/auth.store';
import type { UserRole } from '@autoparts/types';

function hasRequired(userRoles: UserRole[], required: UserRole[]): boolean {
  if (required.length === 0) return true;
  return required.some((r) => userRoles.includes(r));
}

export function ProtectedRoute({
  roles = [],
  children,
}: {
  roles?: UserRole[];
  children: ReactNode;
}) {
  const { isAuthenticated, user, hydrated } = useAuthStore();
  const location = useLocation();

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-input border-t-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/connexion" state={{ from: location.pathname }} replace />;
  }

  // Rôle insuffisant → redirection vers l'accueil du rôle le plus élevé
  if (user && !hasRequired(user.roles ?? [], roles)) {
    return <Navigate to={homeForRoles(user.roles)} replace />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, user, hydrated } = useAuthStore();
  if (!hydrated) return null;
  if (isAuthenticated) return <Navigate to={homeForRoles(user?.roles)} replace />;
  return <>{children}</>;
}
