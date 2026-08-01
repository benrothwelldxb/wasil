import { useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/common";
import { useInstallPrompt } from "../useInstallPrompt";
import { isBannerSnoozed, usePwaStore } from "../store";
import { IosInstallInstructions } from "./IosInstallInstructions";

/**
 * A gentle, dismissable "Install this app" banner. Appears once the app is
 * installable (Chromium prompt available, or iOS Safari) and the user hasn't
 * recently dismissed it. Sits above the mobile tab bar. Tapping install fires
 * the native prompt, or opens the iOS "Add to Home Screen" guide.
 */
export function InstallPrompt() {
  const { mode, promptInstall } = useInstallPrompt();
  const bannerDismissedAt = usePwaStore((s) => s.bannerDismissedAt);
  const dismissBanner = usePwaStore((s) => s.dismissBanner);
  const [iosOpen, setIosOpen] = useState(false);

  const hidden = mode === "unavailable" || isBannerSnoozed(bannerDismissedAt);

  const onInstall = async () => {
    if (mode === "ios") {
      setIosOpen(true);
      return;
    }
    const outcome = await promptInstall();
    // If they installed (or actively declined), stop offering the banner.
    if (outcome === "accepted" || outcome === "dismissed") dismissBanner();
  };

  return (
    <>
      {!hidden && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-3 md:bottom-4 md:left-auto md:right-4 md:px-0">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg md:mx-0">
            <BrandMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Install MyFPLScout</div>
              <p className="truncate text-xs text-muted-foreground">
                One-tap access from your home screen — works offline.
              </p>
            </div>
            <Button size="sm" onClick={onInstall} className="shrink-0">
              <Download className="h-4 w-4" />
              Install
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={dismissBanner}
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <IosInstallInstructions open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}
