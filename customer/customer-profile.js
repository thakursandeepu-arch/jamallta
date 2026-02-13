import { app, auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, query, where, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

let studioName = "";
let jobs = [];
let payments = [];
let jobsLoaded = false;
let paymentsLoaded = false;
let filter = "all";
let currentUserEmail = "";
let isPaying = false;
let customerBalance = null;
let hasCustomerBalance = false;
let displayBalanceValue = 0;
let currentStudioNames = [];
let jobsUnsub = null;
let paymentsUnsub = null;
const normalize = (v) => (v || "").toString().trim().toLowerCase();
const STATUS_PRIORITY = {
  "Delivered": 4,
  "Completed": 4,
  "Ready": 3,
  "In Progress": 2,
  "Assigned": 1
};
const functions = getFunctions(app, "us-central1");

async function callFunction(endpoint, payload) {
  if (!navigator.onLine) throw new Error("No internet connection");
  const fn = httpsCallable(functions, endpoint);
  const res = await fn(payload || {});
  return res?.data || {};
}

async function callPaymentHttp(endpoint, payload) {
  if (!navigator.onLine) throw new Error("No internet connection");
  const user = auth.currentUser;
  if (!user) throw new Error("Login required");
  const token = await user.getIdToken();
  const url = `https://us-central1-jamallta-films-2-27d2b.cloudfunctions.net/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || "Payment API failed");
  }
  return data;
}

const studioNameEl = document.getElementById("studioName");
const emailEl = document.getElementById("email");
const phoneEl = document.getElementById("phone");
const cityEl = document.getElementById("city");
const brandStudioEl = document.getElementById("brandStudio");
const balanceEl = document.getElementById("balanceAmount");
const projectsList = document.getElementById("projectsList");
const paymentTable = document.getElementById("paymentTable");
const searchBox = document.getElementById("searchBox");
const logoutBtn = document.getElementById("logoutBtn");
const openChatBtn = document.getElementById("openChatBtn");
const topPayBtn = document.getElementById("topPayBtn");
const balancePayBtn = document.getElementById("balancePayBtn");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileSidebar = document.getElementById("mobileSidebar");
const mobileOverlay = document.getElementById("mobileOverlay");
const sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");
const sidebarStudio = document.getElementById("sidebarStudio");
const sidebarEmail = document.getElementById("sidebarEmail");
const sidebarPhone = document.getElementById("sidebarPhone");
const sidebarCity = document.getElementById("sidebarCity");
const sidebarNav = document.getElementById("sidebarNav");
const balanceSection = document.getElementById("balanceSection");
const profileInfoSection = document.getElementById("profileInfoSection");
const statsSection = document.getElementById("statsSection");
const projectsSection = document.getElementById("projectsSection");
const paymentsSection = document.getElementById("paymentsSection");
const sidebarInfo = document.getElementById("sidebarInfo");
const sidebarInfoTitle = document.getElementById("sidebarInfoTitle");
const payModal = document.getElementById("payModal");
const payCancelBtn = document.getElementById("payCancelBtn");
const payConfirmBtn = document.getElementById("payConfirmBtn");
const payAmountInput = document.getElementById("payAmountInput");
const paySubtitle = document.getElementById("paySubtitle");
const payFullBtn = document.getElementById("payFullBtn");
const payMaxHint = document.getElementById("payMaxHint");

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const totalCount = document.getElementById("totalCount");
const pendingCount = document.getElementById("pendingCount");
const processingCount = document.getElementById("processingCount");
const readyCount = document.getElementById("readyCount");
const paidCount = document.getElementById("paidCount");
const unpaidCount = document.getElementById("unpaidCount");

function statusOf(j) {
  if (!j) return "Pending";
  const raw = String(j.status || "").toLowerCase();
  if (raw === "ready" || raw === "delivered" || raw === "completed" || j.dataReadyDate || j.dataDeliverDate) {
    return "Ready";
  }
  if (raw === "processing" || raw === "in progress" || j.assignedTo || j.editor || j.editorName) {
    return "Processing";
  }
  return "Pending";
}

function isReadyJob(j) {
  const raw = String(j?.status || "").toLowerCase();
  return raw === "ready" || raw === "delivered" || raw === "completed" || !!j?.dataReadyDate || !!j?.dataDeliverDate;
}

function isProcessingJob(j) {
  const raw = String(j?.status || "").toLowerCase();
  if (raw === "processing" || raw === "in progress") return true;
  if (isReadyJob(j)) return false;
  return !!(j?.assignedTo || j?.editor || j?.editorName);
}

function progressPercent(j) {
  if (!j) return 0;
  const delivered = !!j.dataDeliverDate || String(j.status || "").toLowerCase() === "delivered" || String(j.status || "").toLowerCase() === "completed";
  const ready = !!j.dataReadyDate || String(j.status || "").toLowerCase() === "ready";
  const hasItems = Array.isArray(j.itemsAdded) && j.itemsAdded.length > 0;

  if (delivered) return 100;
  if (ready) return 85;
  if (hasItems) return 55;
  return 20;
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

function hasJobItems(job) {
  if (!job) return false;
  return Array.isArray(job.itemsAdded) && job.itemsAdded.length > 0;
}

function jobDateTs(j) {
  const raw = j?.date || j?.dataCopyDate || j?.assignedAt || j?.createdAt || j?.updatedAt;
  if (raw?.seconds) return raw.seconds * 1000;
  const d = new Date(raw || 0);
  return isNaN(d) ? null : d.getTime();
}

function isInCurrentMonth(ts) {
  if (!ts) return false;
  const now = new Date();
  const d = new Date(ts);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function totalAmountForJob(j) {
  if (!j) return 0;
  const itemsTotal = Array.isArray(j.itemsAdded)
    ? j.itemsAdded.reduce((a, i) => a + Number(i.rowTotal || 0), 0)
    : 0;
  return Number(j.totalAmount || 0) || itemsTotal;
}

function paymentTotalsForJob(j) {
  const totalAmount = totalAmountForJob(j);
  const paidAmt = Number(j?.paidAmount || 0);
  const pendingAmt = Number(j?.pendingAmount || Math.max(totalAmount - paidAmt, 0));
  return { totalAmount, paidAmt, pendingAmt };
}

function jobPaymentStatus(j, alloc) {
  const paid = Number(alloc?.paid || j?.paidAmount || 0);
  const pending = Number(alloc?.pending || j?.pendingAmount || 0);
  if (paid <= 0) return "unpaid";
  if (pending <= 0) return "paid";
  return "partial";
}

async function startPayment(amount, jobId) {
  if (!amount || amount <= 0) return;
  if (isPaying) return;
  if (!window.Razorpay) {
    alert("Payment SDK not loaded. Please refresh.");
    return;
  }
  if (!isMobileDevice() && location.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    alert("Desktop par UPI QR ke liye HTTPS zaroori hai. कृपया site ko https:// par kholें.");
  }

  isPaying = true;

  try {
    const order = await callPaymentHttp("createRazorpayOrderHttp", { amount, jobId, studioName });
    const upiFlow = isMobileDevice() ? "intent" : "collect";

    const options = {
      key: order.keyId || order.key,
      amount: order.amount,
      currency: order.currency || "INR",
      name: "Jamallta Films",
      description: jobId ? "Job Payment" : "Balance Payment",
      order_id: order.orderId,
      prefill: {
        email: currentUserEmail || "",
        name: studioName || ""
      },
      theme: { color: "#2f89ff" },
      method: { upi: true, card: false, netbanking: false, wallet: false, emi: false, paylater: false },
      config: {
        display: {
          blocks: {
            upi: {
              name: "UPI",
              instruments: [{ method: "upi" }]
            }
          },
          sequence: ["block.upi"],
          preferences: { show_default_blocks: false }
        }
      },
      upi: { flow: upiFlow },
      handler: async (response) => {
        await callPaymentHttp("verifyRazorpayPaymentHttp", {
          orderId: response.razorpay_order_id,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
          amount,
          jobId,
          studioName
        });
        alert("Payment successful");
      },
    };

    const rzp = new Razorpay(options);
    rzp.open();

    rzp.on("payment.failed", function (response) {
      alert("Payment failed: " + response.error.description);
      isPaying = false;
    });

  } catch (error) {
    console.error("Payment error:", error);
    alert("Payment failed: " + error.message);
    isPaying = false;
  }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "/login/index.html";

  if (emailEl) emailEl.textContent = user.email || "-";
  currentUserEmail = user.email || "";

  // ensureCustomerProfile function was removed; skip to avoid CORS/errors

  if (user.email) {
    await loadCustomer({ email: user.email });
  } else if (user.phoneNumber) {
    await loadCustomer({ phone: user.phoneNumber });
  }
});

async function loadCustomer({ email, phone }) {
  if (!email && !phone) return;
  let q = null;
  if (email) {
    q = query(collection(db, "customers"), where("email", "==", email));
  } else {
    q = query(collection(db, "customers"), where("phoneE164", "==", phone));
  }

  onSnapshot(q, (snap) => {
    if (snap.empty) return;
    const data = snap.docs[0].data() || {};
    const nextStudio = data.studioName || "";
    if (!nextStudio) return;

    const studioChanged = nextStudio !== studioName;
    studioName = nextStudio;
    if (studioNameEl) studioNameEl.textContent = studioName;
    if (brandStudioEl) brandStudioEl.textContent = studioName;
    currentStudioNames = [data.studioName, data.customerName, studioName]
      .map(v => (v || "").toString().trim())
      .filter(v => v);
    currentStudioNames = [...new Set(currentStudioNames)];

    if (emailEl) emailEl.textContent = data.email || data.gmail || email || "-";
    if (phoneEl) phoneEl.textContent = data.phone || data.phoneE164 || "-";
    if (cityEl) cityEl.textContent = data.city || "-";
    if (sidebarStudio) sidebarStudio.textContent = data.studioName || "-";
    if (sidebarEmail) sidebarEmail.textContent = data.email || data.gmail || email || "-";
    if (sidebarPhone) sidebarPhone.textContent = data.phone || data.phoneE164 || "-";
    if (sidebarCity) sidebarCity.textContent = data.city || "-";

    const nextBalance = Number(data.balance);
    hasCustomerBalance = Number.isFinite(nextBalance);
    customerBalance = hasCustomerBalance ? nextBalance : null;
    if (hasCustomerBalance) {
      if (balanceEl) balanceEl.textContent = `Rs. ${customerBalance.toFixed(2)}`;
    }

    if (studioChanged) {
      jobsLoaded = false;
      paymentsLoaded = false;
      jobs = [];
      payments = [];
      startPaymentsListener();
      startJobsListener();
    }
  });
}

function startPaymentsListener() {
  if (paymentsUnsub) paymentsUnsub();
  if (!studioName) return;
  paymentsUnsub = onSnapshot(
    query(collection(db, "payments"), where("studioName", "==", studioName)),
    snap => {
      if (!paymentTable) return;
      payments = [];
      paymentTable.innerHTML = "";
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(p => p && !p.deleteData)
        .sort((a, b) => {
          const ta = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
          const tb = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
          return tb - ta;
        });

      if (arr.length === 0) {
        paymentTable.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:20px">No payments</td></tr>`;
      } else {
        arr.forEach(p => {
          payments.push(p);
          const dt = p.createdAt?.seconds
            ? new Date(p.createdAt.seconds * 1000).toLocaleDateString()
            : (p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "-");
          const note = (p.note || p.remarks || (p.jobId ? "Job Payment" : "Payment received")).toString();
          paymentTable.innerHTML += `
            <tr>
              <td>${dt}</td>
              <td class="right">Rs. ${Number(p.amount).toFixed(2)}</td>
              <td>${note}</td>
            </tr>
          `;
        });
      }

      paymentsLoaded = true;
      recalcAndRender();
    }
  );
}

