# Aturan trading Rowan Stocks — parser (Tahap 2, direvisi Tahap 3.5)

Parser JS murni: kalimat biasa masuk, aturan terstruktur keluar. Tanpa
jaringan, tanpa dependensi, tanpa AI — hanya pencocokan pola
deterministik.

## Cakupan (dikunci)

Sampai end-to-end terbukti jalan, hanya ada **1 jenis aturan + 1 saham**:

- Jenis aturan: **paired sell** — satu aturan dengan dua exit:
  **stop-loss** (jual tNVDAc saat harga turun X% dari harga acuan)
  dan/atau **take-profit** (jual saat harga naik Y% dari harga acuan
  yang sama). Kedua sisi boleh ada, salah satu boleh tidak ada, tapi
  minimal satu harus ada. SL dan TP adalah pasangan yang wajib ada
  (Haqi, 28 Nov 2026: "SL/TP itu wajib") — aturan dengan satu sisi
  tetap bisa dibuat, tapi produknya menawarkan keduanya.
- Saham: **tNVDAc (NVDA)** — token mock di Base Sepolia. Token lain ditolak.
- Aturan beli ("beli saat turun 5%") DITUNDA sebagai perluasan, belum dibuat.

## Format aturan yang didukung

```
[jual] [tNVDAc] [turun X%] [atau naik Y%] [dari harga acuan]
```

| Bagian | Yang diterima | Contoh |
|---|---|---|
| Aksi | `jual`, `sell` (juga `lepas`) | "Jual NVDA ..." |
| Saham | `tNVDAc`, `NVDAc`, `NVDA` (alias, huruf besar/kecil bebas). Kalau tidak disebut, default `tNVDAc`. | "Jual NVDA ..." |
| Penurunan (stop-loss) | `turun`, `jatuh`, `anjlok`, `merosot` / `drop`, `fall`, `decline`, `down` | "... kalau turun 5%" |
| Kenaikan (take-profit) | `naik`, `menguat` / `rise`, `climb`, `gain` | "... atau naik 50%" |
| Persen | Angka + `%`, `persen`, `percent`, atau `pct`. Harus `0 < X <= 100`. Koma desimal boleh: `5,5%`. Maksimal satu persen per arah (satu untuk stop-loss, satu untuk take-profit). Setiap persen dikaitkan ke kata arah terdekat, jadi urutan tidak penting. | "turun 5% atau naik 50%" |
| Harga acuan | `harga hari ini` / `harga sekarang` / `harga saat ini` / `today's price` / `current price` → `current`; `harga beli` / `harga masuk` / `harga awal` / `buy price` / `entry price` → `entry`. Kalau tidak disebut, default `current`. | "... dari harga beli" |

## Contoh

```
Jual NVDA kalau turun 5% dari harga hari ini
→ { type: 'paired-sell', action: 'sell', token: 'tNVDAc',
    stopLossPct: 5, takeProfitPct: null, reference: 'current', ... }

Jual tNVDAc kalau turun 5% atau naik 50% dari harga sekarang
→ { ..., stopLossPct: 5, takeProfitPct: 50, reference: 'current', ... }

Jual NVDA kalau naik 50% dari harga hari ini
→ { ..., stopLossPct: null, takeProfitPct: 50, ... }

Sell tNVDAc if it drops 5% or rises 50% from today's price
→ { ..., stopLossPct: 5, takeProfitPct: 50, language: 'en', ... }

Jual NVDA kalau turun 7,5% dari harga sekarang
→ { ..., stopLossPct: 7.5, takeProfitPct: null, ... }
```

Objek aturan lengkap:

```js
{
  type: 'paired-sell',  // satu-satunya jenis aturan saat ini
  action: 'sell',
  token: 'tNVDAc',
  tokenExplicit: true,      // false kalau saham tidak disebut (default tNVDAc)
  stopLossPct: 5,           // angka 0 < X <= 100, atau null kalau tidak ada SL
  takeProfitPct: 50,        // angka 0 < X <= 100, atau null kalau tidak ada TP
  reference: 'current',     // 'current' (harga hari ini) atau 'entry' (harga beli)
  referenceExplicit: true,  // false kalau acuan tidak disebut (default 'current')
  language: 'id',           // 'id' atau 'en', dari bahasa kalimatnya
  grammarVersion: 2,
  source: '...'             // kalimat asli pengguna
}
```

Aturan lama Tahap 2/3 (`type: 'stop-loss-sell'`, `thresholdPct`) masih
dimengerti: `normalizeRule()` mengubahnya ke bentuk di atas
(`stopLossPct`, `takeProfitPct: null`), jadi aturan yang sudah tersimpan
di localStorage tetap jalan.

## Yang ditolak (dengan pesan jelas)

