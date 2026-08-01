import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/store";
import type { ResolvedTheme, ThemeMode } from "@/types";
import { applyTheme, resolveTheme, subscribeToSystemTheme } from "@/utils";

interface UseThemeResult {
  /** The user's selected mode ("light" | "dark" | "system"). */
  theme: ThemeMode;
  /** The concrete theme currently applied to the document. */
  resolvedTheme: ResolvedTheme;
  /** Set a specific theme mode. */
  setTheme: (theme: ThemeMode) => void;
  /** Toggle between light and dark (based on what's resolved). */
  toggleTheme: () => void;
}

/**
 * The single source of truth for reading and mutating the theme.
 *
 * It keeps the store, the DOM (`.dark` class), and the OS preference in sync:
 * - applies the theme to `<html>` whenever the mode changes;
 * - re-applies automatically when the OS preference changes while in
 *   "system" mode.
 */
export function useTheme(): UseThemeResult {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme),
  );

  // Apply the theme to the DOM whenever the selected mode changes.
  useEffect(() => {
    setResolvedTheme(applyTheme(theme));
  }, [theme]);

  // While in "system" mode, follow OS preference changes live.
  useEffect(() => {
    if (theme !== "system") return;
    return subscribeToSystemTheme(() => {
      setResolvedTheme(applyTheme("system"));
    });
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return { theme, resolvedTheme, setTheme, toggleTheme };
}
