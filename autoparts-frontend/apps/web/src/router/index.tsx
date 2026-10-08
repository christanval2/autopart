// ── Routeur principal (React Router v6, lazy loading) ──────────
import { Suspense, lazy } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@autoparts/ui';
import { PublicLayout } from '@/layouts/PublicLayout';
import { B2BLayout } from '@/layouts/B2BLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { ProtectedRoute, PublicOnlyRoute } from './guards';
import { RouteError } from './RouteError';

// ── Lazy pages ─────────────────────────────────────────────────
// Public / acheteur
const HomePage            = lazy(() => import('@/pages/HomePage'));
const CataloguePage       = lazy(() => import('@/pages/CataloguePage'));
const CategoriePage       = lazy(() => import('@/pages/CategoriePage'));
const MarquePage          = lazy(() => import('@/pages/MarquePage'));
const RecherchePage       = lazy(() => import('@/pages/RecherchePage'));
const ProduitPage         = lazy(() => import('@/pages/ProduitPage'));
const PanierPage          = lazy(() => import('@/pages/PanierPage'));
const CheckoutPage        = lazy(() => import('@/pages/CheckoutPage'));
const MesCommandesPage    = lazy(() => import('@/pages/MesCommandesPage'));
const DetailCommandePage  = lazy(() => import('@/pages/DetailCommandePage'));
const ComptePage          = lazy(() => import('@/pages/ComptePage'));
const FidelitePage        = lazy(() => import('@/pages/FidelitePage'));
const MessagesPage        = lazy(() => import('@/pages/MessagesPage'));
const SuiviPage           = lazy(() => import('@/pages/SuiviPage'));
const FavorisPage         = lazy(() => import('@/pages/FavorisPage'));
const LegalPage           = lazy(() => import('@/pages/LegalPage'));
const MarquesPubliquesPage = lazy(() => import('@/pages/MarquesPage'));

// B2B (vendeur)
const DashboardVendeurPage   = lazy(() => import('@/pages/b2b/DashboardVendeurPage'));
const MesProduitsPage        = lazy(() => import('@/pages/b2b/MesProduitsPage'));
const GestionStockPage       = lazy(() => import('@/pages/b2b/GestionStockPage'));
const CommandesEntrantesPage = lazy(() => import('@/pages/b2b/CommandesEntrantesPage'));
const DevisPage              = lazy(() => import('@/pages/b2b/DevisPage'));
const BonsDeCommandePage     = lazy(() => import('@/pages/b2b/BonsDeCommandePage'));
const CommissionsVendeurPage = lazy(() => import('@/pages/b2b/CommissionsPage'));
const AvisRecusPage          = lazy(() => import('@/pages/b2b/AvisRecusPage'));
const AnalyticsVendeurPage   = lazy(() => import('@/pages/b2b/AnalyticsPage'));
const PromotionsVendeurPage  = lazy(() => import('@/pages/b2b/PromotionsPage'));

// Admin
const DashboardAdminPage    = lazy(() => import('@/pages/admin/DashboardAdminPage'));
const UtilisateursPage      = lazy(() => import('@/pages/admin/UtilisateursPage'));
const OrganisationsPage     = lazy(() => import('@/pages/admin/OrganisationsPage'));
const ProduitsModerationPage = lazy(() => import('@/pages/admin/ProduitsModerationPage'));
const CategoriesPage        = lazy(() => import('@/pages/admin/CategoriesPage'));
const MarquesPage           = lazy(() => import('@/pages/admin/MarquesPage'));
const ToutesCommandesPage   = lazy(() => import('@/pages/admin/ToutesCommandesPage'));
const PaiementsPage         = lazy(() => import('@/pages/admin/PaiementsPage'));
const LogistiquePage        = lazy(() => import('@/pages/admin/LogistiquePage'));
const LitigesPage           = lazy(() => import('@/pages/admin/LitigesPage'));
const CommissionsAdminPage  = lazy(() => import('@/pages/admin/CommissionsAdminPage'));
const ModerationAvisPage    = lazy(() => import('@/pages/admin/ModerationAvisPage'));
const FiscalitePage         = lazy(() => import('@/pages/admin/FiscalitePage'));
const JournalAuditPage      = lazy(() => import('@/pages/admin/JournalAuditPage'));
const AnalyticsGlobalPage   = lazy(() => import('@/pages/admin/AnalyticsGlobalPage'));

// Auth
const LoginPage            = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage         = lazy(() => import('@/pages/auth/RegisterPage'));
const OtpPage              = lazy(() => import('@/pages/auth/OtpPage'));
const GoogleCallbackPage   = lazy(() => import('@/pages/auth/GoogleCallbackPage'));

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

