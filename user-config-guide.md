# Gods Grace user-config.json Guide

Panduan ini menjelaskan fungsi setiap key utama di `user-config.json`.
File config asli sengaja dibiarkan sebagai JSON murni tanpa komentar.

## Runtime

| Key | Keterangan |
| --- | --- |
| `preset` | Label profil konfigurasi yang sedang dipakai. |
| `dryRun` | `true` berarti tidak mengirim transaksi live; `false` berarti transaksi on-chain bisa dikirim. |
| `rpcUrl` | RPC Solana untuk membaca chain dan mengirim transaksi. |
| `llmBaseUrl` | Base URL provider LLM yang kompatibel dengan OpenAI API. |
| `llmApiKey` | API key provider LLM. Rahasia, jangan commit atau share. |
| `llmModel` | Model default jika role-specific model tidak mengoverride. |
| `temperature` | Temperature LLM. Lebih rendah berarti output lebih konsisten. |
| `maxTokens` | Batas token output LLM. |
| `maxSteps` | Maksimum tool-call/step agent dalam satu loop. |
| `managementModel` | Model untuk management posisi. |
| `screeningModel` | Model untuk screening dan deploy decision. |
| `generalModel` | Model untuk command umum. |

## Position Sizing

| Key | Keterangan |
| --- | --- |
| `deployAmountSol` | Ukuran deploy dasar per posisi dalam SOL. |
| `maxDeployAmount` | Batas maksimum ukuran deploy per posisi. |
| `positionSizePct` | Persentase saldo bebas untuk sizing dinamis. |
| `gasReserve` | SOL yang disisakan untuk gas/fee. |
| `minSolToOpen` | Saldo SOL minimum agar agent boleh membuka posisi baru. |
| `maxPositions` | Jumlah maksimum posisi terbuka bersamaan. |
| `kellyEnabled` | Dynamic sizing berbasis historical win rate. Disarankan `false` sampai data closed trade cukup bersih. |

## Strategy And Range

| Key | Keterangan |
| --- | --- |
| `strategy` | Strategi DLMM default, misalnya `bid_ask` atau `spot`. |
| `minBinsBelow` | Jumlah bin bawah minimum untuk range deploy. |
| `maxBinsBelow` | Jumlah bin bawah maksimum untuk range deploy. |
| `defaultBinsBelow` | Jumlah bin bawah default saat agent tidak menentukan range lain. |
| `minBinStep` | Bin step minimum DLMM yang boleh dipakai. |
| `maxBinStep` | Bin step maksimum DLMM yang boleh dipakai. |

## Screening

| Key | Keterangan |
| --- | --- |
| `timeframe` | Timeframe data pool discovery/screening utama. |
| `category` | Kategori pool discovery, misalnya `trending`, `top`, atau `new`. |
| `excludeHighSupplyConcentration` | Filter token dengan konsentrasi supply tinggi. |
| `minTvl` | TVL minimum pool agar lolos screening. |
| `maxTvl` | TVL maksimum pool agar tidak masuk pool terlalu besar/ramai. |
| `minVolume` | Volume minimum pada timeframe screening. |
| `minOrganic` | Organic score minimum token base. |
| `minQuoteOrganic` | Organic score minimum token quote. |
| `minHolders` | Jumlah holder minimum token base. |
| `minMcap` | Market cap minimum token base. |
| `maxMcap` | Market cap maksimum token base. |
| `minFeeActiveTvlRatio` | Fee/active-TVL minimum agar pool dianggap cukup menghasilkan fee. |
| `maxVolatility` | Volatilitas maksimum yang masih boleh dipilih. |
| `minTokenFeesSol` | Minimum global token fees dalam SOL sebagai proxy kualitas aktivitas token. |
| `athFilterPct` | Filter jarak dari ATH. `null` berarti tidak aktif. |

## Holder And Launchpad Risk

| Key | Keterangan |
| --- | --- |
| `maxBundlePct` | Batas maksimum persentase bundle holding. |
| `maxBotHoldersPct` | Batas maksimum persentase holder bot. |
| `maxTop10Pct` | Batas maksimum konsentrasi top 10 holder. |
| `allowedLaunchpads` | Allow-list launchpad. Kosong berarti semua launchpad boleh jika lolos filter lain. |
| `blockedLaunchpads` | Block-list launchpad yang tidak boleh dipilih. |
| `minTokenAgeHours` | Umur token minimum dalam jam. |
| `maxTokenAgeHours` | Umur token maksimum dalam jam. |
| `avoidPvpSymbols` | Mendeteksi risiko token dengan simbol sama/rival PVP. |
| `blockPvpSymbols` | Jika `true`, kandidat PVP diblokir keras. |

## Discord Signals

| Key | Keterangan |
| --- | --- |
| `useDiscordSignals` | Mengaktifkan kandidat tambahan dari signal Discord. |
| `discordSignalMode` | Cara memakai signal Discord: `merge` dengan discovery atau `only` Discord. |

## Management Rules

