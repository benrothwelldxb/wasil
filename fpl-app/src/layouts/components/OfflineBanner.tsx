import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks";

/**
 * A slim banner shown when the device is offline. Cached data (persisted
 * TanStack Query cache + the service-worker asset cache) keeps the app usable.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-xs font-medium text-warning-foreground"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      You're offline — showing the latest cached data.
    </div>
  );
}
