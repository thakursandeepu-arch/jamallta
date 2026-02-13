// script.js (module) - Firestore v11 modular SDK + Chart.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, query, where, orderBy, getDocs, getDoc, doc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

/* FIREBASE CONFIG (your provided config) */
const firebaseConfig = {
  apiKey: "AIzaSyAcHb-VHdM30fb9qSR4dzclmNTxXsTofIw",
  authDomain: "jamallta-films-2-27d2b.firebaseapp.com",
  projectId: "jamallta-films-2-27d2b",
  storageBucket: "jamallta-films-2-27d2b.firebasestorage.app",
  messagingSenderId: "207209419416",
  appId: "1:207209419416:web:53ff512e34553e9286b6ed"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* DOM refs */
const monthPicker = document.getElementById('monthPicker');
const btnLoad = document.getElementById('btnLoad');
const btnCSV = document.getElementById('btnCSV');
const btnPrint = document.getElementById('btnPrint');
const tableBody = document.getElementById('tableBody');
const k_projects = document.getElementById('k_projects');
const k_ready = document.getElementById('k_ready');
const k_amount = document.getElementById('k_amount');
const k_payments = document.getElementById('k_payments');
const k_balance = document.getElementById('k_balance');
const printedAt = document.getElementById('printedAt');

const pad = n => String(n).padStart(2,'0');
const now = new Date();
if (monthPicker) monthPicker.value = now.getFullYear() + '-' + pad(now.getMonth() + 1);

let lastNormalized = [];
let chart = null;

function money(v){ 
  const num = Number(v || 0);
  return '₹' + num.toLocaleString('en-IN', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }); 
}
function esc(s){ return String(s||''); }
function dateToYMD(d){ 
  if(!d) return ''; 
  try{ 
    if(typeof d.toDate==='function') d = d.toDate(); 
    const dt = new Date(d); 
    if(isNaN(dt)) return String(d); 
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}` 
  } catch(e){ 
    return String(d||''); 
  } 
}

/* Fetch jobs for month */
async function fetchJobsForMonth(monthValue){
  const [Y,M] = monthValue.split('-').map(Number);
  const startStr = `${Y}-${pad(M)}-01`;
  const lastDay = new Date(Y,M,0).getDate();
  const endStr = `${Y}-${pad(M)}-${pad(lastDay)}`;

  const results = new Map();
  try {
    const q = query(collection(db,'jobs'), where('dataCopyDate','>=', startStr), where('dataCopyDate','<=', endStr), orderBy('dataCopyDate','desc'));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const data = d.data();
      
      results.set(d.id, Object.assign({id:d.id}, data));
    });
  } catch(e){
    console.warn('string range query failed (dataCopyDate):', e && e.message);
  }

  if(results.size === 0){
    try {
      const snapAll = await getDocs(query(collection(db,'jobs'), orderBy('updatedAt','desc')));
      snapAll.forEach(d=>{
        const data = d.data();
        
        let test = null;
        if(data.dataCopyDate) test = new Date(data.dataCopyDate);
        else if(data.date) test = new Date(data.date);
        else if(data.createdAt && typeof data.createdAt.toDate === 'function') test = data.createdAt.toDate();
        if(test && test.getFullYear() === Y && (test.getMonth()+1) === M) results.set(d.id, Object.assign({id:d.id}, data));
      });
    } catch(e){
      console.warn('fallback fetch failed:', e && e.message);
    }
  }

  return Array.from(results.values());
}

/* Cache for customer balances to avoid repeated fetches */
const customerBalanceCache = new Map();

/* Fetch numeric balance and optionally return document data */
async function getCustomerBalance(customerId) {
  if (!customerId) return 0;
  
  // Check cache first
  if (customerBalanceCache.has(customerId)) {
    return customerBalanceCache.get(customerId);
  }
  
  try {
    const cdoc = await getDoc(doc(db, 'customers', customerId));
    if (cdoc && cdoc.exists()) {
      const cd = cdoc.data();
      
      // DEBUG: Log customer data
      console.log('Customer Data for', customerId, ':', cd);
      
      // Get balance - check both balance and outstandingBalance fields
      let balance = 0;
      
      // First priority: balance field
      if (cd.balance !== undefined && cd.balance !== null) {
        const balanceVal = Number(cd.balance);
        if (!isNaN(balanceVal)) {
          balance = balanceVal;
          console.log('Using balance field:', balance);
        }
      }
      
      // Second priority: outstandingBalance field (if balance not found or 0)
      if ((balance === 0 || balance === null) && cd.outstandingBalance !== undefined && cd.outstandingBalance !== null) {
        const outstandingVal = Number(cd.outstandingBalance);
        if (!isNaN(outstandingVal)) {
          balance = outstandingVal;
          console.log('Using outstandingBalance field:', balance);
        }
      }
      
      // Cache the result
      customerBalanceCache.set(customerId, balance);
      console.log('Cached balance for', customerId, ':', balance);
      return balance;
    } else {
      console.log('Customer document not found for:', customerId);
    }
  } catch(e) {
    console.warn('Failed to fetch customer balance for', customerId, e);
  }
  
  return 0;
}

/* Find customer by studio name.
   Returns { id, data } or null.
   1) try indexed equality query on studioName
   2) if not found, fallback to scanning and case-insensitive match */
async function getCustomerIdByStudioName(studioName) {
  if (!studioName) return null;
  const nameTrim = String(studioName).trim();
  if (!nameTrim) return null;

  try {
    // Primary: exact equality query on studioName
    const q = query(collection(db, "customers"), where("studioName", "==", nameTrim));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docSnap = snap.docs[0];
      return { id: docSnap.id, data: docSnap.data() };
    }
  } catch (e) {
    console.warn("studio name equality query failed:", e);
  }

  // Fallback: fetch all customers and match case-insensitive on a set of fields
  try {
    const all = await getDocs(collection(db, "customers"));
    const lcTarget = nameTrim.toLowerCase();
    for (const d of all.docs) {
      const cd = d.data();
      const candidates = [
        cd.studioName, cd.studio, cd.name, cd.customerName, cd.customer
      ].filter(Boolean).map(x => String(x).toLowerCase());
      if (candidates.some(c => c === lcTarget || c.includes(lcTarget) || lcTarget.includes(c))) {
        return { id: d.id, data: cd };
      }
    }
  } catch (e) {
    console.warn("studio name fallback scan failed:", e);
  }

  return null;
}

/* Normalize job - uses studioName lookup if customerId missing */
async function normalizeJob(raw){
  const jobNo = raw.jobNo || raw.jobNumber || raw.id || '';
  const studioNameFromJob = raw.studioName || raw.customerName || '';
  const studioName = studioNameFromJob;
  const projectName = raw.projectName || raw.project || '';
  const editorName = raw.editorName || raw.assignedTo || raw.editor || '';
  const totalAmount = Number(raw.totalAmount || raw.total || raw.projectTotal || 0);
  const dataCopyDate = raw.dataCopyDate || raw.dataCopy || raw.dataCopyAt || raw.date || '';
  const systemNo = raw.systemNo || raw.system || '';
  const drive = raw.drive || '';
  const dataReadyDate = raw.dataReadyDate || raw.dataCopyDate || raw.date || '';
  const dataDeliverDate = raw.dataDeliverDate || raw.dataDeliver || '';
  
  const itemsRaw = Array.isArray(raw.itemsAdded) ? raw.itemsAdded : (Array.isArray(raw.items) ? raw.items : []);
  const addItem = itemsRaw.map(it => it.name || it.itemName || '').join('; ');

  // Get customer info and balance
  let mobile = '', email = '', customerBalance = 0;
  let customerId = raw.customerId || '';
  let foundCustomer = null;

  console.log('Processing job:', jobNo, 'Customer ID (raw):', customerId, 'Studio:', studioName);

  // If no customerId, try lookup by studio name
  if (!customerId && studioName) {
    foundCustomer = await getCustomerIdByStudioName(studioName);
    if (foundCustomer) {
      customerId = foundCustomer.id;
      console.log('Found customer by studioName ->', customerId);
    } else {
      console.log('No customer found for studioName:', studioName);
    }
  }

  // If we already have the customer doc from lookup, use it to extract balance & contact
  if (foundCustomer && foundCustomer.data) {
    const cd = foundCustomer.data;
    // balance preference: balance, outstandingBalance
    if (cd.balance !== undefined && cd.balance !== null) {
      const b = Number(cd.balance);
      if (!isNaN(b)) customerBalance = b;
    }
    if ((customerBalance === 0 || isNaN(customerBalance)) && cd.outstandingBalance !== undefined && cd.outstandingBalance !== null) {
      const b2 = Number(cd.outstandingBalance);
      if (!isNaN(b2)) customerBalance = b2;
    }
    mobile = cd.phone || cd.mobile || cd.contact || '';
    email = cd.email || cd.contactEmail || '';
    // Cache it for future use
    if (customerId) customerBalanceCache.set(customerId, customerBalance);
    console.log('Used customer doc from studio lookup - balance:', customerBalance);
  } else if (customerId) {
    // No pre-fetched doc: call getCustomerBalance which fetches and caches numeric balance,
    // then fetch contact fields separately (but use cached doc if available)
    customerBalance = await getCustomerBalance(customerId);
    console.log('Customer balance for', customerId, ':', customerBalance);
    try {
      const cdoc = await getDoc(doc(db, 'customers', customerId));
      if (cdoc && cdoc.exists()) {
        const cd = cdoc.data();
        mobile = cd.phone || cd.mobile || cd.contact || '';
        email = cd.email || cd.contactEmail || '';
      }
    } catch(e) {
      console.warn('Failed to fetch customer details for', customerId, e);
    }
  } else {
    // No customerId and no studio match: leave balance 0
    customerBalance = 0;
    console.log('No customer id and no studio match; defaulting balance to 0 for job', jobNo);
  }

  // Count ready items correctly
  const readyItemsCount = itemsRaw.reduce((count, item) => {
    const isReady = item.ready === true || 
                    item.ready === 'true' || 
                    item.status === 'ready' || 
                    item.isReady === true ||
                    item.itemStatus === 'ready';
    return count + (isReady ? 1 : 0);
  }, 0);

  // Calculate paid amount for this job
  const paidAmount = Number(raw.paidAmount || raw.paid || raw.amountPaid || 0);
  const jobBalance = totalAmount - paidAmount;

  console.log('Final values for', jobNo, ':', {
    totalAmount,
    paidAmount,
    jobBalance,
    customerBalance
  });

  return {
    id: raw.id || '',
    jobNo,
    studioName,
    projectName,
    dataCopyDate: dateToYMD(dataCopyDate) || dataCopyDate,
    systemNo,
    drive,
    addItem,
    editorName,
    totalAmount,
    dataReadyDate: dateToYMD(dataReadyDate) || dataReadyDate,
    dataDeliverDate: dateToYMD(dataDeliverDate) || dataDeliverDate,
    balance: customerBalance, // ALWAYS use customer's account balance (from customer doc)
    paidAmount: paidAmount,
    jobBalance: jobBalance, // Store job-specific balance separately
    mobile,
    email,
    rawItems: itemsRaw,
    readyItemsCount: readyItemsCount,
    customerId: customerId,
    hasReadyItems: readyItemsCount > 0
  };
}

/* Analysis / render functions */
function analyzeAll(normalized){
  const totals = { 
    projects:0, 
    itemsReady:0, 
    totalAmount:0, 
    totalPaid:0, 
    totalBalance:0 
  };
  
  normalized.forEach(j=>{
    totals.projects++;
    totals.totalAmount += Number(j.totalAmount || 0);
    totals.totalBalance += Number(j.balance || 0); // Sum of customer balances
    totals.itemsReady += j.readyItemsCount || 0;
    totals.totalPaid += Number(j.paidAmount || 0);
  });
  
  console.log('Analysis totals:', totals);
  return totals;
}

function renderTable(normalized){
  if(!normalized || normalized.length === 0){
    tableBody.innerHTML = '<tr><td colspan="12" class="empty">No projects for selected month.</td></tr>';
    return;
  }
  
  tableBody.innerHTML = '';
  normalized.forEach(j=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${esc(j.jobNo)}</td>
                    <td>${esc(j.studioName)}</td>
                    <td>${esc(j.projectName)}</td>
                    <td>${esc(j.dataCopyDate)}</td>
                    <td>${esc(j.systemNo)}</td>
                    <td>${esc(j.drive)}</td>
                    <td>${esc(j.addItem)}</td>
                    <td>${esc(j.editorName)}</td>
                    <td>${money(j.totalAmount)}</td>
                    <td>${esc(j.dataReadyDate)}</td>
                    <td>${esc(j.dataDeliverDate)}</td>
                    <td><strong>${money(j.balance)}</strong></td>`;
    tableBody.appendChild(tr);
  });
}