- Aturan beli: "Beli NVDA kalau turun 5%" → belum didukung.
- Token lain: "Jual TSLA kalau turun 5%" → hanya tNVDAc.
- Tanpa persen: "Jual NVDA kalau turun" → tulis angkanya, contoh 5%.
- Persen tidak valid: `0%`, `-5%`, `101%` → harus di antara 0 dan 100.
  Berlaku untuk kedua sisi (SL dan TP).
- Angka tertulis huruf: "lima persen" → pakai angka (5%).
- Dua persen di arah yang sama: "turun 5% dan 10%" → maksimal satu
  persen per arah (satu SL, satu TP).
- Tiga persen atau lebih: "turun 5% atau naik 50% atau turun 10%" →
  terlalu banyak.
- Tanpa kata arah: "Jual NVDA 5% dari harga hari ini" → tulis "turun"
  (stop-loss) atau "naik" (take-profit).
- Tanpa aksi: "NVDA turun 5%" → tulis "jual".
- Acuan membingungkan: "... dari harga hari ini dan harga beli" → pilih satu.
- Acuan harga tetap: "... dari $150" → belum didukung, pakai "harga hari ini"
  atau "harga beli".

Pesan error mengikuti bahasa kalimatnya (Indonesia atau Inggris).
Kode error `RISE_NOT_SUPPORTED` dan `NO_DROP` dari grammar v1 sudah
dihapus di Tahap 3.5 — "naik" sekarang sah sebagai take-profit, dan
"tidak ada kata arah" memakai kode baru `NO_DIRECTION`.

## Cara pakai

Node:

```js
const { parseRule, describeRule } = require('./parser.js');
const rule = parseRule('Jual NVDA kalau turun 5% atau naik 50% dari harga hari ini');
console.log(describeRule(rule));
// "Jual tNVDAc kalau harganya turun 5% atau naik 50% dari harga hari ini."
```

Browser: muat file ini dengan `<script>` lalu pakai
`window.RowanRules.parseRule(...)` — API yang sama.

Kalau kalimat tidak bisa dipahami, `parseRule` melempar `RuleParseError`
dengan `.code` (mis. `NO_PERCENT`, `UNKNOWN_TOKEN`) dan `.message` yang
bisa langsung ditampilkan ke pengguna.

## Tes

```bash
node --test rules/parser.test.js
```

Tes memakai test runner bawaan Node — tanpa dependensi baru.

## Tahap 3 — web app (`rules.html`)

Halaman pembuatan aturan, gaya sama dengan situs utama (Base-blue blueprint).
Buka `rules.html` di browser (atau sajikan dari repo) — tidak ada build step.

- **Tulis aturan** (`rules/app.js` + `rules/parser.js`): ketik kalimat biasa
  (Indonesia/Inggris), parser mengubahnya jadi aturan berpasangan
  (stop-loss dan/atau take-profit). Hasilnya tampil sebagai satu kalimat
  konfirmasi (`describeRule`) plus catatan default (token/acuan yang tidak
  disebut) dan kedua harga trigger yang dihitung dari harga acuan live.
  Error parser tampil apa adanya, dalam bahasa kalimatnya.
- **Konfirmasi + batas nominal:** sebelum aturan aktif, pengguna menekan
  "Confirm & activate rule" dan menetapkan **max tNVDAc yang boleh dijual**
  (default 100, maks 1.000). Aturan aktif tersimpan di localStorage browser
  saja (`rules/storage.js`) — tidak ada server, tidak ada kunci privat.
  Aturan lama Tahap 3 (stop-loss saja) tetap terbaca: dibaca sebagai
  paired-sell dengan `takeProfitPct: null`.
- **Harga acuan live** (`rules/price.js`): harga NVDAc asli di Base mainnet
  dari API publik Dexscreener (read-only). Harga ini yang dipakai trigger;
  token yang di-swap di Sepolia adalah mock — UI menulis perbedaan ini
  dengan jelas.
- **Mock faucet** (`rules/faucet.js`): tombol "Mint 100 test tNVDAc"
  memanggil `mint()` di kontrak mock lewat wallet pengguna sendiri
  (pengguna tanda tangan di wallet; Rowan tidak pernah pegang kunci).
- **Panduan 3 langkah** di halaman: ambil ETH Sepolia dari faucet (urutan
  thirdweb → Chainlink → CDP → Alchemy terakhir), connect wallet +
  check-in, mint tNVDAc + buat aturan.

### Mock tNVDAc — deployment (Base Sepolia, chain 84532)

- Kontrak: `contracts/MockToken.sol` (ERC-20, 8 desimal, open mint
  maks 1.000 token per panggilan, tanpa owner/admin/pause/fee).
