'use strict';

/**
 * Rowan Stocks — Dexscreener price helper (Tahap 3).
 *
 * Pure deterministic JavaScript. No dependencies, no AI.
 * The trigger price for a stop-loss rule comes from the REAL NVDAc
 * token on Base mainnet, read through the public Dexscreener API
 * (read-only). The token actually swapped on Base Sepolia is the
 * mock tNVDAc — the two prices are different things and the UI
 * must say so.
 *
 * This module only extracts a price from an already-fetched
 * Dexscreener response; the fetch itself lives in rules/app.js
 * (browser) so this file stays testable without a network.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RowanPrice = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Real B20 NVDAc on Base mainnet (chain 8453) — verified in Tahap 1.
  var REAL_NVDAC = '0xb20000000000000000000078ee7ce2fE4908108C';

  function tokenUrl(tokenAddress) {
    return 'https://api.dexscreener.com/latest/dex/tokens/' + tokenAddress;
  }

  /**
   * Extract the reference price from a Dexscreener
   * GET /latest/dex/tokens/<address> response.
   * Picks the pair with the highest reported liquidity.
   * Returns null when there is no usable pair.
   *   { priceUsd, symbol, pairAddress, dexId, liquidityUsd, url }
   */
  function extractPrice(payload) {
    if (!payload || !Array.isArray(payload.pairs) || payload.pairs.length === 0) {
      return null;
    }
    var best = null;
    var bestLiquidity = -1;
    for (var i = 0; i < payload.pairs.length; i++) {
      var pair = payload.pairs[i];
      if (!pair || typeof pair.priceUsd !== 'string') continue;
      var price = Number(pair.priceUsd);
      if (!isFinite(price) || price <= 0) continue;
      var liquidity = 0;
      if (pair.liquidity && typeof pair.liquidity.usd === 'number') {
        liquidity = pair.liquidity.usd;
      }
      if (liquidity >= bestLiquidity) {
        bestLiquidity = liquidity;
        best = pair;
      }
    }
    if (!best) return null;
    return {
      priceUsd: Number(best.priceUsd),
      symbol: best.baseToken && best.baseToken.symbol ? best.baseToken.symbol : null,
      pairAddress: best.pairAddress || null,
      dexId: best.dexId || null,
      liquidityUsd: bestLiquidity,
      url: best.url || null
    };
  }

  /**
   * Trigger price for a rule: reference price minus the drop.
   * Pure arithmetic, e.g. $150 with a 5% stop-loss -> $142.50.
   * Returns null on bad input.
   */
  function triggerPrice(referencePriceUsd, thresholdPct) {
    if (typeof referencePriceUsd !== 'number' || !isFinite(referencePriceUsd) || referencePriceUsd <= 0) {
      return null;
    }
    if (typeof thresholdPct !== 'number' || !isFinite(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) {
      return null;
    }
    return referencePriceUsd * (1 - thresholdPct / 100);
  }

  return {
    REAL_NVDAC: REAL_NVDAC,
    tokenUrl: tokenUrl,
    extractPrice: extractPrice,
    triggerPrice: triggerPrice
  };
});
