// Uhrzeiten und Dauern in Minuten

/** "07:30" oder "07:30:00" → 450. Leere Werte → null. */
export function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 450 → "07:30" */
export function toTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Dauer als Stunden:Minuten mit Vorzeichen, z. B. −1:15 oder 7:48 */
export function formatDuration(min: number, withPlus = false): string {
  const sign = min < 0 ? '−' : withPlus && min > 0 ? '+' : '';
  const abs = Math.abs(Math.round(min));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

/** "7:48" oder "7,8" → Minuten */
export function parseDuration(s: string): number | null {
  const t = s.trim().replace(',', '.');
  const hm = /^(-?)(\d+):(\d{2})$/.exec(t);
  if (hm) return (hm[1] ? -1 : 1) * (Number(hm[2]) * 60 + Number(hm[3]));
  const dec = Number(t);
  return Number.isFinite(dec) ? Math.round(dec * 60) : null;
}