- Alamat: `0x7D8c0fe1d88D772441ccc7b0F27fcA0b8a89A775`
- Deploy tx: `0x618628f62fb6480879149c55783d57b525c4b893551b2cb3498b146ecbb53bc2`
- Explorer: https://sepolia.basescan.org/address/0x7D8c0fe1d88D772441ccc7b0F27fcA0b8a89A775
- Source verification: **Pass - Verified** (v0.8.24, optimizer 200, cancun,
  MIT). Flattened source: `deployments/MockToken.flattened.sol`.
- Deployer: `0xd482B6572917b6d9679Bbc3aF55FCbfa8743BBf0` (testnet only).
- **TEST TOKEN ONLY** — bukan NVDAc asli (B20 hanya ada di mainnet).
  Tidak bernilai, tidak ada klaim atas saham apa pun.

### Tes Tahap 3 / 3.5

```bash
node --test rules/parser.test.js rules/storage.test.js rules/price.test.js rules/faucet.test.js
# 104 tes lolos (parser 52, storage 28, price 16, faucet 8 — hitung per 28 Nov 2026, Tahap 3.5)
```

`rules/app.js` (glue browser) tidak punya unit test — logikanya yang
murni sudah dipindah ke `storage.js` / `price.js` / `faucet.js` supaya
bisa dites tanpa wallet dan tanpa jaringan. Smoke test UMD: keempat modul
dimuat di `vm` dengan `window` palsu dan `describeRule` + `addRule` +
`buildMintCall` jalan (cek manual saat Tahap 3 selesai; ulangi untuk
`triggerPrices` di Tahap 3.5).

## Catatan desain (keputusan yang diambil)

- **Harga acuan default = harga hari ini (`current`).** Alasannya: saat
  pengguna membuat aturan tanpa menyebut acuan, yang paling masuk akal
  adalah "turun X% dari harga sekarang". Kalau yang dimaksud harga beli,
  pengguna harus menulisnya eksplisit. Output selalu menandai
  `referenceExplicit: false` kalau ini default, supaya UI Tahap 3 bisa
  menampilkan "dari harga hari ini" dan meminta konfirmasi.
- **Saham default = tNVDAc** dengan alasan yang sama (hanya satu saham
  yang didukung). `tokenExplicit: false` menandainya di output.
- **"Harga beli" berarti harga saat pengguna membeli** (bukan harga
  pasar saat aturan dibuat). Tahap 4 (monitor) nanti perlu tahu harga
  beli pengguna — entah dari input saat aktivasi aturan atau dari riwayat
  pembelian. Itu diputuskan di Tahap 4, bukan di parser.
- **Ambang 100% diterima** (turun 100% = harga jadi nol; naik 100% =
  harga jadi dua kali lipat). Batas atas `<= 100` mengikuti spesifikasi;
  `0%` ditolak karena bukan aturan.

## Tahap 3.5 — take-profit berpasangan (28 Nov 2026)

Haqi memutuskan SL dan TP itu **wajib** dan berpasangan ("bila perlu
rombak gapapa, yang penting SL/TP ada"). Bentuk aturan dirombak dari
satu ambang (`thresholdPct`) menjadi satu aturan dengan dua exit
(`stopLossPct` + `takeProfitPct`, masing-masing boleh null). Keputusan
desain:

- **Satu jenis aturan, bukan tiga.** Satu tipe `paired-sell` dengan dua
  field lebih bersih daripada tiga tipe (SL-only / TP-only / paired) —
  storage, UI, dan monitor Tahap 4 nanti tidak perlu bercabang per tipe,
  cukup membaca dua field yang bisa null.
- **Kaitan persen ↔ arah berdasarkan posisi.** Setiap persen dikaitkan
  ke kata arah terdekat (karakter), jadi "turun 5% atau naik 50%" dan
  "naik 50% atau turun 5%" menghasilkan aturan yang sama. Kata arah
  tanpa persen diabaikan — kalimat konfirmasi (`describeRule`) selalu
  menunjukkan apa yang dipahami parser sebelum pengguna menekan
  "Confirm & activate", jadi tidak ada yang diam-diam diasumsikan.
- **Migrasi, bukan putus.** Aturan Tahap 3 yang tersimpan
  (`stop-loss-sell` + `thresholdPct`) dinormalisasi saat dibaca
  (`normalizeRule` / `normalizeStored`) dan ditulis ulang dalam bentuk
  baru saat store berikutnya ditulis. Tes mencakup aturan lama yang
  di-seed manual.
- **Kode error v1 yang dihapus:** `RISE_NOT_SUPPORTED` ("naik" sekarang
  sah sebagai TP) dan `NO_DROP` (diganti `NO_DIRECTION`, karena aturan
  TP-only memang tidak punya kata turun).
- **Harga trigger TP** (`takeProfitPrice`, `triggerPrices` di `price.js`):
  acuan + Y%, simetris dengan SL (acuan − X%).
