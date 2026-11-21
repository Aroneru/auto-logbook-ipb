// Try the extension by hand: a normal (visible) Chrome window with the extension
// loaded, on the local mock of studentportal.ipb.ac.id. Chrome resolves only the
// portal host, to the mock, so nothing reaches the real portal or any other site.
// Each run starts fresh: a throwaway Chrome profile and an empty mock portal.
//
// Requires: Chrome, Node >= 22, openssl (see test/mock-portal/cert.mjs).
// Usage: npm run demo   (close the window or press Ctrl+C to stop)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { makeCert } from '../test/mock-portal/cert.mjs';
import { startMockPortal } from '../test/mock-portal/server.mjs';
import { ALB, LOGBOOK } from '../test/unit/load.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'https://studentportal.ipb.ac.id';

let portal;
try {
  portal = await startMockPortal({ port: 0, ...makeCert() });
} catch (err) {
  console.error(`Demo could not start: ${err.message}`);
  process.exit(1);
}
const port = portal.server.address().port;

// Files to try the panel with: the fictional logbook used by the tests, and a proof PDF.
const samples = mkdtempSync(join(tmpdir(), 'alb-demo-'));
const csvPath = join(samples, 'contoh-logbook.csv');
const pdfPath = join(samples, 'bukti-contoh.pdf');
writeFileSync(csvPath, '﻿' + ALB.tabular.toCsv(LOGBOOK));
writeFileSync(pdfPath, samplePdf('Bukti aktivitas - contoh'));

let browser;
let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  if (browser) {
    if (browser.proc.exitCode === null && browser.proc.signalCode === null) await browser.close(); // also deletes the profile
    else {
      try {
        rmSync(browser.userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch {
        /* Windows may keep a file locked for a moment; it is only a temp folder */
      }
    }
  }
  portal.server.closeAllConnections();
  await portal.close();
  rmSync(samples, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGINT', () => stop(0));

try {
  browser = await launch({
    headless: false,
    args: [`--host-resolver-rules=MAP studentportal.ipb.ac.id:443 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, '--ignore-certificate-errors'],
  });
  browser.proc.stdio[3].on('error', () => {}); // the pipe breaks when the window is closed
  browser.proc.on('exit', () => stop(0));
  await browser.send('Extensions.loadUnpacked', { path: join(root, 'extension') });

  // Open the log page in a new tab, then close the startup about:blank tab.
  const { targetInfos } = await browser.send('Target.getTargets');
  const { targetId } = await browser.send('Target.createTarget', { url: `${HOST}${portal.indexPath}` });
  for (const t of targetInfos) {
    if (t.type === 'page' && t.url === 'about:blank') await browser.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
  }

  if (await launcherShown(targetId)) {
    console.log(`
Auto Logbook demo is open in a separate Chrome window, on a fake Student Portal.
Nothing is sent to the real portal.

  1. Click "Isi Otomatis" next to "Tambah".
  2. Data: click "Pilih file CSV / Excel" and choose
       ${csvPath}
     or paste rows copied from your own spreadsheet.
  3. Pengaturan: choose this as the proof file (bukti):
       ${pdfPath}
  4. Kirim: entries go to the fake portal; reload the page to see them in its table.

Chrome may show a warning bar about an unsupported command-line flag; that is
expected for this throwaway window. Close the window or press Ctrl+C here to stop.`);
  } else {
    console.warn('The page opened, but the "Isi Otomatis" button did not appear. Check chrome://extensions in that window for errors.');
  }
} catch (err) {
  console.error(`Demo could not start: ${err.message}`);
  await stop(1);
}

/** Wait until the extension has put its "Isi Otomatis" button on the page. */
async function launcherShown(targetId, timeout = 20000) {
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  try {
    for (const deadline = Date.now() + timeout; Date.now() < deadline; ) {
      const res = await browser
        .send('Runtime.evaluate', { expression: `document.querySelector('.alb-launch') !== null`, returnByValue: true }, sessionId)
        .catch(() => null);
      if (res && res.result && res.result.value === true) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  } finally {
    await browser.send('Target.detachFromTarget', { sessionId }).catch(() => {});
  }
}

/** A one-page PDF with a line of text, to use as the proof file. */
function samplePdf(text) {
  const content = `BT /F1 18 Tf 36 60 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 140] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}
