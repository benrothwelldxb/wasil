import { useRef, useState } from 'react'
import { Camera, ImagePlus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface CaptureControlsProps {
  /** Called with the selected/captured image file. */
  onSelect: (file: File) => void
  disabled?: boolean
  className?: string
  /** Compact layout for reuse in toolbars (e.g. "Retake"). */
  variant?: 'stacked' | 'inline'
}

/**
 * Reusable image source picker. "Take photo" opens the device camera on
 * mobile (via capture=environment); "Upload" opens the file browser.
 * Purely presentational about *where* the image comes from — what happens
 * next is up to the caller.
 */
export function CaptureControls({
  onSelect,
  disabled,
  className,
  variant = 'stacked',
}: CaptureControlsProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image. Try a photo instead.')
      return
    }
    setError(null)
    onSelect(file)
  }

  const inline = variant === 'inline'

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      <div
        className={cn(
          'flex gap-3',
          inline ? 'flex-row' : 'flex-col sm:flex-row',
        )}
      >
        <Button
          type="button"
          variant="accent"
          size={inline ? 'default' : 'lg'}
          disabled={disabled}
          className="flex-1"
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          size={inline ? 'default' : 'lg'}
          disabled={disabled}
          className="flex-1"
          onClick={() => uploadInputRef.current?.click()}
        >
          <ImagePlus />
          Upload
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
