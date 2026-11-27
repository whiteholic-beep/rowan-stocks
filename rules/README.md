# Aturan trading Rowan Stocks — parser (Tahap 2)

Parser JS murni: kalimat biasa masuk, aturan terstruktur keluar. Tanpa
jaringan, tanpa dependensi, tanpa AI — hanya pencocokan pola
deterministik.

## Cakupan (dikunci)

Sampai end-to-end terbukti jalan, hanya ada **1 jenis aturan + 1 saham**:

- Jenis aturan: **stop-loss jual** — jual tNVDAc saat harga turun X% dari
  harga acuan.
- Saham: **tNVDAc (NVDA)** — token mock di Base Sepolia. Token lain ditolak.
- Aturan beli ("beli saat turun 5%") DITUNDA sebagai perluasan, belum dibuat.

## Format aturan yang didukung

```
[jual] [tNVDAc] [turun X%] [dari harga acuan]
```

| Bagian | Yang diterima | Contoh |
|---|---|---|
| Aksi | `jual`, `sell` (juga `lepas`) | "Jual NVDA ..." |
| Saham | `tNVDAc`, `NVDAc`, `NVDA` (alias, huruf besar/kecil bebas). Kalau tidak disebut, default `tNVDAc`. | "Jual NVDA ..." |
| Penurunan | `turun`, `jatuh`, `anjlok`, `merosot` / `drop`, `fall`, `decline`, `down` | "... kalau turun 5%" |
| Persen | Angka + `%`, `persen`, `percent`, atau `pct`. Harus `0 < X <= 100`. Koma desimal boleh: `5,5%`. | "turun 5%" |
| Harga acuan | `harga hari ini` / `harga sekarang` / `harga saat ini` / `today's price` / `current price` → `current`; `harga beli` / `harga masuk` / `harga awal` / `buy price` / `entry price` → `entry`. Kalau tidak disebut, default `current`. | "... dari harga beli" |

## Contoh

```
Jual NVDA kalau turun 5% dari harga hari ini
→ { type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc',
    thresholdPct: 5, reference: 'current', ... }

Jual tNVDAc kalau turun 10% dari harga beli
→ { ..., thresholdPct: 10, reference: 'entry', ... }

Sell tNVDAc if it drops 5% from today's price
→ { ..., thresholdPct: 5, reference: 'current', language: 'en', ... }

Jual NVDA kalau turun 7,5% dari harga sekarang
→ { ..., thresholdPct: 7.5, reference: 'current', ... }
```

Objek aturan lengkap:

```js
{
  type: 'stop-loss-sell',   // satu-satunya jenis aturan saat ini
  action: 'sell',
  token: 'tNVDAc',
  tokenExplicit: true,      // false kalau saham tidak disebut (default tNVDAc)
  thresholdPct: 5,          // angka, 0 < X <= 100
  reference: 'current',     // 'current' (harga hari ini) atau 'entry' (harga beli)
  referenceExplicit: true,  // false kalau acuan tidak disebut (default 'current')
  language: 'id',           // 'id' atau 'en', dari bahasa kalimatnya
  grammarVersion: 1,
  source: '...'             // kalimat asli pengguna
}
```

## Yang ditolak (dengan pesan jelas)

- Aturan beli: "Beli NVDA kalau turun 5%" → belum didukung.
- Token lain: "Jual TSLA kalau turun 5%" → hanya tNVDAc.
- Tanpa persen: "Jual NVDA kalau turun" → tulis angkanya, contoh 5%.
- Persen tidak valid: `0%`, `-5%`, `101%` → harus di antara 0 dan 100.
- Angka tertulis huruf: "lima persen" → pakai angka (5%).
- Dua persen: "turun 5% dan 10%" → tulis satu saja.
- Arah naik: "Kalau NVDA naik 5%, jual" → bukan stop-loss.
- Tanpa aksi: "NVDA turun 5%" → tulis "jual".
- Acuan membingungkan: "... dari harga hari ini dan harga beli" → pilih satu.
- Acuan harga tetap: "... dari $150" → belum didukung, pakai "harga hari ini"
  atau "harga beli".

Pesan error mengikuti bahasa kalimatnya (Indonesia atau Inggris).

## Cara pakai

Node:

```js
const { parseRule, describeRule } = require('./parser.js');
const rule = parseRule('Jual NVDA kalau turun 5% dari harga hari ini');
console.log(describeRule(rule));
// "Jual tNVDAc kalau harganya turun 5% dari harga hari ini."
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
- **Ambang 100% diterima** (turun 100% = harga jadi nol). Batas atas
  `<= 100` mengikuti spesifikasi; `0%` ditolak karena bukan aturan.
