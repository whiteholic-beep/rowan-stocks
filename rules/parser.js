'use strict';

/**
 * Rowan Stocks — Rule parser (Tahap 2).
 *
 * Pure deterministic JavaScript. No network, no dependencies, no AI —
 * plain pattern matching on the user's own words.
 *
 * Supported rule (locked scope, Tahap 2-5): ONE rule type + ONE stock.
 *   STOP-LOSS SELL of tNVDAc when the price falls X% from a reference price.
 * The buy-the-dip example from the original brief is DEFERRED, not built.
 *
 * Grammar (see rules/README.md for the full plain-language version):
 *   [action: sell] [token: tNVDAc] [drop X%] [from reference]
 *   - action: "jual" / "sell" (buy rules are rejected)
 *   - token: tNVDAc, NVDAc, NVDA (aliases). Any other token is rejected.
 *   - drop: "turun" / "jatuh" / "anjlok" / "merosot" / "drop" / "fall" ...
 *   - threshold: a number + "%" (or "persen"/"percent"), 0 < X <= 100.
 *     "5,5%" (comma decimal) is accepted.
 *   - reference: "harga hari ini" / "today's price" -> "current"
 *                "harga beli" / "entry price"       -> "entry"
 *                omitted -> defaults to "current" (flagged in the output).
 *
 * Usage:
 *   const { parseRule, describeRule, RuleParseError } = require('./parser.js');
 *   const rule = parseRule('Jual NVDA kalau turun 5% dari harga hari ini');
 *   // { type: 'stop-loss-sell', action: 'sell', token: 'tNVDAc',
 *   //   tokenExplicit: true, thresholdPct: 5, reference: 'current',
 *   //   referenceExplicit: true, language: 'id', grammarVersion: 1,
 *   //   source: 'Jual NVDA kalau turun 5% dari harga hari ini' }
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
      EMPTY_INPUT: 'Aturannya kosong. Contoh: "Jual NVDA kalau turun 5% dari harga hari ini".',
      BUY_NOT_SUPPORTED: 'Aturan beli belum didukung — saat ini hanya stop-loss jual (contoh: "Jual NVDA kalau turun 5%").',
      UNKNOWN_TOKEN: 'Token itu belum didukung — saat ini hanya tNVDAc (NVDA). Aturan untuk saham lain belum bisa dibuat.',
      FIXED_PRICE_REFERENCE: 'Harga acuan berupa angka tetap (mis. $150) belum didukung — pakai "harga hari ini" atau "harga beli".',
      NO_PERCENT: 'Tidak ada angka persen. Tulis angkanya, contoh: 5%. ("Lima persen" belum bisa dibaca — pakai angka.)',
      MULTIPLE_PERCENTS: 'Ada lebih dari satu angka persen — tulis satu saja, contoh: 5%.',
      INVALID_THRESHOLD: 'Persen harus di antara 0 dan 100. Contoh: 5%.',
      NO_ACTION: 'Tidak ada aksi jual yang jelas. Tulis "jual", contoh: "Jual NVDA kalau turun 5%".',
      RISE_NOT_SUPPORTED: 'Aturan ini hanya untuk penurunan harga (stop-loss). "Naik" bukan stop-loss.',
      NO_DROP: 'Tidak ada kata penurunan. Tulis "turun" atau "drop", contoh: "Jual NVDA kalau turun 5%".',
      AMBIGUOUS_REFERENCE: 'Harga acuannya membingungkan — pilih satu: "harga hari ini" atau "harga beli".'
    },
    en: {
      EMPTY_INPUT: 'The rule is empty. Example: "Sell NVDA if it drops 5% from today\'s price".',
      BUY_NOT_SUPPORTED: 'Buy rules are not supported yet — only stop-loss sells for now (example: "Sell NVDA if it drops 5%").',
      UNKNOWN_TOKEN: 'That token is not supported yet — only tNVDAc (NVDA) for now. Rules for other stocks cannot be made yet.',
      FIXED_PRICE_REFERENCE: 'A fixed price as reference (e.g. $150) is not supported yet — use "today\'s price" or "the buy price".',
      NO_PERCENT: 'No percent number found. Write the number, e.g. 5%. (Spelled-out numbers like "five percent" cannot be read yet — use digits.)',
      MULTIPLE_PERCENTS: 'More than one percent number found — write just one, e.g. 5%.',
      INVALID_THRESHOLD: 'Percent must be between 0 and 100. Example: 5%.',
      NO_ACTION: 'No clear sell action. Write "sell", e.g. "Sell NVDA if it drops 5%".',
      RISE_NOT_SUPPORTED: 'This rule is only for price drops (stop-loss). "Rise" is not a stop-loss.',
      NO_DROP: 'No drop word found. Write "drop" or "fall", e.g. "Sell NVDA if it drops 5%".',
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

  /**
   * Parse a plain-language rule into a structured stop-loss-sell rule.
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

    // 4. Exactly one percent number, 0 < X <= 100.
    PERCENT_PATTERN.lastIndex = 0;
    var matches = [];
    var m;
    while ((m = PERCENT_PATTERN.exec(text)) !== null) matches.push(m[1]);
    if (matches.length === 0) fail(language, 'NO_PERCENT');
    if (matches.length > 1) fail(language, 'MULTIPLE_PERCENTS');
    var thresholdPct = parseFloat(matches[0].replace(',', '.'));
    if (!isFinite(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) {
      fail(language, 'INVALID_THRESHOLD');
    }

    // 5. The action must be an explicit sell.
    if (!SELL_WORDS.test(text)) fail(language, 'NO_ACTION');

    // 6. The direction must be a drop, not a rise.
    if (RISE_WORDS.test(text)) fail(language, 'RISE_NOT_SUPPORTED');
    if (!DROP_WORDS.test(text)) fail(language, 'NO_DROP');

    // 7. Reference price: explicit, or default to "current".
    var isEntry = hasAny(text, ENTRY_PHRASES);
    var isCurrent = hasAny(text, CURRENT_PHRASES);
    if (isEntry && isCurrent) fail(language, 'AMBIGUOUS_REFERENCE');
    var reference = isEntry ? 'entry' : 'current';
    var referenceExplicit = isEntry || isCurrent;

    return {
      type: 'stop-loss-sell',
      action: 'sell',
      token: SUPPORTED_TOKEN,
      tokenExplicit: tokenExplicit,
      thresholdPct: thresholdPct,
      reference: reference,
      referenceExplicit: referenceExplicit,
      language: language,
      grammarVersion: 1,
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
   */
  function describeRule(rule) {
    if (!rule || rule.type !== 'stop-loss-sell') {
      throw new Error('describeRule expects a parsed stop-loss-sell rule.');
    }
    var pct = formatPct(rule.thresholdPct, rule.language);
    if (rule.language === 'id') {
      var refId = rule.reference === 'entry' ? 'harga beli' : 'harga hari ini';
      return 'Jual ' + rule.token + ' kalau harganya turun ' + pct + '% dari ' + refId + '.';
    }
    var refEn = rule.reference === 'entry' ? 'the buy price' : "today's price";
    return 'Sell ' + rule.token + ' if its price drops ' + pct + '% from ' + refEn + '.';
  }

  return {
    parseRule: parseRule,
    describeRule: describeRule,
    RuleParseError: RuleParseError,
    SUPPORTED_TOKEN: SUPPORTED_TOKEN
  };
});
