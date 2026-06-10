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
  // The main app uses the modular Firebase SDK, so there is NO compat '[DEFAULT]'
  // app on window.firebase. We resolve (or create) a compat app on the nasama-hr
  // project by project ID — same approach/name as deals-bridge.js, so they share one.
  var HR_CFG = {
    apiKey: 'AIzaSyAqkLr-uJKIE8uW8zrgqlMpte0KfGPnOBM',
    authDomain: 'nasama-hr.firebaseapp.com',
    databaseURL: 'https://nasama-hr-default-rtdb.firebaseio.com',
    projectId: 'nasama-hr',
    storageBucket: 'nasama-hr.firebasestorage.app'
  };
  var HR_APP_NAME = 'nasama-hr-bridge';

  function hrApp() {
    if (!window.firebase || !window.firebase.initializeApp) return null;
    try {
      var def = window.firebase.app();
      if (def && def.options && def.options.projectId === 'nasama-hr') return def;
    } catch (e) {}
    var existing = (window.firebase.apps || []).find(function (a) {
      return a.options && a.options.projectId === 'nasama-hr';
    });
    if (existing) return existing;
    try { return window.firebase.initializeApp(HR_CFG, HR_APP_NAME); }
    catch (e) { return null; }
  }

  function hrDb() {
    var app = hrApp();
    try { return app ? app.database() : null; } catch (e) { return null; }
  }

  function hrStorage() {
    var app = hrApp();
    try { return app ? app.storage() : null; } catch (e) { return null; }
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
      var fileUrl = docs[dt.key + '_url'] || '';
      var days   = daysUntil(expiry);
      var st     = expiryStatus(days);
      return (
        '<div style="display:flex;align-items:center;padding:9px 14px;border-bottom:1px solid #f1f5f9;background:' + st.bg + '">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;font-weight:600;color:#0f172a">' + dt.label + '</div>' +
            '<div style="font-size:11px;color:' + st.color + ';margin-top:1px">' + st.text + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:10px;flex-shrink:0">' +
            (fileUrl
              ? '<a href="' + fileUrl + '" target="_blank" title="View Document" style="text-decoration:none;font-size:14px;filter:grayscale(1)">👁️</a>'
              : '') +
            '<span style="font-size:12px;color:#64748b">' + fmtDate(expiry) + '</span>' +
            (editable
              ? '<button type="button" class="nhe-edit-doc" ' +
                  'data-key="' + dt.key + '" data-label="' + dt.label + '" data-val="' + expiry + '" ' +
                  'style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #e2e8f0;' +
                  'background:none;cursor:pointer;color:#64748b">Edit</button>' +
                '<button type="button" class="nhe-upload-doc" ' +
                  'data-key="' + dt.key + '" data-label="' + dt.label + '" ' +
                  'title="Upload scan/photo" ' +
                  'style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid #3b82f6;' +
                  'background:#eff6ff;cursor:pointer;color:#1d4ed8">⬆️</button>'
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

    card.querySelectorAll('.nhe-upload-doc').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-key');
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        input.onchange = async function (e) {
          var file = e.target.files[0];
          if (!file) return;
          
          btn.textContent = '...';
          btn.disabled = true;
          
          var storage = hrStorage();
          if (!storage) { alert("Firebase Storage SDK not loaded."); return; }
          
          try {
            var ref = storage.ref(HR_ROOT + '/docs/' + empId + '/' + key);
            var snap = await ref.put(file);
            var url = await snap.ref.getDownloadURL();
            var updated = await getDocs(empId);
            updated[key + '_url'] = url;
            await setDocs(empId, updated);
            renderDocCard(card, empId, updated);
          } catch (err) { alert("Upload failed: " + err.message); btn.textContent = '⬆️'; btn.disabled = false; }
        };
        input.click();
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
  // DOCUMENT FILE STORAGE — base64 in the Realtime Database (free, no Cloud Storage)
  // Firebase Storage needs the paid Blaze plan, so we keep files in the RTDB under a
  // SEPARATE path (employee_files) — never employee_docs — so the notification bell's
  // bulk read of expiry data stays light. Images are downscaled to keep payloads small.
  // ════════════════════════════════════════════════════════════════════════════
  var filesCache = {};
  var MAX_FILE_BYTES = 3 * 1024 * 1024; // cap on the stored (post-compression) payload

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function getFiles(empId) {
    var hit = filesCache[empId];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
    var db = hrDb(); if (!db) return {};
    try {
      var snap = await db.ref(HR_ROOT + '/employee_files/' + empId).once('value');
      var data = snap.val() || {};
      filesCache[empId] = { data: data, ts: Date.now() };
      return data;
    } catch (e) { return {}; }
  }

  async function setFileRecord(empId, key, rec) {
    var db = hrDb(); if (!db) throw new Error('HR database is not available.');
    await db.ref(HR_ROOT + '/employee_files/' + empId + '/' + key).set(rec);
    filesCache[empId] = null; // invalidate
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload  = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('Could not read the file.')); };
      fr.readAsDataURL(file);
    });
  }

  // Downscale + re-encode images as JPEG to shrink the base64; non-images pass through.
  function compressImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var cw = Math.round(img.width * scale), ch = Math.round(img.height * scale);
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
          try { resolve(canvas.toDataURL('image/jpeg', quality)); }
          catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('Could not load the image.')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('Could not read the image.')); };
      fr.readAsDataURL(file);
    });
  }

  function dataUrlBytes(dataUrl) {
    var i = dataUrl.indexOf(',');
    return Math.ceil((dataUrl.length - i - 1) * 3 / 4);
  }

  // Chrome blocks navigating to data: URLs, so open via a Blob object URL instead.
  function openStoredFile(dataUrl) {
    try {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/octet-stream';
      var bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: mime }));
      window.open(url, '_blank');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    } catch (e) { alert('Could not open file: ' + ((e && e.message) || e)); }
  }

  // Reads + (for images) compresses a File into a storable record, enforcing the size cap.
  async function buildFileRecord(file) {
    var isImage = /^image\//.test(file.type);
    var dataUrl = isImage ? await compressImage(file, 1400, 0.8) : await readAsDataUrl(file);
    if (dataUrlBytes(dataUrl) > MAX_FILE_BYTES) {
      throw new Error('File is too large (' + (Math.round(dataUrlBytes(dataUrl) / 1048576 * 10) / 10) +
        ' MB after compression). ' + (isImage ? 'Use a smaller image.' : 'PDFs must be under ~3 MB.'));
    }
    return { data: dataUrl, name: file.name, type: file.type || '', ts: Date.now() };
  }

  async function saveEmployeeDoc(empId, key, file) {
    var rec = await buildFileRecord(file);
    await setFileRecord(empId, key, rec);
    return rec;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FEATURE 1b — UPLOAD ON THE MAIN APP'S "DOCUMENT EXPIRY" CARD
  // Injects an upload (⬆️) + view (👁️) button into each row of the read-only card.
  // ════════════════════════════════════════════════════════════════════════════
  var DOC_EXPIRY_KEYS = {
    'visa':        'visa',
    'contract':    'contract',
    'passport':    'passport',
    'emirates id': 'eid_front',
    'rera':        'rera',
  };

  async function enhanceDocExpiryCard() {
    // No isAdmin() gate: the main app only renders this card for authorized users,
    // and Firebase Storage rules are the real security boundary. (The old check read
    // a session key the app doesn't use, so it always failed and hid the buttons.)
    var empName = getDetailEmpName();
    if (!empName) return;

    // Locate the main app's Document Expiry card by its title text
    var card = null;
    document.querySelectorAll('.card-title').forEach(function (t) {
      if (!card && /Document Expiry/i.test(t.textContent || '')) card = t.closest('.card');
    });
    if (!card) return;

    // Each row has a bold label leaf node (Visa / Contract / …). The label is a <div>
    // on "Not set" rows and a <span> on dated rows, at different depths — so we match
    // either element and walk up to the row (nearest ancestor with a border-bottom).
    var pending = [];
    card.querySelectorAll('div, span').forEach(function (el) {
      if (el.children.length) return;
      var key = DOC_EXPIRY_KEYS[(el.textContent || '').trim().toLowerCase()];
      if (!key) return;
      var row = el.closest('[style*="border-bottom"]');
      if (!row || row.querySelector('.nhe-doc-up')) return;
      pending.push({ row: row, key: key });
    });
    if (!pending.length) return; // already wired, or card not ready

    var emps = await loadAllEmps();
    var emp  = emps.find(function (e) { return e.name === empName; });
    if (!emp) return;
    var files = await getFiles(emp.id);

    pending.forEach(function (p) {
      if (p.row.querySelector('.nhe-doc-up')) return;
      addDocUploadControls(p.row, p.key, emp.id, files);
    });
  }

  function addDocUploadControls(row, key, empId, files) {
    var rec = files[key] || null;

    var wrap = document.createElement('div');
    wrap.className = 'nhe-doc-up';
    wrap.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:10px;flex-shrink:0';

    var view = document.createElement('button');
    view.type = 'button';
    view.className = 'nhe-doc-view';
    view.title = 'View uploaded document';
    view.textContent = '👁️';
    view.style.cssText = 'background:none;border:none;padding:0;font-size:14px;cursor:pointer;' +
      (rec && rec.data ? '' : 'display:none');
    view.addEventListener('click', function () { if (rec && rec.data) openStoredFile(rec.data); });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.title = 'Upload scan / photo';
    btn.textContent = '⬆️';
    btn.style.cssText = 'font-size:11px;padding:2px 8px;border-radius:6px;border:1px solid #3b82f6;' +
      'background:#eff6ff;cursor:pointer;color:#1d4ed8;line-height:1';

    btn.addEventListener('click', function () {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf';
      input.onchange = async function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        var prev = btn.textContent;
        btn.textContent = '⏳'; btn.disabled = true;
        try {
          rec = await saveEmployeeDoc(empId, key, file);
          files[key] = rec;
          view.style.display = '';
          btn.textContent = '✓';
          setTimeout(function () { btn.textContent = '⬆️'; btn.disabled = false; }, 1500);
          refreshDocumentsCard(empId);
        } catch (err) {
          alert('Upload failed: ' + ((err && err.message) || err));
          btn.textContent = prev; btn.disabled = false;
        }
      };
      input.click();
    });

    wrap.appendChild(view);
    wrap.appendChild(btn);
    row.appendChild(wrap);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FEATURE 1c — DOCUMENTS GALLERY CARD
  // A dedicated "Documents" subsection on the employee page showing the uploaded
  // file for each document (image preview or PDF link), with upload / replace.
  // ════════════════════════════════════════════════════════════════════════════
  var DOCUMENT_SLOTS = [
    { key: 'visa',      label: 'Visa' },
    { key: 'contract',  label: 'Contract' },
    { key: 'passport',  label: 'Passport' },
    { key: 'eid_front', label: 'Emirates ID — Front' },
    { key: 'eid_back',  label: 'Emirates ID — Back' },
    { key: 'rera',      label: 'RERA' },
  ];

  async function injectDocumentsCard() {
    var empName = getDetailEmpName();
    if (!empName) return;

    var emps = await loadAllEmps();
    var emp  = emps.find(function (e) { return e.name === empName; });
    if (!emp) return;

    var existing = document.getElementById('nhe-documents-card');
    if (existing) {
      if (existing.dataset.empId === String(emp.id)) return;       // already showing this employee
      existing.dataset.empId = String(emp.id);                     // switched employee — refresh in place
      renderDocumentsCard(existing, emp.id, await getFiles(emp.id));
      return;
    }

    // Place it right after the Document Expiry card when present, else after the last card
    var anchor = null;
    document.querySelectorAll('.card-title').forEach(function (t) {
      if (!anchor && /Document Expiry/i.test(t.textContent || '')) anchor = t.closest('.card');
    });
    if (!anchor) {
      var cards = document.querySelectorAll('.card');
      anchor = cards.length ? cards[cards.length - 1] : null;
    }
    if (!anchor) return;

    var card = document.createElement('div');
    card.id = 'nhe-documents-card';
    card.className = 'card';
    card.style.marginTop = '16px';
    card.dataset.empId = String(emp.id);
    anchor.insertAdjacentElement('afterend', card);

    renderDocumentsCard(card, emp.id, await getFiles(emp.id));
  }

  function documentSlotHtml(slot, rec) {
    var has   = !!(rec && rec.data);
    var isImg = has && /^data:image\//.test(rec.data);
    var preview = has
      ? (isImg
          ? '<img src="' + rec.data + '" alt="" style="max-width:100%;max-height:100%;object-fit:contain">'
          : '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;color:#64748b;font-size:11px">' +
              '<span style="font-size:26px">📄</span><span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
              escapeHtml(rec.name || 'File') + '</span></div>')
      : '<div style="color:#cbd5e1;font-size:11px;display:flex;flex-direction:column;align-items:center;gap:4px">' +
          '<span style="font-size:24px">🖼️</span>No file</div>';

    return '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff;display:flex;flex-direction:column">' +
        '<div style="font-size:11px;font-weight:700;color:#0f172a;padding:8px 10px;border-bottom:1px solid #f1f5f9">' + slot.label + '</div>' +
        '<div class="nhe-slot-preview" data-key="' + slot.key + '" ' +
          'style="height:120px;background:#f8fafc;display:flex;align-items:center;justify-content:center;overflow:hidden' + (has ? ';cursor:pointer' : '') + '">' +
          preview +
        '</div>' +
        '<div style="display:flex;gap:6px;padding:8px 10px;border-top:1px solid #f1f5f9">' +
          '<button type="button" class="nhe-slot-upload" data-key="' + slot.key + '" ' +
            'style="flex:1;font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid #3b82f6;background:#eff6ff;color:#1d4ed8;cursor:pointer;font-weight:700">' +
            (has ? 'Replace' : '⬆️ Upload') + '</button>' +
          (has
            ? '<button type="button" class="nhe-slot-open" data-key="' + slot.key + '" title="Open in new tab" style="font-size:11px;padding:5px 8px;border-radius:6px;border:1px solid #e2e8f0;background:#fff;color:#64748b;cursor:pointer">Open</button>'
            : '') +
        '</div>' +
      '</div>';
  }

  function renderDocumentsCard(card, empId, files) {
    var grid = DOCUMENT_SLOTS.map(function (s) {
      return documentSlotHtml(s, files[s.key]);
    }).join('');

    card.innerHTML =
      '<div class="card-header" style="display:flex;align-items:center;justify-content:space-between">' +
        '<span class="card-title">📎 Documents</span>' +
        '<span style="font-size:11px;color:#94a3b8">Images or PDF</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;padding:16px">' +
        grid +
      '</div>';

    // Open (preview or Open button) → open the stored file via a Blob URL
    card.querySelectorAll('.nhe-slot-open, .nhe-slot-preview').forEach(function (el) {
      el.addEventListener('click', function () {
        var rec = files[el.getAttribute('data-key')];
        if (rec && rec.data) openStoredFile(rec.data);
      });
    });

    card.querySelectorAll('.nhe-slot-upload').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-key');
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,.pdf';
        input.onchange = async function (e) {
          var file = e.target.files && e.target.files[0];
          if (!file) return;
          var prev = btn.textContent;
          btn.textContent = '⏳ …'; btn.disabled = true;
          try {
            await saveEmployeeDoc(empId, key, file);
            renderDocumentsCard(card, empId, await getFiles(empId));
          } catch (err) {
            alert('Upload failed: ' + ((err && err.message) || err));
            btn.textContent = prev; btn.disabled = false;
          }
        };
        input.click();
      });
    });
  }

  async function refreshDocumentsCard(empId) {
    var card = document.getElementById('nhe-documents-card');
    if (card) renderDocumentsCard(card, empId, await getFiles(empId));
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

    // ── Document expiry alerts ────────────────────────────────────────────────
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

    // ── Commission gap alerts (deals collected in accounting but no HR entry) ─
    if (window.nasamaDeals && typeof window.nasamaDeals.detectCommissionGaps === 'function') {
      try {
        var gaps = await window.nasamaDeals.detectCommissionGaps();
        gaps.slice(0, 10).forEach(function (d) {
          items.push({
            urgent: true,
            icon: '💼',
            text: 'Commission Collected — no HR entry: ' + (d.property_name || d.unit_no || d._id) +
                  (d.broker_name ? ' (' + d.broker_name + ')' : ''),
          });
        });
      } catch (e) { /* accounting bridge not ready yet */ }
    }

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
      enhanceDocExpiryCard();
      injectDocumentsCard();
    }, 200);
  });

  function start() {
    if (!hrApp()) { setTimeout(start, 300); return; }
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceDocExpiryCard();
    injectDocumentsCard();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  // Public API for debugging
  window.nasamaHR = {
    clearCache: function () { docsCache = {}; leaveCache = {}; empsCache = null; allDocsCache = null; bellLoaded = false; },
    refreshBell: invalidateBell
  };

})();
