import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  getDoc,
  setDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js";
/* ================= FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyAcHb-VHdM30fb9qSR4dzclmNTxXsTofIw",
  authDomain: "jamallta-films-2-27d2b.firebaseapp.com",
  projectId: "jamallta-films-2-27d2b",
  storageBucket: "jamallta-films-2-27d2b.firebasestorage.app",
  messagingSenderId: "207209419416",
  appId: "1:207209419416:web:53ff512e34553e9286b6ed"
};

const VAPID_PUBLIC_KEY = "PUpP3C7dpxlo_QIIp3jysbj7AGE4xJKEBSP9YbYGw_U";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let notifStarted = false;
let lastNotifSeconds = 0;

function requestNotifPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function showBrowserNotif(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

function startAdminNotifications() {
  if (notifStarted) return;
  notifStarted = true;
  requestNotifPermission();
  const q = query(
    collection(db, "notifications"),
    where("audience", "==", "admin"),
    orderBy("createdAt", "desc"),
    limit(25)
  );
  onSnapshot(q, (snap) => {
    if (!snap.empty && lastNotifSeconds === 0) {
      lastNotifSeconds = Math.floor(Date.now() / 1000);
      return;
    }
    let maxSeen = lastNotifSeconds;
    snap.forEach((d) => {
      const data = d.data() || {};
      const ts = data.createdAt?.seconds || 0;
      if (ts > lastNotifSeconds) {
        showBrowserNotif(data.title || "Notification", data.message || "");
        if (ts > maxSeen) maxSeen = ts;
      }
    });
    lastNotifSeconds = maxSeen;
  });
}

async function initAdminPush(user) {
  try {
    if (!("Notification" in window)) return;
    if (!("serviceWorker" in navigator)) return;
    const supported = await isSupported();
    if (!supported) return;

    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.register("/jamallta/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: reg
    });

    if (token) {
      const ref = doc(db, "admin_push_tokens", token);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await setDoc(ref, {
          token,
          userId: user?.uid || "",
          email: user?.email || "",
          userAgent: navigator.userAgent,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } else {
        await setDoc(ref, {
          token,
          userId: user?.uid || "",
          email: user?.email || "",
          userAgent: navigator.userAgent,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    onMessage(messaging, (payload) => {
      const title = payload?.notification?.title || "Notification";
      const body = payload?.notification?.body || "";
      showBrowserNotif(title, body);
    });
  } catch (err) {
    console.error("initAdminPush error:", err);
  }
}

/* ================= DOM ================= */
const jobsTable = document.getElementById("jobsTable");
const search = document.getElementById("search");
const tableHead = document.getElementById("tableHead");
const chartCanvas = document.getElementById("jobsChart");
const chartRangeSelect = document.getElementById("chartRange");
const chartMetricSelect = document.getElementById("chartMetric");
const chartCustom = document.getElementById("chartCustom");
const chartFrom = document.getElementById("chartFrom");
const chartTo = document.getElementById("chartTo");
const chartApply = document.getElementById("chartApply");

const span = id => document.querySelector(`#${id} span`);

let jobs = [];
let customers = [];
let payments = [];
let currentView = "all";
let customerById = new Map();
let customerByName = new Map();
let tableColCount = 14;
let jobsChart = null;
let chartRange = "month";
let chartCustomRange = { from: "", to: "" };
let chartMetric = "count";

/* ================= HELPERS ================= */
const money = n => Number(n || 0).toLocaleString("en-IN");
const normalize = v => (v || "").toString().trim().toLowerCase();
const formatDate = v => {
  if (!v) return "-";
  if (v?.seconds) return new Date(v.seconds * 1000).toISOString().split("T")[0];
  const dt = new Date(v);
  if (!isNaN(dt)) return dt.toISOString().split("T")[0];
  return v || "-";
};
const jobNoNum = v => {
  const n = String(v || "").match(/\d+/g);
  return n ? Number(n.join("")) : 0;
};
const hideEmail = v => {
  const s = (v || "").toString().trim();
  if (!s) return "-";
  if (s.includes("@")) return "-";
  return s;
};
const dateToYMD = d => {
  if (!d) return "";
  if (d?.seconds) return new Date(d.seconds * 1000).toISOString().split("T")[0];
  const dt = new Date(d);
  if (!isNaN(dt)) return dt.toISOString().split("T")[0];
  return "";
};

