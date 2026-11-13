import { validateOrder, validateProduct } from '../lib/validation';

describe('validateOrder', () => {
  const item = { productId: 'p1', quantity: 1 };
  it('accepts a valid order', () => expect(validateOrder('a@b.com', [item])).toBeNull());
  it.each([
    ['bad email', 'nope', [item]],
    ['no items', 'a@b.com', []],
    ['no product', 'a@b.com', [{ productId: '', quantity: 1 }]],
    ['zero quantity', 'a@b.com', [{ productId: 'p1', quantity: 0 }]],
    ['fractional quantity', 'a@b.com', [{ productId: 'p1', quantity: 1.5 }]],
    ['empty quantity', 'a@b.com', [{ productId: 'p1', quantity: NaN }]],
  ])('rejects %s', (_label, email, items) => expect(validateOrder(email, items)).not.toBeNull());
});

describe('validateProduct', () => {
  it('accepts a valid product', () => expect(validateProduct('Pen', 2.5)).toBeNull());
  it('rejects a blank name', () => expect(validateProduct('  ', 2)).not.toBeNull());
  it('rejects a non-positive price', () => expect(validateProduct('Pen', 0)).not.toBeNull());
});
