Generate Memo

Web app untuk membuat draft memo, preview dokumen, save/load draft JSON, dan export DOCX.

https://generate-memo.pages.dev/

Lebih detailnya ada pada file Panduan menggunakan Panduan menggunakan Memo Generator.docx

## Portal Canvas sementara

Draft Canvas App `Memo Generator` berada di environment `BCA (default)` dengan app ID
`b24919b7-b1b0-4cd1-9fe0-55342102130a`. Portal menampilkan `User().FullName` dan membuka web
Cloudflare melalui `Launch()`.

Perilakunya sengaja dipisahkan:

1. URL Cloudflare biasa tetap memakai profil lokal dan dialog nama manual seperti sebelumnya.
2. URL yang diluncurkan portal memakai `source=powerapps`, `pa_name`, dan `pa_oid`; nama Microsoft
   dipakai otomatis, tidak disimpan ke profil lokal, dan parameter identitas dihapus dari address bar
   segera setelah dibaca.
3. Room yang dibuat dari portal memakai ID `m365_<16 hex>`. Link berbagi room tersebut kembali ke
   Power Apps, lalu portal meneruskan parameter `room` ke Cloudflare.
4. Room lama tetap memakai ID 16 digit hex dan link Cloudflare biasa.

URL portal dapat diganti saat build dengan `NEXT_PUBLIC_POWER_APPS_PORTAL_URL`. Nilai default berada
di `src/collaboration/powerAppsPortal.ts` dan menunjuk ke app ID di atas.

Catatan keamanan: parameter nama/oid dari `Launch()` cukup untuk perilaku portal sementara, tetapi
bukan bukti identitas untuk Worker. Penjagaan server-side memerlukan one-time grant Entra atau
Cloudflare Access pada deployment paralel. Worker dan Pages Cloudflare yang aktif belum diubah.

## Power Apps Code App

Versi Microsoft 365 memakai Power Apps Code App agar UI React, preview A4, import JSON/XLSX,
kolaborasi, komentar, dan generator DOCX tetap menggunakan implementasi yang sama. Deployment
Power Apps berdiri terpisah dan tidak mengubah Cloudflare Pages maupun Worker yang sudah ada.

Prerequisite tenant:

1. Environment Admin membuka Power Platform admin center.
2. Pilih `BCA (default)` > Settings > Product > Features.
3. Aktifkan `Enable code apps`, lalu Save.
4. Pastikan pengguna yang menjalankan Code App memiliki Power Apps Premium.

Build dan deploy:

```powershell
npm install
npm run build:powerapps
npm run deploy:powerapps
```

Konfigurasi target berada di `power.config.json`. Deployment pertama akan mengisi `appId` dan
menambahkan aplikasi ke preferred solution environment. Perintah ini tidak menjalankan script
deployment Cloudflare.
