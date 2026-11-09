// Monatsnachweis als Excel-Datei, Layout wie das bisherige Monatsblatt
import { COLUMNS, rowCells, type MonthSheet } from './monthSheet';

export async function sheetToXlsx(s: MonthSheet): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kita-Zeiterfassung';
  const ws = wb.addWorksheet(s.title.replace('Arbeitszeitnachweis ', '').slice(0, 31), {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  });
  ws.columns = [19, 6, 24, 9, 8, 9, 9, 8, 9, 10, 10, 11, 40].map((w) => ({ width: w }));

  ws.getCell('A1').value = s.title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('M1').value = s.person;
  ws.getCell('M1').font = { bold: true };
  ws.getCell('A3').value = 'Übertrag Vormonat';
  ws.getCell('C3').value = s.totals.carryIn;
  ws.getCell('J3').value = 'Übertrag';
  ws.getCell('K3').value = s.totals.carryOut;

  const head = ws.getRow(5);
  head.values = COLUMNS as unknown as string[];
  head.font = { bold: true };
  head.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1E6E4' } };
    c.border = { bottom: { style: 'thin' } };
    c.alignment = { wrapText: true, vertical: 'middle' };
  });

  s.rows.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    row.values = rowCells(r);
    if (r.off) row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col <= 13) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });
    [10, 11, 12].forEach((col) => { row.getCell(col).alignment = { horizontal: 'right' }; });
  });

  let y = 6 + s.rows.length + 1;
  const sums: [string, string][] = [
    ['Summe / Monat', ''], ['Ist-Stunden', s.totals.ist], ['Soll-Stunden', s.totals.soll], ['Differenz', s.totals.diff],
  ];
  for (const [k, v] of sums) {
    ws.getCell(`A${y}`).value = k;
    ws.getCell(`A${y}`).font = { bold: true };
    ws.getCell(`C${y}`).value = v;
    y += 1;
  }
  y += 1;
  for (const line of s.vermerk) {
    ws.getCell(`A${y}`).value = line;
    y += 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
