import type { ReactNode } from "react";
import { useTheme } from "@/hooks";

/**
 * Mounts the theming side-effects at the root of the app.
 *
 * Rendering {@link useTheme} here guarantees the persisted theme is applied to
 * the document on load and that "system" mode tracks OS preference changes,
 * independent of whether any visible theme control is mounted.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useTheme();
  return <>{children}</>;
}
