import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALB, LOGBOOK, sheetsClipboard } from './load.js';

const M = ALB.mapping;
const T = ALB.tabular;
const D = ALB.dates;

const logbookTable = () => T.toTable(T.parseText(sheetsClipboard(LOGBOOK)));

const JENIS = [
  { value: '', text: '-- Pilih --' },
  { value: '1', text: 'Berita Acara Pembimbingan (Konsultasi/Mentoring/Coaching)' },
  { value: '2', text: 'Berita Acara Ujian' },
  { value: '3', text: 'Berita Acara Kegiatan' },
];

test('detectColumns maps the sample logbook headers', () => {
  const t = logbookTable();
  const map = M.detectColumns(t.headers, t.rows);
  const name = (f) => (map[f] == null ? null : t.headers[map[f]]);
  assert.equal(name('tanggal'), 'Work Date');
  assert.equal(name('mulai'), 'Work Start');
  assert.equal(name('selesai'), 'Work End');
  assert.equal(name('keterangan'), 'Task');
  assert.equal(name('detail'), 'Notes');
  assert.equal(name('lokasi'), 'Location');
  assert.equal(name('bukti'), null, 'empty "Proof of Attendance" column must not be mapped');
  assert.equal(name('jam'), null);
  assert.equal(M.defaultTemplate(t.headers, map), '{Task}\n{Notes}');
});

test('detectColumns maps the column layouts of other IPB logbook tools', () => {
  const cases = [
    {
      headers: ['Waktu', 'Tstart', 'Tend', 'JenisLogId', 'Dosen', 'IsLuring', 'Lokasi', 'Keterangan', 'FilePath'],
      row: ['06/07/2026', '08:00', '16:00', '3', '1', '1', 'Kantor', 'Rapat koordinasi', 'files/a.jpg'],
      want: { tanggal: 'Waktu', mulai: 'Tstart', selesai: 'Tend', jenis: 'JenisLogId', tipe: 'IsLuring', lokasi: 'Lokasi', keterangan: 'Keterangan', bukti: 'FilePath' },
    },
    {
      headers: ['tanggal', 'mulai', 'selesai', 'keterangan', 'file', 'tipe', 'lokasi', 'berita'],
      row: ['03/09/2024', '20:00', '23:00', 'Keterangan 1', 'files/example.jpeg', 'online', 'Kos', 'kegiatan'],
      want: { tanggal: 'tanggal', mulai: 'mulai', selesai: 'selesai', keterangan: 'keterangan', bukti: 'file', tipe: 'tipe', lokasi: 'lokasi', jenis: 'berita' },
    },
    {
      headers: ['Tanggal', 'Mulai', 'Selesai', 'Berita', 'Tipe', 'Lokasi', 'Topik', 'Bukti'],
      row: ['28/08/2026', '17:30', '19:00', 'Kegiatan', 'Online', 'Zoom', 'Rapat Divisi #5', 'https://drive.google.com/file/d/x/view'],
      want: { tanggal: 'Tanggal', mulai: 'Mulai', selesai: 'Selesai', jenis: 'Berita', tipe: 'Tipe', lokasi: 'Lokasi', keterangan: 'Topik', bukti: 'Bukti' },
    },
    {
      headers: ['No', 'Hari/Tanggal', 'Jam', 'Uraian Kegiatan', 'Tempat'],
      row: ['1', 'Senin, 6 Juli 2026', '08.00 - 16.00', 'Orientasi magang', 'Kantor'],
      want: { tanggal: 'Hari/Tanggal', jam: 'Jam', keterangan: 'Uraian Kegiatan', lokasi: 'Tempat' },
    },
  ];
  for (const c of cases) {
    const map = M.detectColumns(c.headers, [c.row]);
    const got = {};
    for (const [f, i] of Object.entries(map)) got[f] = c.headers[i];
    assert.deepEqual(got, c.want, c.headers.join(','));
  }
});

test('detectColumns falls back to content for header-less data', () => {
  const t = T.toTable([
    ['06/07/2026', '08:00', '16:00', 'Rapat koordinasi tim proyek', 'Kantor'],
    ['07/07/2026', '08:00', '16:30', 'Menyusun laporan mingguan', 'Kantor'],
  ]);
  const map = M.detectColumns(t.headers, t.rows);
  assert.equal(map.tanggal, 0);
  assert.equal(map.mulai, 1);
  assert.equal(map.selesai, 2);
  assert.equal(map.keterangan, 3);
});

