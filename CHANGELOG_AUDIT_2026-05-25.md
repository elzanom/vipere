# Meridian Change Audit

Tanggal audit: 2026-05-25  
Repo: `origin = https://github.com/yunus-0x/meridian.git`  
Branch aktif: `main`

## Batasan Audit

- Git tidak menyimpan "tanggal clone" secara eksplisit, jadi audit ini memakai seluruh histori yang ada di clone lokal: dari initial commit sampai `HEAD`.
- `HEAD` lokal saat ini sama dengan `origin/main` yang tersimpan secara lokal (`ahead=0`, `behind=0` terhadap upstream lokal).
- Audit ini tidak melakukan `git fetch`, jadi status terhadap remote GitHub real-time di luar clone ini tidak diverifikasi ulang.
- Selain histori commit, audit ini juga mencakup perubahan lokal yang belum committed di working tree saat audit dibuat.

## Ringkasan Cepat

- Total commit dalam clone ini: `229`
- Initial commit: `0eb79f7` `Initial release — Meridian DLMM LP Agent`
- Commit terbaru di `HEAD`: `4da2a15` `fix: resolve false volume=0 rejections in screening`
- Perubahan lokal belum committed: `19 modified files` + beberapa file/folder untracked

## Evolusi Repo Dari Initial Commit Sampai HEAD

### Fase 1: Fondasi agent DLMM

Baseline awal repo adalah agent DLMM Meteora dengan loop agent utama, deploy/close/claim dasar, config runtime, dan integrasi Telegram dasar.

### Fase 2: Screening dan token intelligence

Berdasarkan histori commit, repo lalu berkembang dengan penambahan:

- `search_pools`
- `get_token_info`
- `get_token_holders`
- `get_token_narrative`
- bundler/bot-holder detection
- smart-wallet cross-reference
- fee/token quality gating
- launchpad filtering

Contoh commit:

- `e45a6dc` add `search_pools`
- `2eb046e`, `56c02a5`, `9bb6af4` add token info/holder tooling
- `0b48341`, `fd54829`, `0218812` smart-wallet + token-holder enrichment
- `3558531` add hard global fee gate

### Fase 3: Smart-wallets, memory, blacklist, learning

Repo lalu bertambah ke arah stateful trading agent:

- smart-wallet tracker
- pool memory
- token blacklist dan dev blocklist
- lessons/performance history
- Darwin signal weighting
- threshold evolution

Contoh commit:

- `4f93628` smart wallet tracker
- `15330f7` pool memory, performance history, briefing watchdog
- `fb298a5` upgrade agent memory
- `621c687` mid-position snapshots + pool recall

### Fase 4: Strategy engine dan deploy logic

Kemudian masuk ke layer strategi dan deploy sophistication:

- strategy library
- spot / bid-ask / curve support
- wide range deploy support
- volatility-based bins
- strategy-aware management
- compounding deploy sizing

Contoh commit:

- `dec5642` strategy library
- `904f9a8`, `fed365f`, `bca36ca`, `ae91fba` deploy strategy/range upgrades
- `7c03e59` compounding-aware deploy sizing
- `9a83854`, `2abc37d`, `d37bf85` volatility-to-bins improvements
- `f28ad73` strategy-aware position management

### Fase 5: Management automation dan safety

Repo bertambah kuat di sisi operational safety:

- deterministic close rules
- trailing TP
- fee-per-TVL exit rules
- OOR cooldown
- repeat-deploy guard
- close verification
- deploy hallucination prevention
- hard prechecks sebelum screening/deploy

Contoh commit:

- `3325a9d`, `64c2ff0`, `1bda3a0` management close rules
- `5faf054`, `693500d` fee/yield dan OOR rules
- `8301d38`, `465175f`, `0b22796` double-screen/double-deploy prevention
- `3427771`, `82376c4` enforce screening thresholds and deploy range guards

### Fase 6: CLI, Claude integration, Telegram, HiveMind

Layer interface dan orchestration juga bertambah besar:

- CLI native `meridian`
- Claude Code integration
- HiveMind integration
- Discord listener
- Telegram live progress
- Telegram settings menu

Contoh commit:

