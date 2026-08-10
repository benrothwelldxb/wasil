import { useEffect, useState } from 'react'
import QR from 'qrcode'
import { cn } from '@/lib/cn'

interface QRCodeProps {
  value: string
  size?: number
  className?: string
}

/** Renders a QR code as an <img>. Uses the brand ink colour on cream. */
export function QRCode({ value, size = 220, className }: QRCodeProps) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    QR.toDataURL(value, {
      margin: 1,
      width: size * 2,
      color: { dark: '#1B1915', light: '#FCFAF4' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [value, size])

  if (error) {
    return <p className="text-sm text-coral-deep">Could not render the QR code.</p>
  }

  return (
    <img
      src={src ?? undefined}
      width={size}
      height={size}
      alt="QR code to join the group"
      className={cn('rounded-2xl bg-cream-50', className)}
      style={{ width: size, height: size }}
    />
  )
}
