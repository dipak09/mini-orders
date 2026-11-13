import Select, { type SingleValue } from 'react-select';
import type { Product } from '../api/types';
import { formatMoney } from '../lib/format';
import { cx } from '../lib/cx';

interface Option {
  value: string;
  label: string;
  price: number;
}

interface Props {
  products: Product[];
  value: string;
  onChange: (productId: string) => void;
  ariaLabel: string;
  isLoading?: boolean;
}

/** Searchable product picker (Select2-style), styled with Tailwind via react-select's `unstyled` mode. */
export function ProductSelect({ products, value, onChange, ariaLabel, isLoading }: Props) {
  const options: Option[] = products.map((p) => ({ value: p.id, label: p.name, price: p.price }));
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Select<Option, false>
      unstyled
      aria-label={ariaLabel}
      options={options}
      value={selected}
      onChange={(o: SingleValue<Option>) => onChange(o?.value ?? '')}
      isLoading={isLoading}
      isSearchable
      blurInputOnSelect
      placeholder={isLoading ? 'Loading products…' : 'Search products…'}
      noOptionsMessage={({ inputValue }) => (inputValue ? `No product matches “${inputValue}”` : 'No products yet')}
      menuPortalTarget={typeof document === 'undefined' ? undefined : document.body}
      menuPlacement="auto"
      formatOptionLabel={(o, { context }) =>
        context === 'menu' ? (
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{o.label}</span>
            <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{formatMoney(o.price)}</span>
          </div>
        ) : (
          <span className="truncate">{o.label}</span>
        )
      }
      classNames={{
        control: ({ isFocused }) =>
          cx(
            'min-h-11 rounded-xl bg-white px-3 ring-1 ring-inset transition dark:bg-slate-800',
            isFocused ? 'ring-2 ring-indigo-500' : 'ring-slate-300 hover:ring-slate-400 dark:ring-slate-600',
          ),
        valueContainer: () => 'gap-1 py-1',
        placeholder: () => 'text-slate-400',
        singleValue: () => 'text-slate-900 dark:text-slate-100',
        input: () => 'text-slate-900 dark:text-slate-100',
        indicatorsContainer: () => 'gap-1 text-slate-400',
        dropdownIndicator: () => 'p-1 hover:text-slate-600',
        loadingIndicator: () => 'p-1',
        menuPortal: () => '!z-[60]',
        menu: () =>
          'mt-2 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 animate-fade-in dark:bg-slate-800 dark:ring-slate-700',
        menuList: () => 'max-h-64 py-1',
        option: ({ isFocused, isSelected }) =>
          cx(
            'cursor-pointer px-3 py-2.5 text-sm',
            isSelected
              ? 'bg-indigo-600 text-white [&_span]:text-white'
              : isFocused
                ? 'bg-indigo-50 text-indigo-900 dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-700 dark:text-slate-200',
          ),
        noOptionsMessage: () => 'px-3 py-3 text-sm text-slate-500',
        loadingMessage: () => 'px-3 py-3 text-sm text-slate-500',
      }}
    />
  );
}
