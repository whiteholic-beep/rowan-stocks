'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const price = require('./price.js');

function pair(overrides) {
  return Object.assign({
    chainId: '8453',
    dexId: 'aerodrome',
    url: 'https://dexscreener.com/base/0xpair1',
    pairAddress: '0x0000000000000000000000000000000000000001',
    baseToken: { address: price.REAL_NVDAC, name: 'NVIDIA Corporation', symbol: 'NVDAc' },
    quoteToken: { symbol: 'USDC' },
    priceNative: '1',
    priceUsd: '146.57',
    liquidity: { usd: 1000000, base: 1000, quote: 1000000 },
  }, overrides || {});
}

describe('tokenUrl', () => {
  it('builds the Dexscreener tokens URL for the real NVDAc address', () => {
    assert.equal(
      price.tokenUrl(price.REAL_NVDAC),
      'https://api.dexscreener.com/latest/dex/tokens/0xb20000000000000000000078ee7ce2fE4908108C'
    );
  });
});

describe('extractPrice', () => {
  it('extracts priceUsd, symbol, and pair from a single pair', () => {
    const out = price.extractPrice({ pairs: [pair()] });
    assert.equal(out.priceUsd, 146.57);
    assert.equal(out.symbol, 'NVDAc');
    assert.equal(out.pairAddress, '0x0000000000000000000000000000000000000001');
    assert.equal(out.dexId, 'aerodrome');
  });

  it('picks the pair with the highest liquidity when several exist', () => {
    const thin = pair({ priceUsd: '150.00', liquidity: { usd: 100 } });
    const deep = pair({ priceUsd: '146.57', liquidity: { usd: 5000000 }, pairAddress: '0x0000000000000000000000000000000000000002' });
    const out = price.extractPrice({ pairs: [thin, deep] });
    assert.equal(out.priceUsd, 146.57);
    assert.equal(out.pairAddress, '0x0000000000000000000000000000000000000002');
  });

  it('returns null when there are no pairs', () => {
    assert.equal(price.extractPrice({ pairs: [] }), null);
    assert.equal(price.extractPrice({}), null);
    assert.equal(price.extractPrice(null), null);
  });

  it('skips pairs without a usable priceUsd', () => {
    const bad = pair({ priceUsd: 'not-a-number' });
    const good = pair({ priceUsd: '120.00' });
    assert.equal(price.extractPrice({ pairs: [bad, good] }).priceUsd, 120);
    assert.equal(price.extractPrice({ pairs: [bad] }), null);
  });
});

describe('triggerPrice', () => {
  it('computes reference minus the drop (150 at 5% -> 142.5)', () => {
    assert.equal(price.triggerPrice(150, 5), 142.5);
  });

  it('handles a 100% drop as zero', () => {
    assert.equal(price.triggerPrice(150, 100), 0);
  });

  it('returns null on bad input', () => {
    assert.equal(price.triggerPrice(0, 5), null);
    assert.equal(price.triggerPrice(-10, 5), null);
    assert.equal(price.triggerPrice(150, 0), null);
    assert.equal(price.triggerPrice(150, 101), null);
    assert.equal(price.triggerPrice('150', 5), null);
  });
});

describe('takeProfitPrice', () => {
  it('computes reference plus the rise (150 at 50% -> 225)', () => {
    assert.equal(price.takeProfitPrice(150, 50), 225);
  });

  it('handles a 100% rise as double', () => {
    assert.equal(price.takeProfitPrice(150, 100), 300);
  });

  it('returns null on bad input', () => {
    assert.equal(price.takeProfitPrice(0, 50), null);
    assert.equal(price.takeProfitPrice(-10, 50), null);
    assert.equal(price.takeProfitPrice(150, 0), null);
    assert.equal(price.takeProfitPrice(150, 101), null);
    assert.equal(price.takeProfitPrice('150', 50), null);
  });
});

describe('triggerPrices', () => {
  it('returns both triggers for a paired rule (150, SL 5 / TP 50)', () => {
    const rule = {
      type: 'paired-sell', stopLossPct: 5, takeProfitPct: 50,
      reference: 'current', language: 'id'
    };
    assert.deepEqual(price.triggerPrices(150, rule), { stopLoss: 142.5, takeProfit: 225 });
  });

  it('returns only the stop-loss for an SL-only rule', () => {
    const rule = { type: 'paired-sell', stopLossPct: 5, takeProfitPct: null };
    assert.deepEqual(price.triggerPrices(150, rule), { stopLoss: 142.5, takeProfit: null });
  });

  it('returns only the take-profit for a TP-only rule', () => {
    const rule = { type: 'paired-sell', stopLossPct: null, takeProfitPct: 50 };
    assert.deepEqual(price.triggerPrices(150, rule), { stopLoss: null, takeProfit: 225 });
  });

  it('understands a legacy v1 rule (thresholdPct = stop-loss only)', () => {
    const legacy = { type: 'stop-loss-sell', thresholdPct: 5 };
    assert.deepEqual(price.triggerPrices(150, legacy), { stopLoss: 142.5, takeProfit: null });
  });

  it('returns null on a bad reference price, a bad rule, or no exits', () => {
    const rule = { type: 'paired-sell', stopLossPct: 5, takeProfitPct: 50 };
    assert.equal(price.triggerPrices(0, rule), null);
    assert.equal(price.triggerPrices(150, null), null);
    assert.equal(price.triggerPrices(150, { type: 'buy-the-dip' }), null);
    assert.equal(
      price.triggerPrices(150, { type: 'paired-sell', stopLossPct: null, takeProfitPct: null }),
      null
    );
  });
});
