import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, order, server } from './server';
import { renderApp } from './render';

describe('OrdersPage', () => {
  it('shows the empty state', async () => {
    renderApp();
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  });

  it('lists orders newest first with product names and status', async () => {
    server.use(
      http.get(`${API}/orders`, () =>
        HttpResponse.json({
          items: [
            order({ id: 'old', customerEmail: 'old@example.com', createdAt: '2026-11-13T08:00:00Z' }),
            order({ id: 'new', customerEmail: 'new@example.com', createdAt: '2026-11-13T12:00:00Z', status: 'PENDING' }),
          ],
        }),
      ),
    );
    renderApp();
    const rows = await screen.findAllByRole('row');
    expect(within(rows[1]!).getByText('new@example.com')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Pending')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('old@example.com')).toBeInTheDocument();
    expect(await screen.findAllByText('2 × Keyboard')).toHaveLength(2);
  });

  it('shows an error with retry when the API fails', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/orders`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ message: 'Internal server error' }, { status: 500 })
          : HttpResponse.json({ items: [order()] });
      }),
    );
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent('Internal server error');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('a@example.com')).toBeInTheDocument();
  });

  it('loads the next page with the cursor', async () => {
    server.use(
      http.get(`${API}/orders`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === 'c2'
          ? HttpResponse.json({ items: [order({ id: 'o2', customerEmail: 'page2@example.com' })] })
          : HttpResponse.json({ items: [order()], nextCursor: 'c2' });
      }),
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('page2@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('polls while an order is pending until it is confirmed', async () => {
    let status: 'PENDING' | 'CONFIRMED' = 'PENDING';
    server.use(http.get(`${API}/orders`, () => HttpResponse.json({ items: [order({ status })] })));
    renderApp();
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    status = 'CONFIRMED';
    expect(await screen.findByText('Confirmed', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('deletes an order after confirmation', async () => {
    let items = [order()];
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json({ items })),
      http.delete(`${API}/orders/o1`, () => {
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /Delete order for a@example.com/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  });

  it('cancelling the dialog keeps the order', async () => {
    server.use(http.get(`${API}/orders`, () => HttpResponse.json({ items: [order()] })));
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /Delete order/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
  });

  it('restores the row and shows an error when delete fails', async () => {
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json({ items: [order()] })),
      http.delete(`${API}/orders/o1`, () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })),
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: /Delete order/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not delete the order');
    await waitFor(() => expect(screen.getByText('a@example.com')).toBeInTheDocument());
  });
});
