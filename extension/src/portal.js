/*
 * Auto Logbook IPB: talk to the Student Portal from inside the logged-in tab.
 *
 * Nothing here hard-codes the whole form: the "Tambah Log Aktivitas" form is
 * fetched and read on every submission, so hidden fields, the anti-forgery
 * token, lecturer checkboxes and option values always come from the portal.
 */
(function (ALB) {
  'use strict';

  const U = ALB.util;
  const D = ALB.dates;
  const M = ALB.mapping;
  const AlbError = ALB.AlbError;
  const P = (ALB.portal = {});

  P.LOG_PATH_RE = /\/Kegiatan\/([A-Za-z]*Log[A-Za-z]*)\/Index\/([^/?#]+)/i;

  const cssEscape = (s) => (globalThis.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'));
  const clean = (t) => U.norm(t).replace(/^:\s*/, '');

  const BLOCK = /^(TD|TH|TR|P|DIV|LI|UL|OL|TABLE|THEAD|TBODY|TFOOT|SECTION|ARTICLE|HEADER|FOOTER|H[1-6]|DD|DT|DL|LABEL|BUTTON|A)$/;

  /**
   * Visible-ish text with spaces at cell/block/<br> boundaries. textContent
   * glues "<td>1</td><td>06 Juli 2026</td>" into "106 Juli 2026".
   */
  P.textOf = (el) => {
    if (!el) return '';
    const parts = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) parts.push(child.nodeValue);
        else if (child.nodeType === 1) {
          const tag = child.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') continue;
          if (tag === 'BR') {
            parts.push(' ');
            continue;
          }
          const block = BLOCK.test(tag);
          if (block) parts.push(' ');
          walk(child);
          if (block) parts.push(' ');
        }
      }
    };
    walk(el);
    return clean(parts.join(''));
  };

  // ---------------------------------------------------------------------------
  // Where are we?

  P.context = (loc = location, doc = document) => {
    const m = loc.pathname.match(P.LOG_PATH_RE);
    if (m) {
      const controller = m[1];
      const aktivitasId = decodeURIComponent(m[2]);
      const found = P.findTambahUrl(doc, loc.href);
      return {
        kind: 'log',
        controller,
        aktivitasId,
        indexUrl: loc.origin + loc.pathname + loc.search,
        tambahUrl: found || `${loc.origin}/Kegiatan/${controller}/Tambah?aktivitasId=${encodeURIComponent(aktivitasId)}`,
        tambahFromPage: Boolean(found),
      };
    }
    if (/\/Kegiatan\/AktivitasKampusMerdeka/i.test(loc.pathname)) {
      return { kind: 'list', logLinks: P.findLogLinks(doc, loc.href) };
    }
    return { kind: 'other' };
  };

  /** The URL behind the portal's own "Tambah" button, if it exposes one. */
  P.findTambahUrl = (doc, base) => {
    const els = [...doc.querySelectorAll('a, button')].filter(
      (el) => /\btambah\b/i.test(el.textContent || '') || /tambah/i.test(el.getAttribute('href') || ''),
    );
    for (const el of els) {
      for (const attr of ['href', 'data-url', 'data-href', 'data-action', 'data-remote', 'data-src', 'formaction']) {
        const v = el.getAttribute(attr);
        if (!v || v === '#' || /^javascript:/i.test(v)) continue;
        if (/tambah/i.test(v)) return new URL(v, base).href;
      }
      const onclick = el.getAttribute('onclick') || '';
      const q = onclick.match(/['"]([^'"]*tambah[^'"]*)['"]/i);
      if (q) return new URL(q[1], base).href;
    }
    return null;
  };

  /** Links to activity log pages (on the "Aktivitas Kampus Merdeka" list). */
  P.findLogLinks = (doc, base) => {
    const seen = new Set();
    const out = [];
    for (const a of doc.querySelectorAll('a[href]')) {
      const href = new URL(a.getAttribute('href'), base);
      if (!P.LOG_PATH_RE.test(href.pathname) || seen.has(href.href)) continue;
      seen.add(href.href);
      out.push({ href: href.href, text: U.truncate(P.rowLabel(a), 140) });
    }
    return out;
  };

  /** Describe the row around a link: content cells only, no numbering or action links. */
  P.rowLabel = (a) => {
    const tr = a.closest('tr');
    if (tr) {
      const parts = [...tr.cells]
        .filter((cell) => {
          const all = P.textOf(cell);
          const actions = [...cell.querySelectorAll('a, button')].map((x) => P.textOf(x)).join(' ');
          return all && U.key(all) !== U.key(actions) && !/^\d{1,3}\.?$/.test(all);
        })
        .map((cell) => P.textOf(cell));
      if (parts.length) return parts.join(' · ');
    }
    const box = a.closest('.card, li');
    return P.textOf(box || a);
  };

  // ---------------------------------------------------------------------------
  // HTTP

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  P.isLoginPage = (url, doc) =>
    /\/Account\/Log(?:in|on)\b/i.test(url || '') ||
    Boolean(doc && doc.querySelector('input[type="password"]') && !doc.querySelector('input[type="file"]'));

  /**
   * fetch() with the session cookies, returning the parsed document.
   * `ajax` adds X-Requested-With like the portal's own modal loader does.
   */
  P.fetchDoc = async (url, init = {}, { ajax = true } = {}) => {
    let res;
    try {
      res = await fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'follow',
        ...init,
        headers: { ...(ajax ? { 'X-Requested-With': 'XMLHttpRequest' } : {}), ...(init.headers || {}) },
      });
    } catch (err) {
      throw new AlbError('network', 'Tidak bisa terhubung ke Student Portal. Periksa koneksi internet, lalu coba lagi.', err);
    }
    const type = res.headers.get('content-type') || '';
    const text = await res.text();
    const isJson = /json/i.test(type);
    const doc = isJson ? null : new DOMParser().parseFromString(text, 'text/html');
    return { res, text, doc, json: isJson ? parseJson(text) : null, url: res.url || url, login: P.isLoginPage(res.url, doc) };
  };

  // ---------------------------------------------------------------------------
  // Reading the "Tambah Log Aktivitas" form

  P.labelText = (scope, el) => {
    if (el.id) {
      const label = scope.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (label && clean(label.textContent)) return clean(label.textContent);
    }
    const wrap = el.closest('label');
    if (wrap && clean(wrap.textContent)) return clean(wrap.textContent);
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      const next = el.nextElementSibling;
      if (next && next.tagName === 'LABEL' && clean(next.textContent)) return clean(next.textContent);
      const parent = el.parentElement ? P.textOf(el.parentElement) : '';
      if (parent && parent.length < 200) return parent;
    }
    const group = el.closest('.form-group, .mb-3, .form-row, .row');
    const label = group && group.querySelector('label');
    return label ? clean(label.textContent).replace(/\s*\*$/, '') : '';
  };

  function tipeKind(label, value) {
    const k = U.key(label);
    if (/hybrid|hibrid/.test(k)) return 'hybrid';
    if (/offline|luring/.test(k)) return 'offline';
    if (/online|daring/.test(k)) return 'online';
    if (value === 'true') return 'offline';
    if (value === 'false') return 'online';
    if (value === '') return 'hybrid';
    return null;
  }

  function maxLength(el) {
    if (!el) return null;
    if (el.maxLength > 0) return el.maxLength;
    const v = Number(el.getAttribute('data-val-length-max') || el.getAttribute('data-val-maxlength-max'));
    return v > 0 ? v : null;
  }

  function scriptText(doc) {
    return [...doc.querySelectorAll('script')].map((s) => s.textContent || '').join('\n');
  }

  /** Locate and describe the log form. Returns null when no plausible form exists. */
  P.analyzeForm = (doc, baseUrl) => {
    if (!doc) return null;
    const score = (f) =>
      (f.querySelector('input[type="file"]') ? 2 : 0) +
      (f.querySelector('textarea') ? 1 : 0) +
      (f.querySelector('[name="Waktu"], [placeholder*="anggal"]') ? 1 : 0);
    const form = [...doc.querySelectorAll('form')].sort((a, b) => score(b) - score(a))[0];
    if (!form || score(form) < 2) return null;

    const all = (sel) => [...form.querySelectorAll(sel)];
    const byName = (...names) => {
      for (const n of names) {
        const el = all('[name]').find((e) => e.getAttribute('name').toLowerCase() === n.toLowerCase());
        if (el) return el;
      }
      return null;
    };
    const byPlaceholder = (re, sel = 'input, textarea') => all(sel).find((e) => re.test(e.getAttribute('placeholder') || ''));
    const byLabel = (re, sel) => all(sel).find((e) => re.test(P.labelText(form, e)));
    const typed = (e) => (e.getAttribute('type') || 'text').toLowerCase();
    const textual = all('input').filter((e) => !['hidden', 'checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image'].includes(typed(e)));

    const date =
      byName('Waktu', 'Tanggal', 'TanggalKegiatan') ||
      byPlaceholder(/tanggal|tgl|date/i, 'input') ||
      form.querySelector('input[type="date"]') ||
      byLabel(/tanggal/i, 'input');
    const timeish = textual.filter((e) => e !== date);
    const start =
      byName('Tmw', 'WaktuMulai', 'JamMulai') || byPlaceholder(/mulai|start/i, 'input') || timeish.find((e) => typed(e) === 'time') || null;
    const end =
      byName('Tsw', 'WaktuSelesai', 'JamSelesai') ||
      byPlaceholder(/selesai|akhir|end/i, 'input') ||
      timeish.filter((e) => typed(e) === 'time' && e !== start)[0] ||
      null;
    const selects = all('select');
    const jenis =
      byName('JenisLogbookKegiatanKampusMerdekaId') ||
      selects.find((s) => /jenis/i.test(s.getAttribute('name') || '') || /jenis/i.test(P.labelText(form, s))) ||
      selects[0] ||
      null;
    const lokasi = byName('Lokasi') || byPlaceholder(/lokasi|tempat|location/i) || byLabel(/lokasi|tempat/i, 'input, textarea');
    const keterangan =
      byName('Keterangan', 'Topik', 'Deskripsi') || byPlaceholder(/topik|keterangan|deskripsi/i, 'textarea') || form.querySelector('textarea');
    const file = form.querySelector('input[type="file"]');

    const boxes = all('input[type="checkbox"]');
    const dosenBoxes = boxes.filter((c) => /dosen|pembimbing|penggerak/i.test(c.getAttribute('name') || ''));
    const dosen = (dosenBoxes.length ? dosenBoxes : boxes).map((el, i) => ({
      el,
      name: el.getAttribute('name') || '',
      label: P.labelText(form, el) || `Dosen ${i + 1}`,
    }));

    const groups = new Map();
    for (const r of all('input[type="radio"]')) {
      const n = r.getAttribute('name') || '';
      if (!groups.has(n)) groups.set(n, []);
      groups.get(n).push(r);
    }
    const tipeGroup =
      [...groups.entries()].find(([n]) => n.toLowerCase() === 'isluring')?.[1] ||
      [...groups.values()].find((g) => g.some((r) => /online|offline|hybrid|daring|luring/i.test(P.labelText(form, r)))) ||
      [];
    const tipe = tipeGroup.map((el) => {
      const label = P.labelText(form, el);
      return { el, value: el.getAttribute('value') ?? '', label, kind: tipeKind(label, el.getAttribute('value') ?? '') };
    });

    const jenisOptions = jenis
      ? [...jenis.options].map((o) => ({ value: o.getAttribute('value') ?? o.textContent, text: clean(o.textContent) }))
      : [];

    // Date format the portal expects.
    let dateFormat = 'DD/MM/YYYY';
    const scripts = scriptText(doc);
    if (date && typed(date) === 'date') dateFormat = 'YYYY-MM-DD';
    else {
      const attr = (date && (date.getAttribute('data-date-format') || date.getAttribute('data-format'))) || '';
      const fromScript = scripts.match(/format\s*:\s*['"]((?:DD|dd)[/.-](?:MM|mm)[/.-](?:YYYY|yyyy)|(?:MM|mm)[/.-](?:DD|dd)[/.-](?:YYYY|yyyy)|(?:YYYY|yyyy)-(?:MM|mm)-(?:DD|dd))['"]/);
      const f = (attr || (fromScript && fromScript[1]) || '').toUpperCase();
      if (/^Y/.test(f)) dateFormat = 'YYYY-MM-DD';
      else if (/^M/.test(f)) dateFormat = 'MM/DD/YYYY';
    }

    // Date limits set on the input or the date picker.
    const limit = (attr, key) => {
      const raw =
        (date && date.getAttribute(attr)) ||
        (scripts.match(new RegExp(`${key}\\s*:\\s*(?:new Date\\(|moment\\()?\\s*['"]([^'"]+)['"]`)) || [])[1] ||
        '';
      return raw ? D.parseDate(raw, dateFormat.startsWith('MM') ? 'MDY' : 'DMY') : null;
    };
    const minDate = limit('min', 'minDate');
    const maxDate = limit('max', 'maxDate');

    const known = new Set([date, start, end, jenis, lokasi, keterangan, file, ...dosen.map((d) => d.el), ...tipe.map((t) => t.el)].filter(Boolean));
    const unknownRequired = all('input, select, textarea')
      .filter((el) => !known.has(el) && !['hidden', 'submit', 'button'].includes(typed(el)))
      .filter((el) => el.required || el.hasAttribute('data-val-required'))
      .filter((el) => !(el.value || '').trim())
      .map((el) => P.labelText(form, el) || el.getAttribute('name') || el.tagName.toLowerCase());

    const missing = [];
    if (!date) missing.push('Tanggal');
    if (!start || !end) missing.push('Waktu Kegiatan');
    if (!keterangan) missing.push('Keterangan');
    if (!lokasi) missing.push('Lokasi');
    if (!file) missing.push('Bukti Aktivitas');
    if (!tipe.length) missing.push('Tipe Penyelenggaraan');

    const submitter = all('button[type="submit"], input[type="submit"], button:not([type])').find((b) => b.getAttribute('name'));

    return {
      doc,
      form,
      action: new URL(form.getAttribute('action') || baseUrl, baseUrl).href,
      method: (form.getAttribute('method') || 'post').toUpperCase(),
      fields: { date, start, end, jenis, lokasi, keterangan, file },
      dosen,
      tipe,
      jenisOptions,
      dateFormat,
      maxLen: { keterangan: maxLength(keterangan), lokasi: maxLength(lokasi) },
      period: minDate || maxDate ? { from: minDate, to: maxDate } : null,
      accept: (file && file.getAttribute('accept')) || '',
      unknownRequired,
      missing,
      submitter: submitter ? { name: submitter.getAttribute('name'), value: submitter.getAttribute('value') || '' } : null,
    };
  };

  /** GET the form (fresh anti-forgery token each time). */
  P.loadForm = async (ctx) => {
    const r = await P.fetchDoc(ctx.tambahUrl);
    if (r.login) throw new AlbError('session', 'Sesi login Student Portal sudah habis. Login lagi, lalu buka ulang halaman Log Aktivitas.');
    if (!r.res.ok) throw new AlbError('http', `Formulir Tambah Log tidak bisa dimuat (HTTP ${r.res.status}).`);
    const model = P.analyzeForm(r.doc, r.url);
    if (!model) throw new AlbError('noform', 'Formulir "Tambah Log Aktivitas" tidak ditemukan di respons portal.', { url: r.url, doc: r.doc });
    return model;
  };

  // ---------------------------------------------------------------------------
  // Building and sending one entry

  const TOKEN_RE = /verificationtoken|csrf|xsrf/i;

  /**
   * Fill the parsed form like a person would, then serialize it like a browser
   * submit (tree order, checked boxes only, ASP.NET hidden "false" companions kept).
   */
  P.buildPayload = (model, entry, file, opts = {}) => {
    const { fields, form } = model;
    const setValue = (el, v) => {
      if (el) el.value = v;
    };

    setValue(fields.date, D.format(entry.date, model.dateFormat));
    setValue(fields.start, entry.start);
    setValue(fields.end, entry.end);

    if (fields.jenis) {
      const options = [...fields.jenis.options];
      const opt =
        options.find((o) => (o.getAttribute('value') ?? '') === entry.jenis.value && entry.jenis.value !== '') ||
        options.find((o) => U.key(o.textContent) === U.key(entry.jenis.text));
      if (!opt) throw new AlbError('payload', `Jenis kegiatan "${entry.jenis.text}" tidak ada di formulir portal.`);
      for (const o of options) o.selected = o === opt;
    }

    if (model.dosen.length) {
      const wanted = new Set((opts.dosen || []).map(U.key));
      model.dosen.forEach((d, i) => {
        d.el.checked = wanted.size ? wanted.has(U.key(d.label)) : i === 0;
      });
      if (!model.dosen.some((d) => d.el.checked)) throw new AlbError('payload', 'Pilih minimal satu Dosen Penggerak.');
    }

    if (model.tipe.length) {
      const target = model.tipe.find((t) => t.kind === entry.tipe);
      if (!target) throw new AlbError('payload', `Pilihan "${M.TIPE_LABEL[entry.tipe] || entry.tipe}" tidak ada di formulir portal.`);
      for (const t of model.tipe) t.el.checked = t === target;
    }

    setValue(fields.lokasi, entry.lokasi);
    setValue(fields.keterangan, entry.keterangan);

    const fd = new FormData();
    const preview = [];
    const add = (name, value, shown) => {
      fd.append(name, value);
      preview.push({ name, value: shown ?? value });
    };

    for (const el of form.elements) {
      const name = el.getAttribute('name');
      if (!name || el.disabled || el.closest('fieldset[disabled]')) continue;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (el.tagName === 'BUTTON' || ['submit', 'button', 'reset', 'image'].includes(type)) continue;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) continue;
      if (type === 'file') {
        if (el === fields.file && file) {
          fd.append(name, file, file.name);
          preview.push({ name, value: `${file.name} (${U.formatBytes(file.size)})`, file: true });
        } else {
          fd.append(name, new File([], '', { type: 'application/octet-stream' }), '');
        }
        continue;
      }
      if (el.tagName === 'SELECT') {
        const chosen = [...el.options].filter((o) => o.selected);
        if (!chosen.length && !el.multiple && el.options.length) chosen.push(el.options[0]);
        for (const o of chosen) add(name, o.getAttribute('value') ?? o.textContent);
        continue;
      }
      const value = el.value;
      add(name, value, TOKEN_RE.test(name) ? '••••••' : undefined);
    }
    if (model.submitter) add(model.submitter.name, model.submitter.value);
    if (fields.file && !file) throw new AlbError('payload', 'File bukti belum dipilih.');
    return { fd, preview };
  };

  function unescapeJs(s) {
    return String(s)
      .replace(/\\n/g, ' ')
      .replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, '$1');
  }

  /** Error/success messages rendered by the portal (validation spans, alerts, toastr, SweetAlert). */
  P.extractMessages = (doc) => {
    const errors = [];
    const success = [];
    if (!doc) return { errors, success };
    const push = (list, text) => {
      const t = U.norm(text);
      if (t && t.length <= 400 && !list.includes(t)) list.push(t);
    };
    const hidden = (el) => el.closest('.d-none, .hide, .hidden, [hidden], [style*="display: none"], [style*="display:none"], template');
    doc
      .querySelectorAll('.validation-summary-errors li, .field-validation-error, .alert-danger, .is-invalid ~ .invalid-feedback, .text-danger[data-valmsg-for]')
      .forEach((el) => {
        if (!hidden(el)) push(errors, el.textContent);
      });
    doc.querySelectorAll('.alert-success').forEach((el) => {
      if (!hidden(el)) push(success, el.textContent);
    });

    const code = scriptText(doc);
    for (const m of code.matchAll(/toastr\s*\.\s*(error|warning|success|info)\s*\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g)) {
      push(m[1] === 'success' || m[1] === 'info' ? success : errors, unescapeJs(m[3]));
    }
    for (const m of code.matchAll(/(?:swal|Swal\.fire)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3\s*,\s*['"](error|warning|success|info)['"]/g)) {
      push(m[5] === 'success' || m[5] === 'info' ? success : errors, unescapeJs(`${m[2]} ${m[4]}`));
    }
    for (const m of code.matchAll(/(?:swal|Swal\.fire)\s*\(\s*\{([\s\S]{0,600}?)\}\s*\)/g)) {
      const body = m[1];
      const icon = (body.match(/(?:icon|type)\s*:\s*['"](\w+)['"]/) || [])[1];
      if (!icon) continue;
      const title = (body.match(/title\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/) || [])[2];
      const text = (body.match(/(?:text|html)\s*:\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/) || [])[2];
      push(icon === 'success' || icon === 'info' ? success : errors, unescapeJs([title, text].filter(Boolean).join(' — ')));
    }
    return { errors, success };
  };

  /**
   * POST one filled form. `baseline` holds messages already present on a normal
   * page load, so they are not mistaken for the result of this submission.
   */
  P.submit = async (model, fd, entry, baseline) => {
    let r;
    try {
      r = await P.fetchDoc(model.action, { method: model.method === 'GET' ? 'POST' : model.method, body: fd });
    } catch (err) {
      return { ok: false, network: true, message: err.message };
    }
    if (r.login) return { ok: false, session: true, message: 'Sesi login habis. Login lagi di Student Portal, lalu kirim ulang.' };

    if (r.json) {
      const j = r.json;
      const okFlag = j.success ?? j.isSuccess ?? j.status ?? j.ok;
      const message = U.norm(j.message || j.msg || j.pesan || '');
      const ok = okFlag === true || okFlag === 'success' || okFlag === 200;
      return ok ? { ok: true, verified: false, message } : { ok: false, message: message || 'Portal menolak entri ini.' };
    }

    const seen = (list, kind) => list.filter((t) => !(baseline && baseline[kind] && baseline[kind].includes(t)));
    const msgs = P.extractMessages(r.doc);
    const errors = seen(msgs.errors, 'errors');
    const success = seen(msgs.success, 'success');
    const status = r.res.status;
    // Shape of the response only (no content), for "Salin info teknis".
    const debug = { status, redirected: r.res.redirected, path: new URL(r.url, location.href).pathname, errors, success: success.length };

    if (status >= 400) {
      const hint = status === 413 ? ': file terlalu besar' : status === 404 ? ': alamat formulir tidak ditemukan' : '';
      return { ok: false, status, message: errors[0] || `Portal menolak entri ini (HTTP ${status}${hint}).`, debug };
    }
    if (errors.length) return { ok: false, message: errors.join(' · '), debug };

    const index = P.parseIndex(r.doc);
    debug.tableFound = index.tableFound;
    debug.rows = index.entries.length;
    if (r.res.redirected || index.tableFound) {
      const verified = index.entries.length ? M.checkExisting(entry, index.entries) === 'exists' : false;
      return { ok: true, verified, index: index.tableFound ? index : null, message: success[0] || '', debug };
    }
    if (P.analyzeForm(r.doc, r.url)) {
      return { ok: false, message: 'Portal menampilkan formulir lagi tanpa pesan. Periksa isian entri ini.', debug };
    }
    if (success.length) return { ok: true, verified: false, message: success[0], debug };
    return { ok: true, verified: false, uncertain: true, message: 'Respons portal tidak dikenali. Cek daftar log di portal.', debug };
  };

  // ---------------------------------------------------------------------------
  // Reading the log list page

  P.readActivityInfo = (doc, exclude) => {
    const labels = {
      tahun: /^tahun semester$/i,
      kelompok: /^kelompok kegiatan$/i,
      nama: /^nama kegiatan$/i,
      waktu: /^waktu$/i,
      durasi: /^durasi(?: jam)?$/i,
    };
    const candidates = [...doc.querySelectorAll('th, td, dt, label, b, strong, h5, h6, p, span, div')].filter(
      (el) => el.children.length <= 1 && clean(el.textContent).length <= 40 && !(exclude && exclude.contains(el)),
    );
    const out = {};
    for (const [key, re] of Object.entries(labels)) {
      const el = candidates.find((c) => re.test(clean(c.textContent).replace(/\s*:$/, '')));
      if (el) out[key] = P.valueNextTo(el);
    }
    return out;
  };

  P.valueNextTo = (el) => {
    const nextFilled = (n) => {
      while (n && !P.textOf(n)) n = n.nextElementSibling;
      return n;
    };
    const cell = el.closest('td, th');
    if (cell) {
      const n = nextFilled(cell.nextElementSibling);
      if (n) return P.textOf(n);
    }
    if (el.tagName === 'DT' && el.nextElementSibling) return P.textOf(el.nextElementSibling);
    let n = nextFilled(el.nextElementSibling);
    if (n) return P.textOf(n);
    let p = el.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      n = nextFilled(p.nextElementSibling);
      if (n) return P.textOf(n);
    }
    return '';
  };

  /** Pick the table that lists log entries (not the activity summary). */
  P.pickLogTable = (doc) => {
    let best = null;
    let bestScore = 0;
    for (const table of doc.querySelectorAll('table')) {
      const head = U.key(P.textOf(table.tHead || table.rows[0]));
      const body = U.key(P.textOf(table));
      let score = 0;
      if (/keterangan|topik|uraian/.test(head)) score += 3;
      if (/tanggal|waktu/.test(head)) score += 2;
      if (/lokasi|jenis|bukti/.test(head)) score += 1;
      if (/nama kegiatan/.test(body) && /kelompok kegiatan/.test(body)) score -= 10;
      for (const tr of table.querySelectorAll('tbody tr')) if (D.findDates(P.textOf(tr)).length) score += 0.1;
      if (score > bestScore) {
        best = table;
        bestScore = score;
      }
    }
    return best;
  };

  /**
   * Fallback when the log list is not a table (cards, timeline, list group):
   * dated items inside the card titled exactly "Log Aktivitas".
   */
  P.logItemsWithoutTable = (doc) => {
    const heading = [...doc.querySelectorAll('h1, h2, h3, h4, h5, h6, .card-title')].find((el) => /^log aktivitas$/i.test(P.textOf(el)));
    if (!heading) return null;
    const box = heading.closest('.card') || heading.parentElement;
    if (!box) return null;
    const items = [...box.querySelectorAll('.timeline-item, .list-group-item, li, .callout, article, .card-body > .row, .card-body > div')]
      .filter((el) => D.findDates(P.textOf(el)).length)
      // keep the innermost dated items only
      .filter((el, _, all) => !all.some((other) => other !== el && el.contains(other)));
    return items.map((el) => {
      const text = P.textOf(el);
      return { dates: D.findDates(text), text };
    });
  };

  P.parseIndex = (doc) => {
    const table = P.pickLogTable(doc);
    let entries = [];
    if (table) {
      const rows = table.tBodies.length ? [...table.tBodies].flatMap((b) => [...b.rows]) : [...table.rows].slice(1);
      for (const tr of rows) {
        const text = P.textOf(tr);
        const dates = D.findDates(text);
        if (dates.length) entries.push({ dates, text });
      }
    }
    let listFound = Boolean(table);
    if (!table) {
      const items = P.logItemsWithoutTable(doc);
      if (items && items.length) {
        entries = items;
        listFound = true;
      }
    }
    const info = P.readActivityInfo(doc, table);
    const range = D.findDates(info.waktu || '').sort();
    const period = range.length >= 2 ? { from: range[0], to: range[range.length - 1] } : null;
    return { info, entries, period, tableFound: listFound, messages: P.extractMessages(doc) };
  };

  P.loadIndex = async (ctx) => {
    const r = await P.fetchDoc(ctx.indexUrl, {}, { ajax: false });
    if (r.login) throw new AlbError('session', 'Sesi login Student Portal sudah habis. Login lagi, lalu buka ulang halaman ini.');
    if (!r.res.ok) throw new AlbError('http', `Daftar log tidak bisa dimuat (HTTP ${r.res.status}).`);
    return P.parseIndex(r.doc);
  };

  // ---------------------------------------------------------------------------
  // Diagnostics (no tokens, no personal values)

  const mask = (s) => (s && s.length > 8 ? `${s.slice(0, 4)}…${s.slice(-2)}` : s ? '…' : s);

  P.describeForm = (model) => {
    if (!model) return null;
    return {
      action: new URL(model.action).pathname,
      method: model.method,
      dateFormat: model.dateFormat,
      missing: model.missing,
      unknownRequired: model.unknownRequired,
      maxLen: model.maxLen,
      accept: model.accept,
      tipe: model.tipe.map((t) => ({ value: t.value, label: t.label, kind: t.kind })),
      dosenCount: model.dosen.length,
      jenisOptions: model.jenisOptions,
      fields: [...model.form.elements].map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || '',
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        label: (el.getAttribute('type') || '') === 'hidden' ? '' : U.truncate(P.labelText(model.form, el), 40),
      })),
    };
  };

  P.diagnostics = ({ ctx, model, formError, index, indexError, lastSubmit }) => ({
    tool: `Auto Logbook IPB ${U.VERSION}`,
    when: new Date().toISOString(),
    page: { kind: ctx.kind, aktivitasId: mask(ctx.aktivitasId), tambahFromPage: ctx.tambahFromPage, tambahPath: ctx.tambahUrl ? new URL(ctx.tambahUrl).pathname : null },
    form: P.describeForm(model),
    formError: formError ? { code: formError.code, message: formError.message } : null,
    index: index
      ? { tableFound: index.tableFound, entries: index.entries.length, period: index.period, infoKeys: Object.keys(index.info) }
      : null,
    indexError: indexError ? { code: indexError.code, message: indexError.message } : null,
    lastSubmit: lastSubmit || null,
    userAgent: navigator.userAgent,
  });
})(globalThis.ALB);
