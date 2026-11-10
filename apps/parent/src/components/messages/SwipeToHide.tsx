import { useRef, useState, type ReactNode, type PointerEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeOff } from 'lucide-react'

/** How far, as a share of the card's width, a swipe must travel to hide it.
 *  Far enough that a sideways wobble while scrolling never hides a post. */
const HIDE_AT = 0.35
/** Movement before we decide whether this is a swipe or a scroll. */
const DECIDE_AT = 10
const LEAVE_MS = 180

/** Things a finger inside a card means to use, not to swipe: the form fields,
 *  and the signature pad above all — a signature is drawn sideways. */
const NOT_A_SWIPE = 'input, textarea, select, canvas, [contenteditable="true"], [data-no-swipe]'

interface SwipeToHideProps {
  /** Off for a post that still asks something of the parent: it does not move. */
  enabled: boolean
  onHide: () => void
  children: ReactNode
}

/**
 * Swipe a post sideways, either way, to hide it from this parent's feed.
 *
 * Touch only: a mouse drag over text is someone selecting it. The card's own
 * hide button is the way on a desktop, and for anyone who never finds the
 * swipe. Vertical movement is left to the browser (`touch-action: pan-y`), so
 * scrolling the feed is never caught by a card — the direction is decided on
 * the first few pixels and kept for the rest of the gesture.
 */
export function SwipeToHide({ enabled, onHide, children }: SwipeToHideProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const axis = useRef<'x' | 'y' | null>(null)
  // A swipe ends with the finger lifting over the card, which the browser
  // reports as a click on whatever was under it. That click is not meant.
  const swallowClick = useRef(false)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)

  const reset = () => {
    start.current = null
    axis.current = null
    setDragging(false)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Disabled by ignoring the gesture, not by unwrapping the card: changing
    // the tree would remount the card and lose a half-filled form.
    if (!enabled || e.pointerType === 'mouse') return
    if ((e.target as Element).closest(NOT_A_SWIPE)) return
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    axis.current = null
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s || s.id !== e.pointerId) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (axis.current === null) {
      if (Math.abs(mx) > DECIDE_AT && Math.abs(mx) > Math.abs(my) * 1.5) {
        axis.current = 'x'
        setDragging(true)
        ref.current?.setPointerCapture(e.pointerId)
      } else if (Math.abs(my) > DECIDE_AT) {
        axis.current = 'y'
      }
    }
    if (axis.current === 'x') setDx(mx)
  }

  const onPointerUp = () => {
    if (axis.current === 'x') {
      swallowClick.current = true
      const width = ref.current?.offsetWidth ?? 1
      if (Math.abs(dx) > width * HIDE_AT) {
        setDx(Math.sign(dx) * width * 1.1)
        window.setTimeout(onHide, LEAVE_MS)
      } else {
        setDx(0)
      }
    }
    reset()
  }

  const onPointerCancel = () => {
    setDx(0)
    reset()
  }

  const onClickCapture = (e: MouseEvent) => {
    if (swallowClick.current) {
      swallowClick.current = false
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const width = ref.current?.offsetWidth ?? 1
  const progress = Math.min(Math.abs(dx) / (width * HIDE_AT), 1)

  return (
    <div className="relative" style={{ borderRadius: '22px' }}>
      {/* What the swipe will do, revealed underneath as the card moves. */}
      {dx !== 0 && (
        <div
          aria-hidden
          className="absolute inset-0 flex items-center px-6 text-[13px] font-bold"
          style={{
            borderRadius: '22px',
            backgroundColor: '#F7F0F1',
            color: '#7A6469',
            justifyContent: dx > 0 ? 'flex-start' : 'flex-end',
            opacity: 0.4 + progress * 0.6,
          }}
        >
          <span className="flex items-center gap-2">
            <EyeOff className="h-4 w-4" />
            {t('messages.hide', 'Hide')}
          </span>
        </div>
      )}
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dragging ? 'none' : `transform ${LEAVE_MS}ms ease-out, opacity ${LEAVE_MS}ms ease-out`,
          opacity: 1 - progress * 0.3,
          touchAction: enabled ? 'pan-y' : undefined,
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>
  )
}
