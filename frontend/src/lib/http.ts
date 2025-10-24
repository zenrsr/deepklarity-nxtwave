import { CONFIG } from "./config";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function http<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? CONFIG.REQUEST_TIMEOUT_MS
  );

  try {
    const res = await fetch(`${CONFIG.API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    const text = await res.text();
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson && text ? JSON.parse(text) : (text as unknown);

    if (!res.ok) {
      const msg =
        (isJson && (data as any)?.detail) ||
        (typeof data === "string" && data) ||
        `HTTP ${res.status}`;
      throw new ApiError(msg, res.status, data);
    }

    return data as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new ApiError("Request timed out", 408);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(err?.message || "Network error", 0, err);
  } finally {
    clearTimeout(timeout);
  }
}
