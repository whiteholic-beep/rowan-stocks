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

  it('rejects thresholdPct 0, negative, and above 100', () => {
    for (const pct of [0, -5, 101, NaN]) {
      assert.equal(store.validateRule(sampleRule({ thresholdPct: pct })).ok, false);
    }
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
    const result = store.addRule(backend, sampleRule({ thresholdPct: 0 }));
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

  it('allows a different threshold as a separate rule', () => {
    const backend = freshBackend();
    assert.equal(store.addRule(backend, sampleRule(), 100).ok, true);
    assert.equal(store.addRule(backend, sampleRule({ thresholdPct: 10 }), 100).ok, true);
    assert.equal(store.listRules(backend).length, 2);
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
