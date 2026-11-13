import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { API, order, server } from './server';
import { renderApp } from './render';

// The page renders cards for phones and a table for larger screens (CSS picks one);
// these tests use the table.
const table = async () => within(await screen.findByRole('table'));

describe('OrdersPage', () => {
  it('shows the empty state', async () => {
    renderApp();
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  });

  it('lists orders newest first with product names, status and stats', async () => {
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
    const t = await table();
    const rows = t.getAllByRole('row');
    expect(within(rows[1]!).getByText('new@example.com')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Pending')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('old@example.com')).toBeInTheDocument();
    await waitFor(() => expect(t.getAllByText(/Keyboard/)).toHaveLength(2));
    expect(screen.getByText('199.96')).toBeInTheDocument(); // revenue stat
    expect(screen.getByText(/Live/)).toBeInTheDocument(); // something is pending
  });

  it('filters by status and searches by email', async () => {
    server.use(
      http.get(`${API}/orders`, () =>
        HttpResponse.json({
          items: [
            order({ id: 'a', customerEmail: 'alice@example.com' }),
            order({ id: 'b', customerEmail: 'bob@example.com', status: 'PENDING' }),
          ],
        }),
      ),
    );
    renderApp();
    const t = await table();
    await userEvent.click(screen.getByRole('button', { name: 'Pending' }));
    expect(t.queryByText('alice@example.com')).not.toBeInTheDocument();
    expect(t.getByText('bob@example.com')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'All' }));
    await userEvent.type(screen.getByRole('searchbox', { name: /Search/ }), 'ALICE');
    expect(t.getByText('alice@example.com')).toBeInTheDocument();
    expect(t.queryByText('bob@example.com')).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole('searchbox', { name: /Search/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: /Search/ }), 'nobody');
    expect(screen.getByText('No orders match')).toBeInTheDocument();
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
    expect((await table()).getByText('a@example.com')).toBeInTheDocument();
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
    expect((await table()).getByText('page2@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('polls while an order is pending until it is confirmed', async () => {
    let status: 'PENDING' | 'CONFIRMED' = 'PENDING';
    server.use(http.get(`${API}/orders`, () => HttpResponse.json({ items: [order({ status })] })));
    renderApp();
    const t = await table();
    expect(t.getByText('Pending')).toBeInTheDocument();
    status = 'CONFIRMED';
    await waitFor(() => expect(t.getByText('Confirmed')).toBeInTheDocument(), { timeout: 4000 });
  });

  it('deletes an order after the SweetAlert confirmation', async () => {
    let items = [order()];
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json({ items })),
      http.delete(`${API}/orders/o1`, () => {
        items = [];
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp();
    await userEvent.click((await table()).getByRole('button', { name: /Delete order for a@example.com/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete this order?');
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus());
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
    expect(await screen.findByText('Order deleted')).toBeInTheDocument();
  });

  it('cancelling the confirmation keeps the order', async () => {
    const del = vi.fn();
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json({ items: [order()] })),
      http.delete(`${API}/orders/o1`, () => {
        del();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderApp();
    const t = await table();
    await userEvent.click(t.getByRole('button', { name: /Delete order/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(t.getByText('a@example.com')).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
  });

  it('renders the email as text in the confirmation, not as HTML', async () => {
    const evil = '<img src=x onerror=alert(1)>@x.com';
    server.use(http.get(`${API}/orders`, () => HttpResponse.json({ items: [order({ customerEmail: evil })] })));
    renderApp();
    await userEvent.click((await table()).getByRole('button', { name: /Delete order/ }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(evil);
    expect(dialog.querySelector('img:not(.swal2-image)')).toBeNull(); // swal2-image is SweetAlert2's own, unused
  });

  it('restores the row and shows an error toast when delete fails', async () => {
    server.use(
      http.get(`${API}/orders`, () => HttpResponse.json({ items: [order()] })),
      http.delete(`${API}/orders/o1`, () => HttpResponse.json({ message: 'Internal server error' }, { status: 500 })),
    );
    renderApp();
    const t = await table();
    await userEvent.click(t.getByRole('button', { name: /Delete order/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Could not delete the order/)).toBeInTheDocument();
    await waitFor(() => expect(t.getByText('a@example.com')).toBeInTheDocument());
  });
});