/* Chart builder - MULTI-LINE CHART */
function buildChartFromJobs(jobs, month){
  if (!month) return;
  
  const [Y,M] = month.split('-').map(Number);
  const daysInMonth = new Date(Y,M,0).getDate();
  const labels = Array.from({length:daysInMonth}, (_,i)=>String(i+1));
  
  // Initialize daily data
  const dailyData = {
    projects: new Array(daysInMonth).fill(0),
    itemsReady: new Array(daysInMonth).fill(0),
    totalAmount: new Array(daysInMonth).fill(0),
    totalPaid: new Array(daysInMonth).fill(0),
    totalBalance: new Array(daysInMonth).fill(0)
  };
  
  // Process each job
  jobs.forEach(j => {
    const date = j.dataReadyDate ? new Date(j.dataReadyDate) : null;
    if (!date || isNaN(date) || date.getFullYear() !== Y || (date.getMonth()+1) !== M) return;
    
    const dayIndex = date.getDate() - 1;
    if (dayIndex < 0 || dayIndex >= daysInMonth) return;
    
    // Accumulate daily values
    dailyData.projects[dayIndex]++;
    dailyData.itemsReady[dayIndex] += j.readyItemsCount || 0;
    dailyData.totalAmount[dayIndex] += j.totalAmount || 0;
    dailyData.totalPaid[dayIndex] += j.paidAmount || 0;
    dailyData.totalBalance[dayIndex] += j.balance || 0;
  });
  
  // Calculate cumulative values
  const cumulativeData = {
    projects: [],
    itemsReady: [],
    totalAmount: [],
    totalPaid: [],
    totalBalance: []
  };
  
  let cumProjects = 0, cumItemsReady = 0, cumTotalAmount = 0, cumTotalPaid = 0, cumTotalBalance = 0;
  
  for (let i = 0; i < daysInMonth; i++) {
    cumProjects += dailyData.projects[i];
    cumItemsReady += dailyData.itemsReady[i];
    cumTotalAmount += dailyData.totalAmount[i];
    cumTotalPaid += dailyData.totalPaid[i];
    cumTotalBalance += dailyData.totalBalance[i];
    
    cumulativeData.projects.push(cumProjects);
    cumulativeData.itemsReady.push(cumItemsReady);
    cumulativeData.totalAmount.push(cumTotalAmount);
    cumulativeData.totalPaid.push(cumTotalPaid);
    cumulativeData.totalBalance.push(cumTotalBalance);
  }
  
  const ctx = document.getElementById('progressChart').getContext('2d');
  
  // Destroy existing chart if exists
  if (chart) {
    chart.destroy();
  }
  
  // Create new multi-line chart
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Projects',
          data: cumulativeData.projects,
          borderColor: '#ff2e63',
          backgroundColor: 'rgba(255, 46, 99, 0.1)',
          tension: 0.3,
          fill: false,
          borderWidth: 2
        },
        {
          label: 'Items Ready',
          data: cumulativeData.itemsReady,
          borderColor: '#08d9d6',
          backgroundColor: 'rgba(8, 217, 214, 0.1)',
          tension: 0.3,
          fill: false,
          borderWidth: 2
        },
        {
          label: 'Total Amount',
          data: cumulativeData.totalAmount,
          borderColor: '#ff9a00',
          backgroundColor: 'rgba(255, 154, 0, 0.1)',
          tension: 0.3,
          fill: false,
          borderWidth: 2,
          yAxisID: 'y1'
        },
        {
          label: 'Paid',
          data: cumulativeData.totalPaid,
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          tension: 0.3,
          fill: false,
          borderWidth: 2,
          yAxisID: 'y1'
        },
        {
          label: 'Balance',
          data: cumulativeData.totalBalance,
          borderColor: '#9d4edd',
          backgroundColor: 'rgba(157, 78, 221, 0.1)',
          tension: 0.3,
          fill: false,
          borderWidth: 2,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      stacked: false,
      scales: {
        x: {
          title: {
            display: true,
            text: 'Day of Month'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Count (Projects/Items)'
          },
          ticks: {
            callback: function(value) {
              return value.toLocaleString('en-IN');
            }
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Amount'
          },
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            callback: function(value) {
              return '₹' + value.toLocaleString('en-IN');
            }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            font: {
              size: 10
            },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label.includes('₹')) {
                return label + ': ₹' + context.parsed.y.toLocaleString('en-IN');
              }
              return label + ': ' + context.parsed.y.toLocaleString('en-IN');
            }
          }
        }
      }
    }
  });
}

