import type { LucideIcon } from "lucide-react";

/** The three theme modes supported by the application. */
export type ThemeMode = "light" | "dark" | "system";

/** The concrete, resolved theme actually applied to the document. */
export type ResolvedTheme = "light" | "dark";

/** A single navigation destination used by the app shell. */
export interface NavItem {
  /** Stable identifier for the item. */
  id: string;
  /** Visible label. */
  label: string;
  /** Router path this item links to. */
  path: string;
  /** Icon rendered alongside the label. */
  icon: LucideIcon;
  /** Whether the link should match the path exactly (end). */
  end?: boolean;
}

/** Generic status enum for asynchronous UI state. */
export type AsyncStatus = "idle" | "loading" | "success" | "error";

/** Utility: make selected keys of `T` optional. */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Utility: a value that may be wrapped in a promise. */
export type MaybePromise<T> = T | Promise<T>;
