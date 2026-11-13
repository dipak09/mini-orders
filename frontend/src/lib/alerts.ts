import Swal from 'sweetalert2';
import { createProduct } from '../api/products';
import type { Order, Product } from '../api/types';
import { formatMoney } from './format';
import { validateProduct } from './validation';

const BTN = 'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const PRIMARY = `${BTN} bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:ring-indigo-500`;
const DANGER = `${BTN} bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-500`;
const SECONDARY = `${BTN} bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-700`;
const INPUT = 'mt-1 block w-full rounded-xl border-0 bg-white px-3 py-2.5 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-600';

// jsdom never fires CSS animation events, so SweetAlert2 would wait forever to finish closing.
const animation = import.meta.env.MODE !== 'test';

const dialog = Swal.mixin({
  theme: 'auto',
  animation,
  buttonsStyling: false,
  reverseButtons: true,
  customClass: { confirmButton: PRIMARY, cancelButton: SECONDARY },
});

const isNarrow = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;

function toast(icon: 'success' | 'error' | 'info', title: string) {
  void Swal.fire({
    theme: 'auto',
    animation,
    toast: true,
    position: isNarrow() ? 'top' : 'top-end',
    icon,
    title,
    showConfirmButton: false,
    timer: icon === 'error' ? 5000 : 2500,
    timerProgressBar: true,
  });
}
export const notify = {
  success: (title: string) => toast('success', title),
  error: (title: string) => toast('error', title),
  info: (title: string) => toast('info', title),
};

export async function confirmDeleteOrder(order: Order): Promise<boolean> {
  const result = await dialog.fire({
    icon: 'warning',
    title: 'Delete this order?',
    // `text`, never `html`: the email is user input and must not be rendered as markup.
    text: `The order for ${order.customerEmail} (${formatMoney(order.total)}) will be permanently deleted.`,
    showCancelButton: true,
    confirmButtonText: 'Delete',
    cancelButtonText: 'Cancel',
    focusCancel: true,
    customClass: { confirmButton: DANGER, cancelButton: SECONDARY },
  });
  return result.isConfirmed;
}

// Static markup only (no user data), so `html` is safe here.
const PRODUCT_FORM = `
  <div class="space-y-4 text-left">
    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">Product name
      <input id="swal-product-name" class="${INPUT}" placeholder="Mechanical Keyboard" autocomplete="off" />
    </label>
    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">Price
      <input id="swal-product-price" class="${INPUT}" placeholder="49.99" inputmode="decimal" autocomplete="off" />
    </label>
  </div>`;

/** Opens the "Add product" dialog; resolves with the created product, or null if cancelled. */
export async function promptNewProduct(): Promise<Product | null> {
  const result = await dialog.fire<Product>({
    title: 'Add product',
    html: PRODUCT_FORM,
    showCancelButton: true,
    confirmButtonText: 'Add product',
    focusConfirm: false,
    didOpen: () => document.getElementById('swal-product-name')?.focus(),
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async () => {
      const name = (document.getElementById('swal-product-name') as HTMLInputElement).value;
      const price = Number((document.getElementById('swal-product-price') as HTMLInputElement).value);
      const error = validateProduct(name, price);
      if (error) {
        // Validate before showing the spinner, so a typo never flashes a loader.
        Swal.showValidationMessage(error);
        return false;
      }
      Swal.showLoading(Swal.getConfirmButton());
      try {
        return await createProduct({ name: name.trim(), price });
      } catch (err) {
        Swal.hideLoading();
        Swal.showValidationMessage((err as Error).message);
        return false;
      }
    },
  });
  return result.isConfirmed && result.value ? result.value : null;
}