const withLoader = (el: React.ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

// ── Layouts pass-through ───────────────────────────────────────
const PublicShell = () => <PublicLayout><Outlet /></PublicLayout>;
const routeError = { errorElement: <RouteError /> };
const B2BShell = () => (
  <ProtectedRoute roles={['seller', 'org_admin']}>
    <B2BLayout><Outlet /></B2BLayout>
  </ProtectedRoute>
);
const AdminShell = () => (
  <ProtectedRoute roles={['super_admin', 'logistics']}>
    <AdminLayout><Outlet /></AdminLayout>
  </ProtectedRoute>
);
const AuthShell = () => <PublicOnlyRoute><AuthLayout><Outlet /></AuthLayout></PublicOnlyRoute>;

export const router = createBrowserRouter([
  {
    ...routeError,
    element: <PublicShell />,
    children: [
      { path: '/', element: withLoader(<HomePage />) },
      { path: '/catalogue', element: withLoader(<CataloguePage />) },
      { path: '/catalogue/categories/:slug', element: withLoader(<CategoriePage />) },
      { path: '/catalogue/marques', element: withLoader(<MarquesPubliquesPage />) },
      { path: '/marques', element: <Navigate to="/catalogue/marques" replace /> },
      { path: '/catalogue/marques/:slug', element: withLoader(<MarquePage />) },
      { path: '/recherche', element: withLoader(<RecherchePage />) },
      { path: '/produits/:id', element: withLoader(<ProduitPage />) },
      { path: '/panier', element: withLoader(<PanierPage />) },
      { path: '/checkout', element: withLoader(<CheckoutPage />) },
      { path: '/suivi/:tracking', element: withLoader(<SuiviPage />) },
      { path: '/suivi', element: withLoader(<SuiviPage />) },
      { path: '/favoris', element: withLoader(<FavorisPage />) },
      { path: '/legal/:tab', element: withLoader(<LegalPage />) },
      { path: '/legal', element: withLoader(<LegalPage />) },
      {
        element: <ProtectedRoute><Outlet /></ProtectedRoute>,
        children: [
          { path: '/commandes', element: withLoader(<MesCommandesPage />) },
          { path: '/commandes/:id', element: withLoader(<DetailCommandePage />) },
          { path: '/compte', element: withLoader(<ComptePage />) },
          { path: '/messages', element: withLoader(<MessagesPage />) },
        ],
      },
      { path: '/fidelite', element: withLoader(<FidelitePage />) },
    ],
  },
  {
    path: '/b2b',
    ...routeError,
    element: <B2BShell />,
    children: [
      { index: true, element: <Navigate to="/b2b/dashboard" replace /> },
      { path: 'dashboard', element: withLoader(<DashboardVendeurPage />) },
      { path: 'produits', element: withLoader(<MesProduitsPage />) },
      { path: 'stock', element: withLoader(<GestionStockPage />) },
      { path: 'commandes', element: withLoader(<CommandesEntrantesPage />) },
      { path: 'devis', element: withLoader(<DevisPage />) },
      { path: 'bons-de-commande', element: withLoader(<BonsDeCommandePage />) },
      { path: 'promotions', element: withLoader(<PromotionsVendeurPage />) },
      { path: 'commissions', element: withLoader(<CommissionsVendeurPage />) },
      { path: 'avis', element: withLoader(<AvisRecusPage />) },
      { path: 'analytics', element: withLoader(<AnalyticsVendeurPage />) },
    ],
  },
  {
    path: '/admin',
    ...routeError,
    element: <AdminShell />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: withLoader(<DashboardAdminPage />) },
      { path: 'utilisateurs', element: withLoader(<UtilisateursPage />) },
      { path: 'organisations', element: withLoader(<OrganisationsPage />) },
      { path: 'produits', element: withLoader(<ProduitsModerationPage />) },
      { path: 'categories', element: withLoader(<CategoriesPage />) },
      { path: 'marques', element: withLoader(<MarquesPage />) },
      { path: 'commandes', element: withLoader(<ToutesCommandesPage />) },
      { path: 'paiements', element: withLoader(<PaiementsPage />) },
      { path: 'logistique', element: withLoader(<LogistiquePage />) },
      { path: 'litiges', element: withLoader(<LitigesPage />) },
      { path: 'commissions', element: withLoader(<CommissionsAdminPage />) },
      { path: 'avis', element: withLoader(<ModerationAvisPage />) },
      { path: 'fiscalite', element: withLoader(<FiscalitePage />) },
      { path: 'audit', element: withLoader(<JournalAuditPage />) },
      { path: 'analytics', element: withLoader(<AnalyticsGlobalPage />) },
    ],
  },
  {
    path: '/auth',
    ...routeError,
    element: <AuthShell />,
    children: [
      { index: true, element: <Navigate to="/auth/connexion" replace /> },
      { path: 'connexion', element: withLoader(<LoginPage />) },
      { path: 'inscription', element: withLoader(<RegisterPage />) },
      { path: 'verification-otp', element: withLoader(<OtpPage />) },
      { path: 'google/callback', element: withLoader(<GoogleCallbackPage />) },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
