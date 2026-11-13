// Mirrors the backend validation in services/orders/api.js. The server still validates;
// this only gives instant feedback.
export interface DraftItem {
  productId: string;
  quantity: number;
}

const EMAIL = /^[^@\s]+@[^@\s]+$/;

export function validateOrder(email: string, items: DraftItem[]): string | null {
  if (!EMAIL.test(email)) return 'Enter a valid email address.';
  if (items.length === 0) return 'Add at least one item.';
  for (const item of items) {
    if (!item.productId) return 'Choose a product for every item.';
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return 'Quantity must be a whole number of at least 1.';
  }
  return null;
}

export function validateProduct(name: string, price: number): string | null {
  if (!name.trim()) return 'Product name is required.';
  if (!Number.isFinite(price) || price <= 0) return 'Price must be greater than 0.';
  return null;
}
