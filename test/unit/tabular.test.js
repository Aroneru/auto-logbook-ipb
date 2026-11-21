import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALB, LOGBOOK, sheetsClipboard } from './load.js';

const T = ALB.tabular;

test('Google Sheets clipboard with multi-line cells parses back to the same grid', () => {
  const text = sheetsClipboard(LOGBOOK);
  assert.equal(T.detectDelimiter(text), '\t');
  const rows = T.parseText(text);
  assert.equal(rows.length, LOGBOOK.length);
  assert.deepEqual(rows[1], LOGBOOK[1]);
  assert.equal(rows[5][10], '- Finalisasi rencana kerja\n- Persiapan materi presentasi');
});

test('CSV with commas, semicolons, quotes and CRLF', () => {
  const csv = 'tanggal,keterangan\r\n06/07/2026,"Rapat, koordinasi ""tim"""\r\n';
  assert.equal(T.detectDelimiter(csv), ',');
  assert.deepEqual(T.parseText(csv), [['tanggal', 'keterangan'], ['06/07/2026', 'Rapat, koordinasi "tim"']]);

  const semi = '﻿Tanggal;Keterangan;Lokasi\n06/07/2026;Rapat, tim;Kantor\n';
  assert.equal(T.detectDelimiter(semi), ';');
  assert.deepEqual(T.parseText(semi)[1], ['06/07/2026', 'Rapat, tim', 'Kantor']);
});

test('toTable detects the header, trims headers and drops empty trailing columns', () => {
  const rows = T.parseText(sheetsClipboard(LOGBOOK));
  const table = T.toTable(rows);
  assert.equal(table.hasHeader, true);
  assert.equal(table.headers[2], 'Work Date');
  assert.equal(table.headers.length, 13); // "Proof of Attendance" has a header, so it stays
  assert.equal(table.rows.length, 7);

  const noTitleCol = T.toTable([
    ['Tanggal', 'Keterangan', ''],
    ['06/07/2026', 'Rapat', ''],
  ]);
  assert.deepEqual(noTitleCol.headers, ['Tanggal', 'Keterangan']);
});

test('toTable reuses saved headers for a header-less paste of the same width', () => {
  const saved = LOGBOOK[0].map((h) => h.trim());
  const table = T.toTable([LOGBOOK[2], LOGBOOK[3]], saved);
  assert.equal(table.hasHeader, false);
  assert.equal(table.reusedHeaders, true);
  assert.equal(table.headers[2], 'Work Date');
  assert.equal(table.rows.length, 2);

  const generic = T.toTable([['06/07/2026', '08:00', '16:00', 'Rapat']]);
  assert.deepEqual(generic.headers, ['Kolom A', 'Kolom B', 'Kolom C', 'Kolom D']);
});

test('toTable makes duplicate or empty header names unique', () => {
  const table = T.toTable([
    ['Tanggal', 'Catatan', 'Catatan', ''],
    ['06/07/2026', 'a', 'b', 'c'],
  ]);
  assert.deepEqual(table.headers, ['Tanggal', 'Catatan', 'Catatan (2)', 'Kolom D']);
});

test('toCsv quotes when needed and round-trips', () => {
  const rows = [['Tanggal', 'Keterangan'], ['06/07/2026', 'Baris 1\nBaris "2", akhir']];
  const csv = T.toCsv(rows);
  assert.deepEqual(T.parseText(csv), rows);
});
