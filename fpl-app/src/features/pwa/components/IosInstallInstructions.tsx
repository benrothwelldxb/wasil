import { useEffect } from "react";
import { Plus, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/common";

export interface IosInstallInstructionsProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    icon: Share,
    text: "Tap the Share button in Safari's toolbar.",
  },
  {
    icon: Plus,
    text: 'Scroll down and tap "Add to Home Screen".',
  },
  {
    icon: null,
    text: 'Tap "Add" — MyFPLScout appears on your home screen.',
  },
] as const;

/**
 * Step-by-step "Add to Home Screen" guide for iOS Safari, which has no install
 * prompt API. A lightweight bottom sheet consistent with the app's overlays.
 */
export function IosInstallInstructions({
  open,
  onClose,
}: IosInstallInstructionsProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install MyFPLScout on iPhone or iPad"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 backdrop-blur animate-in fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-xl animate-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <h2 className="text-base font-semibold">Install MyFPLScout</h2>
              <p className="text-xs text-muted-foreground">
                Add it to your home screen — three quick taps.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ol className="mt-4 space-y-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li key={i} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  {step.text}
                  {Icon && (
                    <Icon
                      className="inline h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        <p className="mt-4 text-xs text-muted-foreground">
          Not seeing the option? Make sure you're using Safari — other iPhone
          browsers can't add to the home screen.
        </p>
      </div>
    </div>
  );
}
