import type { OrderStatus } from '../api/types';

const LABEL: Record<OrderStatus, string> = { PENDING: 'Pending', CONFIRMED: 'Confirmed' };

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge badge-${status.toLowerCase()}`}>
      <span className="badge-dot" aria-hidden="true" />
      {LABEL[status] ?? status}
    </span>
  );
}