const statusOf = j => {
  if (j.dataDeliverDate) return "Delivered";
  if (j.dataReadyDate) return "Ready";
  if (j.assignedTo) return "Active";
  return "Pending";
};
const buildCustomerIndex = () => {
  customerById = new Map();
  customerByName = new Map();
  customers.forEach(c => {
    if (!c) return;
    if (c.id) customerById.set(c.id, c);
    const keys = [
      c.studioName,
      c.customerName,
      c.studio,
      c.name,
      c.customer
    ];
    keys.forEach(k => {
      const nk = normalize(k);
      if (nk) customerByName.set(nk, c);
    });
  });
};

const customerForJob = j => {
  if (!j) return null;
  if (j.customerId && customerById.has(j.customerId)) return customerById.get(j.customerId);
  const studio = normalize(j.studioName || j.customerName || "");
  if (studio && customerByName.has(studio)) return customerByName.get(studio);
  return null;
};

const chartDateFieldForView = view =>
  view === "Active"
    ? "assignedAt"
    : view === "Ready"
    ? "dataReadyDate"
    : view === "Delivered"
    ? "dataDeliverDate"
    : "dataCopyDate";

const jobDateForView = (j, view) =>
  dateToYMD(
    j[chartDateFieldForView(view)] ||
      j.dataCopyDate ||
      j.assignedAt ||
      j.createdAt ||
      j.updatedAt
  );

const paymentDate = p =>
  dateToYMD(
    p?.paymentDate ||
      p?.paidAt ||
      p?.date ||
      p?.createdAt ||
      p?.updatedAt ||
      p?.timestamp ||
      p?.time
  );

const customerDate = c =>
  dateToYMD(c?.updatedAt || c?.createdAt || c?.timestamp || c?.time || c?.date);

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/* ================= FIRESTORE (WAIT FOR AUTH) ================= */
let listenersStarted = false;
function startListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  onSnapshot(collection(db, "jobs"), snap => {
    jobs = [];
    snap.forEach(d => jobs.push({ id: d.id, ...d.data() }));
    updateCards();
    updateChart(currentView);
    renderView();
  });

  onSnapshot(collection(db, "customers"), snap => {
    customers = [];
    snap.forEach(d => customers.push({ id: d.id, ...d.data() }));
    buildCustomerIndex();
    updateCards();
    renderView();
  });

  onSnapshot(collection(db, "payments"), snap => {
    payments = [];
    snap.forEach(d => payments.push(d.data()));
    updateCards();
    updateChart(currentView);
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    startListeners();
    startAdminNotifications();
    initAdminPush(user);
  }
});

/* ================= CARDS ================= */
function updateCards() {
  const totals = jobs.reduce(
    (acc, j) => {
      const itemsTotal = Array.isArray(j.itemsAdded)
        ? j.itemsAdded.reduce((a, i) => a + Number(i.rowTotal || 0), 0)
        : 0;
      const totalAmount = Number(j.totalAmount || 0) || itemsTotal;
      acc.revenue += totalAmount;
      return acc;
    },
    { revenue: 0 }
  );
  const received = payments.reduce((a, p) => a + Number(p.amount || 0), 0);
  const pending = Math.max(totals.revenue - received, 0);

  span("totalJobs").innerText = jobs.length;
  span("activeJobs").innerText = jobs.filter(j => statusOf(j) === "Active").length;
  span("readyJobs").innerText = jobs.filter(j => statusOf(j) === "Ready").length;
  span("deliveredJobs").innerText = jobs.filter(j => statusOf(j) === "Delivered").length;
  span("totalSales").innerText = jobs.filter(j => statusOf(j) === "Pending").length;

  span("received").innerText = "\u20B9" + money(received);
  span("pendingAmount").innerText = "\u20B9" + money(pending);
  span("totalRevenue").innerText = "\u20B9" + money(totals.revenue);
}