test('resolveColumns keeps saved choices, explicit "none" and ignores foreign sheets', () => {
  const t = logbookTable();
  const saved = { tanggal: 'Work Date', mulai: 'Work Start', selesai: 'Work End', keterangan: 'Milestone', detail: null, lokasi: 'Location' };
  const map = M.resolveColumns(t.headers, t.rows, saved);
  assert.equal(t.headers[map.keterangan], 'Milestone');
  assert.equal(map.detail, undefined);
  assert.equal(t.headers[map.lokasi], 'Location');

  const foreign = M.resolveColumns(t.headers, t.rows, { tanggal: 'Tgl', keterangan: 'Uraian' });
  assert.equal(t.headers[foreign.tanggal], 'Work Date');
});

test('guessTipe and matchJenis understand common spellings', () => {
  assert.equal(M.guessTipe('Head Office (On-Site)'), 'offline');
  assert.equal(M.guessTipe('WFA'), 'online');
  assert.equal(M.guessTipe('Zoom Meeting'), 'online');
  assert.equal(M.guessTipe('Hybrid'), 'hybrid');
  assert.equal(M.guessTipe('Luring'), 'offline');
  assert.equal(M.guessTipe('Bogor'), null);
  assert.equal(M.matchJenis('kegiatan', JENIS).value, '3');
  assert.equal(M.matchJenis('Bimbingan', JENIS).value, '1');
  assert.equal(M.matchJenis('2', JENIS).value, '2');
  assert.equal(M.matchJenis('ujian akhir', JENIS).value, '2');
  assert.equal(M.matchJenis('lain-lain', JENIS), null);
});

test('templates render, clean blank parts and report unknown names', () => {
  const headers = ['Task', 'Notes'];
  assert.equal(M.renderTemplate('{Task}\n{Notes}', headers, ['Rapat', '- a\n- b']), 'Rapat\n- a\n- b');
  assert.equal(M.renderTemplate('{Task}\n{Notes}', headers, ['Rapat', '']), 'Rapat');
  assert.equal(M.renderTemplate('{task} ({NOTES})', headers, ['Rapat', 'x']), 'Rapat (x)');
  assert.deepEqual(M.templateUnknown('{Task} {Foo}', headers), ['Foo']);
});

function baseSettings(t, map) {
  return {
    template: M.defaultTemplate(t.headers, map),
    defaultStart: '08:00',
    defaultEnd: '16:00',
    defaultTipe: 'offline',
    defaultLokasi: '',
    locMap: {
      'head office on site': { tipe: 'offline', lokasi: 'Kantor Pusat PT Contoh, Jakarta' },
      wfa: { tipe: 'online', lokasi: 'Work From Anywhere' },
    },
    jenis: { value: '3', text: 'Berita Acara Kegiatan' },
  };
}

test('buildEntries turns the sample logbook into ready entries', () => {
  const t = logbookTable();
  const map = M.detectColumns(t.headers, t.rows);
  const order = D.detectOrder(t.rows.map((r) => r[map.tanggal])).order;
  assert.equal(order, 'MDY');
  const entries = M.buildEntries({
    headers: t.headers,
    rows: t.rows,
    map,
    order,
    settings: baseSettings(t, map),
    hasDefaultBukti: true,
    defaultBuktiName: 'kartu-magang.jpg',
    today: '2026-11-21',
  });
  assert.equal(entries.length, 5, 'summary-only rows are skipped');
  const [first, , third] = entries;
  assert.equal(first.date, '2026-07-06');
  assert.equal(first.start, '08:00');
  assert.equal(first.end, '16:00');
  assert.equal(first.hours, 8);
  assert.equal(first.keterangan, 'Orientasi dan penyusunan rencana kerja magang\n- Orientasi tim dan alur kerja\n- Menyusun rencana kerja');
  assert.equal(first.tipe, 'offline');
  assert.equal(first.lokasi, 'Kantor Pusat PT Contoh, Jakarta');
  assert.equal(first.status, 'ready');
  assert.equal(first.bukti.kind, 'default');
  assert.equal(third.tipe, 'online');
  assert.equal(third.lokasi, 'Work From Anywhere');
  assert.equal(entries[4].end, '22:00');
});

