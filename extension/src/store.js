/*
 * Auto Logbook IPB: extension storage and file helpers.
 * Everything is kept in chrome.storage.local on this device only.
 */
(function (ALB) {
  'use strict';

  const U = ALB.util;
  const S = (ALB.store = {});

  S.KEYS = {
    settings: 'alb.settings',
    data: 'alb.data',
    bukti: 'alb.bukti',
    history: 'alb.history',
    openRequest: 'alb.openRequest',
  };

  const area = () => globalThis.chrome && chrome.storage && chrome.storage.local;

  S.get = async (key, fallback) => {
    try {
      const a = area();
      if (!a) return fallback;
      const out = await a.get(key);
      return out[key] === undefined ? fallback : out[key];
    } catch (err) {
      console.warn('[Auto Logbook] storage read failed', err);
      return fallback;
    }
  };

  S.set = async (key, value) => {
    try {
      const a = area();
      if (!a) return false;
      await a.set({ [key]: value });
      return true;
    } catch (err) {
      console.warn('[Auto Logbook] storage write failed', err);
      return false;
    }
  };

  S.remove = async (key) => {
    try {
      const a = area();
      if (a) await a.remove(key);
    } catch (err) {
      console.warn('[Auto Logbook] storage remove failed', err);
    }
  };

  // ---------------------------------------------------------------------------
  // Files

  const F = (ALB.files = {});

  // chrome.storage.local holds 10 MB and base64 adds a third, so keep stored files small.
  F.MAX_STORED_BYTES = 4 * 1024 * 1024;

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  F.toRecord = async (file) => ({
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    lastModified: file.lastModified || Date.now(),
    data: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
  });

  F.fromRecord = (rec) => new File([base64ToBytes(rec.data)], rec.name, { type: rec.type, lastModified: rec.lastModified });

  F.isImage = (file) => /^image\/(jpeg|png|webp|bmp)$/i.test(file.type || '');

  /** Does a file satisfy an `accept` attribute such as "image/*,.pdf"? */
  F.accepts = (file, accept) => {
    const tokens = String(accept || '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!tokens.length) return true;
    const name = (file.name || '').toLowerCase();
    const type = (file.type || '').toLowerCase();
    return tokens.some((t) => {
      if (t.startsWith('.')) return name.endsWith(t);
      if (t.endsWith('/*')) return type.startsWith(t.slice(0, -1));
      return type === t;
    });
  };

  /**
   * Re-encode large photos as JPEG (longest side <= maxSide) so uploads stay
   * small. Returns the original file when it is small, not an image, or when
   * re-encoding would not help.
   */
  F.shrinkImage = async (file, { maxBytes = 1024 * 1024, maxSide = 1920, quality = 0.82 } = {}) => {
    if (!F.isImage(file) || file.size <= maxBytes || typeof createImageBitmap !== 'function') return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      let blob;
      if (typeof OffscreenCanvas === 'function') {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      }
      bitmap.close && bitmap.close();
      if (!blob || blob.size >= file.size) return file;
      const name = file.name.replace(/\.(jpe?g|png|webp|bmp)$/i, '') + '.jpg';
      return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
    } catch (err) {
      console.warn('[Auto Logbook] could not shrink image', err);
      return file;
    }
  };

  F.describe = (file) => `${file.name} · ${U.formatBytes(file.size)}`;
})(globalThis.ALB);