/* ================= CHART ================= */
function updateChart(view) {
  if (!chartCanvas || !window.Chart) return;

  const now = new Date();
  const viewJobs =
    view === "all"
      ? jobs
      : jobs.filter(j => statusOf(j) === view || (view === "Pending" && statusOf(j) === "Pending"));

  let labels = [];
  let keys = [];
  let totals = new Map();
  let isMonthly = false;

  if (chartRange === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const days = [];
    let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (cursor <= end) {
      const key = cursor.toISOString().split("T")[0];
      const label = cursor.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      days.push({ key, label });
      cursor = addDays(cursor, 1);
    }
    totals = new Map(days.map(d => [d.key, 0]));
    labels = days.map(d => d.label);
    keys = days.map(d => d.key);
  } else if (chartRange === "custom") {
    const from = chartCustomRange.from;
    const to = chartCustomRange.to;
    if (!from || !to) {
      labels = [];
      totals = new Map();
    } else {
      const start = new Date(from);
      const end = new Date(to);
      if (isNaN(start) || isNaN(end) || start > end) {
        labels = [];
        totals = new Map();
      } else {
        const days = [];
        let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        while (cursor <= endDate) {
          const key = cursor.toISOString().split("T")[0];
          const label = cursor.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
          days.push({ key, label });
          cursor = addDays(cursor, 1);
        }
        totals = new Map(days.map(d => [d.key, 0]));
        labels = days.map(d => d.label);
        keys = days.map(d => d.key);
      }
    }
  } else {
    isMonthly = true;
    let startMonth;
    if (chartRange === "year") {
      startMonth = new Date(now.getFullYear(), 0, 1);
    } else {
      // lifetime
      let minDate = null;
      viewJobs.forEach(j => {
        const ymd = jobDateForView(j, view);
        if (!ymd) return;
        const dt = new Date(ymd);
        if (isNaN(dt)) return;
        if (!minDate || dt < minDate) minDate = dt;
      });
      startMonth = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth() - 11, 1);
    }

    const months = [];
    const cursor = new Date(startMonth.getFullYear(), startMonth.getMonth(), 1);
    const endMonth = chartRange === "year"
      ? new Date(now.getFullYear(), 11, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= endMonth) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const label = cursor.toLocaleString("en-IN", { month: "short", year: "2-digit" });
      months.push({ key, label });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    totals = new Map(months.map(m => [m.key, 0]));
    labels = months.map(m => m.label);
    keys = months.map(m => m.key);
  }

  if (chartMetric === "received") {
    payments.forEach(p => {
      const ymd = paymentDate(p);
      if (!ymd) return;
      const key = isMonthly ? ymd.slice(0, 7) : ymd;
      if (!totals.has(key)) return;
      totals.set(key, totals.get(key) + Number(p.amount || 0));
    });
  } else if (chartMetric === "pending") {
    // Pending based on job pendingAmount on job date
    viewJobs.forEach(j => {
      const ymd = jobDateForView(j, view);
      if (!ymd) return;
      const key = isMonthly ? ymd.slice(0, 7) : ymd;
      if (!totals.has(key)) return;
      totals.set(key, totals.get(key) + Number(j.pendingAmount || 0));
    });
  } else {
    viewJobs.forEach(j => {
      const ymd = jobDateForView(j, view);
      if (!ymd) return;
      const key = isMonthly ? ymd.slice(0, 7) : ymd;
      if (!totals.has(key)) return;
      const addVal = chartMetric === "revenue" ? Number(j.totalAmount || 0) : 1;
      totals.set(key, totals.get(key) + addVal);
    });
  }

  let data = keys.map(k => totals.get(k) || 0);
  if (chartMetric === "pending") {
    let running = 0;
    data = data.map(v => {
      running += Number(v || 0);
      return running;
    });
  }

  if (jobsChart) {
    jobsChart.data.labels = labels;
    jobsChart.data.datasets[0].data = data;
    jobsChart.data.datasets[0].label =
      chartMetric === "revenue"
        ? chartRange === "month"
          ? "Revenue (This Month)"
          : chartRange === "custom"
          ? "Revenue (Custom Range)"
          : chartRange === "year"
          ? "Revenue (This Year)"
          : "Revenue (Monthly)"
      : chartMetric === "received"
        ? chartRange === "month"
          ? "Received (This Month)"
          : chartRange === "custom"
          ? "Received (Custom Range)"
          : chartRange === "year"
          ? "Received (This Year)"
          : "Received (Monthly)"
      : chartMetric === "pending"
        ? chartRange === "month"
          ? "Pending (This Month)"
          : chartRange === "custom"
          ? "Pending (Custom Range)"
          : chartRange === "year"
          ? "Pending (This Year)"
          : "Pending (Monthly)"
        : chartRange === "month"
        ? "Jobs (This Month)"
        : chartRange === "custom"
        ? "Jobs (Custom Range)"
        : chartRange === "year"
        ? "Jobs (This Year)"
        : "Jobs (Monthly)";
    jobsChart.update();
    return;
  }

  jobsChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label:
            chartMetric === "revenue"
            ? chartRange === "month"
              ? "Revenue (This Month)"
              : chartRange === "custom"
              ? "Revenue (Custom Range)"
              : chartRange === "year"
              ? "Revenue (This Year)"
              : "Revenue (Monthly)"
          : chartMetric === "received"
            ? chartRange === "month"
              ? "Received (This Month)"
              : chartRange === "custom"
              ? "Received (Custom Range)"
              : chartRange === "year"
              ? "Received (This Year)"
              : "Received (Monthly)"
          : chartMetric === "pending"
            ? chartRange === "month"
              ? "Pending (This Month)"
              : chartRange === "custom"
              ? "Pending (Custom Range)"
              : chartRange === "year"
              ? "Pending (This Year)"
              : "Pending (Monthly)"
            : chartRange === "month"
            ? "Jobs (This Month)"
            : chartRange === "custom"
            ? "Jobs (Custom Range)"
            : chartRange === "year"
            ? "Jobs (This Year)"
            : "Jobs (Monthly)",
          data,
          borderColor: "#6ecbff",
          backgroundColor: "rgba(110,203,255,0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y ?? ctx.raw ?? 0;
              if (chartMetric === "revenue" || chartMetric === "received" || chartMetric === "pending") {
                return `\u20B9${Number(v).toLocaleString("en-IN")}`;
              }
              return `${Number(v)}`;
            }
          }
        }
      },
      interaction: {
        mode: "nearest",
        intersect: false
      },
      scales: {
        x: {
          ticks: { color: "#a9b6ff" },
          grid: { color: "rgba(38,51,106,.4)" }
        },
        y: {
          ticks: {
            color: "#a9b6ff",
            precision: 0,
            callback: v =>
              chartMetric === "revenue" || chartMetric === "received" || chartMetric === "pending"
                ? `\u20B9${Number(v).toLocaleString("en-IN")}`
                : v
          },
          grid: { color: "rgba(38,51,106,.4)" }
        }
      }
    }
  });
}

