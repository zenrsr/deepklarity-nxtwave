export const CONFIG = {
  API_BASE: import.meta.env.VITE_API_BASE?.trim() || "http://localhost:8000",
  REQUEST_TIMEOUT_MS: Number(import.meta.env.VITE_REQUEST_TIMEOUT_MS ?? 20000),
};
