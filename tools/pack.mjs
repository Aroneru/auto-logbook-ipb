// Build dist/auto-logbook-ipb-<version>.zip for the Chrome Web Store
// (manifest.json at the zip root). No dependencies.
// Usage: node tools/pack.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'extension');
const manifest = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));

// Only what the extension needs at runtime.
const include = (path) => /^(manifest\.json|background\.js|src\/[\w-]+\.js|icons\/icon-\d+\.png)$/.test(path);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]));
}

const files = walk(extDir)
  .map((abs) => ({ abs, path: relative(extDir, abs).split(sep).join('/') }))
  .filter((f) => include(f.path))
  .sort((a, b) => a.path.localeCompare(b.path));

// Fixed timestamp (2026-01-01 00:00) so the same sources give the same zip.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

const locals = [];
const central = [];
let offset = 0;
for (const f of files) {
  const raw = readFileSync(f.abs);
  const data = deflateRawSync(raw, { level: 9 });
  const name = Buffer.from(f.path, 'utf8');
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(DOS_TIME, 12);
  cd.writeUInt16LE(DOS_DATE, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(offset, 42);

  locals.push(local, name, data);
  central.push(cd, name);
  offset += local.length + name.length + data.length;
}

const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdBuf.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `auto-logbook-ipb-${manifest.version}.zip`);
const zip = Buffer.concat([...locals, cdBuf, end]);
writeFileSync(out, zip);
console.log(`${files.length} files, ${(zip.length / 1024).toFixed(1)} KB -> ${out}`);
for (const f of files) console.log('  ' + f.path);
