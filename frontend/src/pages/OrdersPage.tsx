import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { deleteOrder, listOrders } from '../api/orders';
import { listProducts } from '../api/products';
import type { Order, OrderStatus, Page } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorBanner } from '../components/ErrorBanner';
import { EmptyState } from '../components/EmptyState';
import { btn, card } from '../components/ui';
import { confirmDeleteOrder, notify } from '../lib/alerts';
import { formatDate, formatMoney, formatRelative } from '../lib/format';
import { cx } from '../lib/cx';

type OrdersData = InfiniteData<Page<Order>, string | undefined>;
export const ORDERS_KEY = ['orders'] as const;
const POLL_MS = 2000;
type Filter = 'ALL' | OrderStatus;
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'CONFIRMED', label: 'Confirmed' },
];

const hasPending = (data?: { pages: Page<Order>[] }) => !!data?.pages.some((p) => p.items.some((o) => o.status === 'PENDING'));

export function OrdersPage() {
  const queryClient = useQueryClient();
  const highlightId = (useLocation().state as { highlightId?: string } | null)?.highlightId;
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');

  const orders = useInfiniteQuery({
    queryKey: ORDERS_KEY,
    queryFn: ({ pageParam }) => listOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    // Poll only while something is PENDING: shows the event-driven confirmation live.
    refetchInterval: (query) => (hasPending(query.state.data) ? POLL_MS : false),
  });

  const products = useQuery({ queryKey: ['products'], queryFn: listProducts });
  const productName = useMemo(() => {
    const names = new Map(products.data?.items.map((p) => [p.id, p.name]));
    return (id: string) => names.get(id) ?? 'Unknown product';
  }, [products.data]);

  // DynamoDB Scan is unordered, so sort everything loaded so far, newest first.
  const all = useMemo(
    () => (orders.data?.pages.flatMap((p) => p.items) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders.data],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((o) => (filter === 'ALL' || o.status === filter) && (!q || o.customerEmail.toLowerCase().includes(q)));
  }, [all, filter, search]);

  const stats = useMemo(
    () => ({
      count: all.length,
      pending: all.filter((o) => o.status === 'PENDING').length,
      revenue: all.reduce((s, o) => s + o.total, 0),
    }),
    [all],
  );

  const remove = useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    // Optimistic: remove the row now, put it back if the API call fails.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ORDERS_KEY });
      const previous = queryClient.getQueryData<OrdersData>(ORDERS_KEY);
      queryClient.setQueryData<OrdersData>(ORDERS_KEY, (data) =>
        data && { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((o) => o.id !== id) })) },
      );
      return { previous };
    },
    onSuccess: () => notify.success('Order deleted'),
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ORDERS_KEY, ctx.previous);
      notify.error(`Could not delete the order: ${err.message}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
  });

  const onDelete = async (o: Order) => {
    if (await confirmDeleteOrder(o)) remove.mutate(o.id);
  };

  const items = (o: Order) =>
    o.items.map((i, idx) => (
      <div key={`${i.productId}-${idx}`} className="truncate">
        <span className="tabular-nums text-slate-400">{i.quantity}×</span> {productName(i.productId)}
      </div>
    ));

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Orders</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            {hasPending(orders.data) ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Live — waiting for confirmations
              </>
            ) : (
              'Create, track and manage orders'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={btn.ghost}
            onClick={() => orders.refetch()}
            disabled={orders.isFetching}
            aria-label="Refresh orders"
          >
            <RefreshCw className={cx('size-4', orders.isFetching && 'animate-spin')} aria-hidden="true" />
          </button>
          <Link to="/new" className={cx(btn.primary, 'max-sm:hidden')}>
            <Plus className="size-4" aria-hidden="true" />
            New order
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Orders', value: `${stats.count}${orders.hasNextPage ? '+' : ''}` },
          { label: 'Pending', value: String(stats.pending) },
          { label: 'Revenue', value: formatMoney(stats.revenue) },
        ].map((s) => (
          <div key={s.label} className={cx(card, 'p-3 sm:p-5')}>
            <p className="text-xs font-medium text-slate-500 sm:text-sm dark:text-slate-400">{s.label}</p>
            <p className="mt-1 truncate text-lg font-bold tabular-nums sm:text-2xl">
              {orders.isPending ? <span className="inline-block h-6 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-800" /> : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search by customer email</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer email"
            className="block w-full rounded-xl border-0 bg-white py-2.5 pr-3 pl-9 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:bg-slate-900 dark:ring-slate-700"
          />
        </label>
        <div role="group" aria-label="Filter by status" className="inline-flex rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cx(
                'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none',
                filter === f.value
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {orders.isPending ? (
        <div className={cx(card, 'divide-y divide-slate-100 dark:divide-slate-800')} aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-6 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>
          ))}
        </div>
      ) : orders.isError ? (
        <ErrorBanner message={`Could not load orders: ${orders.error.message}`} onRetry={() => orders.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          title="No orders yet."
          description="Place an order and watch it go from Pending to Confirmed through the event pipeline."
          action={
            <Link to="/new" className={btn.primary}>
              <Plus className="size-4" aria-hidden="true" />
              Create the first order
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No orders match" description="Try a different search or status filter." />
      ) : (
        <>
          {/* Phones: cards */}
          <ul className="space-y-3 md:hidden" aria-label="Orders">
            {rows.map((o) => (
              <li
                key={o.id}
                className={cx(card, 'p-4 animate-fade-in', o.id === highlightId && 'animate-highlight ring-2 ring-indigo-500/60')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.customerEmail}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400" title={formatDate(o.createdAt)}>
                      {formatRelative(o.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-3 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">{items(o)}</div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="text-lg font-bold tabular-nums">{formatMoney(o.total)}</p>
                  <button type="button" className={btn.dangerGhost} onClick={() => onDelete(o)} aria-label={`Delete order for ${o.customerEmail}`}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {/* Tablet and up: table */}
          <div className={cx(card, 'hidden overflow-hidden md:block')}>
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((o) => (
                  <tr key={o.id} className={cx('transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40', o.id === highlightId && 'animate-highlight')}>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-500 dark:text-slate-400" title={formatDate(o.createdAt)}>
                      {formatRelative(o.createdAt)}
                    </td>
                    <td className="max-w-56 truncate px-5 py-4 font-medium">{o.customerEmail}</td>
                    <td className="max-w-64 px-5 py-4 text-slate-600 dark:text-slate-300">{items(o)}</td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">{formatMoney(o.total)}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" className={btn.dangerGhost} onClick={() => onDelete(o)} aria-label={`Delete order for ${o.customerEmail}`}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {orders.hasNextPage && (
            <div className="flex justify-center">
              <button type="button" className={btn.secondary} onClick={() => orders.fetchNextPage()} disabled={orders.isFetchingNextPage}>
                {orders.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
