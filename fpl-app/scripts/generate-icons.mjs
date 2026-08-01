// Generates every app icon (favicon, PWA, Apple touch) from one source of
// truth — the MyFPLScout mark: a navy "squad grid" with the green scouted pick
// and an arrow pointing to it. Run with `npm run generate:icons`.
//
// Why PNGs at all? iOS Safari's "Add to Home Screen" ignores SVG icons, so a
// PNG apple-touch-icon is required for a crisp home-screen tile. We also emit
// PNG PWA icons for the broadest Android/Chrome support.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pub = resolve(root, "public");
const iconsDir = resolve(pub, "icons");

// ── Brand ────────────────────────────────────────────────────────────────
const NAVY = "#14245c";
const NAVY_DEEP = "#0f1c48";
const GREEN = "#2fbf4c";
const DOT = "#8391c9";
const ARROW = "#eef2ff";

/**
 * The inner mark artwork on a 512×512 canvas, kept inside the maskable safe
 * zone (a centred circle of radius ~205). A squad "formation" of dots, the
 * green scouted pick top-right, and an arrow pointing to it.
 */
function artwork() {
  const cols = [168, 256, 344];
  const rows = [164, 240, 316];
  const dots = [];
  for (const y of rows) for (const x of cols) dots.push([x, y]);
  dots.push([256, 392]); // lone forward

  const greenX = 344;
  const greenY = 240;

  const squad = dots
    .filter(([x, y]) => !(x === greenX && y === greenY))
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="20" fill="${DOT}"/>`)
    .join("");

  return `
    <defs>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${GREEN}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${GREEN}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${squad}
    <circle cx="${greenX}" cy="${greenY}" r="52" fill="url(#glow)"/>
    <circle cx="${greenX}" cy="${greenY}" r="23" fill="${GREEN}"/>
    <g stroke="${ARROW}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <line x1="226" y1="350" x2="306" y2="270"/>
      <polyline points="284,270 306,270 306,292"/>
    </g>`;
}

/** Full-bleed square tile — the OS applies its own mask (maskable / Apple). */
function squareSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="${NAVY}"/>
    <rect width="512" height="512" fill="${NAVY_DEEP}" opacity="0"/>
    ${artwork()}
  </svg>`;
}

/** Rounded tile — for contexts that don't mask (Android "any", favicon). */
function roundedSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" rx="112" fill="${NAVY}"/>
    ${artwork()}
  </svg>`;
}

async function png(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log(`[icons] ${outPath.replace(root + "/", "")} (${size}px)`);
}

async function main() {
  await mkdir(iconsDir, { recursive: true });
  const square = squareSvg();
  const rounded = roundedSvg();

  // Source SVGs (SVG-capable browsers use these directly).
  await writeFile(resolve(pub, "favicon.svg"), rounded);
  await writeFile(resolve(pub, "pwa-icon.svg"), rounded);
  await writeFile(resolve(pub, "maskable-icon.svg"), square);

  // Favicons.
  await png(rounded, 32, resolve(pub, "favicon-32.png"));
  await png(rounded, 16, resolve(pub, "favicon-16.png"));

  // Apple touch icon — full-bleed square, iOS rounds it itself.
  await png(square, 180, resolve(pub, "apple-touch-icon.png"));

  // PWA icons.
  await png(rounded, 192, resolve(iconsDir, "pwa-192.png"));
  await png(rounded, 512, resolve(iconsDir, "pwa-512.png"));
  await png(square, 512, resolve(iconsDir, "pwa-maskable-512.png"));

  console.log("[icons] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
