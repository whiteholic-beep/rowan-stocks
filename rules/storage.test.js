'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseRule } = require('./parser.js');
const store = require('./storage.js');

function freshBackend() {
  return store.createMemoryBackend();
}

function sampleRule(overrides) {
  const rule = parseRule('Jual NVDA kalau turun 5% dari harga hari ini');
  return Object.assign({}, rule, overrides || {});
}

describe('validateRule', () => {
  it('accepts a parsed stop-loss-sell rule for tNVDAc', () => {
    assert.equal(store.validateRule(sampleRule()).ok, true);
  });

  it('accepts a rule with a maxAmountTokens cap inside the limit', () => {
    assert.equal(store.validateRule(sampleRule({ maxAmountTokens: 100 })).ok, true);
  });

  it('rejects a rule for another token', () => {
    const bad = sampleRule({ token: 'tTSLAc' });
    const result = store.validateRule(bad);
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /tNVDAc/);
  });

  it('rejects stopLossPct 0, negative, and above 100', () => {
    for (const pct of [0, -5, 101, NaN]) {
      assert.equal(store.validateRule(sampleRule({ stopLossPct: pct })).ok, false);
    }
  });

  it('rejects takeProfitPct 0, negative, and above 100', () => {
    for (const pct of [0, -50, 101, NaN]) {
      assert.equal(store.validateRule(sampleRule({ takeProfitPct: pct })).ok, false);
    }
  });

  it('rejects a rule with neither exit set', () => {
    assert.equal(
      store.validateRule(sampleRule({ stopLossPct: null, takeProfitPct: null })).ok,
      false
    );
  });

  it('accepts a paired rule and a TP-only rule', () => {
    const paired = parseRule('Jual NVDA kalau turun 5% atau naik 50% dari harga hari ini');
    assert.equal(store.validateRule(paired).ok, true);
    const tpOnly = parseRule('Jual NVDA kalau naik 50% dari harga hari ini');
    assert.equal(store.validateRule(tpOnly).ok, true);
  });

  it('accepts a legacy v1 stop-loss rule (tolerant validation)', () => {
    const legacy = {
      type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc', tokenExplicit: true,
      thresholdPct: 5, reference: 'current', referenceExplicit: true,
      language: 'id', grammarVersion: 1, source: 'Jual NVDA kalau turun 5%'
    };
    assert.equal(store.validateRule(legacy).ok, true);
  });

  it('rejects a reference that is neither current nor entry', () => {
    assert.equal(store.validateRule(sampleRule({ reference: 'yesterday' })).ok, false);
  });

  it('rejects maxAmountTokens above the 1000 cap', () => {
    assert.equal(store.validateRule(sampleRule({ maxAmountTokens: 1001 })).ok, false);
  });

  it('rejects a non-object', () => {
    assert.equal(store.validateRule(null).ok, false);
    assert.equal(store.validateRule('Jual NVDA turun 5%').ok, false);
  });
});

