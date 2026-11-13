import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { NewOrder } from '../api/types';
import { API, order, server } from './server';
import { renderApp } from './render';

async function pickKeyboard() {
  const select = await screen.findByRole('combobox', { name: 'Product for item 1' });
  await screen.findByRole('option', { name: /Keyboard/ });
  await userEvent.selectOptions(select, 'p1');
}

describe('NewOrderPage', () => {
  it('creates an order with catalog prices and returns to the list', async () => {
    let sent: NewOrder | undefined;
    server.use(
      http.post(`${API}/orders`, async ({ request }) => {
        sent = (await request.json()) as NewOrder;
        return HttpResponse.json(order({ id: 'created', status: 'PENDING' }), { status: 201 });
      }),
    );
    renderApp('/new');
    await userEvent.type(screen.getByLabelText('Customer email'), 'demo@example.com');
    await pickKeyboard();
    const qty = screen.getByRole('spinbutton', { name: 'Quantity for item 1' });
    await userEvent.clear(qty);
    await userEvent.type(qty, '3');
    expect(screen.getByText('149.97')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/$/);
    expect(sent).toEqual({
      customerEmail: 'demo@example.com',
      items: [{ productId: 'p1', quantity: 3, unitPrice: 49.99 }],
    });
  });

  it('validates on the client before calling the API', async () => {
    renderApp('/new');
    await userEvent.type(screen.getByLabelText('Customer email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid email');
  });

  it('shows the server error message', async () => {
    server.use(http.post(`${API}/orders`, () => HttpResponse.json({ message: 'unitPrice must be a positive number' }, { status: 400 })));
    renderApp('/new');
    await userEvent.type(screen.getByLabelText('Customer email'), 'demo@example.com');
    await pickKeyboard();
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('unitPrice must be a positive number');
  });

  it('simulate failure sends the fail@ email', async () => {
    let email = '';
    server.use(
      http.post(`${API}/orders`, async ({ request }) => {
        email = ((await request.json()) as NewOrder).customerEmail;
        return HttpResponse.json(order(), { status: 201 });
      }),
    );
    renderApp('/new');
    await userEvent.click(screen.getByLabelText(/Simulate notification failure/));
    expect(screen.getByLabelText('Customer email')).toBeDisabled();
    await pickKeyboard();
    await userEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await screen.findByText('No orders yet.');
    expect(email).toBe('fail@example.com');
  });

  it('adds and removes item rows', async () => {
    renderApp('/new');
    expect(screen.getByRole('button', { name: 'Remove item 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: '+ Add item' }));
    expect(screen.getByRole('combobox', { name: 'Product for item 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
    expect(screen.queryByRole('combobox', { name: 'Product for item 2' })).not.toBeInTheDocument();
  });

  it('adds a product and selects it in the empty row', async () => {
    const created = { id: 'p3', name: 'Monitor', price: 199, createdAt: '2026-11-13T09:00:00Z' };
    let catalog = [{ id: 'p1', name: 'Keyboard', price: 49.99, createdAt: '2026-11-13T09:00:00Z' }];
    server.use(
      http.get(`${API}/products`, () => HttpResponse.json({ items: catalog })),
      http.post(`${API}/products`, () => {
        catalog = [...catalog, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    renderApp('/new');
    await userEvent.click(screen.getByText('Add a product to the catalog'));
    await userEvent.type(screen.getByLabelText('Product name'), 'Monitor');
    await userEvent.type(screen.getByLabelText('Price'), '199');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    await screen.findByRole('option', { name: /Monitor/ });
    expect(screen.getByRole('combobox', { name: 'Product for item 1' })).toHaveValue('p3');
  });
});
