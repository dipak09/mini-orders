// Contract with the backend (services/orders/api.js, services/catalog/index.js).
export type OrderStatus = 'PENDING' | 'CONFIRMED';

export interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  confirmedAt?: string;
}

export interface NewOrder {
  customerEmail: string;
  items: OrderItem[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  createdAt: string;
}

export interface NewProduct {
  name: string;
  price: number;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}
