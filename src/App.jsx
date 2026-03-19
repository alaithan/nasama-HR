
import React, { useState, useEffect, useRef, useCallback } from 'react';

import { hashPassword, ROLES, ROLE_PAGES, ROLE_ACTIONS, getNavForRole, canAccess, canDo, isAdminLike, DEFAULT_USERS, DEFAULT_PW_HASH_PROMISE, EMPLOYEES_INIT, SALARY_INIT, COMMISSION_INIT, LEAVES_INIT, REQUESTS_INIT, ATT_INIT } from './data/mockData';

import { fmtDate, fmtMoney, daysUntil, getInitials, AV_BG, AV_CL, getAV, expiryBadge, expiryLabel, today, nowId, COMPANY_LOGO, printProfessionalReport, generateHRLetter } from './utils/helpers';

import { db } from './services/firebase';
import { ref, get, set, child } from 'firebase/database';

import './index.css';










/* === SMALL SHARED COMPONENTS === */
function Avatar({name='',id='',size=36,fontSize=13,border=false}) {
  const av=getAV(id||name);
  return <div className="avatar" style={{...av,width:size,height:size,fontSize,border:border?'3px solid rgba(255,255,255,0.25)':undefined}}>{getInitials(name)}</div>;
}

function Badge({cls='badge-gray',children}) { return <span className={`badge ${cls}`}>{children}</span>; }

function TypeBadge({type}) {
  const map={salary:['badge-blue','Salary'],commission:['badge-green','Commission'],salary_commission:['badge-purple','Sal+Comm']};
  const [cls,label]=map[type]||['badge-gray',type];
  return <Badge cls={cls}>{label}</Badge>;
}

function StatusBadge({status}) {
  const map={active:'badge-green',inactive:'badge-gray',resigned:'badge-amber',terminated:'badge-red',approved:'badge-green',rejected:'badge-red',pending:'badge-amber',paid:'badge-green',completed:'badge-teal',in_progress:'badge-blue'};
  return <Badge cls={map[status]||'badge-gray'}>{status?.replace('_',' ')}</Badge>;
}

function SCard({icon,label,value,sub,color='blue'}) {
  const colors={blue:{bg:'#dbeafe',ic:'var(--blue)'},green:{bg:'var(--green-light)',ic:'var(--green)'},red:{bg:'var(--red-light)',ic:'var(--red)'},amber:{bg:'var(--amber-light)',ic:'var(--amber)'},purple:{bg:'var(--purple-light)',ic:'var(--purple)'},teal:{bg:'var(--teal-light)',ic:'var(--teal)'}};
  const c=colors[color]||colors.blue;
  return (
    <div className="stat-card">
      <div className="stat-top">
        <div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
        <div className="stat-icon-box" style={{background:c.bg}}><span style={{fontSize:20,color:c.ic}}>{icon}</span></div>
      </div>
      {sub&&<div className="stat-trend neutral">{sub}</div>}
    </div>
  );
}

function Toast({msg,type,onClose}) {
  useEffect(()=>{const t=setTimeout(onClose,3000);return()=>clearTimeout(t);},[]);
  const cls={success:'toast-success',error:'toast-error',info:'toast-info'}[type]||'toast-info';
  return <div className={`toast ${cls}`}>{type==='success'?'✓':type==='error'?'✕':'ℹ'} {msg}</div>;
}

