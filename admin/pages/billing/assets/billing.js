import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

/* =====================================================
   FIREBASE
===================================================== */
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

/* =====================================================
   DOM
===================================================== */
const jobsBody = document.getElementById("jobsBody");
const searchInput = document.getElementById("searchInput");

/* Stats */
const totalJobsEl = document.getElementById("totalJobs");
const totalRevenueEl = document.getElementById("totalRevenue");
const pendingBalanceEl = document.getElementById("pendingBalance");
const totalClientsEl = document.getElementById("totalClients");
const totalClientsCard = document.getElementById("totalClientsCard");
const clientsWrapper = document.getElementById("clientsWrapper");
const clientsBody = document.getElementById("clientsBody");

/* Job modal */
const jobModal = document.getElementById("jobModal");
const jobInfo = document.getElementById("jobInfo");
const itemsBody = document.getElementById("itemsBody");
const itemSelectSearch = document.getElementById("itemSelectSearch");
const itemSuggestions = document.getElementById("itemSuggestions");
const itemSelect = document.getElementById("itemSelect");
const itemQtyInput = document.getElementById("itemQtyInput");
const itemPriceInput = document.getElementById("itemPriceInput");
const addItemAdminBtn = document.getElementById("addItemAdminBtn");
const editProject = document.getElementById("editProject");
const editReady = document.getElementById("editReady");
const editDeliver = document.getElementById("editDeliver");
const saveJobBtn = document.getElementById("saveJobBtn");

/* Add Job modal */
const addJobModal = document.getElementById("addJobModal");
const newJobNo = document.getElementById("newJobNo");
const newStudio = document.getElementById("newStudio");
const studioSuggestions = document.getElementById("studioSuggestions");
const newProject = document.getElementById("newProject");
const newDrive = document.getElementById("newDrive");
const newSystem = document.getElementById("newSystem");
const studioList = null;

/* =====================================================
   STATE
===================================================== */
let allJobs = [];
let allStudios = [];
let currentJobId = null;
let currentJobItems = [];
let currentJobData = null;
let currentStudioItems = [];

function parseQtySmart(value) {
  const raw = String(value || "").trim();
  if (!raw) return { qty: 0, display: "" };
  if (raw.includes(":")) {
    const [h, m] = raw.split(":").map(v => parseInt(v, 10));
    const hours = (isNaN(h) ? 0 : h) + ((isNaN(m) ? 0 : m) / 60);
    return { qty: Math.max(0, hours), display: raw };
  }
  const num = Number(raw);
  return { qty: isNaN(num) ? 0 : num, display: raw };
}

async function loadStudioItems(studioName) {
  currentStudioItems = [];
  if (!studioName) {
    renderItemDropdown();
    return;
  }
  try {
    const snap = await getDocs(
      query(collection(db, "studioItems"), where("studioName", "==", studioName))
    );
    snap.forEach((d) => {
      const x = d.data();
      currentStudioItems.push({
        itemName: x.itemName,
        itemPrice: Number(x.itemPrice || 0),
      });
    });
    renderItemDropdown();
  } catch (err) {
    console.error("loadStudioItems error:", err);
    renderItemDropdown();
  }
}

function renderItemDropdown() {
  if (!itemSelect) return;
  itemSelect.innerHTML = `<option value="">Select Service/Item</option>`;
  if (itemSelectSearch) itemSelectSearch.value = "";
  if (!currentStudioItems.length) return;

  currentStudioItems.forEach((it, idx) => {
    const name = (it.itemName || "Item").toString();
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = name;
    opt.dataset.price = String(it.itemPrice || 0);
    itemSelect.appendChild(opt);
  });
}

function syncItemSelectFromSearch() {
  if (!itemSelectSearch || !itemSelect) return;
  const q = itemSelectSearch.value.trim().toLowerCase();
  if (!q) {
    itemSelect.value = "";
    if (itemPriceInput) itemPriceInput.value = "";
    return;
  }
  const idx = currentStudioItems.findIndex(
    (it) => (it.itemName || "Item").toString().toLowerCase() === q
  );
  if (idx >= 0) {
    itemSelect.value = String(idx);
    if (itemPriceInput) itemPriceInput.value = String(currentStudioItems[idx].itemPrice || 0);
  } else {
    itemSelect.value = "";
    if (itemPriceInput) itemPriceInput.value = "";
  }
}

