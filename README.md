# Rowan Stocks — AI agent for tokenized stocks on Base

Entry for the **Base Stocks Maxxing Season** (Coinbase/Base), **Agentic Stock Finance** track.
Quest period: Nov 5 – Dec 5, 2026. Submission: public X video demo tagging
@buildonbase + official submission form. Prizes paid in USDC on Base.

Live site: https://whiteholic-beep.github.io/rowan-stocks/

## What it is

Most people can't follow the stock market — prices, tickers, percentages.
Rowan Stocks is an AI agent that does the watching for you and explains it in
plain language:

1. **Live board** — live prices for 11 Coinbase-issued tokenized stocks on
   Base (NVDAc, AAPLc, TSLAc, MSFTc, GOOGLc, AMZNc, METAc, MSTRc, CRCLc,
   SNDKc, SPCXc), fetched live from the Dexscreener public API (Base DEX
   pools on Aerodrome/Uniswap). Never hardcoded, never simulated.
2. **Daily briefing** — the agent writes a short plain-language briefing from
   the live numbers: how many stocks are up, biggest mover, most traded.
3. **Ask Rowan** — type a ticker, get a live-data answer in simple words.
4. **On-chain watchlist** — save your watchlist to the `RowanStocks`
   contract on Base Sepolia testnet + free daily check-in with streak.
5. **Risk banner** — educational demo, not financial advice, no real trading,
   no promised returns, no voting rights in underlying companies.

## What was built during the quest period (Nov 22 – Dec 5, 2026)

- `contracts/RowanStocks.sol` — watchlist registry + daily check-in +
  agent briefing log. No owner/admin/withdraw/pause. Testnet only.
- `index.html` — the live dApp (single-file build of the public site).
  Live data via Dexscreener batch API.

## Contract (Base Sepolia testnet, chain 84532)

- Address: `0xc2ADeA8451E951F99ae1397cc1bf2D7E7f03eCa5`
- Deploy tx: `0x70478aee8cfa82b0368a09a51b2198da229b21266702bb1b7b27c1372382eb57` (block 62028393)
- Explorer: https://sepolia.basescan.org/address/0xc2ADeA8451E951F99ae1397cc1bf2D7E7f03eCa5
- First on-chain briefing tx: `0x1f1791896e09abd7a3cc631a15e8c7ba35c74a6acd0be655eab4fe4f37bd5ee6` (block 62028610)
- Smoke test PASSED (check-in streak 1, watchlist AAPL/TSLA/NVDA, briefing count 1)
- Source verification: PASSED via Etherscan v2 API (chainid 84532) —
  "Pass - Verified", Exact Match (confirmed Nov 22, 2026).
- Deployer (testnet only): `0xd482B6572917b6d9679Bbc3aF55FCbfa8743BBf0`
  (fresh wallet, key kept out of this repo — never mainnet)

## How to run the dApp locally

Open `index.html` in a browser. Market board, briefing and Q&A work with
no wallet. On-chain features need an injected wallet on Base Sepolia
(chain 84532).

## Tests

`npx hardhat test` — 5 passing (check-in streak/reset, watchlist set/replace/
limits, agent-only briefings).

## Compliance notes (per Official Rules §5–§6)

- No purchase or payment necessary; testnet deployment explicitly allowed and
  "will not be judged less favorably".
- No token launched. No real assets traded. No returns promised anywhere.
- No claim of rights in any underlying public company.
- Prizes (if won) are paid in USDC on Base to the wallet Haqi provides at
  submission; winner verification (ID/age/residence, W-9/W-8) is Haqi's step.
