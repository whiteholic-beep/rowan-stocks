'use strict';

/* ============================================================
   Rowan Stocks — Tahap 3 web app (rules.html).
   Plain vanilla JS. No AI, no new dependencies.
   - Rule form -> Tahap 2 parser (window.RowanRules)
   - Active rules -> localStorage via window.RowanRuleStore
   - Reference price -> Dexscreener public API (read-only), real NVDAc
   - Mock faucet -> mint() on the tNVDAc contract, user signs in wallet
   ============================================================ */

(function () {
  var CONFIG = {
    CHAIN_ID: 84532,
    CHAIN_NAME: 'Base Sepolia',
    EXPLORER_URL: 'https://sepolia.basescan.org',
    TNVDAc_ADDRESS: '0x7D8c0fe1d88D772441ccc7b0F27fcA0b8a89A775',
    TNVDAc_ABI: [
      'function mint(address to, uint256 amount)',
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ],
    PRICE_REFRESH_MS: 60000
  };

  var Rules = window.RowanRules;
  var RuleStore = window.RowanRuleStore;
  var Price = window.RowanPrice;
  var Faucet = window.RowanFaucet;

  var lastReferencePrice = null;
  var pendingRule = null;
  var wallet = { provider: null, signer: null, address: null, contract: null };

  function $(id) { return document.getElementById(id); }

  function setMsg(el, text, isError, isOk) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-ok', !!isOk);
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function formatUsd(value) {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatTokens(units, decimals) {
    return (Number(units) / Math.pow(10, decimals)).toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  /* ---------------- Reference price (Dexscreener, read-only) ---------------- */

  function refreshPrice() {
    var meta = $('refPriceMeta');
    return fetch(Price.tokenUrl(Price.REAL_NVDAC))
      .then(function (res) {
        if (!res.ok) throw new Error('Dexscreener returned HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var extracted = Price.extractPrice(json);
        if (!extracted) throw new Error('No NVDAc pair found on Dexscreener.');
        lastReferencePrice = extracted.priceUsd;
        $('refPrice').textContent = formatUsd(extracted.priceUsd);
        var when = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        $('priceUpdated').textContent = 'Updated ' + when;
        var metaText = (extracted.dexId || 'DEX') + ' · pair ' +
          (extracted.pairAddress ? extracted.pairAddress.slice(0, 6) + '…' + extracted.pairAddress.slice(-4) : '–');
        if (extracted.url) {
          $('refPriceMeta').innerHTML = '';
          var a = document.createElement('a');
          a.href = extracted.url;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = metaText + ' ↗';
          $('refPriceMeta').appendChild(a);
        } else {
          $('refPriceMeta').textContent = metaText;
        }
      })
      .catch(function (err) {
        $('refPrice').textContent = '–';
        setMsg($('refPriceMeta'), 'Could not load the live price: ' + err.message + '. The rule form still works — the trigger price will show once the price loads.', true);
      });
  }

  /* ---------------- Rule form ---------------- */

  function parseCurrentInput() {
    var text = $('ruleInput').value;
    try {
      var rule = Rules.parseRule(text);
      pendingRule = rule;
      var sentence = Rules.describeRule(rule);
      $('parseSentence').textContent = sentence;
      var details = [];
      if (!rule.tokenExplicit) details.push('Token not named — defaulted to tNVDAc (the only supported stock).');
      if (!rule.referenceExplicit) details.push('Reference not named — defaulted to today\'s price. If you meant your buy price, write “dari harga beli”.');
      if (rule.reference === 'entry') details.push('Reference is your buy price. Tahap 4 will ask for it (or read it from your purchase history) when the monitor goes live.');
      $('parseDetails').textContent = details.join(' ');
      if (lastReferencePrice !== null) {
        var triggers = Price.triggerPrices(lastReferencePrice, rule);
        if (triggers) {
          var bits = [];
          if (triggers.stopLoss !== null) bits.push('stop-loss triggers at ' + formatUsd(triggers.stopLoss));
          if (triggers.takeProfit !== null) bits.push('take-profit triggers at ' + formatUsd(triggers.takeProfit));
          $('parseTrigger').textContent = 'At the current reference price of ' + formatUsd(lastReferencePrice) +
            ', this rule ' + bits.join(' and ') + '.';
        } else {
          $('parseTrigger').textContent = 'Trigger price will show here once the live reference price loads.';
        }
      } else {
        $('parseTrigger').textContent = 'Trigger price will show here once the live reference price loads.';
      }
      show($('parseBox'));
      setMsg($('parseMsg'), '', false);
      return rule;
    } catch (err) {
      pendingRule = null;
      hide($('parseBox'));
      setMsg($('parseMsg'), err && err.message ? err.message : String(err), true);
      return null;
    }
  }

  function renderRules() {
    var list = RuleStore.listRules(window.localStorage);
    var container = $('rulesList');
    container.innerHTML = '';
    $('rulesEmpty').hidden = list.length !== 0;
    list.forEach(function (rule) {
      var item = document.createElement('div');
      item.className = 'rule-item' + (rule.status === 'active' ? '' : ' inactive');
      var sentence = document.createElement('div');
      sentence.className = 'r-sentence';
      try {
        sentence.textContent = Rules.describeRule(rule);
      } catch (e) {
        sentence.textContent = rule.source || 'Rule';
      }
      var meta = document.createElement('div');
      meta.className = 'r-meta';
      var exits = [];
      var sl = (rule.stopLossPct !== undefined && rule.stopLossPct !== null)
        ? rule.stopLossPct : rule.thresholdPct;
      var tp = (rule.takeProfitPct !== undefined && rule.takeProfitPct !== null)
        ? rule.takeProfitPct : null;
      if (sl !== null && sl !== undefined) exits.push('SL ' + sl + '%');
      if (tp !== null && tp !== undefined) exits.push('TP ' + tp + '%');
      var parts = [
        exits.join(' · ') || 'no exits',
        'reference: ' + rule.reference,
        'max sell: ' + (rule.maxAmountTokens !== undefined ? rule.maxAmountTokens + ' tNVDAc' : 'whole balance'),
        'status: ' + rule.status,
        'created ' + (rule.createdAt ? rule.createdAt.slice(0, 10) : '–')
      ];
      meta.textContent = parts.join(' · ');
      var actions = document.createElement('div');
      actions.className = 'r-actions';
      var toggle = document.createElement('button');
      toggle.className = 'btn btn-sm';
      toggle.type = 'button';
      toggle.textContent = rule.status === 'active' ? 'Pause rule' : 'Resume rule';
      toggle.addEventListener('click', function () {
        RuleStore.setStatus(window.localStorage, rule.id, rule.status === 'active' ? 'inactive' : 'active');
        renderRules();
      });
      var del = document.createElement('button');
      del.className = 'btn btn-sm';
      del.type = 'button';
      del.textContent = 'Delete';
      del.addEventListener('click', function () {
        RuleStore.removeRule(window.localStorage, rule.id);
        renderRules();
      });
      actions.appendChild(toggle);
      actions.appendChild(del);
      item.appendChild(sentence);
      item.appendChild(meta);
      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  function activateRule() {
    if (!pendingRule) {
      setMsg($('parseMsg'), 'Check the rule first, then confirm it.', true);
      return;
    }
    var maxRaw = $('maxAmount').value;
    var maxAmount = maxRaw === '' ? undefined : Number(maxRaw);
    if (maxAmount !== undefined && (!isFinite(maxAmount) || maxAmount <= 0)) {
      setMsg($('parseMsg'), 'Max amount must be a number above 0 (max 1,000 tNVDAc).', true);
      return;
    }
    var result = RuleStore.addRule(window.localStorage, pendingRule, maxAmount);
    if (!result.ok) {
      var msg = result.code === 'DUPLICATE'
        ? 'This exact rule is already active. Change the percent or the reference to make a new one.'
        : 'Could not save the rule: ' + (result.errors || []).join(' ');
      setMsg($('parseMsg'), msg, true);
      return;
    }
    setMsg($('parseMsg'), 'Rule activated: ' + Rules.describeRule(result.rule), false, true);
    $('ruleInput').value = '';
    pendingRule = null;
    hide($('parseBox'));
    renderRules();
  }

  /* ---------------- Wallet + mock faucet ---------------- */

  function refreshBalance() {
    if (!wallet.contract || !wallet.address) return;
    wallet.contract.balanceOf(wallet.address)
      .then(function (bal) {
        $('faucetBalance').textContent = formatTokens(bal, Faucet.TOKEN_DECIMALS) + ' tNVDAc';
      })
      .catch(function (err) {
        $('faucetBalance').textContent = 'Could not read balance: ' + (err && err.message ? err.message : err);
      });
  }

  function connectWallet() {
    if (!window.ethereum) {
      $('walletStatus').textContent = 'No wallet found. Install MetaMask or Coinbase Wallet, then try again.';
      return Promise.resolve(false);
    }
    var provider = new window.ethers.BrowserProvider(window.ethereum);
    return provider.send('eth_requestAccounts', [])
      .then(function () { return provider.getNetwork(); })
      .then(function (network) {
        if (Number(network.chainId) !== CONFIG.CHAIN_ID) {
          var chainIdHex = '0x' + CONFIG.CHAIN_ID.toString(16);
          return window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }]
          }).then(function () {
            return new window.ethers.BrowserProvider(window.ethereum);
          }).catch(function () {
            throw new Error('this wallet doesn\'t know Base Sepolia yet — add the Base Sepolia network (chain ID 84532) in your wallet app, then tap Connect wallet again.');
          });
        }
        return provider;
      })
      .then(function (p) {
        wallet.provider = p;
        return p.getSigner();
      })
      .then(function (signer) {
        wallet.signer = signer;
        return signer.getAddress();
      })
      .then(function (address) {
        wallet.address = address;
        wallet.contract = new window.ethers.Contract(CONFIG.TNVDAc_ADDRESS, CONFIG.TNVDAc_ABI, wallet.signer);
        $('walletStatus').textContent = 'Connected: ' + address.slice(0, 6) + '…' + address.slice(-4) + ' on Base Sepolia.';
        $('mintBtn').disabled = false;
        refreshBalance();
        return true;
      })
      .catch(function (err) {
        $('walletStatus').textContent = 'Could not connect: ' + (err && err.shortMessage ? err.shortMessage : err.message || err);
        return false;
      });
  }

  function mintFaucet() {
    if (!wallet.contract || !wallet.address) {
      setMsg($('faucetMsg'), 'Connect your wallet first.', true);
      return;
    }
    var amountUnits;
    try {
      amountUnits = Faucet.toUnits(Faucet.FAUCET_MINT_TOKENS);
    } catch (err) {
      setMsg($('faucetMsg'), err.message, true);
      return;
    }
    setMsg($('faucetMsg'), 'Sending mint transaction — confirm it in your wallet…');
    $('mintBtn').disabled = true;
    var call;
    try {
      call = Faucet.buildMintCall(CONFIG.TNVDAc_ADDRESS, wallet.address, amountUnits);
    } catch (err) {
      setMsg($('faucetMsg'), err.message, true);
      $('mintBtn').disabled = false;
      return;
    }
    wallet.signer.sendTransaction({ to: call.to, data: call.data })
      .then(function (tx) {
        setMsg($('faucetMsg'), 'Transaction sent: ' + tx.hash + ' — waiting for confirmation…');
        return tx.wait();
      })
      .then(function () {
        setMsg($('faucetMsg'), 'Minted 100 test tNVDAc to your wallet.', false, true);
        $('mintBtn').disabled = false;
        refreshBalance();
      })
      .catch(function (err) {
        setMsg($('faucetMsg'), 'Mint failed: ' + (err && err.shortMessage ? err.shortMessage : err.message || err), true);
        $('mintBtn').disabled = false;
      });
  }

  /* ---------------- Init ---------------- */

  function init() {
    if (!Rules || !RuleStore || !Price || !Faucet) {
      document.body.insertAdjacentHTML('afterbegin',
        '<p style="padding:12px;background:#d92d20;color:#fff">Rule modules failed to load. Check that rules/parser.js, storage.js, price.js and faucet.js are next to rules.html.</p>');
      return;
    }
    $('parseBtn').addEventListener('click', parseCurrentInput);
    $('ruleInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); parseCurrentInput(); }
    });
    document.querySelectorAll('.chip-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $('ruleInput').value = btn.getAttribute('data-example');
        parseCurrentInput();
      });
    });
    $('activateBtn').addEventListener('click', activateRule);
    $('priceRefreshBtn').addEventListener('click', refreshPrice);
    $('connectBtn').addEventListener('click', connectWallet);
    $('mintBtn').addEventListener('click', mintFaucet);
    renderRules();
    refreshPrice();
    setInterval(refreshPrice, CONFIG.PRICE_REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
