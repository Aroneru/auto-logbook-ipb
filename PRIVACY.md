# Privacy Policy: Auto Logbook IPB

Last updated: 21 November 2026

Auto Logbook IPB is an unofficial browser extension that fills the activity log (Log Aktivitas) on the IPB Student Portal (`studentportal.ipb.ac.id`) from logbook rows that you paste or open yourself.

## What the extension handles

- **Logbook data you provide:** rows you paste or open from a CSV/XLSX file (dates, times, descriptions, locations and similar columns).
- **Proof files you choose:** the default proof file, and any per-date files you select.
- **Portal pages:** while you are on the Student Portal, the extension reads the "Tambah Log Aktivitas" form (field names, options such as activity types and lecturers) and your activity log list, to fill the form and to skip entries that already exist.
- **Your settings:** column choices, the description template, location/type choices, selected activity type and lecturers.

The extension does not read, store or transmit your username or password.

## Where data is stored

Settings, the last pasted data, the default proof file and a list of entries already sent (a date plus a short hash of the description) are stored in your browser's local extension storage on this device. They are not synced. Per-date proof files are kept only in memory and are gone when the page closes.

## Where data is sent

Only to `studentportal.ipb.ac.id`, using your existing logged-in session, when you click a send button. This is the same data you would type into the portal's form yourself.

The extension has no server of its own and uses no analytics, advertising or other third-party services. The developer receives no data.

## Your control

- **Pengaturan › Lanjutan** has buttons to clear the history of sent entries and to reset settings.
- **Data › Hapus data** removes the stored logbook rows, and the trash button removes the default proof file.
- Removing the extension deletes everything it stored.

## Changes

If this policy changes, the new version will be published at the same address with a new date.

## Contact

Open an issue in the project's GitHub repository.

---

## Ringkasan (Bahasa Indonesia)

- Ekstensi hanya bekerja di `studentportal.ipb.ac.id` dan hanya mengirim data ke sana, memakai sesi login Anda, ketika Anda menekan tombol kirim.
- Data tempelan, pengaturan, file bukti bawaan, dan daftar entri yang sudah terkirim disimpan di penyimpanan lokal browser Anda, tidak disinkronkan, dan tidak dikirim ke pengembang.
- Tidak ada server, analitik, atau pihak ketiga. Kata sandi tidak pernah dibaca.
- Hapus data dari panel (Data › Hapus data, Pengaturan › Lanjutan), atau hapus ekstensi untuk menghapus semuanya.
