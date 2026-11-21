/*
 * Auto Logbook IPB: the panel (native <dialog> inside a shadow root).
 */
(function (ALB) {
  'use strict';

  const U = ALB.util;
  const D = ALB.dates;
  const M = ALB.mapping;
  const T = ALB.tabular;
  const P = ALB.portal;
  const S = ALB.store;
  const F = ALB.files;
  const KEYS = S.KEYS;

  const DEFAULT_SETTINGS = {
    version: 1,
    columns: null,
    dateOrder: 'auto',
    template: null,
    defaultStart: '08:00',
    defaultEnd: '16:00',
    defaultTipe: 'offline',
    defaultLokasi: '',
    locMap: {},
    jenis: null,
    dosen: [],
    shrinkImages: true,
    truncate: false,
    delaySec: 1,
    lastHeaders: null,
  };

  const TABS = [
    { id: 'data', label: 'Data' },
    { id: 'settings', label: 'Pengaturan' },
    { id: 'send', label: 'Kirim' },
  ];

  const STATUS_LABEL = {
    ready: 'Siap',
    warn: 'Perlu dicek',
    exists: 'Sudah ada',
    invalid: 'Perlu diperbaiki',
    sending: 'Mengirim…',
    done: 'Terkirim',
    failed: 'Gagal',
  };

  // ---------------------------------------------------------------------------
  // Tiny DOM helpers

  const SVG_NS = 'http://www.w3.org/2000/svg';
  // Icons are kept to the few places where a glyph says more than a word.
  const ICONS = {
    x: 'M18 6 6 18M6 6l12 12',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    file: 'M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4zm0 0v4h4',
  };

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'i');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name] || '');
    svg.append(path);
    return svg;
  }

  /** h('button', { class: 'btn', onclick }, 'Label') */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    const late = {};
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'indeterminate') late[k] = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    for (const [k, v] of Object.entries(late)) el[k] = v;
    return el;
  }

  function banner(kind, content, actions) {
    return h('div', { class: `banner ${kind}`, role: kind === 'bad' ? 'alert' : null }, h('div', {}, content), actions ? h('div', { class: 'row' }, actions) : null);
  }

  /** Small status mark used in the summary counts and the Status column. */
  const dot = (kind) => h('span', { class: `dot ${kind}`, 'aria-hidden': 'true' });

  const fmtHours = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

  // The paste box is drawn as an empty sheet (see .sheet in styles.js).
  const SHEET_COLS = 'ABCDEFGHIJKL'.split('');
  const SHEET_ROWS = 6;

  // ---------------------------------------------------------------------------

  class Panel {
    constructor(ctx) {
      this.ctx = ctx;
      this.s = {
        tab: 'data',
        settings: structuredClone(DEFAULT_SETTINGS),
        data: null,
        dataError: null,
        map: {},
        order: { order: 'DMY', basis: 'none' },
        detectedOrder: { order: 'DMY', basis: 'none' },
        model: null,
        formError: null,
        index: null,
        indexError: null,
        loading: false,
        bukti: null,
        buktiError: null,
        buktiFiles: [],
        history: new Set(),
        sent: new Map(),
        runState: new Map(),
        picks: new Map(),
        filter: { from: '', to: '' },
        run: null,
        lastRun: null,
        notice: null,
        status: '',
        entries: [],
      };
      this.buktiRecord = null;
      this.defaultFile = null;
      this.thumbUrl = null;
      this.shrunk = new Map();
      this.baseline = null;
      this.refs = {};
      this.saveTimer = null;
      this.renderTimer = null;
      this.beforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = '';
      };
      this.ready = this.restore();
    }

    // -------------------------------------------------------------------------
    // State

    async restore() {
      const saved = await S.get(KEYS.settings, null);
      if (saved && saved.version === 1) this.s.settings = { ...structuredClone(DEFAULT_SETTINGS), ...saved };
      const rec = await S.get(KEYS.bukti, null);
      if (rec && rec.data) this.setBuktiRecord(rec);
      if (this.ctx.aktivitasId) {
        const hist = await S.get(KEYS.history, {});
        this.s.history = new Set(Object.keys(hist[this.ctx.aktivitasId] || {}));
      }
      const data = await S.get(KEYS.data, null);
      if (data && Array.isArray(data.headers) && Array.isArray(data.rows)) {
        this.setData(data, { restoring: true });
        if (!this.issues().length) this.s.tab = 'send';
        else this.s.tab = 'settings';
      }
      this.recompute();
      this.scheduleRender();
    }

    saveSettings() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => S.set(KEYS.settings, this.s.settings), 250);
    }

    setBuktiRecord(rec) {
      this.buktiRecord = rec;
      this.s.bukti = rec ? { name: rec.name, size: rec.size, type: rec.type } : null;
      this.defaultFile = null;
      if (this.thumbUrl) URL.revokeObjectURL(this.thumbUrl);
      this.thumbUrl = null;
    }

    setData(data, opts = {}) {
      const st = this.s.settings;
      this.s.data = data;
      this.s.map = M.resolveColumns(data.headers, data.rows, st.columns);
      const names = M.templateNames(st.template);
      if (!U.norm(st.template) || (names.length && M.templateUnknown(st.template, data.headers).length === names.length)) {
        st.template = M.defaultTemplate(data.headers, this.s.map);
      }
      st.columns = M.columnsToNames(data.headers, this.s.map);
      if (data.hasHeader || data.reusedHeaders) st.lastHeaders = data.headers.slice();
      this.syncLocations();
      this.detectOrder();
      if (!opts.restoring) {
        S.set(KEYS.data, data);
        this.saveSettings();
      }
    }

    syncLocations() {
      const { data, map, settings } = this.s;
      if (!data || map.lokasi == null) return;
      for (const v of M.distinctValues(data.rows, map.lokasi)) {
        if (!settings.locMap[v.key]) settings.locMap[v.key] = { tipe: M.guessTipe(v.value) || settings.defaultTipe, lokasi: v.value };
      }
    }

    detectOrder() {
      const { data, map, settings } = this.s;
      const values = data && map.tanggal != null ? data.rows.map((r) => r[map.tanggal]) : [];
      const det = D.detectOrder(values);
      this.s.detectedOrder = det;
      this.s.order = settings.dateOrder === 'auto' ? det : { order: settings.dateOrder, basis: 'manual' };
    }

    syncWithForm() {
      const { model, settings } = this.s;
      if (!model) return;
      const options = model.jenisOptions.filter((o) => o.value);
      let jenis =
        settings.jenis &&
        (options.find((o) => o.value === settings.jenis.value && U.key(o.text) === U.key(settings.jenis.text)) ||
          options.find((o) => U.key(o.text) === U.key(settings.jenis.text)));
      if (!jenis) jenis = options.find((o) => /kegiatan/i.test(o.text) && !/pembimbingan|ujian/i.test(o.text)) || options[0];
      settings.jenis = jenis ? { value: jenis.value, text: jenis.text } : null;
      const labels = model.dosen.map((d) => d.label);
      const keep = (settings.dosen || []).filter((l) => labels.some((x) => U.key(x) === U.key(l)));
      settings.dosen = keep.length ? keep : labels.slice(0, 1);
      const kinds = model.tipe.map((t) => t.kind);
      if (kinds.length && !kinds.includes(settings.defaultTipe)) settings.defaultTipe = kinds.includes('offline') ? 'offline' : kinds[0];
      this.saveSettings();
    }

    period() {
      const a = this.s.model && this.s.model.period;
      const b = this.s.index && this.s.index.period;
      if (!a && !b) return null;
      return { from: (a && a.from) || (b && b.from) || null, to: (a && a.to) || (b && b.to) || null };
    }

    recompute() {
      const { data, settings, model, index } = this.s;
      if (!data) {
        this.s.entries = [];
        return;
      }
      const entries = M.buildEntries({
        headers: data.headers,
        rows: data.rows,
        map: this.s.map,
        order: this.s.order.order,
        settings,
        jenisOptions: model ? model.jenisOptions.filter((o) => o.value) : null,
        maxLen: model ? model.maxLen : null,
        existing: index ? index.entries : null,
        history: this.s.history,
        buktiFiles: this.s.buktiFiles,
        hasDefaultBukti: Boolean(this.s.bukti),
        defaultBuktiName: this.s.bukti && this.s.bukti.name,
        period: this.period(),
        today: U.todayIso(),
      });
      for (const e of entries) {
        const sent = this.s.sent.get(e.key);
        if (sent) {
          e.status = 'done';
          e.result = sent;
          continue;
        }
        const rs = this.s.runState.get(e.key);
        if (rs) {
          e.status = rs.status;
          e.result = rs;
        }
      }
      this.s.entries = entries;
    }

    selectedDosen() {
      const model = this.s.model;
      const wanted = this.s.settings.dosen || [];
      if (!model) return wanted;
      return model.dosen.filter((d) => wanted.some((w) => U.key(w) === U.key(d.label))).map((d) => d.label);
    }

    inFilter(e) {
      const { from, to } = this.s.filter;
      if (!e.date) return !from && !to;
      return (!from || e.date >= from) && (!to || e.date <= to);
    }

    selectable(e) {
      return ['ready', 'warn', 'exists', 'failed'].includes(e.status);
    }

    isPicked(e) {
      if (!this.selectable(e)) return false;
      if (this.s.picks.has(e.key)) return this.s.picks.get(e.key);
      return e.status === 'ready' || e.status === 'failed';
    }

    queue() {
      return this.s.entries.filter((e) => this.inFilter(e) && this.isPicked(e));
    }

    issues() {
      const out = [];
      const { data, map, model, formError, settings } = this.s;
      if (!data) return out;
      if (map.tanggal == null) out.push('Pilih kolom Tanggal.');
      if (!U.norm(settings.template)) out.push('Isi template Keterangan.');
      if (this.ctx.kind === 'log') {
        if (formError) out.push('Formulir portal belum terbaca.');
        if (model) {
          if (model.missing.length) out.push(`Formulir portal tidak punya isian: ${model.missing.join(', ')}.`);
          if (!settings.jenis || !settings.jenis.value) out.push('Pilih Jenis Kegiatan.');
          if (model.dosen.length && !this.selectedDosen().length) out.push('Pilih minimal satu Dosen Penggerak.');
        }
      }
      if (!this.s.bukti && !this.s.buktiFiles.length) out.push('Pilih file bukti aktivitas.');
      return out;
    }

    counts(list) {
      const c = { ready: 0, warn: 0, exists: 0, invalid: 0, done: 0, failed: 0, sending: 0 };
      for (const e of list) c[e.status] = (c[e.status] || 0) + 1;
      return c;
    }

    // -------------------------------------------------------------------------
    // Portal

    async refreshPortal() {
      if (this.ctx.kind !== 'log' || this.s.loading) return;
      this.s.loading = true;
      this.scheduleRender();
      const [form, index] = await Promise.allSettled([P.loadForm(this.ctx), P.loadIndex(this.ctx)]);
      this.s.loading = false;
      if (form.status === 'fulfilled') {
        this.s.model = form.value;
        this.s.formError = null;
        this.syncWithForm();
      } else {
        this.s.model = null;
        this.s.formError = form.reason;
        console.warn('[Auto Logbook] form', form.reason);
      }
      if (index.status === 'fulfilled') {
        this.s.index = index.value;
        this.s.indexError = null;
        this.baseline = index.value.messages;
      } else {
        this.s.indexError = index.reason;
        console.warn('[Auto Logbook] index', index.reason);
      }
      const session = [form, index].some((r) => r.status === 'rejected' && r.reason && r.reason.code === 'session');
      this.s.notice = session ? { kind: 'bad', text: 'Sesi login Student Portal habis. Login lagi, lalu buka panel ini kembali.' } : null;
      this.recompute();
      this.render();
    }

    // -------------------------------------------------------------------------
    // Data input

    ingestRows(rawRows, meta) {
      const table = T.toTable(rawRows, this.s.settings.lastHeaders);
      if (!table || !table.rows.length) {
        this.s.dataError = 'Tidak ada baris data yang terbaca. Salin sel dari spreadsheet (bukan gambar atau teks PDF), lalu tempel lagi.';
        this.render();
        return;
      }
      this.s.dataError = null;
      this.s.picks.clear();
      this.s.runState.clear();
      this.s.lastRun = null;
      this.setData({
        headers: table.headers,
        rows: table.rows,
        hasHeader: table.hasHeader,
        reusedHeaders: table.reusedHeaders,
        source: meta.source,
        name: meta.name,
        at: Date.now(),
      });
      this.recompute();
      this.s.tab = this.issues().length ? 'settings' : 'send';
      this.flash(`${this.s.entries.length} entri terbaca dari ${meta.name}.`);
      this.render();
    }

    onPaste(e) {
      const cd = e.clipboardData;
      if (!cd) return;
      const text = cd.getData('text/plain');
      const html = cd.getData('text/html');
      if (!text && !html) return;
      e.preventDefault();
      this.ingestRows(T.fromClipboard(text, html), { source: 'paste', name: 'tempelan' });
    }

    async loadFile(file) {
      try {
        let rows;
        if (/\.xlsx$/i.test(file.name)) rows = await ALB.xlsx.read(await file.arrayBuffer());
        else if (/\.xls$/i.test(file.name)) throw new ALB.AlbError('xls', 'Format .xls lama belum didukung. Simpan ulang sebagai .xlsx atau CSV.');
        else rows = T.parseText(await file.text());
        this.ingestRows(rows, { source: 'file', name: file.name });
      } catch (err) {
        this.s.dataError = err.message || String(err);
        this.render();
      }
    }

    clearData() {
      this.s.data = null;
      this.s.entries = [];
      this.s.picks.clear();
      this.s.runState.clear();
      S.remove(KEYS.data);
      this.s.tab = 'data';
      this.render();
    }

    downloadTemplate() {
      const csv = T.toCsv([
        ['Tanggal', 'Jam Mulai', 'Jam Selesai', 'Keterangan', 'Lokasi', 'Tipe', 'Jenis', 'Bukti'],
        ['06/07/2026', '08:00', '16:00', 'Orientasi magang dan pengenalan tim', 'Kantor', 'Offline', 'Kegiatan', ''],
        ['07/07/2026', '08:00', '16:30', 'Menyusun rencana kerja magang', 'Rumah', 'Online', 'Kegiatan', ''],
      ]);
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const a = h('a', { href: url, download: 'template-logbook.csv' });
      this.root.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    // -------------------------------------------------------------------------
    // Bukti files

    async setDefaultBukti(file) {
      this.s.buktiError = null;
      try {
        if (this.s.model && this.s.model.accept && !F.accepts(file, this.s.model.accept)) {
          this.s.buktiError = `Portal hanya menerima: ${this.s.model.accept}`;
          this.render();
          return;
        }
        let f = file;
        // Shrink photos before storing: smaller uploads and room in extension storage.
        if (F.isImage(f) && (this.s.settings.shrinkImages || f.size > F.MAX_STORED_BYTES)) f = await F.shrinkImage(f);
        if (f.size > F.MAX_STORED_BYTES) {
          this.s.buktiError = `File terlalu besar (${U.formatBytes(f.size)}). Pilih file di bawah ${U.formatBytes(F.MAX_STORED_BYTES)}.`;
          this.render();
          return;
        }
        const rec = await F.toRecord(f);
        if (!(await S.set(KEYS.bukti, rec))) {
          this.s.buktiError = 'File bukti tidak bisa disimpan di browser (ruang penyimpanan ekstensi penuh). Coba file yang lebih kecil.';
          this.render();
          return;
        }
        this.setBuktiRecord(rec);
        this.flash(`File bukti bawaan: ${rec.name}`);
      } catch (err) {
        this.s.buktiError = err.message || String(err);
      }
      this.recompute();
      this.render();
    }

    async clearDefaultBukti() {
      await S.remove(KEYS.bukti);
      this.setBuktiRecord(null);
      this.recompute();
      this.render();
    }

    setBuktiFiles(files) {
      this.s.buktiFiles = [...files].map((file, i) => ({
        id: `f${i}`,
        name: file.name,
        size: file.size,
        type: file.type,
        dates: D.datesInFilename(file.name),
        file,
      }));
      this.recompute();
      this.render();
    }

    async fileFor(entry) {
      let file = null;
      if (entry.bukti && entry.bukti.kind === 'default') {
        if (!this.defaultFile && this.buktiRecord) this.defaultFile = F.fromRecord(this.buktiRecord);
        file = this.defaultFile;
      } else if (entry.bukti) {
        const hit = this.s.buktiFiles.find((f) => f.id === entry.bukti.id);
        file = hit && hit.file;
      }
      if (!file) throw new ALB.AlbError('bukti', 'File bukti tidak tersedia. Pilih ulang file bukti di Pengaturan.');
      if (this.s.settings.shrinkImages) {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (!this.shrunk.has(key)) this.shrunk.set(key, await F.shrinkImage(file));
        file = this.shrunk.get(key);
      }
      return file;
    }

    // -------------------------------------------------------------------------
    // Sending

    async sendOne(entry) {
      try {
        const file = await this.fileFor(entry);
        const model = await P.loadForm(this.ctx);
        const { fd } = P.buildPayload(model, entry, file, { dosen: this.s.settings.dosen });
        return await P.submit(model, fd, entry, this.baseline);
      } catch (err) {
        if (err && err.code === 'session') return { ok: false, session: true, message: err.message };
        return { ok: false, message: (err && err.message) || String(err) };
      }
    }

    async remember(entry) {
      this.s.history.add(entry.key);
      const all = await S.get(KEYS.history, {});
      const mine = all[this.ctx.aktivitasId] || (all[this.ctx.aktivitasId] = {});
      mine[entry.key] = Date.now();
      await S.set(KEYS.history, all);
    }

    async startRun(limit) {
      if (this.s.run || this.issues().length) return;
      const queue = this.queue().slice(0, limit || undefined);
      if (!queue.length) return;
      this.s.run = { total: queue.length, done: 0, failed: 0, stopping: false, streak: 0 };
      this.s.lastRun = null;
      this.s.notice = null;
      window.addEventListener('beforeunload', this.beforeUnload);
      this.render();
      const delay = Math.max(0, Number(this.s.settings.delaySec) || 0) * 1000;
      let stoppedBy = null;
      try {
        for (let i = 0; i < queue.length; i++) {
          const entry = queue[i];
          if (this.s.run.stopping) {
            stoppedBy = 'user';
            break;
          }
          this.s.runState.set(entry.key, { status: 'sending' });
          this.recompute();
          this.render();

          const result = await this.sendOne(entry);
          this.lastSubmit = result.debug || { error: result.message };
          if (result.ok) {
            this.s.sent.set(entry.key, { verified: result.verified, message: result.message, uncertain: result.uncertain });
            this.s.runState.delete(entry.key);
            this.s.run.done++;
            this.s.run.streak = 0;
            if (result.index && result.index.tableFound) {
              this.s.index = { ...result.index, info: (this.s.index && this.s.index.info) || result.index.info, period: (this.s.index && this.s.index.period) || result.index.period };
            }
            await this.remember(entry);
          } else {
            this.s.runState.set(entry.key, { status: 'failed', message: result.message });
            this.s.run.failed++;
            this.s.run.streak++;
            if (result.session) {
              this.s.notice = { kind: 'bad', text: result.message };
              stoppedBy = 'session';
              break;
            }
            if (this.s.run.streak >= 3) {
              this.s.notice = { kind: 'bad', text: 'Pengiriman dihentikan setelah 3 kegagalan berturut-turut. Baca pesan di kolom Status, perbaiki, lalu kirim lagi.' };
              stoppedBy = 'errors';
              break;
            }
          }
          this.recompute();
          this.render();
          if (i < queue.length - 1 && delay && !this.s.run.stopping) await U.sleep(delay);
        }
      } finally {
        const { done, failed, total } = this.s.run;
        this.s.run = null;
        this.s.lastRun = { done, failed, total, stoppedBy };
        window.removeEventListener('beforeunload', this.beforeUnload);
        this.flash(`Selesai: ${done} terkirim${failed ? `, ${failed} gagal` : ''}${stoppedBy === 'user' ? ' (dihentikan)' : ''}.`);
        this.recompute();
        this.render();
      }
    }

    stopRun() {
      if (this.s.run) {
        this.s.run.stopping = true;
        this.flash('Menghentikan setelah entri yang sedang dikirim…');
        this.render();
      }
    }

    // -------------------------------------------------------------------------
    // Payload preview and diagnostics

    async previewPayload() {
      const entry = this.queue()[0];
      if (!entry) return;
      const body = this.refs.subBody;
      this.refs.subTitle.textContent = `Data kiriman · ${D.human(entry.date)}`;
      body.replaceChildren(h('div', { class: 'row' }, h('span', { class: 'spin' }), 'Membaca formulir portal…'));
      this.sub.showModal();
      try {
        const file = await this.fileFor(entry);
        const model = await P.loadForm(this.ctx);
        const { preview } = P.buildPayload(model, entry, file, { dosen: this.s.settings.dosen });
        body.replaceChildren(
          h('p', { class: 'hint' }, 'Ini isian yang akan dikirim untuk entri pertama yang dipilih, persis seperti formulir "Tambah Log Aktivitas". Belum ada yang dikirim.'),
          h(
            'div',
            { class: 'table-wrap', style: 'margin-top:12px' },
            h(
              'table',
              { class: 't preview-table' },
              h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Nama isian'), h('th', { scope: 'col' }, 'Nilai'))),
              h('tbody', {}, preview.map((p) => h('tr', {}, h('td', { class: 'nowrap' }, h('code', {}, p.name)), h('td', {}, p.value)))),
            ),
          ),
        );
      } catch (err) {
        body.replaceChildren(banner('bad', (err && err.message) || String(err)));
      }
    }

    async copyDiagnostics() {
      const info = P.diagnostics({ ctx: this.ctx, model: this.s.model, formError: this.s.formError, index: this.s.index, indexError: this.s.indexError, lastSubmit: this.lastSubmit });
      const text = JSON.stringify(info, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        this.flash('Info teknis disalin. Tempelkan saat melaporkan masalah.');
        this.render();
      } catch {
        this.refs.subTitle.textContent = 'Info teknis';
        this.refs.subBody.replaceChildren(
          h('p', { class: 'hint' }, 'Salin teks ini saat melaporkan masalah. Tidak berisi token atau data pribadi.'),
          h('textarea', { class: 'mono', rows: 16, readonly: true, style: 'margin-top:10px;font-size:12px', value: text }),
        );
        this.sub.showModal();
      }
    }

    async clearHistory() {
      const all = await S.get(KEYS.history, {});
      delete all[this.ctx.aktivitasId];
      await S.set(KEYS.history, all);
      this.s.history = new Set();
      this.recompute();
      this.flash('Riwayat kiriman untuk kegiatan ini dihapus.');
      this.render();
    }

    async resetSettings() {
      this.s.settings = structuredClone(DEFAULT_SETTINGS);
      await S.set(KEYS.settings, this.s.settings);
      if (this.s.data) this.setData(this.s.data, { restoring: true });
      this.syncWithForm();
      this.recompute();
      this.flash('Pengaturan dikembalikan ke bawaan.');
      this.render();
    }

    // -------------------------------------------------------------------------
    // Shell

    mount() {
      if (this.host) return;
      this.host = document.createElement('alb-root');
      this.root = this.host.attachShadow({ mode: 'open' });
      this.root.append(h('style', {}, ALB.styles.panel));

      this.refs.sub = h('p', { class: 'head-sub' });
      this.refs.close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup panel', onclick: () => this.close() }, icon('x'));
      this.refs.tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Langkah' });
      this.refs.body = h('div', { class: 'body', role: 'tabpanel', id: 'alb-body', tabindex: '-1' });
      this.refs.status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
      this.refs.actions = h('div', { class: 'actions' });

      this.dialog = h(
        'dialog',
        // Outside a log page the panel only shows a short message or list, so it sizes to fit.
        { class: this.ctx.kind === 'log' ? 'alb' : 'alb compact', 'aria-labelledby': 'alb-title' },
        h(
          'header',
          { class: 'head' },
          h('div', { class: 'head-main' }, h('h2', { class: 'title', id: 'alb-title' }, 'Auto Logbook'), this.refs.sub),
          this.refs.close,
        ),
        this.refs.tabs,
        this.refs.body,
        h('footer', { class: 'foot' }, this.refs.status, this.refs.actions),
      );
      this.dialog.addEventListener('paste', (e) => {
        if (this.s.tab === 'data' && !this.s.run) this.onPaste(e);
      });
      this.dialog.addEventListener('close', () => {
        if (this.sub.open) this.sub.close();
        this.updateLauncher();
      });

      this.refs.subTitle = h('h2', { class: 'title', id: 'alb-sub-title' }, '');
      this.refs.subBody = h('div', { class: 'body' });
      this.sub = h(
        'dialog',
        { class: 'alb sub', 'aria-labelledby': 'alb-sub-title' },
        h('header', { class: 'head' }, h('div', { class: 'head-main' }, this.refs.subTitle), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Tutup', onclick: () => this.sub.close() }, icon('x'))),
        this.refs.subBody,
        h('footer', { class: 'foot' }, h('div', { class: 'status' }), h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => this.sub.close() }, 'Tutup'))),
      );

      this.root.append(this.dialog, this.sub);
      document.documentElement.append(this.host);
    }

    open() {
      this.mount();
      // A Bootstrap modal that is still open would fight for focus.
      for (const btn of document.querySelectorAll('.modal.show [data-dismiss="modal"], .modal.show [data-bs-dismiss="modal"]')) btn.click();
      if (!this.dialog.open) {
        // Render first so showModal() can focus the step's autofocus control.
        this.render({ force: true });
        this.dialog.showModal();
      } else this.render();
      if (this.ctx.kind === 'log' && !this.s.model && !this.s.loading) this.refreshPortal();
    }

    /** Short-lived footer message. */
    flash(text) {
      this.s.status = text;
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => {
        this.s.status = '';
        this.renderFoot();
      }, 6000);
    }

    close() {
      if (this.dialog && this.dialog.open) this.dialog.close();
    }

    toggle() {
      if (this.dialog && this.dialog.open) this.close();
      else this.open();
    }

    goTab(id) {
      this.s.tab = id;
      this.render();
      this.refs.body.scrollTop = 0;
    }

    scheduleRender() {
      clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(() => this.render(), 0);
    }

    render({ force = false } = {}) {
      clearTimeout(this.renderTimer);
      this.updateLauncher();
      if (!this.dialog || (!this.dialog.open && !force)) return;
      const active = this.root.activeElement;
      const fk = active && active.dataset ? active.dataset.fk : null;
      const bodyScroll = this.refs.body.scrollTop;
      const wrap = this.root.querySelector('.table-wrap');
      const tableScroll = wrap ? [wrap.scrollTop, wrap.scrollLeft] : null;

      this.renderHead();
      this.renderTabs();
      this.renderBody();
      this.renderFoot();

      this.refs.body.scrollTop = bodyScroll;
      const wrap2 = this.root.querySelector('.table-wrap');
      if (wrap2 && tableScroll) [wrap2.scrollTop, wrap2.scrollLeft] = tableScroll;
      if (fk) {
        const again = this.root.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
        if (again && again !== this.root.activeElement) again.focus({ preventScroll: true });
      }
    }

    updateLauncher() {
      const btn = this.launcher;
      if (!btn) return;
      const label = btn.querySelector('.alb-launch-label') || btn;
      if (this.s.run) label.textContent = `Mengirim ${this.s.run.done + this.s.run.failed}/${this.s.run.total}…`;
      else label.textContent = btn.dataset.idleLabel || 'Isi Otomatis';
    }

    renderHead() {
      const info = (this.s.index && this.s.index.info) || {};
      const parts = [];
      if (this.ctx.kind === 'log') {
        parts.push(info.nama || 'Log Aktivitas');
        const p = this.period();
        if (p && p.from && p.to) parts.push(`${D.human(p.from, false)} – ${D.human(p.to, false)}`);
        if (this.s.index && this.s.index.tableFound) parts.push(`${this.s.index.entries.length} log di portal`);
      } else parts.push('Pengisi Log Aktivitas');
      this.refs.sub.textContent = parts.join(' · ');
    }

    tabBadge(id) {
      const { data, entries } = this.s;
      if (id === 'data') return data ? { text: `${entries.length} entri`, kind: '' } : null;
      if (id === 'settings') {
        if (!data) return null;
        const n = this.issues().length;
        return n ? { text: `${n} perlu diisi`, kind: 'warn' } : { text: 'Lengkap', kind: 'ok' };
      }
      if (id === 'send') {
        if (!data) return null;
        const c = this.counts(entries.filter((e) => this.inFilter(e)));
        if (c.done && !c.ready && !c.failed) return { text: `${c.done} terkirim`, kind: 'ok' };
        return { text: `${this.queue().length} dipilih`, kind: '' };
      }
      return null;
    }

    renderTabs() {
      if (this.ctx.kind !== 'log') {
        this.refs.tabs.hidden = true;
        return;
      }
      this.refs.tabs.hidden = false;
      const done = { data: Boolean(this.s.data), settings: Boolean(this.s.data) && !this.issues().length, send: false };
      this.refs.tabs.replaceChildren(
        ...TABS.map((t, i) => {
          const selected = this.s.tab === t.id;
          const badge = this.tabBadge(t.id);
          return h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: 'tab',
              id: `alb-tab-${t.id}`,
              'aria-selected': selected ? 'true' : 'false',
              'aria-controls': 'alb-body',
              tabindex: selected ? '0' : '-1',
              // Start keyboard focus on the current step (never on a send button).
              autofocus: selected && t.id !== 'data' ? true : null,
              'data-fk': `tab-${t.id}`,
              onclick: () => this.goTab(t.id),
              onkeydown: (e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
                this.goTab(next.id);
                this.root.getElementById(`alb-tab-${next.id}`).focus();
              },
            },
            h('span', { class: `step${done[t.id] && !selected ? ' done' : ''}` }, done[t.id] && !selected ? icon('check') : String(i + 1)),
            t.label,
            badge ? h('span', { class: `badge ${badge.kind}` }, badge.text) : null,
          );
        }),
      );
      this.refs.body.setAttribute('aria-labelledby', `alb-tab-${this.s.tab}`);
    }

    renderBody() {
      const body = this.refs.body;
      body.classList.toggle('fill', this.ctx.kind === 'log' && this.s.tab === 'send' && Boolean(this.s.data));
      let content;
      if (this.ctx.kind === 'list') content = this.viewList();
      else if (this.ctx.kind !== 'log') content = this.viewOther();
      else if (this.s.tab === 'data') content = this.viewData();
      else if (this.s.tab === 'settings') content = this.viewSettings();
      else content = this.viewSend();
      body.replaceChildren(...[].concat(content));
    }

    // -------------------------------------------------------------------------
    // Views: other portal pages

    viewList() {
      const links = this.ctx.logLinks || [];
      const go = (href) => {
        S.set(KEYS.openRequest, Date.now());
        location.href = href;
      };
      return h(
        'div',
        { class: 'stack' },
        h('section', { class: 'card', 'aria-labelledby': 'alb-pick' },
          h('div', { class: 'card-head' }, h('div', {}, h('h3', { id: 'alb-pick' }, 'Pilih kegiatan'), h('p', { class: 'hint' }, 'Auto Logbook bekerja di halaman Log Aktivitas sebuah kegiatan. Pilih kegiatan yang logbook-nya ingin diisi.'))),
          links.length
            ? h('div', { class: 'link-list' }, links.map((l, i) => h('button', { type: 'button', class: 'link-item', autofocus: i === 0 ? true : null, onclick: () => go(l.href) }, h('span', { class: 'link-text' }, l.text || 'Log Aktivitas'), h('span', { class: 'link-go' }, 'Buka log'))))
            : banner('info', 'Tidak ada tautan Log di halaman ini. Klik tombol "Log" pada kegiatan Anda, lalu buka Auto Logbook lagi.'),
        ),
      );
    }

    viewOther() {
      return h(
        'div',
        { class: 'empty' },
        h('h3', {}, 'Buka halaman Log Aktivitas'),
        h('p', { class: 'hint' }, 'Buka menu Kemahasiswaan › Aktivitas, klik "Log" pada kegiatan Anda, lalu buka Auto Logbook dari tombol "Isi Otomatis".'),
        h('button', {
          type: 'button',
          class: 'btn btn-primary',
          onclick: () => {
            S.set(KEYS.openRequest, Date.now());
            location.href = `${location.origin}/Kegiatan/AktivitasKampusMerdeka`;
          },
        }, 'Buka daftar Aktivitas'),
      );
    }

    // -------------------------------------------------------------------------
    // Step 1: data

    viewData() {
      const { data, dataError } = this.s;
      const fileInput = h('input', {
        type: 'file',
        accept: '.csv,.tsv,.txt,.xlsx',
        hidden: true,
        onchange: (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) this.loadFile(f);
        },
      });
      const paste = h('textarea', {
        class: 'paste',
        rows: SHEET_ROWS,
        'data-fk': 'paste',
        placeholder: 'Klik di sini, lalu tekan Ctrl+V',
        'aria-label': 'Tempel data logbook di sini',
        autofocus: true,
        onpaste: (e) => {
          e.stopPropagation();
          this.onPaste(e);
        },
        onkeydown: (e) => {
          // Typing is not supported; only pasting.
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) e.preventDefault();
        },
      });
      const drop = h(
        'section',
        {
          class: 'drop',
          'aria-labelledby': 'alb-paste-title',
          ondragover: (e) => {
            e.preventDefault();
            drop.classList.add('over');
          },
          ondragleave: () => drop.classList.remove('over'),
          ondrop: (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) this.loadFile(f);
          },
        },
        h('h3', { id: 'alb-paste-title' }, data ? 'Tempel data baru' : 'Tempel data logbook'),
        h('p', { class: 'hint' },
          'Di Google Sheets atau Excel, blok baris logbook (boleh beserta baris judul kolom) dan salin dengan ', h('kbd', {}, 'Ctrl+C'),
          '. Lalu klik kotak di bawah dan tekan ', h('kbd', {}, 'Ctrl+V'), '.'),
        h('div', { class: 'sheet' },
          h('div', { class: 'sheet-cols', 'aria-hidden': 'true' }, h('span'), SHEET_COLS.map((c) => h('span', {}, c))),
          h('div', { class: 'sheet-rows', 'aria-hidden': 'true' }, Array.from({ length: SHEET_ROWS }, (_, i) => h('span', {}, String(i + 1)))),
          paste),
        h('div', { class: 'drop-actions' },
          h('button', { type: 'button', class: 'btn btn-secondary', 'data-fk': 'pick-file', onclick: () => fileInput.click() }, 'Pilih file CSV / Excel'),
          h('span', { class: 'hint' }, 'atau seret file ke kotak di atas.'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-link', onclick: () => this.downloadTemplate() }, 'Unduh template CSV')),
        fileInput,
      );

      const out = [];
      if (dataError) out.push(banner('bad', dataError));
      out.push(drop);
      if (data) out.push(this.viewDataSummary());
      else {
        out.push(h('p', { class: 'fine' },
          'Tidak ada yang dikirim sebelum Anda menekan Kirim. Data diproses di browser ini dan hanya dikirim ke Student Portal IPB; kata sandi Anda tidak pernah dibaca.'));
      }
      return h('div', { class: 'stack' }, out);
    }

    viewDataSummary() {
      const { data, entries } = this.s;
      const when = new Date(data.at || Date.now());
      const whenText = `${D.human(U.todayIso(when), false)}, ${U.pad2(when.getHours())}.${U.pad2(when.getMinutes())}`;
      const cols = data.headers.length;
      const shown = Math.min(cols, 7);
      const rows = data.rows.slice(0, 5);
      const note = data.hasHeader
        ? null
        : data.reusedHeaders
          ? 'Baris judul kolom tidak ikut tersalin, jadi judul kolom dari data sebelumnya dipakai.'
          : 'Baris judul kolom tidak ditemukan. Kolom diberi nama Kolom A, B, C…';
      return h(
        'section',
        { class: 'card summary', 'aria-labelledby': 'alb-sum-title' },
        h('div', { class: 'card-head' },
          h('div', {},
            h('h3', { id: 'alb-sum-title' }, `${entries.length} entri terbaca`),
            h('p', { class: 'hint' }, `${data.rows.length} baris · ${cols} kolom · dari ${data.name} · ${whenText}`)),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => this.clearData() }, 'Hapus data')),
        note ? banner('info', note) : null,
        h('div', { class: 'table-wrap', style: note ? 'margin-top:12px' : null, tabindex: '0', role: 'region', 'aria-label': 'Cuplikan data' },
          h('table', { class: 't sheet-t' },
            h('thead', {}, h('tr', {}, data.headers.slice(0, shown).map((hd) => h('th', { scope: 'col' }, hd)), cols > shown ? h('th', { scope: 'col' }, `+${cols - shown} kolom`) : null)),
            h('tbody', {}, rows.map((r) => h('tr', {}, r.slice(0, shown).map((c) => h('td', {}, h('div', { class: 'cell-clip', title: c }, U.norm(c)))), cols > shown ? h('td', {}, '') : null))))),
      );
    }

    // -------------------------------------------------------------------------
    // Step 2: settings

    viewSettings() {
      if (!this.s.data) return this.viewNeedData();
      const out = [];
      if (this.s.notice) out.push(banner(this.s.notice.kind, this.s.notice.text));
      out.push(this.cardColumns(), this.cardTemplate(), this.cardPortal(), this.cardLocations(), this.cardBukti(), this.cardAdvanced());
      return h('div', { class: 'stack settings' }, out);
    }

    viewNeedData() {
      return h('div', { class: 'empty' },
        h('h3', {}, 'Belum ada data'),
        h('p', { class: 'hint' }, 'Tempel baris logbook dari Google Sheets atau Excel terlebih dahulu.'),
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => this.goTab('data') }, 'Ke langkah Data'));
    }

    setColumn(field, value) {
      const { data, settings } = this.s;
      if (value === '') delete this.s.map[field];
      else this.s.map[field] = Number(value);
      settings.columns = M.columnsToNames(data.headers, this.s.map);
      if (field === 'lokasi') this.syncLocations();
      if (field === 'tanggal') this.detectOrder();
      this.saveSettings();
      this.recompute();
      this.scheduleRender();
    }

    cardColumns() {
      const { data, map, settings, detectedOrder } = this.s;
      const stats = data.headers.map((_, c) => {
        const v = data.rows.map((r) => U.norm(r[c])).find(Boolean);
        return v ? U.truncate(v.replace(/\n/g, ' '), 22) : '';
      });
      const select = (field, label, required, help) =>
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true' }, '*') : null),
          h('select', {
            'data-fk': `col-${field}`,
            required: required || null,
            value: map[field] != null ? String(map[field]) : '',
            onchange: (e) => this.setColumn(field, e.target.value),
          },
          h('option', { value: '' }, required ? '— Pilih kolom —' : '— Tidak dipakai —'),
          data.headers.map((hd, i) => h('option', { value: String(i) }, stats[i] ? `${hd}  ·  ${stats[i]}` : hd))),
          help ? h('span', { class: 'hint small' }, help) : null);

      const orderText = {
        certain: 'Terdeteksi dari data.',
        guess: 'Ditebak dari urutan tanggal; ubah bila keliru.',
        conflict: 'Data memakai dua format sekaligus; periksa tanggalnya.',
        default: 'Tidak bisa dipastikan; pilih manual bila keliru.',
        none: 'Tanggal di data memakai nama bulan, jadi tidak ambigu.',
      }[detectedOrder.basis];
      const orderName = detectedOrder.order === 'MDY' ? 'Bulan/Hari/Tahun' : 'Hari/Bulan/Tahun';

      return h('section', { class: 'card', 'aria-labelledby': 'alb-c1' },
        h('div', { class: 'card-head' }, h('div', {}, h('h3', { id: 'alb-c1' }, 'Kolom dari data'), h('p', { class: 'hint' }, 'Sudah diisi otomatis dari judul kolom. Ubah bila ada yang keliru.'))),
        h('div', { class: 'grid' },
          select('tanggal', 'Tanggal', true),
          select('mulai', 'Jam mulai', false),
          select('selesai', 'Jam selesai', false),
          select('jam', 'Jam (rentang, mis. 08.00-16.00)', false),
          select('lokasi', 'Lokasi', false, 'Dipakai juga untuk menebak tipe Offline/Online.'),
          select('tipe', 'Tipe penyelenggaraan', false),
          select('jenis', 'Jenis kegiatan', false),
          select('bukti', 'Nama file bukti', false),
          h('label', { class: 'field' },
            h('span', { class: 'lbl' }, 'Format tanggal'),
            h('select', {
              'data-fk': 'date-order',
              value: settings.dateOrder,
              onchange: (e) => {
                settings.dateOrder = e.target.value;
                this.detectOrder();
                this.saveSettings();
                this.recompute();
                this.scheduleRender();
              },
            },
            h('option', { value: 'auto' }, `Otomatis · ${orderName}`),
            h('option', { value: 'DMY' }, 'Hari/Bulan/Tahun (6/7 = 6 Juli)'),
            h('option', { value: 'MDY' }, 'Bulan/Hari/Tahun (7/6 = 6 Juli)')),
            h('span', { class: `hint small${detectedOrder.basis === 'conflict' ? ' msg warn' : ''}` }, settings.dateOrder === 'auto' ? orderText : 'Dipilih manual.')),
          h('div', { class: 'field' },
            h('span', { class: 'lbl' }, 'Jam bawaan'),
            h('div', { class: 'time-pair' },
              h('input', { type: 'time', 'aria-label': 'Jam mulai bawaan', 'data-fk': 'def-start', value: settings.defaultStart || '', onchange: (e) => this.setSetting('defaultStart', e.target.value) }),
              h('span', { class: 'muted', 'aria-hidden': 'true' }, '–'),
              h('input', { type: 'time', 'aria-label': 'Jam selesai bawaan', 'data-fk': 'def-end', value: settings.defaultEnd || '', onchange: (e) => this.setSetting('defaultEnd', e.target.value) })),
            h('span', { class: 'hint small' }, 'Dipakai bila sel jam kosong.'))),
      );
    }

    setSetting(key, value) {
      this.s.settings[key] = value;
      this.saveSettings();
      this.recompute();
      this.scheduleRender();
    }

    cardTemplate() {
      const { data, settings, model, entries } = this.s;
      const max = model && model.maxLen && model.maxLen.keterangan;
      const ta = h('textarea', {
        class: 'mono',
        rows: 3,
        'data-fk': 'template',
        'aria-describedby': 'alb-tpl-help',
        value: settings.template || '',
        oninput: (e) => {
          settings.template = e.target.value;
          this.saveSettings();
          this.recompute();
          this.updateLive();
        },
      });
      const insert = (text) => {
        ta.focus();
        ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      };
      this.refs.example = h('div', { class: 'example' });
      this.refs.tplWarn = h('div', {});
      this.fillTemplateLive(entries);
      return h('section', { class: 'card', 'aria-labelledby': 'alb-c2' },
        h('div', { class: 'card-head' }, h('div', {},
          h('h3', { id: 'alb-c2' }, 'Keterangan (Topik)'),
          h('p', { class: 'hint', id: 'alb-tpl-help' }, 'Isi kolom Keterangan di portal. Tulis {Nama Kolom} untuk mengambil isi kolom; boleh digabung dengan teks lain.', max ? ` Batas portal ${max} karakter.` : ''))),
        ta,
        h('div', { class: 'tokens', role: 'group', 'aria-labelledby': 'alb-tok' },
          h('span', { class: 'hint small', id: 'alb-tok' }, 'Sisipkan kolom:'),
          data.headers.map((hd) => h('button', { type: 'button', class: 'token', onclick: () => insert(`{${hd}}`) }, `{${hd}}`))),
        this.refs.tplWarn,
        h('div', {}, h('div', { class: 'example-label' }, 'Hasil untuk entri pertama'), this.refs.example),
      );
    }

    fillTemplateLive(entries) {
      if (!this.refs.example) return;
      const first = entries.find((e) => e.keterangan);
      this.refs.example.textContent = first ? first.keterangan : '(kosong)';
      const unknown = this.s.data ? M.templateUnknown(this.s.settings.template, this.s.data.headers) : [];
      this.refs.tplWarn.replaceChildren(unknown.length ? banner('warn', `Kolom tidak ditemukan: ${unknown.map((n) => `{${n}}`).join(', ')}`) : '');
    }

    /** Cheap refresh while typing in the template: no full re-render. */
    updateLive() {
      this.fillTemplateLive(this.s.entries);
      this.renderTabs();
      this.renderFoot();
    }

    cardPortal() {
      const { model, formError, loading, settings } = this.s;
      const head = h('div', { class: 'card-head' },
        h('div', {}, h('h3', { id: 'alb-c3' }, 'Isian dari formulir portal'), h('p', { class: 'hint' }, 'Pilihan ini dibaca langsung dari formulir "Tambah Log Aktivitas" Anda.')),
        h('button', { type: 'button', class: 'btn btn-sm btn-link', disabled: loading || Boolean(this.s.run), onclick: () => this.refreshPortal() }, 'Muat ulang formulir'));
      const card = h('section', { class: 'card', 'aria-labelledby': 'alb-c3' }, head);
      if (loading) {
        card.append(h('div', { class: 'row muted' }, h('span', { class: 'spin' }), 'Membaca formulir dari Student Portal…'));
        return card;
      }
      if (formError) {
        card.append(banner('bad', h('div', {}, h('strong', {}, 'Formulir portal belum terbaca. '), formError.message), [
          h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => this.refreshPortal() }, 'Coba lagi'),
          h('button', { type: 'button', class: 'btn btn-sm btn-link', onclick: () => this.copyDiagnostics() }, 'Salin info teknis'),
        ]));
        return card;
      }
      if (!model) {
        card.append(h('p', { class: 'hint' }, 'Formulir akan dibaca saat panel dibuka di halaman Log Aktivitas.'));
        return card;
      }
      const options = model.jenisOptions.filter((o) => o.value);
      card.append(
        h('div', { class: 'grid two' },
          h('label', { class: 'field' },
            h('span', { class: 'lbl' }, 'Jenis Kegiatan', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')),
            h('select', {
              'data-fk': 'jenis',
              value: settings.jenis ? settings.jenis.value : '',
              onchange: (e) => {
                const o = options.find((x) => x.value === e.target.value);
                this.setSetting('jenis', o ? { value: o.value, text: o.text } : null);
              },
            }, options.map((o) => h('option', { value: o.value }, o.text))),
            h('span', { class: 'hint small' }, 'Dipakai untuk semua entri, kecuali kolom Jenis kegiatan dipetakan.')),
          model.dosen.length
            ? h('fieldset', { class: 'field' },
              h('legend', { class: 'lbl' }, 'Dosen Penggerak', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')),
              model.dosen.map((d, i) =>
                h('label', { class: 'check' },
                  h('input', {
                    type: 'checkbox',
                    'data-fk': `dosen-${i}`,
                    checked: (settings.dosen || []).some((x) => U.key(x) === U.key(d.label)),
                    onchange: (e) => {
                      const list = (settings.dosen || []).filter((x) => U.key(x) !== U.key(d.label));
                      if (e.target.checked) list.push(d.label);
                      this.setSetting('dosen', list);
                    },
                  }),
                  h('span', {}, d.label))))
            : null),
      );
      const facts = [`Tanggal dikirim sebagai ${model.dateFormat.replace('DD', 'HH').replace('MM', 'BB').replace('YYYY', 'TTTT')}`];
      const p = this.period();
      if (p && (p.from || p.to)) facts.push(`periode kegiatan ${p.from ? D.human(p.from, false) : '…'} – ${p.to ? D.human(p.to, false) : '…'}`);
      if (model.accept) facts.push(`bukti: ${model.accept}`);
      card.append(h('p', { class: 'hint' }, `${facts.join(' · ')}.`));
      if (model.missing.length) card.append(banner('bad', `Isian ini tidak ditemukan di formulir portal: ${model.missing.join(', ')}. Salin info teknis dan laporkan.`, [h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => this.copyDiagnostics() }, 'Salin info teknis')]));
      if (model.unknownRequired.length) card.append(banner('warn', `Formulir portal punya isian wajib yang belum dikenali: ${model.unknownRequired.join(', ')}. Kirim 1 entri dulu untuk memastikan.`));
      if (this.s.indexError) card.append(banner('warn', `Daftar log di portal tidak terbaca (${this.s.indexError.message}). Pengecekan duplikat hanya memakai riwayat ekstensi.`));
      else if (this.s.index && !this.s.index.tableFound) card.append(banner('info', 'Tabel log di portal tidak dikenali. Pengecekan duplikat hanya memakai riwayat ekstensi.'));
      return card;
    }

    cardLocations() {
      const { data, map, settings, model } = this.s;
      const kinds = model && model.tipe.length ? model.tipe.map((t) => t.kind).filter(Boolean) : ['offline', 'online', 'hybrid'];
      const tipeSelect = (value, onchange, fk, label) =>
        h('select', { 'data-fk': fk, 'aria-label': label, value, onchange: (e) => onchange(e.target.value) }, kinds.map((k) => h('option', { value: k }, M.TIPE_LABEL[k])));
      const card = h('section', { class: 'card', 'aria-labelledby': 'alb-c4' },
        h('div', { class: 'card-head' }, h('div', {},
          h('h3', { id: 'alb-c4' }, 'Lokasi dan tipe penyelenggaraan'),
          h('p', { class: 'hint' }, map.lokasi != null ? `Atur sekali untuk setiap nilai di kolom ${data.headers[map.lokasi]}.` : 'Kolom lokasi tidak dipakai, jadi nilai ini berlaku untuk semua entri.'))));

      if (map.lokasi != null) {
        const values = M.distinctValues(data.rows, map.lokasi);
        card.append(h('div', { class: 'table-wrap' },
          h('table', { class: 't form-t' },
            h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Nilai di data'), h('th', { scope: 'col' }, 'Jumlah'), h('th', { scope: 'col' }, 'Tipe'), h('th', { scope: 'col' }, 'Lokasi yang dikirim'))),
            h('tbody', {}, values.map((v, i) => {
              const cur = settings.locMap[v.key] || { tipe: settings.defaultTipe, lokasi: v.value };
              const update = (patch) => {
                settings.locMap[v.key] = { ...cur, ...patch };
                this.saveSettings();
                this.recompute();
                this.scheduleRender();
              };
              return h('tr', {},
                h('th', { scope: 'row', class: 'rowhead' }, v.value),
                h('td', { class: 'nowrap' }, `${v.count}×`),
                h('td', { style: 'min-width:130px' }, tipeSelect(cur.tipe, (t) => update({ tipe: t }), `loc-tipe-${i}`, `Tipe untuk ${v.value}`)),
                h('td', { style: 'min-width:240px' }, h('input', { type: 'text', 'data-fk': `loc-text-${i}`, 'aria-label': `Lokasi untuk ${v.value}`, value: cur.lokasi, onchange: (e) => update({ lokasi: e.target.value }) })));
            })))));
        if (map.tipe != null) card.append(h('p', { class: 'hint' }, `Bila kolom ${data.headers[map.tipe]} terisi, tipe diambil dari kolom itu.`));
      } else {
        card.append(h('div', { class: 'grid two' },
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Tipe penyelenggaraan'), tipeSelect(settings.defaultTipe, (t) => this.setSetting('defaultTipe', t), 'def-tipe', 'Tipe penyelenggaraan')),
          h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Lokasi', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')),
            h('input', { type: 'text', 'data-fk': 'def-lokasi', placeholder: 'mis. Kantor PT Maju Jaya, Bogor', value: settings.defaultLokasi || '', onchange: (e) => this.setSetting('defaultLokasi', e.target.value) }))));
      }
      return card;
    }

    cardBukti() {
      const { bukti, buktiFiles, buktiError, settings, model } = this.s;
      const pick = h('input', {
        type: 'file',
        hidden: true,
        accept: (model && model.accept) || 'image/*,.pdf',
        onchange: (e) => {
          const f = e.target.files && e.target.files[0];
          e.target.value = '';
          if (f) this.setDefaultBukti(f);
        },
      });
      const pickMany = h('input', {
        type: 'file',
        hidden: true,
        multiple: true,
        accept: (model && model.accept) || 'image/*,.pdf',
        onchange: (e) => {
          const files = e.target.files;
          if (files && files.length) this.setBuktiFiles(files);
          e.target.value = '';
        },
      });

      let current;
      if (bukti) {
        let thumb = h('div', { class: 'thumb' }, icon('file'));
        if (/^image\//.test(bukti.type) && this.buktiRecord) {
          if (!this.thumbUrl) this.thumbUrl = URL.createObjectURL(F.fromRecord(this.buktiRecord));
          thumb = h('img', { class: 'thumb', src: this.thumbUrl, alt: '' });
        }
        current = h('div', { class: 'file-row' }, thumb,
          h('div', { class: 'file-meta' }, h('div', { class: 'file-name' }, bukti.name), h('div', { class: 'hint small' }, `${U.formatBytes(bukti.size)} · dipakai untuk entri tanpa bukti khusus · tersimpan di browser ini`)),
          h('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'data-fk': 'bukti-change', onclick: () => pick.click() }, 'Ganti'),
          h('button', { type: 'button', class: 'btn btn-sm btn-danger', 'aria-label': 'Hapus file bukti bawaan', onclick: () => this.clearDefaultBukti() }, 'Hapus'));
      } else {
        current = h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn btn-primary', 'data-fk': 'bukti-pick', onclick: () => pick.click() }, 'Pilih file bukti bawaan'),
          h('span', { class: 'hint' }, 'Mis. foto kartu/ID magang atau dokumentasi. Dipakai untuk semua entri dan disimpan di browser ini.'));
      }

      const matched = this.s.entries.filter((e) => e.bukti && (e.bukti.kind === 'date' || e.bukti.kind === 'named')).length;
      const many = h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'data-fk': 'bukti-many', onclick: () => pickMany.click() }, 'Pilih bukti per tanggal (opsional)'),
        buktiFiles.length
          ? h('span', { class: 'hint' }, `${buktiFiles.length} file dipilih · ${matched} entri memakai file ini`)
          : h('span', { class: 'hint' }, 'Nama file yang memuat tanggal (mis. IMG_20260706_…jpg) dicocokkan otomatis. Tidak disimpan setelah halaman ditutup.'),
        buktiFiles.length ? h('button', { type: 'button', class: 'btn btn-sm btn-link', onclick: () => this.setBuktiFiles([]) }, 'Kosongkan') : null);

      return h('section', { class: 'card', 'aria-labelledby': 'alb-c5' },
        h('div', { class: 'card-head' }, h('div', {}, h('h3', { id: 'alb-c5' }, 'Bukti aktivitas'), h('p', { class: 'hint' }, 'Portal mewajibkan satu file bukti untuk setiap log.'))),
        buktiError ? banner('bad', buktiError) : null,
        current,
        many,
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', 'data-fk': 'shrink', checked: settings.shrinkImages, onchange: (e) => this.setSetting('shrinkImages', e.target.checked) }),
          h('span', {}, 'Perkecil foto di atas 1 MB sebelum diunggah ', h('span', { class: 'hint' }, '(lebih cepat dan menghindari batas ukuran portal)'))),
        pick,
        pickMany,
      );
    }

    cardAdvanced() {
      const { settings, model } = this.s;
      return h('section', { class: 'card', 'aria-labelledby': 'alb-c6' },
        h('div', { class: 'card-head' }, h('div', {}, h('h3', { id: 'alb-c6' }, 'Lanjutan'), h('p', { class: 'hint' }, 'Jeda pengiriman, info teknis untuk laporan masalah, dan reset.'))),
        h('details', { class: 'adv' },
          h('summary', {}, h('span', { class: 'when-closed' }, 'Tampilkan'), h('span', { class: 'when-open' }, 'Sembunyikan')),
          h('div', { class: 'grid' },
            h('label', { class: 'field' },
              h('span', { class: 'lbl' }, 'Jeda antar entri (detik)'),
              h('input', { type: 'number', min: '0', max: '30', step: '0.5', 'data-fk': 'delay', value: String(settings.delaySec), onchange: (e) => this.setSetting('delaySec', Math.min(30, Math.max(0, Number(e.target.value) || 0))) }),
              h('span', { class: 'hint small' }, 'Beri jeda agar server portal tidak terbebani.')),
            model && model.maxLen && model.maxLen.keterangan
              ? h('label', { class: 'check' },
                h('input', { type: 'checkbox', 'data-fk': 'truncate', checked: settings.truncate, onchange: (e) => this.setSetting('truncate', e.target.checked) }),
                h('span', {}, `Potong keterangan yang melebihi ${model.maxLen.keterangan} karakter`))
              : null),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => this.copyDiagnostics() }, 'Salin info teknis'),
            h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => this.clearHistory() }, 'Hapus riwayat kiriman'),
            h('button', { type: 'button', class: 'btn btn-sm btn-danger', onclick: () => this.resetSettings() }, 'Reset pengaturan'))),
      );
    }

    // -------------------------------------------------------------------------
    // Step 3: review and send

    statusInfo(e) {
      let label = STATUS_LABEL[e.status] || e.status;
      let verified = false;
      const msgs = [];
      if (e.status === 'invalid') msgs.push({ kind: 'bad', text: e.errors.join(' · ') });
      if (e.status === 'warn' || (e.status === 'failed' && Object.keys(e.flags).length)) {
        if (e.flags.dateExists) {
          label = e.status === 'warn' ? 'Tanggal sudah terisi' : label;
          msgs.push({ kind: 'warn', text: 'Portal sudah punya log di tanggal ini dengan keterangan lain.' });
        }
        if (e.flags.outOfPeriod) {
          if (e.status === 'warn' && !e.flags.dateExists) label = 'Di luar periode';
          msgs.push({ kind: 'warn', text: 'Tanggal di luar periode kegiatan.' });
        }
        if (e.flags.future) {
          if (e.status === 'warn' && !e.flags.dateExists && !e.flags.outOfPeriod) label = 'Tanggal mendatang';
          msgs.push({ kind: 'warn', text: 'Tanggal setelah hari ini.' });
        }
      }
      if (e.status === 'exists') msgs.push({ kind: '', text: 'Log dengan tanggal dan keterangan ini sudah ada.' });
      if (e.status === 'failed' && e.result) msgs.push({ kind: 'bad', text: e.result.message });
      if (e.status === 'done') {
        // Verified = the entry was seen in the portal's log list after sending (shown with a check).
        if (e.result && e.result.verified) verified = true;
        else msgs.push({ kind: '', text: (e.result && e.result.message) || 'Belum terlihat di daftar log (mungkin di halaman lain).' });
      }
      if (e.warnings.length && e.status !== 'invalid') msgs.push({ kind: 'warn', text: e.warnings.join(' · ') });
      return { label, msgs, verified };
    }

    viewSend() {
      const { data, entries, run, filter, notice } = this.s;
      if (!data) return this.viewNeedData();
      const visible = entries.filter((e) => this.inFilter(e));
      const c = this.counts(visible);
      const issues = this.issues();
      const top = [];
      if (notice) top.push(banner(notice.kind, notice.text));
      if (issues.length) {
        top.push(banner('warn', h('div', {}, h('strong', {}, 'Lengkapi pengaturan sebelum mengirim:'), h('ul', {}, issues.map((t) => h('li', {}, t)))),
          [h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => this.goTab('settings') }, 'Buka Pengaturan')]));
      }
      const lr = this.s.lastRun;
      if (lr && !run && lr.done > 0) {
        const kind = lr.failed ? 'warn' : 'ok';
        top.push(banner(kind, `${lr.done} entri terkirim${lr.failed ? `, ${lr.failed} gagal` : ''}${lr.stoppedBy === 'user' ? ' (dihentikan)' : ''}. Muat ulang halaman portal untuk melihat daftar log terbaru.`,
          [h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => location.reload() }, 'Muat ulang halaman')]));
      }

      const selectableVisible = visible.filter((e) => this.selectable(e) && e.status !== 'exists');
      const pickedVisible = selectableVisible.filter((e) => this.isPicked(e));
      const all = h('input', {
        type: 'checkbox',
        'data-fk': 'pick-all',
        'aria-label': 'Pilih semua entri yang bisa dikirim',
        disabled: Boolean(run) || !selectableVisible.length,
        checked: selectableVisible.length > 0 && pickedVisible.length === selectableVisible.length,
        indeterminate: pickedVisible.length > 0 && pickedVisible.length < selectableVisible.length,
        onchange: (e) => {
          for (const en of selectableVisible) this.s.picks.set(en.key, e.target.checked);
          this.scheduleRender();
        },
      });

      const count = (n, kind, label) => (n ? h('span', { class: 'count' }, dot(kind), h('strong', {}, String(n)), label) : null);
      const toolbar = h('div', { class: 'toolbar' },
        h('div', { class: 'counts', role: 'group', 'aria-label': 'Ringkasan status' },
          count(c.ready, 'ready', 'siap'),
          count(c.warn, 'warn', 'perlu dicek'),
          count(c.exists, 'exists', 'sudah ada'),
          count(c.invalid, 'invalid', 'perlu diperbaiki'),
          count(c.done, 'done', 'terkirim'),
          count(c.failed, 'failed', 'gagal')),
        h('span', { class: 'spacer' }),
        h('div', { class: 'range', role: 'group', 'aria-labelledby': 'alb-range' },
          h('span', { class: 'lbl', id: 'alb-range' }, 'Tanggal'),
          h('input', { type: 'date', 'data-fk': 'from', 'aria-label': 'Dari tanggal', value: filter.from, onchange: (e) => { filter.from = e.target.value; this.scheduleRender(); } }),
          h('span', { class: 'muted', 'aria-hidden': 'true' }, '–'),
          h('input', { type: 'date', 'data-fk': 'to', 'aria-label': 'Sampai tanggal', value: filter.to, onchange: (e) => { filter.to = e.target.value; this.scheduleRender(); } })));

      const rows = visible.map((e) => {
        const info = this.statusInfo(e);
        const picked = this.isPicked(e);
        const lines = e.keterangan.split('\n');
        return h('tr', { class: picked || e.status === 'done' || e.status === 'sending' ? '' : 'off' },
          h('td', { class: 'c-check' }, h('input', {
            type: 'checkbox',
            'data-fk': `pick-${e.key}`,
            'aria-label': `Kirim entri ${e.date ? D.human(e.date) : e.dateRaw}`,
            disabled: Boolean(run) || !this.selectable(e),
            checked: picked,
            onchange: (ev) => {
              this.s.picks.set(e.key, ev.target.checked);
              this.scheduleRender();
            },
          })),
          h('td', { class: 'nowrap' }, e.date ? D.human(e.date) : h('span', { class: 'muted' }, e.dateRaw || '—')),
          h('td', { class: 'nowrap' }, e.start && e.end ? `${e.start}–${e.end}` : '—', e.hours ? h('div', { class: 'hint small' }, `${fmtHours(e.hours)} jam`) : null),
          h('td', {}, h('div', { class: 'nowrap' }, M.TIPE_LABEL[e.tipe] || '—'), h('div', { class: 'hint small cell-clip', title: e.lokasi }, e.lokasi || '—')),
          h('td', {}, h('div', { class: 'ket' }, h('strong', {}, lines[0] || '—'), lines.length > 1 ? `\n${lines.slice(1).join('\n')}` : '')),
          h('td', {}, e.bukti ? h('div', { class: 'hint small cell-clip', style: 'max-width:150px', title: e.bukti.name }, e.bukti.kind === 'default' ? 'Bawaan' : e.bukti.name) : h('span', { class: 'muted' }, '—')),
          h('td', {}, h('span', { class: `st ${e.status}` }, e.status === 'sending' ? h('span', { class: 'spin' }) : info.verified ? icon('check') : dot(e.status), info.label),
            info.msgs.map((m) => h('div', { class: `msg ${m.kind}` }, m.text))));
      });

      const table = h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Daftar entri yang akan dikirim' },
        h('table', { class: 't' },
          h('thead', {}, h('tr', {},
            h('th', { scope: 'col', class: 'c-check' }, all),
            h('th', { scope: 'col' }, 'Tanggal'),
            h('th', { scope: 'col' }, 'Jam'),
            h('th', { scope: 'col' }, 'Tipe · Lokasi'),
            h('th', { scope: 'col' }, 'Keterangan'),
            h('th', { scope: 'col' }, 'Bukti'),
            h('th', { scope: 'col' }, 'Status'))),
          h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: '7', class: 'muted', style: 'text-align:center;padding:28px' }, 'Tidak ada entri pada rentang tanggal ini.')))));

      return [...top.map((b) => {
        b.style.marginBottom = '12px';
        return b;
      }), toolbar, table];
    }

    // -------------------------------------------------------------------------
    // Footer

    renderFoot() {
      const { run, tab, data } = this.s;
      const status = this.refs.status;
      const actions = this.refs.actions;
      if (!status || !actions) return;
      actions.replaceChildren();
      status.replaceChildren();

      if (this.ctx.kind !== 'log') {
        status.textContent = 'Ekstensi tidak resmi. Data Anda tidak dikirim ke mana pun selain Student Portal.';
        return;
      }

      if (run) {
        const doneCount = run.done + run.failed;
        status.append(
          h('progress', { class: 'bar', max: String(run.total), value: String(doneCount), 'aria-label': 'Kemajuan pengiriman' }),
          h('span', {}, run.stopping ? 'Menghentikan…' : `Mengirim ${Math.min(doneCount + 1, run.total)} dari ${run.total}…`, run.failed ? ` ${run.failed} gagal.` : ''),
        );
        actions.append(h('button', { type: 'button', class: 'btn btn-danger', 'data-fk': 'stop', disabled: run.stopping, onclick: () => this.stopRun() }, 'Hentikan'));
        return;
      }

      status.textContent = this.s.status || '';

      if (tab === 'data') {
        actions.append(h('button', { type: 'button', class: 'btn btn-primary', 'data-fk': 'next-data', disabled: !data, onclick: () => this.goTab('settings') }, 'Lanjut ke Pengaturan'));
        return;
      }
      if (tab === 'settings') {
        actions.append(h('button', { type: 'button', class: 'btn btn-primary', 'data-fk': 'next-settings', disabled: !data, onclick: () => this.goTab('send') }, 'Lanjut ke Kirim'));
        return;
      }

      const queue = this.queue();
      const hours = queue.reduce((s, e) => s + e.hours, 0);
      if (!this.s.status) status.textContent = queue.length ? `${queue.length} entri dipilih · ${fmtHours(hours)} jam` : 'Belum ada entri yang dipilih.';
      const blocked = this.issues().length > 0 || !queue.length || this.s.loading || !this.s.model;
      actions.append(
        h('button', { type: 'button', class: 'btn btn-link', 'data-fk': 'preview', disabled: blocked, onclick: () => this.previewPayload() }, 'Lihat data kiriman'),
        h('button', { type: 'button', class: 'btn btn-secondary', 'data-fk': 'send-one', disabled: blocked, onclick: () => this.startRun(1) }, 'Kirim 1 dulu'),
        h('button', { type: 'button', class: 'btn btn-primary', 'data-fk': 'send-all', disabled: blocked, onclick: () => this.startRun() }, queue.length ? `Kirim ${queue.length} entri` : 'Kirim'),
      );
    }
  }

  ALB.Panel = Panel;

  // ---------------------------------------------------------------------------
  // Launcher buttons on the portal page

  ALB.ui = {
    /** Put an "Isi Otomatis" button next to the portal's "Tambah" button (or a floating one). */
    injectLauncher(onOpen, { floating = false } = {}) {
      const tambah = floating ? null : [...document.querySelectorAll('a, button')].find((el) => /^\s*\+?\s*tambah\s*$/i.test(el.textContent || ''));
      if (tambah && tambah.parentElement) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `${tambah.className || 'btn btn-default'} alb-launch`.trim();
        // Same classes as the portal's own button so it looks native; only the colour marks it as ours.
        btn.style.marginRight = '6px';
        btn.style.color = '#1f4590';
        btn.style.fontWeight = '600';
        btn.title = 'Isi log aktivitas dari Google Sheets/Excel (Auto Logbook)';
        const label = document.createElement('span');
        label.className = 'alb-launch-label';
        label.textContent = 'Isi Otomatis';
        btn.dataset.idleLabel = label.textContent;
        btn.append(label);
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          onOpen();
        });
        tambah.before(btn);
        return btn;
      }
      const host = document.createElement('alb-fab');
      const root = host.attachShadow({ mode: 'open' });
      const label = document.createElement('span');
      label.className = 'alb-launch-label';
      label.textContent = 'Auto Logbook';
      const btn = h('button', { type: 'button', title: 'Buka Auto Logbook', dataset: { idleLabel: label.textContent } }, label);
      btn.addEventListener('click', onOpen);
      root.append(h('style', {}, ALB.styles.fab), btn);
      document.documentElement.append(host);
      return btn;
    },
  };
})(globalThis.ALB);
