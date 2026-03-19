

/* Simple SHA-256 hash — with JS fallback for file:// protocol where crypto.subtle is unavailable */
export async function hashPassword(pw) {
  // Try native crypto.subtle first (secure contexts only)
  if(window.crypto && window.crypto.subtle) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
      return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
    } catch(e) { /* fall through to JS fallback */ }
  }
  // Pure JS SHA-256 fallback (works on file:// protocol)
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes=[];for(let i=0;i<pw.length;i++)bytes.push(pw.charCodeAt(i));
  const bits=bytes.length*8;
  bytes.push(0x80);
  while(bytes.length%64!==56)bytes.push(0);
  bytes.push(0,0,0,0,(bits>>>24)&0xff,(bits>>>16)&0xff,(bits>>>8)&0xff,bits&0xff);
  for(let off=0;off<bytes.length;off+=64){
    const w=new Array(64);
    for(let i=0;i<16;i++)w[i]=((bytes[off+i*4]<<24)|(bytes[off+i*4+1]<<16)|(bytes[off+i*4+2]<<8)|bytes[off+i*4+3])>>>0;
    for(let i=16;i<64;i++){const v15=w[i-15],v2=w[i-2];
      w[i]=(w[i-16]+(((v15>>>7)|(v15<<25))^((v15>>>18)|(v15<<14))^(v15>>>3))+w[i-7]+(((v2>>>17)|(v2<<15))^((v2>>>19)|(v2<<13))^(v2>>>10)))>>>0;}
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){
      const t1=(h+(((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))+((e&f)^((~e)&g))+K[i]+w[i])>>>0;
      const t2=((((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))+((a&b)^(a&c)^(b&c)))>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return H.map(v=>v.toString(16).padStart(8,'0')).join('');
}

/* ── Role definitions ── */
export const ROLES = {
  admin:      { label: 'Administrator',  icon: '🛡️', color: 'var(--red)',    bg: 'var(--red-light)' },
  hr_officer: { label: 'HR Officer',     icon: '👔', color: 'var(--purple)', bg: 'var(--purple-light)' },
  ceo:        { label: 'CEO',            icon: '👑', color: 'var(--amber)',  bg: 'var(--amber-light)' },
  broker:     { label: 'Broker',         icon: '🏢', color: 'var(--blue)',   bg: 'var(--blue-light)' },
};

/* ── Permission matrix: which pages each role can access ── */
export const ROLE_PAGES = {
  admin:      ['dashboard','employees','attendance','leave','payroll','requests','reminders','reports','users'],
  hr_officer: ['dashboard','employees','attendance','leave','requests','reminders','reports'],
  ceo:        ['dashboard','payroll','reports'],
  broker:     ['emp_dashboard','emp_profile','emp_attendance','emp_leave','emp_pay','emp_requests'],
};

/* ── Action permissions ── */
export const ROLE_ACTIONS = {
  admin:      ['manage_users','edit_employee','delete_employee','approve_leave','manage_payroll','pay_salary','manage_commission','manage_requests','generate_letter','run_batch_payroll','edit_attendance','print_reports'],
  hr_officer: ['edit_employee','manage_requests','generate_letter','edit_attendance','print_reports'],
  ceo:        ['print_reports'],
  broker:     ['submit_leave','submit_request'],
};

/* ── Navigation per role ── */
export function getNavForRole(role, counts) {
  if(role==='admin') return [
    {section:'MAIN',items:[
      {key:'dashboard',icon:'📊',label:'Dashboard'},
      {key:'employees',icon:'👥',label:'Employees'},
      {key:'attendance',icon:'📅',label:'Attendance'},
    ]},
    {section:'MANAGEMENT',items:[
      {key:'leave',icon:'🌴',label:'Leave',badge:counts.pendingLeaves,badgeType:'red'},
      {key:'payroll',icon:'💰',label:'Payroll',badge:counts.unpaidSal,badgeType:'amber'},
      {key:'requests',icon:'📋',label:'Requests',badge:counts.pendingReqs,badgeType:'red'},
    ]},
    {section:'TOOLS',items:[
      {key:'reminders',icon:'🔔',label:'Reminders',badge:counts.expiryAlerts,badgeType:'amber'},
      {key:'reports',icon:'📈',label:'Reports'},
      {key:'users',icon:'🛡️',label:'User Management'},
    ]},
  ];
  if(role==='hr_officer') return [
    {section:'HR PORTAL',items:[
      {key:'dashboard',icon:'📊',label:'Dashboard'},
      {key:'employees',icon:'👥',label:'Employees'},
      {key:'attendance',icon:'📅',label:'Attendance'},
      {key:'leave',icon:'🌴',label:'Leave',badge:counts.pendingLeaves,badgeType:'red'},
      {key:'requests',icon:'📋',label:'Requests',badge:counts.pendingReqs,badgeType:'red'},
    ]},
    {section:'TOOLS',items:[
      {key:'reminders',icon:'🔔',label:'Reminders',badge:counts.expiryAlerts,badgeType:'amber'},
      {key:'reports',icon:'📈',label:'Reports'},
    ]},
  ];
  if(role==='ceo') return [
    {section:'EXECUTIVE',items:[
      {key:'dashboard',icon:'📊',label:'Dashboard'},
      {key:'payroll',icon:'💰',label:'Payroll'},
      {key:'reports',icon:'📈',label:'Reports'},
    ]},
  ];
  // broker = employee portal
  return [
    {section:'MY PORTAL',items:[
      {key:'emp_dashboard',icon:'🏠',label:'My Dashboard'},
      {key:'emp_profile',icon:'👤',label:'My Profile'},
      {key:'emp_attendance',icon:'📅',label:'My Attendance'},
      {key:'emp_leave',icon:'🌴',label:'My Leave'},
      {key:'emp_pay',icon:'💰',label:'My Payslips'},
      {key:'emp_requests',icon:'📋',label:'My Requests'},
    ]},
  ];
}

export function canAccess(role, page) { return (ROLE_PAGES[role]||[]).includes(page); }
export function canDo(role, action) { return (ROLE_ACTIONS[role]||[]).includes(action); }
export function isAdminLike(role) { return role==='admin'||role==='hr_officer'||role==='ceo'; }

/* ── Default users seed (hashed passwords set on first load) ── */
export const DEFAULT_USERS = [
  {id:'USR001', email:'admin@nasama.ae',    name:'Admin',           role:'admin',      empId:'',      active:true},
  {id:'USR002', email:'hr@nasama.ae',       name:'HR Officer',      role:'hr_officer',  empId:'',      active:true},
  {id:'USR003', email:'ceo@nasama.ae',      name:'CEO',             role:'ceo',         empId:'',      active:true},
];
/* Default password for all seed users: "nasama2026" — must be changed on first login */
export const DEFAULT_PW_HASH_PROMISE = hashPassword('nasama2026');

export const EMPLOYEES_INIT = [
  {id:'EMP001',name:'Abdulsalam Alaithan',nationality:'Saudi Arabia',email:'abdulsalam@nasama.ae',phone:'+971 50 275 7603',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'64897',reraExp:'2026-06-14'},
  {id:'EMP002',name:'Ahmad Ibrahim',nationality:'Lebanese',email:'ahmad.ibrahim@nasama.ae',phone:'+971 50 607 6506',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'83093',reraExp:'2026-06-14'},
  {id:'EMP003',name:'Faoud Dada',nationality:'Lebanese',email:'faoud@nasama.ae',phone:'+971 52 692 0033',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'78849',reraExp:'2026-06-14'},
  {id:'EMP004',name:'Marwa Khiari',nationality:'Tunisian',email:'marwa@nasama.ae',phone:'+971 55 212 9369',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP005',name:'Monaf Hamza',nationality:'Syrian',email:'monaf@nasama.ae',phone:'+971 50 303 8894',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'84529',reraExp:'2026-06-12'},
  {id:'EMP006',name:'Nancy Tfaily',nationality:'Lebanese',email:'nancy@nasama.ae',phone:'+971 55 419 2910',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP007',name:'Mohamed Kamal',nationality:'Egyptian',email:'mohamed.kamal@nasama.ae',phone:'+971 55 275 5399',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP008',name:'Tarek Momneh',nationality:'Canadian',email:'tarek.momneh@nasama.ae',phone:'+971 50 142 2789',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'91804',reraExp:'2026-12-10'},
  {id:'EMP009',name:'Nene Belquz Diallo',nationality:'Liberian',email:'nene@nasama.ae',phone:'+971 52 255 9448',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'94313',reraExp:'2027-02-10'},
  {id:'EMP010',name:'Shuhaib Thalichalam',nationality:'Indian',email:'shuhaib@nasama.ae',phone:'+971 52 229 0234',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP011',name:'Jerine Mathews',nationality:'Indian',email:'jerine@nasama.ae',phone:'+971 58 598 7400',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP012',name:'Rajab Zahrawy',nationality:'Syrian',email:'rajab@nasama.ae',phone:'+971 58 588 0024',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP013',name:'Mohamad Teryaki',nationality:'Lebanese',email:'mohamad.teryaki@nasama.ae',phone:'+971 55 838 8197',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP014',name:'Tarek Salhani',nationality:'Saudi Arabia',email:'tarek.salhani@nasama.ae',phone:'+971 55 731 0587',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP015',name:'Mohammed Teryaki',nationality:'Lebanese',email:'mohammed.teryaki@nasama.ae',phone:'+971 55 838 8197',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''},
  {id:'EMP016',name:'Alaa Muneer',nationality:'Jordanian',email:'alaa@nasama.ae',phone:'+971 50 190 1890',title:'Broker',dept:'Sales',joined:'',type:'commission',salary:0,housing:0,transport:0,passExpiry:'',visaExpiry:'',emiratesId:'',contractStart:'',contractEnd:'',status:'active',manager:'',notes:'',leaveBalance:21,leaveTaken:0,reraNo:'',reraExp:''}
];

export const SALARY_INIT = [];

export const COMMISSION_INIT = [];

export const LEAVES_INIT = [];

export const REQUESTS_INIT = [];

/* Generate month attendance records with Fri+Sat weekends (UAE) */
export function genMonthAtt(year, month) {
  const days = new Date(year, month+1, 0).getDate();
  return Array.from({length: days}, (_,i) => {
    const d = i+1;
    const dow = new Date(year, month, d).getDay();
    const isWE = dow===5||dow===6;
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return { date: dateStr, status: isWE ? 'weekend' : '' };
  });
}

export const ATT_INIT = (() => {
  const data = {};
  EMPLOYEES_INIT.forEach(emp => {
    data[emp.id] = [
      ...genMonthAtt(2026, 0),
      ...genMonthAtt(2026, 1),
      ...genMonthAtt(2026, 2)
    ];
  });
  return data;
})();