function startJobsListener() {
  if (jobsUnsub) jobsUnsub();
  if (!studioName) return;

  const names = (currentStudioNames || []).map(v => (v || "").toString().trim()).filter(v => v);
  if (!names.length) return;

  let buckets = [];
  let fallbackJobs = [];
  const mergeJobs = () => {
    const map = new Map();
    const all = buckets.flat().concat(fallbackJobs || []);
    all.forEach(j => {
      if (j) map.set(j.id, j);
    });
    const arr = [...map.values()].sort((a, b) => {
      const ta = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
      const tb = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
      return tb - ta;
    });
    jobs = arr.map(j => {
      return {
        ...j,
        items: (j.itemsAdded || []).map(i => ({
          ...i,
          rowTotal: Number((i.rowTotal || 0).toFixed(2))
        })),
        total: Number((j.totalAmount || 0).toFixed(2)),
        paidAmount: Number((j.paidAmount || 0).toFixed(2)),
        pendingAmount: Number((j.pendingAmount || 0).toFixed(2))
      };
    });

    if (totalCount) totalCount.textContent = jobs.length;
    if (pendingCount) pendingCount.textContent = jobs.filter(j => !isReadyJob(j)).length;
    if (processingCount) processingCount.textContent = jobs.filter(j => isProcessingJob(j)).length;
    if (readyCount) readyCount.textContent = jobs.filter(j => isReadyJob(j)).length;

    jobsLoaded = true;
    recalcAndRender();
  };

  const unsubs = [];
  const addQuery = (field, value, idx) => {
    const q = query(collection(db, "jobs"), where(field, "==", value));
    const unsub = onSnapshot(q, snap => {
      buckets[idx] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

function recalcAndRender() {
  if (!jobsLoaded || !paymentsLoaded) return;

  const totalJobs = jobs.reduce((s, j) => s + j.total, 0);
  const totalPaidFromJobs = jobs.reduce((s, j) => s + Number(j.paidAmount || 0), 0);
  const totalPaidFromPayments = payments.reduce((s, p) => s + Number(p.amount), 0);
  const hasJobPayments = jobs.some(j => Number(j.paidAmount || 0) > 0 || Number(j.pendingAmount || 0) > 0);
  const totalPaid = hasJobPayments ? totalPaidFromJobs : totalPaidFromPayments;
  const balance = Number((totalJobs - totalPaid).toFixed(2));

  const displayBalance = hasCustomerBalance ? customerBalance : balance;
  displayBalanceValue = Number.isFinite(displayBalance) ? Number(displayBalance) : 0;
  if (balanceEl) {
    if (Number.isFinite(displayBalance)) {
      balanceEl.textContent = `Rs. ${Number(displayBalance).toFixed(2)}`;
    } else {
      balanceEl.textContent = `Rs. ${balance}`;
    }
    balanceEl.dataset.value = String(displayBalanceValue || 0);
  }
  const counts = jobs.reduce(
    (acc, j) => {
      const { totalAmount, paidAmt, pendingAmt } = paymentTotalsForJob(j);
      if (paidAmt <= 0 || pendingAmt >= totalAmount) acc.unpaid += 1;
      if (pendingAmt <= 0 && paidAmt > 0) acc.paid += 1;
      return acc;
    },
    { paid: 0, unpaid: 0 }
  );

  if (paidCount) paidCount.textContent = counts.paid;
  if (unpaidCount) unpaidCount.textContent = counts.unpaid;
  renderJobs();
}

function renderJobs() {
  projectsList.innerHTML = "";
  const q = (searchBox.value || "").toLowerCase();

  const totalPayments = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const allocation = (() => {
    const map = new Map();
    const sorted = [...jobs].sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a?.status] || 0;
      const priorityB = STATUS_PRIORITY[b?.status] || 0;
      if (priorityB !== priorityA) return priorityB - priorityA;
      const dateA = (a?.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a?.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
      const dateB = (b?.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b?.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
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

  jobs
    .slice()
    .filter(j =>
      (filter === "all" ||
        (filter === "ready" && isReadyJob(j)) ||
        (filter === "processing" && isProcessingJob(j)) ||
        (filter === "pending" && !isReadyJob(j)) ||
        (filter === "paid" && jobPaymentStatus(j, allocation.get(j.id)) === "paid") ||
        (filter === "unpaid" && jobPaymentStatus(j, allocation.get(j.id)) === "unpaid")) &&
      (
        (j.jobNo || "").toLowerCase().includes(q) ||
        (j.projectName || "").toLowerCase().includes(q) ||
        (j.assignedTo || j.editor || j.editorName || "").toLowerCase().includes(q)
      )
    )
    .forEach(j => {

      const alloc = allocation.get(j.id) || { paid: Number(j.paidAmount || 0), pending: Number(j.pendingAmount || 0) };
      const paid = Number(alloc.paid || 0);
      const due = Number(alloc.pending || 0);

      const canPay = due > 0.01;
      const progress = progressPercent(j);
      const deletedAt = j.deleteData ? formatAnyDate(j.deletedAt) : "";
      projectsList.innerHTML += `
        <div class="project">
          <b>${j.projectName}</b> (Job ${j.jobNo})<br>
          Status: ${statusOf(j)}
          ${deletedAt ? `<div class="muted" style="margin-top:4px;">Deleted At: ${deletedAt}</div>` : ""}
          <div class="progress-wrap" aria-label="Processing">
            <div class="progress-label">Processing</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${progress}%;"></div>
            </div>
          </div>

          ${j.items.map(i => `
            <div class="item">
              <span>${i.name}</span>
              <span>Rs. ${i.rowTotal.toFixed(2)}</span>
            </div>
          `).join("")}

          <div class="project-footer">
            <span>Paid Rs. ${paid.toFixed(2)} | Due Rs. ${due.toFixed(2)}</span>
            ${canPay ? `<button class="btn btn-primary btn-sm job-pay" data-job="${j.id}" data-due="${due.toFixed(2)}">Pay</button>` : `<span class="muted">Paid</span>`}
          </div>
        </div>
      `;
    });
}

if (openChatBtn) {
  openChatBtn.onclick = () => {
    window.location.href =
      `/customer/chat/customer-chet.html?studio=${encodeURIComponent(studioName)}`;
  };
}

document.querySelectorAll(".clickable").forEach(c => {
  c.onclick = () => {
    document.querySelectorAll(".stat-card").forEach(x => x.classList.remove("active"));
    c.classList.add("active");
    filter = (c.dataset.filter || "all").toLowerCase();
    renderJobs();
  };
});
searchBox.oninput = renderJobs;
logoutBtn.onclick = async () => {
  await signOut(auth);
  const base = location.pathname.includes("/public/") ? "/public/index.html" : "/index.html";
  location.href = base;
};

if (sidebarLogoutBtn) {
  sidebarLogoutBtn.onclick = async () => {
    await signOut(auth);
    const base = location.pathname.includes("/public/") ? "/public/index.html" : "/index.html";
    location.href = base;
  };
}

function openMobileSidebar() {
  if (mobileSidebar) mobileSidebar.classList.add("open");
  if (mobileOverlay) mobileOverlay.classList.add("show");
}

function closeMobileSidebar() {
  if (mobileSidebar) mobileSidebar.classList.remove("open");
  if (mobileOverlay) mobileOverlay.classList.remove("show");
}

if (mobileMenuBtn) mobileMenuBtn.addEventListener("click", openMobileSidebar);
if (mobileOverlay) mobileOverlay.addEventListener("click", closeMobileSidebar);

function showSections(key) {
  const all = [balanceSection, statsSection, projectsSection, paymentsSection, profileInfoSection];
  all.forEach(el => { if (el) el.style.display = "none"; });
  if (sidebarInfo) sidebarInfo.style.display = "none";
  if (sidebarInfoTitle) sidebarInfoTitle.style.display = "none";

  if (key === "overview") {
    if (balanceSection) balanceSection.style.display = "";
    if (statsSection) statsSection.style.display = "";
    if (projectsSection) projectsSection.style.display = "";
    if (paymentsSection) paymentsSection.style.display = "";
    return;
  }
  if (key === "projects") {
    if (projectsSection) projectsSection.style.display = "";
    if (sidebarInfo) sidebarInfo.style.display = "";
    if (sidebarInfoTitle) sidebarInfoTitle.style.display = "";
    return;
  }
  if (key === "payments") {
    if (paymentsSection) paymentsSection.style.display = "";
    return;
  }
  if (key === "profile") {
    if (profileInfoSection) profileInfoSection.style.display = "";
    return;
  }
}

if (sidebarNav) {
  sidebarNav.addEventListener("click", (e) => {
    const btn = e.target.closest(".sidebar-item");
    if (!btn) return;
    const key = btn.getAttribute("data-section") || "overview";
    sidebarNav.querySelectorAll(".sidebar-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    showSections(key);
    closeMobileSidebar();
  });
}

// Top-up payment
if (topPayBtn) {
  topPayBtn.onclick = function() {
    openPayModal();
  };
}

if (balancePayBtn) {
  balancePayBtn.onclick = () => {
    openPayModal();
  };
}

// Job payment
projectsList.addEventListener("click", (e) => {
  const btn = e.target.closest(".job-pay");
  if (!btn) return;
  if (isPaying) return;

  const jobId = btn.getAttribute("data-job");
  const due = Number(btn.getAttribute("data-due") || "0");
  if (!jobId || !due || due <= 0) return;
  openPayModal(due, jobId);
});

function openPayModal(prefillAmount, jobId = null) {
  const amount = Number(prefillAmount || balanceEl?.dataset?.value || 0) || 0;
  if (!amount || amount <= 0) {
    alert("No balance to pay");
    return;
  }
  if (payAmountInput) {
    payAmountInput.value = Math.ceil(amount);
    payAmountInput.dataset.jobId = jobId || "";
    payAmountInput.dataset.max = String(amount);
  }
  if (paySubtitle) {
    paySubtitle.textContent = jobId ? `Pay for Job ${jobId}` : "Review amount";
  }
  if (payMaxHint) {
    payMaxHint.textContent = `Max: Rs. ${Number(amount).toFixed(2)}`;
  }
  if (payModal) payModal.style.display = "flex";
}

function closePayModal() {
  if (payModal) payModal.style.display = "none";
}

if (payCancelBtn) payCancelBtn.onclick = closePayModal;

if (payConfirmBtn) {
  payConfirmBtn.onclick = () => {
    const amount = Number(payAmountInput?.value || 0);
    const max = Number(payAmountInput?.dataset?.max || 0);
    const jobId = payAmountInput?.dataset?.jobId || null;
    if (!amount || amount <= 0) {
      alert("Enter a valid amount");
      return;
    }
    if (amount < 1) {
      alert("Minimum amount Rs. 1");
      return;
    }
    if (max && amount > max) {
      alert(`Amount cannot exceed Rs. ${max.toFixed(2)}`);
      return;
    }
    closePayModal();
    startPayment(amount, jobId || null);
  };
}

if (payFullBtn) {
  payFullBtn.onclick = () => {
    const max = Number(payAmountInput?.dataset?.max || 0);
    if (!max) return;
    payAmountInput.value = Math.ceil(max);
  };
}
