(function () {
  'use strict';

  var HR_ROOT   = 'nasama_hr';
  var CACHE_TTL = 5 * 60 * 1000;

  // ── STATE ────────────────────────────────────────────────────────────────────
  var obsTimer   = null;
  var docsCache  = {};
  var leaveCache = {};
  var empsCache  = null;
  var allDocsCache = null;
  var allDocsCacheTs = 0;
  var bellLoaded = false;

  // ── FIREBASE / SESSION ───────────────────────────────────────────────────────
  function hrDb() {
    var app = window.firebase && window.firebase.apps &&
      window.firebase.apps.find(function (a) { return a.name === '[DEFAULT]'; });
    return app ? app.database() : null;
  }

  function getSession() {
    try { return JSON.parse(localStorage.getItem('nasama_hr_session') || 'null'); }
    catch (e) { return null; }
  }

  function userRole()    { var s = getSession(); return s ? (s.role || '') : ''; }
  function isAdmin()     { return userRole() === 'admin'; }
  function canViewHR()   { var r = userRole(); return r === 'admin' || r === 'hr_officer'; }

  // ── FORMATTING ───────────────────────────────────────────────────────────────
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    var now = new Date(); now.setHours(0,0,0,0); d.setHours(0,0,0,0);
    return Math.round((d - now) / 86400000);
  }

  function expiryStatus(days) {
    if (days === null)  return { color: '#94a3b8', bg: '#f8fafc', text: 'Not set' };
    if (days < 0)       return { color: '#ef4444', bg: '#fef2f2', text: 'Expired ' + Math.abs(days) + ' days ago' };
    if (days === 0)     return { color: '#ef4444', bg: '#fef2f2', text: 'Expires today' };
    if (days < 30)      return { color: '#ef4444', bg: '#fef2f2', text: 'Expires in ' + days + ' days' };
    if (days < 90)      return { color: '#f59e0b', bg: '#fffbeb', text: 'Expires in ' + days + ' days' };
    return               { color: '#22c55e', bg: '#f0fdf4', text: 'Valid — ' + days + ' days remaining' };
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // ── DOCUMENT TYPES ───────────────────────────────────────────────────────────
  var DOC_TYPES = [
    { key: 'visa',      label: 'Residence Visa' },
    { key: 'eid',       label: 'Emirates ID' },
    { key: 'passport',  label: 'Passport' },
    { key: 'insurance', label: 'Medical Insurance' },
    { key: 'labour',    label: 'Labour Card / Work Permit' },
  ];

  // ── DATA ACCESS ──────────────────────────────────────────────────────────────
  async function loadAllEmps() {
    if (empsCache) return empsCache;
    var db = hrDb(); if (!db) return [];
    try {
      var snap = await db.ref(HR_ROOT + '/employees').once('value');
      var val = snap.val(); if (!val) return (empsCache = []);
      empsCache = Array.isArray(val) ? val.filter(Boolean) : Object.values(val).filter(Boolean);
      return empsCache;
    } catch (e) { return []; }
  }

  async function getDocs(empId) {
    var hit = docsCache[empId];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    var db = hrDb(); if (!db) return {};
    try {
      var snap = await db.ref(HR_ROOT + '/employee_docs/' + empId).once('value');
      var data = snap.val() || {};
      docsCache[empId] = { data: data, ts: Date.now() };
      return data;
    } catch (e) { return {}; }
  }

  async function setDocs(empId, docs) {
    var db = hrDb(); if (!db) return;
    await db.ref(HR_ROOT + '/employee_docs/' + empId).set(docs);
    docsCache[empId] = { data: docs, ts: Date.now() };
    allDocsCache = null; // invalidate aggregate cache
  }

  async function getAllDocs() {
    if (allDocsCache && Date.now() - allDocsCacheTs < CACHE_TTL) return allDocsCache;
    var db = hrDb(); if (!db) return {};
    try {
      var snap = await db.ref(HR_ROOT + '/employee_docs').once('value');
      allDocsCache = snap.val() || {};
      allDocsCacheTs = Date.now();
      return allDocsCache;
    } catch (e) { return {}; }
  }

  async function getLeave(empId) {
    var hit = leaveCache[empId];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    var db = hrDb(); if (!db) return defaultLeave();
    try {
      var snap = await db.ref(HR_ROOT + '/leave_balance/' + empId).once('value');
      var data = Object.assign(defaultLeave(), snap.val() || {});
      leaveCache[empId] = { data: data, ts: Date.now() };
      return data;
    } catch (e) { return defaultLeave(); }
  }

  function defaultLeave() {
    return { annual: 30, annual_used: 0, sick: 15, sick_used: 0 };
  }

  async function setLeave(empId, leave) {
    var db = hrDb(); if (!db) return;
    await db.ref(HR_ROOT + '/leave_balance/' + empId).set(leave);
    leaveCache[empId] = { data: leave, ts: Date.now() };
  }

  // ── EMPLOYEE DETECTION (detail page) ─────────────────────────────────────────
  function getDetailEmpName() {
    var backBtn = null;
    document.querySelectorAll('button').forEach(function (b) {
      if ((b.textContent || '').trim() === '← Employees') backBtn = b;
    });
    if (!backBtn) return null;
    var name = null;
    var par = backBtn.parentElement;
    if (par) par.querySelectorAll('span').forEach(function (s) {
      var t = (s.textContent || '').trim();
      if (t && t !== '/' && t.length > 1) name = t;
    });
    return name;
  }

  // ── POPUP HELPER ─────────────────────────────────────────────────────────────
  function makePopup(id) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = id;
    box.style.cssText = [
      'position:fixed;z-index:100002;background:#fff;border-radius:12px',
      'box-shadow:0 8px 40px rgba(0,0,0,.28);border:1px solid #e2e8f0',
      'padding:20px;top:50%;left:50%;transform:translate(-50%,-50%)'
    ].join(';');
    document.body.appendChild(box);
    return box;
  }

  // ── LAST ANCHOR ON DETAIL PAGE ───────────────────────────────────────────────
  function detailAnchor() {
    var lv   = document.getElementById('nhe-leave-card');
    var doc  = document.getElementById('nhe-doc-card');
    var perf = document.getElementById('nd-perf-card');
    if (lv)   return lv;
    if (doc)  return doc;
    if (perf) return perf;
    var cards = document.querySelectorAll('.card');
    return cards.length ? cards[cards.length - 1] : null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FEATURE 1 — DOCUMENT / VISA EXPIRY CARD
  // ════════════════════════════════════════════════════════════════════════════
  async function injectDocCard() {
    if (!canViewHR()) return;
    var empName = getDetailEmpName();
    if (!empName) return;
    if (document.getElementById('nhe-doc-card')) return;

    var emps = await loadAllEmps();
    var emp = emps.find(function (e) { return e.name === empName; });
    if (!emp) return;

    var anchor = (function () {
      var perf = document.getElementById('nd-perf-card');
      if (perf) return perf;
      var cards = document.querySelectorAll('.card');
      return cards.length ? cards[cards.length - 1] : null;
    })();
    if (!anchor) return;

    var card = document.createElement('div');
    card.id = 'nhe-doc-card';
    card.className = 'card';
    card.style.marginTop = '16px';
    anchor.insertAdjacentElement('afterend', card);

    var docs = await getDocs(emp.id);
    renderDocCard(card, emp.id, docs);
  }

  function renderDocCard(card, empId, docs) {
    var editable = isAdmin();
    var rows = DOC_TYPES.map(function (dt) {
      var expiry = docs[dt.key] || '';
      var days   = daysUntil(expiry);
      var st     = expiryStatus(days);
      return (
        '<div style="display:flex;align-items:center;padding:9px 14px;border-bottom:1px solid #f1f5f9;background:' + st.bg + '">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;font-weight:600;color:#0f172a">' + dt.label + '</div>' +
            '<div style="font-size:11px;color:' + st.color + ';margin-top:1px">' + st.text + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
            '<span style="font-size:12px;color:#64748b">' + fmtDate(expiry) + '</span>' +
            (editable
              ? '<button type="button" class="nhe-edit-doc" ' +
                  'data-key="' + dt.key + '" data-label="' + dt.label + '" data-val="' + expiry + '" ' +
                  'style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #e2e8f0;' +
                  'background:none;cursor:pointer;color:#64748b">Edit</button>'
              : '') +
          '</div>' +
        '</div>'
      );
    }).join('');

    card.innerHTML =
      '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:12px 18px;' +
          'border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">' +
        '<div style="color:#f8fafc;font-size:13px;font-weight:700">📄 Documents & Visa</div>' +
        '<div style="font-size:11px;color:#94a3b8">Click Edit to set expiry dates</div>' +
      '</div>' +
      rows;

    card.querySelectorAll('.nhe-edit-doc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showDocPopup(
          empId,
          btn.getAttribute('data-key'),
          btn.getAttribute('data-label'),
          btn.getAttribute('data-val'),
          docs,
          function (updated) {
            docs = updated;
            renderDocCard(card, empId, updated);
            invalidateBell();
          }
        );
      });
    });
  }

  function showDocPopup(empId, key, label, current, docs, onSave) {
    var box = makePopup('nhe-doc-popup');
    box.style.width = '280px';
    box.innerHTML =
      '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px">' + label + '</div>' +
      '<div style="font-size:12px;color:#64748b;margin-bottom:12px">Set expiry date</div>' +
      '<input id="nhe-dp-d" type="date" value="' + (current || '') + '" ' +
        'style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none">' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button id="nhe-dp-cancel" type="button" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e2e8f0;background:none;cursor:pointer;font-size:12px">Cancel</button>' +
        '<button id="nhe-dp-save" type="button" style="flex:1;padding:8px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:12px;font-weight:700">Save</button>' +
      '</div>';
    box.querySelector('#nhe-dp-cancel').addEventListener('click', function () { box.remove(); });
    box.querySelector('#nhe-dp-save').addEventListener('click', async function () {
      var val = box.querySelector('#nhe-dp-d').value || null;
      var updated = Object.assign({}, docs);
      updated[key] = val;
      await setDocs(empId, updated);
      box.remove();
      onSave(updated);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FEATURE 2 — LEAVE BALANCE CARD
  // ════════════════════════════════════════════════════════════════════════════
  async function injectLeaveCard() {
    if (!canViewHR()) return;
    var empName = getDetailEmpName();
    if (!empName) return;
    if (document.getElementById('nhe-leave-card')) return;

    var emps = await loadAllEmps();
    var emp  = emps.find(function (e) { return e.name === empName; });
    if (!emp) return;

    var anchor = detailAnchor();
    if (!anchor) return;

    var card = document.createElement('div');
    card.id = 'nhe-leave-card';
    card.className = 'card';
    card.style.marginTop = '16px';
    anchor.insertAdjacentElement('afterend', card);

    var leave = await getLeave(emp.id);
    renderLeaveCard(card, emp.id, leave);
  }

  function renderLeaveCard(card, empId, leave) {
    var annUsed  = leave.annual_used || 0;
    var sickUsed = leave.sick_used || 0;
    var annTotal = leave.annual || 30;
    var sickTotal = leave.sick || 15;
    var annLeft  = Math.max(0, annTotal - annUsed);
    var sickLeft = Math.max(0, sickTotal - sickUsed);

    function bar(used, total, color) {
      var pct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
      return '<div style="height:5px;background:#f1f5f9;border-radius:3px;margin-top:5px;overflow:hidden">' +
               '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px"></div>' +
             '</div>';
    }

    function cell(label, used, total, left, color) {
      return '<div style="padding:14px;background:#fff">' +
        '<div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.4px">' + label + '</div>' +
        '<div style="font-size:24px;font-weight:800;color:' + color + ';margin:4px 0 0">' + left +
          '<span style="font-size:11px;font-weight:400;color:#94a3b8;margin-left:4px">days left</span></div>' +
        '<div style="font-size:11px;color:#94a3b8;margin-top:1px">' + used + ' used of ' + total + '</div>' +
        bar(used, total, color) +
      '</div>';
    }

    card.innerHTML =
      '<div style="background:linear-gradient(135deg,#1e293b,#334155);padding:12px 18px;' +
          'border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">' +
        '<div style="color:#f8fafc;font-size:13px;font-weight:700">🏖️ Leave Balance ' + new Date().getFullYear() + '</div>' +
        (isAdmin()
          ? '<button type="button" id="nhe-lv-edit-btn" ' +
              'style="font-size:11px;padding:3px 10px;border-radius:6px;border:1px solid #94a3b8;' +
              'background:none;color:#94a3b8;cursor:pointer">Edit</button>'
          : '') +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e2e8f0">' +
        cell('Annual Leave', annUsed, annTotal, annLeft, annLeft <= 5  ? '#ef4444' : '#22c55e') +
        cell('Sick Leave',   sickUsed, sickTotal, sickLeft, sickLeft <= 2 ? '#f59e0b' : '#60a5fa') +
      '</div>';

    var editBtn = card.querySelector('#nhe-lv-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        showLeavePopup(empId, leave, function (updated) {
          leave = updated;
          renderLeaveCard(card, empId, updated);
        });
      });
    }
  }

  function showLeavePopup(empId, leave, onSave) {
    var box = makePopup('nhe-lv-popup');
    box.style.width = '300px';

    function numField(id, label, val) {
      return '<div style="margin-bottom:10px">' +
        '<label for="' + id + '" style="font-size:12px;font-weight:600;color:#0f172a;display:block;margin-bottom:3px">' + label + '</label>' +
        '<input id="' + id + '" type="number" min="0" max="365" value="' + (val || 0) + '" ' +
          'style="width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;outline:none">' +
      '</div>';
    }

    box.innerHTML =
      '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:14px">Edit Leave Balance</div>' +
      numField('nhe-lv-ann',    'Annual Entitlement (days)',  leave.annual       || 30) +
      numField('nhe-lv-ann-u',  'Annual Leave Used',          leave.annual_used  || 0) +
      numField('nhe-lv-sick',   'Sick Entitlement (days)',    leave.sick         || 15) +
      numField('nhe-lv-sick-u', 'Sick Leave Used',            leave.sick_used    || 0) +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button id="nhe-lv-cancel" type="button" style="flex:1;padding:8px;border-radius:8px;border:1px solid #e2e8f0;background:none;cursor:pointer;font-size:12px">Cancel</button>' +
        '<button id="nhe-lv-save" type="button" style="flex:1;padding:8px;border-radius:8px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:12px;font-weight:700">Save</button>' +
      '</div>';

    box.querySelector('#nhe-lv-cancel').addEventListener('click', function () { box.remove(); });
    box.querySelector('#nhe-lv-save').addEventListener('click', async function () {
      var updated = {
        annual:       parseInt(box.querySelector('#nhe-lv-ann').value)    || 30,
        annual_used:  parseInt(box.querySelector('#nhe-lv-ann-u').value)  || 0,
        sick:         parseInt(box.querySelector('#nhe-lv-sick').value)   || 15,
        sick_used:    parseInt(box.querySelector('#nhe-lv-sick-u').value) || 0,
      };
      await setLeave(empId, updated);
      box.remove();
      onSave(updated);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FEATURE 3 — NOTIFICATION BELL
  // ════════════════════════════════════════════════════════════════════════════
  async function buildAlerts() {
    var items = [];
    var allDocs = await getAllDocs();
    var emps = await loadAllEmps();
    var empById = {};
    emps.forEach(function (e) { if (e.id) empById[e.id] = e; });

    Object.keys(allDocs).forEach(function (empId) {
      var emp  = empById[empId];
      if (!emp) return;
      var docs = allDocs[empId] || {};
      DOC_TYPES.forEach(function (dt) {
        var expiry = docs[dt.key];
        if (!expiry) return;
        var days = daysUntil(expiry);
        if (days !== null && days < 90) {
          items.push({
            urgent: days < 30,
            icon:   days < 0 ? '🚨' : days < 30 ? '⚠️' : '📋',
            text:   days < 0
              ? emp.name + ': ' + dt.label + ' expired ' + Math.abs(days) + 'd ago'
              : emp.name + ': ' + dt.label + ' expires in ' + days + 'd',
          });
        }
      });
    });

    items.sort(function (a, b) { return (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0); });
    return items;
  }

  function invalidateBell() {
    bellLoaded = false;
    allDocsCache = null;
    var bell = document.getElementById('nhe-bell');
    if (bell) bell._alerts = null;
    buildAlerts().then(function (items) {
      updateBellBadge(items);
      bellLoaded = true;
      var b = document.getElementById('nhe-bell');
      if (b) b._alerts = items;
    });
  }

  function updateBellBadge(items) {
    var badge = document.getElementById('nhe-bell-badge');
    if (!badge) return;
    var urgent = items.filter(function (i) { return i.urgent; }).length;
    badge.textContent = urgent || '';
    badge.style.display = urgent > 0 ? 'flex' : 'none';
  }

  async function injectNotifBell() {
    if (!isAdmin()) {
      var old = document.getElementById('nhe-bell');
      if (old) old.remove();
      return;
    }
    if (document.getElementById('nhe-bell')) return;

    var bell = document.createElement('div');
    bell.id = 'nhe-bell';
    bell.title = 'HR Alerts';
    bell.style.cssText = [
      'position:fixed;top:12px;right:60px;z-index:99999;cursor:pointer',
      'width:36px;height:36px;border-radius:50%;background:#1e293b',
      'display:flex;align-items:center;justify-content:center',
      'box-shadow:0 2px 10px rgba(0,0,0,.3);border:2px solid #334155'
    ].join(';');
    bell.innerHTML =
      '<span style="font-size:16px;line-height:1">🔔</span>' +
      '<div id="nhe-bell-badge" style="position:absolute;top:-5px;right:-5px;' +
        'background:#ef4444;color:#fff;border-radius:50%;min-width:18px;height:18px;' +
        'font-size:10px;font-weight:700;display:none;align-items:center;justify-content:center;' +
        'border:2px solid #fff;padding:0 2px"></div>';
    document.body.appendChild(bell);

    bell.addEventListener('click', async function (e) {
      e.stopPropagation();
      var panel = document.getElementById('nhe-bell-panel');
      if (panel) { panel.remove(); return; }
      var items = bell._alerts;
      if (!items) items = await buildAlerts();
      showBellPanel(bell, items);
    });

    // Load alerts in background without blocking injection
    buildAlerts().then(function (items) {
      bellLoaded = true;
      bell._alerts = items;
      updateBellBadge(items);
    });
  }

  function showBellPanel(bell, items) {
    var panel = document.createElement('div');
    panel.id = 'nhe-bell-panel';
    panel.style.cssText = [
      'position:fixed;top:56px;right:54px;z-index:99998;background:#fff;border-radius:12px',
      'width:310px;max-height:380px;box-shadow:0 8px 40px rgba(0,0,0,.2)',
      'border:1px solid #e2e8f0;overflow:hidden;display:flex;flex-direction:column'
    ].join(';');

    var rows = items.length
      ? items.map(function (item) {
          return '<div style="padding:9px 14px;border-bottom:1px solid #f1f5f9;display:flex;gap:10px;align-items:flex-start">' +
            '<span style="font-size:15px;flex-shrink:0">' + item.icon + '</span>' +
            '<span style="font-size:12px;color:#0f172a;line-height:1.4">' + item.text + '</span>' +
          '</div>';
        }).join('')
      : '<div style="padding:28px;text-align:center;color:#94a3b8;font-size:12px">No urgent alerts — all documents are valid ✅</div>';

    panel.innerHTML =
      '<div style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;font-weight:700;color:#0f172a;flex-shrink:0">' +
        '🔔 Document Alerts' + (items.length ? ' (' + items.length + ')' : '') +
      '</div>' +
      '<div style="overflow-y:auto;flex:1">' + rows + '</div>';

    document.body.appendChild(panel);

    setTimeout(function () {
      document.addEventListener('click', function close(e) {
        if (!panel.contains(e.target) && !bell.contains(e.target)) {
          panel.remove();
          document.removeEventListener('click', close);
        }
      });
    }, 100);
  }

  // ── OBSERVER & START ──────────────────────────────────────────────────────────
  var observer = new MutationObserver(function () {
    clearTimeout(obsTimer);
    obsTimer = setTimeout(function () {
      injectDocCard();
      injectLeaveCard();
      injectNotifBell();
    }, 200);
  });

  function start() {
    if (!window.firebase || !window.firebase.apps) { setTimeout(start, 300); return; }
    var app = window.firebase.apps.find(function (a) { return a.name === '[DEFAULT]'; });
    if (!app) { setTimeout(start, 300); return; }
    observer.observe(document.body, { childList: true, subtree: true });
    injectDocCard();
    injectLeaveCard();
    injectNotifBell();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // Public API for debugging
  window.nasamaHR = {
    clearCache: function () { docsCache = {}; leaveCache = {}; empsCache = null; allDocsCache = null; bellLoaded = false; },
    refreshBell: invalidateBell
  };

})();
