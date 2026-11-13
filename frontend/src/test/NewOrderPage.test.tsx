import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { NewOrder } from '../api/types';
import { API, order, server } from './server';
import { renderApp } from './render';

/** Pick a product in the react-select picker by typing to search, then Enter. */
async function pickProduct(item: number, search: string) {
  const input = await screen.findByRole('combobox', { name: `Product for item ${item}` });
  await waitFor(() => expect(input).not.toBeDisabled());
  await userEvent.type(input, search);
  await screen.findByRole('option', { name: new RegExp(search, 'i') });
  await userEvent.keyboard('{Enter}');
}
const placeOrder = () => userEvent.click(screen.getAllByRole('button', { name: 'Place order' })[0]!);

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
    await pickProduct(1, 'Key');
    await userEvent.click(screen.getByRole('button', { name: 'Increase Quantity for item 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Increase Quantity for item 1' }));
    expect(screen.getByTestId('total')).toHaveTextContent('149.97');

    await placeOrder();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(sent).toEqual({ customerEmail: 'demo@example.com', items: [{ productId: 'p1', quantity: 3, unitPrice: 49.99 }] });
    expect(await screen.findByText(/Order placed/)).toBeInTheDocument();
  });

  it('searches products in the picker', async () => {
    renderApp('/new');
    const input = await screen.findByRole('combobox', { name: 'Product for item 1' });
    await waitFor(() => expect(input).not.toBeDisabled());
    await userEvent.type(input, 'mou');
    expect(await screen.findByRole('option', { name: /Mouse/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Keyboard/ })).not.toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'zzz');
    expect(await screen.findByText(/No product matches/)).toBeInTheDocument();
  });

  it('validates on the client before calling the API', async () => {
    renderApp('/new');
    await userEvent.type(screen.getByLabelText('Customer email'), 'not-an-email');
    await placeOrder();
    expect(await screen.findByRole('alert')).toHaveTextContent('valid email');
  });

  it('shows the server error message', async () => {
    server.use(http.post(`${API}/orders`, () => HttpResponse.json({ message: 'unitPrice must be a positive number' }, { status: 400 })));
    renderApp('/new');
    await userEvent.type(screen.getByLabelText('Customer email'), 'demo@example.com');
    await pickProduct(1, 'Key');
    await placeOrder();
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
    await userEvent.click(screen.getByRole('switch', { name: /Simulate notification failure/ }));
    expect(screen.getByLabelText('Customer email')).toBeDisabled();
    await pickProduct(1, 'Key');
    await placeOrder();
    await screen.findByText('No orders yet.');
    expect(email).toBe('fail@example.com');
  });

  it('adds and removes item rows; quantity cannot go below 1', async () => {
    renderApp('/new');
    expect(screen.getByRole('button', { name: 'Remove item 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease Quantity for item 1' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    expect(screen.getByRole('combobox', { name: 'Product for item 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove item 2' }));
    expect(screen.queryByRole('combobox', { name: 'Product for item 2' })).not.toBeInTheDocument();
  });

  it('adds a product from the SweetAlert dialog and selects it', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'New product' }));
    await screen.findByRole('dialog');

    // invalid first: the dialog stays open with a validation message
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await screen.findByText('Product name is required.')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('Mechanical Keyboard'), 'Monitor');
    await userEvent.type(screen.getByPlaceholderText('49.99'), '199');
    await userEvent.click(screen.getByRole('button', { name: 'Add product' }));
    expect(await screen.findByText('Monitor')).toBeInTheDocument(); // selected in the picker
    expect(screen.getByTestId('total')).toHaveTextContent('199.00');
  });
});
