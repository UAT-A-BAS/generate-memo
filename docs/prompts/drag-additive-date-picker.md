# Prompt Reusable: Date Picker Klik Satuan + Drag Rentang

Salin prompt berikut untuk menerapkan pola date picker yang sama pada aplikasi web lain.

```text
Implementasikan peningkatan UX pada komponen date picker yang sudah ada. Pertahankan desain sistem, API publik, format data, dan perilaku lama selama tidak bertentangan dengan spesifikasi berikut.

Tujuan pengguna
- Klik/tap satu tanggal men-toggle tanggal tersebut secara individual.
- Tekan lalu drag dari tanggal awal ke tanggal akhir menambahkan seluruh rentang secara inklusif.
- Pilihan baru selalu ditambahkan ke pilihan sebelumnya; jangan mengganti pilihan lama.
- Klik satuan dan drag rentang dapat diulang dan digabung dalam satu pilihan.
- Tanggal duplikat harus dinormalisasi, diurutkan, dan tidak boleh tersimpan dua kali.
- Drag terbalik, misalnya 10 ke 5, harus menghasilkan rentang 5 sampai 10.

Interaksi
1. Pointer down pada sebuah hari memulai kandidat drag.
2. Selama pointer bergerak ke hari lain, tampilkan preview rentang tanpa menyimpan permanen.
3. Pointer up setelah berpindah hari menambahkan semua tanggal dalam rentang.
4. Pointer down dan up pada hari yang sama tetap dianggap klik biasa sehingga tanggal dapat ditambah atau dihapus satu per satu.
5. Pointer cancel membatalkan preview dan tidak mengubah nilai.

UX dan visual
- Tampilkan microcopy singkat: "Klik satu tanggal · tahan dan geser untuk rentang".
- Saat pointer baru ditekan, tampilkan: "Geser ke tanggal akhir untuk membuat rentang".
- Saat drag aktif, tampilkan preview: "Lepas untuk menambahkan [rentang]".
- Gunakan warna utama produk untuk tanggal tunggal dan ujung rentang.
- Gunakan warna utama yang lebih muda untuk tanggal di tengah rentang.
- Tampilkan ringkasan pilihan yang sudah dinormalisasi.
- Gunakan cursor grab/grabbing di desktop dan hindari text selection selama drag.
- Jangan menutup date picker setelah klik atau drag agar pengguna dapat membuat kombinasi.

Responsif dan aksesibilitas
- Gunakan Pointer Events agar mouse, pen, dan sentuhan memakai satu implementasi.
- Jangan bergantung pada drag sebagai satu-satunya cara; klik/tap individual harus tetap berfungsi.
- Pertahankan elemen button native untuk setiap hari, aria-pressed, fokus yang terlihat, dan navigasi keyboard yang sudah ada.
- Beri instruksi visual yang tidak hanya bergantung pada warna.
- Pastikan popup tidak keluar viewport dan tetap nyaman pada layar kecil.

Aturan teknis
- Gunakan pointer capture atau listener pointer-up global agar drag tidak tertinggal dalam status aktif.
- Bedakan click dari drag hanya setelah pointer memasuki tanggal lain.
- Cegah click sintetis setelah drag agar tanggal akhir tidak ter-toggle dua kali.
- Gabungkan rentang baru dengan nilai lama menggunakan operasi set, lalu urutkan secara kronologis.
- Jangan menambahkan dependency baru jika Pointer Events dan utilitas tanggal lokal sudah cukup.
- Minimalkan perubahan file dan pertahankan kompatibilitas data lama.

Acceptance criteria
- Drag 3 ke 7 memilih 3, 4, 5, 6, dan 7 dalam satu gestur.
- Drag 7 ke 3 memberi hasil yang sama.
- Setelah 3–7 terpilih, klik 10 menghasilkan gabungan 3–7 dan 10.
- Setelah tanggal 1 sudah terpilih, drag 3–5 menghasilkan 1 dan 3–5.
- Klik tanggal terpilih menghapus hanya tanggal tersebut.
- Pointer cancel tidak mengubah pilihan.
- Mouse, touch, keyboard dasar, dan viewport kecil diverifikasi.
- Typecheck, lint, dan test terkait harus lulus.

Sebelum mengubah kode, inspeksi komponen, model nilai tanggal, formatter, design tokens, dan test yang sudah ada. Setelah implementasi, jelaskan file yang berubah, keputusan UX, hasil verifikasi, serta risiko atau edge case yang masih tersisa.
```

Sesuaikan nama komponen, format tanggal, dan token warna dengan aplikasi tujuan.
