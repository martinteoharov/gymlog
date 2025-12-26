// API base URL - configure based on environment
// In development, Vite proxies /api to localhost:3000
// In production/Capacitor, set VITE_API_BASE to your deployed API

export const API_BASE = import.meta.env.VITE_API_BASE || '';
