// A small stand-in for studentportal.ipb.ac.id used by the end-to-end test.
// Field names follow the real "Tambah Log Aktivitas" form (Waktu, Tmw, Tsw,
// JenisLogbookKegiatanKampusMerdekaId, ListDosenPembimbing[i].*, IsLuring,
// Lokasi, Keterangan, File) as used by other IPB logbook tools.
import https from 'node:https';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';

const AKTIVITAS_ID = 'VIK-TestAktivitas123';
const PERIOD = { from: '2026-07-06', to: '2026-12-10' };
const DOSEN = [
  { id: '77', name: 'Dr. Budi Santoso, M.Kom. - 197901012005011001' },
  { id: '78', name: 'Dr. Siti Rahmawati, M.T. - 198502022010122002' },
];
const JENIS = { 1: 'Berita Acara Pembimbingan (Konsultasi/Mentoring/Coaching)', 2: 'Berita Acara Ujian', 3: 'Berita Acara Kegiatan' };
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${BULAN[m - 1]} ${y}`;
};

export function createState() {
  return { entries: [], submissions: [], tokens: new Set(), flash: null, expired: false, requests: [] };
}

function layout(title, body, extraScript = '') {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)} - Student Portal</title>
<style>
body{font-family:Poppins,Segoe UI,sans-serif;margin:0;background:#f4f6f9;color:#212529}
.sidebar{position:fixed;left:0;top:0;bottom:0;width:250px;background:#fff;border-right:1px solid #e5e5e5;padding:20px}
.content{margin-left:270px;padding:24px}
.card{background:#fff;border-radius:6px;box-shadow:0 0 1px rgba(0,0,0,.125),0 1px 3px rgba(0,0,0,.2);margin-bottom:20px;padding:20px}
.card-header{display:flex;justify-content:space-between;align-items:center}
.btn{display:inline-block;padding:4px 10px;border:1px solid #ddd;border-radius:4px;background:#f8f9fa;color:#444;text-decoration:none;font-size:14px;cursor:pointer}
table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #eee;padding:6px;text-align:left;font-size:14px}
.row{display:flex;margin:6px 0}.col-4{width:220px;font-weight:600}
</style></head><body>
<aside class="sidebar"><b style="color:#4b3cb0;font-size:20px">StudentPORTAL</b><p>Beranda</p><p>Aktivitas</p></aside>
<main class="content">${body}</main>
<script>
window.$ = window.$ || function (f) { if (typeof f === 'function') document.addEventListener('DOMContentLoaded', f); return { datetimepicker() {}, select2() {} }; };
window.toastr = window.toastr || { success() {}, error() {}, warning() {}, info() {} };
function hapusLog(id){ if(!confirm('Hapus?')) return; toastr.error('Gagal menghapus data log'); }
${extraScript}
</script></body></html>`;
}

