# Komiku Scraper & Updater

Fitur:
- Mengambil daftar komik dari `http://localhost:3000/api/komiku` dan follow next_page
- Untuk tiap komik: ambil metadata, bandingkan chapters, scrape hanya chapter yang belum ada
- Menyimpan pages (image URLs) per chapter
- Database: supabase (opsional) atau lokal JSON fallback (./data/db.json)
- Modular code, rate-limited

Setup:
1. Node.js >= 18
2. `npm install`
3. Copy `.env.example` -> `.env` dan isi jika mau Supabase
4. Jalankan: `npm start`

Notes:
- Jika menggunakan Supabase, buat tabel `comics`, `chapters`, `pages` sesuai kolom yang dipakai.
- Local DB berada di `./data/db.json`. Struktur rapi, bisa diexport ke supabase nanti.
