import { useState } from "react";
import { cn } from "@/lib/utils";

interface TeamBadgeProps {
  teamCode: number;
  teamShortName: string;
  size?: number;
  className?: string;
}

/**
 * Premier League club crest, loaded from the official CDN. Falls back to a
 * neutral monogram chip if the image fails to load (e.g. offline / blocked).
 */
export function TeamBadge({
  teamCode,
  teamShortName,
  size = 24,
  className,
}: TeamBadgeProps) {
  const [errored, setErrored] = useState(false);
  const src = `https://resources.premierleague.com/premierleague/badges/70/t${teamCode}.png`;

  if (errored || !teamCode) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden
      >
        {teamShortName.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn("object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
