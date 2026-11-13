import { AlertTriangle, RotateCw } from 'lucide-react';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 animate-fade-in dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold text-rose-700 ring-1 ring-inset ring-rose-300 hover:bg-rose-50 dark:bg-transparent dark:text-rose-200 dark:ring-rose-400/40"
        >
          <RotateCw className="size-4" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}
