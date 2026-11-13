import { request } from './client';
import type { NewOrder, Order, Page } from './types';

export const PAGE_SIZE = 50;

export function listOrders(cursor?: string): Promise<Page<Order>> {
  const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (cursor) qs.set('cursor', cursor);
  return request('GET', `/orders?${qs}`);
}

export const createOrder = (order: NewOrder) => request<Order>('POST', '/orders', order);

export const deleteOrder = (id: string) => request<void>('DELETE', `/orders/${encodeURIComponent(id)}`);
