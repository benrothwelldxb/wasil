import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  photoUrl: string;
  name: string;
  size?: number;
  className?: string;
}

/**
 * Player headshot with a graceful fallback to a placeholder icon when the
 * photo can't be loaded.
 */
export function PlayerAvatar({
  photoUrl,
  name,
  size = 36,
  className,
}: PlayerAvatarProps) {
  const [errored, setErrored] = useState(false);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {errored ? (
        <User
          className="text-muted-foreground"
          style={{ width: size * 0.55, height: size * 0.55 }}
          aria-hidden
        />
      ) : (
        <img
          src={photoUrl}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
