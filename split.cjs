const fs = require('fs');

const html = fs.readFileSync('../index.html', 'utf8');
const scriptStart = html.indexOf('<script type="text/babel">') + 26;
const scriptEnd = html.indexOf('</script>', scriptStart);
const code = html.substring(scriptStart, scriptEnd);

const parts = code.split('/* ═══════════════════════════════════════════════════════');

const sections = [];
for (let i = 1; i < parts.length; i++) {
  const part = parts[i];
  const endHeaderLine = part.indexOf('═══════════════════════════════════════════════════════ */');
  if (endHeaderLine === -1) continue;
  
  const titleLines = part.substring(0, endHeaderLine).split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const title = titleLines.join(' ');
  const content = part.substring(endHeaderLine + 58).trim(); // 58 is length of the dashes + */
  sections.push({ title, content });
}

// Make sure folders exist
if (!fs.existsSync('src/data')) fs.mkdirSync('src/data', {recursive: true});
if (!fs.existsSync('src/utils')) fs.mkdirSync('src/utils', {recursive: true});
if (!fs.existsSync('src/components')) fs.mkdirSync('src/components', {recursive: true});
if (!fs.existsSync('src/pages')) fs.mkdirSync('src/pages', {recursive: true});

// Helpers to export functions and consts automatically
function autoExport(str) {
  let res = str.replace(/^const /gm, 'export const ');
  res = res.replace(/^function /gm, 'export function ');
  res = res.replace(/^async function /gm, 'export async function ');
  return res;
}

let mockDataStr = '';
let helpersStr = '';
let componentsStr = '';
let componentsNames = [];

for (const sec of sections) {
  if (sec.title.includes('RBAC') || sec.title.includes('INITIAL DATA')) {
    mockDataStr += '\n\n' + autoExport(sec.content);
  } else if (sec.title.includes('HELPERS') || sec.title.includes('PRINTER') || sec.title.includes('HR LETTER')) {
    helpersStr += '\n\n' + autoExport(sec.content);
  } else {
    // All components go to a single massive components file for now to preserve scope, or we can split.
    // Let's dump all pages and components into src/App.jsx for simplicity of routing first.
    componentsStr += '\n\n/* === ' + sec.title + ' === */\n' + sec.content;
  }
}

const reactImports = `import React, { useState, useEffect, useRef, useCallback } from 'react';\n`;
const mockDataImports = `import { ROLES, ROLE_PAGES, ROLE_ACTIONS, getNavForRole, canAccess, canDo, isAdminLike, DEFAULT_USERS, DEFAULT_PW_HASH_PROMISE, EMPLOYEES_INIT, SALARY_INIT, COMMISSION_INIT, LEAVES_INIT, REQUESTS_INIT, ATT_INIT } from './data/mockData';\n`;
const helperImports = `import { hashPassword, fmtDate, fmtMoney, daysUntil, getInitials, AV_BG, AV_CL, getAV, expiryBadge, expiryLabel, today, nowId, COMPANY_LOGO, printProfessionalReport, generateHRLetter } from './utils/helpers';\n`;

fs.writeFileSync('src/data/mockData.js', mockDataStr);
fs.writeFileSync('src/utils/helpers.js', 'import { getAV, getInitials } from "./helpers";\n' + helpersStr); // self import hack for inside

// Actually, in helpers.js, getAV calls getInitials, but they are in the same file. Exporting them means they use local scope. No self-import needed.
fs.writeFileSync('src/utils/helpers.js', helpersStr); 

// For the rest of the code (App.jsx)
let topLevelApp = parts[0].replace('const { useState, useEffect, useRef, useCallback } = React;', '');
topLevelApp = topLevelApp.replace('document.addEventListener', '// document.addEventListener');

let finalApp = `
${reactImports}
${mockDataImports}
${helperImports}
import './index.css';

${topLevelApp}

${componentsStr.replace(/<script.*?>/g, '')}

export default App;
`;

fs.writeFileSync('src/App.jsx', finalApp);
console.log('Extraction complete');
