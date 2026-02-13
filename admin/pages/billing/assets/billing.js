import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc
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

  jobInfo.innerHTML = `
    <div><b>Job No:</b> ${job.jobNo}</div>
    <div><b>Studio:</b> ${job.studioName || "-"}</div>
    <div><b>Total Amount:</b> ₹${money(job.totalAmount)}</div>
    <div><b>Paid:</b> ₹${money(job.paidAmount)}</div>
    <div><b>Pending:</b> ₹${money(job.pendingAmount)}</div>
  `;

  editProject.value = job.projectName || "";
  editReady.value = formatDate(job.dataReadyDate);
  editDeliver.value = formatDate(job.dataDeliverDate);

  itemsBody.innerHTML = "";
  (job.itemsAdded || []).forEach(i => {
    itemsBody.innerHTML += `
      <tr>
        <td>${i.name || "-"}</td>
        <td>${i.qtyInput || "-"}</td>
        <td>₹${money(i.price)}</td>
        <td>₹${money(i.rowTotal)}</td>
      </tr>
    `;
  });

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

  await updateDoc(doc(db, "jobs", currentJobId), {
    projectName: editProject.value,
    dataReadyDate: editReady.value,
    dataDeliverDate: editDeliver.value
  });

  closeModal();
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