- `eb8f724` meridian CLI
- `04a9de9` Claude Code integration
- `a26be92`, `4b5ea81` HiveMind
- `28c903a`, `aad6603`, `e5e357d`, `08904f7` live Telegram progress
- `a6ea916` Telegram settings menu

### Fase 7: Relay / Agent Meridian / OKX / position accounting

Bagian terakhir sebelum local changes lebih fokus ke data quality dan relay:

- OKX authenticated enrichment
- relay routing via Agent Meridian
- LPAgent position PnL
- open-position accounting via PnL API
- graceful shutdown / PM2 handling

Contoh commit:

- `18dd0c5`, `f966586`, `98d3a88`, `21baf20` OKX and risk enrichment
- `7f9f8d4`, `6657927`, `193535c` Agent Meridian relay path
- `001c2d4`, `1a98513` better open/live accounting
- `b7349ff`, `fa787e1`, `20e3c02` PM2 lifecycle hardening

## Status HEAD vs Upstream Lokal

- Upstream branch: `origin/main`
- Ahead/behind terhadap ref upstream lokal: `0/0`
- Artinya: tidak ada commit lokal tambahan yang committed tetapi belum masuk ke ref `origin/main` lokal.

## Perubahan Lokal Belum Committed

### Ringkasan kuantitatif

Diff working tree terhadap `HEAD`:

- `19 files changed`
- `3591 insertions`
- `264 deletions`

File modified:

- `CLAUDE.md`
- `briefing.js`
- `cli.js`
- `config.js`
- `ecosystem.config.cjs`
- `index.js`
- `lessons.js`
- `logger.js`
- `package-lock.json`
- `package.json`
- `prompt.js`
- `smart-wallets.js`
- `state.js`
- `strategy-library.js`
- `telegram.js`
- `tools/dlmm.js`
- `tools/executor.js`
- `tools/screening.js`
- `user-config.example.json`

Untracked:

- `assets/`
- `backups/`
- `codex.txt`
- `pnl-card.js`
- `scratch/`
- `scripts/bootstrap-wallets.js`
- `scripts/send-briefing-manual.js`
- `user-config-guide.md`
- `user-config.json.live`
- `user-config.json.original`
- `user.config.json.5m`

## Fitur dan Perubahan Behavior Yang Terlihat Dari Local Changes

### 1. Briefing jauh lebih kaya dan visual

Perubahan lokal menambah:

- wallet snapshot ke briefing
- live positions snapshot
- closed-position history
- validasi performance records
- best/worst close summary
- best entry hour analysis
- top pools dan problem pools dari `pool-memory`
- statistik harian untuk image card

File terkait:

- `briefing.js`
- `pnl-card.js`
- `assets/*.ttf`
- `assets/bg_green.png`
- `assets/bg_red.png`

Efek:

- briefing Telegram bukan lagi sekadar teks ringkas
- ada dukungan render image PnL / daily summary

### 2. Telegram UX naik kelas

Perubahan lokal menambah:

- managed action messages
- action keyboard default
- overwrite/delete behavior untuk cycle logs
- persistence `lastTelegramMessageId`
- `sendPhoto`
- `deleteMessage`
- `setupBotCommands`

Efek:

- log Telegram lebih rapi
- satu slot pesan bisa diedit/ditimpa
- briefing/image dan cycle report lebih presentable

### 3. Strategy library diperluas besar

Perubahan lokal menambah beberapa preset strategy baru, termasuk:

- `single_sided_sol_bidask`
- `sol_spot_balanced_entry`
- `conservative_wide_bidask`
- beberapa preset bergaya `lparmy_*`

Efek:

- library strategi lokal jauh lebih kaya dari `HEAD`
- ada orientasi eksplisit ke SOL-only deploy dan style-specific presets

### 4. Management cycle lebih agresif dan lebih "native"

Perubahan lokal di `index.js` dan `state.js` menunjukkan:

- macro panic switch berbasis perubahan harga SOL 1 jam
- JS-native `REBALANCE`
- `PARTIAL_TP` scaffolding
- custom stop-loss per position
- persist `last_known_pnl_*`
- management report formatting yang lebih rapi

Efek:

- agent lokal mencoba menangani lebih banyak keputusan tanpa menyerahkan semuanya ke LLM
- ada guard makro untuk pause atau close-all saat panic

Catatan:

