import { useCallback, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ReceiptImage } from '@/types'
import type { NormalizedRect } from '@/features/receipt/image-utils'

type Handle = 'nw' | 'ne' | 'sw' | 'se'
type DragMode = 'move' | Handle

const MIN_SIZE = 0.12 // minimum crop size as a fraction of the image
const INITIAL_INSET = 0.06

interface Edges {
  left: number
  top: number
  right: number
  bottom: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

function rectToEdges(r: NormalizedRect): Edges {
  return { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
}

function edgesToRect(e: Edges): NormalizedRect {
  return {
    x: e.left,
    y: e.top,
    width: e.right - e.left,
    height: e.bottom - e.top,
  }
}

interface ImageCropperProps {
  image: ReceiptImage
  onApply: (rect: NormalizedRect) => void
  onCancel: () => void
  busy?: boolean
}

/**
 * Touch- and mouse-friendly crop tool. The crop rectangle is tracked in
 * normalized (0–1) coordinates so it's independent of the rendered size and
 * maps cleanly onto the source image for the actual pixel crop.
 */
export function ImageCropper({
  image,
  onApply,
  onCancel,
  busy,
}: ImageCropperProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<NormalizedRect>({
    x: INITIAL_INSET,
    y: INITIAL_INSET,
    width: 1 - INITIAL_INSET * 2,
    height: 1 - INITIAL_INSET * 2,
  })

  const drag = useRef<{
    mode: DragMode
    startX: number
    startY: number
    startEdges: Edges
  } | null>(null)

  const pointFromEvent = useCallback((e: React.PointerEvent) => {
    const frame = frameRef.current
    if (!frame) return { x: 0, y: 0 }
    const bounds = frame.getBoundingClientRect()
    return {
      x: clamp01((e.clientX - bounds.left) / bounds.width),
      y: clamp01((e.clientY - bounds.top) / bounds.height),
    }
  }, [])

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = pointFromEvent(e)
    drag.current = {
      mode,
      startX: p.x,
      startY: p.y,
      startEdges: rectToEdges(rect),
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const { mode, startX, startY, startEdges } = drag.current
    const p = pointFromEvent(e)
    const dx = p.x - startX
    const dy = p.y - startY
    let next: Edges = { ...startEdges }

    if (mode === 'move') {
      const w = startEdges.right - startEdges.left
      const h = startEdges.bottom - startEdges.top
      let left = clamp01(startEdges.left + dx)
      let top = clamp01(startEdges.top + dy)
      left = Math.min(left, 1 - w)
      top = Math.min(top, 1 - h)
      next = { left, top, right: left + w, bottom: top + h }
    } else {
      if (mode === 'nw' || mode === 'sw') {
        next.left = Math.min(clamp01(startEdges.left + dx), next.right - MIN_SIZE)
      }
      if (mode === 'ne' || mode === 'se') {
        next.right = Math.max(clamp01(startEdges.right + dx), next.left + MIN_SIZE)
      }
      if (mode === 'nw' || mode === 'ne') {
        next.top = Math.min(clamp01(startEdges.top + dy), next.bottom - MIN_SIZE)
      }
      if (mode === 'sw' || mode === 'se') {
        next.bottom = Math.max(clamp01(startEdges.bottom + dy), next.top + MIN_SIZE)
      }
    }

    setRect(edgesToRect(next))
  }

  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) {
      try {
        ;(e.target as Element).releasePointerCapture(e.pointerId)
      } catch {
        // pointer may already be released
      }
      drag.current = null
    }
  }

  const pct = (v: number) => `${v * 100}%`
  const handleClass =
    'absolute h-7 w-7 rounded-full border-2 border-white bg-accent shadow-float touch-none'

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-black/90">
        <div
          ref={frameRef}
          className="relative mx-auto max-h-[60vh] w-full touch-none select-none"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <img
            src={image.url}
            alt="Receipt being cropped"
            className="pointer-events-none h-full w-full object-contain"
            draggable={false}
          />

          {/* Dim everything outside the crop window. */}
          <div
            className="absolute rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white/90"
            style={{
              left: pct(rect.x),
              top: pct(rect.y),
              width: pct(rect.width),
              height: pct(rect.height),
            }}
          >
            {/* Rule-of-thirds guides. */}
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-white/30" />
              ))}
            </div>

            {/* Drag body. */}
            <div
              className="absolute inset-0 cursor-move touch-none"
              onPointerDown={onPointerDown('move')}
            />

            {/* Corner handles. */}
            <span
              className={cn(handleClass, '-left-3.5 -top-3.5 cursor-nwse-resize')}
              onPointerDown={onPointerDown('nw')}
            />
            <span
              className={cn(handleClass, '-right-3.5 -top-3.5 cursor-nesw-resize')}
              onPointerDown={onPointerDown('ne')}
            />
            <span
              className={cn(handleClass, '-bottom-3.5 -left-3.5 cursor-nesw-resize')}
              onPointerDown={onPointerDown('sw')}
            />
            <span
              className={cn(handleClass, '-bottom-3.5 -right-3.5 cursor-nwse-resize')}
              onPointerDown={onPointerDown('se')}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          <X />
          Cancel
        </Button>
        <Button
          variant="accent"
          size="lg"
          className="flex-1"
          onClick={() => onApply(rect)}
          disabled={busy}
        >
          <Check />
          Apply crop
        </Button>
      </div>
    </div>
  )
}
