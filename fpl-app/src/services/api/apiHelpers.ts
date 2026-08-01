import type { AxiosRequestConfig } from "axios";
import { apiClient } from "./axiosInstance";

/**
 * Thin, strongly-typed wrappers around the shared Axios instance.
 *
 * Feature services build on top of these so call sites get a clean, typed
 * surface (`api.get<User>("/users/1")`) without repeating Axios boilerplate.
 * Errors are already normalised to {@link ApiError} by the response
 * interceptor, so callers can rely on a consistent rejection shape.
 */
export const api = {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.get<T>(url, config).then((res) => res.data);
  },

  post<T, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return apiClient.post<T>(url, body, config).then((res) => res.data);
  },

  put<T, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return apiClient.put<T>(url, body, config).then((res) => res.data);
  },

  patch<T, TBody = unknown>(
    url: string,
    body?: TBody,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return apiClient.patch<T>(url, body, config).then((res) => res.data);
  },

  delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return apiClient.delete<T>(url, config).then((res) => res.data);
  },
} as const;

export type Api = typeof api;
