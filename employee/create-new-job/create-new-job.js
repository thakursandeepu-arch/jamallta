// create-new-job.js (FINAL - payments payload includes studioName/customerName)
import { auth, db } from "../firebase-config.js";
import {
  collection, addDoc, serverTimestamp, getDocs, query, where, limit, doc, runTransaction, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

/* firebase-config is shared at /employee/firebase-config.js */

// DOM refs (same ids as in your page)
const tabCreate = document.getElementById('tabCreate');
const tabPayments = document.getElementById('tabPayments');
const createTab = document.getElementById('createTab');
const paymentsTab = document.getElementById('paymentsTab');

const backBtn = document.getElementById('backBtn');
const refreshBtn = document.getElementById('refreshBtn');

const jobNo = document.getElementById('jobNo');
const projectName = document.getElementById('projectName');
const studioName = document.getElementById('studioName');
const studioSuggestions = document.getElementById('studioSuggestions');

const dataCopyDate = document.getElementById('dataCopyDate');
const dataCopyDateDisplay = document.getElementById('dataCopyDateDisplay');
const advancePayment = document.getElementById('advancePayment');
const systemNo = document.getElementById('systemNo');
const driveField = document.getElementById('drive');

const itemSelect = document.getElementById('itemSelect');
const itemValue = document.getElementById('itemValue');
const addItemBtn = document.getElementById('addItemBtn');
const itemsListEl = document.getElementById('itemsList');
const cancelCreate = document.getElementById('cancelCreate');
const createJobSubmit = document.getElementById('createJobSubmit');

const payStudioName = document.getElementById('payStudioName');
const payStudioSuggestions = document.getElementById('payStudioSuggestions');
const paymentAmount = document.getElementById('paymentAmount');
const paymentMethod = document.getElementById('paymentMethod');
const paymentNote = document.getElementById('paymentNote');
const addPaymentBtn = document.getElementById('addPaymentBtn');
const recentPaymentsList = document.getElementById('recentPaymentsList');

const toastEl = document.getElementById('toast');

// state
let currentUserEmail = "";
let currentUserName = "";
let selectedCustomerId = null;
let selectedPaymentCustomerId = null;
let customersCache = null;
let studioItemsCache = [];
let currentItems = [];

// auth
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserEmail = user.email || "";
    currentUserName = user.displayName || user.email || "";
  }
});

// helpers
function showToast(msg, type="success") {
  toastEl.textContent = msg;
  toastEl.className = 'toast';
  if (type === 'error') toastEl.classList.add('error');
  toastEl.classList.add('show');
  setTimeout(() => { toastEl.classList.remove('show'); toastEl.classList.remove('error'); }, 2200);
}

tabCreate.addEventListener('click', ()=>{ tabCreate.classList.add('active'); tabPayments.classList.remove('active'); createTab.style.display='block'; paymentsTab.style.display='none'; });
tabPayments.addEventListener('click', ()=>{ tabPayments.classList.add('active'); tabCreate.classList.remove('active'); createTab.style.display='none'; paymentsTab.style.display='block'; });

backBtn.addEventListener('click', ()=> window.history.back());
refreshBtn.addEventListener('click', ()=> location.reload());
cancelCreate.addEventListener('click', ()=> window.history.back());

// job/system helpers
function parseJobNoNumber(jno) {
  if (!jno) return NaN;
  const m = jno.match(/(\d+)\s*$/);
  if (!m) return NaN;
  return parseInt(m[1],10);
}
function formatJobNo(num) {
  const prefix = "JF-";
  return `${prefix}${String(num).padStart(3,'0')}`;
}
async function getNextJobNumber() {
  try {
    const snap = await getDocs(collection(db,'jobs'));
    let maxNum = 0;
    snap.forEach(d=>{
      const data = d.data();
      const j = data.jobNo || data.job || "";
      const n = parseJobNoNumber(j);
      if (!isNaN(n) && n>maxNum) maxNum = n;
    });
    return formatJobNo(maxNum+1 || 1);
  } catch(err) { console.error(err); return formatJobNo(1); }
}
function parseSystemNum(s){ if(!s) return NaN; const m=s.match(/C-(\d+)$/i); if(!m) return NaN; return parseInt(m[1],10); }
function formatSystemNo(n){ return `C-${String(n).padStart(3,'0')}`; }
async function getNextSystemNumber(){
  try{
    const snap = await getDocs(collection(db,'jobs'));
    let max=0;
    snap.forEach(d=>{
      const s = d.data().systemNo || "";
      const n = parseSystemNum(s);
      if(!isNaN(n) && n>max) max=n;
    });
    return formatSystemNo(max+1 || 1);
  }catch(e){ console.error(e); return formatSystemNo(1); }
}
function toDisplayDDMMYYYY(isoOrDate){
  if(!isoOrDate) return "";
  const d = new Date(isoOrDate);
  const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}
