'use strict';

/**
 * Rowan Stocks — Rule store (Tahap 3).
 *
 * Pure deterministic JavaScript. No network, no dependencies, no AI.
 * Holds the user's activated stop-loss rules in a storage backend
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
 * Locked scope: only stop-loss-sell rules for tNVDAc are stored.
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

  /**
   * Check a parsed rule object. Returns { ok: true } or
   * { ok: false, errors: [messages] } in plain language.
   */
  function validateRule(rule) {
    var errors = [];
    if (!isPlainObject(rule)) {
      return { ok: false, errors: ['Rule is not an object.'] };
    }
    if (rule.type !== 'stop-loss-sell') {
      errors.push('Only stop-loss-sell rules can be stored.');
    }
    if (rule.action !== 'sell') {
      errors.push('Only sell rules can be stored.');
    }
    if (rule.token !== SUPPORTED_TOKEN) {
      errors.push('Only tNVDAc rules can be stored.');
    }
    if (typeof rule.thresholdPct !== 'number' ||
        !isFinite(rule.thresholdPct) ||
        rule.thresholdPct <= 0 || rule.thresholdPct > 100) {
      errors.push('thresholdPct must be a number between 0 and 100.');
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
      return Array.isArray(parsed) ? parsed : [];
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
   *   (DUPLICATE: an identical active rule already exists).
   */
  function addRule(backend, parsedRule, maxAmountTokens) {
    var rule = {};
    var key;
    for (key in parsedRule) {
      if (Object.prototype.hasOwnProperty.call(parsedRule, key)) {
        rule[key] = parsedRule[key];
      }
    }
    if (maxAmountTokens !== undefined) rule.maxAmountTokens = maxAmountTokens;
    var checked = validateRule(rule);
    if (!checked.ok) {
      return { ok: false, code: 'INVALID', errors: checked.errors };
    }
    var rules = readAll(backend);
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.status === 'active' &&
          r.token === rule.token &&
          r.thresholdPct === rule.thresholdPct &&
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
    addRule: addRule,
    listRules: listRules,
    setStatus: setStatus,
    removeRule: removeRule,
    createMemoryBackend: createMemoryBackend
  };
});
