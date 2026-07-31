import { motion } from 'framer-motion'
import { ScanLine } from 'lucide-react'

interface OcrProgressProps {
  /** 0–1 recognition progress. */
  progress: number
  /** Friendly status label, e.g. "Reading your receipt…". */
  label: string
  imageUrl?: string
}

/**
 * Full-bleed progress state shown while Tesseract runs. Pairs a live progress
 * bar with a scanning shimmer over the receipt thumbnail for a premium feel.
 */
export function OcrProgress({ progress, label, imageUrl }: OcrProgressProps) {
  const pct = Math.round(progress * 100)

  return (
    <div className="flex flex-col items-center rounded-3xl border border-border bg-card/50 px-6 py-10 text-center">
      {imageUrl ? (
        <div className="relative mb-6 h-40 w-32 overflow-hidden rounded-2xl border border-border bg-black/80 shadow-card">
          <img
            src={imageUrl}
            alt="Receipt being scanned"
            className="h-full w-full object-cover opacity-80"
          />
          <motion.div
            className="absolute inset-x-0 h-16 bg-gradient-to-b from-accent/0 via-accent/40 to-accent/0"
            initial={{ top: '-4rem' }}
            animate={{ top: ['-4rem', '100%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      ) : (
        <span className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-accent/10 text-accent-strong">
          <ScanLine className="h-8 w-8" />
        </span>
      )}

      <p className="text-base font-semibold">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        This runs entirely on your device.
      </p>

      <div className="mt-6 h-2 w-full max-w-xs overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-accent"
          animate={{ width: `${Math.max(pct, 4)}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
        />
      </div>
      <p className="mt-2 text-xs font-medium tabular-nums text-muted-foreground">
        {pct}%
      </p>
    </div>
  )
}