- `PARTIAL_TP` masih belum implement on-chain penuh; helper di `state.js` masih mengembalikan "not implemented"

### 5. Screening lokal lebih ketat dan lebih kaya data

Perubahan lokal di `tools/screening.js` menunjukkan:

- hanya quote `SOL` yang lolos
- `maxVolatility` dipakai sebagai hard reject
- dynamic min floor untuk `fee_active_tvl_ratio`
- RugCheck summary dipakai
- organic score sangat rendah diblok
- pool history enrichment dari `lessons.js`
- momentum scoring tambahan
- timeframe mapping yang lebih eksplisit untuk pool discovery

Efek:

- screening lokal lebih opinionated dibanding `HEAD`
- kandidat akan lebih sedikit tetapi lebih ketat

### 6. Position accounting dan live-state injection lebih kuat

Perubahan lokal di `tools/dlmm.js` dan `state.js` menambah:

- `base_mint` pada tracked positions
- local open-position injection jika Meteora belum mengindeks posisi baru
- fallback ke relay positions-only bila portfolio API gagal
- skip posisi yang sudah ditandai closed di state lokal
- resolve pool display name lebih cerdas
- snapshot sinyal indikator ikut tersimpan saat deploy

Efek:

- state lokal lebih tahan terhadap lag API eksternal
- nama pair/position lebih bersih
- risiko posisi "hilang" sementara karena indexing delay lebih kecil

### 7. Smart-wallet scanning diubah

Perubahan lokal menambah:

- cache posisi wallet
- dedupe in-flight request
- pembatasan concurrency fetch wallet

Efek:

- mengurangi ledakan request paralel ke RPC
- menurunkan risiko `429` dibanding implementasi yang lebih naive

### 8. Lessons/performance analytics bertambah

Perubahan lokal di `lessons.js` menambah:

- sanitasi struktur file lessons/performance
- filter performance record valid
- `getPoolStats`
- `getBestEntryHours`
- `getWinRateForKelly`
- pembenahan evolusi `minFeeActiveTvlRatio`

Efek:

- local branch mencoba memakai data historis untuk:
  - jam entry terbaik
  - Kelly sizing
  - track record per pool

### 9. Operasional tambahan di luar flow utama

Perubahan lokal juga menambah:

- `scripts/bootstrap-wallets.js`
  - bootstrap smart wallets dari top LPers pool Meteora
- `scripts/send-briefing-manual.js`
  - trigger briefing manual ke Telegram
- `user-config-guide.md`
  - dokumentasi lengkap `user-config.json`
- `backups/`
  - snapshot state/lessons/config untuk recovery/eksperimen

## Interpretasi Singkat

Secara praktis, local working tree ini sudah berkembang menjadi varian yang lebih "operator-heavy" dibanding `HEAD`:

- lebih banyak UX Telegram
- lebih banyak analytics dan reporting
- lebih ketat screening
- lebih banyak strategy presets
- lebih banyak guard runtime
- lebih banyak recovery/fallback logic pada state posisi

Tradeoff-nya:

- kompleksitas runtime naik signifikan
- surface area bug juga naik
- beberapa fitur masih setengah jalan, terutama `partial TP`

## File Yang Paling Menentukan Perubahan Lokal

Berdasarkan diff size dan impact:

- `index.js`
- `telegram.js`
- `briefing.js`
- `tools/dlmm.js`
- `tools/screening.js`
- `strategy-library.js`
- `lessons.js`
- `state.js`

## Saran Lanjutan

Kalau audit ini mau dijadikan basis merge/cleanup, langkah paling masuk akal:

1. Pisahkan local changes menjadi 3 tema:
   - reporting/Telegram UX
   - screening/strategy logic
   - state/accounting/runtime safety
2. Tandai fitur yang belum production-ready:
   - `partialTakeProfitEnabled`
   - strategy presets yang belum diuji live
   - macro panic `close_all` flow
3. Commit file untracked yang memang product asset:
   - `pnl-card.js`
   - `assets/`
   - `scripts/bootstrap-wallets.js`
   - `scripts/send-briefing-manual.js`
   - `user-config-guide.md`
4. Jangan commit:discoverydiscovery
   - `backups/`
   - `user-config.json.live`
   - `user-config.json.original`
   - `user.config.json.5m`

