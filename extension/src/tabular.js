/*
 * Auto Logbook IPB: turn pasted text, CSV/TSV files or clipboard HTML into a
 * { headers, rows } table.
 */
(function (ALB) {
  'use strict';

  const U = ALB.util;
  const T = (ALB.tabular = {});

  /** Count delimiter characters in the first line, ignoring quoted sections. */
  function countOutsideQuotes(line, ch) {
    let n = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') quoted = !quoted;
      else if (c === ch && !quoted) n++;
    }
    return n;
  }

  /** Tab wins when present (spreadsheet clipboard); otherwise the more frequent of ; and , */
  T.detectDelimiter = (text) => {
    const first = String(text).split(/\r?\n/).find((l) => l.trim()) || '';
    if (countOutsideQuotes(first, '\t') > 0) return '\t';
    const semi = countOutsideQuotes(first, ';');
    const comma = countOutsideQuotes(first, ',');
    return semi > comma ? ';' : ',';
  };

  /** RFC 4180-style parser: quoted fields may contain delimiters, quotes ("") and newlines. */
  T.parseDelimited = (text, delimiter) => {
    const s = String(text ?? '').replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let atFieldStart = true;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
          }
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"' && atFieldStart) {
        quoted = true;
        atFieldStart = false;
      } else if (c === delimiter) {
        row.push(field);
        field = '';
        atFieldStart = true;
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        atFieldStart = true;
      } else {
        field += c;
        atFieldStart = false;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  };

  T.parseText = (text) => T.parseDelimited(text, T.detectDelimiter(text));

  /** Parse the first <table> of clipboard HTML (Google Sheets / Excel). Browser only. */
  T.parseHtmlTable = (html) => {
    if (!html || typeof DOMParser === 'undefined') return null;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return null;
    const rows = [];
    for (const tr of table.querySelectorAll('tr')) {
      const out = [];
      for (const cell of tr.querySelectorAll('td, th')) {
        const clone = cell.cloneNode(true);
        for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
        for (const block of clone.querySelectorAll('p, div, li')) block.append('\n');
        out.push(clone.textContent.replace(/ /g, ' ').replace(/\n+$/, ''));
        const span = Math.min(Number(cell.getAttribute('colspan')) || 1, 50);
        for (let k = 1; k < span; k++) out.push('');
      }
      rows.push(out);
    }
    return rows;
  };

  /** "Kolom A", "Kolom B", ... "Kolom AA" */
  T.letterName = (i) => {
    let s = '';
    let n = i + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return `Kolom ${s}`;
  };

  function isDataLike(v) {
    const D = ALB.dates;
    return Boolean(D.isDateLike(v) || D.parseTime(v) || D.parseTimeRange(v));
  }

  /** Does the first row look like column titles rather than data? */
  T.looksLikeHeader = (row, nextRows) => {
    const cells = row.map(U.norm);
    const filled = cells.filter(Boolean);
    if (!filled.length) return false;
    if (filled.some(isDataLike)) return false;
    if (filled.some((c) => ALB.mapping.isKnownHeader(c))) return true;
    const next = nextRows.find((r) => r.some((c) => U.norm(c)));
    if (!next) return false;
    return next.some((c, i) => cells[i] && isDataLike(U.norm(c)));
  };

  /**
   * Normalize raw rows into { headers, rows, hasHeader, reusedHeaders }.
   * When the paste has no header row and the column count matches the last
   * data set, the previous headers are reused so the saved mapping still applies.
   */
  T.toTable = (rawRows, savedHeaders) => {
    let rows = (rawRows || []).map((r) => r.map((c) => String(c ?? '')));
    rows = rows.filter((r) => r.some((c) => U.norm(c)));
    if (!rows.length) return null;

    const rawWidth = Math.max(...rows.map((r) => r.length));
    let width = rawWidth;
    // Drop trailing columns that are empty everywhere (common in clipboard copies).
    while (width > 1 && rows.every((r) => !U.norm(r[width - 1]))) width--;

    const hasHeader = T.looksLikeHeader(rows[0], rows.slice(1, 4));
    // A header-less copy of the same sheet keeps its trailing empty cells, so
    // compare against the untrimmed width before deciding to reuse old headers.
    const reuse = !hasHeader && Array.isArray(savedHeaders) && savedHeaders.length >= width && savedHeaders.length === rawWidth;
    if (reuse) width = savedHeaders.length;
    rows = rows.map((r) => {
      const out = r.slice(0, width);
      while (out.length < width) out.push('');
      return out;
    });

    let headers;
    let data;
    let reusedHeaders = false;
    if (hasHeader) {
      headers = rows[0].map(U.norm);
      data = rows.slice(1);
    } else if (reuse) {
      headers = savedHeaders.slice();
      data = rows;
      reusedHeaders = true;
    } else {
      headers = rows[0].map((_, i) => T.letterName(i));
      data = rows;
    }

    // Unique, non-empty header names.
    const seen = new Map();
    headers = headers.map((h, i) => {
      let name = U.norm(h) || T.letterName(i);
      const k = U.key(name) || name;
      const n = (seen.get(k) || 0) + 1;
      seen.set(k, n);
      if (n > 1) name = `${name} (${n})`;
      return name;
    });

    return { headers, rows: data, hasHeader, reusedHeaders };
  };

  /** Prefer clipboard HTML when plain text does not split into columns. */
  T.fromClipboard = (text, html) => {
    let rows = text ? T.parseText(text) : [];
    const columns = rows.length ? Math.max(...rows.map((r) => r.length)) : 0;
    if (columns < 2 && html) {
      const fromHtml = T.parseHtmlTable(html);
      if (fromHtml && fromHtml.length) rows = fromHtml;
    }
    return rows;
  };

  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  /** CSV text from rows (used for the downloadable template). */
  T.toCsv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
})(globalThis.ALB);
