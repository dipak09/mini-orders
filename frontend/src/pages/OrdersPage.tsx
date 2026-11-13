import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { deleteOrder, listOrders } from '../api/orders';
import { listProducts } from '../api/products';
import type { Order, Page } from '../api/types';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorBanner } from '../components/ErrorBanner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatDate, formatMoney } from '../lib/format';

type OrdersData = InfiniteData<Page<Order>, string | undefined>;
export const ORDERS_KEY = ['orders'] as const;
const POLL_MS = 2000;

const hasPending = (data?: OrdersData) =>
  !!data?.pages.some((p) => p.items.some((o) => o.status === 'PENDING'));

export function OrdersPage() {
  const queryClient = useQueryClient();
  const highlightId = (useLocation().state as { highlightId?: string } | null)?.highlightId;
  const [toDelete, setToDelete] = useState<Order | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
  const rows = useMemo(
    () =>
      (orders.data?.pages.flatMap((p) => p.items) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders.data],
  );

  const remove = useMutation({
    mutationFn: (id: string) => deleteOrder(id),
    // Optimistic: remove the row now, put it back if the API call fails.
    onMutate: async (id) => {
      setDeleteError(null);
      await queryClient.cancelQueries({ queryKey: ORDERS_KEY });
      const previous = queryClient.getQueryData<OrdersData>(ORDERS_KEY);
      queryClient.setQueryData<OrdersData>(ORDERS_KEY, (data) =>
        data && { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((o) => o.id !== id) })) },
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ORDERS_KEY, ctx.previous);
      setDeleteError(`Could not delete the order: ${err.message}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ORDERS_KEY }),
  });

  return (
    <section>
      <div className="page-header">
        <h1>Orders</h1>
        <Link to="/new" className="btn btn-primary">
          + New order
        </Link>
      </div>

      {deleteError && <ErrorBanner message={deleteError} />}

      {orders.isPending ? (
        <div className="card" aria-busy="true">
          <p className="muted">Loading orders…</p>
        </div>
      ) : orders.isError ? (
        <ErrorBanner message={`Could not load orders: ${orders.error.message}`} onRetry={() => orders.refetch()} />
      ) : rows.length === 0 ? (
        <div className="card empty">
          <p>No orders yet.</p>
          <Link to="/new" className="btn btn-primary">
            Create the first order
          </Link>
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Created</th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className={o.id === highlightId ? 'row-highlight' : undefined}>
                  <td>{formatDate(o.createdAt)}</td>
                  <td>{o.customerEmail}</td>
                  <td>
                    {o.items.map((i, idx) => (
                      <div key={`${i.productId}-${idx}`}>
                        {i.quantity} × {productName(i.productId)}
                      </div>
                    ))}
                  </td>
                  <td className="num">{formatMoney(o.total)}</td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="num">
                    <button
                      type="button"
                      className="btn btn-small btn-ghost-danger"
                      onClick={() => setToDelete(o)}
                      aria-label={`Delete order for ${o.customerEmail}`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.hasNextPage && (
            <div className="load-more">
              <button
                type="button"
                className="btn"
                onClick={() => orders.fetchNextPage()}
                disabled={orders.isFetchingNextPage}
              >
                {orders.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete order?"
          message={`The order for ${toDelete.customerEmail} (${formatMoney(toDelete.total)}) will be permanently deleted.`}
          confirmLabel="Delete"
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            remove.mutate(toDelete.id);
            setToDelete(null);
          }}
        />
      )}
    </section>
  );
}