function setDataCopyDateToToday(){ const iso = new Date().toISOString(); dataCopyDate.value = iso; dataCopyDateDisplay.value = toDisplayDDMMYYYY(iso); }

// customers cache & autocomplete
async function loadCustomersList(){
  if(customersCache) return customersCache;
  try{
    const snap = await getDocs(collection(db,'customers'));
    customersCache = [];
    snap.forEach(d=>{
      const data = d.data();
      customersCache.push({
        id: d.id,
        studioName: String(data.studioName || data.customerName || "").trim(),
        phone: data.phone || "",
        city: data.city || "",
        lastJobNo: data.lastJobNo || ""
      });
    });
    return customersCache;
  }catch(e){ console.error(e); return []; }
}

function renderSuggestions(list, container, clickHandler){
  container.innerHTML = "";
  if(!list.length){
    container.innerHTML = '<div class="item">No match â€” new customer will be created</div>';
    container.style.display = 'block';
    return;
  }
  list.forEach(c=>{
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<strong>${c.studioName}</strong><div style="font-size:12px;color:#999">${c.city || ""} ${c.phone ? ' â€¢ '+c.phone : ''}</div>`;
    div.addEventListener('click', ()=> clickHandler(c));
    container.appendChild(div);
  });
  container.style.display = 'block';
}
function debounce(fn, wait=180){ let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), wait); } }

// create-tab studio input
const onStudioInput = debounce(async ()=>{
  selectedCustomerId = null;
  const q = (studioName.value || "").trim();
  if(!q){ studioSuggestions.style.display='none'; return; }
  const customers = await loadCustomersList();
  const qLower = q.toLowerCase();
  const matched = customers.filter(c => c.studioName.toLowerCase().includes(qLower));
  renderSuggestions(matched.slice(0,10), studioSuggestions, async (c)=>{
    studioName.value = c.studioName;
    selectedCustomerId = c.id;
    studioSuggestions.style.display = 'none';
    await loadStudioItemsForCustomer(c.studioName);
  });
}, 150);
studioName.addEventListener('input', onStudioInput);
document.addEventListener('click', (e)=>{ if(!studioSuggestions) return; if(e.target===studioName || studioSuggestions.contains(e.target)) return; studioSuggestions.style.display='none'; });

// payments tab autocomplete
const onPayStudioInput = debounce(async ()=>{
  selectedPaymentCustomerId = null;
  const q = (payStudioName.value || "").trim();
  if(!q){ payStudioSuggestions.style.display='none'; return; }
  const customers = await loadCustomersList();
  const qLower = q.toLowerCase();
  const matched = customers.filter(c => c.studioName.toLowerCase().includes(qLower));
  renderSuggestions(matched.slice(0,10), payStudioSuggestions, (c)=>{
    payStudioName.value = c.studioName;
    selectedPaymentCustomerId = c.id;
    payStudioSuggestions.style.display = 'none';
    loadRecentPaymentsForCustomer(c.id);
  });
}, 150);
payStudioName.addEventListener('input', onPayStudioInput);
document.addEventListener('click', (e)=>{ if(!payStudioSuggestions) return; if(e.target===payStudioName || payStudioSuggestions.contains(e.target)) return; payStudioSuggestions.style.display='none'; });

// find or create customer
async function findOrCreateCustomerByName(name, jobNoForCustomer=""){
  const trimmed = String(name||"").trim();
  if(!trimmed) return {id:null, created:false};
  try{
    const q = query(collection(db,'customers'), where('studioName','==', trimmed), limit(1));
    const snap = await getDocs(q);
    if(!snap.empty){ const docSnap = snap.docs[0]; return { id: docSnap.id, created:false, data: docSnap.data() }; }
  }catch(e){ console.error(e); }
  try{
    const payload = {
      studioName: trimmed,
      customerName: trimmed,
      createdAt: serverTimestamp(),
      lastJobNo: jobNoForCustomer || "",
      lastJobDate: new Date().toISOString().split('T')[0],
      balance: 0, advanceAmount:0, totalJobs:0, totalRevenue:0, phone:'', city:''
    };
    const ref = await addDoc(collection(db,'customers'), payload);
    customersCache = null;
    await loadCustomersList();
    return { id: ref.id, created:true };
  }catch(e){ console.error('create customer error', e); return { id:null, created:false }; }
}

// load studioItems for customer
async function loadStudioItemsForCustomer(studioNameVal){
  studioItemsCache = [];
  itemSelect.innerHTML = '<option value="">Select item (customer\'s price will apply)</option>';
  if(!studioNameVal){ itemSelect.innerHTML = '<option value="">Select customer first</option>'; itemSelect.disabled=true; addItemBtn.disabled=true; return; }
  try{
    const snap = await getDocs(query(collection(db,'studioItems'), where('studioName', '==', studioNameVal)));
    snap.forEach(d=>{
      const it = d.data();
      studioItemsCache.push({
        id: d.id,
        itemName: it.itemName || 'Item',
        itemPrice: Number(it.itemPrice || it.price || 0),
        qtyMode: it.qtyMode || 'qty',
        qtyDisplay: it.qtyDisplay || ''
      });
    });
  }catch(e){ console.error(e); }
  if(!studioItemsCache.length){ itemSelect.innerHTML='<option value="">No items found for this customer</option>'; itemSelect.disabled=true; addItemBtn.disabled=true; return; }
  itemSelect.disabled=false; addItemBtn.disabled=false;
  studioItemsCache.forEach((it, idx)=>{
    const opt = document.createElement('option'); opt.value = String(idx); opt.textContent = it.itemName; opt.dataset.price = String(it.itemPrice||0); itemSelect.appendChild(opt);
  });
}

// parse qty/time
function parseQtySmart(input){
  if(!input || String(input).trim()==='') return { mode:'qty', qty:1, display:'1' };
  input = String(input).trim();
  if(input.includes(':')){
    let [h,m] = input.split(':').map(x=>parseInt(x||0,10));
    h = isNaN(h)?0:h; m = isNaN(m)?0:m;
    if(m>=60){ const extra = Math.floor(m/60); h+=extra; m = m%60; }
    const hours = h + m/60;
    return { mode:'time', qty: hours, display: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
  }
  if(input.includes('.')){
    const hours = parseFloat(input)||0; const h = Math.floor(hours); const m = Math.round((hours-h)*60);
    return { mode:'time', qty: hours, display: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
  }
  const qty = parseInt(input,10)||1;
  return { mode:'qty', qty, display: `${qty}` };
}

// items UI
function renderItemsList(){
  itemsListEl.innerHTML = '';
  if(!currentItems.length){ itemsListEl.innerHTML = '<div class="muted">No items added. You can add customer items or leave empty.</div>'; return; }
  currentItems.forEach((it,i)=>{
    const div = document.createElement('div'); div.className='item-card';
    const modeText = it.qtyMode==='time'? `Time: ${it.qtyInput || it.qtyValue + ' hr'}` : `Qty: ${it.qtyInput || it.qtyValue}`;
    div.innerHTML = `<div style="flex:1;"><strong>${it.name}</strong><div class="muted" style="font-size:13px">${modeText}</div></div><div style="margin-left:12px"><button class="delete-btn" data-idx="${i}"><i class="fas fa-times"></i></button></div>`;
    const btn = div.querySelector('.delete-btn'); btn.addEventListener('click', ()=>{ const idx = Number(btn.dataset.idx); currentItems.splice(idx,1); renderItemsList(); });
    itemsListEl.appendChild(div);
  });
}

addItemBtn.addEventListener('click', (e)=>{
  e.preventDefault();
  if(!itemSelect || itemSelect.disabled){ showToast('No items available for this customer','error'); return; }
  const idxStr = itemSelect.value; if(!idxStr){ showToast('Select an item from customer list','error'); return; }
  const idx = parseInt(idxStr,10); const base = studioItemsCache[idx]; if(!base){ showToast('Selected item not found','error'); return; }
  const input = itemValue.value.trim(); const parsed = parseQtySmart(input);
  currentItems.push({ name: base.itemName, price: Number(base.itemPrice||0), qtyMode: parsed.mode, qtyValue: parsed.qty, qtyInput: parsed.display, rowTotal: parsed.qty * Number(base.itemPrice||0) });
  itemSelect.value=''; itemValue.value=''; renderItemsList();
});

// payments: recent list loader
async function loadRecentPaymentsForCustomer(customerId){
  recentPaymentsList.innerHTML = '<div class="muted">Loading...</div>';
  try{
    const q = query(collection(db,'payments'), where('customerId','==', customerId), orderBy('createdAt','desc'), limit(10));
    const snap = await getDocs(q);
    if(snap.empty){ recentPaymentsList.innerHTML = '<div class="muted">No payments found</div>'; return; }
    recentPaymentsList.innerHTML = '';
    snap.forEach(d=>{
      const p = d.data();
      const item = document.createElement('div'); item.className='item-card';
      const date = p.createdAt && p.createdAt.toDate ? p.createdAt.toDate().toLocaleString() : (p.createdAt||'');
      item.innerHTML = `<div style="flex:1;"><strong>â‚¹${p.amount}</strong><div class="muted" style="font-size:13px">${p.method || ''} â€¢ ${p.note || ''}</div></div><div style="margin-left:12px"><small class="muted">${date}</small></div>`;
      recentPaymentsList.appendChild(item);
    });
  }catch(e){ console.error(e); recentPaymentsList.innerHTML = '<div class="muted">Error loading</div>'; }
}

// payments add handler (UPDATED: include studioName & customerName)
addPaymentBtn.addEventListener('click', async (e)=>{
  e.preventDefault();
  const amt = Number(paymentAmount.value || 0); const method = (paymentMethod.value||'cash'); const note = (paymentNote.value||'').trim();
  if(!selectedPaymentCustomerId){ showToast('Select a customer (from suggestions) first','error'); return; }
  if(!amt || amt<=0){ showToast('Enter a valid payment amount','error'); return; }
  addPaymentBtn.disabled = true;
  try{
    // determine studioName/customerName for the payment doc
    let studioNameForPayment = payStudioName.value || '';
    // if we have customersCache find display name
    if(customersCache){
      const found = customersCache.find(c=>c.id === selectedPaymentCustomerId);
      if(found && found.studioName) studioNameForPayment = found.studioName;
    }

    const payPayload = {
      customerId: selectedPaymentCustomerId,
      amount: amt,
      method,
      note,
      createdAt: serverTimestamp(),
      createdBy: currentUserEmail || currentUserName || '',
      studioName: studioNameForPayment,
      customerName: studioNameForPayment
    };
    await addDoc(collection(db,'payments'), payPayload);

    const custRef = doc(db,'customers', selectedPaymentCustomerId);
    try{
      await runTransaction(db, async (t)=>{
        const snap = await t.get(custRef);
        if(!snap.exists()){
          t.set(custRef, { studioName: payStudioName.value||'', customerName: payStudioName.value||'', createdAt: serverTimestamp(), lastJobNo:'', lastJobDate: new Date().toISOString().split('T')[0], balance:0, advanceAmount: amt, totalJobs:0, totalRevenue:0 });
        } else {
          const prev = snap.data(); const prevAdvance = Number(prev.advanceAmount||0);
          t.update(custRef, { advanceAmount: prevAdvance + amt, updatedAt: serverTimestamp() });
        }
      });
    }catch(err){ console.error('transaction update customer advance error', err); }

    showToast('Payment recorded and customer account updated');
    paymentAmount.value=''; paymentNote.value=''; loadRecentPaymentsForCustomer(selectedPaymentCustomerId);
  }catch(err){ console.error(err); showToast('Error saving payment','error'); }
  addPaymentBtn.disabled = false;
});

// create job flow
async function initCreatePage(){
  jobNo.placeholder = 'Generating...'; jobNo.value = await getNextJobNumber(); jobNo.placeholder='';
  systemNo.placeholder = 'C-001'; systemNo.value = await getNextSystemNumber();
  driveField.value = 'C';
  setDataCopyDateToToday();
  itemSelect.innerHTML = '<option value="">Select customer first</option>'; itemSelect.disabled=true; addItemBtn.disabled=true;
}
initCreatePage();

// when create-tab studioName loses focus, attempt to load items and set selectedCustomerId
studioName.addEventListener('blur', async ()=>{
  const val = (studioName.value||'').trim();
  if(!val) return;
  const customers = await loadCustomersList();
  const found = customers.find(c => c.studioName.toLowerCase() === val.toLowerCase());
  if(found){ selectedCustomerId = found.id; await loadStudioItemsForCustomer(found.studioName); } else { await loadStudioItemsForCustomer(val); }
});

// create job submit
createJobSubmit.addEventListener('click', async ()=>{
  const jNo = (jobNo.value||'').trim(); const pName = (projectName.value||'').trim(); const sName = (studioName.value||'').trim();
  const sysNo = (systemNo.value||'').trim() || await getNextSystemNumber(); const driveVal = (driveField.value||'').toUpperCase(); const adv = Number(advancePayment.value||0);
  if(!jNo || !pName || !sName){ showToast('Please fill Job No, Project Name and Studio/Customer','error'); return; }
  createJobSubmit.disabled = true;
  try{
    let customerId = selectedCustomerId;
    if(!customerId){
      const cRes = await findOrCreateCustomerByName(sName, jNo);
      customerId = cRes.id;
    }
    const todayISODate = new Date().toISOString().split('T')[0];
    const billingPayload = { jobNo: jNo, projectName: pName, customerName: sName, customerId: customerId||'', createdAt: serverTimestamp(), date: todayISODate, amount:0, advance: adv, balance:0, editorName: currentUserName||'', itemsAdded: currentItems, systemNo: sysNo, drive: driveVal };
    await addDoc(collection(db,'billing'), billingPayload);

    if(customerId){
      const custRef = doc(db,'customers', customerId);
      try{
        await runTransaction(db, async (t)=>{
          const snap = await t.get(custRef);
          if(!snap.exists()){
            t.set(custRef, { studioName: sName, customerName: sName, createdAt: serverTimestamp(), lastJobNo: jNo, lastJobDate: todayISODate, totalJobs:1, balance:0, advanceAmount: adv, totalRevenue:0 });
          } else {
            const prev = snap.data(); const newTotal = (prev.totalJobs||0)+1; t.update(custRef, { lastJobNo: jNo, lastJobDate: todayISODate, totalJobs: newTotal, updatedAt: serverTimestamp() });
          }
        });
      }catch(err){ console.error('update customer transaction error', err); }
    }

    const jobPayload = { jobNo: jNo, projectName: pName, studioName: sName, customerName: sName, customerId: customerId||'', date: todayISODate, createdAt: serverTimestamp(), addItemDate: todayISODate, dataCopyDate: dataCopyDate.value||'', dataCopyDateDisplay: dataCopyDateDisplay.value||'', totalAmount:0, advancePayment:adv, itemsAdded: currentItems, correctionsList:[], moveData:0, deleteData:0, correctionData:0, systemNo: sysNo, drive: driveVal, editorName: currentUserName||'', visibleToEmployees:false };
    await addDoc(collection(db,'jobs'), jobPayload);

    showToast('Billing + Customer updated. Job saved (hidden from employee view).');
    customersCache = null;
    setTimeout(()=> window.location.reload(), 700);
  }catch(err){ console.error('create job error', err); showToast('Error creating records','error'); createJobSubmit.disabled=false; }
});