function renderItemSuggestions(showAll = false) {
  if (!itemSuggestions) return;
  const q = (itemSelectSearch && itemSelectSearch.value || "").toLowerCase().trim();
  if (!q && !showAll) {
    itemSuggestions.style.display = "none";
    itemSuggestions.innerHTML = "";
    return;
  }
  const matches = currentStudioItems
    .map((it, idx) => ({ name: (it.itemName || "Item").toString(), idx }))
    .filter((it) => (q ? it.name.toLowerCase().includes(q) : true))
    .slice(0, 20);

  if (!matches.length) {
    itemSuggestions.innerHTML = `<div class="item muted">No items found</div>`;
    itemSuggestions.style.display = "block";
    return;
  }

  itemSuggestions.innerHTML = matches
    .map((it) => `<div class="item" data-idx="${it.idx}">${it.name}</div>`)
    .join("");
  itemSuggestions.style.display = "block";

  itemSuggestions.querySelectorAll(".item[data-idx]").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = el.getAttribute("data-idx");
      if (itemSelect) itemSelect.value = idx;
      if (itemSelectSearch) itemSelectSearch.value = el.textContent || "";
      if (itemPriceInput) {
        const base = currentStudioItems[Number(idx)];
        itemPriceInput.value = base ? String(base.itemPrice || 0) : "";
      }
      itemSuggestions.style.display = "none";
    });
  });
}

function renderItemsTable() {
  if (!itemsBody) return;
  itemsBody.innerHTML = "";
  if (!currentJobItems.length) {
    itemsBody.innerHTML = `<tr><td colspan="5">No items</td></tr>`;
    updateJobInfoTotals();
    return;
  }
  currentJobItems.forEach((i, idx) => {
    itemsBody.innerHTML += `
      <tr>
        <td>${i.name || "-"}</td>
        <td>${i.qtyInput || "-"}</td>
        <td>₹${money(i.price)}</td>
        <td>₹${money(i.rowTotal)}</td>
        <td><button class="btn btn-close btn-sm" data-rm="${idx}">Remove</button></td>
      </tr>
    `;
  });
  itemsBody.querySelectorAll("button[data-rm]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-rm"));
      if (!Number.isNaN(idx)) {
        currentJobItems.splice(idx, 1);
        renderItemsTable();
      }
    });
  });
  updateJobInfoTotals();
}

function updateJobInfoTotals() {
  if (!currentJobData || !jobInfo) return;
  const totalAmount = currentJobItems.reduce((a, i) => a + Number(i.rowTotal || 0), 0);
  const paidAmount = Number(currentJobData.paidAmount || 0);
  const pendingAmount = Math.max(0, totalAmount - paidAmount);
  jobInfo.innerHTML = `
    <div><b>Job No:</b> ${currentJobData.jobNo}</div>
    <div><b>Studio:</b> ${currentJobData.studioName || "-"}</div>
    <div><b>Total Amount:</b> ₹${money(totalAmount)}</div>
    <div><b>Paid:</b> ₹${money(paidAmount)}</div>
    <div><b>Pending:</b> ₹${money(pendingAmount)}</div>
  `;
}
let allPayments = [];

/* =====================================================
   HELPERS
===================================================== */
const jobNoNum = j =>
  parseInt((j || "").replace(/\D/g, ""), 10) || 0;

const money = n =>
  Number(n || 0).toLocaleString("en-IN");

const formatDate = v =>
  v?.seconds
    ? new Date(v.seconds * 1000).toISOString().split("T")[0]
    : v || "-";

/* =====================================================
   LOAD DATA (LIVE)
===================================================== */
function startListeners() {
  onSnapshot(collection(db, "jobs"), snap => {
    allJobs = [];

    snap.forEach(d => {
      const data = d.data();
      allJobs.push({ id: d.id, ...data });
    });

    /* Latest job first */
    allJobs.sort((a, b) => jobNoNum(b.jobNo) - jobNoNum(a.jobNo));

    updateStats();
    renderJobs(allJobs);
    generateNextJobNo();
  }, (err) => {
    console.error("Jobs snapshot error:", err);
    if (jobsBody) {
      jobsBody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:16px">Failed to load jobs. Check permissions.</td></tr>`;
    }
  });

  onSnapshot(collection(db, "payments"), snap => {
    allPayments = [];
    snap.forEach(d => {
      const data = d.data();
      if (data && !data.deleteData) allPayments.push(data);
    });
    updateStats();
  }, (err) => {
    console.error("Payments snapshot error:", err);
  });

  onSnapshot(collection(db, "customers"), snap => {
    allStudios = [];
    snap.forEach(d => {
      const c = d.data();
      if (c.studioName) allStudios.push(c.studioName);
      if (c.customerName) allStudios.push(c.customerName);
    });
    allStudios = [...new Set(allStudios)];
    renderClientsList();
  }, (err) => {
    console.error("Customers snapshot error:", err);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login";
    return;
  }
  startListeners();
});

