// Pausen nach § 4 ArbZG
// Mehr als 6 h Arbeit → mindestens 30 min, mehr als 9 h → mindestens 45 min.
// Pausenabschnitte zählen nur ab 15 Minuten.
import { parseTime } from './time';

export const MIN_PAUSE_ABSCHNITT = 15;

/** Mindestpause für eine Netto-Arbeitszeit in Minuten. */
export function requiredBreak(netMinutes: number): number {
  if (netMinutes > 9 * 60) return 45;
  if (netMinutes > 6 * 60) return 30;
  return 0;
}

export interface BlockTimes {
  start1: string | null;
  end1: string | null;
  start2: string | null;
  end2: string | null;
}

export interface BreakResult {
  /** Anwesenheit in den Blöcken (ohne Lücke dazwischen) */
  presence: number;
  /** Lücke zwischen den Blöcken, die als Pause zählt (≥ 15 min) */
  gapCredit: number;
  /** Gesetzlich mindestens abzuziehende Pause innerhalb der Blöcke */
  autoBreak: number;
  /** Tatsächlich abgezogene Pause = max(auto, manuell) */
  deducted: number;
  /** Netto-Arbeitszeit */
  net: number;
}

/**
 * Kleinste Pause d innerhalb der Blöcke, sodass d + Lücke die Mindestpause
 * für die verbleibende Arbeitszeit (Anwesenheit − d) erfüllt.
 * Beispiel: 6:10 h anwesend → 10 min Abzug, Netto 6:00 h (keine weitere Pflicht).
 */
export function autoBreakFor(presence: number, gapCredit: number): number {
  for (let d = 0; d <= 45; d++) {
    if (d + gapCredit >= requiredBreak(presence - d)) return d;
  }
  return 45;
}

export function computeBreak(t: BlockTimes, manualBreak: number | null): BreakResult {
  const s1 = parseTime(t.start1), e1 = parseTime(t.end1);
  const s2 = parseTime(t.start2), e2 = parseTime(t.end2);
  const b1 = s1 !== null && e1 !== null && e1 > s1 ? e1 - s1 : 0;
  const b2 = s2 !== null && e2 !== null && e2 > s2 ? e2 - s2 : 0;
  const presence = b1 + b2;
  const gap = b1 > 0 && b2 > 0 && s2! > e1! ? s2! - e1! : 0;
  const gapCredit = gap >= MIN_PAUSE_ABSCHNITT ? gap : 0;
  const autoBreak = autoBreakFor(presence, gapCredit);
  const deducted = Math.min(presence, Math.max(autoBreak, manualBreak ?? 0));
  return { presence, gapCredit, autoBreak, deducted, net: presence - deducted };
}
