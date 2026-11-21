/*
 * Auto Logbook IPB: shared namespace and small helpers.
 *
 * Every source file is a classic script that adds to `globalThis.ALB`, so the
 * extension needs no bundler and the pure modules can be loaded by Node tests.
 */
(function (root) {
  'use strict';

  const ALB = (root.ALB = root.ALB || {});
  const U = (ALB.util = {});

  U.VERSION = '0.1.0';

  /** Collapse whitespace (including NBSP) and trim. */
  U.norm = (value) =>
    String(value ?? '')
      .normalize('NFKC')
      .replace(/[\s ]+/g, ' ')
      .trim();

  /** Lowercase ASCII key for fuzzy matching: "Work  Date:" -> "work date". */
  U.key = (value) =>
    String(value ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  U.words = (value) => U.key(value).split(' ').filter(Boolean);

  U.pad2 = (n) => String(n).padStart(2, '0');

  U.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** FNV-1a 32-bit hash as 8 hex chars; stable short key for de-duplication. */
  U.hash = (value) => {
    let h = 0x811c9dc5;
    const s = String(value ?? '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  /** Today's local date as YYYY-MM-DD. */
  U.todayIso = (now = new Date()) =>
    `${now.getFullYear()}-${U.pad2(now.getMonth() + 1)}-${U.pad2(now.getDate())}`;

  U.formatBytes = (n) => {
    if (!Number.isFinite(n)) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  };

  U.uniq = (items) => [...new Set(items)];

  /** Keep the first `max` chars, cutting at a word boundary when possible. */
  U.truncate = (text, max) => {
    const s = String(text ?? '');
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
  };

  /** Clean multi-line free text: trim line ends, drop blank edges, max one empty line in a row. */
  U.cleanMultiline = (text) =>
    String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+$/, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  /** Error type carrying a machine-readable code for the UI. */
  class AlbError extends Error {
    constructor(code, message, detail) {
      super(message);
      this.name = 'AlbError';
      this.code = code;
      this.detail = detail;
    }
  }
  ALB.AlbError = AlbError;
})(globalThis);
