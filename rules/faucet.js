'use strict';

/**
 * Rowan Stocks — mock tNVDAc faucet helper (Tahap 3).
 *
 * Pure deterministic JavaScript. No network, no dependencies, no AI.
 * Builds the raw transaction that mints test tNVDAc from the mock
 * token contract on Base Sepolia. The browser (rules/app.js) sends
 * it through the user's own wallet — the user signs, Rowan never
 * holds a key.
 *
 * mint(address,uint256) selector 0x40c10f19 =
 * first 4 bytes of keccak256("mint(address,uint256)"),
 * verified with ethers v6.17: ethers.id("mint(address,uint256)").
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RowanFaucet = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var TOKEN_DECIMALS = 8;
  var FAUCET_MINT_TOKENS = 100; // one tap mints 100 test tNVDAc
  var MAX_MINT_TOKENS = 1000;   // the contract's per-call cap
  var MINT_SELECTOR = '0x40c10f19';

  function isAddress(value) {
    return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
  }

  /**
   * Whole test tokens -> smallest units (8 decimals).
   * Throws a plain-language Error on bad input.
   */
  function toUnits(tokens, decimals) {
    var dec = decimals === undefined ? TOKEN_DECIMALS : decimals;
    if (typeof tokens !== 'number' || !isFinite(tokens) || tokens <= 0) {
      throw new Error('Mint amount must be a number above 0.');
    }
    if (tokens > MAX_MINT_TOKENS) {
      throw new Error('Mint amount is above the 1,000 tNVDAc per-tap cap.');
    }
    var units = Math.round(tokens * Math.pow(10, dec));
    if (!isFinite(units) || units <= 0) {
      throw new Error('Mint amount is too small to express in token units.');
    }
    return units;
  }

  function padHex(value, length) {
    var s = String(value);
    while (s.length < length) s = '0' + s;
    return s;
  }

  /**
   * Build the mint(address,uint256) call data for the faucet tap.
   * Returns { to, data } ready for wallet.sendTransaction.
   * amountUnits must be a positive safe integer.
   */
  function buildMintCall(tokenAddress, to, amountUnits) {
    if (!isAddress(tokenAddress)) {
      throw new Error('Token address is not a valid 0x address.');
    }
    if (!isAddress(to)) {
      throw new Error('Recipient address is not a valid 0x address.');
    }
    if (typeof amountUnits !== 'number' ||
        !isFinite(amountUnits) ||
        Math.floor(amountUnits) !== amountUnits ||
        amountUnits <= 0) {
      throw new Error('Mint amount must be a positive whole number of token units.');
    }
    var data = MINT_SELECTOR +
      padHex(to.toLowerCase().replace(/^0x/, ''), 64) +
      padHex(amountUnits.toString(16), 64);
    return { to: tokenAddress, data: data };
  }

  return {
    TOKEN_DECIMALS: TOKEN_DECIMALS,
    FAUCET_MINT_TOKENS: FAUCET_MINT_TOKENS,
    MAX_MINT_TOKENS: MAX_MINT_TOKENS,
    MINT_SELECTOR: MINT_SELECTOR,
    isAddress: isAddress,
    toUnits: toUnits,
    buildMintCall: buildMintCall
  };
});
