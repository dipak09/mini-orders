import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import Swal from 'sweetalert2';
import { server } from './server';

// jsdom has no matchMedia; SweetAlert2's `auto` theme and our toast positioning use it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom has no layout, so every element measures 0x0 and SweetAlert2 treats its buttons as
// hidden. Minimal model: an element has size unless it or an ancestor is display:none.
for (const prop of ['offsetWidth', 'offsetHeight'] as const) {
  Object.defineProperty(HTMLElement.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      const hidden = (el: HTMLElement | null): boolean => !!el && (el.style.display === 'none' || hidden(el.parentElement));
      return this.isConnected && !hidden(this) ? 1 : 0;
    },
  });
}
window.scrollTo = () => {};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  Swal.close(); // don't leak dialogs/toasts into the next test
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
