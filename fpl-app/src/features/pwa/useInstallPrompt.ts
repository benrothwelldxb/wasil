import { useCallback, useEffect, useState } from "react";

/**
 * The `beforeinstallprompt` event (not yet in the DOM lib typings). Fired by
 * Chromium browsers when the app meets install criteria; we stash it and fire
 * it from our own UI instead of the browser's default mini-infobar.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

/**
 * How the current browser can install the app:
 * - `native` — Chromium fired `beforeinstallprompt`; we can trigger it.
 * - `ios`    — iOS Safari (no prompt API); the user adds via the Share sheet.
 * - `unavailable` — already installed, or the browser can't install.
 */
export type InstallMode = "native" | "ios" | "unavailable";

export interface UseInstallPromptResult {
  mode: InstallMode;
  /** True when running as an installed (standalone) app. */
  isStandalone: boolean;
  /**
   * Fire the native install prompt. Resolves to the user's choice, or
   * `"unavailable"` when there's no native prompt to show (e.g. on iOS).
   */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone = window.matchMedia?.(
    "(display-mode: standalone)",
  ).matches;
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone;
  return Boolean(displayModeStandalone || iosStandalone);
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIPhoneOrPad = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ reports as desktop Safari but has a touch screen.
  const isIPadOS =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIPhoneOrPad || isIPadOS;
}

/**
 * Tracks installability across platforms and exposes a single `promptInstall`.
 *
 * Captures Chromium's `beforeinstallprompt` (so we can present our own install
 * UI), detects iOS Safari (which has no prompt API and needs manual "Add to
 * Home Screen" steps), and hides everything once the app is installed.
 */
export function useInstallPrompt(): UseInstallPromptResult {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [isStandalone, setIsStandalone] = useState<boolean>(detectStandalone);
  const [isIOS] = useState<boolean>(detectIOS);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stop the default mini-infobar; we drive install from our own UI.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // Keep standalone in sync if the display-mode changes at runtime.
    const mql = window.matchMedia("(display-mode: standalone)");
    const onDisplayChange = () => setIsStandalone(detectStandalone());
    mql.addEventListener?.("change", onDisplayChange);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      mql.removeEventListener?.("change", onDisplayChange);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A prompt can only be used once; drop it whatever the outcome.
    setDeferred(null);
    return outcome;
  }, [deferred]);

  const mode: InstallMode = isStandalone
    ? "unavailable"
    : deferred
      ? "native"
      : isIOS
        ? "ios"
        : "unavailable";

  return { mode, isStandalone, promptInstall };
}
