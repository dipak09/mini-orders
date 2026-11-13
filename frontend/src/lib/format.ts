const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export const formatMoney = (n: number) => money.format(n);

export const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
};

/** "just now", "5 minutes ago", "3 hours ago"; falls back to a date after a day. */
export function formatRelative(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const sec = Math.round((t - now) / 1000);
  if (Math.abs(sec) < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return relative.format(min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return relative.format(hr, 'hour');
  return formatDate(iso);
}
