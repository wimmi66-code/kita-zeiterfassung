import { useState } from 'react';
import type { YearData } from '../../lib/api';
import { computeYear } from '../../lib/calc';
import { errorText } from '../../lib/errors';
import { downloadBlob } from '../../lib/export/download';
import { buildMonthSheet, type MonthSheet } from '../../lib/export/monthSheet';
import type { IsoDate } from '../../lib/dates';

/** Monatsnachweis aus den Jahresdaten einer Person (Leitung, Admin, Mitarbeitende). */
export function sheetFromYearData(
  d: YearData, pseudonym: string, name: string | null, year: number, month: number, today: IsoDate,
): MonthSheet {
  const m = computeYear(year, d.schedule, d.entries, d.balance, '9999-12-31')[month - 1];
  void today;
  return buildMonthSheet({
    pseudonym, name, year, month, days: m.days, carryIn: m.carryIn,
    closing: d.closings.find((c) => c.month === month),
  });
}

export default function ExportButtons({ make }: { make: () => MonthSheet }) {
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(kind: 'pdf' | 'xlsx') {
    setBusy(kind);
    setMsg(null);
    try {
      const s = make();
      if (kind === 'pdf') {
        const { sheetToPdf } = await import('../../lib/export/pdf');
        downloadBlob(await sheetToPdf(s), `${s.fileBase}.pdf`);
      } else {
        const { sheetToXlsx } = await import('../../lib/export/xlsx');
        downloadBlob(await sheetToXlsx(s), `${s.fileBase}.xlsx`);
      }
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <span className="hint">Monatsnachweis:</span>
        <button disabled={busy !== null} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Erstelle …' : 'PDF'}</button>
        <button disabled={busy !== null} onClick={() => run('xlsx')}>{busy === 'xlsx' ? 'Erstelle …' : 'Excel'}</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </div>
  );
}
