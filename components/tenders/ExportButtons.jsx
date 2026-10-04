'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import Button from '@/components/ui/Button';

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Spreadsheet apps run cells starting with these characters as formulas.
function safeText(value) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function excelCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  return safeText(String(value));
}

function pdfCell(value, column) {
  if (value == null || value === '') return '-';
  if (column.amount && typeof value === 'number') return value.toLocaleString('en-IN');
  return String(value);
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function amountCell(value) {
  if (value == null || value === '') return '';
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : String(value);
}

export default function ExportButtons({ filename, title, columns, rows, disabled = false }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const empty = disabled || rows.length === 0;
  const values = () => rows.map((row) => columns.map((column) => column.value(row)));

  const exportExcel = async () => {
    setError('');
    setBusy('excel');
    try {
      const XLSX = await import('xlsx');
      const data = [columns.map((column) => column.label), ...values().map((line) => line.map(excelCell))];
      const sheet = XLSX.utils.aoa_to_sheet(data);
      sheet['!cols'] = columns.map((column, index) => ({
        wch: Math.min(60, Math.max(10, ...data.map((line) => String(line[index] ?? '').length + 2))),
      }));
      columns.forEach((column, index) => {
        if (!column.amount) return;
        for (let row = 1; row < data.length; row += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: index })];
          if (cell?.t === 'n') cell.z = '#,##0';
        }
      });
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
      const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
      download(
        new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${filename}-${stamp()}.xlsx`
      );
    } catch {
      setError('Could not create the Excel file.');
    } finally {
      setBusy('');
    }
  };

  const exportPdf = async () => {
    setError('');
    setBusy('pdf');
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      const generated = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      doc.setFontSize(14);
      doc.text(title, 32, 36);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(`${rows.length} tender${rows.length === 1 ? '' : 's'} · Generated ${generated}`, 32, 52);
      autoTable(doc, {
        startY: 64,
        margin: { left: 32, right: 32, bottom: 32 },
        head: [columns.map((column) => column.label)],
        body: values().map((line) => line.map((value, index) => pdfCell(value, columns[index]))),
        styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [57, 73, 171], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 246, 250] },
        columnStyles: Object.fromEntries(
          columns.map((column, index) => [index, column.amount ? { halign: 'right' } : column.wide ? { cellWidth: 140 } : {}])
        ),
        didDrawPage: () => {
          const page = doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(140);
          doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 32, doc.internal.pageSize.getHeight() - 14, { align: 'right' });
        },
      });
      doc.save(`${filename}-${stamp()}.pdf`);
    } catch {
      setError('Could not create the PDF file.');
    } finally {
      setBusy('');
    }
  };

  const hint = (format) => (empty ? 'No rows to export' : `Export ${rows.length} rows as ${format}`);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={exportExcel} disabled={empty || Boolean(busy)} isLoading={busy === 'excel'} title={hint('Excel')}>
          {busy === 'excel' ? null : <FileSpreadsheet className="h-4 w-4" />}
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={empty || Boolean(busy)} isLoading={busy === 'pdf'} title={hint('PDF')}>
          {busy === 'pdf' ? null : <FileText className="h-4 w-4" />}
          PDF
        </Button>
      </div>
      {error ? <p className="text-xs" style={{ color: '#ef5350' }}>{error}</p> : null}
    </div>
  );
}
