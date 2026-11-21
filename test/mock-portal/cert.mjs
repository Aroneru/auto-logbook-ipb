// Self-signed certificate for the mock portal, shared by the e2e test and the demo.
// Needs openssl: the one on PATH, $OPENSSL, or the copy bundled with Git for Windows.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OPENSSL = [
  process.env.OPENSSL,
  'openssl',
  'C:/Program Files/Git/usr/bin/openssl.exe',
  'C:/Program Files/Git/mingw64/bin/openssl.exe',
].filter(Boolean);

export function makeCert(host = 'studentportal.ipb.ac.id') {
  const dir = mkdtempSync(join(tmpdir(), 'alb-cert-'));
  try {
    // An explicit config: some Windows builds (e.g. the one bundled with Apache)
    // otherwise look for an openssl.cnf that does not exist and fail.
    const config = join(dir, 'openssl.cnf');
    writeFileSync(config, '[req]\ndistinguished_name = dn\n[dn]\n');
    const key = join(dir, 'key.pem');
    const cert = join(dir, 'cert.pem');
    const args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-config', config, '-keyout', key, '-out', cert, '-days', '2',
      '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`];
    for (const bin of OPENSSL) {
      try {
        execFileSync(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        return { key: readFileSync(key), cert: readFileSync(cert) };
      } catch (err) {
        if (err.code !== 'ENOENT') throw new Error(`${bin} could not create the test certificate: ${String(err.stderr || err.message).trim()}`);
      }
    }
    throw new Error('openssl not found. Add it to PATH or set OPENSSL (Git for Windows includes one in C:\\Program Files\\Git\\usr\\bin).');
  } finally {
    // Retries: on Windows a just-written file can stay locked for a moment (e.g. by antivirus).
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
