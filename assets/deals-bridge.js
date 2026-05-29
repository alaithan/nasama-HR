(function () {
  'use strict';

  // ── CONFIG ───────────────────────────────────────────────────────────────────
  var ACCT_CFG = {
    apiKey: 'AIzaSyDc4SS-bJyGJKo5ZbK0legkZDT3JPFE82A',
    authDomain: 'nasama-accuntant.firebaseapp.com',
    projectId: 'nasama-accuntant',
    storageBucket: 'nasama-accuntant.firebasestorage.app',
    messagingSenderId: '738071507036',
    appId: '1:738071507036:web:131bc36e03f646003a3699'
  };
  var ACCT_APP_NAME = 'nasama-accounting-bridge';
  var ACCT_APP_URL = 'https://nasama-accuntant.firebaseapp.com';
  var HR_CFG = {
    apiKey: 'AIzaSyAqkLr-uJKIE8uW8zrgqlMpte0KfGPnOBM',
    authDomain: 'nasama-hr.firebaseapp.com',
    databaseURL: 'https://nasama-hr-default-rtdb.firebaseio.com',
    projectId: 'nasama-hr',
    storageBucket: 'nasama-hr.firebasestorage.app'
  };
  var HR_APP_NAME = 'nasama-hr-bridge';
  var HR_ROOT = 'nasama_hr';
  var CACHE_TTL = 5 * 60 * 1000;

  // ── STATE ────────────────────────────────────────────────────────────────────
  var acctDb = null;
  var dealsCache = {};
  var linksCache = null;
  var empsCache = null;
  var obsTimer = null;
  var commFormDone     = false;
  var leaderboardDone  = false;
  var payrollFormDone  = false;
  var dealSyncBusy     = false;

  // ── FIREBASE INIT ────────────────────────────────────────────────────────────
  async function initAcct() {
    if (!window.firebase || !window.firebase.apps) return false;
    var existing = window.firebase.apps.find(function (a) { return a.name === ACCT_APP_NAME; });
    var app = existing || window.firebase.initializeApp(ACCT_CFG, ACCT_APP_NAME);
    acctDb = app.firestore();
    var auth = app.auth();
    if (!auth.currentUser) {
      try {
        await auth.signInAnonymously();
      } catch (e) {
        console.warn('[NasamaDeals] Anonymous auth failed:', e.message);
        return false;
      }
    }
    return true;
  }

  // Always target the nasama-hr project explicitly — never the accounting app
  function findHrApp() {
    if (!window.firebase || !window.firebase.apps) return null;
    try {
      var def = window.firebase.app();
      if (def && def.options && def.options.projectId === 'nasama-hr') return def;
    } catch (e) {}
    return window.firebase.apps.find(function (a) {
      return a.options && a.options.projectId === 'nasama-hr';
    }) || initHrCompatApp();
  }

  function initHrCompatApp() {
    if (!window.firebase || !window.firebase.initializeApp) return null;
    try {
      var existing = window.firebase.apps.find(function (a) { return a.name === HR_APP_NAME; });
      return existing || window.firebase.initializeApp(HR_CFG, HR_APP_NAME);
    } catch (e) {
      console.warn('[NasamaDeals] HR compat app init failed:', e.message);
      return null;
    }
  }

  function hrDb() { var a = findHrApp(); try { return a ? a.database() : null; } catch (e) { return null; } }
  function hrFs() { var a = findHrApp(); try { return a ? a.firestore() : null; } catch (e) { return null; } }

  // ── DEAL QUERIES ──────────────────────────────────────────────────────────────
  async function fetchDeals(brokerId, month, year) {
    if (!acctDb) return [];
    var key = brokerId + '-' + year + '-' + month;
    var hit = dealsCache[key];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var start = year + '-' + pad(month) + '-01';
    var end = year + '-' + pad(month) + '-' + pad(new Date(year, month, 0).getDate());
    try {
      var snap = await acctDb.collection('deals')
        .where('broker_id', '==', brokerId)
        .where('created_at', '>=', start)
        .where('created_at', '<=', end)
        .get();
      var data = [];
      snap.forEach(function (d) { data.push(Object.assign({ _id: d.id }, d.data())); });
      data.sort(function (a, b) { return (b.created_at || '') < (a.created_at || '') ? -1 : 1; });
      dealsCache[key] = { data: data, ts: Date.now() };
      return data;
    } catch (e) {
      console.warn('[NasamaDeals] fetchDeals:', e.message);
      return [];
    }
  }

  async function fetchDealsYTD(brokerId, year) {
    if (!acctDb) return [];
    var key = brokerId + '-' + year + '-ytd';
    var hit = dealsCache[key];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    try {
      var snap = await acctDb.collection('deals')
        .where('broker_id', '==', brokerId)
        .where('created_at', '>=', year + '-01-01')
        .where('created_at', '<=', year + '-12-31')
        .get();
      var data = [];
      snap.forEach(function (d) { data.push(Object.assign({ _id: d.id }, d.data())); });
      dealsCache[key] = { data: data, ts: Date.now() };
      return data;
    } catch (e) {
      console.warn('[NasamaDeals] fetchDealsYTD:', e.message);
      return [];
    }
  }

  async function fetchAllDealsYTD(year) {
    if (!acctDb) return [];
    var key = 'all-' + year + '-ytd';
    var hit = dealsCache[key];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    try {
      var snap = await acctDb.collection('deals')
        .where('created_at', '>=', year + '-01-01')
        .where('created_at', '<=', year + '-12-31')
        .get();
      var data = [];
      snap.forEach(function (d) { data.push(Object.assign({ _id: d.id }, d.data())); });
      data.sort(function (a, b) { return (b.created_at || '') < (a.created_at || '') ? -1 : 1; });
      dealsCache[key] = { data: data, ts: Date.now() };
      return data;
    } catch (e) {
      console.warn('[NasamaDeals] fetchAllDealsYTD:', e.message);
      return [];
    }
  }

  // ── HR FIRESTORE QUERIES ──────────────────────────────────────────────────────

  async function queryMonthComms(empId, mo, yr) {
    var db = hrFs(); if (!db) return [];
    var month = yr + '-' + String(mo).padStart(2, '0');
    try {
      var snap = await db.collection('commissions')
        .where('employeeId', '==', empId)
        .where('month', '==', month)
        .get();
      var data = [];
      snap.forEach(function (d) { data.push(Object.assign({ _id: d.id }, d.data())); });
      return data;
    } catch (e) {
      console.warn('[NasamaDeals] queryMonthComms:', e.message);
      return [];
    }
  }

  async function detectCommissionGaps() {
    if (!acctDb) return [];
    var yr = new Date().getFullYear();
    try {
      var collected = (await fetchAllDealsYTD(yr)).filter(isCollected);
      if (!collected.length) return [];
      var linked = new Set();
      (await loadCommRecs()).forEach(function (comm) {
        var id = commLinkedDealId(comm);
        if (id) linked.add(id);
      });
      var fs = hrFs();
      if (fs) {
        var snap = await fs.collection('commissions')
          .where('month', '>=', yr + '-01')
          .where('month', '<=', yr + '-12')
          .get();
        snap.forEach(function (d) {
          var id = commLinkedDealId(d.data());
          if (id) linked.add(id);
        });
      }
      return collected.filter(function (d) { return !linked.has(d._id); });
    } catch (e) {
      console.warn('[NasamaDeals] detectCommissionGaps:', e.message);
      return [];
    }
  }

  // transaction_value is stored in fils (×100 of AED) in the accounting app
  function txAed(d) { return (parseFloat(d.transaction_value) || 0) / 100; }
  function dealComm(d) { return txAed(d) * ((parseFloat(d.commission_pct) || 0) / 100); }

  function isCollected(d) {
    return String(d.stage || '').trim().toLowerCase() === 'commission collected';
  }
  // Deals selectable in the commission entry picker: collected OR earned (not earlier leads)
  function isCommissionable(d) {
    var s = String(d.stage || '').trim().toLowerCase();
    return s === 'commission collected' || s === 'commission earned';
  }
  function isActive(d) { return d.stage !== 'Cancelled'; }

  // ── HR DATA ───────────────────────────────────────────────────────────────────
  async function loadEmps() {
    if (empsCache) return empsCache;
    var db = hrDb();
    if (!db) return [];
    try {
      var snap = await db.ref(HR_ROOT + '/employees').once('value');
      var val = snap.val();
      if (!val) return (empsCache = []);
      empsCache = Array.isArray(val)
        ? val.filter(Boolean)
        : Object.values(val).filter(Boolean);
      return empsCache;
    } catch (e) { return []; }
  }

  async function empByName(name) {
    var list = await loadEmps();
    return list.find(function (e) { return e.name === name; }) || null;
  }

  async function getLinks() {
    if (linksCache) return linksCache;
    var db = hrDb();
    if (!db) return {};
    try {
      var snap = await db.ref(HR_ROOT + '/broker_links').once('value');
      linksCache = snap.val() || {};
    } catch (e) { linksCache = {}; }
    return linksCache;
  }

  async function brokerIdFor(empId) {
    var lnk = await getLinks();
    return lnk[empId] && lnk[empId].brokerAcctId ? lnk[empId].brokerAcctId : null;
  }

  async function saveLink(empId, brokerId) {
    var db = hrDb();
    if (!db) return;
    await db.ref(HR_ROOT + '/broker_links/' + empId).set({ brokerAcctId: brokerId });
    if (linksCache) linksCache[empId] = { brokerAcctId: brokerId };
  }

  async function getTarget(empId, year, month) {
    var db = hrDb();
    if (!db) return null;
    try {
      var snap = await db.ref(
        HR_ROOT + '/broker_targets/' + empId + '/' + year + '/' + String(month).padStart(2, '0')
      ).once('value');
      return snap.val();
    } catch (e) { return null; }
  }

  async function saveTarget(empId, year, month, aed) {
    var db = hrDb();
    if (!db) return;
    await db.ref(
      HR_ROOT + '/broker_targets/' + empId + '/' + year + '/' + String(month).padStart(2, '0')
    ).set(aed);
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────────
  function fmtAed(n) {
    return 'AED ' + (Math.round(n) || 0).toLocaleString('en-US');
  }

  var STAGE_COLORS = {
    'Lead': '#94a3b8', 'EOI': '#60a5fa', 'Booking Form Signed': '#818cf8',
    'First Payment Paid': '#a78bfa', 'MOU Signed': '#c084fc', 'SPA Signed': '#e879f9',
    'Handover': '#f472b6', 'Commission Earned': '#fb923c',
    'Commission Collected': '#22c55e', 'Cancelled': '#ef4444'
  };

  function badge(stage) {
    var c = STAGE_COLORS[stage] || '#94a3b8';
    return '<span style="padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;' +
      'background:' + c + '20;color:' + c + ';border:1px solid ' + c + '40;white-space:nowrap">' +
      (stage || '—') + '</span>';
  }

  function statCell(label, val, color) {
    return '<div style="padding:12px 14px;text-align:center;background:#fff">' +
      '<div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;' +
        'letter-spacing:.4px;margin-bottom:3px">' + label + '</div>' +
      '<div style="font-size:16px;font-weight:800;color:' + color + '">' + val + '</div>' +
    '</div>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function normText(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function parseMoney(value) {
    return parseFloat(String(value == null ? '' : value).replace(/[^0-9.-]/g, '')) || 0;
  }

  function monthKey(value) {
    var s = String(value || '');
    var m = s.match(/^(\d{4})-(\d{2})/);
    return m ? m[1] + '-' + m[2] : '';
  }

  function commLinkedDealId(comm) {
    if (!comm) return '';
    if (comm.accountingDealId) return String(comm.accountingDealId);
    if (comm.accountingDealRef) return String(comm.accountingDealRef);
    var m = String(comm.deal || '').match(/\[([^\]]+)\]\s*$/);
    return m ? m[1] : '';
  }

  function stripDealSuffix(value) {
    return String(value || '').replace(/\s*\[[^\]]+\]\s*$/, '').trim();
  }

  function getDealLabel(deal) {
    return stripDealSuffix(
      (deal.property_name || deal.unit_no || deal.developer || 'Accounting deal') +
      (deal.unit_no && deal.property_name ? ' - ' + deal.unit_no : '')
    );
  }

  function getCommissionDate(comm) {
    return comm.paidDate || comm.paymentDate || comm.datePaid || comm.approvedAt ||
      comm.date || comm.createdAt || comm.month || '';
  }

  function isClosedCommission(comm) {
    var status = normText(comm && comm.status);
    return status === 'paid' || status === 'approved' || status === 'settled';
  }

  async function loadCommRecs() {
    var db = hrDb();
    if (!db) return [];
    try {
      var snap = await db.ref(HR_ROOT + '/commRecs').once('value');
      var val = snap.val();
      if (!val) return [];
      return Object.keys(val).map(function (key) {
        var rec = val[key];
        if (!rec || typeof rec !== 'object') return null;
        return Object.assign({ _key: key }, rec);
      }).filter(Boolean);
    } catch (e) {
      console.warn('[NasamaDeals] loadCommRecs:', e.message);
      return [];
    }
  }

  async function linkedDealIdsFromHr() {
    var linked = new Set();
    (await loadCommRecs()).forEach(function (comm) {
      var id = commLinkedDealId(comm);
      if (id) linked.add(id);
    });
    return linked;
  }

  function updateLocalCommRec(comm, update) {
    try {
      var raw = localStorage.getItem('nasama_hr_commRecs');
      if (!raw) return;
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return;
      var idx = -1;
      if (comm.id) idx = list.findIndex(function (r) { return r && r.id === comm.id; });
      if (idx < 0 && comm._id) idx = list.findIndex(function (r) { return r && r._id === comm._id; });
      if (idx < 0 && String(parseInt(comm._key, 10)) === String(comm._key)) idx = parseInt(comm._key, 10);
      if (idx < 0 || !list[idx]) return;
      list[idx] = Object.assign({}, list[idx], update);
      localStorage.setItem('nasama_hr_commRecs', JSON.stringify(list));
    } catch (e) {}
  }

  async function writeAuditEntry(action, detail, empId) {
    var db = hrDb();
    if (!db) return;
    var entry = {
      id: 'AUD' + Date.now(),
      timestamp: new Date().toISOString(),
      action: action,
      detail: detail,
      empId: empId || '',
      actor: 'HR Sync'
    };
    try {
      var ref = db.ref(HR_ROOT + '/auditLog');
      var snap = await ref.once('value');
      var val = snap.val();
      var current = Array.isArray(val)
        ? val.filter(Boolean)
        : Object.values(val || {}).filter(Boolean);
      var next = [entry].concat(current).slice(0, 500);
      await ref.set(next);
      try { localStorage.setItem('nasama_hr_auditLog', JSON.stringify(next)); } catch (e) {}
    } catch (e) {
      console.warn('[NasamaDeals] auditLog:', e.message);
    }
  }

  // ── COMMISSION FORM INJECTION ─────────────────────────────────────────────────
  // Adds "⚡ Import from Accounting Deals" to the "New Commission Entry" modal.
  // When a deal is selected every field is filled automatically — no double entry.

  async function injectCommForm() {
    // Detect the commission modal by its title text (leaf node)
    var inModal = false;
    document.querySelectorAll('div,span,h1,h2,h3,h4').forEach(function (el) {
      if (!el.children.length) {
        var t = (el.textContent || '').trim();
        if (t === 'New Commission Entry' || t === 'Edit Commission Record') inModal = true;
      }
    });
    if (!inModal) { commFormDone = false; return; }
    if (commFormDone || document.querySelector('.nd-import-btn')) { commFormDone = true; return; }

    // Find the Deal Reference form group (document-level — no fragile modal-container lookup)
    var dealGroup = null;
    document.querySelectorAll('.form-group label').forEach(function (l) {
      if (!dealGroup && (l.textContent || '').includes('Deal Reference')) {
        dealGroup = l.closest('.form-group');
      }
    });
    if (!dealGroup) return;

    commFormDone = true;

    var dealInput = dealGroup.querySelector('input');
    if (dealInput && !dealInput.dataset.ndDealPickerReady) {
      dealInput.dataset.ndDealPickerReady = '1';
      dealInput.placeholder = 'Select deal from accounting deals';
      dealInput.readOnly = true;
      dealInput.style.cursor = 'pointer';
      dealInput.title = 'Click to select a matching accounting deal';
      dealInput.addEventListener('click', function () { openDealPickerFromForm(dealInput); });
      dealInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDealPickerFromForm(dealInput);
        }
      });
    }

    // Monitor broker selection change to clear deal hint
    var brokerSelect = findBrokerSelect();
    if (brokerSelect && !brokerSelect.dataset.ndBrokerMonitored) {
      brokerSelect.dataset.ndBrokerMonitored = '1';
      brokerSelect.addEventListener('change', function () {
        var old = document.getElementById('nd-deal-value-row');
        if (old) old.remove();
      });
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nd-import-btn';
    btn.style.cssText = [
      'margin-top:7px;padding:5px 12px;border-radius:6px',
      'border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8',
      'font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px'
    ].join(';');
    btn.textContent = 'Select Deal Reference';
    dealGroup.appendChild(btn);

    btn.addEventListener('click', function () { openDealPickerFromForm(btn); });
  }

  function findBrokerSelect() {
    var brokerSelect = null;
    document.querySelectorAll('.form-group').forEach(function (g) {
      if (brokerSelect) return;
      var lbl = g.querySelector('label');
      if (lbl && (lbl.textContent || '').trim().startsWith('Broker')) {
        brokerSelect = g.querySelector('select');
      }
    });
    return brokerSelect;
  }

  async function openDealPickerFromForm(anchor) {
    var brokerSelect = findBrokerSelect();
    var empId = brokerSelect ? brokerSelect.value : '';
    if (!empId) { alert('Select a broker first.'); return; }

    var button = anchor && anchor.classList && anchor.classList.contains('nd-import-btn') ? anchor : document.querySelector('.nd-import-btn');
    var originalText = button ? button.textContent : '';
    if (button) {
      button.textContent = 'Loading deals...';
      button.disabled = true;
    }

    var brokerId = await brokerIdFor(empId);
    var showAll = !brokerId;
    var now = new Date();
    var deals;

    if (brokerId) {
      deals = (await fetchDealsYTD(brokerId, now.getFullYear())).filter(isCommissionable);
      if (!deals.length) deals = (await fetchDealsYTD(brokerId, now.getFullYear() - 1)).filter(isCommissionable);
    } else {
      deals = (await fetchAllDealsYTD(now.getFullYear())).filter(isCommissionable);
      if (!deals.length) deals = (await fetchAllDealsYTD(now.getFullYear() - 1)).filter(isCommissionable);
    }

    if (button) {
      button.textContent = originalText || 'Select Deal Reference';
      button.disabled = false;
    }

    showDealPicker(anchor, deals, showAll, function (deal) {
      fillCommForm(deal);
      if (showAll && deal.broker_id) {
        setTimeout(function () {
          if (confirm('Save broker ID "' + deal.broker_id + '" for this employee?\nFuture imports will only show their deals.')) {
            saveLink(empId, deal.broker_id);
          }
        }, 300);
      }
    });
  }

  var _nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

  // Calls React's own onChange handler directly via the element's __reactFiber key.
  // This is the only reliable way to update a controlled input's state from outside React —
  // DOM events alone get suppressed or overwritten on re-render.
  function setReactInput(input, value) {
    _nativeSetter.call(input, value);

    // Find the fiber key (format changes across React versions)
    var fiberKey = Object.keys(input).find(function (k) {
      return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance');
    });
    var handled = false;
    if (fiberKey) {
      var props = input[fiberKey] && input[fiberKey].memoizedProps;
      if (props && typeof props.onChange === 'function') {
        props.onChange({
          target: input, currentTarget: input, type: 'change', bubbles: true,
          preventDefault: function () {}, stopPropagation: function () {}
        });
        handled = true;
      }
    }
    if (!handled) {
      // Fallback: reset _valueTracker so React sees the value as changed
      var tracker = input._valueTracker;
      if (tracker) tracker.setValue('');
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function fillCommForm(deal) {
    // Use includes() matching so asterisks and casing variations don't matter
    var fills = [
      { match: 'Deal Reference', value: (deal.property_name || deal.unit_no || '') +
          (deal.unit_no && deal.property_name ? ' — ' + deal.unit_no : '') +
          (deal._id ? ' [' + deal._id + ']' : '') },
      { match: 'Client Name',       value: deal.client_name || '' },
      { match: 'Property / Area',   value: deal.developer || deal.property_name || deal.unit_no || '' },
      { match: 'Property Value',    value: txAed(deal) ? String(Math.round(txAed(deal))) : '' },
      { match: 'Commission Rate',   value: deal.commission_pct ? String(deal.commission_pct) : '' },
      { match: 'Commission Amount', value: dealComm(deal) ? String(Math.round(dealComm(deal))) : '' },
    ];

    document.querySelectorAll('.form-group').forEach(function (g) {
      var label = g.querySelector('label');
      var input = g.querySelector('input');
      if (!label || !input) return;
      var text = (label.textContent || '').trim();
      fills.forEach(function (f) {
        if (text.includes(f.match) && f.value !== '') setReactInput(input, f.value);
      });
    });

    // Inject a read-only deal value banner below the Deal Reference field
    var old = document.getElementById('nd-deal-value-row');
    if (old) old.remove();

    var txVal = txAed(deal);
    if (!txVal) return;

    var dealGroup = null;
    document.querySelectorAll('.form-group label').forEach(function (l) {
      if (!dealGroup && (l.textContent || '').includes('Deal Reference')) {
        dealGroup = l.closest('.form-group');
      }
    });
    if (!dealGroup) return;

    var commPct = parseFloat(deal.commission_pct) || 0;
    var commAed = Math.round(txVal * commPct / 100);

    var row = document.createElement('div');
    row.id = 'nd-deal-value-row';
    row.style.cssText = [
      'margin-top:6px;padding:10px 14px;background:#f0fdf4',
      'border:1px solid #bbf7d0;border-radius:8px',
      'font-size:12px;color:#166534;display:flex;justify-content:space-between;align-items:center;gap:16px'
    ].join(';');
    row.innerHTML =
      '<div>' +
        '<div style="font-weight:700;font-size:13px">Deal Value (from accounting)</div>' +
        '<div style="margin-top:2px;color:#15803d">' +
          (commPct ? 'Company commission at ' + commPct + '%: <strong>' + fmtAed(commAed) + '</strong>' : 'No commission % on record') +
        '</div>' +
      '</div>' +
      '<div style="font-weight:800;font-size:16px;white-space:nowrap">' + fmtAed(txVal) + '</div>';

    dealGroup.insertAdjacentElement('afterend', row);
  }

  function showDealPicker(anchor, deals, showAll, onPick) {
    // Support old 3-arg call signature
    if (typeof showAll === 'function') { onPick = showAll; showAll = false; }

    var old = document.getElementById('nd-deal-picker');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'nd-deal-picker';
    box.style.cssText = [
      'position:fixed;z-index:100000;background:#fff;border-radius:12px',
      'box-shadow:0 8px 40px rgba(0,0,0,0.2);border:1px solid #e2e8f0',
      'width:480px;max-height:480px;overflow:hidden;display:flex;flex-direction:column'
    ].join(';');

    var r = anchor.getBoundingClientRect();
    box.style.top = Math.min(r.bottom + 8, window.innerHeight - 500) + 'px';
    box.style.left = Math.min(r.left, window.innerWidth - 500) + 'px';

    function buildRow(d) {
      var comm = dealComm(d);
      var dealLink = ACCT_APP_URL + '/#/deals?id=' + d._id;
      return '<div class="nd-deal-row" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer" data-id="' + d._id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              escapeHtml(d.property_name || d.unit_no || '-') + ' <a href="' + dealLink + '" target="_blank" style="font-size:10px;text-decoration:none" title="Open in Accounting">Open</a></div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:2px">' +
              escapeHtml(d.client_name || '') +
              (d.created_at ? ' &nbsp;-&nbsp; ' + escapeHtml(d.created_at) : '') +
              (showAll && d.broker_id ? ' &nbsp;-&nbsp; <span style="color:#3b82f6;font-weight:700">' + escapeHtml(d.broker_id) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;flex-shrink:0">' +
            '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px">' + fmtAed(comm) + '</div>' +
            badge(d.stage) +
          '</div>' +
        '</div>' +
      '</div>';
    }

    function renderRows(q) {
      var list = q
        ? deals.filter(function (d) {
            var lq = q.toLowerCase();
            return (d.property_name || '').toLowerCase().includes(lq) ||
                   (d.client_name || '').toLowerCase().includes(lq) ||
                   (d.broker_id || '').toLowerCase().includes(lq) ||
                   (d.unit_no || '').toLowerCase().includes(lq);
          })
        : deals;
      if (!list.length) {
        return '<div style="padding:28px;text-align:center;color:#94a3b8;font-size:13px">No collected or earned deals match your search</div>';
      }
      return list.map(buildRow).join('');
    }

    var searchHint = showAll ? 'Search by property, client, or broker ID…' : 'Search by property or client…';

    box.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">' +
        '<span style="font-size:13px;font-weight:700;color:#0f172a">Select Commission Deal' +
          (showAll ? ' <span style="font-size:11px;font-weight:400;color:#94a3b8">(all brokers)</span>' : '') +
        '</span>' +
        '<button id="nd-picker-close" type="button" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;padding:0">✕</button>' +
      '</div>' +
      '<div style="padding:8px 12px;border-bottom:1px solid #f1f5f9;flex-shrink:0">' +
        '<input id="nd-deal-search" placeholder="' + searchHint + '" autocomplete="off" ' +
          'style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;box-sizing:border-box;outline:none">' +
      '</div>' +
      '<div id="nd-deal-list" style="overflow-y:auto;flex:1">' + renderRows('') + '</div>';

    document.body.appendChild(box);

    function wireRows() {
      box.querySelectorAll('.nd-deal-row').forEach(function (row) {
        row.addEventListener('mouseenter', function () { row.style.background = '#f8fafc'; });
        row.addEventListener('mouseleave', function () { row.style.background = ''; });
        row.addEventListener('click', function () {
          var deal = deals.find(function (d) { return d._id === row.getAttribute('data-id'); });
          if (deal) { onPick(deal); box.remove(); }
        });
      });
    }
    wireRows();

    var searchEl = box.querySelector('#nd-deal-search');
    var listEl = box.querySelector('#nd-deal-list');
    searchEl.addEventListener('input', function () {
      listEl.innerHTML = renderRows(searchEl.value.trim());
      wireRows();
    });
    searchEl.focus();

    document.getElementById('nd-picker-close').addEventListener('click', function () { box.remove(); });

    setTimeout(function () {
      document.addEventListener('click', function close(e) {
        if (!box.contains(e.target) && e.target !== anchor) {
          box.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 100);
  }

  // ── BROKER PERFORMANCE CARD ───────────────────────────────────────────────────
  // Injected below the last card on the employee detail page.

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  async function injectPerfCard() {
    // Employee detail is identified by the "← Employees" back button
    var backBtn = null;
    document.querySelectorAll('button').forEach(function (b) {
      if ((b.textContent || '').trim() === '← Employees') backBtn = b;
    });
    if (!backBtn) return;
    if (document.getElementById('nd-perf-card')) return;

    // Employee name is the last non-'/' span in the breadcrumb
    var empName = null;
    var par = backBtn.parentElement;
    if (par) {
      par.querySelectorAll('span').forEach(function (s) {
        var t = (s.textContent || '').trim();
        if (t && t !== '/' && t.length > 1) empName = t;
      });
    }
    if (!empName) return;

    var emp = await empByName(empName);
    if (!emp) return;
    var empId = emp.id;

    var cards = document.querySelectorAll('.card');
    var anchor = cards[cards.length - 1];
    if (!anchor) return;

    var card = document.createElement('div');
    card.id = 'nd-perf-card';
    card.className = 'card';
    card.style.marginTop = '16px';

    var brokerId = await brokerIdFor(empId);
    if (!brokerId) {
      card.innerHTML = buildLinkCard(empId);
      anchor.insertAdjacentElement('afterend', card);
      return;
    }

    card.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">Loading broker performance…</div>';
    anchor.insertAdjacentElement('afterend', card);

    var now = new Date();
    var yr = now.getFullYear();
    var mo = now.getMonth() + 1;

    var results = await Promise.all([
      fetchDeals(brokerId, mo, yr),
      fetchDealsYTD(brokerId, yr),
      getTarget(empId, yr, mo)
    ]);

    card.innerHTML = buildPerfCard(empId, brokerId, results[0], results[1], results[2], mo, yr);
    wireTargetBtns(card, empId, yr, mo);
    addStatementBtn(card, empId, mo, yr);
  }

  function buildPerfCard(empId, brokerId, monthDeals, ytdDeals, target, mo, yr) {
    var collectedMonthDeals = monthDeals.filter(isCollected);
    var collectedYtdDeals = ytdDeals.filter(isCollected);
    var moCollected = collectedMonthDeals.reduce(function (s, d) { return s + dealComm(d); }, 0);
    var ytdCollected = collectedYtdDeals.reduce(function (s, d) { return s + dealComm(d); }, 0);
    var tPct = target ? Math.min(100, Math.round(moCollected / target * 100)) : null;
    var tColor = tPct === null ? '#94a3b8' : tPct >= 100 ? '#22c55e' : tPct >= 70 ? '#f59e0b' : '#ef4444';

    var dealRows = collectedMonthDeals.slice(0, 6).map(function (d) {
      var dealLink = ACCT_APP_URL + '/#/deals?id=' + d._id;
      return '<tr>' +
        '<td style="padding:5px 8px;font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          '<a href="' + dealLink + '" target="_blank" style="color:inherit;text-decoration:none;border-bottom:1px dotted #94a3b8" title="View in Accounting">' +
          (d.property_name || d.unit_no || '—') + '</a></td>' +
        '<td style="padding:5px 8px">' + badge(d.stage) + '</td>' +
        '<td style="padding:5px 8px;font-size:12px;font-weight:700;text-align:right">' + fmtAed(dealComm(d)) + '</td>' +
      '</tr>';
    }).join('');

    return [
      '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:12px 18px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">',
        '<div style="color:#f8fafc;font-size:13px;font-weight:700">📊 Broker Performance</div>',
        '<div style="font-size:11px;color:#94a3b8">' + MONTHS[mo - 1] + ' ' + yr +
          ' &nbsp;·&nbsp; <span style="color:#60a5fa">' + brokerId + '</span></div>',
      '</div>',

      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#e2e8f0">',
        statCell('Month Deals', collectedMonthDeals.length, '#60a5fa'),
        statCell('Month Collected', fmtAed(moCollected), '#22c55e'),
        statCell('YTD Deals', collectedYtdDeals.length, '#a78bfa'),
        statCell('YTD Collected', fmtAed(ytdCollected), '#f59e0b'),
      '</div>',

      '<div style="padding:12px 18px;border-top:1px solid #e2e8f0">',
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">',
          '<span style="font-size:12px;font-weight:600;color:#0f172a">Monthly Target</span>',
          target
            ? '<div style="display:flex;align-items:center;gap:8px">' +
                '<span style="font-size:11px;color:#64748b">' + fmtAed(target) + '</span>' +
                '<button type="button" class="nd-target-btn" data-empid="' + empId + '" ' +
                  'style="font-size:10px;padding:2px 6px;border-radius:4px;border:1px solid #e2e8f0;background:none;cursor:pointer;color:#64748b">Edit</button>' +
              '</div>'
            : '<button type="button" class="nd-target-btn" data-empid="' + empId + '" ' +
                'style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #3b82f6;background:none;color:#3b82f6;cursor:pointer;font-weight:600">+ Set Target</button>',
        '</div>',
        target
          ? '<div style="height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden">' +
              '<div style="height:100%;width:' + tPct + '%;background:' + tColor + ';border-radius:4px"></div>' +
            '</div>' +
            '<div style="font-size:11px;color:#64748b;margin-top:4px">' +
              tPct + '% of target · ' + fmtAed(moCollected) + ' collected this month' +
            '</div>'
          : '<div style="font-size:11px;color:#94a3b8">No target set — click to define a monthly goal</div>',
      '</div>',

      '<div style="padding:10px 18px 16px;border-top:1px solid #e2e8f0">',
        '<div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Commission collected deals this month</div>',
        collectedMonthDeals.length
          ? '<table style="width:100%;border-collapse:collapse">' +
              '<thead><tr>' +
                '<th style="text-align:left;font-size:10px;color:#94a3b8;padding:0 8px 5px;font-weight:600">Property</th>' +
                '<th style="text-align:left;font-size:10px;color:#94a3b8;padding:0 8px 5px;font-weight:600">Stage</th>' +
                '<th style="text-align:right;font-size:10px;color:#94a3b8;padding:0 8px 5px;font-weight:600">Commission</th>' +
              '</tr></thead>' +
              '<tbody>' + dealRows + '</tbody>' +
            '</table>'
          : '<div style="color:#94a3b8;font-size:12px">No commission collected deals this month.</div>',
      '</div>',
    ].join('');
  }

  function buildLinkCard(empId) {
    return '<div style="padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px">' +
      '<div>' +
        '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px">📊 Broker Performance</div>' +
        '<div style="font-size:12px;color:#64748b">Link this employee to their accounting broker ID (e.g. BR001) to see live deal data</div>' +
      '</div>' +
      '<button type="button" class="nd-link-btn" data-empid="' + empId + '" ' +
        'style="white-space:nowrap;padding:7px 14px;border-radius:8px;border:1px solid #3b82f6;background:none;color:#3b82f6;cursor:pointer;font-weight:600;font-size:12px">' +
        'Link Broker ID' +
      '</button>' +
    '</div>';
  }

  function wireTargetBtns(card, empId, yr, mo) {
    card.querySelectorAll('.nd-target-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var input = prompt('Monthly commission target for ' + MONTHS[mo - 1] + ' ' + yr + ' (AED):');
        if (input === null) return;
        var n = parseFloat(String(input).replace(/,/g, ''));
        if (!n || n <= 0) { alert('Enter a valid positive AED amount.'); return; }
        saveTarget(empId, yr, mo, n).then(function () {
          var old = document.getElementById('nd-perf-card');
          if (old) old.remove();
          setTimeout(injectPerfCard, 300);
        });
      });
    });
  }

  // ── BROKER LEADERBOARD ───────────────────────────────────────────────────────
  // Injected on the Employees list page — ranks all linked brokers by YTD collected commission.

  async function injectLeaderboard() {
    if (!acctDb) return;

    // Only on the Employees LIST page (not the detail page)
    var pageTitle = document.querySelector('.page-title');
    if (!pageTitle) { leaderboardDone = false; return; }
    var titleText = (pageTitle.textContent || '').trim().replace(/^[^A-Za-z]*/, '').trim();
    if (titleText.toLowerCase() !== 'employees') { leaderboardDone = false; return; }
    var hasBack = false;
    document.querySelectorAll('button').forEach(function (b) {
      if ((b.textContent || '').trim() === '← Employees') hasBack = true;
    });
    if (hasBack) { leaderboardDone = false; return; }
    if (document.getElementById('nd-leaderboard')) return;
    if (leaderboardDone) return;
    leaderboardDone = true;

    // Find injection anchor — after the title's immediate parent row / header
    var anchor = pageTitle.closest('[class]') || pageTitle.parentElement;
    if (!anchor) { leaderboardDone = false; return; }

    var wrap = document.createElement('div');
    wrap.id = 'nd-leaderboard';
    wrap.style.cssText = 'margin:0 0 20px;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;background:#fff';
    wrap.innerHTML = '<div style="padding:16px;text-align:center;color:#94a3b8;font-size:13px">Loading broker rankings…</div>';
    anchor.insertAdjacentElement('afterend', wrap);

    // Load broker links
    var db = hrDb();
    if (!db) { wrap.remove(); leaderboardDone = false; return; }
    var linksSnap = await db.ref(HR_ROOT + '/broker_links').once('value');
    var links = linksSnap.val() || {};
    var empIds = Object.keys(links);
    if (!empIds.length) {
      wrap.innerHTML = buildLeaderboard([], new Date().getFullYear(), new Date().getMonth() + 1);
      return;
    }

    var emps = await loadEmps();
    var empById = {};
    emps.forEach(function (e) { if (e.id) empById[e.id] = e; });

    var now = new Date();
    var yr = now.getFullYear();
    var mo = now.getMonth() + 1;

    var rows = await Promise.all(empIds.map(async function (empId) {
      var brokerId = links[empId] && links[empId].brokerAcctId;
      var emp = empById[empId];
      if (!brokerId || !emp) return null;
      try {
        var ytd = (await fetchDealsYTD(brokerId, yr)).filter(isCollected);
        var mon = (await fetchDeals(brokerId, mo, yr)).filter(isCollected);
        return {
          name:        emp.name,
          brokerId:    brokerId,
          ytdCollected: ytd.reduce(function (s, d) { return s + dealComm(d); }, 0),
          moCollected:  mon.reduce(function (s, d) { return s + dealComm(d); }, 0),
          pipeline:     0,
          deals:        ytd.length,
        };
      } catch (e) { return null; }
    }));

    var sorted = rows.filter(Boolean).sort(function (a, b) { return b.ytdCollected - a.ytdCollected; });
    wrap.innerHTML = buildLeaderboard(sorted, yr, mo);
  }

  function buildLeaderboard(rows, yr, mo) {
    var medals = ['🥇', '🥈', '🥉'];
    var moLabel = MONTHS[mo - 1] + ' ' + yr;

    var tableRows = rows.length
      ? rows.map(function (r, i) {
          return '<tr style="border-top:1px solid #f1f5f9">' +
            '<td style="padding:8px 12px;font-size:14px;width:32px">' +
              (medals[i] || '<span style="color:#94a3b8;font-size:11px;font-weight:700">#' + (i + 1) + '</span>') +
            '</td>' +
            '<td style="padding:8px 6px">' +
              '<div style="font-size:13px;font-weight:600;color:#0f172a">' + r.name + '</div>' +
              '<div style="font-size:10px;color:#94a3b8">' + r.brokerId + ' &nbsp;·&nbsp; ' + r.deals + ' collected deals</div>' +
            '</td>' +
            '<td style="padding:8px 12px;font-size:12px;text-align:right;color:#f59e0b;font-weight:600">' + fmtAed(r.moCollected) + '</td>' +
            '<td style="padding:8px 12px;font-size:12px;text-align:right;color:#22c55e;font-weight:700">' + fmtAed(r.ytdCollected) + '</td>' +
            '<td style="padding:8px 12px;font-size:12px;text-align:right;color:#60a5fa;font-weight:600">' + r.deals + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="5" style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">No brokers linked yet — link broker IDs from employee detail pages</td></tr>';

    return [
      '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:12px 18px;display:flex;align-items:center;justify-content:space-between">',
        '<div style="color:#f8fafc;font-size:13px;font-weight:700">🏆 Broker Leaderboard</div>',
        '<div style="font-size:11px;color:#94a3b8">' + moLabel + ' &nbsp;·&nbsp; YTD ' + yr + '</div>',
      '</div>',
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">',
        '<thead><tr style="background:#f8fafc">',
          '<th style="padding:6px 12px;font-size:10px;color:#94a3b8;font-weight:600;text-align:left;width:32px"></th>',
          '<th style="padding:6px 6px;font-size:10px;color:#94a3b8;font-weight:600;text-align:left">BROKER</th>',
          '<th style="padding:6px 12px;font-size:10px;color:#94a3b8;font-weight:600;text-align:right">THIS MONTH</th>',
          '<th style="padding:6px 12px;font-size:10px;color:#94a3b8;font-weight:600;text-align:right">YTD COLLECTED</th>',
          '<th style="padding:6px 12px;font-size:10px;color:#94a3b8;font-weight:600;text-align:right">COLLECTED DEALS</th>',
        '</tr></thead>',
        '<tbody>' + tableRows + '</tbody>',
      '</table></div>',
    ].join('');
  }

  // ── COMMISSION STATEMENT ─────────────────────────────────────────────────────
  // "Statement" button on the performance card → popup showing HR commission records.

  function addStatementBtn(card, empId, mo, yr) {
    var header = card.firstElementChild;
    if (!header || card.querySelector('.nd-stmt-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nd-stmt-btn';
    btn.style.cssText = 'font-size:10px;padding:2px 9px;border-radius:5px;border:1px solid #94a3b8;background:none;color:#94a3b8;cursor:pointer';
    btn.textContent = 'Statement';
    header.appendChild(btn);
    btn.addEventListener('click', async function () {
      btn.textContent = 'Loading…';
      var comms = await queryMonthComms(empId, mo, yr);
      btn.textContent = 'Statement';
      showCommStatement(comms, mo, yr);
    });
  }

  function showCommStatement(comms, mo, yr) {
    var old = document.getElementById('nd-stmt-popup');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'nd-stmt-popup';
    box.style.cssText = [
      'position:fixed;z-index:100001;background:#fff;border-radius:12px',
      'box-shadow:0 8px 40px rgba(0,0,0,.25);border:1px solid #e2e8f0',
      'width:520px;max-height:80vh;top:50%;left:50%;transform:translate(-50%,-50%)',
      'overflow:hidden;display:flex;flex-direction:column'
    ].join(';');

    var total = comms.reduce(function (s, c) { return s + (c.amount || 0); }, 0);
    var paid  = comms.filter(function (c) { return c.status === 'paid'; })
                     .reduce(function (s, c) { return s + (c.amount || 0); }, 0);

    var STATUS_COLOR = { paid: '#22c55e', approved: '#3b82f6', settled: '#a78bfa',
                         under_review: '#f59e0b', pending: '#94a3b8' };

    var rows = comms.length
      ? comms.map(function (c) {
          var sc = STATUS_COLOR[c.status] || '#94a3b8';
          var dealText = c.deal || '—';
          var dealIdMatch = dealText.match(/\[([^\]]+)\]/);
          var dealCell = dealText;
          if (dealIdMatch) {
            var dealLink = ACCT_APP_URL + '/#/deals?id=' + dealIdMatch[1];
            dealCell = '<a href="' + dealLink + '" target="_blank" style="color:inherit;text-decoration:none;border-bottom:1px dotted #94a3b8" title="View in Accounting">' + dealText + '</a>';
          }
          return '<tr style="border-top:1px solid #f1f5f9">' +
            '<td style="padding:7px 10px;font-size:12px;color:#0f172a;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + dealCell + '</td>' +
            '<td style="padding:7px 10px;font-size:12px;color:#64748b">' + (c.client || '—') + '</td>' +
            '<td style="padding:7px 10px;font-size:12px;text-align:right;font-weight:700">' + fmtAed(c.amount || 0) + '</td>' +
            '<td style="padding:7px 10px;text-align:center">' +
              '<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;' +
                'background:' + sc + '20;color:' + sc + '">' + (c.status || '—') + '</span>' +
            '</td>' +
            '<td style="padding:7px 10px;font-size:11px;color:#94a3b8">' + (c.txDate || c.paidDate || '—') + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">No commission records for this month</td></tr>';

    box.innerHTML =
      '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:12px 18px;' +
          'display:flex;align-items:center;justify-content:space-between;flex-shrink:0">' +
        '<div style="color:#f8fafc;font-size:13px;font-weight:700">Commission Statement &nbsp;·&nbsp; ' + MONTHS[mo - 1] + ' ' + yr + '</div>' +
        '<button id="nd-stmt-close" type="button" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:18px;padding:0">✕</button>' +
      '</div>' +
      '<div style="overflow-y:auto;flex:1">' +
        '<table style="width:100%;border-collapse:collapse">' +
          '<thead><tr style="background:#f8fafc">' +
            '<th style="padding:6px 10px;font-size:10px;color:#94a3b8;font-weight:600;text-align:left">DEAL</th>' +
            '<th style="padding:6px 10px;font-size:10px;color:#94a3b8;font-weight:600;text-align:left">CLIENT</th>' +
            '<th style="padding:6px 10px;font-size:10px;color:#94a3b8;font-weight:600;text-align:right">AMOUNT</th>' +
            '<th style="padding:6px 10px;font-size:10px;color:#94a3b8;font-weight:600;text-align:center">STATUS</th>' +
            '<th style="padding:6px 10px;font-size:10px;color:#94a3b8;font-weight:600;text-align:left">DATE</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="padding:10px 14px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;' +
          'align-items:center;flex-shrink:0;background:#f8fafc">' +
        '<div style="font-size:11px;color:#64748b">' + comms.length + ' record(s)</div>' +
        '<div style="font-size:12px">' +
          '<span style="color:#64748b;margin-right:14px">Paid: <strong style="color:#22c55e">' + fmtAed(paid) + '</strong></span>' +
          '<span style="color:#0f172a;font-weight:700">Total: ' + fmtAed(total) + '</span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(box);
    box.querySelector('#nd-stmt-close').addEventListener('click', function () { box.remove(); });
    setTimeout(function () {
      document.addEventListener('click', function close(e) {
        if (!box.contains(e.target)) { box.remove(); document.removeEventListener('click', close); }
      });
    }, 100);
  }

  // ── PAYROLL AUTO-HINT ─────────────────────────────────────────────────────────
  // When the payroll form is open, queries approved commissions for that employee/month
  // and injects a one-click "Use this" hint next to the bonus/commission field.

  async function injectPayrollHint() {
    // Detect payroll form by looking for Basic + Transport labels together
    var labels = document.querySelectorAll('.form-group label');
    var hasBasic = false, hasTrans = false;
    labels.forEach(function (l) {
      var t = (l.textContent || '').toLowerCase();
      if (t.includes('basic'))     hasBasic = true;
      if (t.includes('transport')) hasTrans = true;
    });
    if (!hasBasic || !hasTrans) { payrollFormDone = false; return; }
    if (payrollFormDone || document.getElementById('nd-payroll-hint')) { payrollFormDone = true; return; }

    // Find the employee/broker select
    var empSelect = null;
    document.querySelectorAll('.form-group').forEach(function (g) {
      if (empSelect) return;
      var lbl = g.querySelector('label');
      if (!lbl) return;
      var t = (lbl.textContent || '').toLowerCase();
      if (t.includes('employee') || t.includes('broker')) empSelect = g.querySelector('select');
    });
    if (!empSelect || !empSelect.value) return;

    // Find month from any date/month/period input
    var monthStr = null;
    document.querySelectorAll('.form-group').forEach(function (g) {
      if (monthStr) return;
      var lbl = g.querySelector('label');
      var inp = g.querySelector('input');
      if (!lbl || !inp) return;
      var t = (lbl.textContent || '').toLowerCase();
      if (t.includes('month') || t.includes('period') || t.includes('date')) monthStr = inp.value;
    });

    var now = new Date();
    var yr = now.getFullYear(), mo = now.getMonth() + 1;
    if (monthStr) {
      var parts = monthStr.split('-');
      if (parts[0]) yr = parseInt(parts[0]) || yr;
      if (parts[1]) mo = parseInt(parts[1]) || mo;
    }

    payrollFormDone = true;
    var empId = empSelect.value;
    var comms = await queryMonthComms(empId, mo, yr);
    var approved = comms.filter(function (c) {
      var s = (c.status || '').toLowerCase();
      return s === 'paid' || s === 'approved' || s === 'settled';
    });
    if (!approved.length) return;

    var total = approved.reduce(function (s, c) { return s + (c.amount || 0); }, 0);

    // Find the bonus / commission field
    var bonusGroup = null;
    labels.forEach(function (l) {
      if (bonusGroup) return;
      var t = (l.textContent || '').toLowerCase();
      if (t.includes('commission') || t.includes('bonus')) bonusGroup = l.closest('.form-group');
    });
    if (!bonusGroup) return;

    var hint = document.createElement('div');
    hint.id = 'nd-payroll-hint';
    hint.style.cssText = [
      'margin-top:6px;padding:8px 12px;background:#eff6ff',
      'border:1px solid #bfdbfe;border-radius:8px',
      'display:flex;align-items:center;justify-content:space-between;gap:10px'
    ].join(';');
    hint.innerHTML =
      '<div>' +
        '<div style="font-size:11px;font-weight:700;color:#1d4ed8">⚡ ' + approved.length + ' approved commission(s) found</div>' +
        '<div style="font-size:11px;color:#3b82f6">' + MONTHS[mo - 1] + ' ' + yr + ' total: <strong>' + fmtAed(total) + '</strong></div>' +
      '</div>' +
      '<button type="button" id="nd-payroll-use" style="padding:5px 12px;border-radius:6px;border:none;' +
        'background:#3b82f6;color:#fff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">↑ Use this</button>';

    bonusGroup.appendChild(hint);

    hint.querySelector('#nd-payroll-use').addEventListener('click', function () {
      var input = bonusGroup.querySelector('input');
      if (!input) return;
      // Use React fiber setter (same pattern as fillCommForm)
      var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, String(total));
      var fiberKey = Object.keys(input).find(function (k) {
        return k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance');
      });
      if (fiberKey) {
        var props = input[fiberKey] && input[fiberKey].memoizedProps;
        if (props && typeof props.onChange === 'function') {
          props.onChange({ target: input, currentTarget: input, type: 'change', bubbles: true,
                           preventDefault: function () {}, stopPropagation: function () {} });
        }
      }
      hint.innerHTML = '<div style="font-size:11px;color:#22c55e;font-weight:700">✓ Commission amount applied — ' + fmtAed(total) + '</div>';
    });
  }

  // ── LINK POPUP ────────────────────────────────────────────────────────────────
  function showLinkPopup(empId, anchor) {
    var old = document.getElementById('nd-link-popup');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'nd-link-popup';
    box.style.cssText = [
      'position:fixed;z-index:100000;background:#fff;border-radius:12px',
      'box-shadow:0 8px 40px rgba(0,0,0,0.2);border:1px solid #e2e8f0;padding:20px;width:300px'
    ].join(';');

    var r = anchor ? anchor.getBoundingClientRect() : { bottom: 200, left: 200 };
    box.style.top = Math.min(r.bottom + 8, window.innerHeight - 200) + 'px';
    box.style.left = Math.min(r.left, window.innerWidth - 320) + 'px';

    box.innerHTML =
      '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:6px">Link Broker ID</div>' +
      '<div style="font-size:12px;color:#64748b;margin-bottom:12px">Enter this employee\'s broker ID from the accounting system (e.g. BR001)</div>' +
      '<input id="nd-bid-input" placeholder="BR001" autocomplete="off" ' +
        'style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none">' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button id="nd-lid-cancel" type="button" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e2e8f0;background:none;cursor:pointer;font-size:12px">Cancel</button>' +
        '<button id="nd-lid-save" type="button" style="flex:1;padding:8px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:12px;font-weight:700">Link</button>' +
      '</div>';

    document.body.appendChild(box);
    box.querySelector('#nd-lid-cancel').addEventListener('click', function () { box.remove(); });
    box.querySelector('#nd-lid-save').addEventListener('click', async function () {
      var val = (box.querySelector('#nd-bid-input').value || '').trim().toUpperCase();
      if (!val.match(/^BR\d+$/)) { alert('Enter a valid broker ID like BR001'); return; }
      await saveLink(empId, val);
      box.remove();
      var old = document.getElementById('nd-perf-card');
      if (old) old.remove();
      setTimeout(injectPerfCard, 400);
    });
    box.querySelector('#nd-bid-input').focus();

    setTimeout(function () {
      document.addEventListener('click', function close(e) {
        if (!box.contains(e.target) && e.target !== anchor) {
          box.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 100);
  }

  // ── CLICK DELEGATION ──────────────────────────────────────────────────────────
  // -- HR SYNC REPAIR ----------------------------------------------------------
  // Links an existing HR commission to an accounting deal without changing money,
  // payment, payroll, or deal-stage data.

  function getDealPageYear() {
    var values = Array.from(document.querySelectorAll('select')).map(function (sel) {
      return String(sel.value || '');
    });
    var found = values.find(function (value) { return /^20\d{2}$/.test(value); });
    if (found) return parseInt(found, 10);
    var text = document.body ? document.body.innerText || '' : '';
    var years = text.match(/\b20\d{2}\b/g);
    return years && years.length ? parseInt(years[0], 10) : new Date().getFullYear();
  }

  function dealRowScore(row, deal) {
    var text = normText(row.innerText || '');
    var score = 0;
    [
      [deal.property_name, 30],
      [deal.unit_no, 24],
      [deal.client_name, 26],
      [deal.broker_id, 22],
      [deal.created_at, 18],
      [deal.developer, 10]
    ].forEach(function (pair) {
      var value = normText(pair[0]);
      if (value && text.indexOf(value) !== -1) score += pair[1];
    });
    var comm = Math.round(dealComm(deal));
    if (comm && text.indexOf(String(comm)) !== -1) score += 12;
    if (normText(deal.stage) === 'commission collected' && text.indexOf('missing') !== -1) score += 8;
    return score;
  }

  function findDealForMissingRow(row, deals, linkedIds) {
    var best = null;
    var bestScore = 0;
    deals.forEach(function (deal) {
      if (!deal._id || linkedIds.has(deal._id)) return;
      var score = dealRowScore(row, deal);
      if (score > bestScore) {
        best = deal;
        bestScore = score;
      }
    });
    return bestScore >= 45 ? best : null;
  }

  function isDealsPage() {
    var title = document.querySelector('.page-title');
    if (title && /deals/i.test(title.textContent || '')) return true;
    var text = document.body ? document.body.innerText || '' : '';
    return /HR Sync/i.test(text) && /Commission Collected/i.test(text);
  }

  async function injectDealSyncActions() {
    if (!isDealsPage()) return;
    if (!acctDb || dealSyncBusy) return;

    var rows = Array.from(document.querySelectorAll('tbody tr')).filter(function (row) {
      return /missing/i.test(row.innerText || '') && !row.querySelector('.nd-sync-link-btn');
    });
    if (!rows.length) return;

    dealSyncBusy = true;
    try {
      var year = getDealPageYear();
      var deals = (await fetchAllDealsYTD(year)).filter(isCollected);
      var linked = await linkedDealIdsFromHr();

      rows.forEach(function (row) {
        var deal = findDealForMissingRow(row, deals, linked);
        if (!deal) return;
        var cell = row.cells && row.cells.length ? row.cells[row.cells.length - 1] : null;
        if (!cell || cell.querySelector('.nd-sync-link-btn')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nd-sync-link-btn';
        btn.setAttribute('data-dealid', deal._id);
        btn.style.cssText = [
          'margin-top:6px;padding:4px 8px;border:1px solid #f59e0b',
          'background:#fffbeb;color:#92400e;border-radius:6px',
          'font-size:10px;font-weight:800;cursor:pointer;display:block'
        ].join(';');
        btn.textContent = 'Link paid commission';
        btn._nasamaDeal = deal;
        cell.appendChild(btn);
      });
    } catch (e) {
      console.warn('[NasamaDeals] injectDealSyncActions:', e.message);
    } finally {
      dealSyncBusy = false;
    }
  }

  async function injectDealSyncPanel() {
    var old = document.getElementById('nd-sync-panel');
    if (!isDealsPage()) {
      if (old) old.remove();
      return;
    }
    if (old || !acctDb) return;

    var host = document.querySelector('.content') || document.querySelector('main') || document.body;
    var panel = document.createElement('div');
    panel.id = 'nd-sync-panel';
    panel.style.cssText = [
      'margin:0 0 14px;padding:12px 14px;border:1px solid #fde68a',
      'background:#fffbeb;border-radius:8px;color:#78350f'
    ].join(';');
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">' +
        '<div>' +
          '<div style="font-size:13px;font-weight:900">HR Sync Repair</div>' +
          '<div id="nd-sync-panel-status" style="font-size:11px;margin-top:2px;color:#92400e">Checking commission collected deals with missing HR links...</div>' +
        '</div>' +
        '<button id="nd-sync-refresh" type="button" style="padding:6px 10px;border:1px solid #f59e0b;background:#fff7ed;color:#92400e;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer">Refresh</button>' +
      '</div>' +
      '<div id="nd-sync-panel-list" style="margin-top:10px;max-height:420px;overflow-y:auto"></div>';
    host.insertBefore(panel, host.firstChild);

    async function render() {
      var status = panel.querySelector('#nd-sync-panel-status');
      var list = panel.querySelector('#nd-sync-panel-list');
      status.textContent = 'Checking commission collected deals with missing HR links...';
      list.innerHTML = '';
      try {
        var missing = await detectCommissionGaps();
        if (!missing.length) {
          status.textContent = 'No missing HR links found for commission collected deals this year.';
          return;
        }
        status.textContent = missing.length + ' commission collected deal(s) need an HR commission link.';
        list.innerHTML = missing.map(function (deal) {
          return '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #fde68a;padding:8px 0">' +
            '<div style="min-width:0">' +
              '<div style="font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
                escapeHtml(getDealLabel(deal)) + '</div>' +
              '<div style="font-size:11px;color:#92400e">' +
                escapeHtml(deal.client_name || '') + ' - ' + escapeHtml(deal.broker_id || '') + ' - ' + fmtAed(dealComm(deal)) +
              '</div>' +
            '</div>' +
            '<button class="nd-sync-panel-btn" data-dealid="' + escapeHtml(deal._id) + '" type="button" style="flex-shrink:0;padding:5px 9px;border:1px solid #f59e0b;background:#fff;color:#92400e;border-radius:6px;font-size:10px;font-weight:800;cursor:pointer">Link paid commission</button>' +
          '</div>';
        }).join('');
        list.querySelectorAll('.nd-sync-panel-btn').forEach(function (btn) {
          var deal = missing.find(function (d) { return d._id === btn.getAttribute('data-dealid'); });
          btn._nasamaDeal = deal;
        });
      } catch (e) {
        status.textContent = 'Could not check missing HR links: ' + e.message;
      }
    }

    panel.querySelector('#nd-sync-refresh').addEventListener('click', function () {
      dealsCache = {};
      render();
    });
    render();
  }

  function commissionAmount(comm) {
    return parseMoney(
      comm.commissionAmount != null ? comm.commissionAmount :
      comm.amount != null ? comm.amount :
      comm.commission != null ? comm.commission :
      comm.bonus != null ? comm.bonus :
      comm.total != null ? comm.total : ''
    );
  }

  function employeeIdForDeal(deal, links) {
    var brokerId = String(deal.broker_id || '');
    if (!brokerId) return '';
    return Object.keys(links || {}).find(function (empId) {
      return links[empId] && String(links[empId].brokerAcctId || '') === brokerId;
    }) || '';
  }

  function scoreCommissionCandidate(comm, deal, empId) {
    var score = 0;
    var notes = [];
    var commEmp = String(comm.employeeId || comm.empId || comm.employee || '');
    if (empId && commEmp === empId) { score += 50; notes.push('employee'); }

    var target = dealComm(deal);
    var amount = commissionAmount(comm);
    if (target && amount) {
      var diff = Math.abs(target - amount);
      var tolerance = Math.max(5, target * 0.02);
      if (diff <= tolerance) { score += 35; notes.push('amount'); }
      else if (diff <= Math.max(50, target * 0.08)) { score += 15; notes.push('near amount'); }
    }

    var dealText = normText((comm.deal || '') + ' ' + (comm.clientName || '') + ' ' + (comm.property || ''));
    var client = normText(deal.client_name);
    var property = normText((deal.property_name || '') + ' ' + (deal.unit_no || ''));
    if (client && dealText.indexOf(client) !== -1) { score += 20; notes.push('client'); }
    if (property && property.split(' ').some(function (part) { return part.length > 2 && dealText.indexOf(part) !== -1; })) {
      score += 14;
      notes.push('property');
    }

    var commMonth = monthKey(comm.month || getCommissionDate(comm));
    var dealMonth = monthKey(deal.created_at);
    if (commMonth && dealMonth && commMonth === dealMonth) { score += 10; notes.push('month'); }
    if (isClosedCommission(comm)) { score += 8; notes.push('closed'); }

    return { score: score, notes: notes.join(', ') || 'manual review' };
  }

  async function commissionCandidatesForDeal(deal) {
    var links = await getLinks();
    var empId = employeeIdForDeal(deal, links);
    var list = await loadCommRecs();
    var unlinked = list.filter(function (comm) {
      var id = commLinkedDealId(comm);
      return !id || id === deal._id;
    });
    return unlinked.filter(isClosedCommission).map(function (comm) {
      var match = scoreCommissionCandidate(comm, deal, empId);
      return Object.assign({ _matchScore: match.score, _matchNotes: match.notes }, comm);
    }).sort(function (a, b) { return b._matchScore - a._matchScore; });
  }

  function commissionSearchText(comm) {
    return normText([
      comm.deal,
      comm.client,
      comm.clientName,
      comm.property,
      comm.employeeId,
      comm.empId,
      comm.employee,
      comm.status,
      comm.month,
      getCommissionDate(comm),
      commissionAmount(comm)
    ].join(' '));
  }

  async function saveExistingCommissionDealLink(comm, deal) {
    if (!comm || comm._key == null) throw new Error('Cannot locate the selected commission record.');
    var existingId = commLinkedDealId(comm);
    if (existingId && existingId !== deal._id) {
      throw new Error('This commission is already linked to another accounting deal.');
    }
    var db = hrDb();
    if (!db) throw new Error('HR database is not available.');

    var now = new Date().toISOString();
    var baseDeal = stripDealSuffix(comm.deal) || getDealLabel(deal);
    var update = {
      deal: baseDeal + ' [' + deal._id + ']',
      accountingDealId: deal._id,
      accountingDealRef: deal._id,
      accountingLinkedAt: now,
      accountingLinkSource: 'manual_hr_sync'
    };

    await db.ref(HR_ROOT + '/commRecs/' + comm._key).update(update);
    updateLocalCommRec(comm, update);
    await writeAuditEntry(
      'LINK_EXISTING_COMMISSION_TO_DEAL',
      'Linked existing HR commission ' + (comm.id || comm._id || comm._key) + ' to accounting deal ' + deal._id,
      comm.employeeId || comm.empId || ''
    );
  }

  function renderCommissionCandidate(comm) {
    var amount = commissionAmount(comm);
    var status = comm.status || 'unknown';
    var emp = comm.employeeId || comm.empId || comm.employee || '';
    return '<div class="nd-comm-row" data-key="' + escapeHtml(comm._key) + '" style="padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-size:12px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escapeHtml(stripDealSuffix(comm.deal) || 'Commission record') + '</div>' +
          '<div style="font-size:11px;color:#64748b;margin-top:2px">' +
            escapeHtml(emp) + ' - ' + escapeHtml(status) + ' - ' + escapeHtml(getCommissionDate(comm) || comm.month || '') +
          '</div>' +
          '<div style="font-size:10px;color:#64748b;margin-top:3px">Match: ' +
            escapeHtml(comm._matchNotes) + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          '<div style="font-size:12px;font-weight:800;color:#0f172a">' + fmtAed(amount) + '</div>' +
          '<div style="font-size:10px;color:#64748b">score ' + Math.round(comm._matchScore || 0) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  async function showCommissionLinkPicker(deal, anchor) {
    var old = document.getElementById('nd-comm-link-picker');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'nd-comm-link-picker';
    box.style.cssText = [
      'position:fixed;z-index:100001;background:#fff;border-radius:12px',
      'box-shadow:0 12px 44px rgba(15,23,42,0.22);border:1px solid #e2e8f0',
      'width:520px;max-height:560px;overflow:hidden;display:flex;flex-direction:column'
    ].join(';');
    var r = anchor.getBoundingClientRect();
    box.style.top = Math.min(r.bottom + 8, window.innerHeight - 570) + 'px';
    box.style.left = Math.min(r.left, window.innerWidth - 540) + 'px';
    box.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;gap:12px">' +
        '<div style="min-width:0">' +
          '<div style="font-size:13px;font-weight:900;color:#0f172a">Link Existing Paid Commission</div>' +
          '<div style="font-size:11px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
            escapeHtml(getDealLabel(deal)) + ' - ' + escapeHtml(deal.client_name || '') + ' - ' + fmtAed(dealComm(deal)) +
          '</div>' +
        '</div>' +
        '<button id="nd-comm-close" type="button" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;padding:0">x</button>' +
      '</div>' +
      '<div style="padding:10px 14px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:11px;color:#92400e;line-height:1.45">' +
        'This repair only adds the accounting deal reference to an existing HR commission. It does not change amount, status, payment date, or payroll records.' +
      '</div>' +
      '<div style="padding:8px 12px;border-bottom:1px solid #f1f5f9">' +
        '<input id="nd-comm-search" placeholder="Search all eligible commissions..." autocomplete="off" ' +
          'style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;box-sizing:border-box;outline:none">' +
      '</div>' +
      '<div id="nd-comm-list" style="overflow-y:auto;flex:1;padding:4px 0">' +
        '<div style="padding:28px;text-align:center;color:#64748b;font-size:13px">Loading existing HR commissions...</div>' +
      '</div>';
    document.body.appendChild(box);

    box.querySelector('#nd-comm-close').addEventListener('click', function () { box.remove(); });

    try {
      var candidates = await commissionCandidatesForDeal(deal);
      var listEl = box.querySelector('#nd-comm-list');
      if (!candidates.length) {
        listEl.innerHTML = '<div style="padding:28px;text-align:center;color:#94a3b8;font-size:13px">No unlinked paid, approved, or settled HR commission records were found.</div>';
      } else {
        function renderCandidates(query) {
          var q = normText(query);
          var visible = q ? candidates.filter(function (comm) {
            return commissionSearchText(comm).indexOf(q) !== -1;
          }) : candidates;
          if (!visible.length) {
            listEl.innerHTML = '<div style="padding:28px;text-align:center;color:#94a3b8;font-size:13px">No eligible commissions match your search.</div>';
            return;
          }
          listEl.innerHTML =
            '<div style="padding:6px 12px 8px;font-size:11px;color:#64748b">Showing ' +
              visible.length + ' of ' + candidates.length + ' eligible paid/approved/settled commissions</div>' +
            visible.map(renderCommissionCandidate).join('');
          listEl.querySelectorAll('.nd-comm-row').forEach(function (row) {
            row.addEventListener('mouseenter', function () { row.style.background = '#f8fafc'; });
            row.addEventListener('mouseleave', function () { row.style.background = ''; });
            row.addEventListener('click', async function () {
              var comm = visible.find(function (item) { return String(item._key) === row.getAttribute('data-key'); });
              if (!comm) return;
              var ok = confirm(
                'Link this existing HR commission to accounting deal ' + deal._id + '?\n\n' +
                'Only the deal reference metadata will be updated. Amount, status, payment date, and payroll stay unchanged.'
              );
              if (!ok) return;
              row.style.opacity = '0.55';
              try {
                await saveExistingCommissionDealLink(comm, deal);
                box.remove();
                alert('Commission linked successfully. The page will refresh so HR Sync can recalculate.');
                setTimeout(function () { window.location.reload(); }, 250);
              } catch (e) {
                alert('Could not link commission: ' + e.message);
                row.style.opacity = '';
              }
            });
          });
        }
        renderCandidates('');
        box.querySelector('#nd-comm-search').addEventListener('input', function (e) {
          renderCandidates(e.target.value);
        });
      }
    } catch (e) {
      box.querySelector('#nd-comm-list').innerHTML =
        '<div style="padding:28px;text-align:center;color:#b91c1c;font-size:13px">Could not load HR commissions: ' +
        escapeHtml(e.message) + '</div>';
    }

    setTimeout(function () {
      document.addEventListener('click', function close(e) {
        if (!box.contains(e.target) && e.target !== anchor) {
          box.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 100);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.nd-link-btn');
    if (btn) showLinkPopup(btn.getAttribute('data-empid'), btn);
    var syncBtn = e.target.closest('.nd-sync-link-btn');
    if (syncBtn) {
      e.preventDefault();
      e.stopPropagation();
      showCommissionLinkPicker(syncBtn._nasamaDeal || { _id: syncBtn.getAttribute('data-dealid') }, syncBtn);
    }
    var panelBtn = e.target.closest('.nd-sync-panel-btn');
    if (panelBtn) {
      e.preventDefault();
      e.stopPropagation();
      showCommissionLinkPicker(panelBtn._nasamaDeal || { _id: panelBtn.getAttribute('data-dealid') }, panelBtn);
    }
  });

  // ── OBSERVER & START ──────────────────────────────────────────────────────────
  var observer = new MutationObserver(function () {
    clearTimeout(obsTimer);
    obsTimer = setTimeout(function () {
      commFormDone    = false;
      payrollFormDone = false;
      injectCommForm();
      injectPerfCard();
      injectLeaderboard();
      injectPayrollHint();
      injectDealSyncPanel();
      injectDealSyncActions();
    }, 150);
  });

  async function start() {
    if (!window.firebase || !window.firebase.apps) { setTimeout(start, 300); return; }
    var ok = await initAcct();
    if (!ok) {
      console.warn(
        '[NasamaDeals] Could not connect to accounting Firestore.\n' +
        'Fix: Firebase Console → nasama-accuntant project → Authentication → ' +
        'Sign-in method → Anonymous → Enable.'
      );
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    injectCommForm();
    injectPerfCard();
    injectLeaderboard();
    injectPayrollHint();
    injectDealSyncPanel();
    injectDealSyncActions();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // Public API — available in browser console for debugging
  window.nasamaDeals = {
    fetchDeals: fetchDeals,
    fetchDealsYTD: fetchDealsYTD,
    saveLink: saveLink,
    saveTarget: saveTarget,
    detectCommissionGaps: detectCommissionGaps,
    linkExistingCommissionToDeal: saveExistingCommissionDealLink,
    clearCache: function () { dealsCache = {}; linksCache = null; empsCache = null; }
  };
})();
