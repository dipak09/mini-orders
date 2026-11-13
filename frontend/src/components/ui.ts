// Shared button classes so pages stay consistent.
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-slate-950';

export const btn = {
  primary: `${BASE} bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 active:bg-indigo-700 focus-visible:ring-indigo-500`,
  secondary: `${BASE} bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:ring-indigo-500 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800`,
  ghost: `${BASE} text-slate-600 hover:bg-slate-100 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-slate-800`,
  dangerGhost: `${BASE} px-2.5 text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-500 dark:text-rose-400 dark:hover:bg-rose-500/10`,
};

export const card = 'rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800';
