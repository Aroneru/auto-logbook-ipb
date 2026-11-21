// End-to-end test: the real (unmodified) extension in headless Chrome against a
// local mock of studentportal.ipb.ac.id. Chrome resolves the portal host to the
// mock, so nothing ever reaches the real portal.
//
// Requires: Chrome, Node >= 22, openssl (see test/mock-portal/cert.mjs).
// Usage: node test/e2e/run.mjs   (screenshots go to $E2E_OUT or <tmp>/alb-e2e)
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { launch } from '../../tools/cdp.mjs';
import { makeCert } from '../mock-portal/cert.mjs';
import { startMockPortal } from '../mock-portal/server.mjs';
import { LOGBOOK, sheetsClipboard } from '../unit/load.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.E2E_OUT || join(tmpdir(), 'alb-e2e');
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.E2E_PORT || 9443);
const HOST = 'https://studentportal.ipb.ac.id';

/** Build a small .xlsx (deflated entries, shared strings, date + time styles). */
function makeXlsx() {
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Logbook" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="20"/></cellXfs></styleSheet>',
    'xl/sharedStrings.xml': '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Tanggal</t></si><si><t>Mulai</t></si><si><t>Selesai</t></si><si><t>Keterangan</t></si><si><r><t>Rapat </t></r><r><t>koordinasi</t></r></si></sst>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" s="1"><v>46209</v></c><c r="B2" s="2"><v>0.333333333333333</v></c><c r="C2" s="2"><v>0.6875</v></c><c r="D2" t="s"><v>4</v></c></row><row r="4"><c r="A4" s="1"><v>46210</v></c><c r="D4" t="inlineStr"><is><t>Inline teks</t></is></c></row></sheetData></worksheet>',
  };
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8');
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  ✔ ${name} (${Date.now() - t} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  ✖ ${name}\n    ${String((err && err.message) || err).split('\n').join('\n    ')}`);
    throw err;
  }
}

const portal = await startMockPortal({ port: PORT, ...makeCert() });
const browser = await launch({
  args: [
    `--host-resolver-rules=MAP studentportal.ipb.ac.id:443 127.0.0.1:${PORT}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
    '--ignore-certificate-errors',
  ],
});

let page;
const SR = `document.querySelector('alb-root').shadowRoot`;
const q = (sel) => `${SR}.querySelector(${JSON.stringify(sel)})`;
const ev = (expr) => page.evaluate(expr);
const ext = (expr) => page.evaluate(expr, { world: 'extension' });

async function serverState() {
  // Node's fetch rejects the self-signed cert; ask the page (which trusts it) instead.
  return ev(`fetch('/__test/state').then(r => r.json())`);
}

