import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrdersPage } from '../pages/OrdersPage';
import { NewOrderPage } from '../pages/NewOrderPage';

function Location() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

export function renderApp(path = '/'): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<OrdersPage />} />
          <Route path="/new" element={<NewOrderPage />} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui);
}
