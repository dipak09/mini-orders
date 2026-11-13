import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createOrder } from '../api/orders';
import { createProduct, listProducts } from '../api/products';
import type { Product } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { formatMoney } from '../lib/format';
import { validateOrder, validateProduct } from '../lib/validation';
import { ORDERS_KEY } from './OrdersPage';

// Notifications service fails any email containing "fail": retries 3x, then the DLQ.
const FAIL_EMAIL = 'fail@example.com';

interface Row {
  key: number;
  productId: string;
  quantity: number;
}

export function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const nextKey = useRef(1);
  const [email, setEmail] = useState('');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [rows, setRows] = useState<Row[]>([{ key: 0, productId: '', quantity: 1 }]);
  const [formError, setFormError] = useState<string | null>(null);

  const products = useQuery({ queryKey: ['products'], queryFn: listProducts });
  const byId = useMemo(() => new Map<string, Product>(products.data?.items.map((p) => [p.id, p])), [products.data]);
  const total = rows.reduce((sum, r) => sum + (byId.get(r.productId)?.price ?? 0) * (r.quantity || 0), 0);

  const create = useMutation({
    mutationFn: createOrder,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      navigate('/', { state: { highlightId: order.id } });
    },
  });

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: nextKey.current++, productId: '', quantity: 1 }]);
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const customerEmail = simulateFailure ? FAIL_EMAIL : email.trim();
    const error = validateOrder(customerEmail, rows);
    setFormError(error);
    if (error) return;
    create.mutate({
      customerEmail,
      // Price comes from the catalog, not from user input.
      items: rows.map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: byId.get(r.productId)!.price })),
    });
  };

  const onProductCreated = (p: Product) =>
    setRows((rs) => {
      const empty = rs.find((r) => !r.productId);
      return empty ? rs.map((r) => (r === empty ? { ...r, productId: p.id } : r)) : rs;
    });

  return (
    <section>
      <div className="page-header">
        <h1>New order</h1>
      </div>

      {products.isError && (
        <ErrorBanner message={`Could not load products: ${products.error.message}`} onRetry={() => products.refetch()} />
      )}

      <form className="card form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="email">Customer email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={simulateFailure ? FAIL_EMAIL : email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={simulateFailure}
            placeholder="demo@example.com"
          />
          <label className="checkbox">
            <input type="checkbox" checked={simulateFailure} onChange={(e) => setSimulateFailure(e.target.checked)} />
            Simulate notification failure (order goes to the DLQ and stays Pending)
          </label>
        </div>

        <fieldset className="field">
          <legend>Items</legend>
          {rows.map((r, i) => (
            <div className="item-row" key={r.key}>
              <select
                aria-label={`Product for item ${i + 1}`}
                value={r.productId}
                onChange={(e) => updateRow(r.key, { productId: e.target.value })}
                disabled={products.isPending}
              >
                <option value="">{products.isPending ? 'Loading products…' : 'Choose a product'}</option>
                {products.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price)}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Quantity for item ${i + 1}`}
                type="number"
                min={1}
                step={1}
                value={Number.isNaN(r.quantity) ? '' : r.quantity}
                onChange={(e) => updateRow(r.key, { quantity: e.target.valueAsNumber })}
              />
              <button
                type="button"
                className="btn btn-small"
                onClick={() => removeRow(r.key)}
                disabled={rows.length === 1}
                aria-label={`Remove item ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-small" onClick={addRow}>
            + Add item
          </button>
          {products.data?.items.length === 0 && <p className="muted">No products yet. Add one below.</p>}
        </fieldset>

        <div className="total">
          Total <strong>{formatMoney(total)}</strong>
        </div>

        {(formError || create.isError) && <ErrorBanner message={formError ?? create.error!.message} />}

        <div className="form-actions">
          <Link to="/" className="btn">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Placing order…' : 'Place order'}
          </button>
        </div>
      </form>

      <AddProduct onCreated={onProductCreated} />
    </section>
  );
}

function AddProduct({ onCreated }: { onCreated: (p: Product) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: createProduct,
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      onCreated(product);
      setName('');
      setPrice('');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const priceNum = Number(price);
    const err = validateProduct(name, priceNum);
    setError(err);
    if (!err) create.mutate({ name: name.trim(), price: priceNum });
  };

  return (
    <details className="card add-product">
      <summary>Add a product to the catalog</summary>
      <form className="product-form" onSubmit={onSubmit} noValidate>
        <input aria-label="Product name" placeholder="Mechanical Keyboard" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          aria-label="Price"
          placeholder="49.99"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button type="submit" className="btn" disabled={create.isPending}>
          {create.isPending ? 'Adding…' : 'Add product'}
        </button>
      </form>
      {(error || create.isError) && <ErrorBanner message={error ?? create.error!.message} />}
    </details>
  );
}
