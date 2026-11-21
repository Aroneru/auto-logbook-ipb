import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALB } from './load.js';

const D = ALB.dates;

test('parseDate reads numeric dates in the requested order', () => {
  assert.equal(D.parseDate('7/6/2026', 'MDY'), '2026-07-06');
  assert.equal(D.parseDate('7/6/2026', 'DMY'), '2026-06-07');
  assert.equal(D.parseDate('06-07-26'), '2026-07-06');
  assert.equal(D.parseDate('11/5/2026 0:00:00', 'MDY'), '2026-11-05');
});

test('parseDate reads ISO, month names, weekdays and Excel serials', () => {
  assert.equal(D.parseDate('2026-07-06'), '2026-07-06');
  assert.equal(D.parseDate('2026/7/6 08:00'), '2026-07-06');
  assert.equal(D.parseDate('Senin, 06 Juli 2026'), '2026-07-06');
  assert.equal(D.parseDate('6 Jul 2026'), '2026-07-06');
  assert.equal(D.parseDate('06-Jul-26'), '2026-07-06');
  assert.equal(D.parseDate('6 Agustus 2026'), '2026-08-06');
  assert.equal(D.parseDate('July 6, 2026'), '2026-07-06');
  assert.equal(D.parseDate('Mon, Jul 6, 2026'), '2026-07-06');
  assert.equal(D.parseDate('46209'), '2026-07-06');
  assert.equal(D.parseDate('45658'), '2025-01-01');
});

test('parseDate rejects impossible or empty values', () => {
  assert.equal(D.parseDate('31/02/2026'), null);
  assert.equal(D.parseDate(''), null);
  assert.equal(D.parseDate('Rapat mingguan'), null);
  assert.equal(D.parseDate('12345'), null);
});

test('detectOrder settles on certain evidence and guesses from sequences', () => {
  assert.deepEqual(D.detectOrder(['7/6/2026', '7/13/2026']), { order: 'MDY', basis: 'certain' });
  assert.deepEqual(D.detectOrder(['13/7/2026', '14/7/2026']), { order: 'DMY', basis: 'certain' });
  assert.deepEqual(D.detectOrder(['7/6/2026', '7/7/2026', '7/8/2026']), { order: 'MDY', basis: 'guess' });
  assert.deepEqual(D.detectOrder(['6/7/2026', '7/7/2026', '8/7/2026']), { order: 'DMY', basis: 'guess' });
  assert.deepEqual(D.detectOrder(['5/5/2026']), { order: 'DMY', basis: 'default' });
  assert.deepEqual(D.detectOrder(['6 Juli 2026']), { order: 'DMY', basis: 'none' });
  assert.equal(D.detectOrder(['13/7/2026', '7/13/2026']).basis, 'conflict');
});

test('parseTime handles 12h, dots, zones, Excel fractions and datetimes', () => {
  assert.equal(D.parseTime('8:00:00 AM'), '08:00');
  assert.equal(D.parseTime('4:30:00 PM'), '16:30');
  assert.equal(D.parseTime('10:00:00 PM'), '22:00');
  assert.equal(D.parseTime('12:00 AM'), '00:00');
  assert.equal(D.parseTime('12:15 pm'), '12:15');
  assert.equal(D.parseTime('16.30'), '16:30');
  assert.equal(D.parseTime('08:00 WIB'), '08:00');
  assert.equal(D.parseTime('pukul 9.15'), '09:15');
  assert.equal(D.parseTime('0.333333333'), '08:00');
  assert.equal(D.parseTime('7/6/2026 16:00:00'), '16:00');
  assert.equal(D.parseTime('8 PM'), '20:00');
  assert.equal(D.parseTime('8'), null);
  assert.equal(D.parseTime('25:00'), null);
  assert.equal(D.parseTime('13:00 PM'), null);
});

test('parseTimeRange splits common separators', () => {
  assert.deepEqual(D.parseTimeRange('08:00 - 16:30'), ['08:00', '16:30']);
  assert.deepEqual(D.parseTimeRange('08.00–16.30 WIB'), ['08:00', '16:30']);
  assert.deepEqual(D.parseTimeRange('8 AM s/d 4 PM'), ['08:00', '16:00']);
  assert.deepEqual(D.parseTimeRange('08:00 sampai 16:00'), ['08:00', '16:00']);
  assert.equal(D.parseTimeRange('08:00'), null);
});

test('findDates finds dates inside portal text', () => {
  assert.deepEqual(D.findDates('Kamis, 05 November 2026 08:00 - 16:00 Rapat'), ['2026-11-05']);
  assert.deepEqual(D.findDates('06/07/2026 s/d 10/12/2026'), ['2026-07-06', '2026-12-10']);
  assert.deepEqual(D.findDates('Periode 6 Juli 2026 - 10 Desember 2026'), ['2026-07-06', '2026-12-10']);
  assert.deepEqual(D.findDates('Tidak ada tanggal 12345'), []);
});

test('datesInFilename reads camera and hand-written names', () => {
  assert.deepEqual(D.datesInFilename('IMG_20260706_144140.jpg'), ['2026-07-06']);
  assert.deepEqual(D.datesInFilename('bukti 06-07-2026.pdf'), ['2026-07-06']);
  assert.deepEqual(D.datesInFilename('2026-07-06 (1).png'), ['2026-07-06']);
  assert.deepEqual(D.datesInFilename('foto absen.jpg'), []);
});

test('format, human and minutes helpers', () => {
  assert.equal(D.format('2026-07-06'), '06/07/2026');
  assert.equal(D.format('2026-07-06', 'YYYY-MM-DD'), '2026-07-06');
  assert.equal(D.human('2026-07-06'), 'Sen, 6 Jul 2026');
  assert.equal(D.humanLong('2026-12-10'), '10 Desember 2026');
  assert.equal(D.minutes('16:30') - D.minutes('08:00'), 510);
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
});
