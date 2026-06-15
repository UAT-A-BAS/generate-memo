# Memo Generator Input UX Experiment

Versi staging terisolasi untuk eksperimen peningkatan UX seluruh field input.
Publikasi dilakukan hanya melalui branch `codex/input-ux-experiment` dan
project Cloudflare Pages terpisah, bukan deployment production `generate-memo`.

## Menjalankan

```powershell
npm ci
npm run dev:experiment
```

Buka `http://localhost:3010`.

## Verifikasi

```powershell
npm run lint
npx tsc --noEmit
npx playwright test
npm run build
```

Eksperimen mempertahankan `MemoDraft`, preview, pagination, dan generated DOCX
existing. Data autosave, suggestion, serta Quick Fill disimpan hanya di browser
lokal.

## Peningkatan Utama

- restore draft otomatis dan autosave debounce 700 ms dengan status
- progress kelengkapan dan lompat ke field berikutnya
- helper, placeholder, dan validasi inline untuk field mandatory, email, dan URL
- saran lokal maksimal 12 nilai unik per kategori
- profil routing lokal untuk penerima, PIC, signer, tembusan, biro, dan inisial
- duplikasi baris dengan ID baru untuk seluruh koleksi berulang
- default jadwal/PIC untuk aktivitas dan tanggal lampiran baru
- rich-text placeholder serta toolbar mouse/keyboard yang stabil

Checklist manual tersedia di
`docs/input-ux-manual-test-checklist.md`.