describe('addRule / listRules', () => {
  it('stores a rule with id, status active, and createdAt', () => {
    const backend = freshBackend();
    const result = store.addRule(backend, sampleRule(), 100);
    assert.equal(result.ok, true);
    assert.match(result.rule.id, /^rule-/);
    assert.equal(result.rule.status, 'active');
    assert.equal(result.rule.maxAmountTokens, 100);
    assert.equal(typeof result.rule.createdAt, 'string');
    assert.equal(store.listRules(backend).length, 1);
  });

  it('stores a rule without a max amount when none is given', () => {
    const backend = freshBackend();
    const result = store.addRule(backend, sampleRule());
    assert.equal(result.ok, true);
    assert.equal(result.rule.maxAmountTokens, undefined);
  });

  it('refuses an invalid rule and stores nothing', () => {
    const backend = freshBackend();
    const result = store.addRule(backend, sampleRule({ stopLossPct: 0 }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID');
    assert.equal(store.listRules(backend).length, 0);
  });

  it('refuses an identical active rule as DUPLICATE', () => {
    const backend = freshBackend();
    assert.equal(store.addRule(backend, sampleRule(), 100).ok, true);
    const again = store.addRule(backend, sampleRule(), 100);
    assert.equal(again.ok, false);
    assert.equal(again.code, 'DUPLICATE');
    assert.equal(store.listRules(backend).length, 1);
  });

  it('allows the same rule again after the first is deactivated', () => {
    const backend = freshBackend();
    const first = store.addRule(backend, sampleRule(), 100).rule;
    assert.equal(store.setStatus(backend, first.id, 'inactive').ok, true);
    assert.equal(store.addRule(backend, sampleRule(), 100).ok, true);
    assert.equal(store.listRules(backend).length, 2);
  });

  it('allows a different stop-loss as a separate rule', () => {
    const backend = freshBackend();
    assert.equal(store.addRule(backend, sampleRule(), 100).ok, true);
    assert.equal(store.addRule(backend, sampleRule({ stopLossPct: 10 }), 100).ok, true);
    assert.equal(store.listRules(backend).length, 2);
  });

  it('allows the same stop-loss with a different take-profit as a separate rule', () => {
    const backend = freshBackend();
    assert.equal(store.addRule(backend, sampleRule(), 100).ok, true);
    const paired = parseRule('Jual NVDA kalau turun 5% atau naik 50% dari harga hari ini');
    assert.equal(store.addRule(backend, paired, 100).ok, true);
    assert.equal(store.listRules(backend).length, 2);
  });

  it('refuses an identical paired rule as DUPLICATE', () => {
    const backend = freshBackend();
    const paired = parseRule('Jual NVDA kalau turun 5% atau naik 50% dari harga hari ini');
    assert.equal(store.addRule(backend, paired, 100).ok, true);
    const again = store.addRule(backend, paired, 100);
    assert.equal(again.ok, false);
    assert.equal(again.code, 'DUPLICATE');
    assert.equal(store.listRules(backend).length, 1);
  });

  it('stores a legacy v1 rule in the current shape', () => {
    const backend = freshBackend();
    const legacy = {
      type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc', tokenExplicit: true,
      thresholdPct: 5, reference: 'current', referenceExplicit: true,
      language: 'id', grammarVersion: 1, source: 'Jual NVDA kalau turun 5%'
    };
    const result = store.addRule(backend, legacy, 100);
    assert.equal(result.ok, true);
    assert.equal(result.rule.type, 'paired-sell');
    assert.equal(result.rule.stopLossPct, 5);
    assert.equal(result.rule.takeProfitPct, null);
    assert.equal(result.rule.thresholdPct, undefined);
  });
});

describe('legacy v1 migration on read', () => {
  function seedLegacy(backend) {
    const legacy = {
      id: 'rule-old-1', status: 'active', createdAt: '2026-11-28T03:00:00.000Z',
      type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc', tokenExplicit: true,
      thresholdPct: 5, reference: 'current', referenceExplicit: true,
      language: 'id', grammarVersion: 1, source: 'Jual NVDA kalau turun 5%',
      maxAmountTokens: 100
    };
    backend.setItem(store.RULES_KEY, JSON.stringify([legacy]));
  }

  it('listRules returns a stored legacy rule in the current shape', () => {
    const backend = freshBackend();
    seedLegacy(backend);
    const rules = store.listRules(backend);
    assert.equal(rules.length, 1);
    assert.equal(rules[0].type, 'paired-sell');
    assert.equal(rules[0].stopLossPct, 5);
    assert.equal(rules[0].takeProfitPct, null);
    assert.equal(rules[0].thresholdPct, undefined);
    assert.equal(rules[0].id, 'rule-old-1');
    assert.equal(rules[0].status, 'active');
  });

  it('a legacy rule and its normalised copy count as the same rule (DUPLICATE)', () => {
    const backend = freshBackend();
    seedLegacy(backend);
    const again = store.addRule(backend, parseRule('Jual NVDA kalau turun 5% dari harga hari ini'), 100);
    assert.equal(again.ok, false);
    assert.equal(again.code, 'DUPLICATE');
  });

  it('drops stored rules with an unrecognised shape', () => {
    const backend = freshBackend();
    backend.setItem(store.RULES_KEY, JSON.stringify([{ type: 'buy-the-dip', token: 'tNVDAc' }]));
    assert.deepEqual(store.listRules(backend), []);
  });
});

describe('setStatus / removeRule', () => {
  it('deactivates and reactivates a rule', () => {
    const backend = freshBackend();
    const id = store.addRule(backend, sampleRule()).rule.id;
    assert.equal(store.setStatus(backend, id, 'inactive').rule.status, 'inactive');
    assert.equal(store.setStatus(backend, id, 'active').rule.status, 'active');
  });

  it('removes a rule', () => {
    const backend = freshBackend();
    const id = store.addRule(backend, sampleRule()).rule.id;
    assert.equal(store.removeRule(backend, id).ok, true);
    assert.equal(store.listRules(backend).length, 0);
  });

  it('reports NOT_FOUND for unknown ids', () => {
    const backend = freshBackend();
    assert.equal(store.setStatus(backend, 'rule-nope', 'inactive').code, 'NOT_FOUND');
    assert.equal(store.removeRule(backend, 'rule-nope').code, 'NOT_FOUND');
  });
});

describe('corrupt storage', () => {
  it('listRules returns [] when the stored JSON is corrupt', () => {
    const backend = freshBackend();
    backend.setItem(store.RULES_KEY, '{not json');
    assert.deepEqual(store.listRules(backend), []);
  });

  it('listRules returns [] when the stored value is not an array', () => {
    const backend = freshBackend();
    backend.setItem(store.RULES_KEY, '{"a":1}');
    assert.deepEqual(store.listRules(backend), []);
  });
});