test('buildEntries flags errors, duplicates, period and future dates', () => {
  const headers = ['Tanggal', 'Mulai', 'Selesai', 'Keterangan', 'Lokasi'];
  const rows = [
    ['06/07/2026', '08:00', '16:00', 'Rapat koordinasi tim proyek', 'Kantor'],
    ['07/07/2026', '16:00', '08:00', 'Jam terbalik', 'Kantor'],
    ['32/07/2026', '08:00', '16:00', 'Tanggal salah', 'Kantor'],
    ['08/07/2026', '08:00', '16:00', 'Penyusunan laporan', 'Kantor'],
    ['09/07/2026', '08:00', '16:00', 'Kegiatan baru', 'Kantor'],
    ['01/01/2027', '08:00', '16:00', 'Masa depan', 'Kantor'],
    ['', '', '', '', ''],
  ];
  const map = M.detectColumns(headers, rows);
  const settings = { template: '{Keterangan}', defaultTipe: 'offline', locMap: {}, jenis: { value: '3', text: 'Berita Acara Kegiatan' } };
  const existing = [
    { dates: ['2026-07-06'], text: '1 06 Juli 2026 08:00 - 16:00 Rapat koordinasi tim proyek Kantor' },
    { dates: ['2026-07-08'], text: '2 08 Juli 2026 Sesuatu yang lain sama sekali' },
  ];
  const entries = M.buildEntries({
    headers, rows, map, order: 'DMY', settings, existing,
    hasDefaultBukti: true, period: { from: '2026-07-01', to: '2026-12-10' }, today: '2026-11-21',
  });
  assert.equal(entries.length, 6);
  assert.equal(entries[0].status, 'exists');
  assert.equal(entries[1].status, 'invalid');
  assert.match(entries[1].errors[0], /harus setelah/);
  assert.equal(entries[2].status, 'invalid');
  assert.equal(entries[3].status, 'warn');
  assert.equal(entries[3].flags.dateExists, true);
  assert.equal(entries[4].status, 'ready');
  assert.equal(entries[5].status, 'warn');
  assert.equal(entries[5].flags.future, true);
  assert.equal(entries[5].flags.outOfPeriod, true);
});

test('buildEntries picks per-date files, column-named files and enforces max length', () => {
  const headers = ['Tanggal', 'Jam', 'Keterangan', 'Bukti'];
  const rows = [
    ['06/07/2026', '08.00-16.00', 'Orientasi', ''],
    ['07/07/2026', '08.00-16.00', 'Rapat', 'notulen.pdf'],
    ['08/07/2026', '08.00-16.00', 'x'.repeat(30), ''],
  ];
  const map = M.detectColumns(headers, rows);
  const settings = { template: '{Keterangan}', defaultTipe: 'online', defaultLokasi: 'Rumah', locMap: {}, jenis: { value: '3', text: 'Kegiatan' } };
  const buktiFiles = [
    { id: 'f1', name: 'IMG_20260706_144140.jpg', dates: ['2026-07-06'] },
    { id: 'f2', name: 'Notulen.PDF', dates: [] },
  ];
  const entries = M.buildEntries({ headers, rows, map, order: 'DMY', settings, buktiFiles, maxLen: { keterangan: 20 } });
  assert.deepEqual(entries[0].bukti, { kind: 'date', id: 'f1', name: 'IMG_20260706_144140.jpg' });
  assert.deepEqual(entries[1].bukti, { kind: 'named', id: 'f2', name: 'Notulen.PDF' });
  assert.equal(entries[2].status, 'invalid');
  assert.ok(entries[2].errors.some((e) => /batas portal 20/.test(e)));
  assert.ok(entries[2].errors.some((e) => /bukti/.test(e)));

  const truncated = M.buildEntries({ headers, rows, map, order: 'DMY', settings: { ...settings, truncate: true }, buktiFiles, hasDefaultBukti: true, maxLen: { keterangan: 20 } });
  assert.equal(truncated[2].keterangan.length, 20);
  assert.equal(truncated[2].status, 'ready');
});

test('checkExisting tolerates truncated portal text and uses local history', () => {
  const entry = { date: '2026-07-06', keterangan: 'Orientasi dan penyusunan rencana kerja magang\n- Orientasi tim dan alur kerja', key: 'k1' };
  assert.equal(M.checkExisting(entry, [{ dates: ['2026-07-06'], text: 'Orientasi dan penyusunan rencana kerja magang ...' }]), 'exists');
  assert.equal(M.checkExisting(entry, [{ dates: ['2026-07-06'], text: 'Rapat lain' }]), 'date-exists');
  assert.equal(M.checkExisting(entry, [], new Set(['k1'])), 'exists');
  assert.equal(M.checkExisting(entry, [{ dates: ['2026-07-07'], text: 'Orientasi' }]), null);
});
