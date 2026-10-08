import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@autoparts/ui';
import { router } from './router';
import { hydrateAuth } from './store/auth.store';
import { hydrateCart } from './store/cart.store';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// Restauration de session + panier avant le premier rendu utile
Promise.all([hydrateAuth(), hydrateCart()]).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </ErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