/* =====================================================
   STATS
===================================================== */
function updateStats() {
  totalJobsEl.textContent = allJobs.length;

  let revenue = 0;
  let pending = 0;
  const studios = new Set();

  allJobs.forEach(j => {
    const itemsTotal = Array.isArray(j.itemsAdded)
      ? j.itemsAdded.reduce((a, i) => a + Number(i.rowTotal || 0), 0)
      : 0;
    const totalAmount = Number(j.totalAmount || 0) || itemsTotal;
    revenue += totalAmount;
    if (j.studioName) studios.add(j.studioName);
  });

  const received = allPayments.reduce((a, p) => a + Number(p.amount || 0), 0);
  pending = Math.max(revenue - received, 0);

  totalRevenueEl.textContent = "₹" + money(revenue);
  pendingBalanceEl.textContent = "₹" + money(pending);
  totalClientsEl.textContent = studios.size;

  renderClientsList();
}

function renderClientsList() {
  if (!clientsBody) return;
  const clients = [...new Set(allStudios)].filter(v => v && v.trim()).sort((a, b) => a.localeCompare(b));
  renderStudioSuggestions("");
  clientsBody.innerHTML = "";
  if (!clients.length) {
    clientsBody.innerHTML = `<tr><td colspan="2" style="text-align:center;padding:16px">No clients</td></tr>`;
    return;
  }

  const counts = new Map();
  allJobs.forEach(j => {
    const name = (j.studioName || j.customerName || "").trim();
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });

  clients.forEach(name => {
    const tr = document.createElement("tr");
    const count = counts.get(name) || 0;
    tr.innerHTML = `<td>${name}</td><td>${count}</td>`;
    clientsBody.appendChild(tr);
  });
}

function renderStudioSuggestions(query) {
  if (!studioSuggestions) return;
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    studioSuggestions.style.display = "none";
    studioSuggestions.innerHTML = "";
    return;
  }
  const list = (allStudios || []).filter(v => v && v.trim());
  const filtered = q
    ? list.filter(n => n.toLowerCase().includes(q))
    : list.slice(0, 25);
  const items = filtered.slice(0, 25);
  if (!items.length) {
    studioSuggestions.innerHTML = `<div class="item create" data-name="${query}">Create new studio: ${query}</div>`;
    studioSuggestions.style.display = "block";
    return;
  }
  studioSuggestions.innerHTML = filtered
    .slice(0, 25)
    .map(n => `<div class="item" data-name="${n}">${n}</div>`)
    .join("");
  studioSuggestions.style.display = "block";
}

if (newStudio) {
  newStudio.addEventListener("input", () => {
    renderStudioSuggestions(newStudio.value);
  });
  newStudio.addEventListener("focus", () => {
    if (newStudio.value.trim()) renderStudioSuggestions(newStudio.value);
  });
}

if (studioSuggestions) {
  studioSuggestions.addEventListener("click", (e) => {
    const item = e.target.closest(".item");
    if (!item) return;
    const name = item.getAttribute("data-name") || "";
    newStudio.value = name;
    studioSuggestions.style.display = "none";
  });
}

document.addEventListener("click", (e) => {
  if (!studioSuggestions || !newStudio) return;
  if (e.target === newStudio || studioSuggestions.contains(e.target)) return;
  studioSuggestions.style.display = "none";
});

