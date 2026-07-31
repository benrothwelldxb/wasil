import type { ReceiptImage } from '@/types'

/** A rectangle in natural (source) pixel coordinates. */
export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** A rectangle expressed as fractions (0–1) of the image's dimensions. */
export interface NormalizedRect {
  x: number
  y: number
  width: number
  height: number
}

const MAX_DIMENSION = 2400

/** Decode a file/blob to an ImageBitmap, honouring EXIF orientation. */
async function decode(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source, { imageOrientation: 'from-image' })
}

/**
 * Draw a bitmap to a canvas and export a JPEG blob. Downscales very large
 * captures so we don't hold enormous images in memory.
 */
async function renderToBlob(
  targetWidth: number,
  targetHeight: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<{ blob: Blob; width: number; height: number }> {
  let width = targetWidth
  let height = targetHeight
  const longest = Math.max(width, height)
  if (longest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longest
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.imageSmoothingQuality = 'high'
  draw(ctx)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('Failed to encode image')
  return { blob, width, height }
}

/** Turn a picked/captured file into a ReceiptImage held in app state. */
export async function fileToReceiptImage(file: Blob): Promise<ReceiptImage> {
  const bitmap = await decode(file)
  // Re-encode through a canvas so orientation is baked in and size is bounded.
  const { blob, width, height } = await renderToBlob(
    bitmap.width,
    bitmap.height,
    (ctx) => ctx.drawImage(bitmap, 0, 0, ctx.canvas.width, ctx.canvas.height),
  )
  bitmap.close()

  return {
    id: crypto.randomUUID(),
    blob,
    url: URL.createObjectURL(blob),
    width,
    height,
    createdAt: Date.now(),
  }
}

/** Rotate an image by a quarter-turn multiple, returning a fresh blob. */
export async function rotateImage(
  image: ReceiptImage,
  degrees: 90 | 180 | 270,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await decode(image.blob)
  const swap = degrees === 90 || degrees === 270
  const outW = swap ? bitmap.height : bitmap.width
  const outH = swap ? bitmap.width : bitmap.height

  const result = await renderToBlob(outW, outH, (ctx) => {
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2)
    ctx.rotate((degrees * Math.PI) / 180)
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
  })
  bitmap.close()
  return result
}

/** Crop an image to a normalized rectangle, returning a fresh blob. */
export async function cropImage(
  image: ReceiptImage,
  rect: NormalizedRect,
): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await decode(image.blob)
  const sx = Math.round(rect.x * bitmap.width)
  const sy = Math.round(rect.y * bitmap.height)
  const sw = Math.max(1, Math.round(rect.width * bitmap.width))
  const sh = Math.max(1, Math.round(rect.height * bitmap.height))

  const result = await renderToBlob(sw, sh, (ctx) =>
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh),
  )
  bitmap.close()
  return result
}
