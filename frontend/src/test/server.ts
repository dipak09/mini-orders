import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { Order, Product } from '../api/types';

export const API = 'http://api.test';

export const products: Product[] = [
  { id: 'p1', name: 'Keyboard', price: 49.99, createdAt: '2026-11-13T09:00:00Z' },
  { id: 'p2', name: 'Mouse', price: 10, createdAt: '2026-11-13T09:00:00Z' },
];

export const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1',
  customerEmail: 'a@example.com',
  items: [{ productId: 'p1', quantity: 2, unitPrice: 49.99 }],
  total: 99.98,
  status: 'CONFIRMED',
  createdAt: '2026-11-13T10:00:00Z',
  ...over,
});

// Default happy-path handlers; tests override with server.use(...).
export const server = setupServer(
  http.get(`${API}/products`, () => HttpResponse.json({ items: products })),
  http.get(`${API}/orders`, () => HttpResponse.json({ items: [] })),
);
