import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ClipboardList, PlusCircle, ShoppingCart } from 'lucide-react';
import { OrdersPage } from './pages/OrdersPage';
import { NewOrderPage } from './pages/NewOrderPage';
import { STAGE } from './config';
import { cx } from './lib/cx';

const NAV = [
  { to: '/', label: 'Orders', icon: ClipboardList, end: true },
  { to: '/new', label: 'New order', icon: PlusCircle, end: false },
];

export function App() {
  const onNewOrder = useLocation().pathname === '/new';
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:h-16 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5 font-bold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <ShoppingCart className="size-4" aria-hidden="true" />
            </span>
            Mini Orders
          </NavLink>
          <nav className="hidden gap-1 sm:flex" aria-label="Main">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          {/* Shown everywhere except prod, so you never demo the wrong site. */}
          {STAGE !== 'prod' && (
            <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
              {STAGE}
            </span>
          )}
        </div>
      </header>

      <main
        className={cx(
          'mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8 sm:pb-12',
          // room for the bottom tab bar (+ the sticky action bar on /new) on phones
          onNewOrder ? 'pb-48' : 'pb-28',
        )}
      >
        <Routes>
          <Route path="/" element={<OrdersPage />} />
          <Route path="/new" element={<NewOrderPage />} />
          <Route path="*" element={<p className="text-slate-500">Page not found.</p>} />
        </Routes>
      </main>

      {/* Mobile bottom tab bar: app-like navigation within thumb reach */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg sm:hidden dark:border-slate-800 dark:bg-slate-950/90"
      >
        <div className="grid h-16 grid-cols-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center justify-center gap-1 text-xs font-medium transition',
                  isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <Icon className="size-6" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
