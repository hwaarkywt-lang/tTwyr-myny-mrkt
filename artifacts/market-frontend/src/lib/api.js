// Centralized axios client. Reads REACT_APP_BACKEND_URL, attaches JWT from localStorage,
// auto-logs out on 401. Offline-aware: queues mutations when network is down.
import axios from 'axios';
import { enqueueRequest } from './offline';

// `?? ''` so that when REACT_APP_BACKEND_URL is unset (e.g., reverse-proxy
// deployments where the API is same-origin), axios issues relative /api/...
// requests instead of "undefined/api/...".
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ?? '';
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('mm_token');
      localStorage.removeItem('mm_user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    // Network error → queue mutation for later, return synthetic offline response
    const isNetErr = !err.response && err.code !== 'ECONNABORTED';
    const cfg = err.config || {};
    const method = (cfg.method || 'get').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isNetErr && isMutation && navigator && !navigator.onLine) {
      try {
        const fullUrl = cfg.baseURL ? `${cfg.baseURL}${cfg.url}` : cfg.url;
        await enqueueRequest({
          url: fullUrl,
          method,
          body: cfg.data,
          headers: cfg.headers,
        });
        // Resolve as if successful (the UI updates optimistically); will sync when online
        return Promise.resolve({
          data: { _offline_queued: true, message: 'تم حفظ العملية محلياً وستُرسَل عند عودة الاتصال' },
          status: 202,
          statusText: 'Queued Offline',
          headers: {},
          config: cfg,
        });
      } catch (queueErr) {
        console.warn('Offline queue failed, rejecting request:', queueErr);
        /* fall through to reject */
      }
    }
    return Promise.reject(err);
  }
);

export function formatApiError(err) {
  const d = err?.response?.data?.detail;
  if (!d) return err?.message || 'حدث خطأ غير متوقع';
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(' • ');
  return JSON.stringify(d);
}

export default api;