/* CSV builder */
function buildCSV(normalized){
  const rows = [];
  rows.push(['JobNo','StudioName','ProjectName','DataCopy','SystemNo','Drive','AddItem','EditorName','TotalAmount','DataReadyDate','DataDeliverDate','CurrentBalance','Mobile','Email'].join(','));
  normalized.forEach(j=>{
    rows.push([
      j.jobNo,
      j.studioName,
      j.projectName,
      j.dataCopyDate,
      j.systemNo,
      j.drive,
      j.addItem,
      j.editorName,
      j.totalAmount,
      j.dataReadyDate,
      j.dataDeliverDate,
      j.balance,
      j.mobile,
      j.email
    ].map(v=>`"${String(v||'')}"`).join(','));
  });
  return rows.join('\n');
}

/* Button handlers */
btnLoad && btnLoad.addEventListener('click', async ()=>{
  const m = monthPicker.value; 
  if(!m){ 
    alert('Select month'); 
    return; 
  }
  
  // Clear cache for fresh data
  customerBalanceCache.clear();
  
  tableBody.innerHTML = '<tr><td colspan="9" class="empty loading">Loading...</td></tr>';
  
  try{
    const rawJobs = await fetchJobsForMonth(m);
    console.log('Raw jobs found:', rawJobs.length);
    
    const normalized = [];
    
    for(const r of rawJobs){ 
      try{ 
        const n = await normalizeJob(r); 
        normalized.push(n); 
      } catch(e){ 
        console.warn('normalize failed for job', r.id, e); 
      } 
    }
    
    console.log('Normalized jobs:', normalized.length);
    lastNormalized = normalized;
    const totals = analyzeAll(normalized);
    
    // Update KPI display
    k_projects.textContent = totals.projects;
    k_ready.textContent = totals.itemsReady;
    k_amount.textContent = money(totals.totalAmount);
    k_payments.textContent = money(totals.totalPaid);
    k_balance.textContent = money(totals.totalBalance);

    renderTable(normalized);
    buildChartFromJobs(normalized, m);
    
  } catch(e){
    console.error('Load failed', e);
    tableBody.innerHTML = '<tr><td colspan="9" class="empty">Failed to load data.</td></tr>';
  }
});

btnCSV && btnCSV.addEventListener('click', ()=>{
  if(!lastNormalized || lastNormalized.length===0){ 
    alert('No data to export'); 
    return; 
  }
  const csv = buildCSV(lastNormalized);
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); 
  a.href = url; 
  a.download = `monthly-report-${monthPicker.value || 'report'}.csv`; 
  document.body.appendChild(a); 
  a.click(); 
  a.remove(); 
  URL.revokeObjectURL(url);
});

if(btnPrint){
  btnPrint.addEventListener('click', ()=>{
    const now = new Date(); 
    if(printedAt) printedAt.textContent = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setTimeout(()=>window.print(), 120);
  });
}

/* Auto-load current month */
window.addEventListener('DOMContentLoaded', ()=>{ 
  setTimeout(()=>{ 
    if(btnLoad) btnLoad.click(); 
  }, 220); 
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login";
    return;
  }
  if (btnLoad) btnLoad.click();
});




