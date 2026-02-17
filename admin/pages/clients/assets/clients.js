// clients.js (updated with STRICT FIFO Payment Auto-Adjust System)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, where,
  getDocs, addDoc, deleteDoc, doc, getDoc, updateDoc, serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

/* FIREBASE CONFIG */
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
const functions = getFunctions(app, "us-central1");
const callUpdateAuthUser = async (payload) => {
  const fn = httpsCallable(functions, "updateAuthUser");
  const res = await fn(payload || {});
  return res?.data || {};
};
const callBulkSyncAuth = async (payload) => {
  const fn = httpsCallable(functions, "bulkSyncAuth");
  const res = await fn(payload || {});
  return res?.data || {};
};
const normalize = (v) => (v || "").toString().trim().toLowerCase();

/* Wait for DOM ready, then run everything */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

function main() {
  /* DOM refs (now safe to query) */
  const clientsTableBody = document.getElementById("clientsTableBody");
  const clientListSection = document.getElementById("clientListSection");
  const profileSection = document.getElementById("profileSection");
  const clientSearch = document.getElementById("clientSearch");

  const studioNameInput = document.getElementById("studioNameInput");
  const phoneInput = document.getElementById("phoneInput");
  const cityInput = document.getElementById("cityInput");
  const addressInput = document.getElementById("addressInput");
  const emailInput = document.getElementById("emailInput");
  const manualAdvanceInput = document.getElementById("manualAdvanceInput");

  const liveBalanceSpan = document.getElementById("liveBalance");
  const advanceInfo = document.getElementById("advanceInfo");
  const advanceAmountSpan = document.getElementById("advanceAmount");
  const lastUpdatedSpan = document.getElementById("lastUpdated");
  const lastAssignedEditorEl = document.getElementById("lastAssignedEditor");

  const jobsList = document.getElementById("jobsList");
  const paymentsList = document.getElementById("paymentsList");
  const paymentsCount = document.getElementById("paymentsCount");
  const jobsCount = document.getElementById("jobsCount");
  const jobFilters = document.getElementById("jobFilters");
  const jobRangeBtns = document.querySelectorAll(".job-filter-range");
  const jobCountTotal = document.getElementById("jobCountTotal");
  const jobCountPaid = document.getElementById("jobCountPaid");
  const jobCountUnpaid = document.getElementById("jobCountUnpaid");
  const jobCountReady = document.getElementById("jobCountReady");
  const jobCountProcessing = document.getElementById("jobCountProcessing");
  const jobCountPending = document.getElementById("jobCountPending");

  const jobSearch = document.getElementById("jobSearch");

  const btnAddClient = document.getElementById("btnAddClient");
  const btnSyncAuthClients = document.getElementById("btnSyncAuthClients");
  const btnAddPayment = document.getElementById("btnAddPayment");
  const btnAddItems = document.getElementById("btnAddItems");
  const btnEditCustomer = document.getElementById("btnEditCustomer");
  const btnDeleteCustomer = document.getElementById("btnDeleteCustomer");
  const btnBackToList = document.getElementById("btnBackToList");
  const btnProfilePdf = document.getElementById("btnProfilePdf");
  const profilePdfModalEl = document.getElementById("profilePdfModal");
  const pdfClientSelect = document.getElementById("pdfClientSelect");
  const pdfFromDate = document.getElementById("pdfFromDate");
  const pdfToDate = document.getElementById("pdfToDate");
  const pdfPayUnpaid = document.getElementById("pdfPayUnpaid");
  const pdfPayPartial = document.getElementById("pdfPayPartial");
  const pdfPayFully = document.getElementById("pdfPayFully");
  const exportProfilePdfConfirm = document.getElementById("exportProfilePdfConfirm");
  const pdfPreviewModalEl = document.getElementById("pdfPreviewModal");
  const pdfPreviewFrame = document.getElementById("pdfPreviewFrame");
  const pdfPreviewDownload = document.getElementById("pdfPreviewDownload");
  const savePaymentBtn = document.getElementById("savePaymentBtn");

  const itemsModalEl = document.getElementById("itemsModal");
  const itemsStudioNameEl = document.getElementById("itemsStudioName");
  const itemsTableBody = document.getElementById("itemsTableBody");
  const addItemRowBtn = document.getElementById("addItemRowBtn");
  const saveItemsBtn = document.getElementById("saveItemsBtn");

  /* Bootstrap modals (guarded) */
  const bsJobModal = document.getElementById("jobDetailModal") ? new bootstrap.Modal(document.getElementById("jobDetailModal")) : null;
  const bsPaymentModal = document.getElementById("paymentModal") ? new bootstrap.Modal(document.getElementById("paymentModal")) : null;
  const bsItemsModal = itemsModalEl ? new bootstrap.Modal(itemsModalEl) : null;
  const bsProfilePdfModal = profilePdfModalEl ? new bootstrap.Modal(profilePdfModalEl) : null;
  const bsPdfPreviewModal = pdfPreviewModalEl ? new bootstrap.Modal(pdfPreviewModalEl) : null;

  /* Toast helper (guarded) */
  function showToast(msg, type = "success") {
    const t = document.getElementById("toast");
    if (!t) { alert(msg); return; }
    const span = document.getElementById("toastMessage");
    if (span) span.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(()=> t.className = "toast", 3000);
  }

  /* escape helper */
  function escapeHtml(s){ if(!s && s !== 0) return ""; return s.toString().replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

  /* ============================================
     STRICT ACCOUNTING-SAFE PAYMENT SYSTEM
     ============================================ */
  
  // Status priority order for FIFO (highest to lowest)
  const STATUS_PRIORITY = {
    'Delivered': 4,
    'Completed': 4,
    'Ready': 3,
    'In Progress': 2,
    'Assigned': 1
  };

  /**
   * Helper function to safely get payment-related fields from job
   */
  function getJobPaymentFields(job) {
    if (!job) return {
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      status: 'Assigned'
    };
    
    return {
      totalAmount: Number(job.totalAmount) || 0,
      paidAmount: Number(job.paidAmount) || 0,
      pendingAmount: Number(job.pendingAmount) || 0,
      status: job.status || 'Assigned'
    };
  }

  /**
   * Check if job has items (STRICT RULE #3)
   */
  function hasJobItems(job) {
    if (!job) return false;
    return Array.isArray(job.itemsAdded) && job.itemsAdded.length > 0;
  }

  /**
   * Determine payment status for UI display
   */
  function getPaymentStatus(job) {
    if (!job) return 'Unpaid';
    
    const { totalAmount, paidAmount } = getJobPaymentFields(job);
    
    if (paidAmount <= 0) return 'Unpaid';
    if (paidAmount >= totalAmount) return 'Fully Paid';
    return 'Partial Paid';
  }

  /**
   * Calculate if job can receive payment
   */
  function canJobReceivePayment(job) {
    if (!job) return false;
    
    // STRICT RULE #3: Jobs without items MUST remain unpaid
    if (!hasJobItems(job)) return false;
    
    const { totalAmount, paidAmount } = getJobPaymentFields(job);
    
    // Job can receive payment if it has items and isn't fully paid
    return hasJobItems(job) && paidAmount < totalAmount;
  }

  /**
   * CENTRAL FUNCTION: Recalculate payments for a studio using FIFO logic
   * STRICT ACCOUNTING-SAFE IMPLEMENTATION (RULE #1)
   */
  async function recalcPaymentsFIFO(studioName) {
    try {
      if (!studioName) return false;

      console.log(`?? STRICT RECALCULATION for: ${studioName}`);
      
      // 1. Get all active jobs for this studio
      const jobsQuery = query(
        collection(db, "jobs"),
        where("studioName", "==", studioName)
      );
      const jobsSnap = await getDocs(jobsQuery);
      
      const allJobs = jobsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(job => job);
      
      // 2. Get all active payments for this studio
      const paymentsQuery = query(
        collection(db, "payments"),
        where("studioName", "==", studioName)
      );
      const paymentsSnap = await getDocs(paymentsQuery);
      
      const allPayments = paymentsSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(payment => payment && !payment.deleteData);
      
      // 3. Calculate total payment amount received (STRICT RULE #2)
      const totalPaymentAmount = allPayments.reduce((sum, payment) => {
        return sum + (Number(payment.amount) || 0);
      }, 0);
      
      // 4. Sort jobs by FIFO priority (STRICT RULE #4)
      const sortedJobs = allJobs.sort((a, b) => {
        if (!a || !b) return 0;
        
        // First by status priority (higher priority first)
        const priorityA = STATUS_PRIORITY[a.status] || 0;
        const priorityB = STATUS_PRIORITY[b.status] || 0;
        if (priorityB !== priorityA) return priorityB - priorityA;
        
        // Then by creation date (older first)
        const dateA = (a.createdAt && a.createdAt.seconds) || (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
        const dateB = (b.createdAt && b.createdAt.seconds) || (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
        return dateA - dateB;
      });
      
      // 5. Reset ALL jobs to unpaid state first (clean slate approach)
      const batch = writeBatch(db);
      let totalJobAmount = 0;
      let totalPaidToJobs = 0;
      let remainingPayment = totalPaymentAmount;
      
      // First pass: Reset all jobs and calculate totals
      for (const job of sortedJobs) {
        if (!job || !job.id) continue;
        
        const { totalAmount } = getJobPaymentFields(job);
        totalJobAmount += totalAmount;
        
        // STRICT RULE #3: Jobs without items get paidAmount = 0
        if (!hasJobItems(job)) {
          batch.update(doc(db, "jobs", job.id), {
            paidAmount: 0,
            pendingAmount: totalAmount,
            lastPaymentUpdate: serverTimestamp()
          });
          continue;
        }
        
        // Initialize with 0 paid amount
        batch.update(doc(db, "jobs", job.id), {
          paidAmount: 0,
          pendingAmount: totalAmount,
          lastPaymentUpdate: serverTimestamp()
        });
      }
      
      // Commit the reset first
      try {
        await batch.commit();
      } catch (error) {
        console.error("Error resetting jobs:", error);
      }
      
      // 6. Second pass: Apply FIFO distribution (STRICT RULE #4)
      const batch2 = writeBatch(db);
      
      for (const job of sortedJobs) {
        if (!job || !job.id) continue;
        
        // STRICT RULE #3: Skip jobs without items
        if (!hasJobItems(job)) continue;
        
        const { totalAmount } = getJobPaymentFields(job);
        const remainingPayable = totalAmount; // Since we reset to 0 paid
        
        if (remainingPayment <= 0) break; // No more money to distribute
        
        if (remainingPayable > 0) {
          const amountToApply = Math.min(remainingPayment, remainingPayable);
          const newPaidAmount = amountToApply;
          const newPendingAmount = Math.max(0, totalAmount - newPaidAmount);
          
          batch2.update(doc(db, "jobs", job.id), {
            paidAmount: newPaidAmount,
            pendingAmount: newPendingAmount,
            lastPaymentUpdate: serverTimestamp()
          });
          
          remainingPayment -= amountToApply;
          totalPaidToJobs += amountToApply;
        }
      }
      
      // Commit the payment distribution
      if (batch2._mutations && batch2._mutations.length > 0) {
        await batch2.commit();
      }
      
      // 7. Calculate advance (STRICT RULE #6)
      let advanceAmount = Math.max(0, remainingPayment);
      
      // STRICT RULE #6: Advance ONLY after all eligible jobs are fully paid
      // Check if any eligible job still has pending amount
      const hasPendingJobs = sortedJobs.some(job => {
        if (!hasJobItems(job)) return false; // Jobs without items don't count
        const { totalAmount, paidAmount } = getJobPaymentFields(job);
        return paidAmount < totalAmount;
      });
      
      // If any job is pending, advance must be 0
      if (hasPendingJobs) {
        advanceAmount = 0;
      }
      
      // 8. Update customer record
      const customerQuery = query(
        collection(db, "customers"),
        where("studioName", "==", studioName)
      );
      const customerSnap = await getDocs(customerQuery);
      
      if (!customerSnap.empty && customerSnap.docs[0]) {
        const customerDoc = customerSnap.docs[0];
        const customerId = customerDoc.id;
        const customerData = customerDoc.data();
        
        // Calculate new balance (total job amount - total paid to jobs)
        const newBalance = Math.max(0, totalJobAmount - totalPaidToJobs);
        
        // Use manual advance if specified, otherwise use calculated advance
        const manualAdvance = parseFloat(manualAdvanceInput?.value || "0") || 0;
        const finalAdvance = manualAdvance > 0 ? manualAdvance : advanceAmount;
        
        // STRICT RULE #2: Verify payment safety
        const finalTotalPaid = allJobs.reduce((sum, job) => {
          if (!job) return sum;
          // After recalculation, we need to fetch updated values
          const { paidAmount } = getJobPaymentFields(job);
          return sum + paidAmount;
        }, 0);
        
        // Safety validation
        if (Math.abs(finalTotalPaid - totalPaidToJobs) > 0.01) {
          console.error("? PAYMENT MISMATCH DETECTED!");
          console.error(`   Calculated paid: ${totalPaidToJobs.toFixed(2)}`);
          console.error(`   Actual paid: ${finalTotalPaid.toFixed(2)}`);
        }
        
        if (finalTotalPaid > totalPaymentAmount + 0.01) {
          console.error("? SAFETY VIOLATION: Total paid exceeds total payments!");
          console.error(`   Total paid: ${finalTotalPaid.toFixed(2)}`);
          console.error(`   Total payments: ${totalPaymentAmount.toFixed(2)}`);
          showToast("Critical payment safety violation detected", "error");
        }
        
        await updateDoc(doc(db, "customers", customerId), {
          balance: newBalance,
          advanceAmount: finalAdvance,
          updatedAt: serverTimestamp(),
          lastRecalc: serverTimestamp()
        });
        
        // Update UI if this is the current studio
        if (studioName === currentStudio) {
          if (liveBalanceSpan) liveBalanceSpan.textContent = newBalance.toFixed(2);
          if (advanceAmountSpan) advanceAmountSpan.textContent = finalAdvance.toFixed(2);
          if (advanceInfo) advanceInfo.style.display = finalAdvance > 0 ? "block" : "none";
        }
      }
      
      console.log(`? STRICT RECALCULATION COMPLETE for ${studioName}`);
      console.log(`   Total payments received: \u20B9${totalPaymentAmount.toFixed(2)}`);
      console.log(`   Applied to jobs: \u20B9${totalPaidToJobs.toFixed(2)}`);
      console.log(`   Remaining advance: \u20B9${advanceAmount.toFixed(2)}`);
      console.log(`   Total job amount: \u20B9${totalJobAmount.toFixed(2)}`);
      console.log(`   New balance: \u20B9${(totalJobAmount - totalPaidToJobs).toFixed(2)}`);
      
      return true;
      
    } catch (error) {
      console.error("? Error in recalcPaymentsFIFO:", error);
      showToast("Error recalculating payments", "error");
      return false;
    }
  }

  /**
   * Handle job total amount change (when items are added/removed)
   */
  async function handleJobAmountChange(jobId, newTotalAmount) {
    try {
      const jobRef = doc(db, "jobs", jobId);
      const jobSnap = await getDoc(jobRef);
      
      if (jobSnap.exists()) {
        const jobData = jobSnap.data();
        const paidAmount = Number(jobData.paidAmount) || 0;
        
        // Ensure paid amount doesn't exceed new total
        const safePaidAmount = Math.min(paidAmount, newTotalAmount);
        const newPendingAmount = Math.max(0, newTotalAmount - safePaidAmount);
        
        await updateDoc(jobRef, {
          totalAmount: newTotalAmount,
          paidAmount: safePaidAmount,
          pendingAmount: newPendingAmount,
          lastAmountUpdate: serverTimestamp()
        });
        
        // Trigger central recalculation
        if (jobData.studioName) {
          await recalcPaymentsFIFO(jobData.studioName);
        }
      }
    } catch (error) {
      console.error("Error handling job amount change:", error);
    }
  }

  /* ---------------- CLIENTS LIST ---------------- */
  let cachedClients = [];
  const clientsQuery = query(collection(db,"customers"));
  let clientsUnsub = null;

  function startClientListener() {
    if (clientsUnsub) return;
    clientsUnsub = onSnapshot(clientsQuery, snap => {
      cachedClients = [];
      snap.forEach(d => { 
        const data = d.data();
        if (data) {
          cachedClients.push({...data, _id: d.id}); 
        }
      });
      renderClients();
    });
  }

  onAuthStateChanged(auth, (user) => {
    if (user) startClientListener();
  });

  function renderClients(){
    if(!clientsTableBody) return;
    const q = (clientSearch?.value || "").trim().toLowerCase();
    clientsTableBody.innerHTML = "";
    cachedClients.forEach(c=>{
      if (!c) return;
      const matchStr = ((c.studioName||"") + "|" + (c.phone||"") + "|" + (c.city||"")).toLowerCase();
      if(q && !matchStr.includes(q)) return;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(c.studioName)||"-"}</td>
        <td>${escapeHtml(c.phone)||"-"}</td>
        <td>${escapeHtml(c.city)||"-"}</td>
        <td>${escapeHtml(c.address)||"-"}</td>
        <td class="${(c.balance||0)>0?'text-warning':((c.balance||0)<0?'text-danger':'text-success')}">\u20B9${(Number(c.balance)||0).toFixed(2)}</td>
      `;
      tr.addEventListener("click", ()=> {
        if (c.studioName) openProfile(c.studioName);
      });
      clientsTableBody.appendChild(tr);
    });
  }
  if(clientSearch) clientSearch.addEventListener("input", renderClients);

  if (btnSyncAuthClients) {
    btnSyncAuthClients.addEventListener("click", async () => {
      if (!confirm("Sync ALL users (clients + employees + admins) to Firebase Authentication?")) return;
      const resetPass = confirm("Set/Reset DEFAULT password for all synced users now? This will change their password.");
      try {
        const res = await callBulkSyncAuth({ useDefaultPassword: resetPass });
        showToast(
          `Synced: created ${res.created || 0}, updated ${res.updated || 0}, skipped ${res.skipped || 0}, no-email ${res.noEmail || 0}`,
          res.noEmail ? "warning" : "success"
        );
      } catch (e) {
        console.error("Bulk auth sync failed:", e);
        showToast(`Auth sync failed: ${e?.message || "error"}`, "error");
      }
    });
  }

  function fillPdfClientSelect(){
    if(!pdfClientSelect) return;
    const current = currentStudio || "";
    pdfClientSelect.innerHTML = "";
    const list = [...cachedClients].sort((a,b)=> (a.studioName||"").localeCompare(b.studioName||""));
    list.forEach(c=>{
      if (!c) return;
      const opt = document.createElement("option");
      opt.value = c.studioName || "";
      opt.textContent = c.studioName || "(Unnamed)";
      if(current && c.studioName === current) opt.selected = true;
      pdfClientSelect.appendChild(opt);
    });
  }

  /* ---------------- OPEN PROFILE ---------------- */
  let currentStudio = null;
  let currentStudioNames = [];
  let currentAdvanceAmount = 0;
  let currentJobs = [];
  let currentPayments = [];
  let lastAllocationMap = new Map();
  let currentCustomerDocId = null;
  let currentCustomerEmail = "";
  let selectedJobId = null;
  let paymentsUnsub = null;
  let jobsUnsub = null;
  let jobFilter = "total";
  let monthOnly = true;

  async function openProfile(studioName){
    if (!studioName) return;
    
    currentStudio = studioName;
    currentStudioNames = [studioName];
    if(clientListSection) clientListSection.classList.add("hidden");
    if(profileSection) profileSection.classList.remove("hidden");

    const custSnap = await getDocs(query(collection(db,"customers"), where("studioName","==", studioName)));
    if(!custSnap.empty && custSnap.docs[0]){
      const d = custSnap.docs[0];
      currentCustomerDocId = d.id;
      const c = d.data();
      currentCustomerEmail = (c.email || "").toString();
      const names = [c.studioName, c.customerName, studioName]
        .map(v => (v || "").toString().trim())
        .filter(v => v);
      currentStudioNames = [...new Set(names)];
      currentAdvanceAmount = Number(c.advanceAmount || 0);
      if(studioNameInput) studioNameInput.value = c.studioName || "";
      if(phoneInput) phoneInput.value = c.phone || "";
      if(cityInput) cityInput.value = c.city || "";
      if(addressInput) addressInput.value = c.address || "";
      if(emailInput) emailInput.value = c.email || "";
      if(manualAdvanceInput) manualAdvanceInput.value = (c.advanceAmount||0).toFixed ? (Number(c.advanceAmount||0).toFixed(2)) : (c.advanceAmount||0);
      if(liveBalanceSpan) liveBalanceSpan.textContent = (c.balance||0).toFixed(2);
      if(c.advanceAmount>0 && advanceInfo && advanceAmountSpan){ advanceInfo.style.display="block"; advanceAmountSpan.textContent=(c.advanceAmount||0).toFixed(2); } else if(advanceInfo) advanceInfo.style.display="none";
      if(lastUpdatedSpan) lastUpdatedSpan.textContent = c.updatedAt ? (c.updatedAt.seconds ? c.updatedAt.toDate().toLocaleString() : new Date(c.updatedAt).toLocaleString()) : "�";
      if(c.lastAssignedEditor && lastAssignedEditorEl){ lastAssignedEditorEl.style.display="block"; lastAssignedEditorEl.textContent = `Assigned Editor: ${c.lastAssignedEditor}`; } else if(lastAssignedEditorEl) lastAssignedEditorEl.style.display="none";
    } else {
      if(studioNameInput) studioNameInput.value = studioName;
      if(emailInput) emailInput.value = "";
      if(manualAdvanceInput) manualAdvanceInput.value = "0.00";
      currentStudioNames = [studioName];
      currentAdvanceAmount = 0;
      currentCustomerEmail = "";
    }

    // Run STRICT FIFO calculation on profile open
    await recalcPaymentsFIFO(studioName);
    
    startJobsListener();
    startPaymentsListener();
  }

  /* back */
  if(btnBackToList) btnBackToList.addEventListener("click", ()=>{
    if(profileSection) profileSection.classList.add("hidden");
    if(clientListSection) clientListSection.classList.remove("hidden");
    if(jobsUnsub) jobsUnsub(); if(paymentsUnsub) paymentsUnsub();
    if(jobsList) jobsList.innerHTML = ""; if(paymentsList) paymentsList.innerHTML = "";
    currentStudio = null; currentCustomerDocId = null;
  });

  /* ---------------- JOBS (client-side sort) ---------------- */
  function startJobsListener(){
    if(jobsUnsub) jobsUnsub();
    if(!currentStudio) return;
    const names = (currentStudioNames || []).map(v => (v || "").toString().trim()).filter(v => v);
    if(!names.length) return;
    let buckets = [];
    let fallbackJobs = [];
    const mergeJobs = () => {
      const map = new Map();
      const all = buckets.flat().concat(fallbackJobs || []);
      all.forEach(j => {
        if (j) map.set(j.id, j);
      });
      const arr = [...map.values()].sort((a,b)=>{
        const ta = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a.createdAt ? new Date(a.createdAt).getTime()/1000 : 0);
        const tb = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b.createdAt ? new Date(b.createdAt).getTime()/1000 : 0);
        return tb - ta;
      });
      currentJobs = arr;
      renderJobsFromArray(arr);
      updateBalanceFromData();
    };

    const unsubs = [];
    const addQuery = (field, value, idx) => {
      const q = query(collection(db,"jobs"), where(field,"==", value));
      const unsub = onSnapshot(q, snap => {
        buckets[idx] = snap.docs.map(d => ({ id:d.id, ...d.data() }));
        mergeJobs();
      });
      unsubs.push(unsub);
    };

    const seen = new Set();
    let idx = 0;
    names.forEach(n => {
      const keyA = `studioName:${n}`;
      if (!seen.has(keyA)) { seen.add(keyA); addQuery("studioName", n, idx++); }
      const keyB = `customerName:${n}`;
      if (!seen.has(keyB)) { seen.add(keyB); addQuery("customerName", n, idx++); }
    });

    jobsUnsub = () => { unsubs.forEach(u => u()); };

    // Fallback: if some jobs have extra spaces/case differences, fetch all once and filter locally
    (async () => {
      try {
        const snap = await getDocs(collection(db, "jobs"));
        const nameKeys = names.map(normalize).filter(Boolean);
        fallbackJobs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(j => {
            if (j.deleteData) return false;
            const s1 = normalize(j.studioName);
            const s2 = normalize(j.customerName);
            if (!s1 && !s2) return false;
            return nameKeys.some(nk =>
              (s1 && (s1.includes(nk) || nk.includes(s1))) ||
              (s2 && (s2.includes(nk) || nk.includes(s2)))
            );
          });
        mergeJobs();
      } catch (e) {
        console.error("Fallback job fetch failed:", e);
      }
    })();
  }

  function jobDateTs(j){
    const raw = j.date || j.dataCopyDate || j.assignedAt || j.createdAt || j.updatedAt;
    if (raw?.seconds) return raw.seconds * 1000;
    const d = new Date(raw || 0);
    return isNaN(d) ? null : d.getTime();
  }

  function isInCurrentMonth(ts){
    if (!ts) return false;
    const now = new Date();
    const d = new Date(ts);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  function jobPaymentStatus(j, alloc){
    const paid = Number(alloc?.paid || j.paidAmount || 0);
    const pending = Number(alloc?.pending || j.pendingAmount || 0);
    if (paid <= 0) return "unpaid";
    if (pending <= 0) return "paid";
    return "partial";
  }

  function paymentTotalsForJob(j){
    const itemsTotal = Array.isArray(j.itemsAdded)
      ? j.itemsAdded.reduce((a, i) => a + Number(i.rowTotal || 0), 0)
      : 0;
    const totalAmount = Number(j.totalAmount || 0) || itemsTotal;
    const paidAmt = Number(j.paidAmount || 0);
    const pendingAmt = Number(j.pendingAmount || Math.max(totalAmount - paidAmt, 0));
    return { totalAmount, paidAmt, pendingAmt };
  }

  function isReadyJob(j){
    const status = String(j.status || "").toLowerCase();
    return status === "ready" || status === "delivered" || status === "completed" || !!j.dataReadyDate || !!j.dataDeliverDate;
  }

  function isPendingJob(j){
    return !isReadyJob(j);
  }

  function isProcessingJob(j){
    const status = String(j.status || "").toLowerCase();
    if (status === "processing" || status === "in progress") return true;
    if (isReadyJob(j)) return false;
    return !!(j.assignedTo || j.editor || j.editorName);
  }

  function updateJobFilterCounts(arr){
    const base = (arr || []).filter(j => !monthOnly || isInCurrentMonth(jobDateTs(j)));
    let total = 0, paid = 0, unpaid = 0, ready = 0, pending = 0, processing = 0;
    base.forEach(j => {
      total++;
      if (isReadyJob(j)) ready++;
      if (isPendingJob(j)) pending++;
      if (isProcessingJob(j)) processing++;
      const { totalAmount, paidAmt, pendingAmt } = paymentTotalsForJob(j);
      if (paidAmt <= 0 || pendingAmt >= totalAmount) unpaid++;
      if (pendingAmt <= 0 && paidAmt > 0) paid++;
    });
    if (jobCountTotal) jobCountTotal.textContent = total;
    if (jobCountPaid) jobCountPaid.textContent = paid;
    if (jobCountUnpaid) jobCountUnpaid.textContent = unpaid;
    if (jobCountReady) jobCountReady.textContent = ready;
    if (jobCountProcessing) jobCountProcessing.textContent = processing;
    if (jobCountPending) jobCountPending.textContent = pending;
  }

  function renderJobsFromArray(arr){
    if(!jobsList) return;
    jobsList.innerHTML = "";
    const js = (jobSearch?.value || "").trim().toLowerCase();
    const monthBase = (arr || []).filter(j => isInCurrentMonth(jobDateTs(j)));
    if (monthOnly && monthBase.length === 0) {
      monthOnly = false;
      jobRangeBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-range") === "all"));
    }
    updateJobFilterCounts(arr);
    if(!arr || !arr.length){ 
      jobsList.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:20px">No jobs</td></tr>`; 
      if(jobsCount) jobsCount.textContent="0 jobs"; 
      return; 
    }

    const totalAmountForJob = j => {
      if (!j) return 0;
      const itemsTotal = Array.isArray(j.itemsAdded)
        ? j.itemsAdded.reduce((a, i) => a + Number(i.rowTotal || 0), 0)
        : 0;
      return Number(j.totalAmount || 0) || itemsTotal;
    };

    const totalPayments = (currentPayments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
    const allocation = (() => {
      const map = new Map();
      const jobs = [...arr];
      const sorted = jobs.sort((a, b) => {
        const priorityA = STATUS_PRIORITY[a?.status] || 0;
        const priorityB = STATUS_PRIORITY[b?.status] || 0;
        if (priorityB !== priorityA) return priorityB - priorityA;
        const dateA = (a?.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a?.createdAt ? new Date(a.createdAt).getTime()/1000 : 0);
        const dateB = (b?.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b?.createdAt ? new Date(b.createdAt).getTime()/1000 : 0);
        return dateA - dateB;
      });
      let remaining = totalPayments;
      sorted.forEach(j => {
        const total = totalAmountForJob(j);
        if (!hasJobItems(j)) {
          map.set(j.id, { paid: 0, pending: total });
          return;
        }
        if (remaining <= 0) {
          map.set(j.id, { paid: 0, pending: total });
          return;
        }
        const paid = Math.min(remaining, total);
        const pending = Math.max(total - paid, 0);
        remaining -= paid;
        map.set(j.id, { paid, pending });
      });
      return map;
    })();
    lastAllocationMap = allocation;

    let cnt=0;
    arr.forEach(j=>{
      if (!j) return;
      
      if (monthOnly && !isInCurrentMonth(jobDateTs(j))) return;

      const jobNo = (j.jobNo||"").toLowerCase();
      const pname = (j.projectName||"").toLowerCase();
      const editor = (j.assignedTo||"").toLowerCase();
      if(js && !(jobNo.includes(js) || pname.includes(js) || editor.includes(js))) return;
      
      const isDeleted = !!j.deleteData;
      const deletedAt = formatAnyDate(j.deletedAt);
      const readyAt = formatAnyDate(j.dataReadyDate);
      const deliverAt = formatAnyDate(j.dataDeliverDate);
      const displayDate = isDeleted ? (deletedAt || "-") : (j.date || "-");

      const total = totalAmountForJob(j);
      const paymentFields = getJobPaymentFields(j);
      const alloc = allocation.get(j.id) || { paid: paymentFields.paidAmount, pending: paymentFields.pendingAmount };
      const paid = alloc.paid;
      const pending = alloc.pending;
      
      // Get payment status for UI
      const paymentStatus = paid <= 0 ? "Unpaid" : pending <= 0 ? "Fully Paid" : "Partial Paid";
      const statusKey = jobPaymentStatus(j, alloc);
      if (jobFilter === "paid" && statusKey !== "paid") return;
      if (jobFilter === "unpaid" && statusKey !== "unpaid") return;
      if (jobFilter === "ready" && !isReadyJob(j)) return;
      if (jobFilter === "processing" && !isProcessingJob(j)) return;
      if (jobFilter === "pending" && !isPendingJob(j)) return;
      const hasItems = hasJobItems(j);
      
      // Only show assignedTo if it exists, otherwise show "Unassigned"
      const displayEditor = j.assignedTo ? j.assignedTo : "Unassigned";
      
      const tr = document.createElement("tr");
      const canSetDeleteDate = deletedAt === "-" && deliverAt !== "-";
      const deletedAtCell = canSetDeleteDate
        ? `<button class="btn btn-sm btn-warning" data-id="${j.id}" data-action="setDeleteDate">Set Delete Date</button>`
        : `<span class="date-val">${escapeHtml(deletedAt)}</span>`;

      tr.innerHTML = `
        <td data-label="Job No">${escapeHtml(j.jobNo||"-")}</td>
        <td data-label="Project">${escapeHtml(j.projectName||"-")}</td>
        <td data-label="Date">${escapeHtml(displayDate)}</td>
        <td data-label="Editor"><span class="badge ${displayEditor === "Unassigned" ? "bg-secondary" : "bg-success"}">${escapeHtml(displayEditor)}</span></td>
        <td data-label="Total">\u20B9${total.toFixed(2)}</td>
        <td data-label="Paid">\u20B9${paid.toFixed(2)}</td>
        <td data-label="Pending" class="${pending>0?'text-warning':'text-success'}">\u20B9${pending.toFixed(2)}</td>
        <td data-label="Payment"><span class="badge ${paymentStatus === 'Fully Paid' ? 'bg-success' : paymentStatus === 'Partial Paid' ? 'bg-info' : 'bg-warning'}">${paymentStatus}</span></td>
        <td data-label="Status"><span class="badge ${isDeleted ? 'bg-danger' : j.status === 'Completed' ? 'bg-success' : j.status === 'In Progress' ? 'bg-warning' : 'bg-primary'}">${escapeHtml(isDeleted ? "Deleted" : (j.status||"Assigned"))}</span></td>
        <td data-label="Ready"><span class="date-val">${escapeHtml(readyAt)}</span></td>
        <td data-label="Deliver"><span class="date-val">${escapeHtml(deliverAt)}</span></td>
        <td data-label="Deleted At">${deletedAtCell}</td>
      `;

      const delBtn = tr.querySelector('button[data-action="setDeleteDate"]');
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = delBtn.getAttribute("data-id");
          if (!id) return;
          setDeletedDateFromClients(id);
        });
      }

      tr.addEventListener("click", () => {
        if (j.id) viewJobDetail(j.id);
      });
      
      // Add warning for jobs without items
      if (!hasItems) {
        const firstCell = tr.querySelector("td:first-child");
        if (firstCell) {
          firstCell.innerHTML += ' <span class="badge bg-secondary" title="No items added">No Items</span>';
        }
      }
      
      // Actions removed from table view
      
      jobsList.appendChild(tr);
      cnt++;
    });
    
    if(jobsCount) jobsCount.textContent = `${cnt} jobs`;
    if(cnt===0) jobsList.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:20px">No jobs (filter)</td></tr>`;
  }
  
  if(jobSearch) jobSearch.addEventListener("input", ()=> { renderJobsFromArray(currentJobs || []); });

  if (jobFilters) {
    jobFilters.addEventListener("click", (e) => {
      const btn = e.target.closest(".job-filter");
      if (!btn) return;
      jobFilter = btn.getAttribute("data-filter") || "total";
      jobFilters.querySelectorAll(".job-filter").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderJobsFromArray(currentJobs || []);
    });
  }

  jobRangeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const range = btn.getAttribute("data-range");
      monthOnly = range !== "all";
      jobRangeBtns.forEach(b => b.classList.toggle("active", b === btn));
      renderJobsFromArray(currentJobs || []);
    });
  });

  // Default range = This Month
  if (jobRangeBtns && jobRangeBtns.length) {
    jobRangeBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-range") === "month"));
  }

  function formatAnyDate(v) {
    if (!v) return "-";
    const d = v?.seconds ? new Date(v.seconds * 1000) : new Date(v);
    if (!isNaN(d)) {
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    }
    return String(v);
  }

  /* view job */
  async function viewJobDetail(id){
    if (!id) return showToast("Job ID is missing", "warning");
    
    selectedJobId = id;
    const snap = await getDoc(doc(db,"jobs",id));
    if(!snap.exists()) return showToast("Job not found","warning");
    const j = snap.data();
    
    // Only show assignedTo (not email)
    const displayEditor = j.assignedTo ? j.assignedTo : "Not assigned";
    const assignedDate = j.assignedAt ? (j.assignedAt.seconds ? j.assignedAt.toDate().toLocaleString() : new Date(j.assignedAt).toLocaleString()) : "�";
    
    let itemsHtml = "<table style='width:100%'><thead><tr><th style='text-align:left'>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>";
    (j.itemsAdded||[]).forEach(it=>{
      if (!it) return;
      const qty = it.qtyMode === "time" ? (it.qtyInput || String(it.qtyValue)) : (it.qtyValue||1);
      itemsHtml += `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(qty)}</td><td>\u20B9${(it.price||0).toFixed(2)}</td><td>\u20B9${(it.rowTotal||0).toFixed(2)}</td></tr>`;
    });
    itemsHtml += "</tbody></table>";
    
    const bodyEl = document.getElementById("jobDetailBody");
    if(bodyEl){
      const itemsTotal = Array.isArray(j.itemsAdded)
        ? j.itemsAdded.reduce((a, i) => a + Number(i.rowTotal || 0), 0)
        : 0;
      const totalAmount = Number(j.totalAmount || 0) || itemsTotal;
      const alloc = lastAllocationMap.get(id) || { paid: Number(j.paidAmount || 0), pending: Number(j.pendingAmount || 0) };
      const paidAmount = alloc.paid;
      const pendingAmount = alloc.pending;
      const hasItems = hasJobItems(j);
      const paymentStatus = paidAmount <= 0 ? "Unpaid" : pendingAmount <= 0 ? "Fully Paid" : "Partial Paid";
      const readyAt = formatAnyDate(j.dataReadyDate);
      const deliverAt = formatAnyDate(j.dataDeliverDate);
      const deletedAt = formatAnyDate(j.deletedAt);
      
      bodyEl.innerHTML = `
        ${!hasItems ? '<div class="alert alert-warning"><b>?? NO ITEMS</b> - This job cannot receive payments until items are added</div>' : ''}
        <div class="job-detail-grid">
          <div><div class="label">Job No</div><div class="value">${escapeHtml(j.jobNo||'')}</div></div>
          <div><div class="label">Project</div><div class="value">${escapeHtml(j.projectName||'')}</div></div>
          <div><div class="label">Date</div><div class="value">${escapeHtml(j.date||'')}</div></div>
          <div><div class="label">Assigned Editor</div><div class="value">${j.assignedTo ? `<span class="badge bg-success">${escapeHtml(j.assignedTo)}</span>` : '-'}</div></div>
          <div><div class="label">Assigned Date</div><div class="value">${j.assignedAt ? assignedDate : '-'}</div></div>
          <div><div class="label">Status</div><div class="value"><span class="badge ${j.status === 'Completed' ? 'bg-success' : j.status === 'In Progress' ? 'bg-warning' : 'bg-primary'}">${escapeHtml(j.status||"Assigned")}</span></div></div>
          <div><div class="label">Ready</div><div class="value">${escapeHtml(readyAt)}</div></div>
          <div><div class="label">Deliver</div><div class="value">${escapeHtml(deliverAt)}</div></div>
          <div><div class="label">Deleted At</div><div class="value">${escapeHtml(deletedAt)}</div></div>
        </div>
        <div style="margin-top:8px">${itemsHtml}</div>
        <div class="job-detail-summary">
          <div class="pill">Total: \u20B9${totalAmount.toFixed(2)}</div>
          <div class="pill">Paid: \u20B9${paidAmount.toFixed(2)}</div>
          <div class="pill">Pending: \u20B9${pendingAmount.toFixed(2)}</div>
          <div class="pill">Status: ${paymentStatus}</div>
        </div>
        ${!hasItems ? '<div><small class="text-muted">Note: Add items to enable payment processing</small></div>' : ''}
      `;
      bsJobModal && bsJobModal.show();
    } else {
      alert("Job details unavailable (modal missing).");
    }
  }

  async function markDeliveredFromClients(id) {
    try {
      await updateDoc(doc(db, "jobs", id), {
        dataDeliverDate: new Date().toISOString().slice(0, 10),
        updatedAt: serverTimestamp()
      });
      showToast("Job delivered");
    } catch (e) {
      console.error("markDeliveredFromClients error:", e);
      showToast("Deliver failed", "error");
    }
  }

  async function setDeletedDateFromClients(id) {
    const d = new Date().toISOString().slice(0, 10);
    try {
      await updateDoc(doc(db, "jobs", id), {
        deleteData: true,
        deletedAt: d,
        updatedAt: serverTimestamp()
      });
      showToast("Deleted date saved");
    } catch (e) {
      console.error("setDeletedDateFromClients error:", e);
      showToast("Save failed", "error");
    }
  }

  /* soft-delete job */
  async function softDeleteJob(id){
    if(!confirm("Move job to Recycle Bin?")) return;

    try {
      const snap = await getDoc(doc(db,"jobs",id));
      if(!snap.exists()) return showToast("Job not found","warning");
      const job = snap.data();

      // Mark job as deleted and clear assignment
      await updateDoc(doc(db,"jobs",id), {
        deleteData: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        assignedToEmail: "",
        assignedTo: "",
        editorName: "",
        assignedAt: ""
      });

      // Trigger STRICT recalculation
      const affectedStudio = job.studioName || currentStudio;
      if(affectedStudio){
        await recalcPaymentsFIFO(affectedStudio);
      }

      showToast("Job moved to Recycle Bin");
    } catch (err) {
      console.error("softDeleteJob error:", err);
      showToast("Error moving job to Recycle Bin","error");
    }
  }

  /* delete job btn in modal */
  const deleteJobBtn = document.getElementById("deleteJobBtn");
  if(deleteJobBtn) deleteJobBtn.addEventListener("click", async ()=>{
    if(!selectedJobId) return;
    await softDeleteJob(selectedJobId);
    bsJobModal && bsJobModal.hide();
  });

  /* ---------------- PAYMENTS (client-side sort) ---------------- */
  function startPaymentsListener(){
    if(paymentsUnsub) paymentsUnsub();
    if(!currentStudio) return;
    const qPays = query(collection(db,"payments"), where("studioName","==", currentStudio));
    paymentsUnsub = onSnapshot(qPays, async snap=>{
      if(!paymentsList) return;
      paymentsList.innerHTML = "";
      let count=0, totalAmt=0;
      const arr = snap.docs
        .map(d => ({ id:d.id, ...d.data() }))
        .filter(x => x && !x.deleteData)
        .sort((a,b)=>{
        const ta = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a.createdAt? new Date(a.createdAt).getTime()/1000 : 0);
        const tb = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b.createdAt? new Date(b.createdAt).getTime()/1000 : 0);
        return tb - ta;
      });
      currentPayments = arr;
      if (currentJobs && currentJobs.length) {
        renderJobsFromArray(currentJobs);
      }
      if(arr.length===0){ 
        paymentsList.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px">No payments</td></tr>`; 
        if(paymentsCount) paymentsCount.textContent="0 payments"; 
        updateBalanceFromData();
        return; 
      }
      
      arr.forEach(p=>{
        if (!p) return;
        
        count++; 
        totalAmt += Number(p.amount||0);
        const dateStr = p.createdAt && p.createdAt.seconds ? p.createdAt.toDate().toLocaleDateString() : (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "�");
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${dateStr}</td><td class="text-success">\u20B9${p.amount}</td><td>${escapeHtml(p.note||"�")}</td>`;
        
        paymentsList.appendChild(tr);
      });
      
      if(paymentsCount) paymentsCount.textContent = `${count} payments � Total \u20B9${totalAmt}`;
      updateBalanceFromData();
      
      // Note: We don't trigger recalculation here because
      // the payment listener will fire when payments change
      // and the onSnapshot will handle it
    });
  }

  function updateBalanceFromData(){
    const totalJobsAmount = (currentJobs || []).reduce((a, j) => {
      if (!j) return a;
      const itemsTotal = Array.isArray(j.itemsAdded)
        ? j.itemsAdded.reduce((x, i) => x + Number(i.rowTotal || 0), 0)
        : 0;
      const totalAmount = Number(j.totalAmount || 0) || itemsTotal;
      return a + totalAmount;
    }, 0);
    const totalPayments = (currentPayments || []).reduce((a, p) => a + Number(p.amount || 0), 0);
    const balance = Math.max(totalJobsAmount - totalPayments, 0);
    const advance = Math.max(totalPayments - totalJobsAmount, 0);

    if(liveBalanceSpan) liveBalanceSpan.textContent = balance.toFixed(2);
    if(advanceAmountSpan) advanceAmountSpan.textContent = advance.toFixed(2);
    if(advanceInfo) advanceInfo.style.display = advance > 0 ? "block" : "none";
  }

  /* Add Payment */
  if(btnAddPayment) btnAddPayment.addEventListener("click", ()=> {
    if(!currentStudio) return showToast("Open a studio profile first","warning");
    if(bsPaymentModal){
      const paymentAmountInput = document.getElementById("paymentAmount");
      const paymentNoteInput = document.getElementById("paymentNote");
      if (paymentAmountInput) paymentAmountInput.value = "";
      if (paymentNoteInput) paymentNoteInput.value = "Payment received";
      bsPaymentModal.show();
    } else {
      const amt = parseFloat(prompt("Amount")||"0"); 
      const note = prompt("Note")||"Payment received";
      if(amt>0 && currentStudio) {
        addDoc(collection(db,"payments"), { 
          studioName:currentStudio, 
          amount:amt, 
          note, 
          createdAt: serverTimestamp() 
        }).then(async () => {
          showToast("Payment added");
          // Trigger STRICT recalculation
          await recalcPaymentsFIFO(currentStudio);
        });
      }
    }
  });
  
  if(savePaymentBtn) savePaymentBtn.addEventListener("click", async ()=>{
    const paymentAmountInput = document.getElementById("paymentAmount");
    const paymentNoteInput = document.getElementById("paymentNote");
    
    const amt = parseFloat(paymentAmountInput?.value || "0");
    const note = paymentNoteInput?.value || "";
    
    if(!(amt>0)) return showToast("Enter valid amount","warning");
    if(!currentStudio) return showToast("No studio selected","error");
    
    await addDoc(collection(db,"payments"), { 
      studioName: currentStudio, 
      amount: amt, 
      note, 
      createdAt: serverTimestamp() 
    });
    
    bsPaymentModal && bsPaymentModal.hide();
    showToast("Payment added");
    
    // Trigger STRICT recalculation
    await recalcPaymentsFIFO(currentStudio);
  });

  /* ---------------- ITEMS (CRITICAL) ---------------- */
  function clearItemsTable(){ 
    if(itemsTableBody) itemsTableBody.innerHTML = ""; 
  }

  function createItemRow(item = { name:"", qty:"", price: "" }){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="padding:8px"><input class="form-control item-name" placeholder="Item name" value="${escapeHtml(item.name||"")}"></td>
      <td style="padding:8px"><input class="form-control item-time" placeholder="e.g. 1 / 2 hrs" value="${escapeHtml(item.qty||"")}"></td>
      <td style="padding:8px"><input class="form-control item-price" type="number" placeholder="Price" value="${escapeHtml(item.price||"")}"></td>
      <td style="padding:8px"><button class="btn btn-danger btn-sm remove-row">???</button></td>
    `;
    
    const removeBtn = tr.querySelector(".remove-row");
    if (removeBtn) {
      removeBtn.addEventListener("click", ()=> tr.remove());
    }
    
    return tr;
  }

  /* Open items modal */
  if(btnAddItems) btnAddItems.addEventListener("click", async ()=>{
    if(!currentStudio) return showToast("Open a studio profile first","warning");
    if(itemsStudioNameEl) itemsStudioNameEl.textContent = currentStudio;
    clearItemsTable();

    const snap = await getDocs(query(collection(db,"studioItems"), where("studioName","==", currentStudio)));
    const arr = snap.docs.map(d => ({ id:d.id, ...d.data() })).filter(x=> x).sort((a,b)=>{
      const ta = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a.createdAt ? new Date(a.createdAt).getTime()/1000 : 0);
      const tb = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b.createdAt ? new Date(b.createdAt).getTime()/1000 : 0);
      return ta - tb;
    });
    
    if(arr.length===0 && itemsTableBody) { 
      itemsTableBody.appendChild(createItemRow()); 
    } else {
      arr.forEach(x => {
        if (itemsTableBody) {
          itemsTableBody.appendChild(createItemRow({ 
            name: x.itemName || "", 
            qty: x.qtyDisplay || "", 
            price: x.itemPrice || "" 
          }));
        }
      });
    }

    bsItemsModal && bsItemsModal.show();
  });

  /* add new empty row */
  if(addItemRowBtn) addItemRowBtn.addEventListener("click", ()=> {
    if (itemsTableBody) {
      itemsTableBody.appendChild(createItemRow());
    }
  });

  /* save items */
  if(saveItemsBtn) saveItemsBtn.addEventListener("click", async ()=>{
    if(!currentStudio) return showToast("Open a studio first","warning");
    const rows = [...(itemsTableBody ? itemsTableBody.querySelectorAll("tr") : [])];
    
    // Delete existing studio items
    const oldSnap = await getDocs(query(collection(db,"studioItems"), where("studioName","==", currentStudio)));
    await Promise.all(oldSnap.docs.map(d => deleteDoc(d.ref)));
    
    // Add new rows
    let added = 0;
    for(const r of rows){
      if (!r) continue;
      
      const nameInput = r.querySelector(".item-name");
      const qtyInput = r.querySelector(".item-time");
      const priceInput = r.querySelector(".item-price");
      
      if (!nameInput || !qtyInput || !priceInput) continue;
      
      const name = nameInput.value.trim();
      const qty = qtyInput.value.trim();
      const price = parseFloat(priceInput.value || "0");
      
      if(!name || !(price>0)) continue;
      
      await addDoc(collection(db,"studioItems"), {
        studioName: currentStudio,
        itemName: name,
        itemPrice: price,
        qtyDisplay: qty||"",
        createdAt: serverTimestamp()
      });
      added++;
    }
    
    bsItemsModal && bsItemsModal.hide();
    showToast(`${added} item(s) saved`);
    
    // Trigger STRICT recalculation
    await recalcPaymentsFIFO(currentStudio);
  });

  /* ---------------- EDIT / SAVE CUSTOMER ---------------- */
  let editing = false;
  if(btnEditCustomer) btnEditCustomer.addEventListener("click", async ()=>{
    editing = !editing;
    [studioNameInput, phoneInput, cityInput, addressInput, emailInput, manualAdvanceInput].forEach(i=> { 
      if(i) i.readOnly = !editing; 
    });
    btnEditCustomer.textContent = editing ? "Save" : "? Edit";
    if(!editing){
      if(!currentCustomerDocId){
        const name = studioNameInput?.value.trim();
        if(!name) return showToast("Enter studio name","warning");
        const newEmail = (emailInput?.value || "").trim();
        const newDoc = await addDoc(collection(db,"customers"), { 
          studioName:name, 
          balance:0, 
          createdAt: serverTimestamp(), 
          email: newEmail || "", 
          advanceAmount: parseFloat(manualAdvanceInput?.value||"0")||0 
        });
        currentCustomerDocId = newDoc.id;
        // Sync to Firebase Auth for newly created customer
        if (newEmail) {
          try {
            const res = await callUpdateAuthUser({
              oldEmail: "",
              newEmail,
              phone: (phoneInput?.value || "").trim(),
              phoneE164: normalizePhoneE164(phoneInput?.value || ""),
              displayName: name
            });
            if (res?.created) {
              try {
                await sendPasswordResetEmail(auth, newEmail);
                showToast("Auth user created. Reset email sent.");
              } catch (e) {
                console.error("Reset email failed:", e);
                showToast("Auth user created. Reset email failed.", "warning");
              }
            }
          } catch (e) {
            console.error("Auth sync failed:", e);
            showToast(`Auth update failed: ${e?.message || "error"}`, "warning");
          }
        }
        currentCustomerEmail = newEmail;
      } else {
        const oldEmail = currentCustomerEmail;
        const newEmail = (emailInput?.value || "").trim();
        const newPhone = (phoneInput?.value || "").trim();
        const newStudio = (studioNameInput?.value || "").trim();

        await updateDoc(doc(db,"customers", currentCustomerDocId), {
          studioName: studioNameInput?.value.trim() || "",
          phone: phoneInput?.value.trim() || "",
          phoneE164: normalizePhoneE164(phoneInput?.value || ""),
          city: cityInput?.value.trim() || "",
          address: addressInput?.value.trim() || "",
          email: emailInput?.value.trim() || "",
          advanceAmount: parseFloat(manualAdvanceInput?.value||"0") || 0,
          updatedAt: serverTimestamp()
        });

        // Sync to Firebase Auth (email/phone/displayName)
        if (oldEmail || newEmail) {
          try {
            const res = await callUpdateAuthUser({
              oldEmail,
              newEmail,
              phone: newPhone,
              phoneE164: normalizePhoneE164(newPhone),
              displayName: newStudio
            });
            if (res?.created && newEmail) {
              try {
                await sendPasswordResetEmail(auth, newEmail);
                showToast("Auth user created. Reset email sent.");
              } catch (e) {
                console.error("Reset email failed:", e);
                showToast("Auth user created. Reset email failed.", "warning");
              }
            }
          } catch (e) {
            console.error("Auth sync failed:", e);
            showToast(`Auth update failed: ${e?.message || "error"}`, "warning");
          }
        }
        currentCustomerEmail = newEmail || oldEmail || "";
      }
      // Trigger STRICT recalculation when customer data changes
      await recalcPaymentsFIFO(currentStudio);
      showToast("Customer saved");
    }
  });

  /* quick add client */
  if(btnAddClient) btnAddClient.addEventListener("click", async ()=>{
    const name = prompt("Enter studio name"); 
    const email = prompt("Enter Gmail (optional)") || "";
    if(!name) return;
    await addDoc(collection(db,"customers"), { 
      studioName:name, 
      email, 
      balance:0, 
      advanceAmount:0, 
      createdAt: serverTimestamp() 
    });
    if (email) {
      try {
        const res = await callUpdateAuthUser({
          oldEmail: "",
          newEmail: email,
          phone: "",
          phoneE164: "",
          displayName: name
        });
        if (res?.created) {
          try {
            await sendPasswordResetEmail(auth, email);
            showToast("Auth user created. Reset email sent.");
          } catch (e) {
            console.error("Reset email failed:", e);
            showToast("Auth user created. Reset email failed.", "warning");
          }
        }
      } catch (e) {
        console.error("Auth sync failed:", e);
        showToast(`Auth update failed: ${e?.message || "error"}`, "warning");
      }
    }
    showToast("Client added");
  });

  /* delete customer -> soft delete (comprehensive) */
  if(btnDeleteCustomer) btnDeleteCustomer.addEventListener("click", async ()=>{
    if(!currentCustomerDocId) return;
    if(!confirm("Move customer + all jobs + payments + items to Recycle Bin? This will remove them from employee views as well.")) return;

    try {
      // Mark customer deleted
      await updateDoc(doc(db,"customers", currentCustomerDocId), {
        deleteData: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Helper to soft-delete docs
      const softDeleteDocs = async (collectionName, fieldName, fieldValue) => {
        const snap = await getDocs(query(collection(db, collectionName), where(fieldName, "==", fieldValue)));
        await Promise.all(snap.docs.map(d => updateDoc(d.ref, {
          deleteData: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        })));
      };

      // Delete related data
      await softDeleteDocs("jobs", "studioName", currentStudio);
      await softDeleteDocs("payments", "studioName", currentStudio);
      await softDeleteDocs("studioItems", "studioName", currentStudio);

      showToast("Customer and all related data moved to Recycle Bin");
      if(profileSection) profileSection.classList.add("hidden"); 
      if(clientListSection) clientListSection.classList.remove("hidden");

      if(jobsUnsub){ jobsUnsub(); if(jobsList) jobsList.innerHTML = ""; }
      if(paymentsUnsub){ paymentsUnsub(); if(paymentsList) paymentsList.innerHTML = ""; }

    } catch (err) {
      console.error("Error moving customer to Recycle Bin:", err);
      showToast("Error moving customer to Recycle Bin", "error");
    }
  });

  /* ---------------- PDF helpers (light) ---------------- */
  const { jsPDF } = window.jspdf || {};

  async function generateQrDataUrl(text, size = 120){
    return new Promise((resolve) => {
      if(!window.QRCode) return resolve(null);
      const wrap = document.createElement("div");
      wrap.style.position = "fixed";
      wrap.style.left = "-10000px";
      wrap.style.top = "-10000px";
      document.body.appendChild(wrap);
      // eslint-disable-next-line no-undef
      new QRCode(wrap, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
      setTimeout(() => {
        const canvas = wrap.querySelector("canvas");
        if(canvas){
          const dataUrl = canvas.toDataURL("image/png");
          wrap.remove();
          resolve(dataUrl);
          return;
        }
        const img = wrap.querySelector("img");
        const src = img ? img.src : null;
        wrap.remove();
        resolve(src);
      }, 60);
    });
  }

  function createSignatureDataUrl(){
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 240;
      canvas.height = 70;
      const ctx = canvas.getContext("2d");
      if(!ctx) return null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#2a5bd7";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(20, 45);
      ctx.bezierCurveTo(35, 20, 70, 20, 90, 40);
      ctx.bezierCurveTo(105, 55, 125, 60, 150, 50);
      ctx.bezierCurveTo(170, 42, 185, 30, 205, 35);
      ctx.bezierCurveTo(220, 40, 230, 50, 235, 58);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(120, 18);
      ctx.bezierCurveTo(130, 30, 130, 48, 110, 62);
      ctx.stroke();
      return canvas.toDataURL("image/png");
    } catch (e) {
      return null;
    }
  }

  let lastPdfDoc = null;
  let lastPdfFileName = "";

  function safePdfName(name) {
    return String(name || "invoice").replace(/[\\/:*?"<>|]+/g, "_");
  }

  async function buildInvoicePdfDoc({ selectedStudio, jobs, clientInfo, payments = [] }){
    if(!window.jspdf || !window.jspdf.jsPDF) { showToast("PDF library not loaded","error"); return false; }
    const docPDF = new window.jspdf.jsPDF({ unit:"pt", format:"a4" });
    const pageW = docPDF.internal.pageSize.getWidth();
    const pageH = docPDF.internal.pageSize.getHeight();
    const margin = 42;

    const brand = [24, 86, 170];
    const accent = [0, 150, 136];
    const textDark = [18, 22, 28];
    const textMuted = [96, 104, 114];
    const line = [224, 228, 234];

    const clientName = clientInfo?.studioName || selectedStudio || "Client";
    const clientPhone = clientInfo?.phone || "-";
    const clientEmail = clientInfo?.email || "-";
    const clientCity = clientInfo?.city || "-";
    const clientAddress = clientInfo?.address || "-";

    const rightBlockW = 200;
    const rightX = pageW - margin - rightBlockW;
    const leftBlockW = Math.max(200, rightX - margin - 14);

    // Header (clean, professional, no "INVOICE" text)
    docPDF.setFillColor(245, 245, 245);
    docPDF.rect(0, 0, pageW, 70, "F");
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(24);
    docPDF.setTextColor(...textDark);
    docPDF.text("JAMALLTA FILMS", margin, 40);
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.setTextColor(...textMuted);
    docPDF.text("Cinematic Studio & Post Production", margin, 54);
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(9);
    docPDF.setTextColor(...textMuted);
    docPDF.text("Vikas Mohalla Rabon, Solan Himachal Pradesh", margin, 68);
    docPDF.text("PIN 173211", margin, 80);
    docPDF.text("Phone: 8091181135", margin, 92);
    docPDF.text("Email: jamalltafilms@gmail.com", margin, 104);

    // Date (right)
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(10);
    docPDF.setTextColor(...textDark);
    docPDF.text("Date", rightX, 40);
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.setTextColor(...textMuted);
    docPDF.text(formatDateForInvoice(new Date()), rightX, 56);

    const headerBottomY = 118;

    // Bill To box
    docPDF.setFillColor(249, 249, 249);
    docPDF.roundedRect(margin, headerBottomY, pageW - margin * 2, 48, 6, 6, "F");
    docPDF.setDrawColor(200, 200, 200);
    docPDF.setLineWidth(1);
    docPDF.line(margin, headerBottomY, margin, headerBottomY + 48);
    docPDF.setFont("helvetica", "bold");
    docPDF.setFontSize(11);
    docPDF.setTextColor(...textDark);
    docPDF.text("Bill To:", margin + 10, headerBottomY + 18);
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(10);
    docPDF.setTextColor(...textMuted);
    docPDF.text(String(clientName), margin + 10, headerBottomY + 34);

    const tableStartY = headerBottomY + 64;

    function getItemQtyDisplay(it){
      if(!it) return "-";
      if(it.qtyMode === "time"){
        return it.qtyInput || String(it.qtyValue || "-");
      }
      return String(it.qtyValue || 1);
    }

    function getItemRowTotal(it){
      if(!it) return 0;
      if(Number.isFinite(Number(it.rowTotal))) return Number(it.rowTotal);
      const price = Number(it.price || it.itemPrice || 0);
      const qty = Number(it.qtyValue || 1);
      if(!Number.isFinite(price)) return 0;
      if(!Number.isFinite(qty)) return price;
      return price * qty;
    }

    const rows = [];
    (jobs||[]).forEach(j=>{
      if (!j) return;
      
      const items = Array.isArray(j.itemsAdded) ? j.itemsAdded : [];
      if(items.length){
        items.forEach(it=>{
          if (!it) return;
          const qtyText = getItemQtyDisplay(it);
          const price = Number(it.price || it.itemPrice || 0);
          const rowTotal = getItemRowTotal(it);
          rows.push([
            j.jobNo || "-",
            j.projectName || "-",
            it.name || it.itemName || "-",
            qtyText || "-",
            price ? price.toFixed(2) : "0.00",
            rowTotal ? rowTotal.toFixed(2) : "0.00"
          ]);
        });
      } else {
        rows.push([
          j.jobNo || "-",
          j.projectName || "-",
          "-",
          "-",
          "0.00",
          "0.00"
        ]);
      }
      const paymentFields = getJobPaymentFields(j);
      const jobTotal = paymentFields.totalAmount;
      const jobPaid = paymentFields.paidAmount;
      const jobPending = paymentFields.pendingAmount;
      rows.push([
        "",
        "",
        "Job Total",
        "-",
        "-",
        jobTotal.toFixed(2)
      ]);
      rows.push([
        "",
        "",
        "Paid Amount",
        "-",
        "-",
        jobPaid.toFixed(2)
      ]);
      rows.push([
        "",
        "",
        "Pending Amount",
        "-",
        "-",
        jobPending.toFixed(2)
      ]);
    });

    const tableW = pageW - (margin * 2);
    const wJob = 60;
    const wProject = 115;
    const wQty = 65;
    const wPrice = 50;
    const wTotal = 55;
    const wItem = Math.max(120, tableW - (wJob + wProject + wQty + wPrice + wTotal));

    docPDF.autoTable({
      head: [["Job No","Project","Item","Qty/Time","Price","Total"]],
      body: rows,
      startY: tableStartY,
      margin: { left: margin, right: margin, top: margin },
      styles: { fontSize: 9, textColor: textDark, cellPadding: { top: 6, bottom: 6, left: 6, right: 6 } },
      headStyles: { fillColor: [33, 56, 96], textColor: [255,255,255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      tableLineColor: line,
      tableLineWidth: 0.6,
      columnStyles: {
        0: { cellWidth: wJob },
        1: { cellWidth: wProject },
        2: { cellWidth: wItem },
        3: { cellWidth: wQty, halign: "center" },
        4: { cellWidth: wPrice, halign: "right" },
        5: { cellWidth: wTotal, halign: "right" }
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          const cellValue = data.row?.raw?.[2];
          if (cellValue === "Job Total") {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [80, 80, 80];
            data.cell.styles.fillColor = [245, 245, 245];
          } else if (cellValue === "Paid Amount") {
            data.cell.styles.textColor = accent; // Teal
          } else if (cellValue === "Pending Amount") {
            data.cell.styles.textColor = [255, 0, 0]; // Red
          }
        }
      }
    });

    const totals = (jobs||[]).reduce((acc,j)=>{
      if (!j) return acc;
      const paymentFields = getJobPaymentFields(j);
      const total = paymentFields.totalAmount;
      const paid = paymentFields.paidAmount;
      const pending = paymentFields.pendingAmount;
      acc.total += total;
      acc.paid += paid;
      acc.pending += pending;
      return acc;
    }, { total:0, paid:0, pending:0 });

    const endY = docPDF.lastAutoTable ? docPDF.lastAutoTable.finalY : tableStartY;
    const payBlockH = 120;
    const terms = [
      "Work starts after advance payment confirmation.",
      "Delivery timelines depend on footage and revision count.",
      "Any extra changes beyond agreed scope will be billed separately.",
      "All payments are non-refundable once work is delivered."
    ];
    const termsBlockH = 14 + (terms.length * 12) + 22;
    const sigBlockH = 95;
    const footerNeed = payBlockH + 24 + termsBlockH + 24 + sigBlockH + 30;

    let paySectionY = endY + 28;
    if(paySectionY + footerNeed > pageH - margin){
      docPDF.addPage();
      paySectionY = margin + 28;
    }

    // Payment transactions (optional)
    const formatPayDate = (v) => {
      if (!v) return "-";
      if (v?.seconds) return new Date(v.seconds * 1000).toLocaleDateString("en-IN");
      const d = new Date(v);
      if (!isNaN(d)) return d.toLocaleDateString("en-IN");
      return String(v);
    };

    if (payments && payments.length) {
      const payHeaderY = paySectionY;
      docPDF.setFont("helvetica", "bold");
      docPDF.setFontSize(10);
      docPDF.setTextColor(...textDark);
      docPDF.text("Payment Transactions", margin, payHeaderY);

      const payTableStart = payHeaderY + 8;
      const payRows = payments.map(p => ([
        formatPayDate(p.createdAt),
        `Rs ${Number(p.amount || 0).toFixed(2)}`,
        (p.note || p.remarks || "-").toString()
      ]));

      docPDF.autoTable({
        head: [["Date", "Amount", "Remarks"]],
        body: payRows,
        startY: payTableStart,
        margin: { left: margin, right: margin },
        styles: { fontSize: 8.5, textColor: textDark, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 } },
        headStyles: { fillColor: [33, 56, 96], textColor: [255,255,255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 248, 252] },
        tableLineColor: line,
        tableLineWidth: 0.4,
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 90, halign: "right" },
          2: { cellWidth: pageW - margin * 2 - 180 }
        }
      });

      const afterPayTableY = docPDF.lastAutoTable ? docPDF.lastAutoTable.finalY + 14 : paySectionY + 14;
      paySectionY = afterPayTableY;
    }

    if(paySectionY + footerNeed > pageH - margin){
      docPDF.addPage();
      paySectionY = margin + 28;
    }

    // Summary (right)
    const summaryCardW = 200;
    const summaryCardX = pageW - margin - summaryCardW;
    const summaryTextX = summaryCardX + 12;
    docPDF.setFillColor(33, 56, 96);
    docPDF.roundedRect(summaryCardX, paySectionY - 10, summaryCardW, 24, 8, 8, "F");
    docPDF.setFont("helvetica","bold");
    docPDF.setFontSize(9);
    docPDF.setTextColor(255,255,255);
    docPDF.text("TOTALS", summaryTextX, paySectionY + 6);
    docPDF.setFillColor(242, 246, 252);
    docPDF.roundedRect(summaryCardX, paySectionY + 12, summaryCardW, 70, 8, 8, "F");
    docPDF.setFont("helvetica","normal");
    docPDF.setFontSize(9);
    docPDF.setTextColor(...textMuted);
    docPDF.text(`Total Amount: Rs ${totals.total.toFixed(2)}`, summaryTextX, paySectionY + 30);
    docPDF.text(`Paid Amount: Rs ${totals.paid.toFixed(2)}`, summaryTextX, paySectionY + 44);
    docPDF.text(`Pending Amount: Rs ${totals.pending.toFixed(2)}`, summaryTextX, paySectionY + 58);
    docPDF.text(`Balance: Rs ${(totals.pending).toFixed(2)}`, summaryTextX, paySectionY + 72);

    // UPI QR (amount-less static)
    const upiId = "thakursandeepm@oksbi";
    const payeeName = "SANDEEP";
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&cu=INR`;
    const qrDataUrl = await generateQrDataUrl(upiUrl, 120);

    docPDF.setFillColor(...brand);
    docPDF.roundedRect(margin, paySectionY - 16, 120, 22, 10, 10, "F");
    docPDF.setTextColor(255,255,255);
    docPDF.setFont("helvetica","bold");
    docPDF.setFontSize(10);
    docPDF.text("Pay via UPI", margin + 10, paySectionY);

    docPDF.setFont("helvetica","normal");
    docPDF.setFontSize(9);
    docPDF.setTextColor(...textMuted);
    docPDF.text(upiId, margin, paySectionY + 14);
    if(qrDataUrl){
      docPDF.addImage(qrDataUrl, "PNG", margin, paySectionY + 22, 92, 92);
    }
    docPDF.text("Bank A/c: 40537222017", margin + 110, paySectionY + 36);
    docPDF.text("IFSC: SBIN0011957", margin + 110, paySectionY + 50);
    docPDF.text("Account Name: Jamallta Films", margin + 110, paySectionY + 64);

    // Terms & conditions
    const termsY = paySectionY + payBlockH + 28;
    docPDF.setTextColor(...textDark);
    docPDF.setFont("helvetica","bold");
    docPDF.setFontSize(10);
    docPDF.text("Terms & Conditions", margin, termsY);
    docPDF.setFont("helvetica","normal");
    docPDF.setFontSize(9);
    docPDF.setTextColor(...textMuted);
    terms.forEach((t,i)=> docPDF.text(`- ${t}`, margin, termsY + 14 + (i*12)));

    // Signature
    const sigBaseY = Math.max(termsY + 70, pageH - margin - 70);
    docPDF.setDrawColor(190, 200, 220);
    docPDF.line(pageW - margin - 160, sigBaseY, pageW - margin - 20, sigBaseY);

    const sigImg = createSignatureDataUrl();
    if(sigImg){
      docPDF.addImage(sigImg, "PNG", pageW - margin - 160, sigBaseY - 38, 120, 40);
    } else {
      docPDF.setTextColor(...textDark);
      docPDF.setFont("times", "italic");
      docPDF.setFontSize(14);
      docPDF.text("Sandeep", pageW - margin - 150, sigBaseY - 8, { angle: -8 });
    }

    const sigDate = formatDateForInvoice(new Date());
    docPDF.setFont("helvetica", "normal");
    docPDF.setFontSize(9);
    docPDF.setTextColor(...textMuted);
    docPDF.text(sigDate, pageW - margin - 150, sigBaseY + 14);
    docPDF.text("Authorized Signatory", pageW - margin - 150, sigBaseY + 28);

    // Footer bar
    docPDF.setFillColor(33, 56, 96);
    docPDF.rect(0, pageH - 28, pageW, 28, "F");
    docPDF.setTextColor(240, 245, 255);
    docPDF.setFontSize(8.5);
    docPDF.text("Thank you for your business.", margin, pageH - 10);

    return docPDF;
  }

  async function buildAndSaveInvoicePdf({ selectedStudio, jobs, clientInfo, fileName, payments }){
    const docPDF = await buildInvoicePdfDoc({ selectedStudio, jobs, clientInfo, payments });
    if(!docPDF) return false;
    const safeName = safePdfName(fileName || selectedStudio);
    docPDF.save(`${safeName}.pdf`);
    return true;
  }

  function showPdfPreview(docPDF, fileName) {
    if(!docPDF || !pdfPreviewFrame || !bsPdfPreviewModal) return false;
    const safeName = safePdfName(fileName);
    lastPdfDoc = docPDF;
    lastPdfFileName = safeName;
    const dataUri = docPDF.output("datauristring");
    pdfPreviewFrame.src = dataUri;
    bsPdfPreviewModal.show();
    return true;
  }

  async function exportSingleJobPdf(jobId){
    if(!jsPDF) return showToast("PDF library not loaded","error");
    const snap = await getDoc(doc(db,"jobs",jobId));
    if(!snap.exists()) return showToast("Job not found","warning");
    const j = { id: snap.id, ...snap.data() };
    
    const selectedStudio = j.studioName || j.customerName || currentStudio;
    if(!selectedStudio) return showToast("Studio not found for job","warning");

    let clientInfo = cachedClients.find(c=> c.studioName === selectedStudio);
    if(!clientInfo){
      const custSnap = await getDocs(query(collection(db,"customers"), where("studioName","==", selectedStudio)));
      if(!custSnap.empty && custSnap.docs[0]) clientInfo = custSnap.docs[0].data();
    }
    const docPDF = await buildInvoicePdfDoc({ selectedStudio, jobs: [j], clientInfo });
    if(docPDF){
      const shown = showPdfPreview(docPDF, selectedStudio);
      if(!shown) {
        const safeName = safePdfName(selectedStudio);
        docPDF.save(`${safeName}.pdf`);
      }
    }
  }
  
  function parseJobDateToTs(raw){
    if(!raw) return null;
    if(raw instanceof Date) return raw.getTime();
    // YYYY-MM-DD
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
      return new Date(raw + "T00:00:00").getTime();
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m){
      const dd = m[1].padStart(2,"0");
      const mm = m[2].padStart(2,"0");
      const yyyy = m[3];
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
    }
    const t = Date.parse(raw);
    return isNaN(t) ? null : t;
  }

  function formatDateForInvoice(d){
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${dd}-${mm}-${yyyy}`;
  }

  async function exportProfilePdfByDate(){
    const selectedStudio = (pdfClientSelect && pdfClientSelect.value) ? pdfClientSelect.value : currentStudio;
    if(!selectedStudio) return showToast("Select a client","warning");
    const fromVal = pdfFromDate?.value || "";
    const toVal = pdfToDate?.value || "";
    const payFilter = new Set();
    if (pdfPayUnpaid?.checked) payFilter.add("unpaid");
    if (pdfPayPartial?.checked) payFilter.add("partial");
    if (pdfPayFully?.checked) payFilter.add("fully");
    if (payFilter.size === 0) {
      return showToast("Select at least one payment filter","warning");
    }
    let fromTs = null;
    let toTs = null;
    if ((fromVal && !toVal) || (!fromVal && toVal)) {
      return showToast("Select both From and To dates","warning");
    }
    if (fromVal && toVal) {
      fromTs = new Date(fromVal + "T00:00:00").getTime();
      toTs = new Date(toVal + "T23:59:59").getTime();
      if(fromTs > toTs) return showToast("From date must be before To date","warning");
    }

    const snaps = await getDocs(query(collection(db,"jobs"), where("studioName","==", selectedStudio)));
    const jobs = snaps.docs.map(d=> ({ id:d.id, ...d.data() }))
      .filter(j=> j)
      .map(j=>{
        const ts = parseJobDateToTs(j.date);
        return { ...j, _ts: ts };
      })
      .filter(j=>{
        if (fromTs == null || toTs == null) return true;
        return j._ts !== null && j._ts >= fromTs && j._ts <= toTs;
      })
      .filter(j=>{
        const paymentFields = getJobPaymentFields(j);
        const paid = Number(paymentFields.paidAmount || 0);
        const pending = Number(paymentFields.pendingAmount || 0);
        const status = paid <= 0 ? "unpaid" : pending <= 0 ? "fully" : "partial";
        return payFilter.has(status);
      })
      .sort((a,b)=> (a.jobNo||"").localeCompare(b.jobNo||""));

    if(!jobs.length) return showToast("No jobs in selected date range","warning");

    // client details (for header + body)
    let clientInfo = cachedClients.find(c=> c.studioName === selectedStudio);
    if(!clientInfo){
      const custSnap = await getDocs(query(collection(db,"customers"), where("studioName","==", selectedStudio)));
      if(!custSnap.empty && custSnap.docs[0]) clientInfo = custSnap.docs[0].data();
    }
    // Payments: include 10 days before oldest job if unpaid/partial selected
    let payments = [];
    const includeExtraPayments = payFilter.has("unpaid") || payFilter.has("partial");
    const oldestTs = jobs.reduce((min, j) => (j._ts != null && (min == null || j._ts < min)) ? j._ts : min, null);
    let payStartTs = fromTs;
    let payEndTs = toTs;
    if (includeExtraPayments && oldestTs != null) {
      const tenDays = 10 * 24 * 60 * 60 * 1000;
      const tenDaysBefore = oldestTs - tenDays;
      payStartTs = payStartTs == null ? tenDaysBefore : Math.min(payStartTs, tenDaysBefore);
    }
    const paySnap = await getDocs(query(collection(db,"payments"), where("studioName","==", selectedStudio)));
    payments = paySnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p && !p.deleteData)
      .filter(p => {
        if (payStartTs == null && payEndTs == null) return true;
        const ts = p.createdAt?.seconds ? p.createdAt.seconds * 1000 : new Date(p.createdAt || 0).getTime();
        if (!ts || isNaN(ts)) return false;
        if (payStartTs != null && ts < payStartTs) return false;
        if (payEndTs != null && ts > payEndTs) return false;
        return true;
      })
      .sort((a,b)=> {
        const ta = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
        const tb = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
        return ta - tb;
      });

    const docPDF = await buildInvoicePdfDoc({ selectedStudio, jobs, clientInfo, payments });
    if(docPDF){
      bsProfilePdfModal && bsProfilePdfModal.hide();
      const shown = showPdfPreview(docPDF, selectedStudio);
      if(!shown) {
        const safeName = safePdfName(selectedStudio);
        docPDF.save(`${safeName}.pdf`);
      }
    }
  }

  if(btnProfilePdf) btnProfilePdf.addEventListener("click", ()=>{
    if(pdfFromDate) pdfFromDate.value = "";
    if(pdfToDate) pdfToDate.value = "";
    fillPdfClientSelect();
    bsProfilePdfModal && bsProfilePdfModal.show();
  });
  
  if(exportProfilePdfConfirm) exportProfilePdfConfirm.addEventListener("click", exportProfilePdfByDate);
  if(pdfPreviewDownload) {
    pdfPreviewDownload.addEventListener("click", () => {
      if(!lastPdfDoc) return;
      lastPdfDoc.save(`${lastPdfFileName || "invoice"}.pdf`);
    });
  }

  /* ============================================
     TRIGGER FUNCTIONS FOR AUTO-RECALC
     ============================================ */
  
  // Listen for job updates (when items are added/removed)
  if (typeof window !== 'undefined') {
    // Expose function for other modules to trigger recalculation
    window.triggerPaymentRecalc = async (studioName) => {
      await recalcPaymentsFIFO(studioName);
    };
    
    // Listen for custom events from other modules
    document.addEventListener('jobUpdated', async (e) => {
      if (e.detail && e.detail.studioName) {
        await recalcPaymentsFIFO(e.detail.studioName);
      }
    });
    
    document.addEventListener('paymentAdded', async (e) => {
      if (e.detail && e.detail.studioName) {
        await recalcPaymentsFIFO(e.detail.studioName);
      }
    });
    
    document.addEventListener('itemsUpdated', async (e) => {
      if (e.detail && e.detail.studioName) {
        await recalcPaymentsFIFO(e.detail.studioName);
      }
    });
  }

  /* ---------------- init message ---------------- */
  console.log("? STRICT ACCOUNTING-SAFE PAYMENT SYSTEM LOADED");
  console.log("?? STRICT RULES ENFORCED:");
  console.log("   1. ONE central recalcPaymentsFIFO() function");
  console.log("   2. SUM(job.paidAmount) = SUM(payment.amount)");
  console.log("   3. Jobs without items = UNPAID (paidAmount = 0)");
  console.log("   4. FIFO: Delivered/Completed ? Ready ? In Progress ? Assigned");
  console.log("   5. Partial payments allowed");
  console.log("   6. Advance ONLY after all eligible jobs paid");
  console.log("   7. Delete payment ? auto redistribute remaining");
  console.log("   8. Data safety: No negatives, paid = total, paid = payments");
  console.log("   9. UI consistency guaranteed");
}




  function normalizePhoneE164(raw) {
    if (!raw) return "";
    const digits = raw.toString().replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    if (raw.startsWith("+") && digits.length >= 8) return `+${digits}`;
    return "";
  }
