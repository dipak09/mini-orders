import { CheckCircle2, Clock } from 'lucide-react';
import type { OrderStatus } from '../api/types';
import { cx } from '../lib/cx';

const STYLE: Record<OrderStatus, { label: string; cls: string }> = {
  PENDING: {
    label: 'Pending',
    cls: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  },
  CONFIRMED: {
    label: 'Confirmed',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STYLE[status] ?? { label: status, cls: 'bg-slate-100 text-slate-700 ring-slate-500/20' };
  const Icon = status === 'PENDING' ? Clock : CheckCircle2;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', s.cls)}>
      <Icon className={cx('size-3.5', status === 'PENDING' && 'motion-safe:animate-pulse')} aria-hidden="true" />
      {s.label}
    </span>
  );
}