/* =====================================================
   RENDER TABLE
===================================================== */
function renderJobs(list) {
  jobsBody.innerHTML = "";

  list.forEach(job => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${job.jobNo || "-"}</td>
      <td>${job.systemNo || "-"}</td>
      <td>${job.drive || "-"}</td>
      <td>${job.studioName || "-"}</td>
      <td>${job.projectName || "-"}</td>
      <td>${job.editor || "-"}</td>
      <td>${formatDate(job.dataReadyDate)}</td>
      <td>${formatDate(job.dataDeliverDate)}</td>
    `;
    tr.addEventListener("click", () => openJobModal(job));
    jobsBody.appendChild(tr);
  });
}

/* =====================================================
   JOB DETAILS MODAL
===================================================== */
function openJobModal(job) {
  currentJobId = job.id;
  currentJobData = job;

  editProject.value = job.projectName || "";
  editReady.value = formatDate(job.dataReadyDate);
  editDeliver.value = formatDate(job.dataDeliverDate);

  loadStudioItems(job.studioName || job.customerName || "");

  currentJobItems = Array.isArray(job.itemsAdded) ? job.itemsAdded.map(i => ({
    name: i.name || i.itemName || "-",
    price: Number(i.price || i.itemPrice || 0),
    qtyInput: i.qtyInput || i.displayValue || i.quantity || i.qtyValue || "-",
    qtyValue: Number(i.qtyValue || i.quantity || 0),
    rowTotal: Number(i.rowTotal || i.totalPrice || 0)
  })) : [];
  renderItemsTable();
  if (itemPriceInput) itemPriceInput.value = "";

  jobModal.classList.remove("hidden");
}

window.closeModal = () => {
  jobModal.classList.add("hidden");
  currentJobId = null;
};

/* =====================================================
   SAVE JOB EDIT
===================================================== */
saveJobBtn.addEventListener("click", async () => {
  if (!currentJobId) return;

  const totalAmount = currentJobItems.reduce((a, i) => a + Number(i.rowTotal || 0), 0);
  const paidAmount = Number(currentJobData?.paidAmount || 0);
  const pendingAmount = Math.max(0, totalAmount - paidAmount);

  await updateDoc(doc(db, "jobs", currentJobId), {
    projectName: editProject.value,
    dataReadyDate: editReady.value,
    dataDeliverDate: editDeliver.value,
    itemsAdded: currentJobItems,
    totalAmount,
    pendingAmount,
    updatedAt: serverTimestamp()
  });

  closeModal();
});

if (addItemAdminBtn) {
  addItemAdminBtn.addEventListener("click", () => {
    if (itemSelectSearch) syncItemSelectFromSearch();
    const idxStr = itemSelect ? itemSelect.value : "";
    const qtyRaw = (itemQtyInput?.value || "").trim();
    if (!idxStr) return;
    const parsed = parseQtySmart(qtyRaw);
    if (!parsed.qty) return;
    const base = currentStudioItems[Number(idxStr)];
    if (!base) return;
    const name = base.itemName || "Item";
    const price = Number(base.itemPrice || 0);
    const rowTotal = parsed.qty * price;
    currentJobItems.push({
      name,
      price,
      qtyInput: parsed.display,
      qtyValue: parsed.qty,
      rowTotal
    });
    if (itemSelectSearch) itemSelectSearch.value = "";
    if (itemSelect) itemSelect.value = "";
    if (itemQtyInput) itemQtyInput.value = "";
    if (itemPriceInput) itemPriceInput.value = "";
    renderItemsTable();
  });
}

if (itemSelectSearch) {
  itemSelectSearch.addEventListener("input", () => {
    renderItemSuggestions(true);
    syncItemSelectFromSearch();
  });
  itemSelectSearch.addEventListener("focus", () => {
    renderItemSuggestions(true);
  });
}

document.addEventListener("click", (e) => {
  if (!itemSuggestions || !itemSelectSearch) return;
  const wrap = itemSelectSearch.closest(".item-select-wrap");
  if (wrap && wrap.contains(e.target)) return;
  itemSuggestions.style.display = "none";
});

/* =====================================================
   SEARCH
===================================================== */
searchInput.addEventListener("input", () => {
  const v = searchInput.value.toLowerCase();
  renderJobs(
    allJobs.filter(j =>
      (j.jobNo || "").toLowerCase().includes(v) ||
      (j.studioName || "").toLowerCase().includes(v) ||
      (j.projectName || "").toLowerCase().includes(v) ||
      (j.editor || "").toLowerCase().includes(v)
    )
  );
});

if (totalClientsCard && clientsWrapper) {
  totalClientsCard.addEventListener("click", () => {
    clientsWrapper.classList.toggle("hidden");
  });
}

/* =====================================================
   ADD JOB
===================================================== */
function generateNextJobNo() {
  let max = 0;
  const nums = new Set();
  allJobs.forEach(j => {
    const n = jobNoNum(j.jobNo);
    if (n > 0) nums.add(n);
    if (n > max) max = n;
  });
  const missing = [];
  for (let i = 1; i < max; i++) {
    if (!nums.has(i)) missing.push(i);
  }
  const options = [];
  missing.forEach(n => {
    const v = "JF-" + String(n).padStart(3, "0");
    options.push({ value: v, label: `${v} (Missing)` });
  });
  const next = "JF-" + String(max + 1).padStart(3, "0");
  options.push({ value: next, label: `${next} (Next)` });
  if (newJobNo) {
    newJobNo.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join("");
    newJobNo.value = next;
  }
}

window.openAddJob = () => {
  addJobModal.classList.remove("hidden");
  generateNextJobNo();
};

window.closeAddJob = () => {
  addJobModal.classList.add("hidden");
};

/* =====================================================
   SAVE NEW JOB
===================================================== */
window.saveNewJob = async () => {
  if (allJobs.some(j => j.jobNo === newJobNo.value)) {
    alert("❌ Job No already exists");
    return;
  }

  /* Auto-create studio */
  const studioName = (newStudio?.value || "").trim();
  if (!studioName) {
    alert("Studio name is required");
    return;
  }
  if (!allStudios.includes(studioName)) {
    await addDoc(collection(db, "customers"), {
      studioName,
      createdAt: new Date()
    });
  }

  await addDoc(collection(db, "jobs"), {
    jobNo: newJobNo.value,
    studioName,
    projectName: newProject.value,
    drive: newDrive.value,
    systemNo: newSystem.value,
    createdAt: new Date()
  });

  closeAddJob();
};




