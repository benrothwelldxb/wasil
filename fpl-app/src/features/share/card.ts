/**
 * The data a shareable team card needs. Assembled by the caller (the dashboard)
 * from the prediction/lineup engines, so this feature stays pure presentation.
 */
export interface TeamCardPlayer {
  name: string;
  /** 1 GK · 2 DEF · 3 MID · 4 FWD. */
  positionId: number;
  /** Projected points this gameweek. */
  points: number;
  isCaptain: boolean;
  isVice: boolean;
}

export interface TeamCardData {
  gameweek: number | null;
  projectedPoints: number;
  /** e.g. "3-4-3". */
  formation: string;
  starters: TeamCardPlayer[];
  bench: TeamCardPlayer[];
  captainName: string | null;
  /** £m. */
  squadValue: number;
  /** £m. */
  bank: number;
  source: "yours" | "suggested";
}

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const POSITION_COLOR: Record<number, string> = {
  1: "#f5b301", // GK — amber
  2: "#37b0f4", // DEF — blue
  3: "#2fd07a", // MID — green
  4: "#fb6a82", // FWD — red
};

const FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The brand mark artwork (navy tile + squad grid + green pick + arrow). */
function brandMark(x: number, y: number, size: number): string {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="112" fill="#14245c"/>
    <g fill="#8391c9">
      <circle cx="168" cy="164" r="20"/><circle cx="256" cy="164" r="20"/><circle cx="344" cy="164" r="20"/>
      <circle cx="168" cy="240" r="20"/><circle cx="256" cy="240" r="20"/>
      <circle cx="168" cy="316" r="20"/><circle cx="256" cy="316" r="20"/><circle cx="344" cy="316" r="20"/>
      <circle cx="256" cy="392" r="20"/>
    </g>
    <circle cx="344" cy="240" r="23" fill="#2fbf4c"/>
    <g stroke="#eef2ff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <line x1="226" y1="350" x2="306" y2="270"/>
      <polyline points="284,270 306,270 306,292"/>
    </g>
  </svg>`;
}

/** A single player token: shirt disc, captain badge, name plate, and points. */
function playerChip(
  cx: number,
  cy: number,
  p: TeamCardPlayer,
  scale: number,
  withPoints: boolean,
): string {
  const r = 34 * scale;
  const color = POSITION_COLOR[p.positionId] ?? "#94a3b8";
  const nameSize = 26 * scale;
  // Truncate long names (measure the RAW name, then escape) and cap the plate
  // to the row slot so neighbours never overlap — e.g. a 5-man defence.
  const maxChars = Math.round(12 * scale);
  const displayName =
    p.name.length > maxChars ? `${p.name.slice(0, maxChars - 1)}…` : p.name;
  const name = escapeXml(displayName);
  const plateW = Math.min(
    150 * scale,
    Math.max(64 * scale, displayName.length * nameSize * 0.6 + 20),
  );
  const plateY = cy + r + 8 * scale;
  const nameY = plateY + 25 * scale;

  const captain = p.isCaptain
    ? `<g>
         <circle cx="${cx + r * 0.85}" cy="${cy - r * 0.85}" r="${15 * scale}" fill="#22c55e" stroke="#0c1730" stroke-width="${3 * scale}"/>
         <text x="${cx + r * 0.85}" y="${cy - r * 0.85 + 6 * scale}" text-anchor="middle" font-family="${FONT}" font-size="${18 * scale}" font-weight="700" fill="#0c1730">C</text>
       </g>`
    : p.isVice
      ? `<g>
         <circle cx="${cx + r * 0.85}" cy="${cy - r * 0.85}" r="${15 * scale}" fill="#e2e8f0" stroke="#0c1730" stroke-width="${3 * scale}"/>
         <text x="${cx + r * 0.85}" y="${cy - r * 0.85 + 6 * scale}" text-anchor="middle" font-family="${FONT}" font-size="${16 * scale}" font-weight="700" fill="#0c1730">V</text>
       </g>`
      : "";

  const points = withPoints
    ? `<text x="${cx}" y="${nameY + 30 * scale}" text-anchor="middle" font-family="${FONT}" font-size="${22 * scale}" font-weight="700" fill="#bbf7d0">${p.points.toFixed(1)}</text>`
    : "";

  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#ffffff" stroke-width="${3 * scale}" stroke-opacity="0.85"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.5}" fill="#ffffff" fill-opacity="0.18"/>
    ${captain}
    <rect x="${cx - plateW / 2}" y="${plateY}" width="${plateW}" height="${32 * scale}" rx="${10 * scale}" fill="#0b1530" fill-opacity="0.62"/>
    <text x="${cx}" y="${nameY}" text-anchor="middle" font-family="${FONT}" font-size="${nameSize}" font-weight="700" fill="#ffffff">${name}</text>
    ${points}
  </g>`;
}

