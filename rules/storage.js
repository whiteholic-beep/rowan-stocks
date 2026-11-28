'use strict';

/**
 * Rowan Stocks — Rule store (Tahap 3, reworked in Tahap 3.5).
 *
 * Pure deterministic JavaScript. No network, no dependencies, no AI.
 * Holds the user's activated paired-sell rules in a storage backend
 * (localStorage in the browser; any {getItem,setItem} object works,
 * so tests inject an in-memory fake).
 *
 * A stored rule is a parsed rule (see rules/parser.js) plus:
 *   id               'rule-<timestamp>-<random>'
 *   maxAmountTokens  max tNVDAc this rule may sell (the nominal cap from
 *                    the brief — the user confirms it before activation)
 *   status           'active' | 'inactive'
 *   createdAt        ISO timestamp
 *
 * Locked scope: only paired-sell rules for tNVDAc are stored — one rule
 * with a stop-loss (stopLossPct) and/or a take-profit (takeProfitPct),
 * at least one exit set.
 *
 * Migration: rules saved by Tahap 3 (type 'stop-loss-sell',
 * thresholdPct) are normalised on read to the current shape
 * (type 'paired-sell', stopLossPct, takeProfitPct: null) — old saved
 * rules keep working and are rewritten in the new shape the next time
 * the store is written. This module carries its own copy of the
 * normaliser so it stays dependency-free (same reason as Tahap 3).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RowanRuleStore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var RULES_KEY = 'rowan-stocks-rules-v1';
  var SUPPORTED_TOKEN = 'tNVDAc';
  var MAX_AMOUNT_TOKENS = 1000;

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validPctOrNull(value) {
    return value === null ||
      (typeof value === 'number' && isFinite(value) && value > 0 && value <= 100);
  }

  /**
   * The two exits of a rule, in the current shape.
   * Accepts the legacy v1 shape too ({ thresholdPct } = stop-loss only).
   * Returns null when the rule has no recognisable shape.
   */
  function exitsOf(rule) {
    if (!isPlainObject(rule)) return null;
    if (rule.type === 'paired-sell') {
      return { stopLossPct: rule.stopLossPct, takeProfitPct: rule.takeProfitPct };
    }
    if (rule.type === 'stop-loss-sell' && typeof rule.thresholdPct === 'number') {
      return { stopLossPct: rule.thresholdPct, takeProfitPct: null };
    }
    return null;
  }

  /**
   * Normalise a stored rule to the current (grammarVersion 2) shape.
   * Legacy v1 rules are converted; current rules pass through untouched;
   * unrecognised shapes return null and are dropped on read.
   */
  function normalizeStored(rule) {
    if (!isPlainObject(rule)) return null;
    if (rule.type === 'paired-sell') return rule;
    if (rule.type === 'stop-loss-sell' && typeof rule.thresholdPct === 'number') {
      var out = {};
      var key;
      for (key in rule) {
        if (Object.prototype.hasOwnProperty.call(rule, key)) out[key] = rule[key];
      }
      out.type = 'paired-sell';
      out.stopLossPct = rule.thresholdPct;
      out.takeProfitPct = null;
      delete out.thresholdPct;
      out.grammarVersion = 2;
      return out;
    }
    return null;
  }

  /**
   * Check a parsed rule object. Returns { ok: true } or
   * { ok: false, errors: [messages] } in plain language.
   * Accepts the current shape and the legacy v1 shape.
   */
  function validateRule(rule) {
    var errors = [];
    if (!isPlainObject(rule)) {
      return { ok: false, errors: ['Rule is not an object.'] };
    }
    var exits = exitsOf(rule);
    if (!exits) {
      errors.push('Only paired-sell rules (stop-loss and/or take-profit) can be stored.');
    } else {
      if (!validPctOrNull(exits.stopLossPct)) {
        errors.push('stopLossPct must be null or a number between 0 and 100.');
      }
      if (!validPctOrNull(exits.takeProfitPct)) {
        errors.push('takeProfitPct must be null or a number between 0 and 100.');
      }
      if (exits.stopLossPct === null && exits.takeProfitPct === null) {
        errors.push('A rule needs at least one exit: a stop-loss and/or a take-profit.');
      }
    }
    if (rule.action !== 'sell') {
      errors.push('Only sell rules can be stored.');
    }
    if (rule.token !== SUPPORTED_TOKEN) {
      errors.push('Only tNVDAc rules can be stored.');
    }
    if (rule.reference !== 'current' && rule.reference !== 'entry') {
      errors.push('reference must be "current" or "entry".');
    }
    if (rule.language !== 'id' && rule.language !== 'en') {
      errors.push('language must be "id" or "en".');
    }
    if (typeof rule.source !== 'string' || rule.source.trim() === '') {
      errors.push('source (the original sentence) is missing.');
    }
    if (rule.maxAmountTokens !== undefined) {
      if (typeof rule.maxAmountTokens !== 'number' ||
          !isFinite(rule.maxAmountTokens) ||
          rule.maxAmountTokens <= 0 ||
          rule.maxAmountTokens > MAX_AMOUNT_TOKENS) {
        errors.push('maxAmountTokens must be a number between 0 and ' + MAX_AMOUNT_TOKENS + '.');
      }
    }
    return errors.length === 0 ? { ok: true } : { ok: false, errors: errors };
  }

  function readAll(backend) {
    var raw;
    try {
      raw = backend.getItem(RULES_KEY);
    } catch (e) {
      return [];
    }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      for (var i = 0; i < parsed.length; i++) {
        var rule = normalizeStored(parsed[i]);
        if (rule) out.push(rule);
      }
      return out;
    } catch (e) {
      return [];
    }
  }

  function writeAll(backend, rules) {
    backend.setItem(RULES_KEY, JSON.stringify(rules));
  }

  function makeId() {
    var random = Math.floor(Math.random() * 0x10000).toString(16);
    return 'rule-' + Date.now().toString(36) + '-' + random;
  }

  /**
   * Store a parsed rule after validation. Returns
   *   { ok: true, rule } on success, or
   *   { ok: false, code, errors } — code 'INVALID' or 'DUPLICATE'
   *   (DUPLICATE: an identical active rule already exists — same token,
   *   same stop-loss, same take-profit, same reference, same cap).
   * Legacy v1 rules are stored in the current shape.
   */
  function addRule(backend, parsedRule, maxAmountTokens) {
    var rule = {};
    var key;
    for (key in parsedRule) {
      if (Object.prototype.hasOwnProperty.call(parsedRule, key)) {
        rule[key] = parsedRule[key];
      }
    }
    rule = normalizeStored(rule);
    if (!rule) {
      return { ok: false, code: 'INVALID', errors: ['Rule shape not recognised.'] };
    }
    if (maxAmountTokens !== undefined) rule.maxAmountTokens = maxAmountTokens;
    var checked = validateRule(rule);
    if (!checked.ok) {
      return { ok: false, code: 'INVALID', errors: checked.errors };
    }
    var exits = exitsOf(rule);
    var rules = readAll(backend);
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      var rExits = exitsOf(r);
      if (r.status === 'active' &&
          r.token === rule.token &&
          rExits &&
          rExits.stopLossPct === exits.stopLossPct &&
          rExits.takeProfitPct === exits.takeProfitPct &&
          r.reference === rule.reference &&
          r.maxAmountTokens === rule.maxAmountTokens) {
        return { ok: false, code: 'DUPLICATE', errors: ['An identical active rule already exists.'] };
      }
    }
    rule.id = makeId();
    rule.status = 'active';
    rule.createdAt = new Date().toISOString();
    rules.push(rule);
    writeAll(backend, rules);
    return { ok: true, rule: rule };
  }

  function listRules(backend) {
    return readAll(backend);
  }

  function setStatus(backend, id, status) {
    var rules = readAll(backend);
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].id === id) {
        rules[i].status = status;
        writeAll(backend, rules);
        return { ok: true, rule: rules[i] };
      }
    }
    return { ok: false, code: 'NOT_FOUND', errors: ['No rule with that id.'] };
  }

  function removeRule(backend, id) {
    var rules = readAll(backend);
    var kept = [];
    var found = false;
    for (var i = 0; i < rules.length; i++) {
      if (rules[i].id === id) found = true;
      else kept.push(rules[i]);
    }
    if (!found) {
      return { ok: false, code: 'NOT_FOUND', errors: ['No rule with that id.'] };
    }
    writeAll(backend, kept);
    return { ok: true };
  }

  function createMemoryBackend() {
    var data = {};
    return {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
      },
      setItem: function (key, value) { data[key] = String(value); },
      removeItem: function (key) { delete data[key]; }
    };
  }

  return {
    RULES_KEY: RULES_KEY,
    MAX_AMOUNT_TOKENS: MAX_AMOUNT_TOKENS,
    validateRule: validateRule,
    normalizeStored: normalizeStored,
    addRule: addRule,
    listRules: listRules,
    setStatus: setStatus,
    removeRule: removeRule,
    createMemoryBackend: createMemoryBackend
  };
});
