import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { env } from "@/lib/env";
import type { ApiError } from "./types";

/**
 * Create a pre-configured Axios instance.
 *
 * Interceptors are attached here so every request/response passes through a
 * single, consistent pipeline (auth headers, logging, error normalisation).
 * No concrete endpoints live in this file.
 */
export function createAxiosInstance(): AxiosInstance {
  const instance = axios.create({
    baseURL: env.apiBaseUrl,
    timeout: env.apiTimeout,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  // --- Request interceptor -------------------------------------------------
  instance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // Placeholder for cross-cutting request concerns such as attaching an
      // auth token. Kept generic — no domain logic yet.
      // const token = getAuthToken();
      // if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    },
    (error: unknown) => Promise.reject(error),
  );

  // --- Response interceptor ------------------------------------------------
  instance.interceptors.response.use(
    (response: AxiosResponse) => response,
    (error: AxiosError) => Promise.reject(normalizeAxiosError(error)),
  );

  return instance;
}

/**
 * Convert an unknown/Axios error into a stable, typed {@link ApiError}.
 * Centralising this means UI and query code never touch raw Axios internals.
 */
export function normalizeAxiosError(error: unknown): ApiError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as
      | { message?: string; code?: string }
      | undefined;

    return {
      message:
        data?.message ??
        error.message ??
        "An unexpected network error occurred.",
      status,
      code: data?.code ?? error.code,
      details: error.response?.data,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: "An unexpected error occurred." };
}

/** Shared singleton Axios instance for the app. */
export const apiClient = createAxiosInstance();