| Key | Keterangan |
| --- | --- |
| `minClaimAmount` | Minimum fee unclaimed sebelum agent melakukan claim. |
| `autoSwapAfterClaim` | Jika `true`, token hasil claim otomatis swap ke SOL. |
| `stopLossPct` | Batas rugi persentase untuk close posisi. |
| `takeProfitPct` | Batas profit persentase untuk close posisi. |
| `trailingTakeProfit` | Mengaktifkan trailing take profit. |
| `trailingTriggerPct` | Profit minimum agar trailing TP mulai aktif. |
| `trailingDropPct` | Drop dari peak profit yang memicu close trailing TP. |
| `pnlSanityMaxDiffPct` | Selisih maksimum reported vs derived PnL sebelum data dianggap suspicious. |
| `minFeePerTvl24h` | Yield fee/TVL 24h minimum untuk mempertahankan posisi. |
| `minAgeBeforeYieldCheck` | Umur minimum posisi sebelum low-yield rule aktif. |
| `partialTakeProfitEnabled` | Mengaktifkan partial take profit. Saat ini disarankan `false` karena partial withdraw on-chain belum implement. |

## Out Of Range And Cooldown

| Key | Keterangan |
| --- | --- |
| `outOfRangeBinsToClose` | Jarak bin di luar range yang memicu close cepat. |
| `outOfRangeWaitMinutes` | Durasi out-of-range sebelum posisi boleh ditutup. |
| `oorCooldownTriggerCount` | Jumlah close OOR yang memicu cooldown pool/token. |
| `oorCooldownHours` | Durasi cooldown setelah terlalu sering OOR. |
| `repeatDeployCooldownEnabled` | Mencegah deploy berulang ke token/pool yang baru gagal. |
| `repeatDeployCooldownTriggerCount` | Jumlah kejadian yang memicu repeat deploy cooldown. |
| `repeatDeployCooldownHours` | Durasi repeat deploy cooldown. |
| `repeatDeployCooldownScope` | Scope cooldown: `pool`, `token`, atau `both`. |
| `repeatDeployCooldownMinFeeEarnedPct` | Fee minimum agar close tidak dihitung sebagai kegagalan repeat deploy. |
| `minVolumeToRebalance` | Volume minimum pool agar rebalance otomatis boleh dipertimbangkan. |
| `autoRebalanceEnabled` | Jika `true`, agent boleh close lalu deploy ulang saat OOR. Disarankan `false` sampai teruji. |

## Macro Guard

| Key | Keterangan |
| --- | --- |
| `macroPanicMode` | Mode saat SOL dump: `pause` untuk stop deploy baru, `close_all` untuk close semua posisi. |
| `solMode` | Jika `true`, laporan memakai SOL/native mode. |

## Schedule

| Key | Keterangan |
| --- | --- |
| `managementIntervalMin` | Interval management cycle dalam menit. |
| `screeningIntervalMin` | Interval screening cycle dalam menit. |
| `healthCheckIntervalMin` | Interval health check dalam menit. |

## Darwin Learning

| Key | Keterangan |
| --- | --- |
| `darwinEnabled` | Mengaktifkan pembobotan sinyal berdasarkan hasil historis. |
| `darwinWindowDays` | Window hari data historis untuk Darwin weighting. |
| `darwinRecalcEvery` | Frekuensi recalculation Darwin dalam jumlah trade/cycle. |
| `darwinBoost` | Multiplier naik untuk sinyal yang terbukti bagus. |
| `darwinDecay` | Multiplier turun untuk sinyal yang buruk. |
| `darwinFloor` | Batas bawah bobot Darwin. |
| `darwinCeiling` | Batas atas bobot Darwin. |
| `darwinMinSamples` | Minimum sample sebelum Darwin weighting dipercaya. |

## Agent Meridian And HiveMind

| Key | Keterangan |
| --- | --- |
| `agentId` | ID agent untuk integrasi Agent Meridian/HiveMind. |
| `publicApiKey` | Public API key untuk Agent Meridian. Jangan share jika dianggap kredensial. |
| `agentMeridianApiUrl` | Endpoint API Agent Meridian. |
| `lpAgentRelayEnabled` | Mengaktifkan relay LPAgent untuk order/deploy/close jika didukung. |
| `hiveMindUrl` | Endpoint HiveMind. |
| `hiveMindApiKey` | API key HiveMind. Rahasia, jangan commit atau share. |
| `hiveMindPullMode` | Mode sinkronisasi HiveMind. |

## Chart Indicators

| Key | Keterangan |
| --- | --- |
| `chartIndicators.enabled` | Mengaktifkan konfirmasi indikator chart. |
| `chartIndicators.entryPreset` | Preset indikator untuk entry. |
| `chartIndicators.exitPreset` | Preset indikator untuk exit. |
| `chartIndicators.rsiLength` | Panjang RSI yang dipakai indikator. |
| `chartIndicators.intervals` | Daftar interval candle untuk konfirmasi indikator. |
| `chartIndicators.candles` | Jumlah candle yang diminta untuk analisis indikator. |
| `chartIndicators.rsiOversold` | Ambang RSI oversold. |
| `chartIndicators.rsiOverbought` | Ambang RSI overbought. |
| `chartIndicators.requireAllIntervals` | Jika `true`, semua interval harus mengonfirmasi signal. |

## Telegram

| Key | Keterangan |
| --- | --- |
| `telegramChatId` | Chat ID Telegram tujuan notifikasi/control. |
| `telegramThreadId` | Topic ID (Message Thread ID) Telegram untuk grup dengan topik/forum. |
| `telegramLogBehavior` | Perilaku log Telegram, misalnya `delete` untuk merapikan pesan lama. |

## Internal Metadata

| Key | Keterangan |
| --- | --- |
| `_lastAgentTune` | Timestamp terakhir tuning otomatis/manual. |
