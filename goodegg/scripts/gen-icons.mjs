// Rasterise the app-icon SVG into the PWA icon set.
// Run: node scripts/gen-icons.mjs
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(root, 'public/favicon.svg'))
const outDir = resolve(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-192-maskable.png', size: 192 },
  { name: 'icon-512-maskable.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const { name, size } of targets) {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: '#F7C948' })
    .png()
    .toFile(resolve(outDir, name))
  console.log('wrote', name)
}