function indexPage(state) {
  const rows = state.entries.length
    ? state.entries
        .map(
          (e, i) => `<tr><td>${i + 1}</td><td>${esc(longDate(e.date))}</td><td>${esc(e.tmw)} - ${esc(e.tsw)}</td><td>${esc(JENIS[e.jenis])}</td>
<td>${esc(e.tipe)}</td><td>${esc(e.lokasi)}</td><td>${esc(e.keterangan).replace(/\n/g, '<br>')}</td><td><a href="#">${esc(e.fileName)}</a></td>
<td><a href="#" onclick="hapusLog(${i})">Hapus</a></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="9">Belum ada data log aktivitas</td></tr>';
  let flash = '';
  if (state.flash) {
    flash = `$(function(){ toastr.${state.flash.kind}(${JSON.stringify(state.flash.text)}); });`;
    state.flash = null;
  }
  return layout(
    'Log Aktivitas Kampus Merdeka',
    `<h1>Log Aktivitas Kampus Merdeka</h1>
<div class="card"><h3>Aktivitas</h3>
  <div class="row"><div class="col-4">Tahun Semester</div><div>: 2026/2027 Semester Ganjil</div></div>
  <div class="row"><div class="col-4">Kelompok Kegiatan</div><div>: Magang Mandiri</div></div>
  <div class="row"><div class="col-4">Nama Kegiatan</div><div>: Magang di PT Contoh Teknologi</div></div>
  <div class="row"><div class="col-4">Waktu</div><div>: ${longDate(PERIOD.from)} - ${longDate(PERIOD.to)}</div></div>
  <div class="row"><div class="col-4">Durasi Jam</div><div>: 640</div></div>
</div>
<div class="card"><div class="card-header"><h3>Log Aktivitas</h3>
  <a href="/Kegiatan/LogAktivitasKampusMerdeka/Tambah?aktivitasId=${AKTIVITAS_ID}" class="btn btn-default btn-tool" data-toggle="ajax-modal"><i class="fa fa-plus"></i> Tambah</a></div>
  <table class="table"><thead><tr><th>No</th><th>Tanggal</th><th>Waktu</th><th>Jenis Kegiatan</th><th>Tipe</th><th>Lokasi</th><th>Keterangan</th><th>Bukti</th><th>Aksi</th></tr></thead>
  <tbody>${rows}</tbody></table></div>`,
    flash,
  );
}

function tambahForm(state, errors = {}, values = {}) {
  const token = randomUUID();
  state.tokens.add(token);
  const err = (k) => (errors[k] ? `<span class="text-danger field-validation-error" data-valmsg-for="${k}">${esc(errors[k])}</span>` : `<span class="text-danger field-validation-valid" data-valmsg-for="${k}"></span>`);
  const dosen = DOSEN.map(
    (d, i) => `<div class="icheck-primary">
  <input type="hidden" name="ListDosenPembimbing[${i}].Key.PembimbingId" value="${d.id}">
  <input type="hidden" name="ListDosenPembimbing[${i}].Key.Nama" value="${esc(d.name)}">
  <input type="checkbox" id="ListDosenPembimbing_${i}__Value" name="ListDosenPembimbing[${i}].Value" value="true">
  <label for="ListDosenPembimbing_${i}__Value">${esc(d.name)}</label>
  <input name="ListDosenPembimbing[${i}].Value" type="hidden" value="false">
</div>`,
  ).join('');
  return `<div class="modal-header"><h4 class="modal-title">Tambah Log Aktivitas</h4></div>
<form action="/Kegiatan/LogAktivitasKampusMerdeka/Tambah" method="post" enctype="multipart/form-data" id="formTambah">
<input name="__RequestVerificationToken" type="hidden" value="${token}">
<input type="hidden" id="AktivitasId" name="AktivitasId" value="${AKTIVITAS_ID}">
<div class="form-group"><label>Tanggal <span class="text-danger">*</span></label>
  <input type="text" class="form-control datetimepicker-input" id="Waktu" name="Waktu" placeholder="Tanggal" data-target="#Waktu" data-val="true" data-val-required="Tanggal wajib diisi" value="${esc(values.Waktu || '21/11/2026')}">${err('Waktu')}</div>
<div class="form-group"><label>Waktu Kegiatan <span class="text-danger">*</span></label>
  <div class="input-group"><input type="text" class="form-control" id="Tmw" name="Tmw" placeholder="Waktu Mulai" value="21:32">
  <input type="text" class="form-control" id="Tsw" name="Tsw" placeholder="Waktu Selesai" value="21:32"></div>${err('Tmw')}</div>
<div class="form-group"><label>Jenis Kegiatan <span class="text-danger">*</span></label>
  <select class="form-control select2" id="JenisLogbookKegiatanKampusMerdekaId" name="JenisLogbookKegiatanKampusMerdekaId" data-val="true" data-val-required="Jenis wajib diisi">
  <option value="">-- Pilih --</option>${Object.entries(JENIS).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>${err('JenisLogbookKegiatanKampusMerdekaId')}</div>
<div class="form-group"><label>Dosen Penggerak <span class="text-danger">*</span></label>${dosen}${err('ListDosenPembimbing')}</div>
<div class="form-group"><label>Tipe Penyelenggaraan <span class="text-danger">*</span></label><div>
  <div class="icheck-primary d-inline"><input type="radio" id="IsLuringHybrid" name="IsLuring" value="" checked><label for="IsLuringHybrid">Hybrid</label></div>
  <div class="icheck-primary d-inline"><input type="radio" id="IsLuringTrue" name="IsLuring" value="true"><label for="IsLuringTrue">Offline</label></div>
  <div class="icheck-primary d-inline"><input type="radio" id="IsLuringFalse" name="IsLuring" value="false"><label for="IsLuringFalse">Online</label></div></div></div>
<div class="form-group"><label>Lokasi <span class="text-danger">*</span></label>
  <input type="text" class="form-control" id="Lokasi" name="Lokasi" placeholder="Lokasi" data-val="true" data-val-required="Lokasi wajib diisi">${err('Lokasi')}</div>
<div class="form-group"><label>Keterangan <span class="text-danger">*</span></label>
  <textarea class="form-control" id="Keterangan" name="Keterangan" placeholder="Topik" data-val="true" data-val-length-max="1000" data-val-required="Keterangan wajib diisi"></textarea>${err('Keterangan')}</div>
<div class="form-group"><label>Bukti Aktivitas <span class="text-danger">*</span></label>
  <input type="file" class="form-control" id="File" name="File" accept="image/*,.pdf">${err('File')}</div>
<button type="submit" class="btn btn-primary">Simpan</button>
</form>
<script>$(function(){ $('#Waktu').datetimepicker({ format: 'DD/MM/YYYY' }); $('.select2').select2(); });</script>`;
}

function listPage() {
  return layout(
    'Aktivitas Kampus Merdeka',
    `<h1>Aktivitas Kampus Merdeka</h1><div class="card"><table><thead><tr><th>No</th><th>Kegiatan</th><th>Semester</th><th>Aksi</th></tr></thead>
<tbody><tr><td>1</td><td>Magang di PT Contoh Teknologi</td><td>2026/2027 Semester Ganjil</td>
<td><a href="#">Detail</a> <a href="#">Ubah</a> <a href="/Kegiatan/LogAktivitasKampusMerdeka/Index/${AKTIVITAS_ID}" title="Log">Log</a></td></tr></tbody></table></div>`,
  );
}

async function readForm(req) {
  const request = new Request('https://mock.local/upload', {
    method: 'POST',
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: 'half',
  });
  return request.formData();
}

function validate(fd, state) {
  const errors = {};
  const token = fd.get('__RequestVerificationToken');
  if (!state.tokens.has(token)) return { fatal: 'Anti-forgery token tidak valid' };
  const waktu = String(fd.get('Waktu') || '');
  const m = waktu.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  let date = null;
  if (!m) errors.Waktu = 'Format tanggal harus dd/MM/yyyy';
  else {
    date = `${m[3]}-${m[2]}-${m[1]}`;
    if (date < PERIOD.from || date > PERIOD.to) errors.Waktu = 'Tanggal di luar periode kegiatan';
  }
  const tmw = String(fd.get('Tmw') || '');
  const tsw = String(fd.get('Tsw') || '');
  if (!/^\d{2}:\d{2}$/.test(tmw) || !/^\d{2}:\d{2}$/.test(tsw) || tsw <= tmw) errors.Tmw = 'Waktu kegiatan tidak valid';
  const jenis = String(fd.get('JenisLogbookKegiatanKampusMerdekaId') || '');
  if (!JENIS[jenis]) errors.JenisLogbookKegiatanKampusMerdekaId = 'Jenis kegiatan wajib dipilih';
  const dosen = DOSEN.filter((_, i) => fd.getAll(`ListDosenPembimbing[${i}].Value`)[0] === 'true').map((d) => d.id);
  if (!dosen.length) errors.ListDosenPembimbing = 'Pilih dosen penggerak';
  if (!fd.has('IsLuring')) errors.IsLuring = 'Tipe wajib dipilih';
  const isLuring = String(fd.get('IsLuring'));
  const lokasi = String(fd.get('Lokasi') || '').trim();
  if (!lokasi) errors.Lokasi = 'Lokasi wajib diisi';
  const keterangan = String(fd.get('Keterangan') || '').trim();
  if (!keterangan) errors.Keterangan = 'Keterangan wajib diisi';
  else if (keterangan.length > 1000) errors.Keterangan = 'Keterangan maksimal 1000 karakter';
  const file = fd.get('File');
  if (!file || typeof file === 'string' || !file.size) errors.File = 'Bukti aktivitas wajib diunggah';
  else if (file.size > 4 * 1024 * 1024) errors.File = 'Ukuran file maksimal 4 MB';
  return {
    errors,
    entry: {
      date,
      tmw,
      tsw,
      jenis,
      dosen,
      tipe: isLuring === 'true' ? 'Offline' : isLuring === 'false' ? 'Online' : 'Hybrid',
      lokasi,
      keterangan,
      fileName: file && file.name,
      fileSize: file && file.size,
      fileType: file && file.type,
    },
  };
}

export async function startMockPortal({ port, key, cert, state = createState() }) {
  const indexPath = `/Kegiatan/LogAktivitasKampusMerdeka/Index/${AKTIVITAS_ID}`;
  const server = https.createServer({ key, cert }, async (req, res) => {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname;
    state.requests.push({ method: req.method, path, xrw: req.headers['x-requested-with'] || null });
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'ASP.NET_SessionId=mock; Path=/; Secure; HttpOnly; SameSite=Lax', ...headers });
      res.end(body);
    };
    try {
      if (path.startsWith('/__test/')) {
        if (path === '/__test/state') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ entries: state.entries, submissions: state.submissions, requests: state.requests.length }));
        } else if (path === '/__test/expire') {
          state.expired = url.searchParams.get('on') !== '0';
          send(200, 'ok');
        } else send(404, 'no');
        return;
      }
      if (path === '/Account/Login') {
        send(200, layout('Login', '<form method="post"><input placeholder="Username" name="u"><input type="password" placeholder="Password" name="p"><button>Masuk</button></form>'));
        return;
      }
      if (state.expired) {
        send(302, '', { Location: '/Account/Login?ReturnUrl=' + encodeURIComponent(path) });
        return;
      }
      if (req.method === 'GET' && path === '/') return send(200, layout('Beranda', '<h1>Beranda</h1>'));
      if (req.method === 'GET' && path === '/Kegiatan/AktivitasKampusMerdeka') return send(200, listPage());
      if (req.method === 'GET' && path === indexPath) return send(200, indexPage(state));
      if (req.method === 'GET' && path === '/Kegiatan/LogAktivitasKampusMerdeka/Tambah') return send(200, tambahForm(state));
      if (req.method === 'POST' && path === '/Kegiatan/LogAktivitasKampusMerdeka/Tambah') {
        const fd = await readForm(req);
        const fields = [];
        for (const [k, v] of fd.entries()) fields.push([k, typeof v === 'string' ? v : { name: v.name, size: v.size, type: v.type }]);
        state.submissions.push({ fields, xrw: req.headers['x-requested-with'] || null });
        const result = validate(fd, state);
        if (result.fatal) return send(400, layout('Error', `<h1>Bad Request</h1><p>${result.fatal}</p>`));
        const keys = Object.keys(result.errors);
        if (keys.length) {
          if (result.errors.File) {
            // Missing file: re-render the form with validation messages (no redirect).
            return send(200, tambahForm(state, result.errors, { Waktu: fd.get('Waktu') }));
          }
          state.flash = { kind: 'error', text: Object.values(result.errors).join('; ') };
          return send(302, '', { Location: indexPath });
        }
        state.entries.push(result.entry);
        state.flash = { kind: 'success', text: 'Data berhasil disimpan' };
        return send(302, '', { Location: indexPath });
      }
      send(404, layout('404', '<h1>Halaman tidak ditemukan</h1>'));
    } catch (err) {
      send(500, `<pre>${esc(err.stack)}</pre>`);
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { server, state, indexPath, aktivitasId: AKTIVITAS_ID, close: () => new Promise((r) => server.close(r)) };
}