/* ================= VIEW SWITCH ================= */
window.filterView = (type, el) => {
  currentView = type;
  document.querySelectorAll(".card").forEach(c => c.classList.remove("active"));
  if (el) el.classList.add("active");
  renderView();
};

if (chartRangeSelect) {
  chartRangeSelect.addEventListener("change", e => {
    chartRange = e.target.value || "month";
    if (chartCustom) chartCustom.style.display = chartRange === "custom" ? "flex" : "none";
    if (chartRange === "custom") {
      const today = new Date();
      const from = addDays(today, -29).toISOString().split("T")[0];
      const to = today.toISOString().split("T")[0];
      if (chartFrom && !chartFrom.value) chartFrom.value = from;
      if (chartTo && !chartTo.value) chartTo.value = to;
      chartCustomRange = { from: chartFrom?.value || from, to: chartTo?.value || to };
    }
    updateChart(currentView);
  });
}

if (chartMetricSelect) {
  chartMetricSelect.addEventListener("change", e => {
    chartMetric = e.target.value || "count";
    updateChart(currentView);
  });
}

window.setChartMetric = metric => {
  chartMetric = metric || "count";
  if (chartMetricSelect) chartMetricSelect.value = chartMetric;
  updateChart(currentView);
};

if (chartApply) {
  chartApply.addEventListener("click", () => {
    chartCustomRange = {
      from: chartFrom?.value || "",
      to: chartTo?.value || ""
    };
    updateChart(currentView);
  });
}

