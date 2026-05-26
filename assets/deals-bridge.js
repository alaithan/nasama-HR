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
  var HR_ROOT = 'nasama_hr';
  var CACHE_TTL = 5 * 60 * 1000;

  // ── STATE ────────────────────────────────────────────────────────────────────
  var acctDb = null;
  var dealsCache = {};
  var linksCache = null;
  var empsCache = null;
  var obsTimer = null;
  var commFormDone = false;

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

  function hrDb() {
    var app = window.firebase && window.firebase.apps &&
      window.firebase.apps.find(function (a) { return a.name === '[DEFAULT]'; });
    return app ? app.database() : null;
  }

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

  // transaction_value is stored in direct AED in the accounting app
  function dealComm(d) {
    return (parseFloat(d.transaction_value) || 0) * ((parseFloat(d.commission_pct) || 0) / 100);
  }

  function isCollected(d) { return d.stage === 'Commission Collected'; }
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

  // ── COMMISSION FORM INJECTION ─────────────────────────────────────────────────
  // Adds "⚡ Import from Accounting Deals" to the "New Commission Entry" modal.
  // When a deal is selected every field is filled automatically — no double entry.

  async function injectCommForm() {
    var titleEl = null;
    document.querySelectorAll('*').forEach(function (el) {
      if (el.children.length || el.id === 'nd-perf-card') return;
      var t = (el.textContent || '').trim();
      if (t === 'New Commission Entry' || t === 'Edit Commission Record') titleEl = el;
    });
    if (!titleEl) { commFormDone = false; return; }
    if (commFormDone) return;

    var modal = titleEl.closest('[class]');
    if (!modal || modal.querySelector('.nd-import-btn')) return;

    var dealGroup = null;
    modal.querySelectorAll('label').forEach(function (l) {
      if ((l.textContent || '').includes('Deal Reference')) dealGroup = l.closest('.form-group');
    });
    if (!dealGroup) return;

    commFormDone = true;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nd-import-btn';
    btn.style.cssText = [
      'margin-top:7px;padding:5px 12px;border-radius:6px',
      'border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8',
      'font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:5px'
    ].join(';');
    btn.innerHTML = '<span>⚡</span><span>Import from Accounting Deals</span>';
    dealGroup.appendChild(btn);

    btn.addEventListener('click', async function () {
      var brokerSelect = modal.querySelector('select');
      var empId = brokerSelect ? brokerSelect.value : '';
      if (!empId) { alert('Select a broker first.'); return; }

      var brokerId = await brokerIdFor(empId);
      if (!brokerId) { showLinkPopup(empId, btn); return; }

      btn.querySelector('span:last-child').textContent = 'Loading…';
      btn.disabled = true;

      var now = new Date();
      var deals = await fetchDealsYTD(brokerId, now.getFullYear());
      if (!deals.length) deals = await fetchDealsYTD(brokerId, now.getFullYear() - 1);

      btn.querySelector('span:last-child').textContent = 'Import from Accounting Deals';
      btn.disabled = false;

      showDealPicker(btn, deals, function (deal) { fillCommForm(modal, deal); });
    });
  }

  function fillCommForm(modal, deal) {
    var comm = dealComm(deal);
    var fieldMap = {
      'Deal Reference': (deal.property_name || deal.unit_no || '') +
        (deal.unit_no && deal.property_name ? ' — ' + deal.unit_no : '') +
        (deal._id ? ' [' + deal._id + ']' : ''),
      'Client Name': deal.client_name || '',
      'Property / Area': deal.developer || '',
      'Total Commission (AED)': Math.round(comm) || ''
    };

    modal.querySelectorAll('.form-group').forEach(function (g) {
      var label = g.querySelector('label');
      var input = g.querySelector('input');
      if (!label || !input) return;
      var text = (label.textContent || '').trim();

      if (Object.prototype.hasOwnProperty.call(fieldMap, text)) {
        input.value = fieldMap[text];
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (text.includes('Transaction Date') && deal.created_at) {
        input.value = deal.created_at;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function showDealPicker(anchor, deals, onPick) {
    var old = document.getElementById('nd-deal-picker');
    if (old) old.remove();

    var box = document.createElement('div');
    box.id = 'nd-deal-picker';
    box.style.cssText = [
      'position:fixed;z-index:100000;background:#fff;border-radius:12px',
      'box-shadow:0 8px 40px rgba(0,0,0,0.2);border:1px solid #e2e8f0',
      'width:440px;max-height:440px;overflow:hidden;display:flex;flex-direction:column'
    ].join(';');

    var r = anchor.getBoundingClientRect();
    box.style.top = Math.min(r.bottom + 8, window.innerHeight - 460) + 'px';
    box.style.left = Math.min(r.left, window.innerWidth - 460) + 'px';

    var rows = deals.length
      ? deals.map(function (d) {
          var comm = dealComm(d);
          return '<div class="nd-deal-row" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer" data-id="' + d._id + '">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
              '<div style="flex:1;min-width:0">' +
                '<div style="font-size:13px;font-weight:600;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
                  (d.property_name || d.unit_no || '—') + '</div>' +
                '<div style="font-size:11px;color:#64748b;margin-top:2px">' +
                  (d.client_name || '') + (d.created_at ? ' &nbsp;·&nbsp; ' + d.created_at : '') +
                '</div>' +
              '</div>' +
              '<div style="text-align:right;flex-shrink:0">' +
                '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px">' + fmtAed(comm) + '</div>' +
                badge(d.stage) +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div style="padding:28px;text-align:center;color:#94a3b8;font-size:13px">No deals found in the accounting system</div>';

    box.innerHTML =
      '<div style="padding:12px 14px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">' +
        '<span style="font-size:13px;font-weight:700;color:#0f172a">Select Deal to Import</span>' +
        '<button id="nd-picker-close" type="button" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;padding:0">✕</button>' +
      '</div>' +
      '<div style="overflow-y:auto;flex:1">' + rows + '</div>';

    document.body.appendChild(box);
    document.getElementById('nd-picker-close').addEventListener('click', function () { box.remove(); });

    box.querySelectorAll('.nd-deal-row').forEach(function (row) {
      row.addEventListener('mouseenter', function () { row.style.background = '#f8fafc'; });
      row.addEventListener('mouseleave', function () { row.style.background = ''; });
      row.addEventListener('click', function () {
        var deal = deals.find(function (d) { return d._id === row.getAttribute('data-id'); });
        if (deal) { onPick(deal); box.remove(); }
      });
    });

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
  }

  function buildPerfCard(empId, brokerId, monthDeals, ytdDeals, target, mo, yr) {
    var moCollected = monthDeals.filter(isCollected).reduce(function (s, d) { return s + dealComm(d); }, 0);
    var ytdCollected = ytdDeals.filter(isCollected).reduce(function (s, d) { return s + dealComm(d); }, 0);
    var activeYTD = ytdDeals.filter(isActive).length;
    var tPct = target ? Math.min(100, Math.round(moCollected / target * 100)) : null;
    var tColor = tPct === null ? '#94a3b8' : tPct >= 100 ? '#22c55e' : tPct >= 70 ? '#f59e0b' : '#ef4444';

    var dealRows = monthDeals.slice(0, 6).map(function (d) {
      return '<tr>' +
        '<td style="padding:5px 8px;font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
          (d.property_name || d.unit_no || '—') + '</td>' +
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
        statCell('Month Deals', monthDeals.length, '#60a5fa'),
        statCell('Month Collected', fmtAed(moCollected), '#22c55e'),
        statCell('YTD Deals', activeYTD, '#a78bfa'),
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
        '<div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Deals this month</div>',
        monthDeals.length
          ? '<table style="width:100%;border-collapse:collapse">' +
              '<thead><tr>' +
                '<th style="text-align:left;font-size:10px;color:#94a3b8;padding:0 8px 5px;font-weight:600">Property</th>' +
                '<th style="text-align:left;font-size:10px;color:#94a3b8;padding:0 8px 5px;font-weight:600">Stage</th>' +
                '<th style="text-align:right;font-size:10px;color:#94a3b8;padding:0 8px 5px;font-weight:600">Commission</th>' +
              '</tr></thead>' +
              '<tbody>' + dealRows + '</tbody>' +
            '</table>'
          : '<div style="color:#94a3b8;font-size:12px">No deals this month.</div>',
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
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.nd-link-btn');
    if (btn) showLinkPopup(btn.getAttribute('data-empid'), btn);
  });

  // ── OBSERVER & START ──────────────────────────────────────────────────────────
  var observer = new MutationObserver(function () {
    clearTimeout(obsTimer);
    obsTimer = setTimeout(function () {
      commFormDone = false;
      injectCommForm();
      injectPerfCard();
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // Public API — available in browser console for debugging
  window.nasamaDeals = {
    fetchDeals: fetchDeals,
    fetchDealsYTD: fetchDealsYTD,
    saveLink: saveLink,
    saveTarget: saveTarget,
    clearCache: function () { dealsCache = {}; linksCache = null; empsCache = null; }
  };
})();
