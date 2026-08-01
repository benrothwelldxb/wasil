/** Standard, normalised error shape surfaced by the API layer. */
export interface ApiError {
  /** Human-readable message, safe to show in the UI. */
  message: string;
  /** HTTP status code, when available. */
  status?: number;
  /** Machine-readable error code, when the backend provides one. */
  code?: string;
  /** Raw payload returned by the server, for debugging. */
  details?: unknown;
}

/** Envelope some APIs use to wrap successful responses. */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/** Generic shape for paginated list endpoints. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