function Modal({open,onClose,title,children,footer,size='',noPad=false}) {
  if(!open) return null;
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`modal ${size}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {!noPad&&<div className="modal-body">{children}</div>}
        {noPad&&children}
        {footer&&<div className="modal-footer no-print">{footer}</div>}
      </div>
    </div>
  );
}

function SectionHeader({title,sub,action}) {
  return (
    <div className="section-header">
      <div><div className="section-title">{title}</div>{sub&&<div className="section-sub">{sub}</div>}</div>
      {action}
    </div>
  );
}

function Empty({icon,text,sub,action}) {
  return <div className="empty"><div className="empty-icon">{icon}</div><div className="empty-text">{text}</div>{sub&&<div className="empty-sub">{sub}</div>}{action&&<div style={{marginTop:16}}>{action}</div>}</div>;
}

function ExpiryRow({label,date,days}) {
  return (
    <div className="expiry-item">
      <div><div className="expiry-name">{label}</div><div className="expiry-sub">{fmtDate(date)}</div></div>
      <Badge cls={expiryBadge(days)}>{expiryLabel(days)}</Badge>
    </div>
  );
}

/* === CALENDAR MINI === */
function CalendarMini({records=[], year=2026, month=0}) {
  const days=['Su','Mo','Tu','We','Th','Fr','Sa'];
  const totalDays=new Date(year,month+1,0).getDate();
  const firstDow=new Date(year,month,1).getDay();
  const clsMap={present:'present',absent:'absent',leave:'leave',sick:'sick',weekend:'weekend'};
  const byDate={};
  (records||[]).forEach(r=>{ if(r.date) byDate[r.date]=r.status; });
  const cells=[...Array(firstDow).fill(null),...Array.from({length:totalDays},(_,i)=>{
    const d=i+1;
    const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow=new Date(year,month,d).getDay();
    const isWE=dow===5||dow===6;
    const status=byDate[dateStr]||(isWE?'weekend':'');
    return {date:dateStr,day:d,status,isWE,dow};
  })];
  return (
    <div>
      <div className="cal-header-row">{days.map((d,i)=><div key={d} className="cal-header" style={{color:i===5||i===6?'var(--red)':undefined}}>{d}</div>)}</div>
      <div className="calendar-grid">
        {cells.map((r,i)=>{
          if(!r) return <div key={'e'+i} className="cal-day empty"/>;
          return <div key={r.date} className={`cal-day ${clsMap[r.status]||''}`} title={r.status} style={r.isWE?{opacity:.6}:undefined}>{r.day}</div>;
        })}
      </div>
      <div className="att-legend">
        {[['#d1fae5','Present'],['#fee2e2','Absent'],['#ede9fe','Leave'],['#fef3c7','Sick'],['#f1f5f9','Weekend']].map(([bg,l])=>(
          <div key={l} className="att-legend-item"><div className="att-dot" style={{background:bg}}/>{l}</div>
        ))}
      </div>
    </div>
  );
}

/* === RECEIPT COMPONENTS + PDF EXPORT === */
/* Shared receipt inner HTML — rendered into a hidden off-screen div for PDF capture */
function buildReceiptHTML(type, rec, emp) {
  if(!rec||!emp) return '';
  const fmt = n => 'AED '+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const dt = d => { if(!d) return '—'; try{return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}catch{return d;} };

  if(type==='salary') {
    const earnings = [['Basic Salary', rec.basic]];
    if(rec.housing>0) earnings.push(['SIM Card Allow', rec.housing]);
    if(rec.transport>0) earnings.push(['Transport Allowance', rec.transport]);
    if(rec.bonus>0) earnings.push(['Bonus / Incentive', rec.bonus]);
    const gross = earnings.reduce((a,[,v])=>a+(+v||0),0);
    const ded = rec.deductions||0;
    const dedLabel = rec.deductionNote||'Deductions';

    return `<div style="font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;background:#fff;color:#0f172a;">
      <div style="text-align:center;border-bottom:3px solid #0f172a;padding-bottom:20px;margin-bottom:24px;">
        <div style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">&#127970; NASAMA REAL ESTATE</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px;">Binghatti Emerald, Office 218, JVC, Dubai &nbsp;|&nbsp; www.nasamaproperties.com &nbsp;|&nbsp; HR Department</div>
        <div style="font-size:17px;font-weight:700;color:#2563eb;margin-top:12px;text-transform:uppercase;letter-spacing:1px;">Salary Slip</div>
        <div style="font-size:13px;color:#475569;margin-top:4px;">${rec.month}${rec.payDate?' | Payment Date: '+dt(rec.payDate):''}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin-bottom:22px;">
        ${[['Employee Name',emp.name],['Employee ID',emp.id],['Job Title',emp.title],['Department',emp.dept],['Employment Type',(emp.type||'').replace('_',' ')],['Pay Period',rec.month]].map(([l,v])=>`
        <tr><td style="padding:7px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;width:45%;">${l}</td>
            <td style="padding:7px 14px;font-size:13px;font-weight:600;color:#0f172a;">${v||'—'}</td></tr>`).join('')}
      </table>
      <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:8px;">Earnings</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:${ded>0?'16':'0'}px;">
        <tr style="background:#f1f5f9;"><th style="padding:8px 0;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;text-align:left;">Description</th><th style="padding:8px 0;font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;text-align:right;">Amount (AED)</th></tr>
        ${earnings.map(([d,a])=>`<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;">${d}</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${Number(a||0).toLocaleString()}</td></tr>`).join('')}
      </table>
      ${ded>0?`<div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:8px;margin-top:16px;">Deductions</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:0px;">
        <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;">${dedLabel}</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;color:#dc2626;">(${Number(ded).toLocaleString()})</td></tr>
      </table>`:''}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 0;border-top:3px solid #0f172a;margin-top:10px;">
        <div style="font-size:16px;font-weight:700;">NET PAY</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;">${fmt(rec.net)}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;text-align:center;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;">
        <div><div style="border-top:1px solid #cbd5e1;padding-top:6px;margin-top:32px;font-size:11px;color:#64748b;">Employee Signature</div><div style="font-size:11px;color:#94a3b8;margin-top:4px;">${emp.name}</div></div>
        <div><div style="border-top:1px solid #cbd5e1;padding-top:6px;margin-top:32px;font-size:11px;color:#64748b;">Authorized By</div><div style="font-size:11px;color:#94a3b8;margin-top:4px;">HR Department</div></div>
      </div>
      ${rec.notes?`<div style="margin-top:16px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:12px;color:#64748b;border-left:3px solid #cbd5e1;">Note: ${rec.notes}</div>`:''}
      <div style="text-align:center;margin-top:24px;font-size:10px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
        Generated by Nasama HR System &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
      </div>
    </div>`;
  }

  // Commission receipt
  return `<div style="font-family:Arial,sans-serif;padding:40px;max-width:580px;margin:0 auto;background:#fff;color:#0f172a;">
    <div style="text-align:center;border-bottom:3px solid #0f172a;padding-bottom:20px;margin-bottom:24px;">
      <div style="font-size:22px;font-weight:800;color:#0f172a;letter-spacing:-0.5px;">&#127970; NASAMA REAL ESTATE</div>
      <div style="font-size:12px;color:#64748b;margin-top:4px;">Binghatti Emerald, Office 218, JVC, Dubai &nbsp;|&nbsp; www.nasamaproperties.com &nbsp;|&nbsp; Finance Department</div>
      <div style="font-size:17px;font-weight:700;color:#059669;margin-top:12px;text-transform:uppercase;letter-spacing:1px;">Commission Receipt</div>
      <div style="font-size:13px;color:#475569;margin-top:4px;">Transaction Date: ${dt(rec.txDate)}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;margin-bottom:22px;">
      ${[['Broker Name',emp.name],['Employee ID',emp.id],['Job Title',emp.title],['Department',emp.dept],['Receipt No',rec.id],['Payment Date',rec.payDate?dt(rec.payDate):'Pending']].map(([l,v])=>`
      <tr><td style="padding:7px 14px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px;width:45%;">${l}</td>
          <td style="padding:7px 14px;font-size:13px;font-weight:600;color:#0f172a;">${v||'—'}</td></tr>`).join('')}
    </table>
    <div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:8px;">Transaction Details</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;color:#64748b;">Deal Reference</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${rec.deal||'—'}</td></tr>
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;color:#64748b;">Client Name</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${rec.client||'—'}</td></tr>
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;color:#64748b;">Property / Location</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${rec.property||'—'}</td></tr>
      ${rec.propVal>0?`<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;color:#64748b;">Property Value</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${fmt(rec.propVal)}</td></tr>`:''}
      <tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;color:#64748b;">Broker Commission</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${rec.rate||0}%</td></tr>
      ${rec.approvedBy?`<tr style="border-bottom:1px solid #e2e8f0;"><td style="padding:8px 0;font-size:13px;color:#64748b;">Approved By</td><td style="padding:8px 0;font-size:13px;font-weight:600;text-align:right;">${rec.approvedBy}</td></tr>`:''}
    </table>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 0;border-top:3px solid #0f172a;margin-top:10px;">
      <div style="font-size:16px;font-weight:700;">COMMISSION AMOUNT</div>
      <div style="font-size:22px;font-weight:800;color:#0f172a;">${fmt(rec.amount)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;text-align:center;margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;">
      <div><div style="border-top:1px solid #cbd5e1;padding-top:6px;margin-top:32px;font-size:11px;color:#64748b;">Broker Signature</div><div style="font-size:11px;color:#94a3b8;margin-top:4px;">${emp.name}</div></div>
      <div><div style="border-top:1px solid #cbd5e1;padding-top:6px;margin-top:32px;font-size:11px;color:#64748b;">Authorized By</div><div style="font-size:11px;color:#94a3b8;margin-top:4px;">Finance Department</div></div>
    </div>
    ${rec.notes?`<div style="margin-top:16px;padding:8px 12px;background:#f8fafc;border-radius:6px;font-size:12px;color:#64748b;border-left:3px solid #cbd5e1;">Note: ${rec.notes}</div>`:''}
    <div style="text-align:center;margin-top:24px;font-size:10px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:12px;">
      Generated by Nasama HR System &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}
    </div>
  </div>`;
}

/* Core PDF export function — captures the hidden receipt div into a jsPDF */
async function exportReceiptPDF(type, rec, emp, onStart, onDone) {
  if(!window.jspdf||!window.html2canvas) {
    alert('PDF libraries still loading. Please wait a moment and try again.');
    return;
  }
  onStart?.();
  try {
    // Create off-screen container
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:620px;background:#fff;z-index:-1;';
    wrap.innerHTML = buildReceiptHTML(type, rec, emp);
    document.body.appendChild(wrap);

    // Wait for fonts/layout
    await new Promise(r=>setTimeout(r,120));

    const canvas = await window.html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });
    document.body.removeChild(wrap);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW - 20; // 10mm margin each side
    const imgH = (canvas.height * imgW) / canvas.width;

    let y = 10;
    if(imgH <= pageH - 20) {
      // Fits on one page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, y, imgW, imgH);
    } else {
      // Multi-page: slice canvas into A4-height chunks
      const ratio = canvas.width / imgW;
      const sliceH = Math.floor((pageH - 20) * ratio);
      let srcY = 0;
      while(srcY < canvas.height) {
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = Math.min(sliceH, canvas.height - srcY);
        sliceCanvas.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        const h = (sliceCanvas.height * imgW) / canvas.width;
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 10, y, imgW, h);
        srcY += sliceH;
        if(srcY < canvas.height) { pdf.addPage(); y = 10; }
      }
    }

    const safeName = (emp.name||'').replace(/[^a-zA-Z0-9 ]/g,'').replace(/\s+/g,'_');
    const period = type==='salary' ? (rec.month||'').replace(/\s/g,'_') : (rec.txDate||'').slice(0,7);
    pdf.save(`Nasama_${type==='salary'?'SalarySlip':'CommissionReceipt'}_${safeName}_${period}.pdf`);
  } catch(err) {
    console.error('PDF export failed:', err);
    alert('PDF export failed: '+err.message);
  }
  onDone?.();
}

/* ── Shared ReceiptModal component ── */
function ReceiptModal({open, onClose, type, rec, emp}) {
  const [generating, setGenerating] = useState(false);
  if(!open||!rec||!emp) return null;

  function doExport() {
    exportReceiptPDF(type, rec, emp, ()=>setGenerating(true), ()=>setGenerating(false));
  }

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <span className="modal-title">{type==='salary'?'Salary Slip':'Commission Receipt'}</span>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{padding:'24px',overflowY:'auto',maxHeight:'70vh'}}>
          {/* Live preview rendered from the same data */}
          {type==='salary'
            ? <SalaryReceiptPreview rec={rec} emp={emp}/>
            : <CommissionReceiptPreview rec={rec} emp={emp}/>}
        </div>
        <div className="modal-footer no-print" style={{gap:8}}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-ghost" onClick={()=>window.print()} style={{display:'flex',alignItems:'center',gap:6}}>
            🖨️ Print
          </button>
          <button className="btn btn-primary" onClick={doExport} disabled={generating} style={{minWidth:130,display:'flex',alignItems:'center',gap:6}}>
            {generating
              ? <><span style={{display:'inline-block',width:14,height:14,border:'2px solid rgba(255,255,255,.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite'}}/> Generating...</>
              : <>⬇ Download PDF</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* React preview versions (identical content, rendered as JSX) */
function SalaryReceiptPreview({rec, emp}) {
  if(!rec||!emp) return null;
  const earnings=[['Basic Salary',rec.basic]];
  if(rec.housing>0) earnings.push(['SIM Card Allow',rec.housing]);
  if(rec.transport>0) earnings.push(['Transport Allowance',rec.transport]);
  if(rec.bonus>0) earnings.push(['Bonus / Incentive',rec.bonus]);
  const deductions=[];
  if((rec.deductions||0)>0) deductions.push([rec.deductionNote||'Deductions',rec.deductions]);
  return (
    <div className="receipt">
      <div className="receipt-header">
        <div className="receipt-logo">🏢 NASAMA REAL ESTATE</div>
        <div className="receipt-subtitle">Binghatti Emerald, Office 218, JVC, Dubai &nbsp;|&nbsp; www.nasamaproperties.com &nbsp;|&nbsp; HR Department</div>
        <div className="receipt-type">Salary Slip</div>
        <div className="receipt-period">{rec.month}{rec.payDate&&` | Payment Date: ${fmtDate(rec.payDate)}`}</div>
      </div>
      <div className="receipt-emp">
        {[['Employee Name',emp.name],['Employee ID',emp.id],['Job Title',emp.title],['Department',emp.dept],['Employment Type',(emp.type||'').replace('_',' ')],['Pay Period',rec.month]].map(([l,v])=>(
          <div key={l} className="receipt-emp-item"><div className="receipt-emp-label">{l}</div><div className="receipt-emp-value">{v||'—'}</div></div>
        ))}
      </div>
      <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text2)',marginBottom:8}}>Earnings</div>
      <table className="receipt-table">
        <thead><tr><th>Description</th><th style={{textAlign:'right'}}>Amount (AED)</th></tr></thead>
        <tbody>{earnings.map(([d,a])=><tr key={d}><td>{d}</td><td style={{textAlign:'right',fontWeight:600}}>{(+a||0).toLocaleString()}</td></tr>)}</tbody>
      </table>
      {deductions.length>0&&<>
        <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text2)',marginBottom:8,marginTop:14}}>Deductions</div>
        <table className="receipt-table">
          <tbody>{deductions.map(([d,a])=><tr key={d}><td style={{fontSize:12}}>{d}</td><td style={{textAlign:'right',fontWeight:600,color:'var(--red)'}}>({(+a||0).toLocaleString()})</td></tr>)}</tbody>
        </table>
      </>}
      <div className="receipt-total">
        <div className="receipt-total-label">NET PAY</div>
        <div className="receipt-total-amount">{fmtMoney(rec.net)}</div>
      </div>
      <div className="receipt-footer">
        <div><div className="receipt-sig">Employee Signature</div><div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{emp.name}</div></div>
        <div><div className="receipt-sig">Authorized By</div><div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>HR Department</div></div>
      </div>
      {rec.notes&&<div style={{marginTop:14,padding:'8px 12px',background:'var(--bg2)',borderRadius:6,fontSize:12,color:'var(--text2)'}}>Note: {rec.notes}</div>}
      <div style={{textAlign:'center',marginTop:20,fontSize:10,color:'var(--text3)',borderTop:'1px solid var(--border)',paddingTop:10}}>Generated by Nasama HR System</div>
    </div>
  );
}

function CommissionReceiptPreview({rec, emp}) {
  if(!rec||!emp) return null;
  return (
    <div className="receipt">
      <div className="receipt-header">
        <div className="receipt-logo">🏢 NASAMA REAL ESTATE</div>
        <div className="receipt-subtitle">Binghatti Emerald, Office 218, JVC, Dubai &nbsp;|&nbsp; www.nasamaproperties.com &nbsp;|&nbsp; Finance Department</div>
        <div className="receipt-type" style={{color:'var(--green)'}}>Commission Receipt</div>
        <div className="receipt-period">Transaction Date: {fmtDate(rec.txDate)}</div>
      </div>
      <div className="receipt-emp">
        {[['Broker Name',emp.name],['Employee ID',emp.id],['Job Title',emp.title],['Department',emp.dept],['Receipt No',rec.id],['Payment Date',rec.payDate?fmtDate(rec.payDate):'Pending']].map(([l,v])=>(
          <div key={l} className="receipt-emp-item"><div className="receipt-emp-label">{l}</div><div className="receipt-emp-value">{v||'—'}</div></div>
        ))}
      </div>
      <div style={{fontWeight:700,fontSize:12,textTransform:'uppercase',letterSpacing:'.5px',color:'var(--text2)',marginBottom:8}}>Transaction Details</div>
      <table className="receipt-table">
        <tbody>
          <tr><td>Deal Reference</td><td style={{textAlign:'right',fontWeight:600}}>{rec.deal||'—'}</td></tr>
          <tr><td>Client Name</td><td style={{textAlign:'right',fontWeight:600}}>{rec.client||'—'}</td></tr>
          <tr><td>Property / Location</td><td style={{textAlign:'right',fontWeight:600}}>{rec.property||'—'}</td></tr>
          {(rec.propVal||0)>0&&<tr><td>Property Value</td><td style={{textAlign:'right',fontWeight:600}}>{fmtMoney(rec.propVal)}</td></tr>}
          <tr><td>Broker Commission</td><td style={{textAlign:'right',fontWeight:600}}>{rec.rate||0}%</td></tr>
          {rec.approvedBy&&<tr><td>Approved By</td><td style={{textAlign:'right',fontWeight:600}}>{rec.approvedBy}</td></tr>}
        </tbody>
      </table>
      <div className="receipt-total">
        <div className="receipt-total-label">COMMISSION AMOUNT</div>
        <div className="receipt-total-amount">{fmtMoney(rec.amount)}</div>
      </div>
      <div className="receipt-footer">
        <div><div className="receipt-sig">Broker Signature</div><div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{emp.name}</div></div>
        <div><div className="receipt-sig">Authorized By</div><div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Finance Department</div></div>
      </div>
      {rec.notes&&<div style={{marginTop:14,padding:'8px 12px',background:'var(--bg2)',borderRadius:6,fontSize:12,color:'var(--text2)'}}>Note: {rec.notes}</div>}
      <div style={{textAlign:'center',marginTop:20,fontSize:10,color:'var(--text3)',borderTop:'1px solid var(--border)',paddingTop:10}}>Generated by Nasama HR System</div>
    </div>
  );
}

/* === ADD / EDIT EMPLOYEE MODAL === */
function EmployeeFormModal({open,onClose,initial,onSave,employees:allEmployees}) {
  const blank={id:'',name:'',nationality:'',email:'',phone:'',title:'',dept:'Sales',joined:today(),type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:today(),contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''};
  const [f,setF]=useState(initial||blank);
  useEffect(()=>{setF(initial||blank);},[initial,open]);
  function upd(k){return e=>setF(p=>({...p,[k]:e.target.value}));}
  // Other employees (for manager dropdown) — exclude self
  const managerOptions=(allEmployees||[]).filter(e=>e.id!==f.id&&e.status==='active');
  // Others = all employees except the one being edited
  const others=(allEmployees||[]).filter(e=>e.id!==initial?.id);

  // Uniqueness checks (live)
  const dupEmail = f.email.trim() && others.find(e=>e.email.toLowerCase()===f.email.trim().toLowerCase());
  const dupPhone = f.phone.trim() && others.find(e=>e.phone&&e.phone===f.phone.trim());
  const dupId = f.id.trim() && others.find(e=>e.id===f.id.trim());
  const dupRera = f.reraNo && f.reraNo.trim() && others.find(e=>e.reraNo&&e.reraNo===f.reraNo.trim());
  // Similar name detection (same last name + similar first)
  const nameParts = f.name.trim().toLowerCase().split(/\s+/);
  const dupName = nameParts.length>=2 && others.find(e=>{
    const p=e.name.toLowerCase().split(/\s+/);
    return p.length>=2 && p[p.length-1]===nameParts[nameParts.length-1] && p[0]!==nameParts[0]
      && (p[0].slice(0,4)===nameParts[0].slice(0,4)); // first 4 chars match = likely variant
  });

  function save(){
    if(!f.name.trim())return alert('Name is required');
    if(!f.email.trim())return alert('Email is required');
    // Block hard duplicates
    if(dupEmail) return alert('Email "'+f.email+'" is already used by '+dupEmail.name+' ('+dupEmail.id+'). Each employee must have a unique email.');
    if(dupId) return alert('Employee ID "'+f.id+'" is already used by '+dupId.name+'. Please use a different ID or leave blank to auto-generate.');
    // Warn on soft duplicates (allow override)
    const warnings=[];
    if(dupPhone) warnings.push('Phone "'+f.phone+'" is already used by '+dupPhone.name+' ('+dupPhone.id+')');
    if(dupRera) warnings.push('RERA No "'+f.reraNo+'" is already used by '+dupRera.name+' ('+dupRera.id+')');
    if(dupName) warnings.push('Similar name found: "'+dupName.name+'" ('+dupName.id+') — possible duplicate?');
    if(warnings.length>0) {
      if(!confirm('⚠ Potential duplicates detected:\n\n• '+warnings.join('\n• ')+'\n\nSave anyway?')) return;
    }
    const emp={...f,salary:+f.salary||0,housing:+f.housing||0,transport:+f.transport||0,leaveBalance:+f.leaveBalance||21,leaveTaken:+f.leaveTaken||0};
    if(!emp.id) emp.id='EMP'+String(Date.now()).slice(-5);
    onSave(emp);onClose();
  }

  // Inline warning helper
  function DupWarn({dup,field}) {
    if(!dup) return null;
    return <div style={{fontSize:10,color:'var(--red)',marginTop:3,fontWeight:600}}>⚠ {field} already used by {dup.name} ({dup.id})</div>;
  }
  const depts=['Sales','Operations','HR','Finance','Marketing','Management','Legal'];
  const types=[['salary','Fixed Salary'],['commission','Commission Only'],['salary_commission','Salary + Commission']];
  const statuses=[['active','Active'],['inactive','Inactive'],['resigned','Resigned'],['terminated','Terminated']];
  return (
    <Modal open={open} onClose={onClose} title={initial?.id?'Edit Employee':'Add New Employee'} size="modal-lg"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{initial?.id?'Save Changes':'Add Employee'}</button></>}>
      <div className="form-section">
        <div className="form-section-title">Personal Information</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={f.name} onChange={upd('name')} placeholder="e.g. John Smith" style={dupName?{borderColor:'var(--amber)'}:{}}/>{dupName&&<div style={{fontSize:10,color:'var(--amber)',marginTop:3,fontWeight:600}}>⚠ Similar to {dupName.name} ({dupName.id}) — possible duplicate?</div>}</div>
          <div className="form-group"><label className="form-label">Nationality</label><input className="form-input" value={f.nationality} onChange={upd('nationality')} placeholder="e.g. UAE"/></div>
          <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" value={f.email} onChange={upd('email')} placeholder="name@nasama.ae" style={dupEmail?{borderColor:'var(--red)'}:{}}/><DupWarn dup={dupEmail} field="Email"/></div>
          <div className="form-group"><label className="form-label">Mobile</label><input className="form-input" value={f.phone} onChange={upd('phone')} placeholder="+971 50 000 0000" style={dupPhone?{borderColor:'var(--amber)'}:{}}/><DupWarn dup={dupPhone} field="Phone"/></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title">Job Information</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Job Title</label><input className="form-input" value={f.title} onChange={upd('title')} placeholder="e.g. Senior Broker"/></div>
          <div className="form-group"><label className="form-label">Department</label><select className="form-select" value={f.dept} onChange={upd('dept')}>{depts.map(d=><option key={d}>{d}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Joining Date</label><input className="form-input" type="date" value={f.joined} onChange={upd('joined')}/></div>
          <div className="form-group"><label className="form-label">Status</label><select className="form-select" value={f.status} onChange={upd('status')}>{statuses.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Manager / Reports To</label>
            <select className="form-select" value={f.manager} onChange={upd('manager')}>
              <option value="">— No Manager —</option>
              {managerOptions.map(e=><option key={e.id} value={e.id}>{e.name} — {e.title||e.dept}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Employee ID</label><input className="form-input" value={f.id} onChange={upd('id')} placeholder="Auto-generated if empty" style={dupId?{borderColor:'var(--red)'}:{}}/><div className="field-hint">Leave blank to auto-generate</div><DupWarn dup={dupId} field="Employee ID"/></div>
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title">Compensation</div>
        <div className="form-group"><label className="form-label">Employment Type</label>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            {types.map(([v,l])=><label key={v} style={{display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer',padding:'7px 12px',border:`1px solid ${f.type===v?'var(--blue)':'var(--border)'}`,borderRadius:8,background:f.type===v?'var(--blue-light)':'#fff',fontWeight:f.type===v?600:400,color:f.type===v?'var(--blue)':'var(--text2)'}}>
              <input type="radio" value={v} checked={f.type===v} onChange={upd('type')} style={{display:'none'}}/>{l}</label>)}
          </div>
        </div>
        <div className="form-grid3">
          {(f.type==='salary'||f.type==='salary_commission')&&<div className="form-group"><label className="form-label">Basic Salary (AED)</label><input className="form-input" type="number" value={f.salary} onChange={upd('salary')}/></div>}
          {(f.type==='salary'||f.type==='salary_commission')&&<><div className="form-group"><label className="form-label">SIM Card Allow. (AED)</label><input className="form-input" type="number" value={f.housing} onChange={upd('housing')}/></div>
          <div className="form-group"><label className="form-label">Transport Allow. (AED)</label><input className="form-input" type="number" value={f.transport} onChange={upd('transport')}/></div></>}
        </div>
      </div>
      <div className="form-section">
        <div className="form-section-title">Documents & Contract</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Passport Expiry</label><input className="form-input" type="date" value={f.passExpiry} onChange={upd('passExpiry')}/></div>
          <div className="form-group"><label className="form-label">Visa Expiry</label><input className="form-input" type="date" value={f.visaExpiry} onChange={upd('visaExpiry')}/></div>
          <div className="form-group"><label className="form-label">Emirates ID Expiry</label><input className="form-input" type="date" value={f.emiratesId} onChange={upd('emiratesId')}/></div>
          <div className="form-group"><label className="form-label">RERA Number</label><input className="form-input" value={f.reraNo||''} onChange={upd('reraNo')} placeholder="e.g. 64897" style={dupRera?{borderColor:'var(--amber)'}:{}}/><DupWarn dup={dupRera} field="RERA No"/></div>
          <div className="form-group"><label className="form-label">RERA Expiry</label><input className="form-input" type="date" value={f.reraExp||''} onChange={upd('reraExp')}/></div>
          <div className="form-group"><label className="form-label">Contract Start</label><input className="form-input" type="date" value={f.contractStart} onChange={upd('contractStart')}/></div>
          <div className="form-group"><label className="form-label">Contract End</label><input className="form-input" type="date" value={f.contractEnd} onChange={upd('contractEnd')}/></div>
          <div className="form-group"><label className="form-label">Annual Leave Balance</label><input className="form-input" type="number" value={f.leaveBalance} onChange={upd('leaveBalance')}/></div>
        </div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows="2" value={f.notes} onChange={upd('notes')} placeholder="Any additional notes..."/></div>
    </Modal>
  );
}

/* === ADD SALARY MODAL === */
/* ── Month options helper ── */
function getMonthOptions() {
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const now=new Date();
  const opts=[];
  // Show 3 months back, current, and 1 month forward
  for(let offset=-3;offset<=1;offset++){
    const d=new Date(now.getFullYear(),now.getMonth()+offset,1);
    opts.push(months[d.getMonth()]+' '+d.getFullYear());
  }
  return opts;
}

function AddSalaryModal({open,onClose,employees,salaryRecs,onSave}) {
  const salaryEmps=employees.filter(e=>e.type==='salary'||e.type==='salary_commission');
  const [f,setF]=useState({empId:'',month:'',basic:0,housing:0,transport:0,bonus:0,deductions:0,notes:''});
  const monthOpts=getMonthOptions();
  function upd(k){return e=>setF(p=>({...p,[k]:e.target.value}));}
  function pickEmp(e){
    const emp=employees.find(x=>x.id===e.target.value);
    if(emp) setF(p=>({...p,empId:emp.id,basic:emp.salary,housing:emp.housing||0,transport:emp.transport||0}));
    else setF(p=>({...p,empId:''}));
  }
  const net=(+f.basic||0)+(+f.housing||0)+(+f.transport||0)+(+f.bonus||0)-(+f.deductions||0);
  // Check for duplicate
  const isDuplicate=f.empId&&f.month&&salaryRecs&&salaryRecs.some(s=>s.empId===f.empId&&s.month===f.month);
  function save(){
    if(!f.empId||!f.month)return alert('Select employee and pay period');
    if(isDuplicate) return alert('A salary record already exists for this employee and period. Please edit the existing record instead.');
    if((+f.deductions||0)>0&&!f.deductionNote?.trim()) return alert('Please add a deduction reason.');
    onSave({id:'SAL'+nowId(),...f,basic:+f.basic,housing:+f.housing,transport:+f.transport,bonus:+f.bonus,deductions:+f.deductions,deductionNote:f.deductionNote||'',net,paid:false,payDate:''});
    onClose();setF({empId:'',month:'',basic:0,housing:0,transport:0,bonus:0,deductions:0,deductionNote:'',notes:''});
  }
  return (
    <Modal open={open} onClose={onClose} title="Record Salary Payment" size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={isDuplicate}>Save Record</button></>}>
      <div className="form-group"><label className="form-label">Employee</label>
        <select className="form-select" value={f.empId} onChange={pickEmp}><option value="">— Select Employee —</option>{salaryEmps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>
      </div>
      <div className="form-group"><label className="form-label">Pay Period</label>
        <select className="form-select" value={f.month} onChange={upd('month')}>
          <option value="">— Select Month —</option>
          {monthOpts.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        {isDuplicate&&<div style={{fontSize:11,color:'var(--red)',marginTop:4,fontWeight:600}}>⚠ A record already exists for {(employees.find(x=>x.id===f.empId)||{}).name||'this employee'} in {f.month}</div>}
      </div>
      <div className="form-grid">
        <div className="form-group"><label className="form-label">Basic (AED)</label><input className="form-input" type="number" value={f.basic} onChange={upd('basic')}/></div>
        <div className="form-group"><label className="form-label">SIM Card Allow. (AED)</label><input className="form-input" type="number" value={f.housing} onChange={upd('housing')}/></div>
        <div className="form-group"><label className="form-label">Transport (AED)</label><input className="form-input" type="number" value={f.transport} onChange={upd('transport')}/></div>
        <div className="form-group"><label className="form-label">Bonus (AED)</label><input className="form-input" type="number" value={f.bonus} onChange={upd('bonus')}/></div>
        <div className="form-group"><label className="form-label">Deductions (AED)</label><input className="form-input" type="number" value={f.deductions} onChange={upd('deductions')}/></div>
      </div>
      {(+f.deductions||0)>0&&(
        <div className="form-group">
          <label className="form-label">Deduction Reason <span style={{color:'var(--red)',fontSize:10}}>(required when deductions &gt; 0)</span></label>
          <input className="form-input" value={f.deductionNote||''} onChange={e=>setF(p=>({...p,deductionNote:e.target.value}))} placeholder="e.g. GPSSA — 5% of AED 10,000 basic (UAE national)"/>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>
            Common formulas: GPSSA = 5% × basic · Absent day = basic ÷ 26 · Half day = basic ÷ 26 ÷ 2
          </div>
        </div>
      )}
      <div style={{background:'var(--blue-light)',color:'var(--blue2)',borderRadius:8,padding:'10px 14px',fontWeight:700,fontSize:14,display:'flex',justifyContent:'space-between',marginBottom:12}}>
        <span>Net Pay</span><span>{fmtMoney(net)}</span>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={f.notes} onChange={upd('notes')} placeholder="Internal note (optional)"/></div>
    </Modal>
  );
}

/* === BATCH PAYROLL RUN MODAL === */
function BatchPayrollModal({open,onClose,employees,salaryRecs,onSave,showToast}) {
  const monthOpts=getMonthOptions();
  const [selMonth,setSelMonth]=useState('');
  const [step,setStep]=useState('config'); // config | preview | done
  const [preview,setPreview]=useState([]);
  const [excluded,setExcluded]=useState(new Set());
  const [generating,setGenerating]=useState(false);

  useEffect(()=>{setStep('config');setSelMonth('');setPreview([]);setExcluded(new Set());},[open]);

  const salaryEmps=employees.filter(e=>(e.type==='salary'||e.type==='salary_commission')&&e.status==='active');

  function generatePreview(){
    if(!selMonth) return alert('Please select a pay period');
    const existing=new Set(salaryRecs.filter(s=>s.month===selMonth).map(s=>s.empId));
    const eligible=salaryEmps.filter(e=>!existing.has(e.id));
    const alreadyHave=salaryEmps.filter(e=>existing.has(e.id));
    const recs=eligible.map(emp=>{
      const basic=+(emp.salary)||0;
      const housing=+(emp.housing)||0;
      const transport=+(emp.transport)||0;
      const net=basic+housing+transport;
      return {
        id:'SAL'+nowId()+emp.id.slice(-3),
        empId:emp.id,
        empName:emp.name,
        empTitle:emp.title,
        empDept:emp.dept,
        month:selMonth,
        basic,housing,transport,
        bonus:0,deductions:0,deductionNote:'',
        net,paid:false,payDate:'',notes:'Batch payroll run'
      };
    });
    setPreview(recs);
    setExcluded(new Set());
    setStep('preview');
    if(alreadyHave.length>0){
      showToast(alreadyHave.length+' employee'+(alreadyHave.length>1?'s':'')+' already have records for '+selMonth+' — skipped','info');
    }
  }

  function toggleExclude(empId){
    setExcluded(prev=>{const n=new Set(prev);if(n.has(empId))n.delete(empId);else n.add(empId);return n;});
  }

  function toggleAll(){
    if(excluded.size===0) setExcluded(new Set(preview.map(r=>r.empId)));
    else setExcluded(new Set());
  }

  const included=preview.filter(r=>!excluded.has(r.empId));
  const totalNet=included.reduce((a,r)=>a+r.net,0);
  const totalGross=included.reduce((a,r)=>a+(r.basic+r.housing+r.transport),0);

  function confirmRun(){
    if(included.length===0) return alert('No employees selected');
    setGenerating(true);
    // Small delay for UX feel
    setTimeout(()=>{
      const records=included.map(r=>({...r}));
      // Remove helper fields
      records.forEach(r=>{delete r.empName;delete r.empTitle;delete r.empDept;});
      onSave(records);
      setStep('done');
      setGenerating(false);
    },600);
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate Payroll Run" size="modal-lg"
      footer={
        step==='config'
          ? <><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={generatePreview}>Preview Payroll →</button></>
          : step==='preview'
          ? <><button className="btn btn-ghost" onClick={()=>setStep('config')}>← Back</button><button className="btn btn-primary" onClick={confirmRun} disabled={generating||included.length===0}>{generating?'Generating...':'✓ Confirm & Create '+included.length+' Records'}</button></>
          : <button className="btn btn-primary" onClick={onClose}>Done</button>
      }>

      {step==='config'&&(
        <div>
          <div style={{padding:'16px 20px',background:'var(--bg2)',borderRadius:10,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <span style={{fontSize:20}}>⚡</span>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'var(--text1)'}}>Batch Payroll Run</div>
                <div style={{fontSize:12,color:'var(--text2)'}}>Auto-generate salary records for all active salaried employees</div>
              </div>
            </div>
            <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.6,padding:'8px 12px',background:'#fff',borderRadius:8,border:'1px solid var(--border)'}}>
              This will create salary records pre-filled from each employee's profile (basic salary, housing & transport allowances). You can review and exclude employees before confirming. Employees who already have a record for the selected month will be automatically skipped.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Pay Period *</label>
            <select className="form-select" value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{fontSize:14,padding:'11px 14px'}}>
              <option value="">— Select Month —</option>
              {monthOpts.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
            <div style={{padding:'12px 14px',background:'var(--blue-light)',borderRadius:8,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Eligible Employees</div>
              <div style={{fontSize:22,fontWeight:800,color:'var(--blue2)'}}>{salaryEmps.length}</div>
              <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>Active salary & salary+commission</div>
            </div>
            <div style={{padding:'12px 14px',background:'var(--green-light)',borderRadius:8,border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:4}}>Already Recorded</div>
              <div style={{fontSize:22,fontWeight:800,color:'var(--green)'}}>{selMonth?salaryRecs.filter(s=>s.month===selMonth&&salaryEmps.some(e=>e.id===s.empId)).length:0}</div>
              <div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>{selMonth?'For '+selMonth:'Select a month'}</div>
            </div>
          </div>
        </div>
      )}

      {step==='preview'&&(
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div>
              <span style={{fontSize:14,fontWeight:700,color:'var(--text1)'}}>Preview — {selMonth}</span>
              <span style={{fontSize:12,color:'var(--text2)',marginLeft:8}}>{included.length} of {preview.length} selected</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={toggleAll}>{excluded.size===0?'Deselect All':'Select All'}</button>
          </div>

          {preview.length===0
            ? <div style={{padding:'40px 20px',textAlign:'center',color:'var(--text3)'}}>
                <div style={{fontSize:32,marginBottom:8}}>✅</div>
                <div style={{fontWeight:700,fontSize:14,color:'var(--text2)'}}>All employees already have records</div>
                <div style={{fontSize:12,marginTop:4}}>Every active salaried employee already has a salary record for {selMonth}.</div>
              </div>
            : <div style={{maxHeight:340,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8}}>
                <table>
                  <thead><tr>
                    <th style={{width:32,padding:'8px'}}></th>
                    <th>Employee</th>
                    <th style={{textAlign:'right'}}>Basic</th>
                    <th style={{textAlign:'right'}}>SIM Card</th>
                    <th style={{textAlign:'right'}}>Transport</th>
                    <th style={{textAlign:'right',borderLeft:'2px solid var(--border2)',fontWeight:800}}>Net Pay</th>
                  </tr></thead>
                  <tbody>
                    {preview.map(r=>{
                      const isExcluded=excluded.has(r.empId);
                      return (
                        <tr key={r.empId} style={{opacity:isExcluded?0.4:1,transition:'opacity .15s',cursor:'pointer'}} onClick={()=>toggleExclude(r.empId)}>
                          <td style={{padding:'8px',textAlign:'center'}}>
                            <div style={{width:18,height:18,borderRadius:4,border:'2px solid '+(isExcluded?'var(--border)':'var(--blue)'),background:isExcluded?'#fff':'var(--blue)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'all .15s'}}>
                              {!isExcluded&&<span style={{color:'#fff',fontSize:11,fontWeight:700}}>✓</span>}
                            </div>
                          </td>
                          <td>
                            <div style={{fontWeight:700,fontSize:13}}>{r.empName}</div>
                            <div style={{fontSize:11,color:'var(--text2)'}}>{r.empTitle} · {r.empDept}</div>
                          </td>
                          <td style={{textAlign:'right',fontWeight:600,fontSize:13}}>{fmtMoney(r.basic)}</td>
                          <td style={{textAlign:'right',fontSize:12,color:r.housing>0?'var(--text1)':'var(--text3)'}}>{r.housing>0?fmtMoney(r.housing):'—'}</td>
                          <td style={{textAlign:'right',fontSize:12,color:r.transport>0?'var(--text1)':'var(--text3)'}}>{r.transport>0?fmtMoney(r.transport):'—'}</td>
                          <td style={{textAlign:'right',fontWeight:800,fontSize:14,color:'var(--navy)',borderLeft:'2px solid var(--border2)',paddingLeft:14}}>{fmtMoney(r.net)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'var(--bg2)'}}>
                      <td></td>
                      <td style={{fontWeight:700,fontSize:12}}>Total — {included.length} employee{included.length!==1?'s':''}</td>
                      <td style={{textAlign:'right',fontWeight:700,fontSize:12}}>{fmtMoney(included.reduce((a,r)=>a+r.basic,0))}</td>
                      <td style={{textAlign:'right',fontWeight:600,fontSize:12}}>{fmtMoney(included.reduce((a,r)=>a+r.housing,0))}</td>
                      <td style={{textAlign:'right',fontWeight:600,fontSize:12}}>{fmtMoney(included.reduce((a,r)=>a+r.transport,0))}</td>
                      <td style={{textAlign:'right',fontWeight:800,fontSize:15,color:'var(--navy)',borderLeft:'2px solid var(--border2)',paddingLeft:14}}>{fmtMoney(totalNet)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>}

          {included.length>0&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:14}}>
              <div style={{padding:'10px 12px',background:'var(--bg2)',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Gross Payroll</div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--text1)'}}>{fmtMoney(totalGross)}</div>
              </div>
              <div style={{padding:'10px 12px',background:'var(--blue-light)',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Net Payroll</div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--blue2)'}}>{fmtMoney(totalNet)}</div>
              </div>
              <div style={{padding:'10px 12px',background:'var(--amber-light)',borderRadius:8,border:'1px solid var(--border)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Employees</div>
                <div style={{fontSize:16,fontWeight:800,color:'var(--amber)'}}>{included.length}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {step==='done'&&(
        <div style={{padding:'32px 20px',textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>🎉</div>
          <div style={{fontWeight:800,fontSize:18,color:'var(--text1)',marginBottom:6}}>Payroll Run Complete!</div>
          <div style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>
            Successfully created <strong>{included.length}</strong> salary record{included.length!==1?'s':''} for <strong>{selMonth}</strong>
          </div>
          <div style={{display:'inline-flex',gap:16,padding:'12px 20px',background:'var(--bg2)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:2}}>Net Total</div>
              <div style={{fontSize:16,fontWeight:800,color:'var(--navy)'}}>{fmtMoney(totalNet)}</div>
            </div>
            <div style={{width:1,background:'var(--border)'}}/>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:2}}>Status</div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--amber)'}}>⏳ Unpaid</div>
            </div>
          </div>
          <div style={{fontSize:12,color:'var(--text3)',marginTop:16}}>
            All records are created as "unpaid". Use the salary table to mark individual payments or pay all at once.
          </div>
        </div>
      )}
    </Modal>
  );
}

/* === ADD COMMISSION MODAL === */
function AddCommModal({open,onClose,employees,onSave,initial=null}) {
  const blank={empId:'',deal:'',client:'',property:'',txDate:today(),amount:'',rate:'',propVal:'',notes:''};
  const brokers=employees.filter(e=>e.type==='commission'||e.type==='salary_commission');
  const [f,setF]=useState(initial||blank);
  useEffect(()=>{setF(initial||blank);},[open]);
  function upd(k){return e=>setF(p=>({...p,[k]:e.target.value}));}
  function pickBroker(e){
    const emp=employees.find(x=>x.id===e.target.value);
    if(emp) setF(p=>({...p,empId:emp.id,rate:''}));
    else setF(p=>({...p,empId:''}));
  }
  // Auto-calculate amount when propVal and rate change
  const calcAmount = (+f.propVal||0)*(+f.rate||0)/100;
  function useCalc(){setF(p=>({...p,amount:Math.round(calcAmount)}));}
  function save(){
    if(!f.empId) return alert('Select a broker');
    if(!f.deal.trim()) return alert('Deal reference is required');
    if(!f.txDate) return alert('Transaction date is required');
    if(!(+f.amount>0)) return alert('Commission amount must be greater than 0');
    const rec={
      id: initial?.id||('COM'+nowId()),
      ...f,
      amount:+f.amount, rate:+f.rate, propVal:+f.propVal,
      status: initial?.status||'pending',
      submittedDate: initial?.submittedDate||today(),
      approvedBy: initial?.approvedBy||'',
      approvedDate: initial?.approvedDate||'',
      payDate: initial?.payDate||'',
      rejectedReason: initial?.rejectedReason||'',
    };
    onSave(rec); onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title={initial?.id?'Edit Commission Record':'New Commission Entry'} size="modal-lg"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{initial?.id?'Save Changes':'Submit for Review'}</button></>}>

      {/* Status flow hint */}
      {!initial?.id&&<div style={{display:'flex',alignItems:'center',gap:0,marginBottom:18,padding:'10px 14px',background:'var(--bg2)',borderRadius:8,fontSize:12}}>
        {[['1','Submit','pending'],['2','Review','approved'],['3','Settle','paid']].map(([n,l,s],i,arr)=>(
          <React.Fragment key={n}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <div style={{width:22,height:22,borderRadius:'50%',background:i===0?'var(--blue)':'var(--border)',color:i===0?'#fff':'var(--text3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>{n}</div>
              <span style={{fontWeight:i===0?700:400,color:i===0?'var(--blue2)':'var(--text3)'}}>{l}</span>
            </div>
            {i<arr.length-1&&<div style={{flex:1,height:1,background:'var(--border)',margin:'0 8px'}}/>}
          </React.Fragment>
        ))}
      </div>}

      <div className="form-section">
        <div className="form-section-title">Broker & Deal</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Broker *</label>
            <select className="form-select" value={f.empId} onChange={pickBroker}>
              <option value="">— Select Broker —</option>
              {brokers.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Transaction Date *</label>
            <input className="form-input" type="date" value={f.txDate} onChange={upd('txDate')}/>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Deal Reference *</label>
          <input className="form-input" value={f.deal} onChange={upd('deal')} placeholder="e.g. Palm Jumeirah Villa — Unit 502, Tower A"/>
        </div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Client Name</label>
            <input className="form-input" value={f.client} onChange={upd('client')} placeholder="Buyer / tenant name"/>
          </div>
          <div className="form-group"><label className="form-label">Property / Area</label>
            <input className="form-input" value={f.property} onChange={upd('property')} placeholder="e.g. Dubai Marina"/>
          </div>
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">Commission Calculation</div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Total Commission (AED)</label>
            <input className="form-input" type="number" value={f.propVal} onChange={upd('propVal')} placeholder="0"/>
          </div>
          <div className="form-group"><label className="form-label">Broker Commission (%)</label>
            <input className="form-input" type="number" step=".1" value={f.rate} onChange={upd('rate')} placeholder="e.g. 3.0"/>
          </div>
        </div>
        {(+f.propVal>0&&+f.rate>0)&&(
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'var(--bg2)',borderRadius:8,marginBottom:12,fontSize:12}}>
            <span style={{color:'var(--text2)'}}>Calculated: {fmtMoney(+f.propVal)} × {f.rate}% = <strong style={{color:'var(--green)'}}>{fmtMoney(calcAmount)}</strong></span>
            <button className="btn btn-ghost btn-sm" onClick={useCalc} style={{fontSize:11}}>↑ Use this</button>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Commission Amount (AED) *</label>
          <input className="form-input" type="number" value={f.amount} onChange={upd('amount')} placeholder="Final agreed commission amount"/>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:3}}>Enter manually or use the calculated amount above. This is the amount that will appear on the receipt.</div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Supporting Notes</label>
        <textarea className="form-textarea" rows="2" value={f.notes} onChange={upd('notes')} placeholder="e.g. SPA signed, NOC obtained, transfer in progress..."/>
      </div>
    </Modal>
  );
}

/* ── Commission Review Modal (Approve / Reject) ── */
function CommReviewModal({open,onClose,rec,empName,onApprove,onReject}) {
  const [comment,setComment]=useState('');
  const [rejectReason,setRejectReason]=useState('');
  const [mode,setMode]=useState('review'); // 'review' | 'reject'
  useEffect(()=>{setComment('');setRejectReason('');setMode('review');},[open]);
  if(!rec) return null;
  return (
    <Modal open={open} onClose={onClose} title="Review Commission" size="modal-sm"
      footer={mode==='review'
        ? <><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-danger" onClick={()=>setMode('reject')}>✕ Reject</button>
            <button className="btn btn-success" onClick={()=>{onApprove(comment);onClose();}}>✓ Approve</button></>
        : <><button className="btn btn-ghost" onClick={()=>setMode('review')}>← Back</button>
            <button className="btn btn-danger" onClick={()=>{if(!rejectReason.trim())return alert('Rejection reason is required');onReject(rejectReason);onClose();}}>Confirm Rejection</button></>}>
      <div style={{background:'var(--bg2)',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
        {[['Broker',empName],['Deal',rec.deal],['Client',rec.client||'—'],['Property',rec.property||'—'],['Transaction Date',fmtDate(rec.txDate)],['Property Value',rec.propVal>0?fmtMoney(rec.propVal):'—'],['Rate',rec.rate+'%'],['Commission',fmtMoney(rec.amount)],['Submitted',fmtDate(rec.submittedDate)]].map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
            <span style={{color:'var(--text2)',fontSize:12}}>{l}</span>
            <span style={{fontWeight:l==='Commission'?800:600,color:l==='Commission'?'var(--green)':'var(--text1)'}}>{v}</span>
          </div>
        ))}
        {rec.notes&&<div style={{marginTop:8,fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>Note: {rec.notes}</div>}
      </div>
      {mode==='review'&&<div className="form-group"><label className="form-label">Approval Comment (optional)</label>
        <textarea className="form-textarea" rows="2" value={comment} onChange={e=>setComment(e.target.value)} placeholder="e.g. SPA verified, all documents confirmed..."/>
      </div>}
      {mode==='reject'&&<>
        <div style={{background:'var(--red-light)',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 12px',marginBottom:12,fontSize:13,color:'#991b1b',fontWeight:600}}>
          This will reject the commission and notify the broker. Provide a clear reason.
        </div>
        <div className="form-group"><label className="form-label">Rejection Reason *</label>
          <textarea className="form-textarea" rows="3" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="e.g. SPA not signed by both parties. Please resubmit with complete documentation."/>
        </div>
      </>}
    </Modal>
  );
}

/* ── Commission Settlement Modal (Record Payment) ── */
function CommSettleModal({open,onClose,rec,empName,onSettle}) {
  const [payDate,setPayDate]=useState(today());
  const [method,setMethod]=useState('Bank Transfer');
  const [ref,setRef]=useState('');
  useEffect(()=>{setPayDate(today());setMethod('Bank Transfer');setRef('');},[open]);
  if(!rec) return null;
  return (
    <Modal open={open} onClose={onClose} title="Settle Commission Payment" size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-success" onClick={()=>{onSettle(payDate,method,ref);onClose();}}>✓ Confirm Settlement</button></>}>
      <div style={{background:'var(--green-light)',border:'1px solid #6ee7b7',borderRadius:8,padding:'12px 14px',marginBottom:16}}>
        <div style={{fontSize:12,color:'var(--green)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>Paying</div>
        <div style={{fontSize:20,fontWeight:800,color:'#064e3b'}}>{fmtMoney(rec.amount)}</div>
        <div style={{fontSize:13,color:'var(--green)',marginTop:2}}>to {empName} — {rec.deal}</div>
      </div>
      <div className="form-group"><label className="form-label">Payment Date</label>
        <input className="form-input" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/>
      </div>
      <div className="form-grid">
        <div className="form-group"><label className="form-label">Payment Method</label>
          <select className="form-select" value={method} onChange={e=>setMethod(e.target.value)}>
            {['Bank Transfer','Cash','Cheque','Internal Transfer'].map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Reference / Cheque No.</label>
          <input className="form-input" value={ref} onChange={e=>setRef(e.target.value)} placeholder="Optional"/>
        </div>
      </div>
    </Modal>
  );
}

/* === LEAVE APPROVAL MODAL === */
function LeaveApproveModal({open,onClose,leave,empName,emp,onAction}) {
  const [comment,setComment]=useState('');
  useEffect(()=>{if(open)setComment('');},[open]);
  if(!leave) return null;
  const isUnpaid = leave.type === 'Unpaid Leave';
  const currentBal = emp?.leaveBalance || 0;
  const afterBal = Math.max(0, currentBal - (leave.days||0));
  const insufficient = !isUnpaid && leave.days > currentBal;
  return (
    <Modal open={open} onClose={onClose} title="Review Leave Request" size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" onClick={()=>{onAction('rejected',comment);onClose();}}>✕ Reject</button>
        <button className="btn btn-success" onClick={()=>{onAction('approved',comment);onClose();}} disabled={insufficient}>✓ Approve</button>
      </>}>
      <div style={{display:'grid',gap:10,marginBottom:16}}>
        {[['Employee',empName],['Type',leave.type],['From',fmtDate(leave.from)],['To',fmtDate(leave.to)],['Days Requested',leave.days+' day'+(leave.days!==1?'s':'')],['Requested On',fmtDate(leave.requestDate)]].map(([l,v])=>(
          <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:12,color:'var(--text2)'}}>{l}</span>
            <span style={{fontSize:13,fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>

      {/* Balance impact preview */}
      {!isUnpaid && (
        <div style={{padding:'12px 14px',borderRadius:8,marginBottom:14,background:insufficient?'var(--red-light)':'var(--blue-light)',border:'1px solid '+(insufficient?'#fca5a5':'var(--border)')}}>
          <div style={{fontSize:10,fontWeight:700,color:insufficient?'var(--red)':'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:6}}>
            {insufficient?'⚠ Insufficient Balance':'Balance Impact'}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:9,color:'var(--text3)'}}>Current</div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--text1)'}}>{currentBal}d</div>
            </div>
            <div style={{fontSize:16,color:'var(--text3)'}}>→</div>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:9,color:'var(--text3)'}}>Deduct</div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--red)'}}>-{leave.days}d</div>
            </div>
            <div style={{fontSize:16,color:'var(--text3)'}}>→</div>
            <div style={{textAlign:'center',flex:1}}>
              <div style={{fontSize:9,color:'var(--text3)'}}>After</div>
              <div style={{fontSize:18,fontWeight:800,color:afterBal<=5?'var(--red)':'var(--green)'}}>{afterBal}d</div>
            </div>
          </div>
          {insufficient&&<div style={{fontSize:11,color:'var(--red)',marginTop:8,fontWeight:600}}>Employee only has {currentBal} days available but is requesting {leave.days} days. You can still approve, but balance will go to 0.</div>}
        </div>
      )}
      {isUnpaid && (
        <div style={{padding:'10px 14px',borderRadius:8,marginBottom:14,background:'var(--bg2)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:12,color:'var(--text2)'}}>ℹ Unpaid leave — no deduction from annual leave balance.</div>
        </div>
      )}

      <div className="form-group"><label className="form-label">Comment (optional)</label>
        <textarea className="form-textarea" rows="2" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a note for the employee..."/>
      </div>
    </Modal>
  );
}

/* === MARK SALARY PAID MODAL === */
function MarkPaidModal({open,onClose,record,onSave}) {
  const [payDate,setPayDate]=useState(today());
  if(!record) return null;
  return (
    <Modal open={open} onClose={onClose} title="Mark as Paid" size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-success" onClick={()=>{onSave(payDate);onClose();}}>✓ Confirm Paid</button></>}>
      <p style={{fontSize:13,color:'var(--text2)',marginBottom:16}}>Confirm payment of <strong>{fmtMoney(record.net)}</strong> for {record.month}.</p>
      <div className="form-group"><label className="form-label">Payment Date</label><input className="form-input" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></div>
    </Modal>
  );
}

/* === RESPOND TO REQUEST MODAL === */
function RespondRequestModal({open,onClose,req,empName,onAction}) {
  const [status,setStatus]=useState('in_progress');
  const [comment,setComment]=useState('');
  if(!req) return null;
  return (
    <Modal open={open} onClose={onClose} title="Respond to Request" size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={()=>{onAction(status,comment);onClose();}}>Update Status</button></>}>
      <div style={{marginBottom:16,padding:'10px 14px',background:'var(--bg2)',borderRadius:8}}>
        <div style={{fontSize:13,fontWeight:700}}>{req.type}</div>
        <div style={{fontSize:12,color:'var(--text2)',marginTop:3}}>From: {empName} · {fmtDate(req.requestDate)}</div>
        {req.reason&&<div style={{fontSize:12,color:'var(--text2)',marginTop:6}}>Purpose: {req.reason}</div>}
      </div>
      <div className="form-group"><label className="form-label">Update Status</label>
        <select className="form-select" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="form-group"><label className="form-label">Comments</label>
        <textarea className="form-textarea" rows="2" value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a note for the employee..."/>
      </div>
    </Modal>
  );
}

/* === MANUAL ATTENDANCE MODAL === */


/* === DASHBOARD === */
function Dashboard({employees,salaryRecs,commRecs,leaves,requests,attData}) {
  const active=employees.filter(e=>e.status==='active');
  const pendingLeaves=leaves.filter(l=>l.status==='pending');
  const pendingReqs=requests.filter(r=>r.status==='pending');
  const unpaidSal=salaryRecs.filter(s=>!s.paid);
  const pendingComm=commRecs.filter(c=>c.status==='pending');
  const totalCommPaid=commRecs.filter(c=>c.status==='paid').reduce((a,c)=>a+c.amount,0);
  const totalSalPaid=salaryRecs.filter(s=>s.paid).reduce((a,s)=>a+s.net,0);

  const urgentExpiry=employees.filter(e=>e.status==='active').flatMap(e=>[
    {emp:e,type:'Visa',date:e.visaExpiry,days:daysUntil(e.visaExpiry)},
    {emp:e,type:'Contract',date:e.contractEnd,days:daysUntil(e.contractEnd)},
    {emp:e,type:'Passport',date:e.passExpiry,days:daysUntil(e.passExpiry)},
    {emp:e,type:'Emirates ID',date:e.emiratesId,days:daysUntil(e.emiratesId)},
    {emp:e,type:'RERA',date:e.reraExp,days:daysUntil(e.reraExp)},
  ]).filter(x=>x.days>=0&&x.days<=90).sort((a,b)=>a.days-b.days).slice(0,6);

  const depts=[...new Set(employees.map(e=>e.dept))];
  const deptCounts=depts.map(d=>employees.filter(e=>e.dept===d).length);
  const maxDept=Math.max(...deptCounts,1);

  return (
    <div>
      <div className="stat-grid">
        <SCard icon="👥" label="Active Employees" value={active.length} sub={`${employees.filter(e=>e.type==='commission').length} commission · ${employees.filter(e=>e.type==='salary').length} salary`} color="blue"/>
        <SCard icon="🌴" label="Pending Leaves" value={pendingLeaves.length} sub="Awaiting approval" color={pendingLeaves.length>0?'amber':'green'}/>
        <SCard icon="💼" label="Pending Requests" value={pendingReqs.length} sub="HR requests" color={pendingReqs.length>0?'amber':'green'}/>
        <SCard icon="⚠️" label="Expiry Alerts" value={urgentExpiry.length} sub="Next 90 days" color={urgentExpiry.filter(x=>x.days<=30).length>0?'red':'amber'}/>
      </div>

      <div className="grid2" style={{marginBottom:20}}>
        <div className="card">
          <div className="card-header"><span className="card-title">💰 Payroll Summary</span></div>
          <div className="card-body">
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
              {[['Salary Paid',fmtMoney(totalSalPaid),'var(--blue-light)','var(--blue2)'],['Commission Paid',fmtMoney(totalCommPaid),'var(--green-light)','var(--green)'],['Unpaid Salary',`${unpaidSal.length} records`,'var(--red-light)','var(--red)'],['Pending Comm.',`${pendingComm.length} records`,'var(--amber-light)','var(--amber)']].map(([l,v,bg,cl])=>(
                <div key={l} style={{background:bg,borderRadius:8,padding:'10px 12px'}}>
                  <div style={{fontSize:11,fontWeight:700,color:cl,textTransform:'uppercase',letterSpacing:'.4px'}}>{l}</div>
                  <div style={{fontSize:15,fontWeight:800,color:cl,marginTop:4}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{borderTop:'1px solid var(--border)',paddingTop:12}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Staff by Department</div>
              {depts.map((d,i)=>(
                <div key={d} style={{marginBottom:7}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3,fontSize:12}}>
                    <span style={{fontWeight:600}}>{d}</span><span style={{color:'var(--text2)'}}>{deptCounts[i]}</span>
                  </div>
                  <div className="progress"><div className="progress-fill" style={{width:Math.round(deptCounts[i]/maxDept*100)+'%',background:'var(--blue)'}}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div className="card" style={{flex:'0 0 auto'}}>
            <div className="card-header"><span className="card-title">🔔 Pending Actions</span></div>
            <div className="card-body" style={{padding:'12px 16px'}}>
              {pendingLeaves.length===0&&pendingReqs.length===0&&unpaidSal.length===0&&<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'12px 0'}}>All clear! No pending actions.</div>}
              {pendingLeaves.map(l=>(
                <div key={l.id} className="alert info" style={{marginBottom:6,padding:'9px 12px'}}>
                  <span className="alert-icon">🌴</span>
                  <div className="alert-content"><div className="alert-title" style={{fontSize:13}}>Leave Request</div><div className="alert-sub">{l.type} · {l.days} days · Pending</div></div>
                </div>
              ))}
              {pendingReqs.slice(0,3).map(r=>(
                <div key={r.id} className="alert warn" style={{marginBottom:6,padding:'9px 12px'}}>
                  <span className="alert-icon">📋</span>
                  <div className="alert-content"><div className="alert-title" style={{fontSize:13}}>{r.type}</div><div className="alert-sub">Submitted {fmtDate(r.requestDate)}</div></div>
                </div>
              ))}
              {unpaidSal.map(s=>(
                <div key={s.id} className="alert warn" style={{marginBottom:6,padding:'9px 12px'}}>
                  <span className="alert-icon">💸</span>
                  <div className="alert-content"><div className="alert-title" style={{fontSize:13}}>Unpaid Salary</div><div className="alert-sub">{s.month} · {fmtMoney(s.net)}</div></div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{flex:1}}>
            <div className="card-header"><span className="card-title">⚠️ Expiry Alerts</span></div>
            <div style={{padding:'4px 16px'}}>
              {urgentExpiry.length===0&&<div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:'20px 0'}}>No expirations in next 90 days.</div>}
              {urgentExpiry.map((x,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{x.emp.name.split(' ')[0]} {x.emp.name.split(' ')[1]}</div>
                    <div style={{fontSize:11,color:'var(--text2)'}}>{x.type} · {fmtDate(x.date)}</div>
                  </div>
                  <Badge cls={expiryBadge(x.days)}>{x.days<=0?'Expired':x.days+'d'}</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">👥 Team Overview</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Title</th><th>Type</th><th>RERA</th><th>Visa</th><th>Contract</th><th>Leave Balance</th><th>Status</th></tr></thead>
            <tbody>
              {employees.filter(e=>e.status==='active').slice(0,16).map(e=>(
                <tr key={e.id}>
                  <td><div style={{display:'flex',alignItems:'center',gap:9}}><Avatar name={e.name} id={e.id} size={32} fontSize={11}/><div><div style={{fontWeight:700,fontSize:13}}>{e.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{e.id}</div></div></div></td>
                  <td style={{fontSize:12,color:'var(--text2)'}}>{e.title}</td>
                  <td><TypeBadge type={e.type}/></td>
                  <td>{e.reraNo?<span style={{fontSize:12}}>{e.reraNo}</span>:<span style={{color:'var(--text3)',fontSize:11}}>—</span>}</td>
                  <td><Badge cls={expiryBadge(daysUntil(e.visaExpiry))}>{fmtDate(e.visaExpiry)}</Badge></td>
                  <td><Badge cls={expiryBadge(daysUntil(e.contractEnd))}>{fmtDate(e.contractEnd)}</Badge></td>
                  <td><div style={{display:'flex',alignItems:'center',gap:8,minWidth:100}}><div className="progress" style={{flex:1}}><div className="progress-fill" style={{width:Math.min(100,Math.round(e.leaveBalance/30*100))+'%',background:'var(--blue)'}}/></div><span style={{fontSize:12,fontWeight:600}}>{e.leaveBalance}d</span></div></td>
                  <td><StatusBadge status={e.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* === EMPLOYEES PAGE === */
function EmployeesPage({employees,setEmployees,showToast,leaves,salaryRecs,commRecs,attData,addAudit,requests}) {
  const [search,setSearch]=useState('');
  const [dept,setDept]=useState('All');
  const [typeF,setTypeF]=useState('All');
  const [selected,setSelected]=useState(null);
  const [editModal,setEditModal]=useState(false);
  const [addModal,setAddModal]=useState(false);
  const [editTarget,setEditTarget]=useState(null);

  const depts=['All',...new Set(employees.map(e=>e.dept))];
  const filtered=employees.filter(e=>{
    const q=search.toLowerCase();
    const matchSearch=!q||e.name.toLowerCase().includes(q)||e.id.toLowerCase().includes(q)||e.email.toLowerCase().includes(q)||e.title.toLowerCase().includes(q);
    const matchDept=dept==='All'||e.dept===dept;
    const matchType=typeF==='All'||e.type===typeF;
    return matchSearch&&matchDept&&matchType;
  });

  function saveEmployee(emp) {
    const existing = employees.find(e=>e.id===emp.id);
    const isNew = !existing;
    const isDeactivating = existing && existing.status==='active' && emp.status!=='active';

    // Referential integrity check on deactivation
    if(isDeactivating) {
      const pendingLeaves = leaves.filter(l=>l.empId===emp.id&&l.status==='pending').length;
      const unpaidSalary = salaryRecs.filter(s=>s.empId===emp.id&&!s.paid).length;
      const openRequests = requests?.filter(r=>r.empId===emp.id&&(r.status==='pending'||r.status==='in_progress')).length||0;
      const pendingComm = commRecs.filter(c=>c.empId===emp.id&&(c.status==='pending'||c.status==='approved')).length;
      const warnings = [];
      if(pendingLeaves>0) warnings.push(pendingLeaves+' pending leave request'+(pendingLeaves>1?'s':''));
      if(unpaidSalary>0) warnings.push(unpaidSalary+' unpaid salary record'+(unpaidSalary>1?'s':''));
      if(openRequests>0) warnings.push(openRequests+' open HR request'+(openRequests>1?'s':''));
      if(pendingComm>0) warnings.push(pendingComm+' unsettled commission'+(pendingComm>1?'s':''));
      if(warnings.length>0) {
        if(!confirm('⚠ '+emp.name+' has linked records:\n\n• '+warnings.join('\n• ')+'\n\nDeactivating this employee will leave these records unresolved. Continue?')) return;
      }
    }

    setEmployees(prev=>{
      const idx=prev.findIndex(e=>e.id===emp.id);
      if(idx>=0){const n=[...prev];n[idx]=emp;return n;}
      return [...prev,emp];
    });

    // Audit trail
    if(addAudit) {
      if(isNew) {
        addAudit('EMPLOYEE_ADDED',`${emp.name} (${emp.id}) — ${emp.title||''}, ${emp.dept||''}`,emp.id);
      } else if(isDeactivating) {
        addAudit('EMPLOYEE_DEACTIVATED',`${emp.name} (${emp.id}) — status changed to ${emp.status}`,emp.id);
      } else {
        addAudit('EMPLOYEE_UPDATED',`${emp.name} (${emp.id}) — profile updated`,emp.id);
      }
    }

    showToast(isNew?'Employee added':'Employee updated','success');
  }
  function openEdit(emp){setEditTarget(emp);setEditModal(true);}

  if(selected) {
    const emp=employees.find(e=>e.id===selected)||selected;
    const myLeaves=leaves.filter(l=>l.empId===emp.id);
    const mySal=salaryRecs.filter(s=>s.empId===emp.id);
    const myComm=commRecs.filter(c=>c.empId===emp.id);
    const records=attData[emp.id]||[];
    const p=records.filter(r=>r.status==='present').length;
    const a=records.filter(r=>r.status==='absent').length;
    return (
      <div>
        <div style={{display:'flex',gap:10,marginBottom:18,alignItems:'center'}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(null)}>← Back</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>openEdit(emp)}>✏️ Edit</button>
        </div>
        <div className="card" style={{marginBottom:16}}>
          <div className="profile-hero">
            <Avatar name={emp.name} id={emp.id} size={72} fontSize={24} border={true}/>
            <div>
              <div className="profile-name">{emp.name}</div>
              <div className="profile-title">{emp.title} · {emp.dept}</div>
              <div className="profile-badges-row">
                <Badge cls="badge-blue">{emp.id}</Badge>
                <TypeBadge type={emp.type}/>
                <StatusBadge status={emp.status}/>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div className="info-grid">
              {[['Email',emp.email],['Mobile',emp.phone],['Nationality',emp.nationality],['Joined',fmtDate(emp.joined)],['Manager',(()=>{const m=employees.find(e=>e.id===emp.manager);return m?m.name:emp.manager||'—';})()],['Department',emp.dept]].map(([l,v])=>(
                <div key={l} className="info-field"><div className="info-label">{l}</div><div className="info-value">{v}</div></div>
              ))}
              {emp.salary>0&&<div className="info-field"><div className="info-label">Basic Salary</div><div className="info-value">{fmtMoney(emp.salary)}</div></div>}
              {emp.reraNo&&<div className="info-field"><div className="info-label">RERA No</div><div className="info-value">{emp.reraNo}</div></div>}
              <div className="info-field"><div className="info-label">Leave Balance</div><div className="info-value">{emp.leaveBalance} days</div></div>
              {emp.notes&&<div className="info-field" style={{gridColumn:'span 2'}}><div className="info-label">Notes</div><div className="info-value">{emp.notes}</div></div>}
            </div>
          </div>
        </div>
        <div className="grid2">
          <div className="card">
            <div className="card-header"><span className="card-title">🗂️ Document Expiry</span></div>
            <div className="card-body" style={{padding:'8px 16px'}}>
              {[['Visa',emp.visaExpiry],['Contract',emp.contractEnd],['Passport',emp.passExpiry],['Emirates ID',emp.emiratesId],['RERA',emp.reraExp]].map(([l,d])=>(
                <ExpiryRow key={l} label={l} date={d} days={daysUntil(d)}/>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title">📅 Attendance — 2026</span></div>
            <div className="card-body">
              <div style={{display:'flex',gap:12,marginBottom:12}}>
                <div style={{textAlign:'center',flex:1,background:'var(--green-light)',borderRadius:8,padding:'8px 4px'}}><div style={{fontSize:20,fontWeight:800,color:'var(--green)'}}>{p}</div><div style={{fontSize:11,color:'var(--green)'}}>Present</div></div>
                <div style={{textAlign:'center',flex:1,background:'var(--red-light)',borderRadius:8,padding:'8px 4px'}}><div style={{fontSize:20,fontWeight:800,color:'var(--red)'}}>{a}</div><div style={{fontSize:11,color:'var(--red)'}}>Absent</div></div>
                <div style={{textAlign:'center',flex:1,background:'var(--blue-light)',borderRadius:8,padding:'8px 4px'}}><div style={{fontSize:20,fontWeight:800,color:'var(--blue)'}}>{p+a>0?Math.round(p/(p+a)*100):0}%</div><div style={{fontSize:11,color:'var(--blue)'}}>Rate</div></div>
              </div>
              <CalendarMini records={records}/>
            </div>
          </div>
        </div>
        {(mySal.length>0||myComm.length>0)&&(
          <div className="card" style={{marginTop:16}}>
            <div className="card-header"><span className="card-title">💰 Payment History</span></div>
            {mySal.length>0&&<div className="table-wrap"><table><thead><tr><th>Month</th><th>Net Pay</th><th>Status</th></tr></thead><tbody>{mySal.map(s=><tr key={s.id}><td>{s.month}</td><td><strong>{fmtMoney(s.net)}</strong></td><td><StatusBadge status={s.paid?'paid':'pending'}/></td></tr>)}</tbody></table></div>}
            {myComm.length>0&&<div className="table-wrap"><table><thead><tr><th>Deal</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{myComm.map(c=><tr key={c.id}><td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.deal}</td><td>{fmtDate(c.txDate)}</td><td><strong style={{color:'var(--green)'}}>{fmtMoney(c.amount)}</strong></td><td><StatusBadge status={c.status}/></td></tr>)}</tbody></table></div>}
          </div>
        )}
        <EmployeeFormModal open={editModal} onClose={()=>setEditModal(false)} initial={emp} onSave={saveEmployee} employees={employees}/>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title={`${filtered.length} Employees`} sub="Manage your team records" action={<button className="btn btn-primary" onClick={()=>{setEditTarget(null);setAddModal(true);}}>+ Add Employee</button>}/>
      <div className="filter-row">
        <div className="search-wrap"><span className="search-icon">🔍</span><input className="form-input search-input" placeholder="Search by name, ID, title..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="form-select" style={{width:'auto'}} value={dept} onChange={e=>setDept(e.target.value)}>{depts.map(d=><option key={d}>{d}</option>)}</select>
        <select className="form-select" style={{width:'auto'}} value={typeF} onChange={e=>setTypeF(e.target.value)}>
          <option value="All">All Types</option><option value="salary">Salary</option><option value="commission">Commission</option><option value="salary_commission">Sal+Comm</option>
        </select>
      </div>
      <div className="emp-grid">
        {filtered.map(e=>{
          const vd=daysUntil(e.visaExpiry),cd=daysUntil(e.contractEnd);
          const urgent=vd<=60||cd<=60;
          return (
            <div key={e.id} className="emp-card" onClick={()=>setSelected(e.id)}>
              <div className="emp-card-header">
                <Avatar name={e.name} id={e.id} size={44} fontSize={15}/>
                <div className="emp-card-info">
                  <div className="emp-card-name">{e.name}</div>
                  <div className="emp-card-title">{e.title}</div>
                </div>
                {urgent&&<span style={{fontSize:16}}>⚠️</span>}
              </div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
                <Badge cls="badge-gray">{e.dept}</Badge>
                <TypeBadge type={e.type}/>
              </div>
              <div className="emp-card-footer">
                <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                  <span style={{fontSize:11,color:'var(--text2)'}}>{e.id}</span>
                  {e.reraNo&&<span style={{fontSize:10,color:'var(--text3)'}}>RERA: {e.reraNo}</span>}
                </div>
                <div style={{display:'flex',gap:5}}>
                  <Badge cls={expiryBadge(vd)}>{vd<=90?`Visa: ${vd}d`:'OK'}</Badge>
                  {e.reraExp&&(()=>{const rd=daysUntil(e.reraExp);return rd<=90?<Badge cls={expiryBadge(rd)}>{`RERA: ${rd}d`}</Badge>:null;})()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <EmployeeFormModal open={addModal} onClose={()=>setAddModal(false)} initial={null} onSave={saveEmployee} employees={employees}/>
    </div>
  );
}

/* === ATTENDANCE PAGE === */


/* === ATTENDANCE — FULL REBUILD === */
/* Status config */
const ATT_STATUSES = [
  {key:'',        label:'·', fullLabel:'Not Set', bg:'#ffffff', color:'#cbd5e1', border:'#e2e8f0'},
  {key:'present', label:'P', fullLabel:'Present', bg:'#d1fae5', color:'#065f46', border:'#6ee7b7'},
  {key:'absent',  label:'A', fullLabel:'Absent',  bg:'#fee2e2', color:'#991b1b', border:'#fca5a5'},
  {key:'leave',   label:'L', fullLabel:'Leave',   bg:'#ede9fe', color:'#5b21b6', border:'#c4b5fd'},
  {key:'sick',    label:'S', fullLabel:'Sick',    bg:'#fef3c7', color:'#92400e', border:'#fcd34d'},
  {key:'online',  label:'ON',fullLabel:'Online',   bg:'#e0e7ff', color:'#3730a3', border:'#a5b4fc'},
  {key:'late',    label:'LT',fullLabel:'Late',    bg:'#fce7f3', color:'#9d174d', border:'#f9a8d4'},
  {key:'weekend', label:'—', fullLabel:'Weekend', bg:'#f1f5f9', color:'#94a3b8', border:'#e2e8f0'},
];
const ATT_MAP = Object.fromEntries(ATT_STATUSES.map(s=>[s.key,s]));

function getAttCfg(status) { return ATT_MAP[status] || ATT_MAP['']; }

/* Cycle status on click — starts from unset for weekdays */
function cycleStatus(current, isWE) {
  const weekdayCycle = ['','present','absent','leave','sick','online','late'];
  const weekendCycle = ['weekend','present'];
  if(isWE) {
    const idx = weekendCycle.indexOf(current);
    return weekendCycle[(idx+1)%weekendCycle.length];
  }
  if(current==='weekend') return '';
  const idx = weekdayCycle.indexOf(current);
  return weekdayCycle[idx<0?0:(idx+1)%weekdayCycle.length];
}

/* ── Leave-Attendance bridge helpers ── */
function isOnApprovedLeave(empId, dateStr, leaves) {
  if(!leaves||!dateStr) return null;
  return leaves.find(l => l.empId===empId && l.status==='approved' && dateStr>=l.from && dateStr<=l.to) || null;
}
function leaveAttStatus(leave) {
  if(!leave) return null;
  return leave.type==='Sick Leave' ? 'sick' : 'leave';
}

/* MONTH NAMES */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── DAILY QUICK ENTRY ── */
function DailyEntry({employees, attData, setAttData, leaves, selDate, setSelDate, showToast}) {
  const dateObj = new Date(selDate+'T00:00:00');
  const dow = dateObj.getDay(); // 0=Sun,6=Sat

  function getStatus(empId) {
    const recs = attData[empId]||[];
    const r = recs.find(x=>x.date===selDate);
    if(r?.status) return r.status;
    // Fall back to approved leave
    const lv = isOnApprovedLeave(empId, selDate, leaves);
    if(lv) return leaveAttStatus(lv);
    return dow===5||dow===6 ? 'weekend' : '';
  }

  function getLeaveInfo(empId) {
    return isOnApprovedLeave(empId, selDate, leaves);
  }

  function setStatus(empId, status) {
    const lv = getLeaveInfo(empId);
    if(lv && status!=='leave' && status!=='sick') {
      if(!confirm(empId+' has approved '+lv.type+' on this date ('+lv.from+' to '+lv.to+'). Override with "'+status+'"?')) return;
    }
    setAttData(prev=>{
      const recs=[...(prev[empId]||[])];
      const idx=recs.findIndex(r=>r.date===selDate);
      if(idx>=0) recs[idx]={...recs[idx],status};
      else recs.push({date:selDate,status});
      return {...prev,[empId]:recs};
    });
  }

  function markAll(status) {
    const onLeave = employees.filter(e=>getLeaveInfo(e.id));
    setAttData(prev=>{
      const next={...prev};
      employees.forEach(emp=>{
        const lv = getLeaveInfo(emp.id);
        // Skip employees on approved leave when marking present/absent
        if(lv && status!=='leave' && status!=='sick') return;
        const recs=[...(next[emp.id]||[])];
        const idx=recs.findIndex(r=>r.date===selDate);
        if(idx>=0) recs[idx]={...recs[idx],status};
        else recs.push({date:selDate,status});
        next[emp.id]=recs;
      });
      return next;
    });
    if(onLeave.length>0) showToast(`All marked as ${status} — ${onLeave.length} on leave skipped`,'success');
    else showToast(`All marked as ${status}`,'success');
  }

  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow];
  const isWeekend = dow===5||dow===6;
  const counts = {};
  ATT_STATUSES.forEach(s=>{ counts[s.key]=employees.filter(e=>getStatus(e.id)===s.key).length; });

  return (
    <div>
      {/* Date nav */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <button className="btn btn-ghost btn-sm" onClick={()=>{const d=new Date(selDate+'T00:00:00');d.setDate(d.getDate()-1);setSelDate(d.toISOString().split('T')[0]);}}>‹ Prev</button>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:1,minWidth:200}}>
          <input type="date" className="form-input" value={selDate} onChange={e=>setSelDate(e.target.value)} style={{maxWidth:180}}/>
          <div style={{fontWeight:700,fontSize:15,color:'var(--text1)'}}>{dayName}</div>
          {isWeekend&&<span className="badge badge-gray">Weekend</span>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={()=>{const d=new Date(selDate+'T00:00:00');d.setDate(d.getDate()+1);setSelDate(d.toISOString().split('T')[0]);}}>Next ›</button>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="btn btn-success btn-sm" onClick={()=>markAll('present')}>✓ All Present</button>
          <button className="btn btn-danger btn-sm" onClick={()=>markAll('absent')}>✗ All Absent</button>
          {isWeekend&&<button className="btn btn-ghost btn-sm" onClick={()=>markAll('weekend')}>Set All Weekend</button>}
        </div>
      </div>

      {/* Summary pills */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {ATT_STATUSES.filter(s=>counts[s.key]>0).map(s=>(
          <div key={s.key} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,background:s.bg,border:`1px solid ${s.border}`,fontSize:12,fontWeight:700,color:s.color}}>
            {s.fullLabel}: {counts[s.key]}
          </div>
        ))}
      </div>

      {/* Employee rows */}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {employees.map(emp=>{
          const status=getStatus(emp.id);
          const cfg=getAttCfg(status);
          const lv=getLeaveInfo(emp.id);
          return (
            <div key={emp.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:lv?'#fefce8':'#fff',borderRadius:10,border:`1.5px solid ${lv?'#fde68a':cfg.border}`,boxShadow:'0 1px 2px rgba(0,0,0,0.05)',transition:'border-color .15s'}}>
              <Avatar name={emp.name} id={emp.id} size={34} fontSize={12}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}</div>
                <div style={{fontSize:11,color:'var(--text2)'}}>{emp.title} · {emp.dept}</div>
                {lv&&<div style={{fontSize:10,color:'var(--amber)',fontWeight:600,marginTop:2}}>🔒 {lv.type}: {fmtDate(lv.from)} – {fmtDate(lv.to)}</div>}
              </div>
              {/* Status toggle buttons */}
              <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {ATT_STATUSES.filter(s=>isWeekend?['weekend','present',''].includes(s.key):s.key!=='weekend').map(s=>(
                  <button key={s.key} onClick={()=>setStatus(emp.id,s.key)} style={{
                    padding:'4px 10px',borderRadius:7,fontSize:11,fontWeight:700,cursor:'pointer',border:`1.5px solid ${s.border}`,
                    background:status===s.key?s.bg:'transparent',
                    color:status===s.key?s.color:'var(--text3)',
                    transition:'all .1s',minWidth:32,
                    transform:status===s.key?'scale(1.05)':'scale(1)',
                  }}>
                    {s.label}
                  </button>
                ))}
              </div>
              {/* Current status pill */}
              <div style={{width:76,textAlign:'center',padding:'4px 8px',borderRadius:7,background:cfg.bg,color:cfg.color,fontSize:12,fontWeight:700,border:`1px solid ${cfg.border}`,flexShrink:0}}>
                {cfg.fullLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── MONTHLY MATRIX ── */
function MonthMatrix({employees, attData, setAttData, leaves, year, month, showToast}) {
  const totalDays = new Date(year, month+1, 0).getDate();
  const days = Array.from({length:totalDays},(_,i)=>i+1);

  function dateStr(day) { return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }

  function getStatus(empId, day) {
    const ds = dateStr(day);
    const recs=attData[empId]||[];
    const r=recs.find(x=>x.date===ds);
    if(r?.status) return r.status;
    const lv = isOnApprovedLeave(empId, ds, leaves);
    if(lv) return leaveAttStatus(lv);
    const dow=new Date(year,month,day).getDay();
    return dow===5||dow===6?'weekend':'';
  }

  function toggle(empId, day) {
    const ds = dateStr(day);
    const dow=new Date(year,month,day).getDay();
    const isWE=dow===5||dow===6;
    const lv = isOnApprovedLeave(empId, ds, leaves);
    const current=getStatus(empId,day);
    const next=cycleStatus(current,isWE);
    if(lv && next!=='leave' && next!=='sick') {
      // Skip silently in matrix (too many clicks to confirm each)
      return;
    }
    setAttData(prev=>{
      const recs=[...(prev[empId]||[])];
      const idx=recs.findIndex(r=>r.date===ds);
      if(idx>=0) recs[idx]={...recs[idx],status:next};
      else recs.push({date:ds,status:next});
      return {...prev,[empId]:recs};
    });
  }

  function hasLeave(empId, day) {
    return !!isOnApprovedLeave(empId, dateStr(day), leaves);
  }

  const dayLabels = days.map(d=>({
    d,
    dow:new Date(year,month,d).getDay(),
    isWE:new Date(year,month,d).getDay()===5||new Date(year,month,d).getDay()===6,
    label:['Su','Mo','Tu','We','Th','Fr','Sa'][new Date(year,month,d).getDay()]
  }));

  return (
    <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
      <table style={{borderCollapse:'separate',borderSpacing:'2px',minWidth:900}}>
        <thead>
          <tr>
            <th style={{position:'sticky',left:0,background:'var(--bg2)',zIndex:2,padding:'6px 12px',fontSize:11,fontWeight:700,color:'var(--text2)',textAlign:'left',minWidth:160,borderRadius:6}}>Employee</th>
            {dayLabels.map(({d,dow,isWE,label})=>(
              <th key={d} style={{padding:'2px',minWidth:28,maxWidth:28,textAlign:'center',background:'transparent'}}>
                <div style={{fontSize:9,fontWeight:700,color:isWE?'var(--red)':'var(--text3)',textTransform:'uppercase'}}>{label}</div>
                <div style={{fontSize:11,fontWeight:800,color:isWE?'var(--red)':'var(--text1)'}}>{d}</div>
              </th>
            ))}
            <th style={{padding:'6px 8px',fontSize:11,fontWeight:700,color:'var(--text2)',textAlign:'center',minWidth:52}}>Rate</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp=>{
            const statuses=days.map(d=>getStatus(emp.id,d));
            const p=statuses.filter(s=>s==='present'||s==='online'||s==='late').length;
            const we=statuses.filter(s=>s==='weekend').length;
            const workDays=days.length-we;
            const rate=workDays>0?Math.round(p/workDays*100):100;
            return (
              <tr key={emp.id}>
                <td style={{position:'sticky',left:0,background:'#fff',zIndex:1,padding:'5px 10px',minWidth:160,borderRadius:6,boxShadow:'2px 0 4px rgba(0,0,0,0.04)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:7}}>
                    <Avatar name={emp.name} id={emp.id} size={26} fontSize={9}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:110}}>{emp.name.split(' ').slice(0,2).join(' ')}</div>
                      <div style={{fontSize:10,color:'var(--text3)'}}>{emp.dept}</div>
                    </div>
                  </div>
                </td>
                {days.map((d,i)=>{
                  const cfg=getAttCfg(statuses[i]);
                  const isWE=dayLabels[i].isWE;
                  const onLv=hasLeave(emp.id,d);
                  return (
                    <td key={d} style={{padding:'1px',textAlign:'center'}}>
                      <div
                        onClick={()=>toggle(emp.id,d)}
                        title={`${emp.name} — Day ${d}: ${cfg.fullLabel}${onLv?' (Approved Leave — locked)':''}
Click to change`}
                        style={{
                          width:26,height:26,borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',
                          background:cfg.bg,color:cfg.color,fontSize:9,fontWeight:800,cursor:onLv?'not-allowed':'pointer',
                          border:`1px solid ${onLv?'#fbbf24':cfg.border}`,transition:'transform .1s,box-shadow .1s',
                          margin:'0 auto',userSelect:'none',
                          opacity:isWE&&statuses[i]==='weekend'?0.5:1,
                          boxShadow:onLv?'inset 0 0 0 1px #fbbf24':'none',
                        }}
                        onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.25)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)';e.currentTarget.style.zIndex='10';e.currentTarget.style.position='relative';}}
                        onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='none';e.currentTarget.style.position='static';}}
                      >
                        {cfg.label}
                      </div>
                    </td>
                  );
                })}
                <td style={{textAlign:'center',padding:'4px 6px'}}>
                  <span style={{fontSize:11,fontWeight:700,color:rate>=90?'var(--green)':rate>=75?'var(--amber)':'var(--red)'}}>{rate}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{display:'flex',gap:10,marginTop:14,flexWrap:'wrap',paddingBottom:4}}>
        {ATT_STATUSES.map(s=>(
          <div key={s.key} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text2)'}}>
            <div style={{width:16,height:16,borderRadius:3,background:s.bg,border:`1px solid ${s.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:800,color:s.color}}>{s.label}</div>
            {s.fullLabel}
          </div>
        ))}
        <div style={{fontSize:11,color:'var(--text3)',marginLeft:'auto'}}>💡 Click any cell to change status</div>
      </div>
    </div>
  );
}

