# 📝 Dokumentasi Perubahan Lokal (Local Changes Tracker)

Berkas ini melacak semua kustomisasi lokal yang telah dibuat pada **Meridian Agent (Vipera)**, dipisahkan secara jelas antara perubahan logika utama (*backend/core engine*) dan pengalaman pengguna (*UI/UX/reporting*), terlepas dari repositori utama GitHub (`yunus-0x/meridian`).

---

## 🧠 Bagian 1: Perubahan Logika & Mesin Utama (Logic & Core Engine)

Bagian ini melacak perubahan pada algoritma pengambilan keputusan, manajemen risiko, integrasi API data, keamanan operasional, dan otomatisasi LP.

### 🛡️ 1. Presets & Konfigurasi Timeframe Konservatif Baru
*   **Perubahan**: Membuat file preset kustom dengan pembatasan risiko tinggi pada timeframe menengah (`15m`) dan panjang (`30m`).
*   **Detail Berkas**:
    *   `[NEW]` [user-config.json.15menit-konservatif](file:///home/elzanom/work/Lab/meridian/user-config.json.15menit-konservatif)
    *   `[NEW]` [user-config.json.30menit-konservatif](file:///home/elzanom/work/Lab/meridian/user-config.json.30menit-konservatif)
*   **Modifikasi Logika**:
    *   **Stop Loss (SL)** diperketat ke `-9%` (dari `-10%`).
    *   **Take Profit (TP)** dipercepat keluar di `5%` (dari `6%`).
    *   **Trailing Profit** aktif lebih awal di `3.5%` dengan toleransi penurunan puncak ketat sebesar `1.3%`.
    *   **Filter Likuiditas & Mcap** dinaikkan tinggi (`35K-40K SOL` TVL minimum) guna menghindari kolam likuiditas kecil yang tidak stabil.
    *   **Indikator Konfirmasi**: Mengaktifkan `"requireAllIntervals": true` pada indikator Supertrend dan RSI untuk penyaringan entri yang sangat disiplin sebelum eksekusi.

### 🔑 2. Sinkronisasi Kredensial GMGN API ke Seluruh Preset
*   **Perubahan**: Menyuntikkan kunci API GMGN Anda secara otomatis ke 8 berkas preset konfigurasi:
    *   `user-config.json.15menit` & `user-config.json.15menit-konservatif`
    *   `user-config.json.30menit` & `user-config.json.30menit-konservatif`
    *   `user-config.json.5menit`, `user-config.json.5menit-agresif`, `user-config.json.5menit-konservatif`
    *   `user-config.json.live`, `user-config.json.original`, `user.config.json.5m`
*   **Modifikasi Logika**: Menjaga agar parameter `gmgnApiKey` dan `"useGmgnApi": true` selalu aktif di preset mana pun, sehingga penyaringan global fee (`global_fees_sol`) dan organic score GMGN tetap melindungi Anda dari token bundled/scam.

### 🛑 3. Penyaringan Token yang Sangat Ketat (Stricter Screening Gates)
*   **Perubahan**: Memperkuat keamanan anti-rugpull pada mesin penyaring di [tools/screening.js](file:///home/elzanom/work/Lab/meridian/tools/screening.js).
*   **Modifikasi Logika**:
    *   Hanya quote **SOL** yang lolos screening (menghilangkan token-token quote esoterik yang rawan manipulasi).
    *   Menjadikan `maxVolatility` sebagai penolak keras (*hard reject*) untuk menolak koin dengan fluktuasi gila yang tidak sehat.
    *   *Dynamic Floor* untuk rasio Fee/TVL.
    *   Penerapan blocklist keras untuk token-token rival tiruan (PVP Symbol blocklist) sebelum LLM sempat melihatnya.

### 🧮 4. Pembukuan Posisi & Ketahanan API (Stateful Accounting & Indexing Delay Fallback)
*   **Perubahan**: Proteksi kelambatan API Meteora di [tools/dlmm.js](file:///home/elzanom/work/Lab/meridian/tools/dlmm.js) dan [state.js](file:///home/elzanom/work/Lab/meridian/state.js).
*   **Modifikasi Logika**:
    *   **Local State Injection**: Jika Meteora lambat memperbarui posisi baru Anda di rantai (*on-chain*), agent akan menyuntikkan data lokal sementara ke antrean agar manajemen stop-loss tetap aktif seketika tanpa jeda indeksasi.
    *   *Fallback* otomatis ke jalur *positions-only* relay jika portofolio API Meteora mengalami kegagalan/lag.

### 📈 5. Pustaka Strategi LP yang Diperluas (Expanded Strategy Library)
*   **Perubahan**: Menambahkan variasi penyediaan likuiditas taktis di [strategy-library.js](file:///home/elzanom/work/Lab/meridian/strategy-library.js).
*   **Modifikasi Logika**:
    *   `single_sided_sol_bidask` & `sol_spot_balanced_entry` (untuk eksekusi SOL-only).
    *   `conservative_wide_bidask` (untuk penyebaran likuiditas rentang lebar yang aman).
    *   Strategi kustom ala `lparmy_*`.

### 🐒 6. Pengoptimalan RPC (RPC Rate Limit Mitigation)
*   **Perubahan**: Menekan ledakan request RPC di [tools/token.js](file:///home/elzanom/work/Lab/meridian/tools/token.js).
*   **Modifikasi Logika**:
    *   Penerapan *concurrency limits* dan *in-flight deduplication* untuk mencegah galat `429 Too Many Requests` saat melacak smart-wallet.

### 🧪 7. Kelly Sizing & Evolusi Otomatis (Kelly Sizing Integration)
*   **Perubahan**: Dinamisasi ukuran modal di [lessons.js](file:///home/elzanom/work/Lab/meridian/lessons.js).
*   **Modifikasi Logika**:
    *   Formula kriteria Kelly mengkalkulasi persentase saldo deploy SOL secara adaptif berdasarkan *win rate* historis dari 30 hari terakhir.

---

## 🎨 Bagian 2: Perubahan Tampilan & Pengalaman Pengguna (UI/UX)

Bagian ini melacak perubahan pada cara agent berinteraksi dengan Anda, visualisasi laporan, pembersihan tampilan terminal, dan bot Telegram.

### 🗑️ 1. Penghapusan Terminal UI Dashboard & Siklus Pembaruan
*   **Perubahan**: Pembersihan total visual dashboard lokal dan Telegram.
*   **Detail UI/UX**:
    *   Menghapus berkas `dashboard.js` (Terminal UI Dashboard lama) untuk merapikan proyek.
    *   Menghapus logika siklus visual Telegram Dashboard (`updateDashboard` di `index.js`).
*   **Efek UX**: Agen berjalan murni di backend (cocok untuk mode PM2/VPS tanpa membanjiri ruang obrolan Telegram dengan pesan live update berkala yang mengganggu konsentrasi).

### 💬 2. Peningkatan Kelas UX Telegram (Telegram UX Upgrades)
*   **Perubahan**: Menjadikan bot Telegram sebagai pusat komando yang rapi di [telegram.js](file:///home/elzanom/work/Lab/meridian/telegram.js).
*   **Detail UI/UX**:
    *   **Managed Action Messages**: Menggunakan metode *overwrite* (edit pesan) atau *delete* (hapus pesan lama) pada slot log siklus otonom agar riwayat Telegram Anda selalu bersih dan hanya menyisakan status terbaru.
    *   **Inline Keyboards**: Penataan tombol instan untuk perintah `/status`, `/positions`, `/candidates`, `/settings`, dan `/briefing`.
    *   Pengenalan penanganan gambar (`sendPhoto`) untuk visualisasi laporan.

### 🖼️ 3. Laporan Visual Harian Kaya Data (Visual & Rich Daily Briefing)
*   **Perubahan**: Peningkatan laporan pagi di [briefing.js](file:///home/elzanom/work/Lab/meridian/briefing.js).
*   **Detail UI/UX**:
    *   Pembuatan modul [pnl-card.js](file:///home/elzanom/work/Lab/meridian/pnl-card.js) untuk melukis kartu ringkasan keuntungan/kerugian (PnL Card) harian.
    *   Pemuatan aset font modern (`Barlow-Regular.ttf`, `Rajdhani-Bold.ttf`, `ShareTechMono-Regular.ttf`) dan latar belakang kustom (`bg_green.png` / `bg_red.png`) di dalam folder [assets/](file:///home/elzanom/work/Lab/meridian/assets).
    *   Hasil briefing dikirim ke Telegram berupa visual infografis yang menarik dibanding sekadar teks polos biasa.

### 🛠️ 4. Utilitas & Skrip Bantuan Operasional (Scripts Helper)
*   **Perubahan**: Menyediakan utilitas manual di folder [scripts/](file:///home/elzanom/work/Lab/meridian/scripts).
*   **Detail UI/UX**:
    *   `bootstrap-wallets.js`: Skrip CLI cepat untuk mengekstrak dompet pintar (smart wallets) LPers Meteora teraktif ke konfigurasi Anda secara langsung.
    *   `send-briefing-manual.js`: Skrip sekali klik untuk langsung memicu bot mengirim infografis PnL harian ke Telegram Anda kapan saja tanpa menunggu jadwal rutin.
