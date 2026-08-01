import { useState } from "react";
import { cn } from "@/lib/utils";

interface TeamCrestProps {
  teamCode: number;
  teamShortName: string;
  size?: number;
  className?: string;
}

/**
 * Club crest from the official CDN with a monogram fallback. Local to the
 * fixtures feature so it never depends on other features (keeps the feature
 * graph acyclic).
 */
export function TeamCrest({
  teamCode,
  teamShortName,
  size = 24,
  className,
}: TeamCrestProps) {
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