/** Evenly space `n` chip centres across the pitch's inner width. */
function rowXs(n: number, left: number, right: number): number[] {
  const width = right - left;
  return Array.from({ length: n }, (_, i) => left + ((i + 0.5) * width) / n);
}

/**
 * Render a beautiful, self-contained team card as an SVG string. No external
 * images (players are drawn as position-coloured tokens), so it rasterises to
 * PNG on any device without CORS taint.
 */
export function buildTeamCardSvg(data: TeamCardData): string {
  const gwLabel = data.gameweek !== null ? `GW ${data.gameweek}` : "This week";

  // Group starters into rows by position.
  const byPos = (pid: number) =>
    data.starters.filter((p) => p.positionId === pid);
  const rows: { players: TeamCardPlayer[]; y: number }[] = [
    { players: byPos(1), y: 445 }, // GK
    { players: byPos(2), y: 625 }, // DEF
    { players: byPos(3), y: 835 }, // MID
    { players: byPos(4), y: 1025 }, // FWD
  ];

  const pitchLeft = 95;
  const pitchRight = 985;

  const starterChips = rows
    .flatMap((row) => {
      const xs = rowXs(row.players.length, pitchLeft, pitchRight);
      return row.players.map((p, i) => playerChip(xs[i]!, row.y, p, 1, true));
    })
    .join("");

  const benchXs = rowXs(data.bench.length, 180, 900);
  const benchChips = data.bench
    .map((p, i) => playerChip(benchXs[i]!, 1210, p, 0.72, false))
    .join("");

  const sourceTag =
    data.source === "suggested"
      ? `<text x="540" y="278" text-anchor="middle" font-family="${FONT}" font-size="24" fill="#93a4cf">Suggested team</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#17294f"/>
      <stop offset="100%" stop-color="#0b1630"/>
    </linearGradient>
    <linearGradient id="pitch" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#12924a"/>
      <stop offset="100%" stop-color="#0a6531"/>
    </linearGradient>
  </defs>

  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#bg)"/>

  <!-- Header -->
  ${brandMark(60, 52, 84)}
  <text x="160" y="108" font-family="${FONT}" font-size="46" font-weight="800" letter-spacing="-1">
    <tspan fill="#eef2ff">MyFPL</tspan><tspan fill="#39d15a">Scout</tspan>
  </text>
  <rect x="880" y="58" width="140" height="56" rx="28" fill="#ffffff" fill-opacity="0.12"/>
  <text x="950" y="95" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="700" fill="#eef2ff">${gwLabel}</text>

  <!-- Projected points hero -->
  <text x="62" y="205" font-family="${FONT}" font-size="24" font-weight="700" letter-spacing="3" fill="#93a4cf">PROJECTED POINTS</text>
  <text x="60" y="292" font-family="${FONT}" font-size="96" font-weight="800" fill="#ffffff">${data.projectedPoints.toFixed(1)}<tspan font-size="40" font-weight="700" fill="#93a4cf"> pts</tspan></text>
  <rect x="838" y="212" width="182" height="64" rx="16" fill="#2fbf4c" fill-opacity="0.16"/>
  <text x="929" y="255" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="800" fill="#39d15a">${escapeXml(data.formation)}</text>
  ${sourceTag}

  <!-- Pitch -->
  <rect x="40" y="320" width="1000" height="800" rx="34" fill="url(#pitch)"/>
  <g stroke="#ffffff" stroke-opacity="0.22" stroke-width="3" fill="none">
    <rect x="70" y="350" width="940" height="740" rx="14"/>
    <line x1="70" y1="720" x2="1010" y2="720"/>
    <circle cx="540" cy="720" r="70"/>
    <rect x="360" y="350" width="360" height="150" rx="4"/>
    <rect x="360" y="940" width="360" height="150" rx="4"/>
  </g>
  ${starterChips}

  <!-- Bench -->
  <text x="60" y="1180" font-family="${FONT}" font-size="24" font-weight="800" letter-spacing="2" fill="#93a4cf">BENCH</text>
  ${benchChips}

  <!-- Footer -->
  <text x="540" y="1285" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="600" fill="#cbd5e1">${
    data.captainName ? `Captain ${escapeXml(data.captainName)}  ·  ` : ""
  }£${data.squadValue.toFixed(1)}m squad  ·  £${data.bank.toFixed(1)}m in the bank</text>
  <text x="60" y="1330" font-family="${FONT}" font-size="26" font-weight="800" fill="#39d15a">myfplscout.app</text>
  <text x="1020" y="1330" text-anchor="end" font-family="${FONT}" font-size="19" fill="#6c7cae">Independent · not affiliated with the Premier League</text>
</svg>`;
}
