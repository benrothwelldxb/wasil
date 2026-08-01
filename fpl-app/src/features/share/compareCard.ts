/** A team's headline numbers for the head-to-head compare card. */
export interface CompareSummary {
  managerName: string;
  teamName: string;
  projectedPoints: number;
  captainName: string | null;
  formation: string;
  squadValue: number;
}

export const COMPARE_SIZE = 1080;

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

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function mark(x: number, y: number, size: number): string {
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

function panel(
  x: number,
  team: CompareSummary,
  isWinner: boolean,
): string {
  const w = 460;
  const cx = x + w / 2;
  const border = isWinner ? "#39d15a" : "#2c3d6b";
  const row = (y: number, label: string, value: string) =>
    `<text x="${x + 30}" y="${y}" font-family="${FONT}" font-size="24" fill="#9fb0dd">${label}</text>
     <text x="${x + w - 30}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="24" font-weight="700" fill="#eef2ff">${value}</text>`;

  return `
    <rect x="${x}" y="210" width="${w}" height="620" rx="24" fill="#ffffff" fill-opacity="0.05" stroke="${border}" stroke-width="${isWinner ? 4 : 2}"/>
    <text x="${cx}" y="280" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="800" fill="#ffffff">${escapeXml(clip(team.teamName, 18))}</text>
    <text x="${cx}" y="316" text-anchor="middle" font-family="${FONT}" font-size="22" fill="#9fb0dd">${escapeXml(clip(team.managerName, 22))}</text>

    <text x="${cx}" y="470" text-anchor="middle" font-family="${FONT}" font-size="128" font-weight="800" fill="${isWinner ? "#39d15a" : "#eef2ff"}">${team.projectedPoints.toFixed(1)}</text>
    <text x="${cx}" y="510" text-anchor="middle" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="2" fill="#9fb0dd">PROJECTED PTS</text>

    <line x1="${x + 30}" y1="560" x2="${x + w - 30}" y2="560" stroke="#2c3d6b" stroke-width="2"/>
    ${row(628, "Captain", escapeXml(clip(team.captainName ?? "—", 12)))}
    ${row(692, "Formation", escapeXml(team.formation))}
    ${row(756, "Squad value", `£${team.squadValue.toFixed(1)}m`)}`;
}

/**
 * Render a head-to-head "my team vs a rival" scorecard as an SVG string. Pure,
 * self-contained (no external images), so it rasterises to PNG on any device.
 */
export function buildCompareCardSvg(
  mine: CompareSummary,
  theirs: CompareSummary,
  gameweek: number | null,
): string {
  const diff = mine.projectedPoints - theirs.projectedPoints;
  const iLead = diff > 0.05;
  const level = Math.abs(diff) <= 0.05;
  const gwLabel = gameweek !== null ? `GW ${gameweek}` : "This week";

  const banner = level
    ? { text: "Neck and neck — it's level.", color: "#9fb0dd" }
    : iLead
      ? { text: `You lead by +${diff.toFixed(1)} pts`, color: "#39d15a" }
      : {
          text: `Behind by ${Math.abs(diff).toFixed(1)} pts`,
          color: "#f5b301",
        };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COMPARE_SIZE}" height="${COMPARE_SIZE}" viewBox="0 0 ${COMPARE_SIZE} ${COMPARE_SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#17294f"/>
      <stop offset="100%" stop-color="#0b1630"/>
    </linearGradient>
  </defs>
  <rect width="${COMPARE_SIZE}" height="${COMPARE_SIZE}" fill="url(#bg)"/>

  ${mark(60, 48, 80)}
  <text x="156" y="102" font-family="${FONT}" font-size="42" font-weight="800" letter-spacing="-1">
    <tspan fill="#eef2ff">MyFPL</tspan><tspan fill="#39d15a">Scout</tspan>
  </text>
  <text x="1020" y="80" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="800" letter-spacing="2" fill="#9fb0dd">HEAD TO HEAD</text>
  <text x="1020" y="112" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="700" fill="#eef2ff">${gwLabel}</text>

  ${panel(60, mine, iLead || level)}
  ${panel(560, theirs, !iLead && !level)}

  <circle cx="540" cy="470" r="46" fill="#0b1630" stroke="#2c3d6b" stroke-width="3"/>
  <text x="540" y="484" text-anchor="middle" font-family="${FONT}" font-size="30" font-weight="800" fill="#eef2ff">VS</text>

  <rect x="60" y="872" width="960" height="88" rx="18" fill="${banner.color}" fill-opacity="0.14"/>
  <text x="540" y="928" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="800" fill="${banner.color}">${banner.text}</text>

  <text x="60" y="1030" font-family="${FONT}" font-size="26" font-weight="800" fill="#39d15a">myfplscout.app</text>
  <text x="1020" y="1030" text-anchor="end" font-family="${FONT}" font-size="19" fill="#6c7cae">Independent · not affiliated with the Premier League</text>
</svg>`;
}
