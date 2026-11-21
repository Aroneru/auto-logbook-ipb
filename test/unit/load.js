// Load the extension's pure modules into globalThis.ALB for Node tests.
import '../../extension/src/ns.js';
import '../../extension/src/dates.js';
import '../../extension/src/mapping.js';
import '../../extension/src/tabular.js';

export const ALB = globalThis.ALB;

/** Encode rows the way Google Sheets puts them on the clipboard (TSV, quoted when needed). */
export function sheetsClipboard(rows) {
  const cell = (v) => (/[\t\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(cell).join('\t')).join('\n');
}

// A fictional internship logbook with the quirks of a real Google Sheets one
// (en_US locale): a header with a leading space, month-first dates, 12-hour
// times, multi-line notes, a location that doubles as on-site/WFA, and
// trailing rows that only hold a running "Total Work Hours" formula.
export const LOGBOOK = [
  ['Task', 'Status', ' Work Date', 'Work Start', 'Work End', 'Deadline', 'Milestone', 'Deliverable', 'Deliverable Non-Chip', 'Location', 'Notes', 'Total Work Hours', 'Proof of Attendance'],
  ['Orientasi dan penyusunan rencana kerja magang', 'Completed', '7/6/2026', '8:00:00 AM', '4:00:00 PM', '7/6/2026 16:00:00', 'Rencana kerja tersusun', 'Rencana Kerja.pdf', '', 'Head Office (On-Site)', '- Orientasi tim dan alur kerja\n- Menyusun rencana kerja', '8:00:00', ''],
  ['Studi kebutuhan sistem inventaris', 'Completed', '7/7/2026', '8:00:00 AM', '4:30:00 PM', '7/7/2026 16:00:00', 'Ringkasan kebutuhan', ' Catatan Kebutuhan', '', 'Head Office (On-Site)', '- Wawancara pengguna gudang', '16:30:00', ''],
  ['Rancangan antarmuka - Inventaris', 'Completed', '7/8/2026', '8:00:00 AM', '5:00:00 PM', '7/8/2026 17:00:00', 'Wireframe halaman utama', 'Wireframe v1', 'Prototipe awal', 'WFA', '- Wireframe dasbor\n- Prototipe halaman stok', '25:30:00', ''],
  ['Revisi rancangan ', 'Completed', '7/9/2026', '8:00:00 AM', '4:30:00 PM', '7/9/2026 16:00:00', 'Wireframe final', 'Wireframe v2', '', 'Head Office (On-Site)', '- Revisi sesuai masukan pembimbing', '34:00:00', ''],
  ['Finalisasi rencana kerja', 'Completed', '7/10/2026', '8:00:00 AM', '10:00:00 PM', '7/11/2026 0:00:00', 'Rencana kerja siap dipresentasikan', '', 'Rencana Kerja (final)', 'WFA', '- Finalisasi rencana kerja\n- Persiapan materi presentasi', '48:00:00', ''],
  ['', '', '', '', '', '', '', '', '', '', '', '48:00:00', ''],
  ['', '', '', '', '', '', '', '', '', '', '', '48:00:00', ''],
];
