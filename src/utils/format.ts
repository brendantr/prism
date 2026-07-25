import type { Unit } from '@/domain/types';
import { kgToDisplay } from '@/domain/calc/loadRecommendation';

/** Display helpers. All weight input is kg; conversion happens only here. */

export function formatWeight(kg: number, unit: Unit, withUnit = true): string {
  const value = kgToDisplay(kg, unit);
  const rounded = Math.abs(value % 1) < 0.049 ? Math.round(value) : Math.round(value * 10) / 10;
  return withUnit ? `${rounded} ${unit}` : String(rounded);
}

/** Large volumes get abbreviated -- 18,420 kg reads worse than 18.4k. */
export function formatVolume(kg: number, unit: Unit): string {
  const value = kgToDisplay(kg, unit);
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (value >= 1000) return Math.round(value).toLocaleString();
  return String(Math.round(value));
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatRpe(rpe: number | null): string {
  return rpe == null ? '—' : String(rpe);
}

/** "+2.5 kg" / "−5 kg" / "same". Used by the load recommendation. */
export function formatDelta(deltaKg: number, unit: Unit): string {
  if (Math.abs(deltaKg) < 0.05) return 'same load';
  const value = kgToDisplay(Math.abs(deltaKg), unit);
  const rounded = Math.abs(value % 1) < 0.049 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${deltaKg > 0 ? '+' : '−'}${rounded} ${unit}`;
}

export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

export function addDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + days);
  return c;
}

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
