export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export interface ApiErrorDetails {
  [key: string]: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: ApiErrorDetails;

  constructor(code: string, message: string, status: number, details?: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: ApiErrorDetails } | null;
  meta: unknown | null;
}

export interface ApiResult<T> {
  data: T;
  meta: unknown | null;
}

/**
 * Calls the API and unwraps the `{ success, data, error, meta }` envelope.
 * Throws ApiError on non-2xx responses or `success: false` payloads.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
      0
    );
  }

  if (response.status === 204) {
    return { data: null as T, meta: null };
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || !payload.success) {
    const error = payload?.error;
    throw new ApiError(
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "Something went wrong. Please try again.",
      response.status,
      error?.details
    );
  }

  return { data: payload.data as T, meta: payload.meta };
}