async function waitUntil(expr, { timeout = 20000, world = 'main', label = expr } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await page.evaluate(expr, { world });
      if (last) return last;
    } catch (err) {
      last = err.message;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timeout: ${label} (last: ${JSON.stringify(last)})`);
}

async function shot(name) {
  await page.screenshot(join(OUT, `${name}.png`));
}

async function pasteTsv(text) {
  return ev(`(() => {
    const ta = ${q('textarea.paste')};
    ta.focus();
    const dt = new DataTransfer();
    dt.setData('text/plain', ${JSON.stringify(text)});
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
    ta.dispatchEvent(e);
    return e.defaultPrevented;
  })()`);
}

async function setFileInput(selector, { name, type, bytes }) {
  return ev(`(async () => {
    const input = ${q(selector)};
    const dt = new DataTransfer();
    let blob;
    if (${JSON.stringify(type)} === 'image/jpeg') {
      const c = new OffscreenCanvas(${bytes || 1600}, ${bytes ? Math.round(bytes * 0.75) : 1200});
      const g = c.getContext('2d');
      for (let i = 0; i < 400; i++) { g.fillStyle = 'hsl(' + (i * 37 % 360) + ',70%,50%)'; g.fillRect(Math.random() * c.width, Math.random() * c.height, 80, 80); }
      blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
    } else blob = new Blob([], { type: ${JSON.stringify(type)} });
    dt.items.add(new File([blob], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return blob.size;
  })()`);
}

async function clickFk(fk) {
  const ok = await ev(`(() => { const b = ${SR}.querySelector('[data-fk="${fk}"]'); if (!b || b.disabled) return false; b.click(); return true; })()`);
  assert.ok(ok, `button ${fk} missing or disabled`);
}

async function runFinished() {
  await waitUntil('ALB.panel.s.run === null && ALB.panel.s.lastRun !== null', { world: 'extension', timeout: 60000, label: 'run finished' });
}

console.log('Auto Logbook IPB: end-to-end');
try {
  await step('load unpacked extension', async () => {
    // E2E_EXT_DIR lets the same run check an extracted release zip.
    const { id } = await browser.send('Extensions.loadUnpacked', { path: process.env.E2E_EXT_DIR || join(root, 'extension') });
    assert.match(id, /^[a-p]{32}$/);
  });

  // 1280x800 is the Chrome Web Store screenshot size.
  page = await browser.newPage('about:blank', { width: Number(process.env.E2E_W || 1366), height: Number(process.env.E2E_H || 900) });

  await step('launcher appears next to "Tambah" on the log page', async () => {
    await page.goto(`${HOST}${portal.indexPath}`);
    await waitUntil(`document.querySelector('.alb-launch') !== null`);
    assert.equal(await ev(`document.querySelector('.alb-launch').nextElementSibling.textContent.trim()`), 'Tambah');
    await shot('01-portal-with-launcher');
  });

  await step('panel opens and reads the portal form', async () => {
    await ev(`document.querySelector('.alb-launch').click()`);
    await waitUntil(`${q('dialog.alb')}?.open === true`);
    await waitUntil('Boolean(ALB.panel.s.model) && Boolean(ALB.panel.s.index)', { world: 'extension' });
    const info = await ext(`({
      jenis: ALB.panel.s.model.jenisOptions.length,
      dosen: ALB.panel.s.model.dosen.map(d => d.label),
      tipe: ALB.panel.s.model.tipe.map(t => t.kind),
      dateFormat: ALB.panel.s.model.dateFormat,
      maxLen: ALB.panel.s.model.maxLen.keterangan,
      missing: ALB.panel.s.model.missing,
      period: ALB.panel.period(),
      name: ALB.panel.s.index.info.nama,
      tableFound: ALB.panel.s.index.tableFound,
      focused: ${SR}.activeElement && ${SR}.activeElement.className,
    })`);
    assert.equal(info.jenis, 4);
    assert.deepEqual(info.dosen, ['Dr. Budi Santoso, M.Kom. - 197901012005011001', 'Dr. Siti Rahmawati, M.T. - 198502022010122002']);
    assert.deepEqual(info.tipe, ['hybrid', 'offline', 'online']);
    assert.equal(info.dateFormat, 'DD/MM/YYYY');
    assert.equal(info.maxLen, 1000);
    assert.deepEqual(info.missing, []);
    assert.deepEqual(info.period, { from: '2026-07-06', to: '2026-12-10' });
    assert.equal(info.name, 'Magang di PT Contoh Teknologi');
    assert.equal(info.tableFound, true);
    assert.equal(info.focused, 'paste', 'paste box should have focus on open');
    await shot('02-panel-data-empty');
  });

  await step('pasting the Google Sheets rows builds 5 entries', async () => {
    assert.equal(await pasteTsv(sheetsClipboard(LOGBOOK)), true);
    await waitUntil('ALB.panel.s.entries.length === 5', { world: 'extension' });
    const s = await ext(`({ tab: ALB.panel.s.tab, order: ALB.panel.s.order, tpl: ALB.panel.s.settings.template, issues: ALB.panel.issues() })`);
    assert.equal(s.tab, 'settings');
    assert.equal(s.order.order, 'MDY');
    assert.equal(s.tpl, '{Task}\n{Notes}');
    assert.deepEqual(s.issues, ['Pilih file bukti aktivitas.']);
    await shot('03-settings-after-paste');
  });

  await step('settings: proof photo, locations, second lecturer', async () => {
    const size = await setFileInput('input[type=file]:not([multiple])', { name: 'kartu-magang.jpg', type: 'image/jpeg', bytes: 2600 });
    assert.ok(size > 0);
    await waitUntil('ALB.panel.s.bukti !== null', { world: 'extension' });
    await ev(`(() => {
      const set = (fk, v) => { const el = ${SR}.querySelector('[data-fk="' + fk + '"]'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
      set('loc-text-0', 'Kantor Pusat PT Contoh, Jakarta');
      set('loc-text-1', 'Work From Anywhere (Bogor)');
    })()`);
    await waitUntil(`ALB.panel.s.settings.locMap['wfa'].lokasi === 'Work From Anywhere (Bogor)'`, { world: 'extension' });
    const s = await ext(`({ issues: ALB.panel.issues(), loc: ALB.panel.s.settings.locMap, statuses: ALB.panel.s.entries.map(e => e.status) })`);
    assert.deepEqual(s.issues, []);
    assert.equal(s.loc['head office on site'].tipe, 'offline');
    assert.equal(s.loc['wfa'].tipe, 'online');
    assert.deepEqual(s.statuses, ['ready', 'ready', 'ready', 'ready', 'ready']);
    await ev(`${SR}.querySelector('[data-fk="dosen-1"]').click()`);
    await waitUntil('ALB.panel.s.settings.dosen.length === 2', { world: 'extension' });
    await shot('04-settings-complete');
  });

  await step('send tab lists 5 ready entries', async () => {
    await ev(`${SR}.querySelector('#alb-tab-send').click()`);
    await waitUntil(`${SR}.querySelectorAll('tbody tr').length === 5`);
    const label = await ev(`${SR}.querySelector('[data-fk="send-all"]').textContent`);
    assert.equal(label, 'Kirim 5 entri');
    await shot('05-send-ready');
  });

  await step('payload preview matches the portal form fields', async () => {
    await clickFk('preview');
    await waitUntil(`${SR}.querySelectorAll('dialog.sub[open] tbody tr').length > 5`);
    const rows = await ev(`[...${SR}.querySelectorAll('dialog.sub tbody tr')].map(tr => [tr.cells[0].textContent, tr.cells[1].textContent])`);
    const get = (n) => rows.filter((r) => r[0] === n).map((r) => r[1]);
    assert.deepEqual(get('Waktu'), ['06/07/2026']);
    assert.deepEqual(get('Tmw'), ['08:00']);
    assert.deepEqual(get('Tsw'), ['16:00']);
    assert.deepEqual(get('JenisLogbookKegiatanKampusMerdekaId'), ['3']);
    assert.deepEqual(get('ListDosenPembimbing[0].Value'), ['true', 'false']);
    assert.deepEqual(get('ListDosenPembimbing[1].Value'), ['true', 'false']);
    assert.deepEqual(get('IsLuring'), ['true']);
    assert.deepEqual(get('Lokasi'), ['Kantor Pusat PT Contoh, Jakarta']);
    assert.equal(get('Keterangan')[0], 'Orientasi dan penyusunan rencana kerja magang\n- Orientasi tim dan alur kerja\n- Menyusun rencana kerja');
    assert.deepEqual(get('__RequestVerificationToken'), ['••••••']);
    assert.match(get('File')[0], /^kartu-magang\.jpg \(/);
    await shot('06-payload-preview');
    await ev(`${SR}.querySelector('dialog.sub').close()`);
  });

  await step('"Kirim 1 dulu" sends exactly one verified entry', async () => {
    await clickFk('send-one');
    await runFinished();
    const st = await serverState();
    assert.equal(st.entries.length, 1);
    const e = st.entries[0];
    assert.equal(e.date, '2026-07-06');
    assert.equal(e.tmw, '08:00');
    assert.equal(e.tsw, '16:00');
    assert.equal(e.jenis, '3');
    assert.deepEqual(e.dosen, ['77', '78']);
    assert.equal(e.tipe, 'Offline');
    assert.equal(e.lokasi, 'Kantor Pusat PT Contoh, Jakarta');
    assert.equal(e.fileName, 'kartu-magang.jpg');
    assert.equal(e.fileType, 'image/jpeg');
    assert.equal(st.submissions[0].xrw, 'XMLHttpRequest');
    const first = await ext(`({ status: ALB.panel.s.entries[0].status, verified: ALB.panel.s.entries[0].result && ALB.panel.s.entries[0].result.verified })`);
    const debug = await ext('ALB.panel.lastSubmit');
    assert.deepEqual(first, { status: 'done', verified: true }, `last submit: ${JSON.stringify(debug)}`);
  });

  await step('sending the rest delivers all 5, WFA rows as Online', async () => {
    await clickFk('send-all');
    await runFinished();
    const st = await serverState();
    assert.equal(st.entries.length, 5);
    assert.deepEqual(st.entries.map((e) => e.date), ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10']);
    assert.equal(st.entries[2].tipe, 'Online');
    assert.equal(st.entries[2].lokasi, 'Work From Anywhere (Bogor)');
    assert.equal(st.entries[4].tsw, '22:00');
    const statuses = await ext(`ALB.panel.s.entries.map(e => e.status + (e.result && e.result.verified ? '+' : ''))`);
    assert.deepEqual(statuses, ['done+', 'done+', 'done+', 'done+', 'done+']);
    await shot('07-send-done');
  });

  await step('after reload, the same data is recognised as already on the portal', async () => {
    await page.goto(`${HOST}${portal.indexPath}`);
    await waitUntil(`document.querySelector('.alb-launch') !== null`);
    await ev(`document.querySelector('.alb-launch').click()`);
    await waitUntil('Boolean(ALB.panel.s.model) && ALB.panel.s.entries.length === 5', { world: 'extension' });
    const s = await ext(`({ tab: ALB.panel.s.tab, statuses: ALB.panel.s.entries.map(e => e.status), queue: ALB.panel.queue().length })`);
    assert.equal(s.tab, 'send');
    assert.deepEqual(s.statuses, ['exists', 'exists', 'exists', 'exists', 'exists']);
    assert.equal(s.queue, 0);
    await shot('08-reload-all-exist');
  });

  await step('header-less paste reuses the saved headers; portal rejections are reported', async () => {
    await ev(`${SR}.querySelector('#alb-tab-data').click()`);
    const extra = [
      ['Pengujian modul stok - Inventaris', 'Completed', '11/20/2026', '8:00:00 AM', '10:00:00 PM', '', '', '', '', 'WFA', '- Uji alur penerimaan barang', '', ''],
      ['Presentasi akhir', 'Not started', '12/12/2026', '8:00:00 AM', '4:00:00 PM', '', '', '', '', 'Head Office (On-Site)', '', '', ''],
    ];
    assert.equal(await pasteTsv(sheetsClipboard(extra)), true);
    await waitUntil('ALB.panel.s.entries.length === 2', { world: 'extension' });
    const s = await ext(`({ reused: ALB.panel.s.data.reusedHeaders, entries: ALB.panel.s.entries.map(e => ({ date: e.date, status: e.status, flags: e.flags })), queue: ALB.panel.queue().map(e => e.date) })`);
    assert.equal(s.reused, true);
    assert.equal(s.entries[0].status, 'ready');
    assert.equal(s.entries[1].status, 'warn');
    assert.equal(s.entries[1].flags.outOfPeriod, true);
    assert.deepEqual(s.queue, ['2026-11-20'], 'out-of-period row is not picked by default');
    // Pick the out-of-period row anyway: the portal must reject it and the message must surface.
    await ext(`ALB.panel.s.picks.set(ALB.panel.s.entries[1].key, true)`);
    await ext(`ALB.panel.render()`);
    await clickFk('send-all');
    await runFinished();
    const after = await ext(`ALB.panel.s.entries.map(e => ({ status: e.status, msg: e.result && e.result.message }))`);
    assert.equal(after[0].status, 'done');
    assert.equal(after[1].status, 'failed');
    assert.match(after[1].msg, /di luar periode/);
    const st = await serverState();
    assert.equal(st.entries.length, 6);
    await shot('09-rejection-reported');
  });

  await step('an empty proof file is rejected by the form re-render and reported', async () => {
    await ev(`${SR}.querySelector('#alb-tab-settings').click()`);
    await waitUntil(`${SR}.querySelector('[data-fk="bukti-change"]') !== null`);
    await setFileInput('input[type=file]:not([multiple])', { name: 'kosong.pdf', type: 'application/pdf' });
    await waitUntil(`ALB.panel.s.bukti && ALB.panel.s.bukti.name === 'kosong.pdf'`, { world: 'extension' });
    await ev(`${SR}.querySelector('#alb-tab-data').click()`);
    await pasteTsv(sheetsClipboard([['Uji file kosong', 'Completed', '11/19/2026', '8:00:00 AM', '4:00:00 PM', '', '', '', '', 'WFA', '', '', '']]));
    await waitUntil('ALB.panel.s.entries.length === 1 && ALB.panel.s.tab === "send"', { world: 'extension' });
    await clickFk('send-all');
    await runFinished();
    const r = await ext(`({ status: ALB.panel.s.entries[0].status, msg: ALB.panel.s.entries[0].result.message })`);
    assert.equal(r.status, 'failed');
    assert.match(r.msg, /Bukti aktivitas wajib diunggah/);
  });

  await step('an expired session stops the run with a clear message', async () => {
    await ev(`fetch('/__test/expire')`);
    await clickFk('send-all');
    await runFinished();
    const r = await ext(`({ notice: ALB.panel.s.notice, status: ALB.panel.s.entries[0].status, last: ALB.panel.s.lastRun })`);
    assert.equal(r.status, 'failed');
    assert.match(r.notice.text, /Sesi login/);
    assert.equal(r.last.stoppedBy, 'session');
    await shot('10-session-expired');
    await ev(`fetch('/__test/expire?on=0')`);
  });

  await step('activity list page offers the log link and opens the panel there', async () => {
    await page.goto(`${HOST}/Kegiatan/AktivitasKampusMerdeka`);
    await waitUntil(`document.querySelector('alb-fab') !== null`);
    await ev(`document.querySelector('alb-fab').shadowRoot.querySelector('button').click()`);
    await waitUntil(`${q('.link-item')} !== null`);
    await shot('11-activity-picker');
    await ev(`${q('.link-item')}.click()`);
    await waitUntil(`location.pathname.includes('/LogAktivitasKampusMerdeka/Index/') && document.querySelector('alb-root') && ${q('dialog.alb')}.open`, { timeout: 20000 });
  });

  await step('xlsx reader: deflated sheet, shared/rich/inline strings, date and time styles', async () => {
    const b64 = makeXlsx().toString('base64');
    const rows = await ext(`(async () => {
      const bin = atob(${JSON.stringify(b64)});
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return ALB.xlsx.read(bytes.buffer);
    })()`);
    assert.deepEqual(rows, [
      ['Tanggal', 'Mulai', 'Selesai', 'Keterangan'],
      ['2026-07-06', '08:00', '16:30', 'Rapat koordinasi'],
      [],
      ['2026-07-07', '', '', 'Inline teks'],
    ]);
  });

  await step('portal parsers cope with other markup (minified table, cards, renamed fields, alerts)', async () => {
    const r = await ext(`(() => {
      const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
      const out = {};

      const minified = parse('<table><thead><tr><th>No</th><th>Tanggal</th><th>Keterangan</th></tr></thead><tbody><tr><td>1</td><td>06/07/2026</td><td>Rapat<br>koordinasi</td></tr></tbody></table>');
      out.minified = ALB.portal.parseIndex(minified).entries;

      const cards = parse('<div class="card"><div class="card-header"><h3 class="card-title">Log Aktivitas</h3><a class="btn">Tambah</a></div><div class="card-body">' +
        '<div class="timeline-item"><span>Senin, 06 Juli 2026</span> <p>Rapat koordinasi</p></div>' +
        '<div class="timeline-item"><span>07 Juli 2026</span> <p>Laporan mingguan</p></div></div></div>');
      const ci = ALB.portal.parseIndex(cards);
      out.cards = { found: ci.tableFound, dates: ci.entries.map(e => e.dates[0]) };

      const form = parse('<form action="/Log/Simpan" method="post">' +
        '<input type="hidden" name="__RequestVerificationToken" value="tok">' +
        '<div class="form-group"><label>Tanggal</label><input name="TanggalLog" placeholder="Tanggal"></div>' +
        '<input name="JamMulai" placeholder="Waktu Mulai"><input name="JamSelesai" placeholder="Waktu Selesai">' +
        '<div class="form-group"><label for="j">Jenis Kegiatan</label><select id="j" name="JenisId"><option value="">-- Pilih --</option><option value="9">Berita Acara Kegiatan</option></select></div>' +
        '<label><input type="checkbox" name="Dosen[0].Dipilih" value="true"> Dr. Contoh</label>' +
        '<label><input type="radio" name="Mode" value="L"> Offline</label><label><input type="radio" name="Mode" value="D"> Online</label><label><input type="radio" name="Mode" value="H"> Hybrid</label>' +
        '<input name="Tempat" placeholder="Lokasi"><textarea name="Uraian" placeholder="Topik"></textarea><input type="file" name="Lampiran"></form>');
      const m = ALB.portal.analyzeForm(form, 'https://studentportal.ipb.ac.id/Log/Tambah');
      const entry = { date: '2026-07-06', start: '08:00', end: '16:00', jenis: { value: '9', text: 'Berita Acara Kegiatan' }, tipe: 'online', lokasi: 'Rumah', keterangan: 'Uji' };
      const { fd } = ALB.portal.buildPayload(m, entry, new File(['x'], 'b.jpg', { type: 'image/jpeg' }), { dosen: ['Dr. Contoh'] });
      out.form = {
        missing: m.missing,
        action: m.action,
        tipe: m.tipe.map(t => t.kind),
        dosen: m.dosen.map(d => d.label),
        sent: [...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]),
      };

      const alerts = parse('<script>$(function(){ toastr.error("Tanggal sudah terisi"); Swal.fire({ icon: \\'error\\', title: \\'Gagal\\', text: \\'File terlalu besar\\' }); toastr.success(\\'Tersimpan\\'); });<\\/script>');
      out.alerts = ALB.portal.extractMessages(alerts);

      const row = parse('<table><tr><td>1</td><td>Magang X</td><td>2026/2027 Ganjil</td><td><a href="#">Detail</a> <a href="/Kegiatan/LogAktivitasKampusMerdeka/Index/abc">Log</a></td></tr></table>');
      out.label = ALB.portal.rowLabel(row.querySelector('a[href*="Index"]'));
      return out;
    })()`);
    assert.deepEqual(r.minified, [{ dates: ['2026-07-06'], text: '1 06/07/2026 Rapat koordinasi' }]);
    assert.deepEqual(r.cards, { found: true, dates: ['2026-07-06', '2026-07-07'] });
    assert.deepEqual(r.form.missing, []);
    assert.equal(r.form.action, 'https://studentportal.ipb.ac.id/Log/Simpan');
    assert.deepEqual(r.form.tipe, ['offline', 'online', 'hybrid']);
    assert.deepEqual(r.form.dosen, ['Dr. Contoh']);
    assert.deepEqual(r.form.sent, [
      ['__RequestVerificationToken', 'tok'], ['TanggalLog', '06/07/2026'], ['JamMulai', '08:00'], ['JamSelesai', '16:00'],
      ['JenisId', '9'], ['Dosen[0].Dipilih', 'true'], ['Mode', 'D'], ['Tempat', 'Rumah'], ['Uraian', 'Uji'], ['Lampiran', 'b.jpg'],
    ]);
    assert.deepEqual(r.alerts, { errors: ['Tanggal sudah terisi', 'Gagal — File terlalu besar'], success: ['Tersimpan'] });
    assert.equal(r.label, 'Magang X · 2026/2027 Ganjil');
  });

  const anro = process.env.ALB_SAMPLE_XLSX;
  if (anro && existsSync(anro)) {
    await step('xlsx reader: real Excel workbook from another logbook tool', async () => {
      const b64 = readFileSync(anro).toString('base64');
      const rows = await ext(`(async () => {
        const bin = atob(${JSON.stringify(b64)});
        return ALB.xlsx.read(Uint8Array.from(bin, c => c.charCodeAt(0)).buffer);
      })()`);
      console.log('    first rows:', JSON.stringify(rows.slice(0, 3)));
      assert.ok(rows.length >= 2);
      assert.ok(rows[0].includes('Keterangan'));
    });
  }
} catch {
  if (page) await shot('zz-failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  await portal.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots: ${OUT}`);
}
