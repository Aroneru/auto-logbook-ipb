/*
 * Auto Logbook IPB: map spreadsheet columns to portal fields and build the
 * entries that will be submitted. Pure functions, no DOM.
 */
(function (ALB) {
  'use strict';

  const U = ALB.util;
  const D = ALB.dates;
  const M = (ALB.mapping = {});

  /** Spreadsheet-side fields. `synonyms` are compared against U.key(header). */
  M.FIELDS = [
    {
      key: 'tanggal',
      label: 'Tanggal',
      required: true,
      synonyms: ['tanggal', 'tgl', 'date', 'work date', 'tanggal kegiatan', 'tanggal pelaksanaan', 'hari tanggal', 'day', 'hari', 'waktu'],
    },
    {
      key: 'mulai',
      label: 'Jam mulai',
      synonyms: ['mulai', 'jam mulai', 'waktu mulai', 'start', 'start time', 'work start', 'tstart', 'dari', 'jam masuk', 'masuk', 'check in', 'time in', 'clock in'],
    },
    {
      key: 'selesai',
      label: 'Jam selesai',
      synonyms: ['selesai', 'jam selesai', 'waktu selesai', 'end', 'end time', 'work end', 'tend', 'sampai', 'hingga', 'jam keluar', 'keluar', 'pulang', 'check out', 'time out', 'clock out'],
    },
    {
      key: 'jam',
      label: 'Jam (rentang)',
      synonyms: ['jam', 'pukul', 'time', 'jam kerja', 'jam kegiatan', 'waktu kegiatan', 'waktu pelaksanaan'],
    },
    {
      key: 'keterangan',
      label: 'Keterangan',
      synonyms: ['keterangan', 'topik', 'kegiatan', 'aktivitas', 'activity', 'activities', 'deskripsi', 'description', 'uraian', 'uraian kegiatan', 'deskripsi kegiatan', 'task', 'tasks', 'tugas', 'judul', 'title', 'agenda', 'pekerjaan', 'nama kegiatan', 'logbook'],
    },
    {
      key: 'detail',
      label: 'Rincian',
      synonyms: ['notes', 'note', 'catatan', 'detail', 'details', 'rincian', 'hasil', 'output', 'progress', 'keterangan tambahan'],
    },
    {
      key: 'lokasi',
      label: 'Lokasi',
      synonyms: ['lokasi', 'location', 'tempat', 'place', 'venue', 'site', 'lokasi kegiatan'],
    },
    {
      key: 'tipe',
      label: 'Tipe penyelenggaraan',
      synonyms: ['tipe', 'tipe penyelenggaraan', 'penyelenggaraan', 'mode', 'metode', 'pelaksanaan', 'sifat', 'online offline', 'offline online', 'daring luring', 'luring daring', 'isluring', 'wfo wfa', 'work mode', 'tipe kegiatan'],
    },
    {
      key: 'jenis',
      label: 'Jenis kegiatan',
      synonyms: ['jenis', 'jenis kegiatan', 'jenis log', 'jenislogid', 'berita', 'berita acara', 'kategori', 'category', 'type'],
    },
    {
      key: 'bukti',
      label: 'Bukti (nama file)',
      synonyms: ['bukti', 'bukti aktivitas', 'bukti kegiatan', 'file', 'filepath', 'file path', 'lampiran', 'proof', 'proof of attendance', 'attachment', 'foto', 'dokumentasi', 'evidence', 'link bukti'],
    },
  ];
  M.FIELD_KEYS = M.FIELDS.map((f) => f.key);
  M.field = (key) => M.FIELDS.find((f) => f.key === key);

  M.TIPE_LABEL = { offline: 'Offline', online: 'Online', hybrid: 'Hybrid' };

  /** How well a header names a field: exact synonym beats whole-word containment; longer beats shorter. */
  M.headerScore = (header, synonyms) => {
    const h = U.key(header);
    if (!h) return 0;
    const padded = ` ${h} `;
    let best = 0;
    for (const s of synonyms) {
      if (h === s) best = Math.max(best, 100 + s.length);
      else if (padded.includes(` ${s} `)) best = Math.max(best, 50 + s.length);
    }
    return best;
  };

  M.isKnownHeader = (text) => M.FIELDS.some((f) => M.headerScore(text, f.synonyms) > 0);

  /** Guess the portal's "Tipe Penyelenggaraan" from free text such as a location. */
  M.guessTipe = (raw) => {
    const k = U.key(raw);
    if (!k) return null;
    if (/\b(hybrid|hibrid|hibrida|campuran|blended)\b/.test(k)) return 'hybrid';
    if (/\b(online|daring|zoom|meet|gmeet|teams|wfh|wfa|remote|virtual|rumah|home|discord|webinar)\b/.test(k)) return 'online';
    if (/\b(offline|luring|on ?site|onsite|kantor|office|wfo|kampus|ruang|ruangan|gedung|lab|laboratorium|lapangan|tatap muka)\b/.test(k)) return 'offline';
    // Numeric/boolean conventions used by other logbook tools (IsLuring: 1 offline, 0 online, 2 hybrid).
    if (k === '1' || k === 'true') return 'offline';
    if (k === '0' || k === 'false') return 'online';
    if (k === '2') return 'hybrid';
    return null;
  };

  /** Per-column value statistics used to validate header matches and to detect columns by content. */
  M.columnStats = (rows, col) => {
    let nonEmpty = 0;
    let dates = 0;
    let times = 0;
    let ranges = 0;
    let tipes = 0;
    let totalLen = 0;
    let sample = '';
    for (const row of rows) {
      const v = U.norm(row[col]);
      if (!v) continue;
      nonEmpty++;
      if (!sample) sample = v;
      totalLen += v.length;
      if (D.isDateLike(v)) dates++;
      if (D.parseTime(v)) times++;
      if (D.parseTimeRange(v)) ranges++;
      if (M.guessTipe(v)) tipes++;
    }
    const ratio = (n) => (nonEmpty ? n / nonEmpty : 0);
    return {
      nonEmpty,
      dateRatio: ratio(dates),
      timeRatio: ratio(times),
      rangeRatio: ratio(ranges),
      tipeRatio: ratio(tipes),
      avgLen: nonEmpty ? totalLen / nonEmpty : 0,
      sample,
    };
  };

  function contentFits(field, st) {
    if (!st.nonEmpty) return false;
    switch (field) {
      case 'tanggal': return st.dateRatio >= 0.6;
      case 'mulai':
      case 'selesai': return st.timeRatio >= 0.6;
      case 'jam': return st.rangeRatio >= 0.6;
      case 'tipe': return st.tipeRatio >= 0.6;
      default: return true;
    }
  }

  /** Auto-detect { field: columnIndex } from headers and values. */
  M.detectColumns = (headers, rows) => {
    const stats = headers.map((_, c) => M.columnStats(rows, c));
    const candidates = [];
    for (const f of M.FIELDS) {
      headers.forEach((h, c) => {
        const score = M.headerScore(h, f.synonyms);
        if (score && contentFits(f.key, stats[c])) candidates.push({ field: f.key, col: c, score });
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.col - b.col);

    const map = {};
    const used = new Set();
    const take = (field, col) => {
      map[field] = col;
      used.add(col);
    };
    for (const cand of candidates) {
      if (map[cand.field] != null || used.has(cand.col)) continue;
      take(cand.field, cand.col);
    }

    const free = (pred) => stats.findIndex((s, c) => !used.has(c) && pred(s));

    if (map.tanggal == null) {
      const c = free((s) => s.nonEmpty && s.dateRatio >= 0.8);
      if (c >= 0) take('tanggal', c);
    }
    if (map.mulai == null && map.selesai == null && map.jam == null) {
      const timeCols = stats.map((s, c) => c).filter((c) => !used.has(c) && stats[c].nonEmpty && stats[c].timeRatio >= 0.8);
      if (timeCols.length >= 2) {
        take('mulai', timeCols[0]);
        take('selesai', timeCols[1]);
      } else {
        const c = free((s) => s.nonEmpty && s.rangeRatio >= 0.8);
        if (c >= 0) take('jam', c);
      }
    }
    if (map.keterangan == null) {
      let best = -1;
      stats.forEach((s, c) => {
        if (used.has(c) || !s.nonEmpty || s.dateRatio > 0.5 || s.timeRatio > 0.5 || s.avgLen < 8) return;
        if (best < 0 || s.avgLen > stats[best].avgLen) best = c;
      });
      if (best >= 0) take('keterangan', best);
    }
    return map;
  };

  /**
   * Resolve saved column choices ({ field: headerName | null }) against new headers.
   * Falls back to auto-detection when the saved names belong to a different sheet.
   */
  M.resolveColumns = (headers, rows, saved) => {
    const auto = M.detectColumns(headers, rows);
    if (!saved) return auto;
    const keys = headers.map(U.key);
    const savedNames = Object.values(saved).filter(Boolean);
    const hits = savedNames.filter((n) => keys.includes(U.key(n))).length;
    if (!hits) return auto;

    const map = {};
    for (const f of M.FIELD_KEYS) {
      if (!(f in saved)) {
        if (auto[f] != null) map[f] = auto[f];
        continue;
      }
      if (saved[f] == null) continue; // explicitly "none"
      const i = keys.indexOf(U.key(saved[f]));
      if (i >= 0) map[f] = i;
      else if (auto[f] != null) map[f] = auto[f];
    }
    return map;
  };

  /** Column map -> { field: headerName | null } for storage. */
  M.columnsToNames = (headers, map) => {
    const out = {};
    for (const f of M.FIELD_KEYS) out[f] = map[f] != null ? headers[map[f]] : null;
    return out;
  };

  M.defaultTemplate = (headers, map) => {
    const parts = [];
    if (map.keterangan != null) parts.push(`{${headers[map.keterangan]}}`);
    if (map.detail != null) parts.push(`{${headers[map.detail]}}`);
    return parts.join('\n');
  };

  M.templateNames = (template) => [...String(template ?? '').matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);

  /** Placeholder names in the template that match no header. */
  M.templateUnknown = (template, headers) => {
    const keys = new Set(headers.map(U.key));
    return M.templateNames(template).filter((n) => !keys.has(U.key(n)));
  };

  M.renderTemplate = (template, headers, row) => {
    const index = new Map(headers.map((h, i) => [U.key(h), i]));
    const out = String(template ?? '').replace(/\{([^{}]+)\}/g, (all, name) => {
      const i = index.get(U.key(name));
      return i == null ? all : String(row[i] ?? '').trim();
    });
    return U.cleanMultiline(out);
  };

  /** Distinct non-empty values of a column, keeping first-seen spelling and counts. */
  M.distinctValues = (rows, col) => {
    const seen = new Map();
    for (const row of rows) {
      const v = U.norm(row[col]);
      if (!v) continue;
      const k = U.key(v) || v.toLowerCase();
      const hit = seen.get(k);
      if (hit) hit.count++;
      else seen.set(k, { key: k, value: v, count: 1 });
    }
    return [...seen.values()];
  };

  /** Pick a portal "Jenis Kegiatan" option for a spreadsheet value (number, keyword or label). */
  M.matchJenis = (raw, options) => {
    const text = U.norm(raw);
    if (!text || !options?.length) return null;
    const exact = options.find((o) => o.value && o.value === text);
    if (exact) return exact;
    const k = U.key(text);
    let want = null;
    if (/bimbing|konsul|mentor|coach/.test(k)) want = /pembimbingan|bimbingan/;
    else if (/ujian|exam|sidang/.test(k)) want = /ujian/;
    else if (/kegiatan|activity|aktivitas|harian|daily/.test(k)) want = /kegiatan/;
    if (want) {
      const hit = options.find((o) => o.value && want.test(U.key(o.text)));
      if (hit) return hit;
    }
    return options.find((o) => o.value && U.key(o.text).includes(k)) || null;
  };

  /** Stable identity of an entry for duplicate checks: date + normalized description. */
  M.entryKey = (date, keterangan) => `${date}|${U.hash(U.key(keterangan))}`;

  /**
   * Compare an entry with rows already on the portal.
   * Returns "exists", "date-exists" or null.
   */
  M.checkExisting = (entry, existing, history) => {
    if (history && history.has(entry.key)) return 'exists';
    if (!existing?.length) return null;
    const sameDate = existing.filter((r) => r.dates.includes(entry.date));
    if (!sameDate.length) return null;
    const words = U.uniq(U.words(entry.keterangan)).slice(0, 12);
    for (const r of sameDate) {
      const rowWords = new Set(U.words(r.text));
      const hit = words.filter((w) => rowWords.has(w)).length;
      if (words.length && hit / words.length >= 0.6) return 'exists';
    }
    return 'date-exists';
  };

  /**
   * Build submission entries.
   *
   * ctx = {
   *   headers, rows, map, settings,
   *   jenisOptions?: [{value,text}], maxLen?: {keterangan, lokasi},
   *   existing?: [{dates, text}], history?: Set<string>,
   *   buktiFiles?: [{id, name, dates}], hasDefaultBukti?: boolean,
   *   period?: {from, to}, today: "YYYY-MM-DD"
   * }
   */
  M.buildEntries = (ctx) => {
    const { headers, rows, map, settings } = ctx;
    const order = ctx.order || 'DMY';
    const col = (row, field) => (map[field] != null ? row[map[field]] ?? '' : '');
    const entries = [];

    rows.forEach((row, i) => {
      const rawDate = U.norm(col(row, 'tanggal'));
      const keterangan0 = M.renderTemplate(settings.template, headers, row);
      if (!rawDate && !keterangan0) return; // blank or summary-only row

      const errors = [];
      const warnings = [];

      // Date
      const date = rawDate ? D.parseDate(rawDate, order) : null;
      if (!rawDate) errors.push('Tanggal kosong');
      else if (!date) errors.push(`Tanggal tidak terbaca: "${rawDate}"`);

      // Times
      let start = null;
      let end = null;
      if (map.jam != null) {
        const range = D.parseTimeRange(col(row, 'jam'));
        if (range) [start, end] = range;
        else if (U.norm(col(row, 'jam'))) errors.push(`Jam tidak terbaca: "${U.norm(col(row, 'jam'))}"`);
      }
      if (map.mulai != null) {
        const raw = U.norm(col(row, 'mulai'));
        if (raw) {
          start = D.parseTime(raw);
          if (!start) errors.push(`Jam mulai tidak terbaca: "${raw}"`);
        }
      }
      if (map.selesai != null) {
        const raw = U.norm(col(row, 'selesai'));
        if (raw) {
          end = D.parseTime(raw);
          if (!end) errors.push(`Jam selesai tidak terbaca: "${raw}"`);
        }
      }
      if (!start && !errors.some((e) => e.startsWith('Jam mulai'))) start = settings.defaultStart || null;
      if (!end && !errors.some((e) => e.startsWith('Jam selesai'))) end = settings.defaultEnd || null;
      if (!start || !end) {
        if (!errors.some((e) => e.startsWith('Jam'))) errors.push('Jam mulai/selesai belum diatur');
      } else if (D.minutes(end) <= D.minutes(start)) {
        errors.push(`Jam selesai (${end}) harus setelah jam mulai (${start})`);
      }

      // Description
      let keterangan = keterangan0;
      if (!keterangan) errors.push('Keterangan kosong');
      const maxKet = ctx.maxLen?.keterangan;
      if (maxKet && keterangan.length > maxKet) {
        if (settings.truncate) {
          keterangan = U.truncate(keterangan, maxKet);
          warnings.push(`Keterangan dipotong ke ${maxKet} karakter`);
        } else {
          errors.push(`Keterangan ${keterangan.length} karakter, batas portal ${maxKet}`);
        }
      }

      // Location and delivery type
      const locRaw = U.norm(col(row, 'lokasi'));
      const tipeRaw = U.norm(col(row, 'tipe'));
      let tipe = tipeRaw ? M.guessTipe(tipeRaw) : null;
      if (tipeRaw && !tipe) warnings.push(`Tipe "${tipeRaw}" tidak dikenali, memakai bawaan`);
      let lokasi;
      if (locRaw) {
        const mapped = settings.locMap?.[U.key(locRaw) || locRaw.toLowerCase()];
        lokasi = U.norm(mapped?.lokasi ?? locRaw);
        tipe = tipe || mapped?.tipe || M.guessTipe(locRaw);
      } else {
        lokasi = U.norm(settings.defaultLokasi);
      }
      tipe = tipe || settings.defaultTipe || 'offline';
      if (!lokasi) errors.push('Lokasi kosong');
      const maxLok = ctx.maxLen?.lokasi;
      if (maxLok && lokasi.length > maxLok) errors.push(`Lokasi ${lokasi.length} karakter, batas portal ${maxLok}`);

      // Activity type
      let jenis = settings.jenis || null;
      const jenisRaw = U.norm(col(row, 'jenis'));
      if (jenisRaw && ctx.jenisOptions?.length) {
        const hit = M.matchJenis(jenisRaw, ctx.jenisOptions);
        if (hit) jenis = { value: hit.value, text: hit.text };
        else warnings.push(`Jenis "${jenisRaw}" tidak dikenali, memakai bawaan`);
      }
      if (!jenis?.value) errors.push('Jenis kegiatan belum dipilih');

      // Proof file: named in a column > matched by date in file name > default file
      let bukti = null;
      const buktiRaw = U.norm(col(row, 'bukti'));
      const files = ctx.buktiFiles || [];
      if (buktiRaw) {
        const base = U.key(buktiRaw.split(/[\\/]/).pop());
        const hit = files.find((f) => U.key(f.name) === base);
        if (hit) bukti = { kind: 'named', id: hit.id, name: hit.name };
      }
      if (!bukti && date) {
        const hit = files.find((f) => f.dates?.includes(date));
        if (hit) bukti = { kind: 'date', id: hit.id, name: hit.name };
      }
      if (!bukti && ctx.hasDefaultBukti) bukti = { kind: 'default', id: 'default', name: ctx.defaultBuktiName || 'bukti bawaan' };
      if (!bukti) errors.push(buktiRaw ? `File bukti "${buktiRaw}" belum dipilih` : 'File bukti belum dipilih');

      const entry = {
        id: `r${i}`,
        row: i,
        date,
        dateRaw: rawDate,
        start,
        end,
        hours: start && end && D.minutes(end) > D.minutes(start) ? (D.minutes(end) - D.minutes(start)) / 60 : 0,
        keterangan,
        lokasi,
        tipe,
        jenis,
        bukti,
        errors,
        warnings,
        flags: {},
        key: date ? M.entryKey(date, keterangan) : `row${i}`,
      };

      if (date && !errors.length) {
        const dup = M.checkExisting(entry, ctx.existing, ctx.history);
        if (dup === 'exists') entry.flags.exists = true;
        if (dup === 'date-exists') entry.flags.dateExists = true;
        if (ctx.period?.from && date < ctx.period.from) entry.flags.outOfPeriod = true;
        if (ctx.period?.to && date > ctx.period.to) entry.flags.outOfPeriod = true;
        if (ctx.today && date > ctx.today) entry.flags.future = true;
      }
      entry.status = M.baseStatus(entry);
      entries.push(entry);
    });
    return entries;
  };

  /** "invalid" | "exists" | "warn" | "ready" */
  M.baseStatus = (e) => {
    if (e.errors.length) return 'invalid';
    if (e.flags.exists) return 'exists';
    if (e.flags.dateExists || e.flags.outOfPeriod || e.flags.future) return 'warn';
    return 'ready';
  };
})(globalThis.ALB);
