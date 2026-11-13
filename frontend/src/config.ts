// Baked in at build time (VITE_*). Dev and prod builds differ only by these values.
export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const STAGE = import.meta.env.VITE_STAGE ?? 'local';
