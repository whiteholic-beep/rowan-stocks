'use strict';

/**
 * Tests for rules/parser.js — Rowan Stocks trading-rules agent, Tahap 2.
 *
 * Node's built-in test runner, zero new dependencies:
 *   node --test rules/parser.test.js
 *
 * The parser is pure JS: no network, no filesystem, no mocks needed.
 * Every test asserts the exact parsed rule object or the exact error code
 * plus a human-readable message in the input's language.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRule, describeRule, RuleParseError, SUPPORTED_TOKEN } = require('./parser.js');

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
      type: 'stop-loss-sell',
      action: 'sell',
      token: 'tNVDAc',
      tokenExplicit: true,
      thresholdPct: 5,
      reference: 'current',
      referenceExplicit: true,
      language: 'id',
      grammarVersion: 1,
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
      thresholdPct: 10,
      reference: 'entry',
      source: 'Jual tNVDAc kalau turun 10% dari harga beli'
    })
  );
});

test('ID: "Jual NVDAc kalau turun 7,5% dari harga sekarang"', () => {
  assert.deepEqual(
    parseRule('Jual NVDAc kalau turun 7,5% dari harga sekarang'),
    baseRule({
      thresholdPct: 7.5,
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
      thresholdPct: 3,
      source: 'tolong jual nvda saya kalau harganya turun 3% dari harga hari ini ya'
    })
  );
});

test('ID: "Jual NVDA kalau anjlok 20% dari harga beli" (anjlok = drop)', () => {
  assert.deepEqual(
    parseRule('Jual NVDA kalau anjlok 20% dari harga beli'),
    baseRule({
      thresholdPct: 20,
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
      thresholdPct: 7.5,
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

test('threshold: 0, negative and >100 are rejected', () => {
  expectError('Jual NVDA kalau turun 0%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun -5%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun 101%', 'INVALID_THRESHOLD');
  expectError('Jual NVDA kalau turun 150% dari harga beli', 'INVALID_THRESHOLD');
});

test('threshold: boundary values 100 and 0.5 are accepted', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 100%').thresholdPct, 100);
  assert.equal(parseRule('Jual NVDA kalau turun 0,5%').thresholdPct, 0.5);
  assert.equal(parseRule('Sell NVDA if it drops 0.5%').thresholdPct, 0.5);
});

test('threshold: "5 %" with a space is accepted', () => {
  assert.equal(parseRule('Jual NVDA kalau turun 5 % dari harga hari ini').thresholdPct, 5);
});

test('threshold: spelled-out number is rejected with a helpful message', () => {
  expectError('Jual NVDA kalau turun lima persen', 'NO_PERCENT');
  expectError('Sell NVDA if it drops five percent', 'NO_PERCENT');
});

// ------------------------------------------------------------- invalid input

test('missing percent is rejected', () => {
  expectError('Jual NVDA kalau turun dari harga hari ini', 'NO_PERCENT');
});

test('two percents are rejected as ambiguous', () => {
  expectError('Jual NVDA kalau turun 5% dan 10%', 'MULTIPLE_PERCENTS');
});

test('buy rules are rejected (ID and EN)', () => {
  expectError('Beli NVDA kalau turun 5%', 'BUY_NOT_SUPPORTED');
  expectError('Kalau NVDA turun 5% dari harga hari ini, beli $20', 'BUY_NOT_SUPPORTED');
  expectError('Buy NVDA if it drops 5%', 'BUY_NOT_SUPPORTED');
});

test('rise direction is rejected (not a stop-loss)', () => {
  expectError('Kalau NVDA naik 5%, jual', 'RISE_NOT_SUPPORTED');
  expectError('Sell NVDA if it rises 5%', 'RISE_NOT_SUPPORTED');
});

test('missing action is rejected', () => {
  expectError('NVDA turun 5%', 'NO_ACTION');
  expectError('Kalau NVDA turun 5% dari harga hari ini', 'NO_ACTION');
});

test('missing drop word is rejected', () => {
  expectError('Jual NVDA 5% dari harga hari ini', 'NO_DROP');
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

test('describeRule restates an ID rule in plain Indonesian', () => {
  const rule = parseRule('Jual tNVDAc kalau turun 10% dari harga beli');
  assert.equal(describeRule(rule), 'Jual tNVDAc kalau harganya turun 10% dari harga beli.');
});

test('describeRule restates an EN rule in plain English', () => {
  const rule = parseRule("Sell tNVDAc if it drops 5% from today's price");
  assert.equal(describeRule(rule), "Sell tNVDAc if its price drops 5% from today's price.");
});

test('describeRule uses a comma decimal in Indonesian', () => {
  const rule = parseRule('Jual NVDA kalau turun 7,5% dari harga hari ini');
  assert.equal(describeRule(rule), 'Jual tNVDAc kalau harganya turun 7,5% dari harga hari ini.');
});

test('describeRule rejects a non-rule object', () => {
  assert.throws(() => describeRule({ type: 'buy-the-dip' }), /stop-loss-sell/);
});

// ------------------------------------------------------------- module sanity

test('SUPPORTED_TOKEN is tNVDAc', () => {
  assert.equal(SUPPORTED_TOKEN, 'tNVDAc');
});
