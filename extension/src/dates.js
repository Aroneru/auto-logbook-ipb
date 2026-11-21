/*
 * Auto Logbook IPB: date and time parsing.
 *
 * Everything works on plain strings ("YYYY-MM-DD", "HH:MM") and UTC math, so
 * the browser's time zone never shifts a date.
 */
(function (ALB) {
  'use strict';

  const U = ALB.util;
  const D = (ALB.dates = {});

  const MONTHS = {
    januari: 1, january: 1, jan: 1,
    februari: 2, pebruari: 2, february: 2, feb: 2, peb: 2,
    maret: 3, march: 3, mar: 3,
    april: 4, apr: 4,
    mei: 5, may: 5,
    juni: 6, june: 6, jun: 6,
    juli: 7, july: 7, jul: 7,
    agustus: 8, august: 8, agu: 8, agt: 8, ags: 8, aug: 8,
    september: 9, sept: 9, sep: 9,
    oktober: 10, october: 10, okt: 10, oct: 10,
    november: 11, nopember: 11, nov: 11, nop: 11,
    desember: 12, december: 12, des: 12, dec: 12,
  };

  const MONTH_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONTH_LONG_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const WEEKDAY_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  // A leading weekday such as "Senin, " or "Mon " is dropped before parsing.
  const LEADING_WEEKDAY =
    /^(?:senin|selasa|rabu|kamis|jum'?at|sabtu|minggu|ahad|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|sen|sel|rab|kam|jum|sab|min)\.?,?\s+/i;

  D.daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  /** Build "YYYY-MM-DD" when the parts form a real calendar date, else null. */
  D.validIso = (y, m, d) => {
    if (!(y >= 1900 && y <= 2200) || !(m >= 1 && m <= 12)) return null;
    if (!(d >= 1 && d <= D.daysInMonth(y, m))) return null;
    return `${String(y).padStart(4, '0')}-${U.pad2(m)}-${U.pad2(d)}`;
  };

  const fullYear = (y) => (Number(y) < 100 ? 2000 + Number(y) : Number(y));

  D.parts = (iso) => iso.split('-').map(Number);

  /** Days since 1970-01-01 for a "YYYY-MM-DD" string. */
  D.dayNumber = (iso) => {
    const [y, m, d] = D.parts(iso);
    return Date.UTC(y, m - 1, d) / 86400000;
  };

  D.addDays = (iso, n) => {
    const t = new Date((D.dayNumber(iso) + n) * 86400000);
    return D.validIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };

  /** Excel serial date (1900 system) to ISO. */
  D.serialToIso = (serial, date1904 = false) => {
    const days = Math.floor(serial) + (date1904 ? 1462 : 0);
    const t = new Date(Date.UTC(1899, 11, 30) + days * 86400000);
    return D.validIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  };

  /** For "a/b/yyyy" style values return [a, b]; null for anything else. */
  D.numericParts = (raw) => {
    const s = U.norm(raw).replace(LEADING_WEEKDAY, '');
    const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };

  /**
   * Parse one date value. `order` only matters for all-numeric values such as
   * "7/6/2026": "DMY" (Indonesian default) or "MDY" (US-locale sheets).
   */
  D.parseDate = (raw, order = 'DMY') => {
    let s = U.norm(raw);
    if (!s) return null;
    s = s.replace(LEADING_WEEKDAY, '');
    let m;

    // 2026-07-06, 2026/07/06, optionally followed by a time
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/))) {
      return D.validIso(Number(m[1]), Number(m[2]), Number(m[3]));
    }
    // 6/7/2026, 06-07-26 (+ optional time)
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/))) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const y = fullYear(m[3]);
      return order === 'MDY' ? D.validIso(y, a, b) : D.validIso(y, b, a);
    }
    // 6 Juli 2026, 06-Jul-2026, 6th July 2026
    if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([a-z]+)\.?,?[\s\-/.]+(\d{4}|\d{2})(?!\d)/i))) {
      const month = MONTHS[m[2].toLowerCase()];
      if (month) return D.validIso(fullYear(m[3]), month, Number(m[1]));
    }
    // July 6, 2026
    if ((m = s.match(/^([a-z]+)\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})(?!\d)/i))) {
      const month = MONTHS[m[1].toLowerCase()];
      if (month) return D.validIso(Number(m[3]), month, Number(m[2]));
    }
    // Excel serial number such as 46209
    if ((m = s.match(/^(\d{5})(?:[.,]\d+)?$/))) {
      const n = Number(m[1]);
      if (n > 25000 && n < 80000) return D.serialToIso(n);
    }
    return null;
  };

  /** True when the value reads as a date in either numeric order. */
  D.isDateLike = (raw) => Boolean(D.parseDate(raw, 'DMY') || D.parseDate(raw, 'MDY'));

  /**
   * Decide DMY vs MDY for a column of values.
   * basis: "certain" (a part > 12 settles it), "conflict" (both seen),
   * "guess" (picked the reading with the tighter day-to-day sequence),
   * "default" (no evidence) or "none" (no numeric dates at all).
   */
  D.detectOrder = (values) => {
    let dmy = 0;
    let mdy = 0;
    let numeric = 0;
    for (const v of values) {
      const p = D.numericParts(v);
      if (!p) continue;
      numeric++;
      const [a, b] = p;
      if (a > 12 && b <= 12) dmy++;
      else if (b > 12 && a <= 12) mdy++;
    }
    if (!numeric) return { order: 'DMY', basis: 'none' };
    if (dmy && !mdy) return { order: 'DMY', basis: 'certain' };
    if (mdy && !dmy) return { order: 'MDY', basis: 'certain' };
    if (dmy && mdy) return { order: dmy >= mdy ? 'DMY' : 'MDY', basis: 'conflict' };

    const spread = (order) => {
      const days = values.map((v) => D.parseDate(v, order)).filter(Boolean).map(D.dayNumber);
      if (days.length < 2) return Infinity;
      let sum = 0;
      for (let i = 1; i < days.length; i++) sum += Math.abs(days[i] - days[i - 1]);
      return sum / (days.length - 1);
    };
    const dmySpread = spread('DMY');
    const mdySpread = spread('MDY');
    if (mdySpread < dmySpread) return { order: 'MDY', basis: 'guess' };
    if (dmySpread < mdySpread) return { order: 'DMY', basis: 'guess' };
    return { order: 'DMY', basis: 'default' };
  };

  /** Parse a time of day to "HH:MM" (24h). Accepts 8:00, 08.30, 4:30:00 PM, 0.3333 (Excel). */
  D.parseTime = (raw) => {
    let s = U.norm(raw).toLowerCase();
    if (!s) return null;
    s = s.replace(/\b(?:wib|wita|wit|jam|pukul|pkl)\b\.?/g, ' ').trim();
    // Drop a leading date ("11/5/2026 0:00:00", "2026-11-05T08:00").
    s = s.replace(/^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[t\s]+|$)/, '').trim();
    if (!s) return null;

    const m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?(?:[:.](\d{2})(?:[.,]\d+)?)?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/);
    if (m) {
      let h = Number(m[1]);
      const min = m[2] != null ? Number(m[2]) : 0;
      const ampm = m[4];
      if (m[2] == null && !ampm) return null; // a bare "8" is too ambiguous
      if (ampm) {
        if (h < 1 || h > 12) return null;
        const pm = ampm[0] === 'p';
        if (pm && h !== 12) h += 12;
        if (!pm && h === 12) h = 0;
      }
      if (h > 23 || min > 59) return null;
      return `${U.pad2(h)}:${U.pad2(min)}`;
    }
    // Excel stores times as a fraction of a day.
    if (/^0?[.,]\d+$/.test(s)) {
      const total = Math.round(Number(s.replace(',', '.')) * 1440);
      if (total >= 0 && total < 1440) return `${U.pad2(Math.floor(total / 60))}:${U.pad2(total % 60)}`;
    }
    return null;
  };

  /** Parse "08:00 - 16:30", "08.00–16.30 WIB", "8 AM s/d 4 PM" to ["08:00", "16:30"]. */
  D.parseTimeRange = (raw) => {
    const s = U.norm(raw);
    if (!s) return null;
    const parts = s
      .split(/\s*(?:–|—|-|~|\bs\.?\s?d\.?(?=\s|\d|$)|\bs\/d\b|\bsampai\b|\bhingga\b|\bto\b|\buntil\b)\s*/i)
      .filter(Boolean);
    if (parts.length !== 2) return null;
    const start = D.parseTime(parts[0]);
    const end = D.parseTime(parts[1]);
    return start && end ? [start, end] : null;
  };

  D.minutes = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  };

  /** Format ISO with a pattern made of DD, MM and YYYY, e.g. "DD/MM/YYYY". */
  D.format = (iso, pattern = 'DD/MM/YYYY') => {
    const [y, m, d] = iso.split('-');
    return pattern.replace('YYYY', y).replace('MM', m).replace('DD', d);
  };

  D.weekday = (iso) => new Date(D.dayNumber(iso) * 86400000).getUTCDay();

  /** "Sen, 6 Jul 2026" (or without weekday). */
  D.human = (iso, withWeekday = true) => {
    if (!iso) return '';
    const [y, m, d] = D.parts(iso);
    const text = `${d} ${MONTH_SHORT_ID[m - 1]} ${y}`;
    return withWeekday ? `${WEEKDAY_SHORT_ID[D.weekday(iso)]}, ${text}` : text;
  };

  D.humanLong = (iso) => {
    if (!iso) return '';
    const [y, m, d] = D.parts(iso);
    return `${d} ${MONTH_LONG_ID[m - 1]} ${y}`;
  };

  /** Find every date mentioned in free text (portal tables, activity period). */
  D.findDates = (text, order = 'DMY') => {
    const s = U.norm(text);
    const out = [];
    const re =
      /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)|(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)|(?<!\d)(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})(?!\d)|\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/g;
    for (const m of s.matchAll(re)) {
      let iso = null;
      if (m[1]) iso = D.validIso(Number(m[1]), Number(m[2]), Number(m[3]));
      else if (m[4]) {
        iso = order === 'MDY'
          ? D.validIso(Number(m[6]), Number(m[4]), Number(m[5]))
          : D.validIso(Number(m[6]), Number(m[5]), Number(m[4]));
      } else if (m[7]) {
        const month = MONTHS[m[8].toLowerCase()];
        if (month) iso = D.validIso(Number(m[9]), month, Number(m[7]));
      } else if (m[10]) {
        const month = MONTHS[m[10].toLowerCase()];
        if (month) iso = D.validIso(Number(m[12]), month, Number(m[11]));
      }
      if (iso) out.push(iso);
    }
    return out;
  };

  /** Dates encoded in a file name: IMG_20260706_144140.jpg, bukti 06-07-2026.pdf, 2026-07-06.png */
  D.datesInFilename = (name) => {
    const base = String(name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '');
    const found = new Set();
    for (const m of base.matchAll(/(?<!\d)(20\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?!\d)/g)) {
      const iso = D.validIso(Number(m[1]), Number(m[2]), Number(m[3]));
      if (iso) found.add(iso);
    }
    for (const m of base.matchAll(/(?<!\d)([0-3]?\d)[-_.]([01]?\d)[-_.](20\d{2})(?!\d)/g)) {
      const iso = D.validIso(Number(m[3]), Number(m[2]), Number(m[1]));
      if (iso) found.add(iso);
    }
    return [...found];
  };
})(globalThis.ALB);
