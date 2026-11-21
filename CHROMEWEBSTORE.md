# Chrome Web Store Listing — Auto Logbook IPB

> Last Updated: 2026-11-21

## Store Listing

**Extension Name** [REQUIRED]

Auto Logbook IPB

> Trademark risk: reviewers reject names that use another organization's name. The "for [site]" form is safer, e.g. **"Auto Logbook untuk Student Portal IPB (tidak resmi)"** (52 chars). If you switch, change `name` in `extension/manifest.json` too; the two must match.

**Short Description** [REQUIRED] (≤ 132 chars)

Isi Log Aktivitas di Student Portal IPB dari Google Sheets/Excel: tempel, periksa, kirim. Ekstensi tidak resmi.

*(English alternative, 120 chars: "Fill the IPB Student Portal activity log (Log Aktivitas) from Google Sheets or Excel: paste, review, submit. Unofficial.")*

**Detailed Description** [REQUIRED] (plain text; the store strips Markdown)

```
Isi Log Aktivitas di Student Portal IPB sekaligus dari Google Sheets atau Excel, tanpa mengisi formulir "Tambah Log Aktivitas" satu per satu.

FITUR
• Tempel langsung baris logbook dari Google Sheets/Excel, atau buka file CSV/XLSX.
• Kolom dikenali otomatis: tanggal, jam mulai/selesai, keterangan, lokasi, tipe, jenis kegiatan, bukti.
• Membaca berbagai format tanggal dan jam (06/07/2026, 6 Juli 2026, 7/6/2026, 8:00:00 AM, 16.30 WIB).
• Keterangan bisa digabung dari beberapa kolom dengan template.
• Lokasi dan tipe (Offline/Online/Hybrid) diatur sekali per nilai, lalu diingat.
• Jenis kegiatan dan dosen penggerak diambil dari formulir portal Anda sendiri.
• Satu file bukti bawaan untuk semua entri, atau file per tanggal yang dicocokkan dari nama file. Foto besar diperkecil sebelum diunggah.
• Entri yang sudah ada di portal dilewati, dan setiap kiriman dicek muncul di daftar log.
• "Lihat data kiriman" dan "Kirim 1 dulu" untuk mencoba dengan aman.

CARA PAKAI
1. Login ke Student Portal, buka Kemahasiswaan › Aktivitas, lalu klik Log pada kegiatan Anda.
2. Klik tombol "Isi Otomatis" di samping tombol Tambah.
3. Tempel baris logbook dari spreadsheet.
4. Periksa pengaturan (cukup sekali) dan pilih file bukti.
5. Klik "Kirim 1 dulu", cek hasilnya di portal, lalu kirim sisanya.

PRIVASI
Ekstensi hanya berjalan di studentportal.ipb.ac.id dan hanya mengirim data ke sana, memakai sesi login Anda sendiri. Tidak ada server, analitik, atau pihak ketiga. Data dan pengaturan disimpan di browser Anda dan bisa dihapus kapan saja. Kata sandi tidak pernah dibaca.

IZIN
• "Membaca dan mengubah data di studentportal.ipb.ac.id": untuk menampilkan tombol Isi Otomatis, membaca formulir dan daftar log Anda, lalu mengirim entri.
• Penyimpanan: untuk mengingat pengaturan, data tempelan terakhir, file bukti bawaan, dan entri yang sudah terkirim.

Ekstensi tidak resmi; tidak berafiliasi dengan IPB University. Pastikan isi logbook sesuai kegiatan yang benar-benar dilakukan.

DUKUNGAN
Laporkan masalah di halaman Issues GitHub proyek ini. Di panel, Pengaturan › Lanjutan › "Salin info teknis" menyalin informasi yang dibutuhkan (tanpa data pribadi).
```

**Category** [REQUIRED]

Productivity

**Single Purpose** [REQUIRED]

Submits a student's own logbook rows from a spreadsheet to the activity log form on the IPB Student Portal.

**Primary Language** [REQUIRED]

Indonesian (Bahasa Indonesia)

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `extension/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | 🟡 Needs update | `docs/screenshots/3-kirim.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | 🟡 Needs update | `docs/screenshots/1-tempel-data.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | 🟡 Needs update | `docs/screenshots/2-pengaturan.png` |
| Screenshot 4 | 1280×800 | 🟡 Needs update | `docs/screenshots/4-terkirim.png` |
| Screenshot 5 | 1280×800 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes

The current screenshots come from the end-to-end test (`npm run e2e` with `E2E_W=1280 E2E_H=800`). They show the panel over the local mock portal with fictional data. Before submitting, replace them with captures from the real Student Portal, using demo data and no real names or NIM/NIP:

1. Send step with ready entries (the main shot).
2. Data step right after pasting from Google Sheets.
3. Settings step: columns, template, lokasi/tipe table.
4. Result after sending, with every row marked "Terkirim".

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Remembers the user's column choices, description template, location/type choices, selected activity type and lecturers, the last pasted logbook rows, the default proof file, and which entries were already sent (to avoid duplicates). Stored on the device only. |
| `https://studentportal.ipb.ac.id/*` | host_permissions | The extension's only site. Adds the "Isi Otomatis" button to the activity log page, reads the "Tambah Log Aktivitas" form and the user's log list, and submits the entries the user confirms using the user's own logged-in session. Also lets the toolbar button tell whether the current tab is the Student Portal. |
| content script on `https://studentportal.ipb.ac.id/*` | content_scripts | Same host as above: shows the panel on the portal pages and talks to the portal from the user's tab. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes. It handles data locally to do its job, but the developer receives nothing.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | Yes: lecturer names shown in the portal form, and whatever names the user's logbook contains | Only to studentportal.ipb.ac.id, when the user submits | Filling the activity log form | No |
| Health info | No | | | |
| Financial info | No | | | |
| Authentication info | No (passwords are never read; requests use the existing browser session) | | | |
| Personal communications | No | | | |
| Location | No (the "Lokasi" text the user writes is logbook content, not device location) | | | |
| Web history | No | | | |
| User activity | No | | | |
| Website content | Yes: the portal's form and log list, plus the user's logbook text and proof files | Only to studentportal.ipb.ac.id, when the user submits | Filling the form; skipping entries that already exist | No |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

`PRIVACY.md` in the public repository (e.g. `https://github.com/<user>/<repo>/blob/main/PRIVACY.md`), or the same text on GitHub Pages. Check that the link opens without a login before submitting.

## Distribution

**Visibility**: Public (or Unlisted for a pilot with classmates first)
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]: *(fill in)*

**Contact Email** [REQUIRED]: *(fill in; shown publicly)*

**Support URL / Email** [RECOMMENDED]: GitHub Issues page of the repository

**Homepage URL** [RECOMMENDED]: the repository README

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.0 | 2026-11-21 | First version: paste/CSV/XLSX input, automatic column mapping, template description, location/type mapping, default and per-date proof files, duplicate detection, payload preview, send one/all with verification | Draft |

## Review Notes

### Known Issues / Limitations

- Built against the form structure used by existing IPB logbook tools and the portal screenshots; field names are read from the live form, so small changes are tolerated. Big portal redesigns may need an update (users can copy "info teknis" from the panel).
- If the portal paginates the log list on the server, the duplicate check only sees the first page; the extension's own history of sent entries still applies.
- Chrome/Edge desktop only (no mobile browsers).
- Package with `npm run pack`; the zip contains only `manifest.json`, `background.js`, `src/*.js` and `icons/*.png`.

### Rejection History

None yet.
