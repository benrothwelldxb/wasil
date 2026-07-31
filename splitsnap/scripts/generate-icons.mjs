// Generates SplitSnap PWA icons as PNGs with no external dependencies.
// Draws the emerald brand tile with a white receipt glyph, matching favicon.svg.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

const EMERALD = [16, 185, 129, 255]
const WHITE = [255, 255, 255, 255]
const CLEAR = [0, 0, 0, 0]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  // rest zero (compression, filter, interlace)
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const p = pixels[y * size + x]
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = p[0]
      raw[o + 1] = p[1]
      raw[o + 2] = p[2]
      raw[o + 3] = p[3]
    }
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// Signed distance to a rounded rectangle centred in the box.
function inRoundedRect(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - (halfW - r)
  const dy = Math.abs(y - cy) - (halfH - r)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  const outside = Math.hypot(ax, ay) - r
  const inside = Math.min(Math.max(dx, dy), 0)
  return outside + inside <= 0
}

function draw(size, { maskable }) {
  const px = new Array(size * size)
  const s = size / 32 // scale from the 32px SVG coordinate space
  const bgRadius = maskable ? 0 : 8 * s
  const cx = size / 2
  const cy = size / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = CLEAR
      // Brand tile. Maskable fills fully; regular is a rounded square.
      const tileHalf = maskable ? size / 2 : size / 2
      if (
        maskable ||
        inRoundedRect(x + 0.5, y + 0.5, cx, cy, tileHalf, tileHalf, bgRadius)
      ) {
        color = EMERALD
      }
      px[y * size + x] = color
    }
  }

  // Receipt glyph geometry (in 32px space, scaled). A rounded white body with
  // a torn bottom edge and two horizontal lines.
  const bodyHalfW = 7 * s
  const bodyTop = 6.5 * s
  const bodyBottom = 24 * s
  const left = cx - bodyHalfW
  const right = cx + bodyHalfW
  const stroke = 1.9 * s

  const onLine = (x, y, y0, x0, x1) =>
    y >= y0 - stroke / 2 &&
    y <= y0 + stroke / 2 &&
    x >= x0 - stroke / 2 &&
    x <= x1 + stroke / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const inBody =
        x >= left &&
        x <= right &&
        y >= bodyTop &&
        y <= bodyBottom
      if (!inBody) continue

      // Torn zig-zag bottom edge.
      if (y > bodyBottom - 2 * s) {
        const zig = Math.abs(((x - left) % (3.5 * s)) - 1.75 * s)
        if (y > bodyBottom - zig) continue
      }

      // Outline vs fill: draw a solid white receipt.
      px[i] = WHITE
    }
  }

  // Punch emerald text lines through the white body.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (
        onLine(x, y, 12 * s, left + 1.5 * s, right - 1.5 * s) ||
        onLine(x, y, 16 * s, left + 1.5 * s, right - 1.5 * s)
      ) {
        // Only carve where the receipt body is.
        if (px[i] === WHITE) px[i] = EMERALD
      }
    }
  }

  return encodePng(size, px)
}

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
]

for (const t of targets) {
  const png = draw(t.size, { maskable: t.maskable })
  writeFileSync(join(outDir, t.name), png)
  console.log('wrote', t.name, png.length, 'bytes')
}