// Initialize chart controls
if (chartRangeSelect) chartRangeSelect.value = chartRange;
if (chartMetricSelect) chartMetricSelect.value = chartMetric;
if (chartCustom) chartCustom.style.display = chartRange === "custom" ? "flex" : "none";

function renderView() {
  setTableHeaders(currentView);
  toggleChart(currentView);
  updateChart(currentView);
  if (currentView === "PendingAmount") {
    renderPendingCustomers();
  } else {
    renderJobs();
  }
}

function toggleChart(view) {
  if (!chartCanvas) return;
  const box = chartCanvas.closest(".chart-box");
  if (!box) return;
  box.style.display = "block";
}

function setTableHeaders(view) {
  if (!tableHead) return;
  if (view === "PendingAmount") {
    tableHead.innerHTML = `
      <tr>
        <th>Name</th>
        <th>Mobile</th>
        <th>Email</th>
        <th>Address</th>
        <th>&#8377; Balance</th>
        <th>Action</th>
      </tr>
    `;
    tableColCount = 6;
  } else {
    tableHead.innerHTML = `
      <tr>
        <th>Job No</th>
        <th>Data Copy</th>
        <th>System No</th>
        <th>Drive</th>
        <th>Studio</th>
        <th>Project</th>
        <th>Assigned At</th>
        <th>Editor</th>
        <th>Amount</th>
        <th>Pending Amount</th>
        <th>Paid Amount</th>
        <th>Ready</th>
        <th>Deliver</th>
        <th>Deleted At</th>
      </tr>
    `;
    tableColCount = 14;
  }
}

