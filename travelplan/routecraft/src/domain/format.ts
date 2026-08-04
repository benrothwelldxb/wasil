/** Pure display formatters — money, duration, dates. */
import type { Money } from './types';

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const USD_PRECISE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

export function formatMoney(money: Money, precise = false): string {
  return (precise ? USD_PRECISE : USD).format(money.amount);
}

/** 615 → "10h 15m", 45 → "45m". */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Door-to-door span including overnight stopovers, e.g. "1d 8h". */
export function formatSpan(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / (60 * 24));
  const hours = Math.floor((total % (60 * 24)) / 60);
  if (days === 0) return formatDuration(total);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
