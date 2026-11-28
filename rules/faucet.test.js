'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const faucet = require('./faucet.js');

const TOKEN = '0x7D8c0fe1d88D772441ccc7b0F27fcA0b8a89A775';
const USER = '0xd482B6572917b6d9679Bbc3aF55FCbfa8743BBf0';

describe('toUnits', () => {
  it('converts 100 tokens to 10,000,000,000 units at 8 decimals', () => {
    assert.equal(faucet.toUnits(100), 10000000000);
  });

  it('converts a fractional amount (5.5 -> 550,000,000)', () => {
    assert.equal(faucet.toUnits(5.5), 550000000);
  });

  it('rejects zero, negative, and non-numbers', () => {
    for (const bad of [0, -1, NaN, Infinity, '100', null]) {
      assert.throws(() => faucet.toUnits(bad), /above 0/);
    }
  });

  it('rejects amounts above the 1,000-token per-tap cap', () => {
    assert.throws(() => faucet.toUnits(1001), /1,000/);
    assert.equal(faucet.toUnits(1000), 100000000000);
  });
});

describe('buildMintCall', () => {
  it('builds mint(address,uint256) calldata for 100 tNVDAc', () => {
    const call = faucet.buildMintCall(TOKEN, USER, faucet.toUnits(100));
    assert.equal(call.to, TOKEN);
    // selector + 32-byte address + 32-byte amount
    assert.equal(call.data.length, 2 + 8 + 64 + 64);
    assert.equal(call.data.slice(0, 10), '0x40c10f19');
    // address, lower-cased, left-padded to 32 bytes
    assert.equal(call.data.slice(10, 74), '000000000000000000000000d482b6572917b6d9679bbc3af55fcbfa8743bbf0');
    // 100 tNVDAc = 10,000,000,000 units = 0x2540BE400
    assert.equal(call.data.slice(74), '00000000000000000000000000000000000000000000000000000002540be400');
  });

  it('rejects a bad token address or recipient', () => {
    assert.throws(() => faucet.buildMintCall('not-an-address', USER, 100), /Token address/);
    assert.throws(() => faucet.buildMintCall(TOKEN, '0x1234', 100), /Recipient address/);
  });

  it('rejects a non-integer or non-positive amount', () => {
    assert.throws(() => faucet.buildMintCall(TOKEN, USER, 0), /positive whole number/);
    assert.throws(() => faucet.buildMintCall(TOKEN, USER, 1.5), /positive whole number/);
  });
});

describe('constants', () => {
  it('mints 100 tokens per tap, capped at 1,000, at 8 decimals', () => {
    assert.equal(faucet.FAUCET_MINT_TOKENS, 100);
    assert.equal(faucet.MAX_MINT_TOKENS, 1000);
    assert.equal(faucet.TOKEN_DECIMALS, 8);
    assert.equal(faucet.MINT_SELECTOR, '0x40c10f19');
  });
});
