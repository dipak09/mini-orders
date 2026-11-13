import { Minus, Plus } from 'lucide-react';

interface Props {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
}

const BTN =
  'grid size-11 place-items-center text-slate-600 transition hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700';

/** Big touch targets for mobile; the number is still typeable. */
export function QuantityStepper({ value, onChange, label, min = 1, max = 999 }: Props) {
  const n = Number.isNaN(value) ? min : value;
  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl bg-white ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:ring-slate-600">
      <button type="button" className={BTN} onClick={() => onChange(Math.max(min, n - 1))} disabled={n <= min} aria-label={`Decrease ${label}`}>
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="w-12 border-0 bg-transparent p-0 text-center font-semibold tabular-nums focus:ring-0 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button type="button" className={BTN} onClick={() => onChange(Math.min(max, n + 1))} disabled={n >= max} aria-label={`Increase ${label}`}>
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