/* ── INDIVIDUAL EMPLOYEE CALENDAR ── */
function IndividualCal({employees, attData, setAttData, leaves, year, month}) {
  const [selEmp, setSelEmp] = useState(employees[0]?.id||'');
  const emp = employees.find(e=>e.id===selEmp);
  const totalDays = new Date(year, month+1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const dayNames = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  function dateStr(day) { return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`; }

  function getStatus(day) {
    const ds = dateStr(day);
    const recs=attData[selEmp]||[];
    const r=recs.find(x=>x.date===ds);
    if(r?.status) return r.status;
    const lv = isOnApprovedLeave(selEmp, ds, leaves);
    if(lv) return leaveAttStatus(lv);
    const dow=new Date(year,month,day).getDay();
    return dow===5||dow===6?'weekend':'';
  }

  function hasLeave(day) { return !!isOnApprovedLeave(selEmp, dateStr(day), leaves); }

  function toggle(day) {
    const ds = dateStr(day);
    const dow=new Date(year,month,day).getDay();
    const isWE=dow===5||dow===6;
    const lv = isOnApprovedLeave(selEmp, ds, leaves);
    const current=getStatus(day);
    const next=cycleStatus(current,isWE);
    if(lv && next!=='leave' && next!=='sick') {
      if(!confirm('This day is covered by approved '+lv.type+'. Override attendance?')) return;
    }
    setAttData(prev=>{
      const recs=[...(prev[selEmp]||[])];
      const idx=recs.findIndex(r=>r.date===ds);
      if(idx>=0) recs[idx]={...recs[idx],status:next};
      else recs.push({date:ds,status:next});
      return {...prev,[selEmp]:recs};
    });
  }

  const statuses = Array.from({length:totalDays},(_,i)=>getStatus(i+1));
  const p=statuses.filter(s=>s==='present'||s==='online'||s==='late').length;
  const a=statuses.filter(s=>s==='absent').length;
  const l=statuses.filter(s=>s==='leave'||s==='sick').length;
  const we=statuses.filter(s=>s==='weekend').length;
  const workDays=totalDays-we;
  const rate=workDays>0?Math.round(p/workDays*100):100;

  const cells=[...Array(firstDow).fill(null),...Array.from({length:totalDays},(_,i)=>i+1)];

  return (
    <div>
      <div style={{marginBottom:14}}>
        <select className="form-select" style={{maxWidth:260}} value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
          {employees.map(e=><option key={e.id} value={e.id}>{e.name} — {e.dept}</option>)}
        </select>
      </div>

      {emp&&<div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,padding:'10px 14px',background:'#fff',borderRadius:10,border:'1px solid var(--border)'}}>
        <Avatar name={emp.name} id={emp.id} size={38} fontSize={13}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14}}>{emp.name}</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>{emp.title} · {emp.dept}</div>
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {[['Present',p,'var(--green)'],['Absent',a,'var(--red)'],['Leave/Sick',l,'var(--purple)'],['Rate',rate+'%',rate>=90?'var(--green)':rate>=75?'var(--amber)':'var(--red)']].map(([l,v,c])=>(
            <div key={l} style={{textAlign:'center',minWidth:52}}>
              <div style={{fontSize:18,fontWeight:800,color:c,lineHeight:1}}>{v}</div>
              <div style={{fontSize:10,color:'var(--text3)'}}>{l}</div>
            </div>
          ))}
        </div>
      </div>}

      {/* Big clickable calendar */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid var(--border)',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--border)'}}>
          {dayNames.map((d,i)=>(
            <div key={d} style={{padding:'10px 4px',textAlign:'center',fontSize:12,fontWeight:700,color:i===5||i===6?'var(--red)':'var(--text2)',borderRight:i<6?'1px solid var(--border)':undefined,background:'var(--bg2)'}}>
              {d}
            </div>
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)'}}>
          {cells.map((day,i)=>{
            if(!day) return <div key={'e'+i} style={{borderRight:i%7<6?'1px solid var(--border)':undefined,borderBottom:'1px solid var(--border)',minHeight:56,background:'var(--bg3)',opacity:.3}}/>;
            const status=getStatus(day);
            const cfg=getAttCfg(status);
            const dow=(firstDow+day-1)%7;
            const isWE=dow===5||dow===6;
            const isToday=new Date().getDate()===day&&new Date().getMonth()===month&&new Date().getFullYear()===year;
            const onLv=hasLeave(day);
            return (
              <div key={day}
                onClick={()=>toggle(day)}
                style={{
                  borderRight:(firstDow+day-1)%7<6?'1px solid var(--border)':undefined,
                  borderBottom:'1px solid var(--border)',
                  minHeight:56,padding:'6px 4px',
                  background:onLv&&(status==='leave'||status==='sick')?'#fefce8':cfg.bg,cursor:onLv?'not-allowed':'pointer',
                  transition:'all .12s',position:'relative',
                  opacity:isWE&&status==='weekend'?0.55:1,
                }}
                onMouseEnter={e=>e.currentTarget.style.filter='brightness(0.95)'}
                onMouseLeave={e=>e.currentTarget.style.filter='none'}
              >
                <div style={{
                  width:22,height:22,borderRadius:'50%',
                  background:isToday?'var(--blue)':cfg.color,
                  color:isToday?'#fff':cfg.bg,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:11,fontWeight:800,margin:'0 auto 4px',
                }}>
                  {day}
                </div>
                <div style={{fontSize:9,fontWeight:700,color:cfg.color,textAlign:'center',textTransform:'uppercase',letterSpacing:'.3px'}}>
                  {onLv?'🔒':''}{cfg.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{display:'flex',gap:10,marginTop:12,flexWrap:'wrap'}}>
        {ATT_STATUSES.map(s=>(
          <div key={s.key} style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--text2)'}}>
            <div style={{width:14,height:14,borderRadius:3,background:s.bg,border:`1px solid ${s.border}`}}/>
            {s.fullLabel}
          </div>
        ))}
        <div style={{fontSize:11,color:'var(--text3)',marginLeft:'auto'}}>💡 Click a day to cycle status</div>
      </div>
    </div>
  );
}

/* ── MAIN ATTENDANCE PAGE ── */
function AttendancePage({employees,attData,setAttData,leaves,showToast}) {
  const now = new Date();
  const [view,setView]=useState('daily');
  const [year,setYear]=useState(2026);
  const [month,setMonth]=useState(0);
  const [selDate,setSelDate]=useState('2026-01-01');

  const MONTH_OPTS=[];
  for(let y=2026;y<=2027;y++) for(let m=0;m<12;m++) MONTH_OPTS.push({y,m,label:`${MONTHS[m]} ${y}`});

  /* Month summary stats */
  const totalDays=new Date(year,month+1,0).getDate();
  const allRecs=employees.flatMap(e=>(attData[e.id]||[]).filter(r=>r.date.startsWith(`${year}-${String(month+1).padStart(2,'0')}`)));
  const totalPresent=allRecs.filter(r=>r.status==='present'||r.status==='online'||r.status==='late').length;
  const totalAbsent=allRecs.filter(r=>r.status==='absent').length;
  const totalLeave=allRecs.filter(r=>r.status==='leave'||r.status==='sick').length;
  const weCount=allRecs.filter(r=>r.status==='weekend').length;
  const workableDays=allRecs.length-weCount;
  const overallRate=workableDays>0?Math.round(totalPresent/workableDays*100):0;

  return (
    <div>
      {/* Header controls */}
      <div style={{display:'flex',gap:10,marginBottom:20,alignItems:'center',flexWrap:'wrap',justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <select className="form-select" style={{width:'auto'}}
            value={`${year}-${month}`}
            onChange={e=>{const[y,m]=e.target.value.split('-');setYear(+y);setMonth(+m);}}>
            {MONTH_OPTS.map(o=><option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>)}
          </select>
          <div style={{fontSize:13,color:'var(--text2)',fontWeight:500}}>{employees.length} employees</div>
        </div>
        <div className="tab-bar" style={{margin:0}}>
          {[['daily','⚡ Daily Entry'],['matrix','📊 Month Matrix'],['individual','📅 Individual']].map(([k,l])=>(
            <div key={k} className={`tab ${view===k?'active':''}`} onClick={()=>setView(k)} style={{fontSize:12}}>{l}</div>
          ))}
        </div>
      </div>

      {/* Summary bar */}
      <div className="stat-grid" style={{marginBottom:18}}>
        <SCard icon="✅" label="Present (Month)" value={totalPresent} sub={`${employees.length} employees`} color="green"/>
        <SCard icon="❌" label="Absent" value={totalAbsent} color="red"/>
        <SCard icon="🌴" label="Leave / Sick" value={totalLeave} color="purple"/>
        <SCard icon="📊" label="Overall Rate" value={overallRate+'%'} color={overallRate>=90?'green':overallRate>=75?'amber':'red'}/>
      </div>

      {/* Views */}
      <div className="card">
        {view==='daily'&&(
          <>
            <div className="card-header">
              <span className="card-title">⚡ Quick Daily Entry</span>
              <span style={{fontSize:12,color:'var(--text2)'}}>Select a date · Click status buttons to record</span>
            </div>
            <div className="card-body">
              <DailyEntry employees={employees} attData={attData} setAttData={setAttData} leaves={leaves} selDate={selDate} setSelDate={setSelDate} showToast={showToast} year={year} month={month}/>
            </div>
          </>
        )}
        {view==='matrix'&&(
          <>
            <div className="card-header">
              <span className="card-title">📊 {MONTHS[month]} {year} — All Employees</span>
              <span style={{fontSize:12,color:'var(--text2)'}}>Click any cell to cycle status</span>
            </div>
            <div style={{padding:'16px'}}>
              <MonthMatrix employees={employees} attData={attData} setAttData={setAttData} leaves={leaves} year={year} month={month} showToast={showToast}/>
            </div>
          </>
        )}
        {view==='individual'&&(
          <>
            <div className="card-header">
              <span className="card-title">📅 Individual Calendar — {MONTHS[month]} {year}</span>
              <span style={{fontSize:12,color:'var(--text2)'}}>Click a day to change status</span>
            </div>
            <div className="card-body">
              <IndividualCal employees={employees} attData={attData} setAttData={setAttData} leaves={leaves} year={year} month={month}/>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* === LEAVE PAGE (ADMIN) === */
/* ── Admin Add Leave Request Modal ── */
function AdminAddLeaveModal({open,onClose,employees,onSave}) {
  const activeEmps=employees.filter(e=>e.status==='active');
  const [f,setF]=useState({empId:'',type:'Annual Leave',from:'',to:'',reason:''});
  useEffect(()=>{if(open)setF({empId:'',type:'Annual Leave',from:'',to:'',reason:''});},[open]);
  function upd(k){return e=>setF(p=>({...p,[k]:e.target.value}));}

  const days = f.from&&f.to ? Math.ceil((new Date(f.to)-new Date(f.from))/86400000)+1 : 0;
  const selEmp = f.empId ? employees.find(e=>e.id===f.empId) : null;
  const balWarning = selEmp && f.type!=='Unpaid Leave' && days > (selEmp.leaveBalance||0);

  function save(){
    if(!f.empId) return alert('Please select an employee');
    if(!f.from||!f.to) return alert('Please select date range');
    if(days<=0) return alert('Invalid date range — "To" must be after "From"');
    if(balWarning) {
      if(!confirm(selEmp.name+' only has '+(selEmp.leaveBalance||0)+' days available but requesting '+days+' days. Continue?')) return;
    }
    onSave({id:'LV'+nowId(),empId:f.empId,type:f.type,from:f.from,to:f.to,days,reason:f.reason,status:'pending',approvedBy:'',requestDate:today(),comments:''});
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Request Leave" size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Submit Request</button></>}>
      <div className="form-group"><label className="form-label">Employee *</label>
        <select className="form-select" value={f.empId} onChange={upd('empId')}>
          <option value="">— Select Employee —</option>
          {activeEmps.map(e=><option key={e.id} value={e.id}>{e.name} — {e.dept} (Balance: {e.leaveBalance||0}d)</option>)}
        </select>
      </div>
      <div className="form-group"><label className="form-label">Leave Type</label>
        <select className="form-select" value={f.type} onChange={upd('type')}>
          {['Annual Leave','Sick Leave','Emergency Leave','Unpaid Leave'].map(t=><option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="form-grid">
        <div className="form-group"><label className="form-label">From Date *</label><input type="date" className="form-input" value={f.from} onChange={upd('from')}/></div>
        <div className="form-group"><label className="form-label">To Date *</label><input type="date" className="form-input" value={f.to} onChange={upd('to')}/></div>
      </div>
      {days>0&&(
        <div style={{padding:'10px 14px',borderRadius:8,marginBottom:12,background:balWarning?'var(--red-light)':'var(--blue-light)',border:'1px solid '+(balWarning?'#fca5a5':'var(--border)'),display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:13,fontWeight:700,color:balWarning?'var(--red)':'var(--blue2)'}}>{days} day{days!==1?'s':''}</span>
          {selEmp&&f.type!=='Unpaid Leave'&&<span style={{fontSize:11,color:balWarning?'var(--red)':'var(--text2)'}}>Balance: {selEmp.leaveBalance||0}d → {Math.max(0,(selEmp.leaveBalance||0)-days)}d</span>}
        </div>
      )}
      <div className="form-group"><label className="form-label">Reason</label><textarea className="form-textarea" rows="2" value={f.reason} onChange={upd('reason')} placeholder="Reason for leave..."/></div>
    </Modal>
  );
}

function LeavePage({employees,setEmployees,leaves,setLeaves,attData,setAttData,showToast,addAudit,userRole}) {
  const [tab,setTab]=useState('pending');
  const [approveModal,setApproveModal]=useState(false);
  const [addLeaveModal,setAddLeaveModal]=useState(false);
  const [selLeave,setSelLeave]=useState(null);
  function empById(id){return employees.find(e=>e.id===id)||{name:id};}

  const byTab={pending:leaves.filter(l=>l.status==='pending'),approved:leaves.filter(l=>l.status==='approved'),rejected:leaves.filter(l=>l.status==='rejected'),all:leaves};
  const shown=byTab[tab]||[];

  /* ── Helper: get working days between two dates (skip Fri+Sat for UAE) ── */
  function getWorkingDays(fromStr, toStr) {
    const days = [];
    const start = new Date(fromStr);
    const end = new Date(toStr);
    for(let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
      const dow = d.getDay();
      // Skip weekends (Friday=5, Saturday=6 — UAE)
      if(dow !== 0 && dow !== 6) {
        days.push(d.toISOString().slice(0,10));
      }
    }
    return days;
  }

  /* ── Core action: approve or reject with full balance + attendance sync ── */
  function doAction(action, comment) {
    const leave = selLeave;
    if(!leave) return;

    const wasApproved = leave.status === 'approved';
    const isApproving = action === 'approved';
    const isRejecting = action === 'rejected';
    const isUnpaid = leave.type === 'Unpaid Leave';
    const leaveDays = leave.days || 0;
    const workingDays = getWorkingDays(leave.from, leave.to);
    const attStatus = leave.type === 'Sick Leave' ? 'sick' : 'leave';

    // 1. Update the leave record
    setLeaves(prev => prev.map(l =>
      l.id === leave.id
        ? {...l, status: action, approvedBy: 'Admin', comments: comment, responseDate: today()}
        : l
    ));

    // 2. Update employee balance (skip for Unpaid Leave)
    if(!isUnpaid) {
      if(isApproving && !wasApproved) {
        // Deduct balance on approval
        setEmployees(prev => prev.map(e =>
          e.id === leave.empId
            ? {...e, leaveBalance: Math.max(0, (e.leaveBalance||0) - leaveDays), leaveTaken: (e.leaveTaken||0) + leaveDays}
            : e
        ));
      } else if(isRejecting && wasApproved) {
        // Restore balance on rejection of previously approved leave
        setEmployees(prev => prev.map(e =>
          e.id === leave.empId
            ? {...e, leaveBalance: (e.leaveBalance||0) + leaveDays, leaveTaken: Math.max(0, (e.leaveTaken||0) - leaveDays)}
            : e
        ));
      }
    }

    // 3. Update attendance records
    if(isApproving && !wasApproved) {
      // Add leave/sick attendance for each working day
      setAttData(prev => {
        const empAtt = [...(prev[leave.empId]||[])];
        workingDays.forEach(dateStr => {
          // Only add if no record exists for that day
          if(!empAtt.some(a => a.date === dateStr)) {
            empAtt.push({date: dateStr, status: attStatus, note: 'Auto: ' + leave.type + ' ('+leave.id+')'});
          }
        });
        return {...prev, [leave.empId]: empAtt};
      });
    } else if(isRejecting && wasApproved) {
      // Remove auto-generated leave attendance records
      setAttData(prev => {
        const empAtt = (prev[leave.empId]||[]).filter(a =>
          !(workingDays.includes(a.date) && (a.status === 'leave' || a.status === 'sick') && a.note && a.note.includes(leave.id))
        );
        return {...prev, [leave.empId]: empAtt};
      });
    }

    // Audit trail
    const empName = (employees.find(e=>e.id===leave.empId)||{name:leave.empId}).name;
    if(addAudit) addAudit(
      isApproving ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      `${empName}: ${leave.type}, ${leaveDays} day(s), ${leave.from} to ${leave.to}${comment?' — '+comment:''}`,
      leave.empId
    );

    showToast(
      isApproving
        ? `Leave approved — ${leaveDays} day${leaveDays!==1?'s':''} deducted from balance`
        : isRejecting && wasApproved
          ? `Leave rejected — ${leaveDays} day${leaveDays!==1?'s':''} restored to balance`
          : `Leave ${action}`,
      isApproving ? 'success' : 'error'
    );
  }

  function addLeaveRequest(rec) {
    setLeaves(prev=>[rec,...prev]);
    if(addAudit) addAudit('LEAVE_SUBMITTED','Admin created leave for '+(employees.find(e=>e.id===rec.empId)||{name:rec.empId}).name+': '+rec.type+', '+rec.days+' day(s)',rec.empId);
    showToast('Leave request created','success');
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <SectionHeader title="Leave Management" sub="Review and manage all leave requests" style={{marginBottom:0}}/>
        <button className="btn btn-primary" onClick={()=>setAddLeaveModal(true)}>+ Request Leave</button>
      </div>
      <div className="tab-bar">
        {['pending','approved','rejected','all'].map(t=><div key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}<span className="tab-count">{byTab[t]?.length}</span></div>)}
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Balance</th><th>Requested</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {shown.length===0&&<tr><td colSpan="9"><Empty icon="🌴" text="No leave requests" sub="This category is empty"/></td></tr>}
              {shown.map(l=>{
                const emp=empById(l.empId);
                return (
                  <tr key={l.id}>
                    <td><div style={{display:'flex',alignItems:'center',gap:8}}><Avatar name={emp.name} id={l.empId} size={30} fontSize={10}/><div><div style={{fontWeight:700,fontSize:13}}>{emp.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{emp.dept||l.empId}</div></div></div></td>
                    <td><Badge cls={l.type==='Sick Leave'?'badge-red':l.type==='Unpaid Leave'?'badge-gray':'badge-purple'}>{l.type}</Badge></td>
                    <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(l.from)}</td>
                    <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(l.to)}</td>
                    <td style={{fontWeight:700}}>{l.days}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div className="progress" style={{width:50}}><div className="progress-fill" style={{width:Math.min(100,Math.round((emp.leaveBalance||0)/30*100))+'%',background:(emp.leaveBalance||0)<=5?'var(--red)':'var(--blue)'}}/></div>
                        <span style={{fontSize:11,fontWeight:700,color:(emp.leaveBalance||0)<=5?'var(--red)':'var(--text1)'}}>{emp.leaveBalance||0}d</span>
                      </div>
                    </td>
                    <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{fmtDate(l.requestDate)}</td>
                    <td><StatusBadge status={l.status}/></td>
                    <td>
                      {l.status==='pending'
                        ?canDo(userRole,'approve_leave')
                          ?<div style={{display:'flex',gap:5}}><button className="btn btn-success btn-sm" onClick={()=>{setSelLeave(l);setApproveModal(true);}}>Review</button></div>
                          :<span style={{fontSize:11,color:'var(--amber)'}}>⏳ Awaiting approval</span>
                        :l.status==='approved'
                          ?<div style={{display:'flex',gap:5,alignItems:'center'}}>
                            <span style={{fontSize:11,color:'var(--green)'}}>✓ {l.approvedBy||'Admin'}</span>
                            {canDo(userRole,'approve_leave')&&<button className="btn btn-ghost btn-sm" style={{fontSize:10,padding:'3px 6px',color:'var(--red)'}} onClick={()=>{setSelLeave(l);doAction('rejected','Cancelled after approval');}}>Cancel</button>}
                          </div>
                          :<span style={{fontSize:11,color:'var(--text3)'}}>{l.approvedBy||'—'}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <LeaveApproveModal open={approveModal} onClose={()=>setApproveModal(false)} leave={selLeave} empName={selLeave?empById(selLeave.empId)?.name:''} emp={selLeave?empById(selLeave.empId):null} onAction={doAction}/>
      <AdminAddLeaveModal open={addLeaveModal} onClose={()=>setAddLeaveModal(false)} employees={employees} onSave={addLeaveRequest}/>
    </div>
  );
}

/* === PAYROLL PAGE === */
/* ── Salary Detail Drawer / Modal ── */
function SalaryDetailModal({open,onClose,rec,emp,onOpenReceipt,onMarkPaid}) {
  if(!rec||!emp) return null;
  const gross=(rec.basic||0)+(rec.housing||0)+(rec.transport||0)+(rec.bonus||0);
  const ded=rec.deductions||0;
  const items=[
    ['Basic Salary',rec.basic,'var(--text1)'],
    (rec.housing||0)>0&&['SIM Card Allow',rec.housing,'var(--text1)'],
    (rec.transport||0)>0&&['Transport Allowance',rec.transport,'var(--text1)'],
    (rec.bonus||0)>0&&['Bonus / Incentive',rec.bonus,'var(--amber)'],
  ].filter(Boolean);
  return (
    <Modal open={open} onClose={onClose} title="Salary Record Detail" size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-ghost" onClick={()=>{onOpenReceipt(rec);onClose();}}>🧾 Download Slip</button>
        {!rec.paid&&<button className="btn btn-success" onClick={()=>{onMarkPaid(rec);onClose();}}>✓ Mark as Paid</button>}
      </>}>
      {/* Employee strip */}
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:16}}>
        <Avatar name={emp.name} id={emp.id} size={44} fontSize={15}/>
        <div>
          <div style={{fontWeight:700,fontSize:14}}>{emp.name}</div>
          <div style={{fontSize:12,color:'var(--text2)'}}>{emp.title} · {emp.dept}</div>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>{emp.id} · {(emp.type||'').replace('_',' ')}</div>
        </div>
        <div style={{marginLeft:'auto',textAlign:'right'}}>
          <StatusBadge status={rec.paid?'paid':'pending'}/>
          <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>{rec.month}</div>
        </div>
      </div>

      {/* Earnings breakdown */}
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Earnings</div>
        {items.map(([label,amount,color])=>(
          <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:13,color:'var(--text2)'}}>{label}</span>
            <span style={{fontSize:13,fontWeight:700,color}}>{fmtMoney(amount)}</span>
          </div>
        ))}
        <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)'}}>
          <span style={{fontSize:13,color:'var(--text2)',fontWeight:600}}>Gross Total</span>
          <span style={{fontSize:13,fontWeight:700}}>{fmtMoney(gross)}</span>
        </div>
      </div>

      {/* Deductions */}
      {ded>0&&<div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>Deductions</div>
        <div style={{background:'var(--red-light)',border:'1px solid #fca5a5',borderRadius:8,padding:'10px 12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontSize:13,color:'#991b1b',fontWeight:600}}>{rec.deductionNote||'Deduction'}</span>
            <span style={{fontSize:13,fontWeight:800,color:'#991b1b'}}>({fmtMoney(ded)})</span>
          </div>
        </div>
      </div>}

      {/* Net pay highlight */}
      <div style={{background:'var(--blue-light)',border:'1px solid #93c5fd',borderRadius:10,padding:'14px 16px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontWeight:700,fontSize:14,color:'var(--navy)'}}>Net Pay</span>
        <span style={{fontWeight:900,fontSize:22,color:'var(--navy)'}}>{fmtMoney(rec.net)}</span>
      </div>

      {/* Payment info */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:rec.notes?12:0}}>
        <div style={{background:'var(--bg2)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>Payment Status</div>
          <div style={{fontWeight:700,fontSize:13,color:rec.paid?'var(--green)':'var(--amber)'}}>{rec.paid?'Paid':'Pending'}</div>
        </div>
        <div style={{background:'var(--bg2)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>Paid On</div>
          <div style={{fontWeight:700,fontSize:13,color:rec.payDate?'var(--text1)':'var(--text3)'}}>{rec.payDate?fmtDate(rec.payDate):'—'}</div>
        </div>
      </div>

      {rec.notes&&<div style={{marginTop:10,padding:'8px 12px',background:'var(--bg2)',borderRadius:8,fontSize:12,color:'var(--text2)',borderLeft:'3px solid var(--border2)'}}>
        <span style={{fontWeight:700}}>Note: </span>{rec.notes}
      </div>}
    </Modal>
  );
}

function CommissionTab({filteredComm,selMonth,empById,setCommRecs,showToast,employees,openCommReceipt,addAudit}) {
  const [commTab,setCommTab]=useState('pending');
  const [reviewModal,setReviewModal]=useState(false);
  const [settleModal,setSettleModal]=useState(false);
  const [editModal,setEditModal]=useState(false);
  const [selComm,setSelComm]=useState(null);

  const byStatus={
    pending: filteredComm.filter(c=>c.status==='pending'),
    approved: filteredComm.filter(c=>c.status==='approved'),
    paid: filteredComm.filter(c=>c.status==='paid'),
    rejected: filteredComm.filter(c=>c.status==='rejected'),
    all: filteredComm,
  };
  const shown = byStatus[commTab]||[];
  const fmtDate2=fmtDate,fmtMoney2=fmtMoney;

  function doApprove(comment) {
    setCommRecs(prev=>prev.map(c=>c.id===selComm.id?{...c,status:'approved',approvedBy:'Admin',approvedDate:today(),notes:comment?comment:c.notes}:c));
    const empName=empById(selComm.empId).name;
    if(addAudit) addAudit('COMMISSION_APPROVED',`${empName}: ${selComm.deal}, ${fmtMoney(selComm.amount)}`,selComm.empId);
    showToast('Commission approved','success');
  }
  function doReject(reason) {
    setCommRecs(prev=>prev.map(c=>c.id===selComm.id?{...c,status:'rejected',approvedBy:'Admin',approvedDate:today(),rejectedReason:reason}:c));
    const empName=empById(selComm.empId).name;
    if(addAudit) addAudit('COMMISSION_REJECTED',`${empName}: ${selComm.deal}, ${fmtMoney(selComm.amount)} — ${reason}`,selComm.empId);
    showToast('Commission rejected','error');
  }
  function doSettle(payDate,method,ref) {
    setCommRecs(prev=>prev.map(c=>c.id===selComm.id?{...c,status:'paid',payDate,notes:c.notes+(ref?' | Payment ref: '+ref:'')}:c));
    const empName=empById(selComm.empId).name;
    if(addAudit) addAudit('COMMISSION_PAID',`${empName}: ${selComm.deal}, ${fmtMoney(selComm.amount)}, Paid ${payDate}`,selComm.empId);
    showToast('Commission settled — marked as paid','success');
  }

  const STATUS_META={
    pending:{label:'Pending Review',icon:'⏳',cls:'badge-amber'},
    approved:{label:'Approved',icon:'✅',cls:'badge-blue'},
    paid:{label:'Paid',icon:'💚',cls:'badge-green'},
    rejected:{label:'Rejected',icon:'❌',cls:'badge-red'},
  };

  return (
    <div>
      {/* Pipeline summary cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {['pending','approved','paid','rejected'].map(s=>{
          const meta=STATUS_META[s];
          const recs=byStatus[s]||[];
          const total=recs.reduce((a,c)=>a+c.amount,0);
          return (
            <div key={s} onClick={()=>setCommTab(s)} style={{padding:'12px 14px',borderRadius:10,border:`1.5px solid ${commTab===s?'var(--blue)':'var(--border)'}`,background:commTab===s?'var(--blue-light)':'#fff',cursor:'pointer',transition:'all .15s'}}>
              <div style={{fontSize:11,fontWeight:700,color:commTab===s?'var(--blue2)':'var(--text2)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>{meta.icon} {meta.label}</div>
              <div style={{fontSize:20,fontWeight:800,color:commTab===s?'var(--blue2)':'var(--text1)'}}>{recs.length}</div>
              {total>0&&<div style={{fontSize:11,color:'var(--text2)',marginTop:2}}>{fmtMoney(total)}</div>}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
          <div style={{display:'flex',gap:2,background:'var(--bg3)',borderRadius:10,padding:'3px',flexWrap:'wrap'}}>
            {['pending','approved','paid','rejected','all'].map(t=>(
              <div key={t} className={`tab ${commTab===t?'active':''}`} onClick={()=>setCommTab(t)} style={{fontSize:12,padding:'5px 12px'}}>
                {t==='all'?'All':STATUS_META[t]?.label||t}
                <span className="tab-count">{byStatus[t]?.length||0}</span>
              </div>
            ))}
          </div>
          <span style={{fontSize:12,color:'var(--text2)',marginLeft:'auto'}}>
            {shown.length} record{shown.length!==1?'s':''} · {fmtMoney(shown.reduce((a,c)=>a+c.amount,0))} total
          </span>
        </div>

        {shown.length===0
          ? <div style={{padding:'48px 24px',textAlign:'center',color:'var(--text3)'}}>
              <div style={{fontSize:36,marginBottom:10}}>📭</div>
              <div style={{fontWeight:700,fontSize:14,color:'var(--text2)',marginBottom:4}}>
                No {commTab==='all'?'':STATUS_META[commTab]?.label.toLowerCase()+' '}commission records{selMonth!=='All'?' for '+selMonth:''}
              </div>
              <div style={{fontSize:12}}>Records are filtered by transaction date month.</div>
            </div>
          : <div className="table-wrap">
              <table>
                <thead><tr>
                  <th>Broker</th>
                  <th>Deal & Property</th>
                  <th>Client</th>
                  <th style={{textAlign:'right'}}>Prop. Value</th>
                  <th>Rate</th>
                  <th style={{textAlign:'right'}}>Commission</th>
                  <th>Tx Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>
                  {shown.map(c=>{
                    const emp=empById(c.empId);
                    const meta=STATUS_META[c.status]||STATUS_META.pending;
                    return (
                      <tr key={c.id}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <Avatar name={emp.name} id={emp.id} size={30} fontSize={10}/>
                            <div>
                              <div style={{fontWeight:700,fontSize:13}}>{emp.name}</div>
                              <div style={{fontSize:10,color:'var(--text3)'}}>{emp.dept}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{maxWidth:190}}>
                          <div style={{fontWeight:600,fontSize:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{c.deal}</div>
                          {c.property&&<div style={{fontSize:10,color:'var(--text3)'}}>{c.property}</div>}
                          {c.status==='rejected'&&c.rejectedReason&&(
                            <div style={{fontSize:10,color:'var(--red)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}} title={c.rejectedReason}>
                              ✕ {c.rejectedReason}
                            </div>
                          )}
                        </td>
                        <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{c.client||'—'}</td>
                        <td style={{textAlign:'right',fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{c.propVal>0?fmtMoney(c.propVal):'—'}</td>
                        <td style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>{c.rate>0?c.rate+'%':'—'}</td>
                        <td style={{textAlign:'right',whiteSpace:'nowrap'}}>
                          <div style={{fontWeight:800,fontSize:14,color:'var(--green)'}}>{fmtMoney(c.amount)}</div>
                          {c.status==='paid'&&c.payDate&&<div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>Paid {fmtDate(c.payDate)}</div>}
                          {c.status==='approved'&&c.approvedDate&&<div style={{fontSize:10,color:'var(--blue)',marginTop:1}}>Approved {fmtDate(c.approvedDate)}</div>}
                        </td>
                        <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(c.txDate)}</td>
                        <td><Badge cls={meta.cls}>{meta.icon} {meta.label}</Badge></td>
                        <td>
                          <div style={{display:'flex',gap:4,flexWrap:'nowrap'}}>
                            {c.status==='pending'&&(
                              <button className="btn btn-amber btn-sm" onClick={()=>{setSelComm(c);setReviewModal(true);}}>🔍 Review</button>
                            )}
                            {c.status==='approved'&&(
                              <button className="btn btn-success btn-sm" onClick={()=>{setSelComm(c);setSettleModal(true);}}>💸 Settle</button>
                            )}
                            {c.status==='paid'&&(
                              <button className="btn btn-ghost btn-sm" onClick={()=>openCommReceipt(c)}>🧾 Receipt</button>
                            )}
                            {(c.status==='pending'||c.status==='rejected')&&(
                              <button className="btn btn-ghost btn-sm" onClick={()=>{setSelComm(c);setEditModal(true);}}>✏️</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {shown.length>0&&<tfoot>
                  <tr style={{background:'var(--bg2)'}}>
                    <td colSpan="5" style={{padding:'9px 14px',fontWeight:700,fontSize:12}}>
                      Totals — {commTab==='all'?'All':STATUS_META[commTab]?.label} · {shown.length} records
                    </td>
                    <td style={{textAlign:'right',padding:'9px 14px',fontWeight:800,fontSize:14,color:'var(--green)',whiteSpace:'nowrap'}}>
                      {fmtMoney(shown.reduce((a,c)=>a+c.amount,0))}
                    </td>
                    <td colSpan="3" style={{padding:'9px 14px',fontSize:12,color:'var(--text2)'}}>
                      {shown.filter(c=>c.status==='paid').length>0&&<span style={{color:'var(--green)',fontWeight:700,marginRight:10}}>✓ {shown.filter(c=>c.status==='paid').length} paid</span>}
                      {shown.filter(c=>c.status==='approved').length>0&&<span style={{color:'var(--blue)',fontWeight:700,marginRight:10}}>⏳ {shown.filter(c=>c.status==='approved').length} to settle</span>}
                      {shown.filter(c=>c.status==='pending').length>0&&<span style={{color:'var(--amber)',fontWeight:700}}>🔍 {shown.filter(c=>c.status==='pending').length} to review</span>}
                    </td>
                  </tr>
                </tfoot>}
              </table>
            </div>}
      </div>

      <CommReviewModal open={reviewModal} onClose={()=>setReviewModal(false)} rec={selComm} empName={selComm?empById(selComm.empId).name:''} onApprove={doApprove} onReject={doReject}/>
      <CommSettleModal open={settleModal} onClose={()=>setSettleModal(false)} rec={selComm} empName={selComm?empById(selComm.empId).name:''} onSettle={doSettle}/>
      <AddCommModal open={editModal} onClose={()=>setEditModal(false)} employees={employees} initial={selComm} onSave={r=>{setCommRecs(prev=>prev.map(c=>c.id===r.id?r:c));showToast('Commission updated','success');}}/>
    </div>
  );
}

function PayrollExceptions({salaryRecs, commRecs, employees}) {
  const seen=new Set();
  const exceptions=[];
  salaryRecs.forEach(s=>{
    const key=s.empId+'|'+s.month;
    if(seen.has(key)) exceptions.push({severity:'danger',msg:'Duplicate salary record',detail:(employees.find(e=>e.id===s.empId)||{name:s.empId}).name+' — '+s.month});
    seen.add(key);
    if(s.paid&&!s.payDate) exceptions.push({severity:'warn',msg:'Paid record missing payment date',detail:(employees.find(e=>e.id===s.empId)||{name:s.empId}).name+' — '+s.month});
  });
  commRecs.forEach(c=>{
    if(c.status==='pending'&&c.submittedDate){
      const days=Math.floor((new Date()-new Date(c.submittedDate))/86400000);
      if(days>14) exceptions.push({severity:'warn',msg:'Commission pending '+days+' days',detail:(employees.find(e=>e.id===c.empId)||{name:c.empId}).name+' — '+c.deal});
    }
  });
  employees.filter(e=>e.status!=='active').forEach(e=>{
    if(salaryRecs.some(s=>s.empId===e.id&&!s.paid))
      exceptions.push({severity:'danger',msg:'Inactive employee has unpaid salary',detail:e.name+' ('+e.status+')'});
  });
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">⚠️ Payroll Exceptions</span>
        <span style={{fontSize:12,color:'var(--text2)'}}>Auto-detected issues across all records</span>
      </div>
      {exceptions.length===0
        ? <div style={{padding:'40px 24px',textAlign:'center',color:'var(--text3)'}}>
            <div style={{fontSize:32,marginBottom:10}}>✅</div>
            <div style={{fontWeight:700,fontSize:14,color:'var(--text2)'}}>No exceptions found</div>
            <div style={{fontSize:12,marginTop:4}}>All payroll records look clean.</div>
          </div>
        : <div style={{padding:'8px 16px'}}>
            {exceptions.map((ex,i)=>(
              <div key={i} className={'alert '+(ex.severity==='danger'?'danger':'warn')} style={{marginBottom:8}}>
                <span className="alert-icon">{ex.severity==='danger'?'🚨':'⚠️'}</span>
                <div className="alert-content">
                  <div className="alert-title">{ex.msg}</div>
                  <div className="alert-sub">{ex.detail}</div>
                </div>
              </div>
            ))}
          </div>}
    </div>
  );
}

function PayrollPage({employees,salaryRecs,setSalaryRecs,commRecs,setCommRecs,showToast,addAudit}) {
  const [tab,setTab]=useState('salary');
  const [selMonth,setSelMonth]=useState(()=>{
    const d=new Date();
    return d.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  });
  const [addSalModal,setAddSalModal]=useState(false);
  const [addCommModal,setAddCommModal]=useState(false);
  const [batchModal,setBatchModal]=useState(false);
  const [receiptModal,setReceiptModal]=useState(false);
  const [receiptData,setReceiptData]=useState(null);
  const [paidModal,setPaidModal]=useState(false);
  const [paidTarget,setPaidTarget]=useState(null);
  const [detailRec,setDetailRec]=useState(null);

  function empById(id){return employees.find(e=>e.id===id)||{name:id,id,title:'',dept:'',type:''};}

  const allMonths=[...new Set(salaryRecs.map(s=>s.month))].sort((a,b)=>{
    const parse=m=>{const[mn,yr]=m.split(' ');return new Date(mn+' 1, '+yr);};
    return parse(b)-parse(a);
  });

  const filteredSal=selMonth==='All'?salaryRecs:salaryRecs.filter(s=>s.month===selMonth);
  const filteredComm=selMonth==='All'?commRecs:commRecs.filter(c=>{
    if(!c.txDate) return false;
    const label=new Date(c.txDate).toLocaleDateString('en-US',{month:'long',year:'numeric'});
    return label===selMonth;
  });

  const totSalPaid=filteredSal.filter(s=>s.paid).reduce((a,s)=>a+s.net,0);
  const totSalPending=filteredSal.filter(s=>!s.paid).reduce((a,s)=>a+s.net,0);
  const totCommPaid=filteredComm.filter(c=>c.status==='paid').reduce((a,c)=>a+c.amount,0);
  const totCommPending=filteredComm.filter(c=>c.status==='pending').reduce((a,c)=>a+c.amount,0);
  const periodLabel=selMonth==='All'?'All Time':selMonth;

  const grossSal=filteredSal.reduce((a,s)=>a+(s.basic||0)+(s.housing||0)+(s.transport||0)+(s.bonus||0),0);
  const totalDed=filteredSal.reduce((a,s)=>a+(s.deductions||0),0);
  const netPayroll=filteredSal.reduce((a,s)=>a+(s.net||0),0);
  const empInRun=[...new Set(filteredSal.map(s=>s.empId))].length;
  const paidCount=filteredSal.filter(s=>s.paid).length;
  const unpaidCount=filteredSal.filter(s=>!s.paid).length;
  const commToSettle=filteredComm.filter(c=>c.status==='approved').length;

  const summaryMetrics=[
    {label:'Gross Payroll',value:fmtMoney(grossSal),sub:'Before deductions',color:'var(--text1)',bg:'var(--bg2)'},
    {label:'Total Deductions',value:totalDed>0?'('+fmtMoney(totalDed)+')':'AED 0',sub:totalDed>0?'GPSSA, absences, advances':'None this period',color:totalDed>0?'var(--red)':'var(--text3)',bg:totalDed>0?'var(--red-light)':'var(--bg2)'},
    {label:'Net Payroll',value:fmtMoney(netPayroll),sub:empInRun+' employee'+(empInRun!==1?'s':'')+' in run',color:'var(--navy)',bg:'var(--blue-light)'},
    {label:'Paid',value:fmtMoney(totSalPaid),sub:paidCount+' record'+(paidCount!==1?'s':''),color:'var(--green)',bg:'var(--green-light)'},
    {label:'Unpaid',value:fmtMoney(totSalPending),sub:unpaidCount+' record'+(unpaidCount!==1?'s':''),color:unpaidCount>0?'var(--amber)':'var(--text3)',bg:unpaidCount>0?'var(--amber-light)':'var(--bg2)'},
    {label:'Commission',value:fmtMoney(totCommPaid+totCommPending),sub:commToSettle+' to settle',color:'var(--blue2)',bg:'var(--blue-light)'},
  ];

  function openSalReceipt(rec){const emp=empById(rec.empId);setReceiptData({type:'salary',rec,emp});setReceiptModal(true);}
  function openCommReceipt(rec){const emp=empById(rec.empId);setReceiptData({type:'commission',rec,emp});setReceiptModal(true);}
  function markSalPaid(rec,payDate){
    setSalaryRecs(prev=>prev.map(s=>s.id===rec.id?{...s,paid:true,payDate}:s));
    const empName=(employees.find(e=>e.id===rec.empId)||{name:rec.empId}).name;
    if(addAudit) addAudit('SALARY_PAID',`${empName}: ${rec.month}, Net ${fmtMoney(rec.net)}, Paid on ${payDate}`,rec.empId);
    showToast('Salary marked as paid','success');
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:18,flexWrap:'wrap'}}>
        <span style={{fontSize:12,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.5px'}}>Period:</span>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {['All',...allMonths].map(m=>(
            <button key={m} onClick={()=>setSelMonth(m)} style={{
              padding:'5px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',
              border:'1.5px solid '+(selMonth===m?'var(--blue)':'var(--border)'),
              background:selMonth===m?'var(--blue-light)':'#fff',
              color:selMonth===m?'var(--blue2)':'var(--text2)',
              transition:'all .15s'
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:20}}>
        {summaryMetrics.map(m=>(
          <div key={m.label} style={{background:m.bg,borderRadius:10,padding:'12px 14px',border:'1px solid var(--border)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:6}}>{m.label}</div>
            <div style={{fontSize:14,fontWeight:800,color:m.color,lineHeight:1,marginBottom:3}}>{m.value}</div>
            <div style={{fontSize:10,color:'var(--text3)'}}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div className="tab-bar">
          <div className={'tab '+(tab==='salary'?'active':'')} onClick={()=>setTab('salary')}>Salary <span className="tab-count">{filteredSal.length}</span></div>
          <div className={'tab '+(tab==='commission'?'active':'')} onClick={()=>setTab('commission')}>Commission <span className="tab-count">{filteredComm.length}</span></div>
          <div className={'tab '+(tab==='exceptions'?'active':'')} onClick={()=>setTab('exceptions')}>⚠️ Exceptions</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {tab==='salary'&&<button className="btn btn-ghost btn-sm" onClick={()=>setBatchModal(true)} style={{borderColor:'var(--blue)',color:'var(--blue)'}}>⚡ Batch Run</button>}
          {tab==='salary'&&<button className="btn btn-primary btn-sm" onClick={()=>setAddSalModal(true)}>+ Record Salary</button>}
          {tab==='commission'&&<button className="btn btn-primary btn-sm" onClick={()=>setAddCommModal(true)}>+ Record Commission</button>}
        </div>
      </div>

      {tab==='exceptions'&&<PayrollExceptions salaryRecs={salaryRecs} commRecs={commRecs} employees={employees}/>}

      {tab==='salary'&&(
        <div className="card">
          <div className="card-header">
            <span className="card-title">{'💰 Salary Records — '+periodLabel}</span>
            <span style={{fontSize:12,color:'var(--text2)'}}>{filteredSal.length+' record'+(filteredSal.length!==1?'s':'')+' · '+filteredSal.filter(s=>s.paid).length+' paid · '+filteredSal.filter(s=>!s.paid).length+' pending'}</span>
          </div>
          {filteredSal.length===0
            ?<div style={{padding:'48px 24px',textAlign:'center',color:'var(--text3)'}}>
              <div style={{fontSize:36,marginBottom:10}}>📭</div>
              <div style={{fontWeight:700,fontSize:14,color:'var(--text2)',marginBottom:4}}>No records for {periodLabel}</div>
              <div style={{fontSize:12}}>Select a different period above, or add a new record.</div>
             </div>
            :<div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Employee</th><th>Period</th>
                    <th style={{textAlign:'right'}}>Basic</th>
                    <th style={{textAlign:'right'}}>SIM Card</th>
                    <th style={{textAlign:'right'}}>Transport</th>
                    <th style={{textAlign:'right'}}>Bonus</th>
                    <th style={{textAlign:'right',color:'var(--red)'}}>Deductions</th>
                    <th style={{textAlign:'right',borderLeft:'2px solid var(--border2)'}}>Net Pay</th>
                    <th>Status</th><th>Paid On</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSal.map(s=>{
                    const emp=empById(s.empId);
                    const gross=(s.basic||0)+(s.housing||0)+(s.transport||0)+(s.bonus||0);
                    const ded=s.deductions||0;
                    return (
                      <tr key={s.id} style={{cursor:'pointer'}} onClick={()=>setDetailRec({rec:s,emp})}>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:9}}>
                            <Avatar name={emp.name} id={emp.id} size={30} fontSize={10}/>
                            <div>
                              <div style={{fontWeight:700,fontSize:13}}>{emp.name}</div>
                              <div style={{fontSize:11,color:'var(--text2)'}}>{emp.title}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>{s.month}</td>
                        <td style={{textAlign:'right',fontWeight:600,fontSize:13}}>{fmtMoney(s.basic)}</td>
                        <td style={{textAlign:'right',fontSize:12,color:(s.housing||0)>0?'var(--text1)':'var(--text3)'}}>{(s.housing||0)>0?fmtMoney(s.housing):'—'}</td>
                        <td style={{textAlign:'right',fontSize:12,color:(s.transport||0)>0?'var(--text1)':'var(--text3)'}}>{(s.transport||0)>0?fmtMoney(s.transport):'—'}</td>
                        <td style={{textAlign:'right',fontSize:12,color:(s.bonus||0)>0?'var(--amber)':'var(--text3)',fontWeight:(s.bonus||0)>0?700:400}}>{(s.bonus||0)>0?fmtMoney(s.bonus):'—'}</td>
                        <td style={{textAlign:'right',fontSize:12,maxWidth:160}}>
                          {ded>0
                            ?<div>
                               <div style={{color:'var(--red)',fontWeight:700}}>{'('+fmtMoney(ded)+')'}</div>
                               {s.deductionNote&&<div style={{fontSize:10,color:'var(--red)',opacity:.75,marginTop:2,whiteSpace:'normal',lineHeight:1.3}}>{s.deductionNote}</div>}
                             </div>
                            :<span style={{color:'var(--text3)'}}>—</span>}
                        </td>
                        <td style={{textAlign:'right',borderLeft:'2px solid var(--border2)',paddingLeft:14}}>
                          <div style={{fontWeight:800,fontSize:14,color:'var(--navy)'}}>{fmtMoney(s.net)}</div>
                          {ded>0&&<div style={{fontSize:10,color:'var(--text3)',marginTop:1}}>{'gross '+fmtMoney(gross)}</div>}
                        </td>
                        <td><StatusBadge status={s.paid?'paid':'pending'}/></td>
                        <td style={{fontSize:12,whiteSpace:'nowrap'}}>
                          {s.paid&&s.payDate?<div style={{fontWeight:600,fontSize:12}}>{fmtDate(s.payDate)}</div>:<span style={{color:'var(--text3)',fontSize:11}}>Not paid</span>}
                        </td>
                        <td onClick={e=>e.stopPropagation()}>
                          <div style={{display:'flex',gap:5}}>
                            <button className="btn btn-ghost btn-sm" onClick={()=>openSalReceipt(s)}>🧾 Slip</button>
                            {!s.paid&&<button className="btn btn-success btn-sm" onClick={()=>{setPaidTarget(s);setPaidModal(true);}}>✓ Pay</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{background:'var(--bg2)'}}>
                    <td colSpan="2" style={{fontWeight:700,fontSize:12,padding:'10px 14px'}}>
                      {'Totals — '+periodLabel}
                      <div style={{fontSize:10,color:'var(--text3)',fontWeight:400,marginTop:1}}>{filteredSal.length+' record'+(filteredSal.length!==1?'s':'')}</div>
                    </td>
                    <td style={{textAlign:'right',fontWeight:700,padding:'10px 14px'}}>{fmtMoney(filteredSal.reduce((a,s)=>a+(s.basic||0),0))}</td>
                    <td style={{textAlign:'right',fontWeight:600,padding:'10px 14px',fontSize:12}}>{fmtMoney(filteredSal.reduce((a,s)=>a+(s.housing||0),0))}</td>
                    <td style={{textAlign:'right',fontWeight:600,padding:'10px 14px',fontSize:12}}>{fmtMoney(filteredSal.reduce((a,s)=>a+(s.transport||0),0))}</td>
                    <td style={{textAlign:'right',fontWeight:600,padding:'10px 14px',fontSize:12,color:'var(--amber)'}}>{filteredSal.reduce((a,s)=>a+(s.bonus||0),0)>0?fmtMoney(filteredSal.reduce((a,s)=>a+(s.bonus||0),0)):'—'}</td>
                    <td style={{textAlign:'right',fontWeight:700,padding:'10px 14px',fontSize:12,color:'var(--red)'}}>{filteredSal.reduce((a,s)=>a+(s.deductions||0),0)>0?'('+fmtMoney(filteredSal.reduce((a,s)=>a+(s.deductions||0),0))+')':'—'}</td>
                    <td style={{textAlign:'right',fontWeight:800,fontSize:15,padding:'10px 14px',borderLeft:'2px solid var(--border2)',color:'var(--navy)'}}>{fmtMoney(filteredSal.reduce((a,s)=>a+(s.net||0),0))}</td>
                    <td colSpan="3" style={{padding:'10px 14px'}}>
                      <span style={{fontSize:12,color:'var(--green)',fontWeight:700}}>{filteredSal.filter(s=>s.paid).length+' paid'}</span>
                      {filteredSal.filter(s=>!s.paid).length>0&&<span style={{fontSize:12,color:'var(--amber)',fontWeight:700,marginLeft:10}}>{filteredSal.filter(s=>!s.paid).length+' pending'}</span>}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>}
        </div>
      )}

      {tab==='commission'&&<CommissionTab
        filteredComm={filteredComm}
        selMonth={selMonth}
        empById={empById}
        setCommRecs={setCommRecs}
        showToast={showToast}
        employees={employees}
        openCommReceipt={openCommReceipt}
        addAudit={addAudit}
      />}

      <AddSalaryModal open={addSalModal} onClose={()=>setAddSalModal(false)} employees={employees} salaryRecs={salaryRecs} onSave={r=>{setSalaryRecs(p=>[r,...p]);showToast('Salary record added','success');}}/>
      <BatchPayrollModal open={batchModal} onClose={()=>setBatchModal(false)} employees={employees} salaryRecs={salaryRecs} showToast={showToast} onSave={recs=>{setSalaryRecs(p=>[...recs,...p]);showToast(recs.length+' salary records created','success');}}/>
      <AddCommModal open={addCommModal} onClose={()=>setAddCommModal(false)} employees={employees} onSave={r=>{setCommRecs(p=>[r,...p]);showToast('Commission submitted for review','success');}}/>
      <MarkPaidModal open={paidModal} onClose={()=>setPaidModal(false)} record={paidTarget} onSave={d=>markSalPaid(paidTarget,d)}/>
      <ReceiptModal open={receiptModal} onClose={()=>setReceiptModal(false)} type={receiptData?receiptData.type:null} rec={receiptData?receiptData.rec:null} emp={receiptData?receiptData.emp:null}/>
      <SalaryDetailModal open={!!detailRec} onClose={()=>setDetailRec(null)} rec={detailRec?detailRec.rec:null} emp={detailRec?detailRec.emp:null} onOpenReceipt={openSalReceipt} onMarkPaid={r=>{setPaidTarget(r);setPaidModal(true);}}/>
    </div>
  );
}

/* === REQUESTS PAGE (ADMIN) === */
function RequestsPage({employees,requests,setRequests,showToast,addAudit}) {
  const [tab,setTab]=useState('pending');
  const [respondModal,setRespondModal]=useState(false);
  const [addModal,setAddModal]=useState(false);
  const [detailReq,setDetailReq]=useState(null);
  const [selReq,setSelReq]=useState(null);
  function empById(id){return employees.find(e=>e.id===id)||{name:id};}
  const byTab={
    pending:requests.filter(r=>r.status==='pending'),
    in_progress:requests.filter(r=>r.status==='in_progress'),
    completed:requests.filter(r=>r.status==='completed'),
    rejected:requests.filter(r=>r.status==='rejected'),
    all:requests
  };
  const shown=byTab[tab]||[];
  function doAction(status,comment){
    setRequests(prev=>prev.map(r=>r.id===selReq.id?{...r,status,comments:comment,completedDate:status==='completed'?today():r.completedDate}:r));
    const empName=(employees.find(e=>e.id===selReq.empId)||{name:selReq.empId}).name;
    if(addAudit) addAudit('REQUEST_'+status.toUpperCase(),`${empName}: ${selReq.type}${comment?' — '+comment:''}`,selReq.empId);
    showToast(`Request updated to "${status.replace('_',' ')}"`,status==='completed'?'success':'info');
  }
  function addRequest(rec){
    setRequests(prev=>[rec,...prev]);
    const empName=(employees.find(e=>e.id===rec.empId)||{name:rec.empId}).name;
    if(addAudit) addAudit('REQUEST_CREATED',`${empName}: ${rec.type} — ${rec.reason||''}`,rec.empId);
    showToast('Request created successfully','success');
  }
  function deleteReq(id){
    if(!confirm('Delete this request?')) return;
    const req=requests.find(r=>r.id===id);
    setRequests(prev=>prev.filter(r=>r.id!==id));
    setDetailReq(null);
    if(req&&addAudit) addAudit('REQUEST_DELETED',`${(employees.find(e=>e.id===req.empId)||{name:req.empId}).name}: ${req.type}`,req.empId);
    showToast('Request deleted','error');
  }

  const PRIORITY_META={
    urgent:{label:'Urgent',cls:'badge-red',icon:'🔴'},
    high:{label:'High',cls:'badge-amber',icon:'🟠'},
    normal:{label:'Normal',cls:'badge-blue',icon:'🔵'},
    low:{label:'Low',cls:'badge-gray',icon:'⚪'},
  };

  const LETTER_TYPES = ['Employment Certificate','Salary Certificate','NOC Letter','Experience Certificate'];
  function canGenerateLetter(r) { return LETTER_TYPES.includes(r.type); }
  function doGenerateLetter(r) {
    const emp = empById(r.empId);
    generateHRLetter(r.type, emp, {reason: r.reason});
  }

  // Stats
  const stats=[
    {label:'Pending',value:byTab.pending.length,color:'var(--amber)',bg:'var(--amber-light)',icon:'⏳'},
    {label:'In Progress',value:byTab.in_progress.length,color:'var(--blue)',bg:'var(--blue-light)',icon:'🔄'},
    {label:'Completed',value:byTab.completed.length,color:'var(--green)',bg:'var(--green-light)',icon:'✅'},
    {label:'Rejected',value:byTab.rejected.length,color:'var(--red)',bg:'var(--red-light)',icon:'❌'},
  ];

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <SectionHeader title="HR Requests" sub="Create, review and manage employee requests" style={{marginBottom:0}}/>
        <button className="btn btn-primary" onClick={()=>setAddModal(true)}>+ New Request</button>
      </div>

      {/* Stats cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
        {stats.map(s=>(
          <div key={s.label} onClick={()=>setTab(s.label.toLowerCase().replace(' ','_'))} style={{padding:'12px 14px',borderRadius:10,border:'1px solid var(--border)',background:tab===s.label.toLowerCase().replace(' ','_')?s.bg:'#fff',cursor:'pointer',transition:'all .15s'}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text2)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>{s.icon} {s.label}</div>
            <div style={{fontSize:22,fontWeight:800,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="tab-bar" style={{marginBottom:14}}>
        {['pending','in_progress','completed','rejected','all'].map(t=><div key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t.replace('_',' ').replace(/\b\w/g,x=>x.toUpperCase())}<span className="tab-count">{byTab[t]?.length}</span></div>)}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Employee</th><th>Request Type</th><th>Priority</th><th>Purpose</th><th>Submitted</th><th>Status</th><th>Completed</th><th>Actions</th></tr></thead>
            <tbody>
              {shown.length===0&&<tr><td colSpan="8"><Empty icon="📋" text="No requests here" sub="This category is empty"/></td></tr>}
              {shown.map(r=>{
                const emp=empById(r.empId);
                const pri=PRIORITY_META[r.priority]||PRIORITY_META.normal;
                return (
                  <tr key={r.id} style={{cursor:'pointer'}} onClick={()=>setDetailReq(r)}>
                    <td><div style={{display:'flex',alignItems:'center',gap:8}}><Avatar name={emp.name} id={r.empId} size={30} fontSize={10}/><div><div style={{fontWeight:700,fontSize:13}}>{emp.name}</div><div style={{fontSize:10,color:'var(--text3)'}}>{emp.dept||emp.title||r.empId}</div></div></div></td>
                    <td><Badge cls="badge-blue">{r.type}</Badge></td>
                    <td><Badge cls={pri.cls}>{pri.icon} {pri.label}</Badge></td>
                    <td style={{fontSize:12,color:'var(--text2)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.reason||'—'}</td>
                    <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(r.requestDate)}</td>
                    <td><StatusBadge status={r.status}/></td>
                    <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{r.completedDate?fmtDate(r.completedDate):'—'}</td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{display:'flex',gap:4}}>
                        {r.status!=='completed'&&r.status!=='rejected'
                          ?<button className="btn btn-ghost btn-sm" onClick={()=>{setSelReq(r);setRespondModal(true);}}>Respond</button>
                          :<span style={{fontSize:11,color:r.status==='completed'?'var(--green)':'var(--red)'}}>{r.status==='completed'?'✓ Done':'✕ Rejected'}</span>}
                        {r.status==='completed'&&canGenerateLetter(r)&&<button className="btn btn-success btn-sm" onClick={()=>doGenerateLetter(r)} title="Generate Letter">📄 Letter</button>}
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={()=>deleteReq(r.id)} title="Delete" style={{color:'var(--red)',fontSize:12}}>🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail side panel */}
      {detailReq&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setDetailReq(null);}}>
          <div className="modal modal-sm" style={{marginLeft:'auto',marginRight:20,height:'auto',maxHeight:'90vh',overflowY:'auto'}}>
            <div className="modal-header">
              <span className="modal-title">Request Details</span>
              <button className="close-btn" onClick={()=>setDetailReq(null)}>✕</button>
            </div>
            <div style={{padding:20}}>
              {(()=>{
                const emp=empById(detailReq.empId);
                const pri=PRIORITY_META[detailReq.priority]||PRIORITY_META.normal;
                return <>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
                    <Avatar name={emp.name} id={detailReq.empId} size={42} fontSize={14}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:15}}>{emp.name}</div>
                      <div style={{fontSize:12,color:'var(--text2)'}}>{emp.title||''} · {emp.dept||''}</div>
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
                    {[
                      ['Request Type',<Badge cls="badge-blue">{detailReq.type}</Badge>],
                      ['Priority',<Badge cls={pri.cls}>{pri.icon} {pri.label}</Badge>],
                      ['Submitted',fmtDate(detailReq.requestDate)],
                      ['Status',<StatusBadge status={detailReq.status}/>],
                      detailReq.completedDate&&['Completed',fmtDate(detailReq.completedDate)],
                    ].filter(Boolean).map(([l,v],i)=>(
                      <div key={i} style={{padding:'8px 10px',background:'var(--bg2)',borderRadius:6}}>
                        <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:600}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {detailReq.reason&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>Purpose / Reason</div>
                      <div style={{fontSize:13,color:'var(--text1)',lineHeight:1.5,padding:'10px 12px',background:'var(--bg2)',borderRadius:6,border:'1px solid var(--border)'}}>{detailReq.reason}</div>
                    </div>
                  )}
                  {detailReq.comments&&(
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:10,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:4}}>HR Comments</div>
                      <div style={{fontSize:13,color:'var(--text1)',lineHeight:1.5,padding:'10px 12px',background:'var(--blue-light)',borderRadius:6,border:'1px solid var(--border)'}}>{detailReq.comments}</div>
                    </div>
                  )}
                  <div style={{display:'flex',gap:8,marginTop:16}}>
                    {detailReq.status!=='completed'&&detailReq.status!=='rejected'&&(
                      <button className="btn btn-primary btn-sm" onClick={()=>{setSelReq(detailReq);setRespondModal(true);setDetailReq(null);}}>Respond</button>
                    )}
                    {detailReq.status==='completed'&&canGenerateLetter(detailReq)&&(
                      <button className="btn btn-success btn-sm" onClick={()=>{doGenerateLetter(detailReq);setDetailReq(null);}}>📄 Generate Letter</button>
                    )}
                    <button className="btn btn-danger btn-sm" onClick={()=>deleteReq(detailReq.id)}>🗑 Delete</button>
                  </div>
                </>;
              })()}
            </div>
          </div>
        </div>
      )}

      <AdminAddRequestModal open={addModal} onClose={()=>setAddModal(false)} employees={employees} onSave={addRequest}/>
      <RespondRequestModal open={respondModal} onClose={()=>setRespondModal(false)} req={selReq} empName={selReq?empById(selReq.empId)?.name:''} onAction={doAction}/>
    </div>
  );
}

/* ── Admin Add Request Modal ── */
function AdminAddRequestModal({open,onClose,employees,onSave}) {
  const activeEmps=employees.filter(e=>e.status==='active');
  const [form,setForm]=useState({empId:'',type:'Employment Certificate',priority:'normal',reason:''});
  useEffect(()=>{if(open)setForm({empId:'',type:'Employment Certificate',priority:'normal',reason:''});},[open]);
  const REQUEST_TYPES=['Employment Certificate','Salary Certificate','NOC Letter','Experience Certificate','Visa Letter','Bank Letter','HR Letter','Advance Salary','Housing Letter','Other Request'];
  function save(){
    if(!form.empId) return alert('Please select an employee');
    if(!form.reason.trim()) return alert('Please add a purpose / reason');
    onSave({id:'REQ'+nowId(),empId:form.empId,type:form.type,priority:form.priority,reason:form.reason,status:'pending',requestDate:today(),completedDate:'',comments:''});
    onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Create New Request" size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create Request</button></>}>

      <div className="form-group"><label className="form-label">Employee *</label>
        <select className="form-select" value={form.empId} onChange={e=>setForm(f=>({...f,empId:e.target.value}))}>
          <option value="">— Select Employee —</option>
          {activeEmps.map(e=><option key={e.id} value={e.id}>{e.name} — {e.dept}</option>)}
        </select>
      </div>

      <div className="form-group"><label className="form-label">Request Type</label>
        <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
          {REQUEST_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="form-group"><label className="form-label">Priority</label>
        <div style={{display:'flex',gap:8}}>
          {[['urgent','🔴 Urgent','var(--red)','var(--red-light)'],['high','🟠 High','var(--amber)','var(--amber-light)'],['normal','🔵 Normal','var(--blue)','var(--blue-light)'],['low','⚪ Low','var(--text3)','var(--bg3)']].map(([v,l,c,bg])=>(
            <div key={v} onClick={()=>setForm(f=>({...f,priority:v}))} style={{
              flex:1,padding:'7px 0',textAlign:'center',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
              border:'1.5px solid '+(form.priority===v?c:'var(--border)'),
              background:form.priority===v?bg:'#fff',
              color:form.priority===v?c:'var(--text2)',transition:'all .15s'
            }}>{l}</div>
          ))}
        </div>
      </div>

      <div className="form-group"><label className="form-label">Purpose / Reason *</label>
        <textarea className="form-textarea" rows="3" placeholder="e.g. Employee requires salary certificate for bank loan application..." value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/>
      </div>
    </Modal>
  );
}

/* === REMINDERS PAGE === */
function RemindersPage({employees}) {
  const alerts=employees.filter(e=>e.status==='active').flatMap(e=>[
    {emp:e,type:'Visa',date:e.visaExpiry,days:daysUntil(e.visaExpiry)},
    {emp:e,type:'Contract',date:e.contractEnd,days:daysUntil(e.contractEnd)},
    {emp:e,type:'Passport',date:e.passExpiry,days:daysUntil(e.passExpiry)},
    {emp:e,type:'Emirates ID',date:e.emiratesId,days:daysUntil(e.emiratesId)},
    {emp:e,type:'RERA',date:e.reraExp,days:daysUntil(e.reraExp)},
  ]).filter(x=>x.days<=90).sort((a,b)=>a.days-b.days);

  const expired=alerts.filter(a=>a.days<0);
  const urgent=alerts.filter(a=>a.days>=0&&a.days<=30);
  const soon=alerts.filter(a=>a.days>30&&a.days<=60);
  const upcoming=alerts.filter(a=>a.days>60&&a.days<=90);

  function ReminderGroup({title,icon,items,cls}) {
    if(items.length===0) return null;
    return (
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <span style={{fontSize:18}}>{icon}</span>
          <span style={{fontWeight:700,fontSize:14}}>{title}</span>
          <Badge cls={cls}>{items.length}</Badge>
        </div>
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Document Type</th><th>Expiry Date</th><th>Days Left</th></tr></thead>
              <tbody>
                {items.map((x,i)=>(
                  <tr key={i}>
                    <td><div style={{display:'flex',alignItems:'center',gap:8}}><Avatar name={x.emp.name} id={x.emp.id} size={30} fontSize={10}/><div><div style={{fontWeight:700,fontSize:13}}>{x.emp.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{x.emp.id}</div></div></div></td>
                    <td><Badge cls="badge-gray">{x.emp.dept}</Badge></td>
                    <td style={{fontWeight:600}}>{x.type}</td>
                    <td>{fmtDate(x.date)}</td>
                    <td><Badge cls={expiryBadge(x.days)}>{expiryLabel(x.days)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title="Reminders & Alerts" sub="Document expiry tracking for all active employees"/>
      {alerts.length===0&&<Empty icon="✅" text="All documents are up to date" sub="No expiries in the next 90 days"/>}
      <ReminderGroup title="Expired / Overdue" icon="🚨" items={expired} cls="badge-red"/>
      <ReminderGroup title="Urgent — Expires within 30 days" icon="⚠️" items={urgent} cls="badge-red"/>
      <ReminderGroup title="Soon — Expires in 31–60 days" icon="🔔" items={soon} cls="badge-amber"/>
      <ReminderGroup title="Upcoming — Expires in 61–90 days" icon="📅" items={upcoming} cls="badge-amber"/>
    </div>
  );
}

/* === REPORTS PAGE === */
function ReportsPage({employees,leaves,salaryRecs,commRecs,attData}) {
  const [active,setActive]=useState('employees');
  const [repYear,setRepYear]=useState(2026);
  const [repMonth,setRepMonth]=useState(new Date().getMonth());
  const [selEmp,setSelEmp]=useState('all');
  const [empSearch,setEmpSearch]=useState('');
  const empById=id=>employees.find(e=>e.id===id)||{name:id};
  const repMonthStr=`${repYear}-${String(repMonth+1).padStart(2,'0')}`;

  // Reports that support individual employee filtering
  const empFilterable = ['attendance','salary','leave','commission'];
  const hasEmpFilter = empFilterable.includes(active);
  // Reset to 'all' when switching report types
  const prevActive = useRef(active);
  useEffect(()=>{ if(prevActive.current!==active){setSelEmp('all');setEmpSearch('');} prevActive.current=active; },[active]);

  // Filtered data based on selected employee
  const selEmpObj = selEmp!=='all' ? employees.find(e=>e.id===selEmp) : null;
  const fSalaryRecs = selEmp==='all' ? salaryRecs : salaryRecs.filter(s=>s.empId===selEmp);
  const fCommRecs = selEmp==='all' ? commRecs : commRecs.filter(c=>c.empId===selEmp);
  const fLeaves = selEmp==='all' ? leaves : leaves.filter(l=>l.empId===selEmp);
  const fEmployees = selEmp==='all' ? employees : employees.filter(e=>e.id===selEmp);

  // Employees with data for search filtering
  const filteredEmpList = empSearch.trim()
    ? employees.filter(e=>e.name.toLowerCase().includes(empSearch.toLowerCase())||e.id.toLowerCase().includes(empSearch.toLowerCase()))
    : employees;

  const reports=[
    {key:'employees',label:'Employee List',icon:'👥'},
    {key:'attendance',label:'Attendance Report',icon:'📅'},
    {key:'leave',label:'Leave Report',icon:'🌴'},
    {key:'salary',label:'Salary Report',icon:'💰'},
    {key:'commission',label:'Commission Report',icon:'🏆'},
    {key:'expiry',label:'Document Expiry',icon:'⚠️'},
    {key:'leavebal',label:'Leave Balance',icon:'📊'},
  ];
  function renderTable() {
    if(active==='employees') return (
      <table><thead><tr><th>Employee</th><th>Title</th><th>Type</th><th>RERA</th><th>Visa</th><th>Contract</th><th>Leave Balance</th><th>Status</th></tr></thead>
      <tbody>{employees.map(e=>(
        <tr key={e.id}>
          <td><div style={{display:'flex',alignItems:'center',gap:9}}><Avatar name={e.name} id={e.id} size={32} fontSize={11}/><div><div style={{fontWeight:700,fontSize:13}}>{e.name}</div><div style={{fontSize:11,color:'var(--text2)'}}>{e.id}</div></div></div></td>
          <td style={{fontSize:12,color:'var(--text2)'}}>{e.title}</td>
          <td><TypeBadge type={e.type}/></td>
          <td>{e.reraNo?<span style={{fontSize:12}}>{e.reraNo}</span>:<span style={{color:'var(--text3)',fontSize:11}}>—</span>}</td>
          <td><Badge cls={expiryBadge(daysUntil(e.visaExpiry))}>{fmtDate(e.visaExpiry)}</Badge></td>
          <td><Badge cls={expiryBadge(daysUntil(e.contractEnd))}>{fmtDate(e.contractEnd)}</Badge></td>
          <td><div style={{display:'flex',alignItems:'center',gap:8,minWidth:100}}><div className="progress" style={{flex:1}}><div className="progress-fill" style={{width:Math.min(100,Math.round(e.leaveBalance/30*100))+'%',background:'var(--blue)'}}/></div><span style={{fontSize:12,fontWeight:600}}>{e.leaveBalance}d</span></div></td>
          <td><StatusBadge status={e.status}/></td>
        </tr>
      ))}</tbody></table>
    );
    if(active==='attendance') {
      const monthLabel = MONTHS[repMonth]+' '+repYear;
      const totalDaysInMonth = new Date(repYear, repMonth+1, 0).getDate();
      // Count weekends in the month
      let weekendDays=0;
      for(let d=1;d<=totalDaysInMonth;d++){const dow=new Date(repYear,repMonth,d).getDay();if(dow===5||dow===6)weekendDays++;}
      const workingDays=totalDaysInMonth-weekendDays;

      const rows=fEmployees.map(e=>{
        const r=(attData[e.id]||[]).filter(x=>x.date&&x.date.startsWith(repMonthStr));
        const p=r.filter(x=>x.status==='present').length;
        const a=r.filter(x=>x.status==='absent').length;
        const l=r.filter(x=>x.status==='leave'||x.status==='sick').length;
        const lt=r.filter(x=>x.status==='late').length;
        const on=r.filter(x=>x.status==='online').length;
        const notSet=r.filter(x=>!x.status||x.status==='').length;
        const recorded=p+a+l+lt+on;
        const rt=workingDays>0?Math.round(recorded>0?(p+lt+on)/workingDays*100:0):0;
        return {emp:e,p,a,l,lt,on,notSet,recorded,rt};
      });

      const totP=rows.reduce((s,r)=>s+r.p,0);
      const totA=rows.reduce((s,r)=>s+r.a,0);
      const totL=rows.reduce((s,r)=>s+r.l,0);
      const totLt=rows.reduce((s,r)=>s+r.lt,0);
      const totOn=rows.reduce((s,r)=>s+r.on,0);
      const totNS=rows.reduce((s,r)=>s+r.notSet,0);

      return (
        <div>
          <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:14,flexWrap:'wrap',padding:'0 4px'}}>
            <select className="form-select" style={{width:'auto'}} value={`${repYear}-${repMonth}`} onChange={e=>{const[y,m]=e.target.value.split('-');setRepYear(+y);setRepMonth(+m);}}>
              {Array.from({length:12},(_,m)=>({y:2026,m})).map(o=><option key={o.m} value={`${o.y}-${o.m}`}>{MONTHS[o.m]} {o.y}</option>)}
            </select>
            <span style={{fontSize:12,color:'var(--text2)'}}>Working days: <strong>{workingDays}</strong> · Weekends: {weekendDays} · Total: {totalDaysInMonth}</span>
          </div>
          <table>
            <thead><tr><th>Employee</th><th>Dept</th><th style={{color:'var(--green)'}}>Present</th><th style={{color:'var(--red)'}}>Absent</th><th style={{color:'var(--purple)'}}>Leave/Sick</th><th style={{color:'var(--pink)'}}>Late</th><th style={{color:'var(--blue)'}}>Online</th><th style={{color:'var(--text3)'}}>Not Set</th><th>Rate</th></tr></thead>
            <tbody>
              {rows.map(({emp:e,p,a,l,lt,on,notSet,rt})=>(
                <tr key={e.id}>
                  <td style={{fontWeight:600}}>{e.name}</td>
                  <td>{e.dept}</td>
                  <td style={{color:'var(--green)',fontWeight:700}}>{p}</td>
                  <td style={{color:'var(--red)',fontWeight:700}}>{a}</td>
                  <td style={{color:'var(--purple)',fontWeight:700}}>{l}</td>
                  <td style={{color:'var(--pink)',fontWeight:700}}>{lt}</td>
                  <td style={{color:'var(--blue)',fontWeight:700}}>{on}</td>
                  <td style={{color:'var(--text3)',fontWeight:600}}>{notSet}</td>
                  <td><Badge cls={rt>=90?'badge-green':rt>=75?'badge-amber':'badge-red'}>{rt}%</Badge></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{background:'var(--bg2)',fontWeight:700}}>
                <td colSpan={2} style={{fontSize:12}}>TOTAL ({monthLabel})</td>
                <td style={{color:'var(--green)'}}>{totP}</td>
                <td style={{color:'var(--red)'}}>{totA}</td>
                <td style={{color:'var(--purple)'}}>{totL}</td>
                <td style={{color:'var(--pink)'}}>{totLt}</td>
                <td style={{color:'var(--blue)'}}>{totOn}</td>
                <td style={{color:'var(--text3)'}}>{totNS}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      );
    }
    if(active==='leave') return (
      <table><thead><tr><th>Employee</th><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Approved By</th></tr></thead>
      <tbody>{fLeaves.map(l=><tr key={l.id}><td style={{fontWeight:600}}>{empById(l.empId).name}</td><td><Badge cls="badge-purple">{l.type}</Badge></td><td>{fmtDate(l.from)}</td><td>{fmtDate(l.to)}</td><td style={{fontWeight:700}}>{l.days}</td><td><StatusBadge status={l.status}/></td><td style={{fontSize:12,color:'var(--text2)'}}>{l.approvedBy||'—'}</td></tr>)}</tbody></table>
    );
    if(active==='salary') return (
      <table><thead><tr><th>Employee</th><th>Period</th><th>Basic</th><th>Net Pay</th><th>Status</th><th>Pay Date</th></tr></thead>
      <tbody>{fSalaryRecs.map(s=><tr key={s.id}><td style={{fontWeight:600}}>{empById(s.empId).name}</td><td>{s.month}</td><td>{fmtMoney(s.basic)}</td><td><strong>{fmtMoney(s.net)}</strong></td><td><StatusBadge status={s.paid?'paid':'pending'}/></td><td style={{fontSize:12}}>{s.payDate?fmtDate(s.payDate):'—'}</td></tr>)}</tbody></table>
    );
    if(active==='commission') return (
      <table><thead><tr><th>Broker</th><th>Deal</th><th>Date</th><th>Property Value</th><th>Rate</th><th>Commission</th><th>Status</th></tr></thead>
      <tbody>{fCommRecs.map(c=><tr key={c.id}><td style={{fontWeight:600}}>{empById(c.empId).name}</td><td style={{maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}}>{c.deal}</td><td style={{fontSize:12}}>{fmtDate(c.txDate)}</td><td style={{fontSize:12}}>{fmtMoney(c.propVal)}</td><td>{c.rate}%</td><td><strong style={{color:'var(--green)'}}>{fmtMoney(c.amount)}</strong></td><td><StatusBadge status={c.status}/></td></tr>)}</tbody></table>
    );
    if(active==='expiry') return (
      <table><thead><tr><th>Employee</th><th>Dept</th><th>Visa</th><th>Contract</th><th>Passport</th><th>Emirates ID</th><th>RERA</th></tr></thead>
      <tbody>{employees.map(e=><tr key={e.id}><td style={{fontWeight:600}}>{e.name}</td><td><Badge cls="badge-gray">{e.dept}</Badge></td>
        {[e.visaExpiry,e.contractEnd,e.passExpiry,e.emiratesId,e.reraExp].map((d,i)=>{const days=daysUntil(d);return <td key={i}><div style={{fontSize:12}}>{fmtDate(d)}</div><Badge cls={expiryBadge(days)} style={{fontSize:10}}>{days>=0?days+'d':'EXP'}</Badge></td>;})}
      </tr>)}</tbody></table>
    );
    if(active==='leavebal') return (
      <table><thead><tr><th>Employee</th><th>Dept</th><th>Type</th><th>Annual Entitlement</th><th>Taken</th><th>Balance</th></tr></thead>
      <tbody>{employees.filter(e=>e.status==='active').map(e=><tr key={e.id}><td style={{fontWeight:600}}>{e.name}</td><td><Badge cls="badge-gray">{e.dept}</Badge></td><td><TypeBadge type={e.type}/></td><td style={{fontWeight:600}}>30 days</td><td style={{color:'var(--amber)',fontWeight:600}}>{e.leaveTaken||0}</td><td><strong style={{color:'var(--blue)'}}>{e.leaveBalance}</strong></td></tr>)}</tbody></table>
    );
    return null;
  }
  return (
    <div>
      <SectionHeader title="Reports" sub="Generate and export HR reports"/>
      <div style={{display:'grid',gridTemplateColumns:'200px 1fr',gap:20,alignItems:'start'}}>
        <div className="card" style={{padding:8}}>
          {reports.map(r=>(
            <div key={r.key} onClick={()=>setActive(r.key)} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 10px',borderRadius:7,cursor:'pointer',marginBottom:2,background:active===r.key?'var(--blue-light)':'transparent',color:active===r.key?'var(--blue2)':'var(--text2)',fontWeight:active===r.key?700:400,fontSize:13,transition:'all .15s'}}>
              <span>{r.icon}</span>{r.label}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-header" style={{flexWrap:'wrap',gap:8}}>
            <span className="card-title">{reports.find(r=>r.key===active)?.icon} {reports.find(r=>r.key===active)?.label}{selEmpObj?' — '+selEmpObj.name:''}</span>
            <div className="card-actions no-print" style={{display:'flex',gap:8,alignItems:'center'}}>
              {hasEmpFilter && selEmp!=='all' && (
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSelEmp('all');setEmpSearch('');}}>👥 Show All</button>
              )}
              <button className="btn btn-primary btn-sm" onClick={()=>doPrint()}>🖨️ Print Report</button>
            </div>
          </div>

          {/* ── Employee Filter Bar ── */}
          {hasEmpFilter && (
            <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{fontSize:11,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px'}}>Filter by Employee:</span>
                <div style={{position:'relative',flex:1,maxWidth:260}}>
                  <input
                    className="form-input"
                    style={{fontSize:12,padding:'6px 10px 6px 28px',background:'#fff'}}
                    placeholder="Search employee name or ID..."
                    value={empSearch}
                    onChange={e=>setEmpSearch(e.target.value)}
                    onFocus={e=>e.target.select()}
                  />
                  <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--text3)'}}>🔍</span>
                </div>
                {selEmp!=='all'&&(
                  <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'var(--blue-light)',border:'1px solid var(--blue)',borderRadius:20,fontSize:12,fontWeight:600,color:'var(--blue2)'}}>
                    <span>{selEmpObj?.name}</span>
                    <span style={{cursor:'pointer',fontSize:14,lineHeight:1}} onClick={()=>{setSelEmp('all');setEmpSearch('');}}>✕</span>
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                <div
                  onClick={()=>{setSelEmp('all');setEmpSearch('');}}
                  style={{padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                    border:'1.5px solid '+(selEmp==='all'?'var(--blue)':'var(--border)'),
                    background:selEmp==='all'?'var(--blue)':'#fff',
                    color:selEmp==='all'?'#fff':'var(--text2)',transition:'all .15s'
                  }}>👥 All Employees</div>
                {filteredEmpList.filter(e=>e.status==='active').map(e=>(
                  <div
                    key={e.id}
                    onClick={()=>{setSelEmp(e.id);setEmpSearch('');}}
                    style={{padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                      border:'1.5px solid '+(selEmp===e.id?'var(--blue)':'var(--border)'),
                      background:selEmp===e.id?'var(--blue)':'#fff',
                      color:selEmp===e.id?'#fff':'var(--text2)',transition:'all .15s',
                      display:'flex',alignItems:'center',gap:5
                    }}>
                    <Avatar name={e.name} id={e.id} size={18} fontSize={7}/>
                    {e.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="table-wrap">{renderTable()}</div>
        </div>
      </div>
    </div>
  );

  function doPrint() {
    const reportInfo = reports.find(r=>r.key===active);
    const empLabel = selEmpObj ? ' — '+selEmpObj.name : '';
    const empSubLabel = selEmpObj ? selEmpObj.name+' · '+selEmpObj.id+' · '+(selEmpObj.title||'')+' · '+(selEmpObj.dept||'') : '';
    if(active==='salary') {
      const recs=fSalaryRecs;
      const totBasic=recs.reduce((a,s)=>a+(s.basic||0),0);
      const totHousing=recs.reduce((a,s)=>a+(s.housing||0),0);
      const totTransport=recs.reduce((a,s)=>a+(s.transport||0),0);
      const totBonus=recs.reduce((a,s)=>a+(s.bonus||0),0);
      const totDed=recs.reduce((a,s)=>a+(s.deductions||0),0);
      const totNet=recs.reduce((a,s)=>a+(s.net||0),0);
      const paidCount=recs.filter(s=>s.paid).length;
      printProfessionalReport({
        title:'Salary Report'+empLabel,
        subtitle:(empSubLabel?empSubLabel+' · ':'')+recs.length+' records · '+paidCount+' paid · '+(recs.length-paidCount)+' pending',
        summaryCards:[
          {label:'Gross Payroll',value:fmtMoney(totBasic+totHousing+totTransport+totBonus),color:'#0f172a'},
          {label:'Deductions',value:totDed>0?'('+fmtMoney(totDed)+')':'AED 0',color:totDed>0?'#dc2626':'#94a3b8',bg:totDed>0?'#fee2e2':'#f8fafc'},
          {label:'Net Payroll',value:fmtMoney(totNet),color:'#1e40af',bg:'#dbeafe'},
          {label:'Paid',value:fmtMoney(salaryRecs.filter(s=>s.paid).reduce((a,s)=>a+s.net,0)),color:'#059669',bg:'#d1fae5'},
        ],
        columns:[
          {label:'#',align:'center'},
          {label:'Employee',bold:true},
          {label:'Period'},
          {label:'Basic',align:'right'},
          {label:'SIM Card',align:'right'},
          {label:'Transport',align:'right'},
          {label:'Bonus',align:'right'},
          {label:'Deductions',align:'right',color:'#dc2626'},
          {label:'Net Pay',align:'right',bold:true},
          {label:'Status'},
          {label:'Paid On'},
        ],
        rows: recs.map((s,i)=>{
          const emp=empById(s.empId);
          const ded=s.deductions||0;
          return [
            i+1,
            emp.name+(emp.title?' — '+emp.title:''),
            s.month,
            {value:fmtMoney(s.basic),align:'right'},
            {value:(s.housing||0)>0?fmtMoney(s.housing):'—',align:'right'},
            {value:(s.transport||0)>0?fmtMoney(s.transport):'—',align:'right'},
            {value:(s.bonus||0)>0?fmtMoney(s.bonus):'—',align:'right'},
            {value:ded>0?'('+fmtMoney(ded)+')':'—',color:ded>0?'#dc2626':''},
            {value:fmtMoney(s.net)},
            s.paid?'Paid':'Pending',
            s.payDate?fmtDate(s.payDate):'—',
          ];
        }),
        footerRow:[
          '',
          'TOTAL — '+recs.length+' records',
          '',
          {value:fmtMoney(totBasic)},
          {value:fmtMoney(totHousing)},
          {value:fmtMoney(totTransport)},
          {value:totBonus>0?fmtMoney(totBonus):'—'},
          {value:totDed>0?'('+fmtMoney(totDed)+')':'—',color:'#dc2626'},
          {value:fmtMoney(totNet)},
          paidCount+' paid',
          '',
        ],
      });
    } else if(active==='commission') {
      const recs=fCommRecs;
      const totAmt=recs.reduce((a,c)=>a+c.amount,0);
      const paidAmt=recs.filter(c=>c.status==='paid').reduce((a,c)=>a+c.amount,0);
      printProfessionalReport({
        title:'Commission Report'+empLabel,
        subtitle:(empSubLabel?empSubLabel+' · ':'')+recs.length+' records · Total: '+fmtMoney(totAmt),
        summaryCards:[
          {label:'Total Commission',value:fmtMoney(totAmt),color:'#059669',bg:'#d1fae5'},
          {label:'Paid',value:fmtMoney(paidAmt),color:'#059669'},
          {label:'Pending',value:fmtMoney(totAmt-paidAmt),color:'#d97706',bg:'#fef3c7'},
        ],
        columns:[
          {label:'#',align:'center'},{label:'Broker',bold:true},{label:'Deal'},{label:'Client'},
          {label:'Prop. Value',align:'right'},{label:'Rate',align:'right'},
          {label:'Commission',align:'right',bold:true},{label:'Status'},{label:'Date'},
        ],
        rows:recs.map((c,i)=>[
          i+1,empById(c.empId).name,c.deal||'—',c.client||'—',
          {value:c.propVal>0?fmtMoney(c.propVal):'—'},{value:c.rate>0?c.rate+'%':'—'},
          {value:fmtMoney(c.amount),color:'#059669'},
          c.status.charAt(0).toUpperCase()+c.status.slice(1),
          fmtDate(c.txDate),
        ]),
        footerRow:['','TOTAL','','','','',{value:fmtMoney(totAmt),color:'#059669'},recs.filter(c=>c.status==='paid').length+' paid',''],
      });
    } else if(active==='employees') {
      const activeCount=employees.filter(e=>e.status==='active').length;
      printProfessionalReport({
        title:'Employee List',
        subtitle:employees.length+' total · '+activeCount+' active',
        columns:[
          {label:'#',align:'center'},{label:'Employee',bold:true},{label:'ID'},{label:'Title'},
          {label:'Dept'},{label:'Type'},{label:'RERA'},{label:'Status'},
        ],
        rows:employees.map((e,i)=>[i+1,e.name,e.id,e.title||'—',e.dept,
          (e.type||'').replace('_',' '),e.reraNo||'—',
          e.status.charAt(0).toUpperCase()+e.status.slice(1)]),
      });
    } else if(active==='leave') {
      printProfessionalReport({
        title:'Leave Report'+empLabel,
        subtitle:(empSubLabel?empSubLabel+' · ':'')+fLeaves.length+' records',
        columns:[
          {label:'#',align:'center'},{label:'Employee',bold:true},{label:'Type'},
          {label:'From'},{label:'To'},{label:'Days',align:'right'},
          {label:'Status'},{label:'Approved By'},
        ],
        rows:fLeaves.map((l,i)=>[i+1,empById(l.empId).name,l.type,fmtDate(l.from),fmtDate(l.to),
          {value:l.days},l.status.charAt(0).toUpperCase()+l.status.slice(1),l.approvedBy||'—']),
        footerRow:['','TOTAL','','','',{value:fLeaves.reduce((a,l)=>a+(l.days||0),0)+' days'},'',''],
      });
    } else if(active==='expiry') {
      printProfessionalReport({
        title:'Document Expiry Report',
        subtitle:'All employees — expiry dates and remaining days',
        columns:[
          {label:'#',align:'center'},{label:'Employee',bold:true},{label:'Dept'},
          {label:'Visa'},{label:'Contract'},{label:'Passport'},{label:'Emirates ID'},{label:'RERA'},
        ],
        rows:employees.map((e,i)=>[i+1,e.name,e.dept,
          ...[e.visaExpiry,e.contractEnd,e.passExpiry,e.emiratesId,e.reraExp].map(d=>{
            const days=daysUntil(d);
            return d?fmtDate(d)+(days>=0?' ('+days+'d)':' — EXPIRED'):'—';
          })]),
      });
    } else if(active==='leavebal') {
      const activeEmps=employees.filter(e=>e.status==='active');
      printProfessionalReport({
        title:'Leave Balance Report',
        subtitle:activeEmps.length+' active employees',
        columns:[
          {label:'#',align:'center'},{label:'Employee',bold:true},{label:'Dept'},
          {label:'Type'},{label:'Entitlement',align:'right'},{label:'Taken',align:'right'},
          {label:'Balance',align:'right',bold:true},
        ],
        rows:activeEmps.map((e,i)=>[i+1,e.name,e.dept,
          (e.type||'').replace('_',' '),'30 days',
          {value:e.leaveTaken||0,color:e.leaveTaken>0?'#d97706':''},
          {value:e.leaveBalance+'d',color:'#2563eb'}]),
        footerRow:['','TOTAL','','','',
          {value:activeEmps.reduce((a,e)=>a+(e.leaveTaken||0),0)+' days'},
          {value:activeEmps.reduce((a,e)=>a+(e.leaveBalance||0),0)+' days',color:'#2563eb'}],
      });
    } else if(active==='attendance') {
      const monthLabel=MONTHS[repMonth]+' '+repYear;
      const totalDaysInMonth = new Date(repYear, repMonth+1, 0).getDate();
      let weekendDays=0;
      for(let d=1;d<=totalDaysInMonth;d++){const dow=new Date(repYear,repMonth,d).getDay();if(dow===5||dow===6)weekendDays++;}
      const workingDays=totalDaysInMonth-weekendDays;
      const attRows=fEmployees.map(e=>{
        const r=(attData[e.id]||[]).filter(x=>x.date&&x.date.startsWith(repMonthStr));
        return {emp:e,p:r.filter(x=>x.status==='present').length,a:r.filter(x=>x.status==='absent').length,
          l:r.filter(x=>x.status==='leave'||x.status==='sick').length,lt:r.filter(x=>x.status==='late').length,
          on:r.filter(x=>x.status==='online').length};
      });
      printProfessionalReport({
        title:'Attendance Report'+empLabel,
        subtitle:(empSubLabel?empSubLabel+' · ':'')+fEmployees.length+' employee'+(fEmployees.length!==1?'s':'')+' · Working days: '+workingDays+' · Weekends: '+weekendDays,
        period: monthLabel,
        columns:[
          {label:'#',align:'center'},{label:'Employee',bold:true},{label:'Dept'},
          {label:'Present',align:'right',color:'#059669'},{label:'Absent',align:'right',color:'#dc2626'},
          {label:'Leave',align:'right',color:'#7c3aed'},{label:'Late',align:'right',color:'#db2777'},
          {label:'Online',align:'right',color:'#2563eb'},
        ],
        rows:attRows.map((r,i)=>[i+1,r.emp.name,r.emp.dept,
          {value:r.p,color:'#059669'},{value:r.a,color:'#dc2626'},
          {value:r.l,color:'#7c3aed'},{value:r.lt,color:'#db2777'},
          {value:r.on,color:'#2563eb'}]),
        footerRow:['','TOTAL','',
          {value:attRows.reduce((a,r)=>a+r.p,0),color:'#059669'},
          {value:attRows.reduce((a,r)=>a+r.a,0),color:'#dc2626'},
          {value:attRows.reduce((a,r)=>a+r.l,0),color:'#7c3aed'},
          {value:attRows.reduce((a,r)=>a+r.lt,0),color:'#db2777'},
          {value:attRows.reduce((a,r)=>a+r.on,0),color:'#2563eb'}],
      });
    }
  }
}

/* === EMPLOYEE VIEWS === */
function EmpDashboard({emp,leaves,requests,attData}) {
  const myLeaves=leaves.filter(l=>l.empId===emp.id);
  const myReqs=requests.filter(r=>r.empId===emp.id);
  const records=attData[emp.id]||[];
  const p=records.filter(r=>r.status==='present').length;
  const a=records.filter(r=>r.status==='absent').length;
  return (
    <div>
      <div className="card" style={{marginBottom:16}}>
        <div className="profile-hero">
          <Avatar name={emp.name} id={emp.id} size={60} fontSize={20} border={true}/>
          <div>
            <div className="profile-name">{emp.name}</div>
            <div className="profile-title">{emp.title} · {emp.dept}</div>
            <div className="profile-badges-row"><Badge cls="badge-blue">{emp.id}</Badge><TypeBadge type={emp.type}/></div>
          </div>
        </div>
      </div>
      <div className="stat-grid">
        <SCard icon="🌴" label="Leave Balance" value={emp.leaveBalance} sub="Days remaining" color="blue"/>
        <SCard icon="✅" label="Days Present" value={p} sub="2026" color="green"/>
        <SCard icon="📋" label="My Requests" value={myReqs.length} sub={myReqs.filter(r=>r.status==='pending').length+' pending'} color="amber"/>
        <SCard icon="📅" label="Leave Requests" value={myLeaves.length} sub={myLeaves.filter(l=>l.status==='pending').length+' pending'} color="purple"/>
      </div>
      <div className="grid2">
        <div className="card">
          <div className="card-header"><span className="card-title">🗂️ My Documents</span></div>
          <div className="card-body" style={{padding:'8px 16px'}}>
            {[['Visa',emp.visaExpiry],['Contract',emp.contractEnd],['Passport',emp.passExpiry],['Emirates ID',emp.emiratesId],['RERA',emp.reraExp]].map(([l,d])=><ExpiryRow key={l} label={l} date={d} days={daysUntil(d)}/>)}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">⏳ Recent Requests</span></div>
          <div style={{padding:'4px 16px'}}>
            {myReqs.length===0&&<Empty icon="📋" text="No requests yet"/>}
            {myReqs.slice(0,4).map(r=>(
              <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{r.type}</div><div style={{fontSize:11,color:'var(--text2)'}}>{fmtDate(r.requestDate)}</div></div>
                <StatusBadge status={r.status}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmpLeave({emp,leaves,setLeaves,showToast}) {
  const myLeaves=leaves.filter(l=>l.empId===emp.id);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({type:'Annual Leave',from:'',to:'',reason:''});
  function submit(){
    if(!form.from||!form.to)return showToast('Please fill in dates','error');
    const days=Math.ceil((new Date(form.to)-new Date(form.from))/86400000)+1;
    if(days<=0)return showToast('Invalid date range','error');
    if(form.type!=='Unpaid Leave' && days > (emp.leaveBalance||0)) {
      if(!confirm('You are requesting '+days+' days but only have '+(emp.leaveBalance||0)+' days available. Submit anyway?')) return;
    }
    setLeaves(ls=>[{id:'LV'+nowId(),empId:emp.id,...form,days,status:'pending',approvedBy:'',requestDate:today(),comments:''},...ls]);
    setShowForm(false);showToast('Leave request submitted','success');
    setForm({type:'Annual Leave',from:'',to:'',reason:''});
  }
  return (
    <div>
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap'}}>
        <div className="card" style={{flex:1,padding:'14px 18px',display:'flex',alignItems:'center',gap:14,minWidth:180}}>
          <div style={{fontSize:44,fontWeight:900,color:(emp.leaveBalance||0)<=5?'var(--red)':'var(--blue)',lineHeight:1}}>{emp.leaveBalance||0}</div>
          <div><div style={{fontWeight:700,fontSize:14}}>Days Available</div><div style={{fontSize:12,color:'var(--text2)',marginTop:2}}>{emp.leaveTaken||0} taken this year</div></div>
        </div>
        <button className="btn btn-primary" style={{alignSelf:'center'}} onClick={()=>setShowForm(true)}>+ Request Leave</button>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">Leave History</span></div>
        {myLeaves.length===0?<Empty icon="🌴" text="No leave requests yet"/>:
        <table><thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>{myLeaves.map(l=><tr key={l.id}><td><Badge cls="badge-purple">{l.type}</Badge></td><td>{fmtDate(l.from)}</td><td>{fmtDate(l.to)}</td><td style={{fontWeight:700}}>{l.days}</td><td><StatusBadge status={l.status}/></td><td style={{fontSize:12,color:'var(--text2)'}}>{l.comments||'—'}</td></tr>)}</tbody></table>}
      </div>
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="Request Leave" size="modal-sm"
        footer={<><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit</button></>}>
        <div className="form-group"><label className="form-label">Leave Type</label>
          <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
            {['Annual Leave','Sick Leave','Emergency Leave','Unpaid Leave'].map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">From Date</label><input type="date" className="form-input" value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))}/></div>
          <div className="form-group"><label className="form-label">To Date</label><input type="date" className="form-input" value={form.to} onChange={e=>setForm(f=>({...f,to:e.target.value}))}/></div>
        </div>
        <div className="form-group"><label className="form-label">Reason</label><textarea className="form-textarea" rows="2" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/></div>
      </Modal>
    </div>
  );
}

function EmpPay({emp,salaryRecs,commRecs,showToast}) {
  const mySal=salaryRecs.filter(s=>s.empId===emp.id);
  const myComm=commRecs.filter(c=>c.empId===emp.id);
  const [receiptModal,setReceiptModal]=useState(false);
  const [receiptData,setReceiptData]=useState(null);
  const [expandedSal,setExpandedSal]=useState(null);
  function openSalReceipt(rec){setReceiptData({type:'salary',rec,emp});setReceiptModal(true);}
  function openCommReceipt(rec){setReceiptData({type:'commission',rec,emp});setReceiptModal(true);}

  // YTD calculations
  const ytdGross=mySal.reduce((a,s)=>a+(s.basic||0)+(s.housing||0)+(s.transport||0)+(s.bonus||0),0);
  const ytdDed=mySal.reduce((a,s)=>a+(s.deductions||0),0);
  const ytdNet=mySal.reduce((a,s)=>a+(s.net||0),0);
  const commPaid=myComm.filter(c=>c.status==='paid').reduce((a,c)=>a+c.amount,0);
  const commPending=myComm.filter(c=>c.status==='pending'||c.status==='approved').reduce((a,c)=>a+c.amount,0);

  return (
    <div>
      {/* YTD summary */}
      {(mySal.length>0||myComm.length>0)&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:18}}>
          {[
            ['YTD Gross',fmtMoney(ytdGross),'var(--text1)','var(--bg2)'],
            ['YTD Deductions',ytdDed>0?'('+fmtMoney(ytdDed)+')':'AED 0',ytdDed>0?'var(--red)':'var(--text3)',ytdDed>0?'var(--red-light)':'var(--bg2)'],
            ['YTD Net Pay',fmtMoney(ytdNet),'var(--navy)','var(--blue-light)'],
          ].map(([l,v,c,bg])=>(
            <div key={l} style={{background:bg,borderRadius:10,padding:'12px 14px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:5}}>{l}</div>
              <div style={{fontSize:16,fontWeight:800,color:c}}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {mySal.length>0&&(
        <div className="card" style={{marginBottom:16}}>
          <div className="card-header">
            <span className="card-title">💰 Salary History</span>
            <span style={{fontSize:12,color:'var(--text2)'}}>{mySal.length} records · click a row for breakdown</span>
          </div>
          <table>
            <thead><tr><th>Period</th><th style={{textAlign:'right'}}>Basic</th><th style={{textAlign:'right'}}>Allowances</th><th style={{textAlign:'right',color:'var(--red)'}}>Deductions</th><th style={{textAlign:'right',borderLeft:'2px solid var(--border2)'}}>Net Pay</th><th>Status</th><th>Paid On</th><th></th></tr></thead>
            <tbody>
              {mySal.map(s=>{
                const gross=(s.basic||0)+(s.housing||0)+(s.transport||0)+(s.bonus||0);
                const allow=(s.housing||0)+(s.transport||0)+(s.bonus||0);
                const ded=s.deductions||0;
                const expanded=expandedSal===s.id;
                return (
                  <React.Fragment key={s.id}>
                    <tr style={{cursor:'pointer',background:expanded?'var(--blue-light)':undefined}} onClick={()=>setExpandedSal(expanded?null:s.id)}>
                      <td style={{fontWeight:600}}>{s.month}</td>
                      <td style={{textAlign:'right',fontWeight:600,fontSize:13}}>{fmtMoney(s.basic)}</td>
                      <td style={{textAlign:'right',fontSize:12,color:'var(--text2)'}}>{allow>0?fmtMoney(allow):'—'}</td>
                      <td style={{textAlign:'right',fontSize:12,color:ded>0?'var(--red)':'var(--text3)',fontWeight:ded>0?700:400}}>{ded>0?'('+fmtMoney(ded)+')':'—'}</td>
                      <td style={{textAlign:'right',fontWeight:800,fontSize:14,borderLeft:'2px solid var(--border2)',paddingLeft:14}}>{fmtMoney(s.net)}</td>
                      <td><StatusBadge status={s.paid?'paid':'pending'}/></td>
                      <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{s.payDate?fmtDate(s.payDate):'—'}</td>
                      <td onClick={e=>e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>openSalReceipt(s)}>🧾 Slip</button>
                      </td>
                    </tr>
                    {expanded&&(
                      <tr style={{background:'#f8faff'}}>
                        <td colSpan="8" style={{padding:'12px 16px'}}>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8}}>
                            {[
                              ['Basic Salary',s.basic,'var(--text1)'],
                              (s.housing||0)>0&&['Housing Allow.',s.housing,'var(--text2)'],
                              (s.transport||0)>0&&['Transport Allow.',s.transport,'var(--text2)'],
                              (s.bonus||0)>0&&['Bonus',s.bonus,'var(--amber)'],
                              ded>0&&['Deductions','('+fmtMoney(ded)+')','var(--red)'],
                            ].filter(Boolean).map(([lbl,val,clr])=>(
                              <div key={lbl} style={{background:'#fff',borderRadius:7,padding:'8px 10px',border:'1px solid var(--border)'}}>
                                <div style={{fontSize:10,color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.3px'}}>{lbl}</div>
                                <div style={{fontSize:13,fontWeight:700,color:clr}}>{typeof val==='number'?fmtMoney(val):val}</div>
                              </div>
                            ))}
                          </div>
                          {ded>0&&s.deductionNote&&(
                            <div style={{marginTop:8,fontSize:12,color:'var(--red)',background:'var(--red-light)',padding:'6px 10px',borderRadius:6}}>
                              Deduction reason: {s.deductionNote}
                            </div>
                          )}
                          {s.notes&&<div style={{marginTop:6,fontSize:12,color:'var(--text2)',fontStyle:'italic'}}>Note: {s.notes}</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {myComm.length>0&&(
        <div className="card">
          <div className="card-header">
            <span className="card-title">🏆 Commission History</span>
            <div style={{display:'flex',gap:12,fontSize:12}}>
              <span style={{color:'var(--green)',fontWeight:700}}>Paid: {fmtMoney(commPaid)}</span>
              {commPending>0&&<span style={{color:'var(--amber)',fontWeight:700}}>Pending: {fmtMoney(commPending)}</span>}
            </div>
          </div>
          <table>
            <thead><tr><th>Deal</th><th>Property</th><th>Date</th><th style={{textAlign:'right'}}>Amount</th><th>Status</th><th>Paid On</th><th></th></tr></thead>
            <tbody>
              {myComm.map(c=>(
                <tr key={c.id}>
                  <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12,fontWeight:600}}>{c.deal}</td>
                  <td style={{fontSize:11,color:'var(--text2)'}}>{c.property||'—'}</td>
                  <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(c.txDate)}</td>
                  <td style={{textAlign:'right'}}><strong style={{color:'var(--green)',fontSize:14}}>{fmtMoney(c.amount)}</strong></td>
                  <td><StatusBadge status={c.status}/></td>
                  <td style={{fontSize:12,color:'var(--text2)',whiteSpace:'nowrap'}}>{c.payDate?fmtDate(c.payDate):'—'}</td>
                  <td>{c.status==='paid'&&<button className="btn btn-ghost btn-sm" onClick={()=>openCommReceipt(c)}>🧾</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mySal.length===0&&myComm.length===0&&<Empty icon="💰" text="No payment records yet"/>}
      <ReceiptModal open={receiptModal} onClose={()=>setReceiptModal(false)} type={receiptData?.type} rec={receiptData?.rec} emp={receiptData?.emp}/>
    </div>
  );
}

function EmpRequests({emp,requests,setRequests,showToast}) {
  const myReqs=requests.filter(r=>r.empId===emp.id);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({type:'Employment Certificate',priority:'normal',reason:''});
  const REQUEST_TYPES=['Employment Certificate','Salary Certificate','NOC Letter','Experience Certificate','Visa Letter','Bank Letter','HR Letter','Advance Salary','Housing Letter','Other Request'];
  function submit(){
    if(!form.reason.trim()) return alert('Please add a purpose / reason');
    setRequests(rs=>[{id:'REQ'+nowId(),empId:emp.id,type:form.type,priority:form.priority,reason:form.reason,status:'pending',requestDate:today(),completedDate:'',comments:''},...rs]);
    setShowForm(false);showToast('Request submitted','success');
    setForm({type:'Employment Certificate',priority:'normal',reason:''});
  }
  const PRIORITY_META={urgent:{label:'Urgent',cls:'badge-red',icon:'🔴'},high:{label:'High',cls:'badge-amber',icon:'🟠'},normal:{label:'Normal',cls:'badge-blue',icon:'🔵'},low:{label:'Low',cls:'badge-gray',icon:'⚪'}};
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16}}>My HR Requests</div>
        <button className="btn btn-primary" onClick={()=>setShowForm(true)}>+ New Request</button>
      </div>
      <div className="card">
        {myReqs.length===0?<Empty icon="📋" text="No requests submitted yet" action={<button className="btn btn-primary btn-sm" onClick={()=>setShowForm(true)}>Submit a Request</button>}/>:
        <table><thead><tr><th>Type</th><th>Priority</th><th>Purpose</th><th>Submitted</th><th>Status</th><th>Completed</th><th>Comments</th></tr></thead>
        <tbody>{myReqs.map(r=>{
          const pri=PRIORITY_META[r.priority]||PRIORITY_META.normal;
          return <tr key={r.id}><td><Badge cls="badge-blue">{r.type}</Badge></td><td><Badge cls={pri.cls}>{pri.icon} {pri.label}</Badge></td><td style={{fontSize:12,color:'var(--text2)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.reason||'—'}</td><td style={{fontSize:12}}>{fmtDate(r.requestDate)}</td><td><StatusBadge status={r.status}/></td><td style={{fontSize:12,color:'var(--text2)'}}>{r.completedDate?fmtDate(r.completedDate):'—'}</td><td style={{fontSize:12,color:'var(--text2)'}}>{r.comments||'—'}</td></tr>;
        })}</tbody></table>}
      </div>
      <Modal open={showForm} onClose={()=>setShowForm(false)} title="New HR Request" size="modal-sm"
        footer={<><button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit</button></>}>
        <div className="form-group"><label className="form-label">Request Type</label>
          <select className="form-select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
            {REQUEST_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Priority</label>
          <div style={{display:'flex',gap:8}}>
            {[['urgent','🔴 Urgent','var(--red)','var(--red-light)'],['high','🟠 High','var(--amber)','var(--amber-light)'],['normal','🔵 Normal','var(--blue)','var(--blue-light)'],['low','⚪ Low','var(--text3)','var(--bg3)']].map(([v,l,c,bg])=>(
              <div key={v} onClick={()=>setForm(f=>({...f,priority:v}))} style={{
                flex:1,padding:'7px 0',textAlign:'center',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                border:'1.5px solid '+(form.priority===v?c:'var(--border)'),
                background:form.priority===v?bg:'#fff',
                color:form.priority===v?c:'var(--text2)',transition:'all .15s'
              }}>{l}</div>
            ))}
          </div>
        </div>
        <div className="form-group"><label className="form-label">Purpose / Reason *</label>
          <textarea className="form-textarea" rows="3" placeholder="e.g. Required for bank loan application..." value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}/>
        </div>
      </Modal>
    </div>
  );
}

function EmpAttendance({emp, attData}) {
  const [year,setYear]=useState(2026);
  const [month,setMonth]=useState(0);
  const records=attData[emp.id]||[];
  const totalDays=new Date(year,month+1,0).getDate();
  const firstDow=new Date(year,month,1).getDay();
  const dayNames=['Su','Mo','Tu','We','Th','Fr','Sa'];

  const byDate={};
  records.forEach(r=>{ if(r.date) byDate[r.date]=r.status; });

  function getStatus(day) {
    const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dow=new Date(year,month,day).getDay();
    return byDate[dateStr]||(dow===5||dow===6?'weekend':'');
  }

  const statuses=Array.from({length:totalDays},(_,i)=>getStatus(i+1));
  const p=statuses.filter(s=>s==='present'||s==='online'||s==='late').length;
  const a=statuses.filter(s=>s==='absent').length;
  const l=statuses.filter(s=>s==='leave'||s==='sick').length;
  const we=statuses.filter(s=>s==='weekend').length;
  const workDays=totalDays-we;
  const rate=workDays>0?Math.round(p/workDays*100):100;
  const cells=[...Array(firstDow).fill(null),...Array.from({length:totalDays},(_,i)=>i+1)];

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
        <select className="form-select" style={{width:'auto'}} value={`${year}-${month}`} onChange={e=>{const[y,m]=e.target.value.split('-');setYear(+y);setMonth(+m);}}>
          {[{y:2026,m:0,l:'January 2026'},{y:2026,m:1,l:'February 2026'},{y:2026,m:2,l:'March 2026'},{y:2026,m:3,l:'April 2026'},{y:2026,m:4,l:'May 2026'},{y:2026,m:5,l:'June 2026'},{y:2026,m:6,l:'July 2026'},{y:2026,m:7,l:'August 2026'},{y:2026,m:8,l:'September 2026'},{y:2026,m:9,l:'October 2026'},{y:2026,m:10,l:'November 2026'},{y:2026,m:11,l:'December 2026'}].map(o=><option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.l}</option>)}
        </select>
      </div>
      <div className="stat-grid" style={{marginBottom:16}}>
        <SCard icon="✅" label="Present" value={p} color="green"/>
        <SCard icon="❌" label="Absent" value={a} color="red"/>
        <SCard icon="🌴" label="Leave/Sick" value={l} color="purple"/>
        <SCard icon="📊" label="Rate" value={rate+'%'} color={rate>=90?'green':'amber'}/>
      </div>
      <div className="card">
        <div className="card-header"><span className="card-title">📅 {MONTHS[month]} {year}</span></div>
        <div style={{padding:'16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',marginBottom:6}}>
            {dayNames.map((d,i)=><div key={d} style={{textAlign:'center',fontSize:11,fontWeight:700,color:i===5||i===6?'var(--red)':' var(--text2)',padding:'4px 0'}}>{d}</div>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>
            {cells.map((day,i)=>{
              if(!day) return <div key={'e'+i}/>;
              const status=getStatus(day);
              const cfg=getAttCfg(status);
              const isToday=new Date().getDate()===day&&new Date().getMonth()===month&&new Date().getFullYear()===year;
              return (
                <div key={day} style={{aspectRatio:'1',borderRadius:8,background:cfg.bg,border:`1px solid ${cfg.border}`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',opacity:status==='weekend'?0.5:1}}>
                  <div style={{fontSize:13,fontWeight:800,color:isToday?'var(--blue)':cfg.color}}>{day}</div>
                  <div style={{fontSize:8,fontWeight:700,color:cfg.color,textTransform:'uppercase'}}>{cfg.label}</div>
                </div>
              );
            })}
          </div>
          <div style={{display:'flex',gap:10,marginTop:12,flexWrap:'wrap'}}>
            {ATT_STATUSES.map(s=><div key={s.key} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text2)'}}><div style={{width:12,height:12,borderRadius:2,background:s.bg,border:`1px solid ${s.border}`}}/>{s.fullLabel}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* === SIDEBAR === */
function Sidebar({page,setPage,role,user,onLogout,counts}) {
  const nav=getNavForRole(role, counts);
  const roleMeta=ROLES[role]||ROLES.broker;
  return (
    <>
      <div className="sidebar-logo">
        <div className="logo-wrap">
          <img src={COMPANY_LOGO} alt="Nasama" style={{height:36,borderRadius:6,flexShrink:0}}/>
          <div><div className="logo-name">Nasama</div><div className="logo-tagline">Real Estate · HR System</div></div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {nav.map(section=>(
          <div key={section.section} className="nav-section">
            <div className="nav-section-label">{section.section}</div>
            {section.items.map(item=>(
              <div key={item.key} className={`nav-item ${page===item.key?'active':''}`} onClick={()=>setPage(item.key)}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
                {item.badge>0&&<span className={`nav-badge ${item.badgeType||''}`}>{item.badge}</span>}
              </div>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <Avatar name={user.name} id={user.id} size={32} fontSize={11}/>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role" style={{color:roleMeta.color}}>{roleMeta.icon} {roleMeta.label}</div>
          </div>
        </div>
        <div className="nav-item" onClick={onLogout}><span className="nav-icon">🚪</span>Sign Out</div>
      </div>
    </>
  );
}

/* === USER MANAGEMENT PAGE (ADMIN ONLY) === */
function UserManagementPage({users,setUsers,employees,showToast,addAudit}) {
  const [addModal,setAddModal]=useState(false);
  const [editUser,setEditUser]=useState(null);

  function saveUser(u) {
    setUsers(prev=>{
      const idx=prev.findIndex(x=>x.id===u.id);
      if(idx>=0){const n=[...prev];n[idx]=u;return n;}
      return [...prev,u];
    });
    if(addAudit) addAudit('USER_'+(editUser?'UPDATED':'CREATED'),u.name+' ('+u.email+') — role: '+u.role, u.empId||'');
    showToast(editUser?'User updated':'User created','success');
    setEditUser(null);
  }

  async function resetPw(u) {
    const newPw = prompt('Enter new password for '+u.name+':');
    if(!newPw||newPw.length<6) return alert('Password must be at least 6 characters');
    const hash = await hashPassword(newPw);
    setUsers(prev=>prev.map(x=>x.id===u.id?{...x,passwordHash:hash,mustChangePw:true}:x));
    if(addAudit) addAudit('PASSWORD_RESET','Password reset for '+u.name+' ('+u.email+')', u.empId||'');
    showToast('Password reset for '+u.name,'success');
  }

  function toggleActive(u) {
    setUsers(prev=>prev.map(x=>x.id===u.id?{...x,active:!x.active}:x));
    if(addAudit) addAudit(u.active?'USER_DISABLED':'USER_ENABLED',u.name+' ('+u.email+')', u.empId||'');
    showToast(u.name+(u.active?' disabled':' enabled'),'info');
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <SectionHeader title="User Management" sub="Manage system users, roles, and access" style={{marginBottom:0}}/>
        <button className="btn btn-primary" onClick={()=>{setEditUser(null);setAddModal(true);}}>+ Add User</button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Linked Employee</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u=>{
                const rl=ROLES[u.role]||ROLES.broker;
                const linkedEmp=u.empId?employees.find(e=>e.id===u.empId):null;
                return (
                  <tr key={u.id} style={{opacity:u.active?1:0.5}}>
                    <td><div style={{display:'flex',alignItems:'center',gap:8}}><Avatar name={u.name} id={u.id} size={30} fontSize={10}/><div><div style={{fontWeight:700,fontSize:13}}>{u.name}</div><div style={{fontSize:10,color:'var(--text3)'}}>{u.id}</div></div></div></td>
                    <td style={{fontSize:12}}>{u.email}</td>
                    <td><Badge cls={u.role==='admin'?'badge-red':u.role==='ceo'?'badge-amber':u.role==='hr_officer'?'badge-purple':'badge-blue'}>{rl.icon} {rl.label}</Badge></td>
                    <td style={{fontSize:12,color:'var(--text2)'}}>{linkedEmp?linkedEmp.name+' ('+linkedEmp.id+')':'—'}</td>
                    <td><Badge cls={u.active?'badge-green':'badge-gray'}>{u.active?'Active':'Disabled'}</Badge></td>
                    <td style={{fontSize:11,color:'var(--text3)'}}>{u.lastLogin?new Date(u.lastLogin).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Never'}</td>
                    <td>
                      <div style={{display:'flex',gap:4}}>
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setEditUser(u);setAddModal(true);}}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>resetPw(u)}>🔑</button>
                        <button className="btn btn-ghost btn-sm" style={{color:u.active?'var(--red)':'var(--green)'}} onClick={()=>toggleActive(u)}>{u.active?'🚫':'✅'}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role permission reference */}
      <div className="card" style={{marginTop:16}}>
        <div className="card-header"><span className="card-title">🛡️ Role Permission Matrix</span></div>
        <div className="card-body">
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
            {Object.entries(ROLES).map(([key,meta])=>(
              <div key={key} style={{padding:'12px 14px',borderRadius:10,border:'1px solid var(--border)',background:meta.bg}}>
                <div style={{fontWeight:700,fontSize:13,color:meta.color,marginBottom:8}}>{meta.icon} {meta.label}</div>
                <div style={{fontSize:11,color:'var(--text2)',lineHeight:1.6}}>
                  <strong>Pages:</strong> {(ROLE_PAGES[key]||[]).join(', ')}<br/>
                  <strong>Actions:</strong> {(ROLE_ACTIONS[key]||[]).length} permissions
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <UserFormModal open={addModal} onClose={()=>{setAddModal(false);setEditUser(null);}} initial={editUser} employees={employees} users={users} onSave={saveUser}/>
    </div>
  );
}

function UserFormModal({open,onClose,initial,employees,users,onSave}) {
  const blank={id:'',name:'',email:'',role:'broker',empId:'',active:true,passwordHash:'',mustChangePw:true};
  const [f,setF]=useState(initial||blank);
  const [newPw,setNewPw]=useState('');
  useEffect(()=>{setF(initial||blank);setNewPw('');},[initial,open]);
  function upd(k){return e=>setF(p=>({...p,[k]:e.target.value}));}

  const others=users.filter(u=>u.id!==initial?.id);
  const dupEmail=f.email.trim()&&others.find(u=>u.email.toLowerCase()===f.email.trim().toLowerCase());

  async function save(){
    if(!f.name.trim()) return alert('Name is required');
    if(!f.email.trim()) return alert('Email is required');
    if(dupEmail) return alert('Email already in use by '+dupEmail.name);
    if(!initial && !newPw) return alert('Password is required for new users');
    if(newPw && newPw.length<6) return alert('Password must be at least 6 characters');

    const user={...f};
    if(!user.id) user.id='USR'+Date.now().toString(36).toUpperCase().slice(-5);
    if(newPw) user.passwordHash = await hashPassword(newPw);
    // If linking to broker role, auto-fill empId from employee email match
    if(user.role==='broker' && !user.empId) {
      const matchEmp=employees.find(e=>e.email.toLowerCase()===user.email.toLowerCase());
      if(matchEmp) user.empId=matchEmp.id;
    }
    onSave(user);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={initial?.id?'Edit User':'Add New User'} size="modal-sm"
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{initial?.id?'Save Changes':'Create User'}</button></>}>
      <div className="form-group"><label className="form-label">Full Name *</label><input className="form-input" value={f.name} onChange={upd('name')} placeholder="e.g. Ahmad Ibrahim"/></div>
      <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" value={f.email} onChange={upd('email')} placeholder="user@nasama.ae" style={dupEmail?{borderColor:'var(--red)'}:{}}/>
        {dupEmail&&<div style={{fontSize:10,color:'var(--red)',marginTop:3}}>⚠ Already used by {dupEmail.name}</div>}
      </div>
      <div className="form-group"><label className="form-label">{initial?'New Password (leave blank to keep)':'Password *'}</label><input className="form-input" type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder={initial?'Leave blank to keep current':'Min 6 characters'}/></div>
      <div className="form-group"><label className="form-label">Role</label>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {Object.entries(ROLES).map(([key,meta])=>(
            <div key={key} onClick={()=>setF(p=>({...p,role:key}))} style={{
              flex:1,padding:'8px 6px',textAlign:'center',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',minWidth:80,
              border:'1.5px solid '+(f.role===key?meta.color:'var(--border)'),
              background:f.role===key?meta.bg:'#fff',
              color:f.role===key?meta.color:'var(--text2)',transition:'all .15s'
            }}>{meta.icon}<br/>{meta.label}</div>
          ))}
        </div>
      </div>
      {f.role==='broker'&&(
        <div className="form-group"><label className="form-label">Linked Employee</label>
          <select className="form-select" value={f.empId||''} onChange={upd('empId')}>
            <option value="">— Select Employee —</option>
            {employees.filter(e=>e.status==='active').map(e=><option key={e.id} value={e.id}>{e.name} — {e.id}</option>)}
          </select>
          <div className="field-hint">Links this login to an employee profile for self-service portal</div>
        </div>
      )}
    </Modal>
  );
}

/* === LOGIN PAGE === */
function LoginPage({users,setUsers,employees,onLogin}) {
  const savedCreds = useCallback(()=>{
    try { const c=localStorage.getItem('nasama_remember'); return c?JSON.parse(c):null; } catch(e){ return null; }
  },[]);
  const sc = savedCreds();
  const [email,setEmail]=useState(sc?.email||'');
  const [pass,setPass]=useState(sc?.pass||'');
  const [remember,setRemember]=useState(!!sc);
  const [err,setErr]=useState('');
  const [loading,setLoading]=useState(false);

  async function tryLogin() {
    setErr('');
    if(!email.trim()||!pass.trim()){setErr('Please enter email and password.');return;}
    setLoading(true);
    try {
      const pwHash = await hashPassword(pass);
      const emailLower = email.trim().toLowerCase();
      let user = users.find(u=>u.email.toLowerCase()===emailLower&&u.active!==false);

      // Debug: log what we're comparing
      console.log('Login attempt:', emailLower, 'Users count:', users.length, 'Found user:', !!user);
      if(user) console.log('Hash match:', user.passwordHash===pwHash, 'Stored hash length:', (user.passwordHash||'').length);

      let matched = user && user.passwordHash===pwHash;

      // Fallback: if hash doesn't match but password is the default "nasama2026",
      // allow login for seed accounts and fix their hash
      if(!matched && pass==='nasama2026') {
        const defaultEmails = DEFAULT_USERS.map(u=>u.email.toLowerCase());
        if(defaultEmails.includes(emailLower)) {
          const defaultDef = DEFAULT_USERS.find(u=>u.email.toLowerCase()===emailLower);
          if(!user) {
            // User doesn't exist at all — create it
            user = {...defaultDef, passwordHash:pwHash, mustChangePw:true, lastLogin:''};
            setUsers(prev=>[...prev.filter(u=>u.email.toLowerCase()!==emailLower), user]);
          } else {
            // User exists but hash is wrong — fix it
            user.passwordHash = pwHash;
            setUsers(prev=>prev.map(u=>u.email.toLowerCase()===emailLower?{...u,passwordHash:pwHash}:u));
          }
          matched = true;
          console.log('✅ Fallback login: fixed hash for', emailLower);
        }
      }

      if(matched && user) {
        if(remember) {
          try { localStorage.setItem('nasama_remember',JSON.stringify({email:email.trim(),pass})); } catch(e){}
        } else {
          try { localStorage.removeItem('nasama_remember'); } catch(e){}
        }
        const sess = {role:user.role, name:user.name, userId:user.id, empId:user.empId||''};
        user.lastLogin = new Date().toISOString();
        onLogin(sess, user);
        setLoading(false);
        return;
      }
      setErr('Invalid email or password.');
    } catch(e) {
      console.error('Login error:', e);
      setErr('Login error: '+e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#fff',borderRadius:20,padding:'40px 36px',width:'100%',maxWidth:420,boxShadow:'0 25px 80px rgba(0,0,0,0.35)'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <img src={COMPANY_LOGO} alt="Nasama Properties" style={{height:56,margin:'0 auto 14px',display:'block'}}/>
          <div style={{fontSize:22,fontWeight:800,color:'var(--text1)'}}>Nasama HR</div>
          <div style={{fontSize:13,color:'var(--text2)',marginTop:4}}>Real Estate — Dubai</div>
        </div>
        {err&&<div style={{background:'var(--red-light)',color:'#991b1b',borderRadius:8,padding:'10px 12px',fontSize:13,marginBottom:16}}>{err}</div>}
        <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@nasama.ae"/></div>
        <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&tryLogin()} placeholder="••••••••"/></div>
        <div style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0 16px',cursor:'pointer',userSelect:'none'}} onClick={()=>setRemember(r=>!r)}>
          <div style={{width:18,height:18,borderRadius:4,border:'2px solid '+(remember?'var(--blue)':'var(--border)'),background:remember?'var(--blue)':'#fff',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s',flexShrink:0}}>
            {remember&&<span style={{color:'#fff',fontSize:11,fontWeight:700}}>✓</span>}
          </div>
          <span style={{fontSize:13,color:'var(--text2)'}}>Remember email & password</span>
        </div>
        <button onClick={tryLogin} disabled={loading} style={{width:'100%',padding:'12px',background:'var(--blue)',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer',transition:'background .15s',opacity:loading?0.7:1}} onMouseEnter={e=>e.target.style.background='var(--blue2)'} onMouseLeave={e=>e.target.style.background='var(--blue)'}>
          {loading?'Signing in...':'Sign In'}
        </button>
      </div>
    </div>
  );
}

/* === TOPBAR === */
const PAGE_TITLES = {
  dashboard:'Dashboard',employees:'Employees',attendance:'Attendance',leave:'Leave Management',payroll:'Payroll & Commissions',
  requests:'HR Requests',reminders:'Reminders & Alerts',reports:'Reports',
  emp_dashboard:'My Dashboard',emp_profile:'My Profile',emp_attendance:'My Attendance',emp_leave:'My Leave',emp_pay:'My Payslips',emp_requests:'My Requests'
};

function TopBar({page,onToggleSidebar,counts,fbStatus,fbError}) {
  const fbColor = fbStatus==='connected'?'var(--green)':fbStatus==='offline'?'var(--red)':'var(--text3)';
  const fbLabel = fbStatus==='connected'?'Cloud Synced':fbStatus==='offline'?'Local Only':'Connecting...';
  const fbTitle = fbStatus==='connected'?'Connected to Firebase nasama-hr':fbStatus==='offline'?'Firebase error: '+(fbError||'unreachable'):'Testing connection...';
  return (
    <div style={{flexShrink:0}}>
      <div className="topbar">
        <div className="topbar-left">
          <button className="hamburger" onClick={onToggleSidebar}>☰</button>
          <div className="page-title">{PAGE_TITLES[page]||page}</div>
        </div>
        <div className="topbar-right">
          <div title={fbTitle} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:8,border:'1px solid var(--border)',fontSize:11,fontWeight:600,color:fbColor,background:'var(--bg2)',cursor:'help'}}>
            <span style={{width:7,height:7,borderRadius:'50%',background:fbColor,flexShrink:0}}/>
            {fbLabel}
          </div>
          <div className="topbar-btn" title="Alerts">
            🔔{(counts.pendingLeaves+counts.pendingReqs)>0&&<span className="notif-dot"/>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',background:'var(--bg2)',borderRadius:8,border:'1px solid var(--border)',fontSize:12,fontWeight:600,color:'var(--text2)'}}>
            🏢 Nasama RE
          </div>
        </div>
      </div>
    </div>
  );
}

/* === APP ROOT === */


/* === DATA PERSISTENCE — Firebase Realtime DB via SDK + localStorage === */
const STORAGE_KEY = 'nasama_hr_';
const DATA_KEYS = ['employees','salaryRecs','commRecs','leaves','requests','attData','auditLog','users'];

function loadLocal(key, fallback) {
  try { const r=localStorage.getItem(STORAGE_KEY+key); if(r) return JSON.parse(r); } catch(e){}
  return fallback;
}
function saveLocal(key, data) {
  try { localStorage.setItem(STORAGE_KEY+key, JSON.stringify(data)); } catch(e){}
}

/* Firebase stores arrays as objects with numeric keys, this restores them */
function restoreArrays(val) {
  if(val===null || val===undefined || typeof val!=='object') return val;
  if(Array.isArray(val)) return val.map(restoreArrays);
  const keys = Object.keys(val);
  const isArray = keys.length>0 && keys.every((k,i)=> String(i)===k);
  if(isArray) return keys.map(k => restoreArrays(val[k]));
  const out = {};
  for(const k of keys) out[k] = restoreArrays(val[k]);
  return out;
}

let _saveTimers = {};
let _fbReady = false; 
function saveDual(key, data) {
  if(!_fbReady) return; 
  saveLocal(key, data);
  clearTimeout(_saveTimers[key]);
  _saveTimers[key] = setTimeout(()=>{
    set(ref(db, 'nasama_hr/' + key), data).catch(e=>console.warn('Firebase SDK save failed for '+key+':', e));
  }, 400);
}

/* Full data load from Firebase SDK */
async function loadAllFromFirebase() {
  const snapshot = await get(child(ref(db), 'nasama_hr'));
  if(snapshot.exists()) {
    const rawData = snapshot.val();
    const loaded = {};
    for (const key of DATA_KEYS) {
       if (rawData[key] !== undefined) {
          loaded[key] = restoreArrays(rawData[key]);
          saveLocal(key, loaded[key]);
       }
    }
    return loaded;
  }
  return {};
}

/* Seed initial data if DB missing keys */
async function seedFirebaseIfEmpty(loaded, defaults) {
  const writePromises = [];
  DATA_KEYS.forEach(k => {
    if(!(k in loaded) && defaults[k]!==undefined) {
      console.log('🌱 Seeding Firebase SDK with default '+k);
      writePromises.push(
        set(ref(db, 'nasama_hr/' + k), defaults[k]).then(()=>saveLocal(k, defaults[k])).catch(e=>console.warn('Seed failed for '+k+':', e))
      );
    }
  });
  if(writePromises.length>0) await Promise.allSettled(writePromises);
}

function App() {
  const [session,setSession]=useState(()=>{
    const s=loadLocal('session',null);
    if(s && !s.userId) return null;
    return s;
  });
  const [page,setPageRaw]=useState('dashboard');
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [toast,setToast]=useState(null);

  /* ── All data states start with null (loading) ── */
  const [employees,setEmployees]=useState(null);
  const [salaryRecs,setSalaryRecs]=useState(null);
  const [commRecs,setCommRecs]=useState(null);
  const [leaves,setLeaves]=useState(null);
  const [requests,setRequests]=useState(null);
  const [attData,setAttData]=useState(null);
  const [auditLog,setAuditLog]=useState(null);
  const [users,setUsers]=useState(null);

  const [fbStatus,setFbStatus]=useState('loading'); // loading | connected | offline
  const [fbError,setFbError]=useState('');
  const [dataReady,setDataReady]=useState(false); // true once initial load is done

  /* ── Default data map for seeding ── */
  const DEFAULTS = React.useMemo(()=>({
    employees: EMPLOYEES_INIT,
    salaryRecs: SALARY_INIT,
    commRecs: COMMISSION_INIT,
    leaves: LEAVES_INIT,
    requests: REQUESTS_INIT,
    attData: ATT_INIT,
    auditLog: [],
    users: [],
  }),[]);

  /* ── Ensure valid users exist ── */
  function ensureUsersSeeded(currentUsers, setter) {
    const valid = Array.isArray(currentUsers) && currentUsers.length>0 && currentUsers.some(u=>u.passwordHash && u.passwordHash.length===64);
    if(!valid) {
      console.log('⚠ No valid users found — seeding default admin/hr/ceo accounts...');
      DEFAULT_PW_HASH_PROMISE.then(hash=>{
        if(hash && hash.length===64) {
          const seeded=DEFAULT_USERS.map(u=>({...u,passwordHash:hash,mustChangePw:true,lastLogin:''}));
          setter(seeded);
          console.log('✅ Default users seeded (password: nasama2026)');
        }
      });
    }
  }

  /* ── Audit trail helper ── */
  function addAudit(action, detail, empId) {
    const entry = {
      id: 'AUD'+Date.now().toString(36),
      timestamp: new Date().toISOString(),
      action,
      detail,
      empId: empId||'',
      actor: session?.role==='admin'?'Admin':(session?.empId||'System'),
    };
    setAuditLog(prev => [entry, ...(prev||[])].slice(0, 500));
  }

  /* ═══════════════════════════════════════════════════
     MASTER LOAD: Firebase first → localStorage fallback → defaults
     Runs ONCE on mount. No saves happen until this completes.
  ═══════════════════════════════════════════════════ */
  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      const setters = {employees:setEmployees, salaryRecs:setSalaryRecs, commRecs:setCommRecs, leaves:setLeaves, requests:setRequests, attData:setAttData, auditLog:setAuditLog, users:setUsers};

      try {
        console.log('🔍 Connecting to Firebase Realtime DB...');
        const loaded = await loadAllFromFirebase();
        if(cancelled) return;

        console.log('✅ Firebase connected — keys found:', Object.keys(loaded).join(', ') || '(none — fresh DB)');
        setFbStatus('connected');
        setFbError('');

        // Apply loaded data (or defaults for missing keys)
        DATA_KEYS.forEach(k => {
          if(k==='users') {
            const fbUsers = loaded[k];
            const hasValid = Array.isArray(fbUsers) && fbUsers.some(u=>u.passwordHash && u.passwordHash.length===64);
            if(hasValid) {
              setUsers(fbUsers);
              console.log('✅ Valid users loaded from Firebase');
            } else {
              setUsers(DEFAULTS[k]);
            }
          } else {
            setters[k](loaded[k] !== undefined ? loaded[k] : DEFAULTS[k]);
          }
        });

        // Seed Firebase with defaults for any missing keys
        await seedFirebaseIfEmpty(loaded, DEFAULTS);

        // Ensure users are seeded
        const fbUsers = loaded['users'];
        const hasValid = Array.isArray(fbUsers) && fbUsers.some(u=>u.passwordHash && u.passwordHash.length===64);
        if(!hasValid) ensureUsersSeeded([], setUsers);

      } catch(e) {
        console.error('❌ Firebase connection failed:', e.message);
        if(cancelled) return;
        setFbError(e.message);
        setFbStatus('offline');

        // Fall back to localStorage → defaults
        console.log('📦 Loading from localStorage cache...');
        DATA_KEYS.forEach(k => {
          setters[k](loadLocal(k, DEFAULTS[k]));
        });
        ensureUsersSeeded(loadLocal('users',[]), setUsers);
      }

      if(!cancelled) {
        // Enable saving AFTER all data is loaded
        _fbReady = true;
        setDataReady(true);
        console.log('🟢 Data ready — save hooks enabled');
      }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  /* ── Auto-save to localStorage + Firebase whenever data changes ── */
  /* saveDual() internally checks _fbReady, so these won't fire during initial load */
  useEffect(()=>{if(employees!==null) saveDual('employees',employees);},[employees]);
  useEffect(()=>{if(salaryRecs!==null) saveDual('salaryRecs',salaryRecs);},[salaryRecs]);
  useEffect(()=>{if(commRecs!==null) saveDual('commRecs',commRecs);},[commRecs]);
  useEffect(()=>{if(leaves!==null) saveDual('leaves',leaves);},[leaves]);
  useEffect(()=>{if(requests!==null) saveDual('requests',requests);},[requests]);
  useEffect(()=>{if(attData!==null) saveDual('attData',attData);},[attData]);
  useEffect(()=>{if(auditLog!==null) saveDual('auditLog',auditLog);},[auditLog]);
  useEffect(()=>{if(users!==null) saveDual('users',users);},[users]);
  useEffect(()=>saveLocal('session',session),[session]);

  /* ═══════════════════════════════════════════════════
     LOADING SCREEN — shown until Firebase load completes
  ═══════════════════════════════════════════════════ */
  if(!dataReady) {
    return (
      <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--bg2)',gap:16}}>
        <div style={{width:48,height:48,background:'linear-gradient(135deg,var(--blue) 0%,#60a5fa 100%)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:20}}>N</div>
        <div style={{fontSize:16,fontWeight:700,color:'var(--text1)'}}>Nasama HR</div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:18,height:18,border:'3px solid var(--border)',borderTopColor:'var(--blue)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
          <span style={{fontSize:13,color:'var(--text2)'}}>{fbStatus==='loading'?'Connecting to database...':'Loading data...'}</span>
        </div>
        {fbError && <div style={{fontSize:12,color:'var(--red)',maxWidth:400,textAlign:'center',padding:'8px 16px',background:'var(--red-light)',borderRadius:8}}>⚠ {fbError}<br/>Falling back to local data...</div>}
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }

  function setPage(p){setPageRaw(p);setSidebarOpen(false);}
  function showToast(msg,type='success'){setToast({msg,type});setTimeout(()=>setToast(null),3200);}
  function doLogin(sess, userObj){
    setSession(sess);
    // Update lastLogin in users
    if(userObj) setUsers(prev=>prev.map(u=>u.id===userObj.id?{...u,lastLogin:new Date().toISOString()}:u));
    // Route to correct landing page
    const landing = sess.role==='broker'?'emp_dashboard':'dashboard';
    setPage(landing);
    if(addAudit) addAudit('USER_LOGIN',sess.name+' ('+sess.role+') logged in', sess.empId||'');
  }
  function doLogout(){setSession(null);setPage('dashboard');}

  const counts={
    pendingLeaves:leaves.filter(l=>l.status==='pending').length,
    pendingReqs:requests.filter(r=>r.status==='pending').length,
    unpaidSal:salaryRecs.filter(s=>!s.paid).length,
    expiryAlerts:employees.filter(e=>e.status==='active').flatMap(e=>[daysUntil(e.visaExpiry),daysUntil(e.contractEnd),daysUntil(e.passExpiry),daysUntil(e.emiratesId),daysUntil(e.reraExp)]).filter(d=>d>=0&&d<=90).length,
  };

  if(!session) return <LoginPage users={users} setUsers={setUsers} employees={employees} onLogin={doLogin}/>;

  const emp=session.role==='broker'?employees.find(e=>e.id===session.empId):null;
  const user={name:session.name||'User',id:session.empId||session.userId||''};

  function renderPage() {
    const role = session.role;
    
    // Check page access permission
    if(!canAccess(role, page)) {
      return (
        <div style={{padding:'60px 40px',textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>🔒</div>
          <div style={{fontSize:18,fontWeight:700,color:'var(--text1)',marginBottom:8}}>Access Denied</div>
          <div style={{fontSize:13,color:'var(--text2)',marginBottom:20}}>Your role ({(ROLES[role]||{}).label||role}) does not have permission to access this page.</div>
          <button className="btn btn-primary btn-sm" onClick={()=>setPage(role==='broker'?'emp_dashboard':'dashboard')}>← Go to Dashboard</button>
        </div>
      );
    }

    // Admin + HR Officer + CEO pages (admin-like roles)
    if(isAdminLike(role)) {
      const readOnly = role==='ceo';
      const props={employees,setEmployees,leaves,setLeaves,requests,setRequests,salaryRecs,setSalaryRecs,commRecs,setCommRecs,attData,setAttData,showToast,addAudit,auditLog,userRole:role};
      if(page==='dashboard') return <Dashboard employees={employees} salaryRecs={salaryRecs} commRecs={commRecs} leaves={leaves} requests={requests} attData={attData}/>;
      if(page==='employees') return <EmployeesPage {...props}/>;
      if(page==='attendance') return <AttendancePage {...props}/>;
      if(page==='leave') return <LeavePage {...props}/>;
      if(page==='payroll') return <PayrollPage {...props}/>;
      if(page==='requests') return <RequestsPage {...props}/>;
      if(page==='reminders') return <RemindersPage employees={employees}/>;
      if(page==='reports') return <ReportsPage employees={employees} leaves={leaves} salaryRecs={salaryRecs} commRecs={commRecs} attData={attData}/>;
      if(page==='users'&&role==='admin') return <UserManagementPage users={users} setUsers={setUsers} employees={employees} showToast={showToast} addAudit={addAudit}/>;
    }
    
    // Broker (employee) pages
    if(role==='broker' && emp) {
      const props={emp,leaves,setLeaves,requests,setRequests,salaryRecs,commRecs,attData,showToast,addAudit};
      if(page==='emp_dashboard') return <EmpDashboard {...props}/>;
      if(page==='emp_profile') return (
        <div className="card">
          <div className="profile-hero"><Avatar name={emp.name} id={emp.id} size={68} fontSize={22} border={true}/><div><div className="profile-name">{emp.name}</div><div className="profile-title">{emp.title} · {emp.dept}</div><div className="profile-badges-row"><Badge cls="badge-blue">{emp.id}</Badge><TypeBadge type={emp.type}/><StatusBadge status={emp.status}/></div></div></div>
          <div className="card-body">
            <div className="info-grid">
              {[['Email',emp.email],['Mobile',emp.phone],['Nationality',emp.nationality],['Joined',fmtDate(emp.joined)],['Department',emp.dept],['Manager',(()=>{const m=employees.find(e=>e.id===emp.manager);return m?m.name:emp.manager||'—';})()]].map(([l,v])=>(
                <div key={l} className="info-field"><div className="info-label">{l}</div><div className="info-value">{v}</div></div>
              ))}
              {emp.salary>0&&<div className="info-field"><div className="info-label">Basic Salary</div><div className="info-value">{fmtMoney(emp.salary)}</div></div>}
              {emp.reraNo&&<div className="info-field"><div className="info-label">RERA No</div><div className="info-value">{emp.reraNo}</div></div>}
              <div className="info-field"><div className="info-label">Contract End</div><div className="info-value">{fmtDate(emp.contractEnd)}</div></div>
              <div className="info-field"><div className="info-label">Visa Expiry</div><div className="info-value">{fmtDate(emp.visaExpiry)}</div></div>
            </div>
          </div>
        </div>
      );
      if(page==='emp_attendance') return <EmpAttendance {...props}/>;
      if(page==='emp_leave') return <EmpLeave {...props}/>;
      if(page==='emp_pay') return <EmpPay {...props}/>;
      if(page==='emp_requests') return <EmpRequests {...props}/>;
    }
    return <div style={{padding:40,textAlign:'center',color:'var(--text3)'}}>Page not found</div>;
  }

  return (
    <div className="app">
      <div className={`side-overlay ${sidebarOpen?'show':''}`} onClick={()=>setSidebarOpen(false)}/>
      <div className={`sidebar ${sidebarOpen?'open':''}`} style={{transform:sidebarOpen?'translateX(0)':undefined}}>
        <Sidebar page={page} setPage={setPage} role={session.role} user={user} onLogout={doLogout} counts={counts}/>
      </div>
      <main className="main">
        <TopBar page={page} onToggleSidebar={()=>setSidebarOpen(o=>!o)} counts={counts} fbStatus={fbStatus} fbError={fbError}/>
        <div className="content">{renderPage()}</div>
      </main>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    </div>
  );
}



export default App;
