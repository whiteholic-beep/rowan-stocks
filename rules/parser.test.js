'use strict';

/**
 * Tests for rules/parser.js — Rowan Stocks trading-rules agent,
 * Tahap 2, reworked in Tahap 3.5 (paired stop-loss + take-profit).
 *
 * Node's built-in test runner, zero new dependencies:
 *   node --test rules/parser.test.js
 *
 * The parser is pure JS: no network, no filesystem, no mocks needed.
 * Every test asserts the exact parsed rule object or the exact error code
 * plus a human-readable message in the input's language.
 *
 * Grammar v2: one paired-sell rule, two exits (stop-loss and/or
 * take-profit). Legacy v1 rules (type 'stop-loss-sell', thresholdPct)
 * are normalised by normalizeRule() and still understood by describeRule.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRule, describeRule, normalizeRule, RuleParseError, SUPPORTED_TOKEN } = require('./parser.js');

function expectError(input, code) {
  assert.throws(
    () => parseRule(input),
    (err) => {
      assert.ok(err instanceof RuleParseError, 'expected RuleParseError, got ' + err);
      assert.equal(err.code, code, 'wrong error code for input: ' + JSON.stringify(input));
      assert.equal(typeof err.message, 'string');
      assert.ok(err.message.length > 10, 'error message should explain in plain words');
      return true;
    }
  );
}

function baseRule(overrides) {
  return Object.assign(
    {
      type: 'paired-sell',
      action: 'sell',
      token: 'tNVDAc',
      tokenExplicit: true,
      stopLossPct: 5,
      takeProfitPct: null,
      reference: 'current',
      referenceExplicit: true,
      language: 'id',
      grammarVersion: 2,
      source: 'Jual NVDA kalau turun 5% dari harga hari ini'
    },
    overrides
  );
}

// ---------------------------------------------------------------- valid: ID

test('ID: "Kalau NVDA turun 5% dari harga hari ini, jual"', () => {
  assert.deepEqual(
    parseRule('Kalau NVDA turun 5% dari harga hari ini, jual'),
    baseRule({ source: 'Kalau NVDA turun 5% dari harga hari ini, jual' })
  );
});

test('ID: "Jual tNVDAc kalau turun 10% dari harga beli"', () => {
  assert.deepEqual(
    parseRule('Jual tNVDAc kalau turun 10% dari harga beli'),
    baseRule({
      stopLossPct: 10,
      reference: 'entry',
      source: 'Jual tNVDAc kalau turun 10% dari harga beli'
    })
  );
});

test('ID: "Jual NVDAc kalau turun 7,5% dari harga sekarang"', () => {
  assert.deepEqual(
    parseRule('Jual NVDAc kalau turun 7,5% dari harga sekarang'),
    baseRule({
      stopLossPct: 7.5,
      source: 'Jual NVDAc kalau turun 7,5% dari harga sekarang'
    })
  );
});

test('ID: "Kalau NVDA turun 5 persen dari harga hari ini, jual" (word persen)', () => {
  assert.deepEqual(
    parseRule('Kalau NVDA turun 5 persen dari harga hari ini, jual'),
    baseRule({ source: 'Kalau NVDA turun 5 persen dari harga hari ini, jual' })
  );
});

test('ID: lowercase + extra words are tolerated', () => {
  assert.deepEqual(
    parseRule('tolong jual nvda saya kalau harganya turun 3% dari harga hari ini ya'),
    baseRule({
      stopLossPct: 3,
      source: 'tolong jual nvda saya kalau harganya turun 3% dari harga hari ini ya'
    })
  );
});

test('ID: "Jual NVDA kalau anjlok 20% dari harga beli" (anjlok = drop)', () => {
  assert.deepEqual(
    parseRule('Jual NVDA kalau anjlok 20% dari harga beli'),
    baseRule({
      stopLossPct: 20,
      reference: 'entry',
      source: 'Jual NVDA kalau anjlok 20% dari harga beli'
    })
  );
});

// ---------------------------------------------------------------- valid: EN

test('EN: "Sell tNVDAc if it drops 5% from today\'s price"', () => {
  assert.deepEqual(
    parseRule("Sell tNVDAc if it drops 5% from today's price"),
    baseRule({
      language: 'en',
      source: "Sell tNVDAc if it drops 5% from today's price"
    })
  );
});

test('EN: "Sell NVDA if it falls 7.5% from entry price"', () => {
  assert.deepEqual(
    parseRule('Sell NVDA if it falls 7.5% from entry price'),
    baseRule({
      stopLossPct: 7.5,
      reference: 'entry',
      language: 'en',
      source: 'Sell NVDA if it falls 7.5% from entry price'
    })
  );
});

test('EN: "Sell NVDA if it drops 5 percent from the current price"', () => {
  assert.deepEqual(
    parseRule('Sell NVDA if it drops 5 percent from the current price'),
    baseRule({
      language: 'en',
      source: 'Sell NVDA if it drops 5 percent from the current price'
    })
  );
});

// ------------------------------------------------- paired SL + TP (Tahap 3.5)

test('paired ID: "Jual tNVDAc kalau turun 5% atau naik 50% dari harga sekarang"', () => {
  assert.deepEqual(
    parseRule('Jual tNVDAc kalau turun 5% atau naik 50% dari harga sekarang'),
    baseRule({
      stopLossPct: 5,
      takeProfitPct: 50,
      source: 'Jual tNVDAc kalau turun 5% atau naik 50% dari harga sekarang'
    })
  );
});

test('paired EN: "Sell tNVDAc if it drops 5% or rises 50% from today\'s price"', () => {
  assert.deepEqual(
    parseRule("Sell tNVDAc if it drops 5% or rises 50% from today's price"),
    baseRule({
      stopLossPct: 5,
      takeProfitPct: 50,
      language: 'en',
      source: "Sell tNVDAc if it drops 5% or rises 50% from today's price"
    })
  );
});

test('paired ID with entry reference: "Jual NVDA kalau turun 10% atau naik 25% dari harga beli"', () => {
  assert.deepEqual(
    parseRule('Jual NVDA kalau turun 10% atau naik 25% dari harga beli'),
    baseRule({
      stopLossPct: 10,
      takeProfitPct: 25,
      reference: 'entry',
      source: 'Jual NVDA kalau turun 10% atau naik 25% dari harga beli'
    })
  );
});

test('paired: order does not matter ("naik 50% atau turun 5%")', () => {
  assert.deepEqual(
    parseRule('Jual NVDA kalau naik 50% atau turun 5% dari harga hari ini'),
    baseRule({
      stopLossPct: 5,
      takeProfitPct: 50,
      source: 'Jual NVDA kalau naik 50% atau turun 5% dari harga hari ini'
    })
  );
});

test('paired: "dan" as the joiner also works', () => {
  const rule = parseRule('Jual NVDA kalau turun 5% dan naik 50% dari harga hari ini');
  assert.equal(rule.stopLossPct, 5);
  assert.equal(rule.takeProfitPct, 50);
});

// ------------------------------------------------------------- TP-only rules

test('TP-only ID: "Kalau NVDA naik 50%, jual"', () => {
  assert.deepEqual(
    parseRule('Kalau NVDA naik 50%, jual'),
    baseRule({
      stopLossPct: null,
      takeProfitPct: 50,
      reference: 'current',
      referenceExplicit: false,
      source: 'Kalau NVDA naik 50%, jual'
    })
  );
});

test('TP-only EN: "Sell NVDA if it rises 50%"', () => {
  assert.deepEqual(
    parseRule('Sell NVDA if it rises 50%'),
    baseRule({
      stopLossPct: null,
      takeProfitPct: 50,
      reference: 'current',
      referenceExplicit: false,
      language: 'en',
      source: 'Sell NVDA if it rises 50%'
    })
  );
});

test('TP-only ID with comma decimal: "Jual NVDA kalau naik 7,5% dari harga hari ini"', () => {
  assert.deepEqual(
    parseRule('Jual NVDA kalau naik 7,5% dari harga hari ini'),
    baseRule({
      stopLossPct: null,
      takeProfitPct: 7.5,
      source: 'Jual NVDA kalau naik 7,5% dari harga hari ini'
    })
  );
});

// ------------------------------------------------- reference-price variants

test('reference defaults to current when omitted (and is flagged)', () => {
  assert.deepEqual(
    parseRule('Jual NVDA kalau turun 5%'),
    baseRule({
      reference: 'current',
      referenceExplicit: false,
      source: 'Jual NVDA kalau turun 5%'
    })
  );
});

test('reference: "harga saat ini" and "harga terkini" mean current', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 5% dari harga saat ini').reference, 'current');
  assert.equal(parseRule('Jual NVDA kalau turun 5% dari harga terkini').reference, 'current');
});

test('reference: "harga masuk" and "harga awal" mean entry', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 5% dari harga masuk').reference, 'entry');
  assert.equal(parseRule('Jual NVDA kalau turun 5% dari harga awal').reference, 'entry');
});

test('reference: "buy price" and "bought at" mean entry (EN)', () => {
  assert.equal(parseRule('Sell NVDA if it drops 5% from the buy price').reference, 'entry');
  assert.equal(parseRule('Sell NVDA if it drops 5% from where I bought at').reference, 'entry');
});

test('reference: both current and entry mentioned is ambiguous', () => {
  expectError(
    'Jual NVDA kalau turun 5% dari harga hari ini dan harga beli',
    'AMBIGUOUS_REFERENCE'
  );
});

// ------------------------------------------------------------- token handling

test('token defaults to tNVDAc when omitted (and is flagged)', () => {
  assert.deepEqual(
    parseRule('Jual kalau turun 5% dari harga hari ini'),
    baseRule({
      tokenExplicit: false,
      source: 'Jual kalau turun 5% dari harga hari ini'
    })
  );
});

test('token: "saham NVDA" is accepted', () => {
  assert.equal(parseRule('Jual saham NVDA kalau turun 5%').token, 'tNVDAc');
});

test('token: other Rowan Stocks tickers are rejected', () => {
  expectError('Jual TSLA kalau turun 5%', 'UNKNOWN_TOKEN');
  expectError('Jual tAAPLc kalau turun 5% dari harga beli', 'UNKNOWN_TOKEN');
  expectError('Sell MSFT if it drops 5%', 'UNKNOWN_TOKEN');
  expectError('Jual BTC kalau turun 5%', 'UNKNOWN_TOKEN');
});

test('token: unknown mock-style token (tBTCc) is rejected', () => {
  expectError('Jual tBTCc kalau turun 5%', 'UNKNOWN_TOKEN');
});

// ---------------------------------------------------------- threshold rules

test('threshold: 0, negative and >100 are rejected (SL side)', () => {
  expectError('Jual NVDA kalau turun 0%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun -5%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun 101%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun 150% dari harga beli', 'INVALID_THRESHOLD');
});

test('threshold: 0, negative and >100 are rejected (TP side)', () => {
  expectError('Jual NVDA kalau naik 0%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau naik -50%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau naik 101%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun 5% atau naik 150%', 'INVALID_THRESHOLD');
});

test('threshold: boundary values 100 and 0.5 are accepted', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 100%').stopLossPct, 100);
  assert.equal(parseRule('Jual NVDA kalau turun 0,5%').stopLossPct, 0.5);
  assert.equal(parseRule('Sell NVDA if it drops 0.5%').stopLossPct, 0.5);
  assert.equal(parseRule('Jual NVDA kalau naik 100%').takeProfitPct, 100);
});

test('threshold: "5 %" with a space is accepted', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 5 % dari harga hari ini').stopLossPct, 5);
});

test('threshold: spelled-out number is rejected with a helpful message', () => {
  expectError('Jual NVDA kalau turun lima persen', 'NO_PERCENT');
  expectError('Sell NVDA if it drops five percent', 'NO_PERCENT');
});

// ------------------------------------------------------------- invalid input

test('missing percent is rejected', () => {
  expectError('Jual NVDA kalau turun dari harga hari ini', 'NO_PERCENT');
});

test('two percents on the same side are rejected as ambiguous', () => {
  expectError('Jual NVDA kalau turun 5% dan 10%', 'MULTIPLE_PERCENTS');
  expectError('Jual NVDA kalau turun 5% atau turun 10%', 'MULTIPLE_PERCENTS');
  expectError('Jual NVDA kalau naik 25% atau naik 50%', 'MULTIPLE_PERCENTS');
});

test('three percents are rejected', () => {
  expectError('Jual NVDA kalau turun 5% atau naik 50% atau turun 10%', 'MULTIPLE_PERCENTS');
});

test('buy rules are rejected (ID and EN)', () => {
  expectError('Beli NVDA kalau turun 5%', 'BUY_NOT_SUPPORTED');
  expectError('Kalau NVDA turun 5% dari harga hari ini, beli $20', 'BUY_NOT_SUPPORTED');
  expectError('Buy NVDA if it drops 5%', 'BUY_NOT_SUPPORTED');
});

test('percent with no direction word is rejected', () => {
  expectError('Jual NVDA 5% dari harga hari ini', 'NO_DIRECTION');
  expectError('Sell NVDA 5% from today\'s price', 'NO_DIRECTION');
});

test('missing action is rejected', () => {
  expectError('NVDA turun 5%', 'NO_ACTION');
  expectError('Kalau NVDA turun 5% dari harga hari ini', 'NO_ACTION');
  expectError('NVDA naik 50%', 'NO_ACTION');
});

test('fixed-price reference is rejected, not silently misread', () => {
  expectError('Jual NVDA kalau turun 5% dari $150', 'FIXED_PRICE_REFERENCE');
});

test('empty and gibberish input are rejected', () => {
  expectError('', 'EMPTY_INPUT');
  expectError('   ', 'EMPTY_INPUT');
  expectError('asdf qwer zxcv', 'NO_PERCENT');
});

// -------------------------------------------------------------- describeRule

test('describeRule restates an ID SL-only rule in plain Indonesian', () => {
  const rule = parseRule('Jual tNVDAc kalau turun 10% dari harga beli');
  assert.equal(describeRule(rule), 'Jual tNVDAc kalau harganya turun 10% dari harga beli.');
});

test('describeRule restates an EN SL-only rule in plain English', () => {
  const rule = parseRule("Sell tNVDAc if it drops 5% from today's price");
  assert.equal(describeRule(rule), "Sell tNVDAc if its price drops 5% from today's price.");
});

test('describeRule uses a comma decimal in Indonesian', () => {
  const rule = parseRule('Jual NVDA kalau turun 7,5% dari harga hari ini');
  assert.equal(describeRule(rule), 'Jual tNVDAc kalau harganya turun 7,5% dari harga hari ini.');
});

test('describeRule restates a paired ID rule with both exits', () => {
  const rule = parseRule('Jual tNVDAc kalau turun 5% atau naik 50% dari harga hari ini');
  assert.equal(describeRule(rule), 'Jual tNVDAc kalau harganya turun 5% atau naik 50% dari harga hari ini.');
});

test('describeRule restates a paired EN rule with both exits', () => {
  const rule = parseRule("Sell tNVDAc if it drops 5% or rises 50% from today's price");
  assert.equal(describeRule(rule), "Sell tNVDAc if its price drops 5% or rises 50% from today's price.");
});

test('describeRule restates a TP-only rule (ID and EN)', () => {
  assert.equal(
    describeRule(parseRule('Jual tNVDAc kalau naik 50% dari harga hari ini')),
    'Jual tNVDAc kalau harganya naik 50% dari harga hari ini.'
  );
  assert.equal(
    describeRule(parseRule("Sell tNVDAc if it rises 50% from today's price")),
    "Sell tNVDAc if its price rises 50% from today's price."
  );
});

test('describeRule rejects a non-rule object', () => {
  assert.throws(() => describeRule({ type: 'buy-the-dip' }), /paired-sell/);
});

// ------------------------------------------------------------- normalizeRule

test('normalizeRule converts a legacy v1 stop-loss rule to the v2 shape', () => {
  const legacy = {
    type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc', tokenExplicit: true,
    thresholdPct: 5, reference: 'current', referenceExplicit: true,
    language: 'id', grammarVersion: 1, source: 'Jual NVDA kalau turun 5%'
  };
  const out = normalizeRule(legacy);
  assert.equal(out.type, 'paired-sell');
  assert.equal(out.stopLossPct, 5);
  assert.equal(out.takeProfitPct, null);
  assert.equal(out.grammarVersion, 2);
  assert.equal(out.thresholdPct, undefined);
});

test('normalizeRule passes a v2 rule through unchanged', () => {
  const rule = parseRule('Jual NVDA kalau turun 5% atau naik 50%');
  assert.equal(normalizeRule(rule), rule);
});

test('normalizeRule returns null for an unrecognised shape', () => {
  assert.equal(normalizeRule(null), null);
  assert.equal(normalizeRule({ type: 'buy-the-dip' }), null);
});

test('describeRule understands a legacy v1 rule object', () => {
  const legacy = {
    type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc', tokenExplicit: true,
    thresholdPct: 10, reference: 'entry', referenceExplicit: true,
    language: 'id', grammarVersion: 1, source: 'Jual NVDA kalau turun 10% dari harga beli'
  };
  assert.equal(describeRule(legacy), 'Jual tNVDAc kalau harganya turun 10% dari harga beli.');
});

// ------------------------------------------------------------- module sanity

test('SUPPORTED_TOKEN is tNVDAc', () => {
  assert.equal(SUPPORTED_TOKEN, 'tNVDAc');
});

test('grammarVersion is 2', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 5%').grammarVersion, 2);
});