/* ================= JOBS TABLE ================= */
function renderJobs() {
  jobsTable.innerHTML = "";
  let rows = 0;

  const sorted = [...jobs].sort((a, b) => jobNoNum(b.jobNo) - jobNoNum(a.jobNo));
  sorted.forEach(j => {
    const s = statusOf(j);

    // filter rows
    if (currentView !== "all" && currentView !== s && currentView !== "Pending") return;
    if (currentView === "Pending" && s !== "Pending") return;

    jobsTable.innerHTML += `
      <tr>
        <td data-label="Job No">${j.jobNo || "-"}</td>
        <td data-label="Data Copy">${formatDate(j.dataCopyDate)}</td>
        <td data-label="System No">${j.systemNo || "-"}</td>
        <td data-label="Drive">${j.drive || "-"}</td>
        <td data-label="Studio">${j.studioName || j.customerName || "-"}</td>
        <td data-label="Project">${j.projectName || "-"}</td>
        <td data-label="Assigned At">${formatDate(j.assignedAt)}</td>
        <td data-label="Editor">${hideEmail(j.editor || j.editorName || j.assignedTo)}</td>
        <td data-label="Amount">\u20B9${money(j.totalAmount)}</td>
        <td data-label="Pending Amount">\u20B9${money(j.pendingAmount)}</td>
        <td data-label="Paid Amount">\u20B9${money(j.paidAmount)}</td>
        <td data-label="Ready">${
          currentView === "Active" && s === "Active"
            ? `<button class="btn-ready" onclick="markReady('${j.id}')">Ready</button>`
            : formatDate(j.dataReadyDate)
        }</td>
        <td data-label="Deliver">${
          currentView === "Ready" && s === "Ready"
            ? `<button class="btn-deliver" onclick="markDelivered('${j.id}')">Deliver</button>`
            : formatDate(j.dataDeliverDate)
        }</td>
        <td data-label="Deleted At">${
          currentView === "Delivered" && s === "Delivered" && !j.deletedAt
            ? `<button class="btn-delete" onclick="markDeleted('${j.id}')">Delete</button>`
            : formatDate(j.deletedAt)
        }</td>
      </tr>
    `;
    rows++;
  });

  if (rows === 0) {
    jobsTable.innerHTML = `<tr><td colspan="${tableColCount}" style="text-align:center;padding:16px">No jobs</td></tr>`;
  }
}

/* ================= PENDING AMOUNT - CUSTOMERS ================= */
function renderPendingCustomers() {
  jobsTable.innerHTML = "";
  let rows = 0;

  customers
    .filter(c => Number(c.balance || 0) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .forEach(c => {
      const name =
        (c.customerName && c.customerName.trim()) ||
        (c.studioName && c.studioName.trim()) ||
        "-";

      jobsTable.innerHTML += `
        <tr>
          <td data-label="Name"><strong>${name}</strong></td>
          <td data-label="Mobile">${c.phone || "-"}</td>
          <td data-label="Email">${c.email || "-"}</td>
          <td data-label="Address">${c.address || "-"}</td>
          <td data-label="Balance"><strong>\u20B9${money(c.balance)}</strong></td>
          <td data-label="Action">-</td>
        </tr>
      `;
      rows++;
    });

  if (rows === 0) {
    jobsTable.innerHTML = `<tr><td colspan="${tableColCount}" style="text-align:center;padding:16px">No pending customers</td></tr>`;
  }
}

/* ================= ACTIONS ================= */
window.markReady = id =>
  updateDoc(doc(db, "jobs", id), {
    dataReadyDate: new Date().toISOString().slice(0, 10),
    updatedAt: serverTimestamp()
  });

window.markDelivered = id =>
  updateDoc(doc(db, "jobs", id), {
    dataDeliverDate: new Date().toISOString().slice(0, 10),
    updatedAt: serverTimestamp()
  });

window.markDeleted = async id => {
  const d = new Date().toISOString().slice(0, 10);
  // Optimistic UI: hide button immediately
  const idx = jobs.findIndex(j => j.id === id);
  if (idx >= 0) {
    jobs[idx] = { ...jobs[idx], deletedAt: d, deleteData: 1 };
    renderView();
  }
  try {
    await updateDoc(doc(db, "jobs", id), {
      deleteData: 1,
      deletedAt: d,
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    alert("Delete update failed. Check Firestore rules or network.");
    console.error(e);
  }
};

window.deleteJob = async id => {
  const d = prompt("Delete date (YYYY-MM-DD):");
  if (!d) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    alert("Please enter date in YYYY-MM-DD format.");
    return;
  }
  await updateDoc(doc(db, "jobs", id), {
    deleteData: true,
    deletedAt: d,
    updatedAt: serverTimestamp()
  });
};

/* ================= SEARCH ================= */
search.oninput = e => {
  const v = e.target.value.toLowerCase();
  document.querySelectorAll("#jobsTable tr").forEach(r => {
    r.style.display = r.innerText.toLowerCase().includes(v) ? "" : "none";
  });
};







