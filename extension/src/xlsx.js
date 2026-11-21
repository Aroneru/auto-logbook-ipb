/*
 * Auto Logbook IPB: minimal .xlsx reader (first visible sheet, values only).
 *
 * An .xlsx file is a ZIP of XML parts. The ZIP directory is read by hand and
 * entries are inflated with the browser's DecompressionStream, so no library
 * is bundled. Dates/times are returned as "YYYY-MM-DD" / "HH:MM" strings.
 */
(function (ALB) {
  'use strict';

  const D = ALB.dates;
  const U = ALB.util;
  const X = (ALB.xlsx = {});

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function readZip(buffer) {
    const dv = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new ALB.AlbError('xlsx', 'File ini bukan .xlsx yang valid.');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const entries = new Map();
    const dec = new TextDecoder();
    for (let n = 0; n < count && off + 46 <= buffer.byteLength; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      const method = dv.getUint16(off + 10, true);
      const size = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true);
      const extraLen = dv.getUint16(off + 30, true);
      const commentLen = dv.getUint16(off + 32, true);
      const local = dv.getUint32(off + 42, true);
      entries.set(dec.decode(u8.subarray(off + 46, off + 46 + nameLen)), { method, size, local });
      off += 46 + nameLen + extraLen + commentLen;
    }
    return { dv, u8, entries };
  }

  async function readEntry(zip, name) {
    const e = zip.entries.get(name);
    if (!e) return null;
    const nameLen = zip.dv.getUint16(e.local + 26, true);
    const extraLen = zip.dv.getUint16(e.local + 28, true);
    const start = e.local + 30 + nameLen + extraLen;
    const data = zip.u8.subarray(start, start + e.size);
    let bytes;
    if (e.method === 0) bytes = data;
    else if (e.method === 8) bytes = await inflateRaw(data);
    else throw new ALB.AlbError('xlsx', 'Kompresi di dalam file .xlsx ini tidak didukung.');
    return new TextDecoder().decode(bytes);
  }

  const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');
  const tags = (node, local) => [...node.getElementsByTagNameNS('*', local)];

  /** "date" | "time" | "datetime" | null for a number format. */
  function formatKind(id, code) {
    if ([14, 15, 16, 17].includes(id) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return 'date';
    if (id === 22) return 'datetime';
    if ([18, 19, 20, 21, 45, 46, 47].includes(id)) return 'time';
    if (!code) return null;
    const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').toLowerCase();
    const hasDate = /[dy]/.test(c);
    const hasTime = /[hs]/.test(c);
    if (hasDate && hasTime) return 'datetime';
    if (hasDate) return 'date';
    if (hasTime) return 'time';
    return null;
  }

  function columnIndex(ref) {
    const letters = (ref.match(/^[A-Z]+/i) || [''])[0].toUpperCase();
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function timeOfDay(fraction) {
    const total = Math.round((fraction - Math.floor(fraction)) * 1440) % 1440;
    return `${U.pad2(Math.floor(total / 60))}:${U.pad2(total % 60)}`;
  }

  /** Read the active sheet into an array of string rows. */
  X.read = async (buffer) => {
    const zip = readZip(buffer);
    const wbText = await readEntry(zip, 'xl/workbook.xml');
    if (!wbText) throw new ALB.AlbError('xlsx', 'Struktur workbook .xlsx tidak dikenali.');
    const wb = parseXml(wbText);
    const date1904 = tags(wb, 'workbookPr').some((p) => /^(1|true)$/i.test(p.getAttribute('date1904') || ''));
    const sheets = tags(wb, 'sheet').filter((s) => (s.getAttribute('state') || 'visible') === 'visible');
    const active = Number((tags(wb, 'workbookView')[0] || { getAttribute: () => 0 }).getAttribute('activeTab') || 0);
    const sheetEl = sheets[active] || sheets[0];

    let target = 'xl/worksheets/sheet1.xml';
    const relsText = await readEntry(zip, 'xl/_rels/workbook.xml.rels');
    const rid =
      sheetEl &&
      (sheetEl.getAttribute('r:id') ||
        sheetEl.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
    if (rid && relsText) {
      const rel = tags(parseXml(relsText), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) {
        const t = rel.getAttribute('Target') || '';
        target = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
      }
    }

    const shared = [];
    const ssText = await readEntry(zip, 'xl/sharedStrings.xml');
    if (ssText) {
      for (const si of tags(parseXml(ssText), 'si')) {
        shared.push(tags(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join(''));
      }
    }

    const styleKinds = new Map();
    const stText = await readEntry(zip, 'xl/styles.xml');
    if (stText) {
      const st = parseXml(stText);
      const custom = new Map(tags(st, 'numFmt').map((n) => [Number(n.getAttribute('numFmtId')), n.getAttribute('formatCode') || '']));
      const cellXfs = tags(st, 'cellXfs')[0];
      if (cellXfs) {
        tags(cellXfs, 'xf').forEach((xf, i) => {
          const id = Number(xf.getAttribute('numFmtId') || 0);
          const kind = formatKind(id, custom.get(id));
          if (kind) styleKinds.set(i, kind);
        });
      }
    }

    const sheetText = await readEntry(zip, target);
    if (!sheetText) throw new ALB.AlbError('xlsx', 'Sheet di file .xlsx tidak ditemukan.');
    const rows = [];
    for (const row of tags(parseXml(sheetText), 'row')) {
      const r = Number(row.getAttribute('r') || rows.length + 1) - 1;
      const out = [];
      for (const c of tags(row, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? columnIndex(ref) : out.length;
        const type = c.getAttribute('t') || 'n';
        const v = (tags(c, 'v')[0] || { textContent: '' }).textContent;
        let value = '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = tags(c, 't').map((t) => t.textContent).join('');
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'str' || type === 'e') value = v;
        else if (v !== '') {
          const num = Number(v);
          const kind = styleKinds.get(Number(c.getAttribute('s') || 0));
          if (kind === 'date' && Number.isFinite(num)) value = D.serialToIso(num, date1904) || v;
          else if (kind === 'datetime' && Number.isFinite(num)) value = `${D.serialToIso(num, date1904)} ${timeOfDay(num)}`;
          else if (kind === 'time' && Number.isFinite(num)) value = timeOfDay(num);
          else value = v;
        }
        out[col] = value;
      }
      for (let i = 0; i < out.length; i++) if (out[i] === undefined) out[i] = '';
      rows[r] = out;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  };
})(globalThis.ALB);
