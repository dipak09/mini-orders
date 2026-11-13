import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Mail, PackagePlus, Plus, X } from 'lucide-react';
import { createOrder } from '../api/orders';
import { listProducts } from '../api/products';
import type { Product } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { ProductSelect } from '../components/ProductSelect';
import { QuantityStepper } from '../components/QuantityStepper';
import { btn, card } from '../components/ui';
import { notify, promptNewProduct } from '../lib/alerts';
import { formatMoney } from '../lib/format';
import { validateOrder } from '../lib/validation';
import { cx } from '../lib/cx';
import { ORDERS_KEY } from './OrdersPage';

// The notifications service fails any email containing "fail": 3 retries, then the DLQ.
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
  const catalog = useMemo(() => products.data?.items ?? [], [products.data]);
  const byId = useMemo(() => new Map<string, Product>(catalog.map((p) => [p.id, p])), [catalog]);
  const lines = rows
    .map((r) => ({ ...r, product: byId.get(r.productId) }))
    .filter((l) => l.product && l.quantity > 0);
  const total = lines.reduce((sum, l) => sum + l.product!.price * l.quantity, 0);

  const create = useMutation({
    mutationFn: createOrder,
    onSuccess: async (order) => {
      notify.success('Order placed — confirming…');
      await queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
      navigate('/', { state: { highlightId: order.id } });
    },
  });

  const updateRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { key: nextKey.current++, productId: '', quantity: 1 }]);
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));

  const onAddProduct = async () => {
    const p = await promptNewProduct();
    if (!p) return;
    await queryClient.invalidateQueries({ queryKey: ['products'] });
    notify.success(`${p.name} added`);
    setRows((rs) => {
      const empty = rs.find((r) => !r.productId);
      return empty ? rs.map((r) => (r === empty ? { ...r, productId: p.id } : r)) : [...rs, { key: nextKey.current++, productId: p.id, quantity: 1 }];
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const customerEmail = simulateFailure ? FAIL_EMAIL : email.trim();
    const error = validateOrder(customerEmail, rows);
    setFormError(error);
    if (error) return;
    create.mutate({
      customerEmail,
      // Price comes from the catalog, never from user input.
      items: rows.map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: byId.get(r.productId)!.price })),
    });
  };

  const submitLabel = create.isPending ? 'Placing order…' : 'Place order';
  const errorMessage = formError ?? (create.isError ? create.error.message : null);

  return (
    <section className="space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Orders
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">New order</h1>
      </div>

      {products.isError && (
        <ErrorBanner message={`Could not load products: ${products.error.message}`} onRetry={() => products.refetch()} />
      )}

      <form id="new-order" onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-6">
          {/* Customer */}
          <div className={cx(card, 'space-y-4 p-5 sm:p-6')}>
            <h2 className="font-semibold">Customer</h2>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Customer email
              </label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={simulateFailure ? FAIL_EMAIL : email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={simulateFailure}
                  placeholder="demo@example.com"
                  className="block w-full rounded-xl border-0 bg-white py-2.5 pr-3 pl-9 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 dark:bg-slate-800 dark:ring-slate-600 dark:disabled:bg-slate-800/50"
                />
              </div>
            </div>

            {/* Toggle switch */}
            <label className="flex cursor-pointer items-start gap-3">
              <span className="relative mt-0.5 inline-flex shrink-0">
                <input
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  checked={simulateFailure}
                  onChange={(e) => setSimulateFailure(e.target.checked)}
                />
                <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-amber-500 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2 dark:bg-slate-700" />
                <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
              </span>
              <span className="text-sm">
                <span className="font-medium">Simulate notification failure</span>
                <span className="block text-slate-500 dark:text-slate-400">The order goes to the DLQ and stays Pending.</span>
              </span>
            </label>
          </div>

          {/* Items */}
          <div className={cx(card, 'space-y-4 p-5 sm:p-6')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Items</h2>
              <button type="button" onClick={onAddProduct} className={cx(btn.ghost, 'px-2.5 py-1.5 text-indigo-600 dark:text-indigo-400')}>
                <PackagePlus className="size-4" aria-hidden="true" />
                New product
              </button>
            </div>

            <ul className="space-y-3">
              {rows.map((r, i) => {
                const product = byId.get(r.productId);
                return (
                  <li key={r.key} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 animate-fade-in dark:bg-slate-800/40 dark:ring-slate-700/60">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <ProductSelect
                          ariaLabel={`Product for item ${i + 1}`}
                          products={catalog}
                          value={r.productId}
                          onChange={(productId) => updateRow(r.key, { productId })}
                          isLoading={products.isPending}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(r.key)}
                        disabled={rows.length === 1}
                        aria-label={`Remove item ${i + 1}`}
                        className="grid size-11 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-700"
                      >
                        <X className="size-5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <QuantityStepper label={`Quantity for item ${i + 1}`} value={r.quantity} onChange={(quantity) => updateRow(r.key, { quantity })} />
                      <p className="text-right text-sm text-slate-500 dark:text-slate-400">
                        {product ? (
                          <>
                            <span className="tabular-nums">{formatMoney(product.price)}</span> each
                            <span className="block text-base font-semibold text-slate-900 tabular-nums dark:text-white">
                              {formatMoney(product.price * (r.quantity || 0))}
                            </span>
                          </>
                        ) : (
                          'Choose a product'
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={addRow}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add item
            </button>
            {products.isSuccess && catalog.length === 0 && (
              <p className="text-sm text-slate-500">
                The catalog is empty. Use <strong>New product</strong> to add one.
              </p>
            )}
          </div>

          {errorMessage && <ErrorBanner message={errorMessage} />}
        </div>

        {/* Summary: sidebar on desktop */}
        <aside className={cx(card, 'hidden space-y-4 p-6 lg:sticky lg:top-24 lg:block')}>
          <h2 className="font-semibold">Summary</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-slate-500">No items yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3">
                  <span className="truncate text-slate-600 dark:text-slate-300">
                    {l.quantity}× {l.product!.name}
                  </span>
                  <span className="tabular-nums">{formatMoney(l.product!.price * l.quantity)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-500">Total</span>
            <span className="text-2xl font-bold tabular-nums" data-testid="total">
              {formatMoney(total)}
            </span>
          </div>
          <button type="submit" className={cx(btn.primary, 'w-full py-3')} disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitLabel}
          </button>
        </aside>
      </form>

      {/* Phones/tablets: sticky action bar above the tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-lg sm:bottom-0 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-xl font-bold tabular-nums">{formatMoney(total)}</p>
          </div>
          <button type="submit" form="new-order" className={cx(btn.primary, 'px-6 py-3')} disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {submitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
