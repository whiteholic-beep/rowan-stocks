'use strict';

/**
 * Rowan Stocks — Rule parser (Tahap 2, reworked in Tahap 3.5).
 *
 * Pure deterministic JavaScript. No network, no dependencies, no AI —
 * plain pattern matching on the user's own words.
 *
 * Supported rule (locked scope, Tahap 3.5): ONE rule + ONE stock, with
 * TWO exits that are a pair.
 *   PAIRED SELL of tNVDAc: a stop-loss (price falls X%) and/or a
 *   take-profit (price rises Y%), both measured from one reference price.
 *   Either exit may be omitted, but at least one is required.
 *   Stop-loss and take-profit are mandatory as a pair (Haqi, 28 Nov 2026:
 *   "SL/TP itu wajib") — a rule with only one exit still parses, but the
 *   product offers both, and the paired form is the default example.
 * The buy-the-dip example from the original brief is DEFERRED, not built.
 *
 * Grammar (see rules/README.md for the full plain-language version):
 *   [action: sell] [token: tNVDAc] [drop X%] [and/or rise Y%] [from reference]
 *   - action: "jual" / "sell" (buy rules are rejected)
 *   - token: tNVDAc, NVDAc, NVDA (aliases). Any other token is rejected.
 *   - drop: "turun" / "jatuh" / "anjlok" / "merosot" / "drop" / "fall" ...
 *   - rise: "naik" / "menguat" / "rise" / "climb" / "gain" ...
 *   - threshold: a number + "%" (or "persen"/"percent"), 0 < X <= 100.
 *     "5,5%" (comma decimal) is accepted. At most one percent per
 *     direction (one for the stop-loss, one for the take-profit).
 *     Each percent is attached to the nearest direction word, so
 *     "turun 5% atau naik 50%" gives SL 5 + TP 50 in either order.
 *   - reference: "harga hari ini" / "today's price" -> "current"
 *                "harga beli" / "entry price"       -> "entry"
 *                omitted -> defaults to "current" (flagged in the output).
 *
 * Rule shape (grammarVersion 2):
 *   { type: 'paired-sell', action: 'sell', token: 'tNVDAc',
 *     stopLossPct: 5 | null, takeProfitPct: 50 | null,
 *     reference: 'current', language: 'id', grammarVersion: 2, source }
 * Legacy Tahap 2/3 rules (type 'stop-loss-sell', thresholdPct) are
 * normalised to this shape by normalizeRule() — old saved rules keep
 * working.
 *
 * Usage:
 *   const { parseRule, describeRule, RuleParseError } = require('./parser.js');
 *   const rule = parseRule('Jual NVDA kalau turun 5% atau naik 50% dari harga hari ini');
 *   // { type: 'paired-sell', action: 'sell', token: 'tNVDAc',
 *   //   tokenExplicit: true, stopLossPct: 5, takeProfitPct: 50,
 *   //   reference: 'current', referenceExplicit: true, language: 'id',
 *   //   grammarVersion: 2, source: '...' }
 *
 * In the browser, load this file with a <script> tag and use
 * window.RowanRules.parseRule(...) — same API.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RowanRules = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var SUPPORTED_TOKEN = 'tNVDAc';

  // Aliases (case-insensitive) that mean tNVDAc. Checked as whole words.
  var TOKEN_ALIASES = ['tnvdac', 'nvdac', 'nvda'];

  // Other tickers/tokens: rejected with a clear error. Covers the other 10
  // tickers on the Rowan Stocks board (real B20 symbols + mock t-forms)
  // and common crypto tickers.
  var OTHER_TOKENS = [
    'ttslac', 'tslac', 'tsla',
    'taaplc', 'aaplc', 'aapl',
    'tmsftc', 'msftc', 'msft',
    'tgooglc', 'googlc', 'googl', 'goog',
    'tamznc', 'amznc', 'amzn',
    'tmetac', 'metac', 'meta',
    'tmstrc', 'mstrc', 'mstr',
    'tcrclc', 'crclc', 'crcl',
    'tsndkc', 'sndkc', 'sndk',
    'tspcxc', 'spcxc', 'spcx',
    'btc', 'eth', 'sol', 'usdc', 'usdt', 'bnb', 'xrp', 'doge'
  ];

  // Mock-style token written as t + Capitalised ticker + c (e.g. tBTCc).
  // tNVDAc itself is caught by the alias list first, so anything else
  // matching this shape is an unknown mock token.
  var MOCK_TOKEN_PATTERN = /\bt[A-Z][A-Za-z]*c\b/;

  var SELL_WORDS = /\b(jual|lepas|sell)\b/i;
  var BUY_WORDS = /\b(beli|borong|buy)\b/i;
  var DROP_WORDS = /\b(turun|jatuh|anjlok|merosot|susut|drop|drops|dropped|fall|falls|falling|fell|decline|declines|down)\b/i;
  var RISE_WORDS = /\b(naik|menguat|rise|rises|rising|rose|climb|climbs|climbing|gain|gains)\b/i;
  // Global copies for position scanning (exec with /g tracks lastIndex).
  var DROP_WORDS_G = new RegExp(DROP_WORDS.source, 'gi');
  var RISE_WORDS_G = new RegExp(RISE_WORDS.source, 'gi');

  // Reference-price phrases. Entry phrases are checked before current
  // phrases so "harga beli" is never mistaken for a plain "harga ...".
  var ENTRY_PHRASES = [
    /harga\s+beli/i,
    /harga\s+pembelian/i,
    /harga\s+masuk/i,
    /harga\s+awal/i,
    /saat\s+beli/i,
    /waktu\s+beli/i,
    /buy\s+price/i,
    /purchase\s+price/i,
    /buying\s+price/i,
    /entry\s+price/i,
    /bought\s+at/i,
    /\bentry\b/i
  ];
  var CURRENT_PHRASES = [
    /harga\s+hari\s+ini/i,
    /harga\s+sekarang/i,
    /harga\s+saat\s+ini/i,
    /harga\s+terkini/i,
    /harga\s+pasar/i,
    /harga\s+harian/i,
    /today'?s\s+price/i,
    /current\s+price/i,
    /price\s+today/i,
    /current\s+market\s+price/i
  ];

  // A fixed price used as the reference ("dari $150") is a different rule
  // type and is not supported yet — reject instead of silently misreading it.
  var FIXED_PRICE_REFERENCE = /(dari|from)\s+((\$|rp|usd)\s*)?\d/i;

  // A percent value: digits with optional decimal part (dot or comma),
  // followed by %, "persen", "percent" or "pct". The lookahead (not \b)
  // is deliberate: % is a non-word character, so \b after % never matches
  // when a space follows — "5% dari ..." would be missed.
  var PERCENT_PATTERN = /(-?\d+(?:[.,]\d+)?)\s*(%|persen|percent|pct)(?![a-z])/gi;

  var ID_MARKERS = /\b(kalau|jika|jual|beli|turun|naik|harga|persen|saat|ketika|dari|tolong)\b/i;

  var MESSAGES = {
    id: {
      EMPTY_INPUT: 'Aturannya kosong. Contoh: "Jual NVDA kalau turun 5% atau naik 50% dari harga hari ini".',
      BUY_NOT_SUPPORTED: 'Aturan beli belum didukung — saat ini hanya jual dengan stop-loss dan/atau take-profit (contoh: "Jual NVDA kalau turun 5% atau naik 50%").',
      UNKNOWN_TOKEN: 'Token itu belum didukung — saat ini hanya tNVDAc (NVDA). Aturan untuk saham lain belum bisa dibuat.',
      FIXED_PRICE_REFERENCE: 'Harga acuan berupa angka tetap (mis. $150) belum didukung — pakai "harga hari ini" atau "harga beli".',
      NO_PERCENT: 'Tidak ada angka persen. Tulis angkanya, contoh: 5% untuk stop-loss, 50% untuk take-profit. ("Lima persen" belum bisa dibaca — pakai angka.)',
      MULTIPLE_PERCENTS: 'Terlalu banyak angka persen — maksimal satu untuk stop-loss dan satu untuk take-profit, contoh: turun 5% atau naik 50%.',
      INVALID_THRESHOLD: 'Persen harus di antara 0 dan 100. Contoh: 5%.',
      NO_ACTION: 'Tidak ada aksi jual yang jelas. Tulis "jual", contoh: "Jual NVDA kalau turun 5% atau naik 50%".',
      NO_DIRECTION: 'Tidak ada kata arah (turun/naik). Tulis "turun" untuk stop-loss atau "naik" untuk take-profit, contoh: "Jual NVDA kalau turun 5% atau naik 50%".',
      AMBIGUOUS_REFERENCE: 'Harga acuannya membingungkan — pilih satu: "harga hari ini" atau "harga beli".'
    },
    en: {
      EMPTY_INPUT: 'The rule is empty. Example: "Sell NVDA if it drops 5% or rises 50% from today\'s price".',
      BUY_NOT_SUPPORTED: 'Buy rules are not supported yet — only sells with a stop-loss and/or take-profit for now (example: "Sell NVDA if it drops 5% or rises 50%").',
      UNKNOWN_TOKEN: 'That token is not supported yet — only tNVDAc (NVDA) for now. Rules for other stocks cannot be made yet.',
      FIXED_PRICE_REFERENCE: 'A fixed price as reference (e.g. $150) is not supported yet — use "today\'s price" or "the buy price".',
      NO_PERCENT: 'No percent number found. Write the number, e.g. 5% for the stop-loss, 50% for the take-profit. (Spelled-out numbers like "five percent" cannot be read yet — use digits.)',
      MULTIPLE_PERCENTS: 'Too many percent numbers — at most one for the stop-loss and one for the take-profit, e.g. down 5% or up 50%.',
      INVALID_THRESHOLD: 'Percent must be between 0 and 100. Example: 5%.',
      NO_ACTION: 'No clear sell action. Write "sell", e.g. "Sell NVDA if it drops 5% or rises 50%".',
      NO_DIRECTION: 'No direction word (down/up). Write "down" or "drop" for the stop-loss, or "up" or "rise" for the take-profit, e.g. "Sell NVDA if it drops 5% or rises 50%".',
      AMBIGUOUS_REFERENCE: 'The reference price is ambiguous — pick one: "today\'s price" or "the buy price".'
    }
  };

  // Real constructor (callers must use `new`) so thrown errors pass
  // `instanceof RuleParseError`. A plain `return new Error(...)` inside
  // would defeat that check.
  function RuleParseError(code, message) {
    this.name = 'RuleParseError';
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, RuleParseError);
  }
  RuleParseError.prototype = Object.create(Error.prototype);
  RuleParseError.prototype.constructor = RuleParseError;

  function detectLanguage(text) {
    return ID_MARKERS.test(text) ? 'id' : 'en';
  }

  function fail(language, code) {
    throw new RuleParseError(code, MESSAGES[language][code]);
  }

  function hasAny(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(text)) return true;
    }
    return false;
  }

  // Remove every match of the given phrases from the text. Used before the
  // buy check: "harga beli" / "buy price" contain "beli" / "buy" but are a
  // reference price, not a buy action.
  function stripPhrases(text, patterns) {
    var out = text;
    for (var i = 0; i < patterns.length; i++) {
      out = out.replace(new RegExp(patterns[i].source, 'gi'), ' ');
    }
    return out;
  }

  function wordsOf(text) {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }

  // All match positions of a global word pattern in the text.
  function collectPositions(text, globalPattern) {
    globalPattern.lastIndex = 0;
    var out = [];
    var m;
    while ((m = globalPattern.exec(text)) !== null) out.push(m.index);
    return out;
  }

  // The direction word nearest to a percent number (by character distance).
  // A word before the number wins ties — clauses usually read "turun 5%",
  // "naik 50%". Returns 'drop', 'rise', or null when there is no
  // direction word at all in the sentence.
  function nearestDirection(percentIndex, dirs) {
    var best = null;
    for (var i = 0; i < dirs.length; i++) {
      var dist = Math.abs(percentIndex - dirs[i].index);
      var before = dirs[i].index < percentIndex ? 0 : 1;
      if (!best || dist < best.dist || (dist === best.dist && before < best.before)) {
        best = { dir: dirs[i].dir, dist: dist, before: before };
      }
    }
    return best ? best.dir : null;
  }

  /**
   * Normalise a rule to the current (grammarVersion 2) shape.
   * Legacy Tahap 2/3 rules ({ type: 'stop-loss-sell', thresholdPct })
   * become { type: 'paired-sell', stopLossPct, takeProfitPct: null }.
   * Returns the rule unchanged when it already has the current shape,
   * and null when the shape is not recognised at all. Other fields
   * (id, status, maxAmountTokens, createdAt) are carried over untouched.
   */
  function normalizeRule(rule) {
    if (!rule || typeof rule !== 'object') return null;
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
   * Parse a plain-language rule into a structured paired-sell rule.
   * Throws RuleParseError with a human-readable message on invalid input.
   */
  function parseRule(input) {
    if (typeof input !== 'string' || input.trim() === '') {
      throw new RuleParseError('EMPTY_INPUT', MESSAGES.en.EMPTY_INPUT);
    }
    var text = input.trim();
    var language = detectLanguage(text);

    // 1. Buy rules are a different (deferred) feature — reject first so the
    //    user gets the most useful error, even if the rest is incomplete.
    //    Reference phrases are stripped first: "harga beli" is not buying.
    if (BUY_WORDS.test(stripPhrases(text, ENTRY_PHRASES))) {
      fail(language, 'BUY_NOT_SUPPORTED');
    }

    // 2. Any token other than tNVDAc is rejected. Aliases are accepted.
    var words = wordsOf(text);
    var tokenExplicit = false;
    for (var i = 0; i < words.length; i++) {
      if (TOKEN_ALIASES.indexOf(words[i]) !== -1) tokenExplicit = true;
    }
    var otherFound = false;
    for (var j = 0; j < words.length; j++) {
      if (OTHER_TOKENS.indexOf(words[j]) !== -1) { otherFound = true; break; }
    }
    if (!otherFound && MOCK_TOKEN_PATTERN.test(text.replace(/tNVDAc/gi, ' '))) {
      // A mock-style token that is not tNVDAc (the supported token itself
      // is removed from the text before this check).
      otherFound = true;
    }
    if (otherFound) fail(language, 'UNKNOWN_TOKEN');

    // 3. A fixed price as reference is a different rule type.
    if (FIXED_PRICE_REFERENCE.test(text)) fail(language, 'FIXED_PRICE_REFERENCE');

    // 4. Percents: one or two, each 0 < X <= 100, each attached to the
    //    nearest direction word (drop -> stop-loss, rise -> take-profit).
    //    A direction word without a percent is ignored — the confirmation
    //    sentence (describeRule) shows exactly what was parsed before the
    //    user activates the rule, so nothing is silently assumed.
    PERCENT_PATTERN.lastIndex = 0;
    var matches = [];
    var m;
    while ((m = PERCENT_PATTERN.exec(text)) !== null) {
      matches.push({ value: m[1], index: m.index });
    }
    if (matches.length === 0) fail(language, 'NO_PERCENT');
    if (matches.length > 2) fail(language, 'MULTIPLE_PERCENTS');
    var dropPositions = collectPositions(text, DROP_WORDS_G);
    var risePositions = collectPositions(text, RISE_WORDS_G);
    var dirs = [];
    for (var d = 0; d < dropPositions.length; d++) dirs.push({ dir: 'drop', index: dropPositions[d] });
    for (var r = 0; r < risePositions.length; r++) dirs.push({ dir: 'rise', index: risePositions[r] });
    var stopLossPct = null;
    var takeProfitPct = null;
    for (var p = 0; p < matches.length; p++) {
      var value = parseFloat(matches[p].value.replace(',', '.'));
      if (!isFinite(value) || value <= 0 || value > 100) {
        fail(language, 'INVALID_THRESHOLD');
      }
      var dir = nearestDirection(matches[p].index, dirs);
      if (!dir) fail(language, 'NO_DIRECTION');
      if (dir === 'drop') {
        if (stopLossPct !== null) fail(language, 'MULTIPLE_PERCENTS');
        stopLossPct = value;
      } else {
        if (takeProfitPct !== null) fail(language, 'MULTIPLE_PERCENTS');
        takeProfitPct = value;
      }
    }

    // 5. The action must be an explicit sell.
    if (!SELL_WORDS.test(text)) fail(language, 'NO_ACTION');

    // 6. Reference price: explicit, or default to "current".
    var isEntry = hasAny(text, ENTRY_PHRASES);
    var isCurrent = hasAny(text, CURRENT_PHRASES);
    if (isEntry && isCurrent) fail(language, 'AMBIGUOUS_REFERENCE');
    var reference = isEntry ? 'entry' : 'current';
    var referenceExplicit = isEntry || isCurrent;

    return {
      type: 'paired-sell',
      action: 'sell',
      token: SUPPORTED_TOKEN,
      tokenExplicit: tokenExplicit,
      stopLossPct: stopLossPct,
      takeProfitPct: takeProfitPct,
      reference: reference,
      referenceExplicit: referenceExplicit,
      language: language,
      grammarVersion: 2,
      source: text
    };
  }

  function formatPct(value, language) {
    var s = String(value);
    return language === 'id' ? s.replace('.', ',') : s;
  }

  /**
   * One plain-language sentence describing a parsed rule, in the rule's
   * own language. Used for the confirmation step before a rule goes live.
   * Accepts legacy v1 rules too (normalised first).
   */
  function describeRule(rule) {
    var r = normalizeRule(rule);
    if (!r) {
      throw new Error('describeRule expects a parsed paired-sell rule.');
    }
    var refId = r.reference === 'entry' ? 'harga beli' : 'harga hari ini';
    var refEn = r.reference === 'entry' ? 'the buy price' : "today's price";
    if (r.language === 'id') {
      if (r.stopLossPct !== null && r.takeProfitPct !== null) {
        return 'Jual ' + r.token + ' kalau harganya turun ' + formatPct(r.stopLossPct, 'id') +
          '% atau naik ' + formatPct(r.takeProfitPct, 'id') + '% dari ' + refId + '.';
      }
      if (r.stopLossPct !== null) {
        return 'Jual ' + r.token + ' kalau harganya turun ' + formatPct(r.stopLossPct, 'id') + '% dari ' + refId + '.';
      }
      return 'Jual ' + r.token + ' kalau harganya naik ' + formatPct(r.takeProfitPct, 'id') + '% dari ' + refId + '.';
    }
    if (r.stopLossPct !== null && r.takeProfitPct !== null) {
      return 'Sell ' + r.token + ' if its price drops ' + formatPct(r.stopLossPct, 'en') +
        '% or rises ' + formatPct(r.takeProfitPct, 'en') + '% from ' + refEn + '.';
    }
    if (r.stopLossPct !== null) {
      return 'Sell ' + r.token + ' if its price drops ' + formatPct(r.stopLossPct, 'en') + '% from ' + refEn + '.';
    }
    return 'Sell ' + r.token + ' if its price rises ' + formatPct(r.takeProfitPct, 'en') + '% from ' + refEn + '.';
  }

  return {
    parseRule: parseRule,
    describeRule: describeRule,
    normalizeRule: normalizeRule,
    RuleParseError: RuleParseError,
    SUPPORTED_TOKEN: SUPPORTED_TOKEN
  };
});
