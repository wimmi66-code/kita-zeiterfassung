// Monatsnachweis als PDF (A4 quer), Layout wie das Excel-Monatsblatt
import { COLUMNS, rowCells, type MonthSheet } from './monthSheet';

export async function sheetToPdf(s: MonthSheet): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(s.title, 12, 14);
  doc.setFontSize(11);
  doc.text(s.person, 285, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Übertrag Vormonat: ${s.totals.carryIn}`, 12, 21);
  doc.text(`Übertrag: ${s.totals.carryOut}`, 285, 21, { align: 'right' });

  autoTable(doc, {
    startY: 24,
    head: [COLUMNS as unknown as string[]],
    body: s.rows.map(rowCells),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 0.55, lineWidth: 0.1, lineColor: [180, 180, 180], textColor: 20 },
    headStyles: { fillColor: [225, 230, 228], textColor: 20, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 19 }, 1: { cellWidth: 8 }, 2: { cellWidth: 26 },
      3: { cellWidth: 13, halign: 'center' }, 4: { cellWidth: 11, halign: 'center' }, 5: { cellWidth: 13, halign: 'center' },
      6: { cellWidth: 13, halign: 'center' }, 7: { cellWidth: 11, halign: 'center' }, 8: { cellWidth: 13, halign: 'center' },
      9: { cellWidth: 14, halign: 'right' }, 10: { cellWidth: 14, halign: 'right' }, 11: { cellWidth: 16, halign: 'right' },
      12: { cellWidth: 'auto' },
    },
    didParseCell: (d) => {
      if (d.section === 'body' && s.rows[d.row.index]?.off) d.cell.styles.fillColor = [242, 242, 242];
    },
    margin: { left: 12, right: 12 },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = ((doc as any).lastAutoTable?.finalY ?? 180) + 5;
  if (y > 172) { doc.addPage(); y = 15; }
  autoTable(doc, {
    startY: y,
    body: [
      ['Ist-Stunden', s.totals.ist],
      ['Soll-Stunden', s.totals.soll],
      ['Differenz', s.totals.diff],
      ['Übertrag Vormonat', s.totals.carryIn],
      ['Übertrag (neu)', s.totals.carryOut],
    ],
    theme: 'grid',
    tableWidth: 70,
    styles: { fontSize: 8, cellPadding: 0.7 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' } },
    margin: { left: 12 },
  });
  doc.setFontSize(8.5);
  let vy = y + 2;
  for (const line of s.vermerk) {
    const parts = doc.splitTextToSize(line, 180) as string[];
    doc.text(parts, 100, vy + 3);
    vy += parts.length * 4;
  }
  return doc.output('blob');
}
