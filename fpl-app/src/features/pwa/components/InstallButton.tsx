import { useState } from "react";
import { Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "../useInstallPrompt";
import { IosInstallInstructions } from "./IosInstallInstructions";

/**
 * An "Install app" control for the Settings page, so the app can be installed
 * at any time — not only when the banner is showing. Reflects when the app is
 * already installed.
 */
export function InstallButton() {
  const { mode, isStandalone, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);

  if (isStandalone) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="h-4 w-4 text-[hsl(var(--brand-green))]" />
        MyFPLScout is installed on this device.
      </p>
    );
  }

  const onInstall = async () => {
    if (mode === "ios") {
      setIosOpen(true);
      return;
    }
    await promptInstall();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add MyFPLScout to your home screen for one-tap access and offline use.
      </p>
      {mode === "unavailable" ? (
        <p className="text-xs text-muted-foreground">
          Your browser will offer an install option when it's ready — on iPhone,
          use Safari's Share → Add to Home Screen.
        </p>
      ) : (
        <Button onClick={onInstall}>
          <Download className="h-4 w-4" />
          Install app
        </Button>
      )}
      <IosInstallInstructions open={iosOpen} onClose={() => setIosOpen(false)} />
    </div>
  );
}
