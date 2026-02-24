import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  query,
  where,
  addDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyAcHb-VHdM30fb9qSR4dzclmNTxXsTofIw",
  authDomain: "jamallta-films-2-27d2b.firebaseapp.com",
  projectId: "jamallta-films-2-27d2b",
  storageBucket: "jamallta-films-2-27d2b.firebasestorage.app",
  messagingSenderId: "207209419416",
  appId: "1:207209419416:web:53ff512e34553e9286b6ed"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");
const callUpdateAuthUser = httpsCallable(functions, "updateAuthUser");


onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "/login";
  }
});

const modalBg = document.getElementById("modalBg");
const teamList = document.getElementById("teamList");
const closeBtn = document.getElementById("closeBtn");
const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const modalTitle = document.getElementById("modalTitle");
const msg = document.getElementById("msg");
const toast = document.getElementById("toast");
const empJobsBody = document.getElementById("empJobsBody");
const jobsSearch = document.getElementById("jobsSearch");
const jobsLineChartEl = document.getElementById("jobsLineChart");
const chartRange = document.getElementById("chartRange");
const chartCustom = document.getElementById("chartCustom");
const chartFrom = document.getElementById("chartFrom");
const chartTo = document.getElementById("chartTo");
const chartApply = document.getElementById("chartApply");
const teamSearch = document.getElementById("teamSearch");
const attPresent = document.getElementById("attPresent");
const attAbsent = document.getElementById("attAbsent");
const attLeave = document.getElementById("attLeave");
const attTotal = document.getElementById("attTotal");
const attDate = document.getElementById("attDate");
const attFilterDate = document.getElementById("attFilterDate");

const sJobs = document.getElementById("sJobs");
const sDelivered = document.getElementById("sDelivered");
const sPending = document.getElementById("sPending");
const sRevenue = document.getElementById("sRevenue");
const aPresent = document.getElementById("aPresent");
const aAbsent = document.getElementById("aAbsent");
const aLeave = document.getElementById("aLeave");
const profileAttDate = document.getElementById("profileAttDate");
const profileAttTime = document.getElementById("profileAttTime");
const profileAttStatus = document.getElementById("profileAttStatus");
const profileAttMark = document.getElementById("profileAttMark");
const profilePunchIn = document.getElementById("profilePunchIn");
const profilePunchOut = document.getElementById("profilePunchOut");
const profilePunchInfo = document.getElementById("profilePunchInfo");
const attMonthBody = document.getElementById("attMonthBody");
const attMonthFilter = document.getElementById("attMonthFilter");
const mWork = document.getElementById("mWork");
const mPayableSalary = document.getElementById("mPayableSalary");
const mActive = document.getElementById("mActive");
const mPending = document.getElementById("mPending");
const mTotalJobs = document.getElementById("mTotalJobs");
const tNotes = document.getElementById("tNotes");
const leaveRequestsBody = document.getElementById("leaveRequestsBody");
const leaveMeta = document.getElementById("leaveMeta");

const fName = document.getElementById("fName");
const fEmail = document.getElementById("fEmail");
const fRole = document.getElementById("fRole");
const fDepartment = document.getElementById("fDepartment");
const fPhone = document.getElementById("fPhone");
const fUpiId = document.getElementById("fUpiId");
const fSalary = document.getElementById("fSalary");
const fBankName = document.getElementById("fBankName");
const fPayableSalary = document.getElementById("fPayableSalary");
const fAccountNumber = document.getElementById("fAccountNumber");
const fEmployeeId = document.getElementById("fEmployeeId");
const fIfsc = document.getElementById("fIfsc");
const fCurrent = document.getElementById("fCurrent");
const fJoinDate = document.getElementById("fJoinDate");
const fExp = document.getElementById("fExp");
const fSkills = document.getElementById("fSkills");
const fShiftStart = document.getElementById("fShiftStart");
const fShiftEnd = document.getElementById("fShiftEnd");
const payMonth = document.getElementById("payMonth");
const payAmount = document.getElementById("payAmount");
const payMethod = document.getElementById("payMethod");
const payTxn = document.getElementById("payTxn");
const payPaidAmount = document.getElementById("payPaidAmount");
const payPendingAmount = document.getElementById("payPendingAmount");
const payOverpaidAmount = document.getElementById("payOverpaidAmount");
const payStatus = document.getElementById("payStatus");
const payQr = document.getElementById("payQr");
const btnGenQr = document.getElementById("btnGenQr");
const btnOpenUpi = document.getElementById("btnOpenUpi");
const btnMarkPaid = document.getElementById("btnMarkPaid");
const btnMarkPending = document.getElementById("btnMarkPending");

let currentID = null;
let empJobsUnsubs = [];
let employees = [];
let jobCounts = new Map();
let currentEmpJobs = [];
let jobsChart = null;
let chartMode = "month";
let customFrom = "";
let customTo = "";
let isAssigningIds = false;
let didAutoAssignIds = false;
let empAttendanceUnsub = null;
let currentEmpSalary = "";
let isEditMode = false;
let profileAttendanceDocId = null;
let attendanceRecords = [];
let currentEmpEmail = "";
let monthlyAttendanceRows = [];
let paymentUnsub = null;
let didAutoSetAttDate = false;
let currentEmpAttendanceRecords = [];
const HOLIDAY_FALLBACK = {
  2026: {
    "2026-02-15": "Maha Shivratri",
    "2026-03-04": "Holi",
    "2026-08-28": "Raksha Bandhan",
    "2026-09-04": "Janmashtami",
    "2026-11-08": "Diwali",
    "2026-11-11": "Bhai Dooj"
  }
};

const holidayMap = new Map();
let holidaysLoaded = false;

async function loadHolidays() {
  if (holidaysLoaded) return;
  holidayMap.clear();
  try {
    const snap = await getDocs(collection(db, "holidays"));
    snap.forEach((docSnap) => {
      const r = docSnap.data() || {};
      const ymd = toYMD(r.dateYMD || r.date || r.holidayDate || "");
      if (!ymd) return;
      const name = r.name || r.title || "Holiday";
      holidayMap.set(ymd, name);
    });
  } catch (err) {
    console.error("holidays load failed:", err);
  }

  if (!holidayMap.size) {
    const year = new Date().getFullYear();
    const fb = HOLIDAY_FALLBACK[year] || {};
    Object.keys(fb).forEach((d) => holidayMap.set(d, fb[d]));
  }

  holidaysLoaded = true;
}

function holidayName(ymd) {
  if (!ymd) return "";
  return holidayMap.get(ymd) || "";
}

function isSunday(ymd) {
  if (!ymd) return false;
  const d = new Date(`${ymd}T00:00:00`);
  return !isNaN(d) && d.getDay() === 0;
}

function isOffDay(ymd) {
  return isSunday(ymd) || !!holidayName(ymd);
}

function countWorkingDays(start, end) {
  if (!start || !end || end < start) return 0;
  const cursor = new Date(start);
  let count = 0;
  while (cursor <= end) {
    const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    if (!isOffDay(ymd)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}  return count;
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

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowHM() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function formatHM(value) {
  if (!value) return "--:--";
  if (typeof value === "string") return value.slice(0, 5);
  if (value?.seconds) {
    const d = new Date(value.seconds * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const d = new Date(value);
  if (!isNaN(d)) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  return "--:--";
}

function formatCount(value) {
  if (value == null) return "0";
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

function minutesToLabel(totalMinutes) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "--";
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  const h = hrs > 0 ? `${hrs}h` : "";
  const m = mins > 0 ? `${mins}m` : "";
  return [h, m].filter(Boolean).join(" ") || "--";
}

function minutesBetween(a, b) {
  if (!a || !b) return null;
  const start = a?.seconds ? new Date(a.seconds * 1000) : new Date(a);
  const end = b?.seconds ? new Date(b.seconds * 1000) : new Date(b);
  if (isNaN(start) || isNaN(end)) return null;
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.round(diff / 60000);
}

function hourlyRateFromSalary(monthlySalary) {
  const base = parseSalaryNumber(monthlySalary);
  if (!base) return 0;
  const WORKING_DAYS = 26;
  const HOURS_PER_DAY = 9;
  return base / (WORKING_DAYS * HOURS_PER_DAY);
}

function dailyEarnings({ status, workedMinutes, monthlySalary }) {
  const rate = hourlyRateFromSalary(monthlySalary);
  if (!rate) return 0;
  const st = normalizeStatus(status);
  if (Number.isFinite(workedMinutes) && workedMinutes > 0) {
    return Math.round((workedMinutes / 60) * rate);
  }
  if (st === "present") return Math.round(9 * rate);
  if (st === "half-day") return Math.round(4.5 * rate);
  return 0;
}

function monthKeyFromYMD(ymd) {
  if (!ymd) return "";
  return ymd.slice(0, 7);
}

function currentPayMonth() {
  return payMonth?.value || monthKeyFromYMD(todayYMD());
}

function paymentKey() {
  const email = (fEmail?.value || "").toLowerCase().trim();
  const empId = (fEmployeeId?.value || "").toString().trim();
  const keyBase = empId || email || "unknown";
  return keyBase.replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function paymentDocId() {
  return `${paymentKey()}_${currentPayMonth()}`;
}

function buildUpiLink({ upiId, name, amount, note }) {
  if (!upiId) return "";
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (name) params.set("pn", name);
  if (amount) params.set("am", amount);
  params.set("cu", "INR");
  if (note) params.set("tn", note);
  return `upi://pay?${params.toString()}`;
}

function setQrFromUpi(link) {
  if (!payQr) return;
  if (!link) {
    payQr.removeAttribute("src");
    return;
  }
  const primary = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(link)}`;
  const fallback = `https://chart.googleapis.com/chart?cht=qr&chs=220x220&chl=${encodeURIComponent(link)}`;
  payQr.onerror = () => {
    if (payQr.src !== fallback) {
      payQr.src = fallback;
    } else {
      showToast("QR image failed to load", true);
    }
  };
  payQr.src = primary;
}

function refreshAutoQr() {
  if (!payQr) return;
  const upiId = (fUpiId?.value || "").trim();
  const method = payMethod?.value || "upi";
  const amount = parseSalaryNumber(payAmount?.value || "") || 0;
  if (!upiId || method === "bank_transfer" || method === "manual") {
    setQrFromUpi("");
    return;
  }
  const name = fName?.value || "Employee";
  const note = `Salary ${currentPayMonth()}`;
  const link = buildUpiLink({ upiId, name, amount, note });
  setQrFromUpi(link);
}

async function savePayment(status) {
  const email = (fEmail?.value || "").toLowerCase().trim();
  const empId = (fEmployeeId?.value || "").toString().trim();
  const name = fName?.value || "";
  const upiId = (fUpiId?.value || "").trim();
  const amountRaw = payAmount?.value || "";
  const amount = parseSalaryNumber(amountRaw) || 0;
  const paidRaw = payPaidAmount?.value || "";
  let paidAmount = parseSalaryNumber(paidRaw);
  if (paidAmount == null) {
    paidAmount = status === "paid" ? amount : 0;
  }
  if (status === "paid") {
    paidAmount = amount;
  }
  const pendingAmount = Math.max(0, amount - paidAmount);
  const overpaidAmount = Math.max(0, paidAmount - amount);
  const method = payMethod?.value || "manual";
  const txnId = (payTxn?.value || "").trim();
  const monthKey = currentPayMonth();
  if (!email && !empId) return showToast("Missing employee info", true);

  const payload = {
    employeeEmail: email,
    employeeId: empId,
    employeeName: name,
    upiId,
    monthKey,
    amount,
    paidAmount,
    pendingAmount,
    overpaidAmount,
    method,
    status,
    txnId,
    updatedAt: serverTimestamp()
};
  try {
    await setDoc(doc(db, "salaryPayments", paymentDocId()), payload, { merge: true });
    showToast(status === "paid" ? "Payment marked paid" : "Payment updated");
  } catch (err) {
    console.error("savePayment error:", err);
    showToast("Payment update failed", true);
  }
}

function listenPayment() {
  if (paymentUnsub) paymentUnsub();
  if (!currentPayMonth()) return;
  const id = paymentDocId();
  paymentUnsub = onSnapshot(doc(db, "salaryPayments", id), (snap) => {
    const data = snap.exists() ? snap.data() : null;
    if (!payStatus) return;
    if (!data) {
      payStatus.textContent = "Status: Unpaid";
      return;
    }
    if (payAmount && data.amount != null) payAmount.value = formatSalary(data.amount);
    if (payPaidAmount && data.paidAmount != null) payPaidAmount.value = formatSalary(data.paidAmount);
    if (payPendingAmount && data.pendingAmount != null) payPendingAmount.value = formatSalary(data.pendingAmount);
    if (payOverpaidAmount && data.overpaidAmount != null) payOverpaidAmount.value = formatSalary(data.overpaidAmount);
    if (payMethod && data.method) payMethod.value = data.method;
    if (payTxn) payTxn.value = data.txnId || "";
    const amt = formatSalary(data.amount || 0);
    const paid = formatSalary(data.paidAmount || 0);
    const pending = formatSalary(data.pendingAmount || 0);
    const status = data.status || "pending";
    const method = data.method || "manual";
    const txn = data.txnId ? ` • Txn: ${data.txnId}` : "";
    const over = data.overpaidAmount ? ` • Overpaid Rs ${formatSalary(data.overpaidAmount)}` : "";
    payStatus.textContent = `Status: ${status.toUpperCase()} • ${method} • Total Rs ${amt} • Paid Rs ${paid} • Pending Rs ${pending}${over}${txn}`;
  });
}

function renderMonthlyAttendanceRows(rows) {
  if (!attMonthBody) return;
  const selectedMonth = attMonthFilter?.value || monthKeyFromYMD(todayYMD());
  const filtered = selectedMonth
    ? rows.filter(r => monthKeyFromYMD(r.date) === selectedMonth)
    : rows;
  if (!filtered.length) {
    attMonthBody.innerHTML = `<tr><td colspan="6" class="table-empty">No attendance records</td></tr>`;
    return;
  }
  const html = filtered.map(r => {
    const date = r.date || "--";
    const status = r.status || "-";
    const inTime = r.punchIn || "--:--";
    const outTime = r.punchOut || "--:--";
    const worked = r.worked || "--";
    const earned = dailyEarnings({
      status: r.status,
      workedMinutes: r.workedMinutes,
      monthlySalary: currentEmpSalary
    });
    return `
      <tr>
        <td data-label="Date">${date}</td>
        <td data-label="Status">${status}</td>
        <td data-label="Punch In">${inTime}</td>
        <td data-label="Punch Out">${outTime}</td>
        <td data-label="Worked">${worked}</td>
        <td data-label="Earnings">${formatSalary(earned)}</td>
      </tr>`;
  }).join("");
  attMonthBody.innerHTML = html;
}

function selectedMonthRange() {
  const monthKey = attMonthFilter?.value || monthKeyFromYMD(todayYMD());
  if (!monthKey) return null;
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return null;
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end };
}

function renderEmployeeAttendanceSummary(records) {
  const range = selectedMonthRange();
  let presentWork = 0;
  let leave = 0;
  let absent = 0;
  let holidayPresent = 0;
  let holidayBonus = 0;
  const latestByDate = new Map();

  records.forEach((r) => {
    const raw = r.attendanceAt || r.date || r.attendanceDate || r.createdAt || r.updatedAt;
    const d = raw?.seconds ? new Date(raw.seconds * 1000) : new Date(raw || 0);
    if (!range || isNaN(d) || d < range.start || d > range.end) return;
    const ymd = toYMD(r.dateYMD || r.attendanceAt || r.date || r.attendanceDate || r.createdAt || r.updatedAt);
    if (!ymd) return;
    const ts = attendanceRecordTs(r);
    const prev = latestByDate.get(ymd);
    if (!prev || ts >= prev.ts) latestByDate.set(ymd, { r, ts });
  });

  const monthlyRows = [];
  latestByDate.forEach(({ r }, ymd) => {
    const hasPunchOut = Boolean(r.punchOutAt || r.punchOutTime || r.punchOut);
    let st = normalizeStatus(r.status);
    if (st === "present" && !hasPunchOut) st = "half-day";

    const workedMinutes = Number.isFinite(r.workedMinutes)
      ? r.workedMinutes
      : minutesBetween(r.punchInAt, r.punchOutAt);
    const offDay = isOffDay(ymd);
    if (offDay) {
      if (st === "present" || st === "half-day") {
        holidayPresent += st === "half-day" ? 0.5 : 1;
        holidayBonus += dailyEarnings({ status: st, workedMinutes, monthlySalary: currentEmpSalary });
      }
    } else {
      if (st === "present") presentWork += 1;
      else if (st === "half-day") presentWork += 0.5;
      else if (st === "leave") leave += 1;
      else if (st === "absent") absent += 1;
    }
    const punchIn = formatHM(r.punchInAt || r.punchInTime || r.punchIn);
    const punchOut = formatHM(r.punchOutAt || r.punchOutTime || r.punchOut);
    const worked = minutesToLabel(workedMinutes);
    monthlyRows.push({
      date: ymd,
      status: st || "-",
      punchIn,
      punchOut,
      worked,
      workedMinutes
    });
  });

  monthlyRows.sort((a, b) => (a.date < b.date ? 1 : -1));
  monthlyAttendanceRows = monthlyRows;
  renderMonthlyAttendanceRows(monthlyAttendanceRows);

  const presentDisplay = presentWork + holidayPresent;
  const today = new Date();
  const endDate = range ? (range.end < today ? range.end : today) : today;
  const workingDays = range ? countWorkingDays(range.start, endDate) : Math.min(today.getDate(), 26);
  const expected = Math.min(26, workingDays);
  const autoAbsent = Math.max(0, expected - presentWork - leave - absent);
  absent += autoAbsent;

  if (aPresent) aPresent.textContent = formatCount(presentDisplay);
  if (aAbsent) aAbsent.textContent = formatCount(absent);
  if (aLeave) aLeave.textContent = formatCount(leave);

  const basePayable = calcPayableSalary(currentEmpSalary, presentWork, leave);
  const payable = basePayable == null ? 0 : basePayable + holidayBonus;
  if (mPayableSalary) mPayableSalary.textContent = basePayable == null ? "0" : formatSalary(payable);
  if (fPayableSalary) fPayableSalary.value = basePayable == null ? "0" : formatSalary(payable);
  if (payAmount && (!payAmount.value || payAmount.value === "0")) {
    payAmount.value = basePayable == null ? "" : formatSalary(payable);
  }
  if (payPaidAmount && (!payPaidAmount.value || payPaidAmount.value === "0")) {
    payPaidAmount.value = "0";
  }
  if (payPendingAmount) {
    const total = parseSalaryNumber(payAmount?.value || "") || 0;
    const paid = parseSalaryNumber(payPaidAmount?.value || "") || 0;
    payPendingAmount.value = formatSalary(Math.max(0, total - paid));
  }
  if (payOverpaidAmount) {
    const total = parseSalaryNumber(payAmount?.value || "") || 0;
    const paid = parseSalaryNumber(payPaidAmount?.value || "") || 0;
    payOverpaidAmount.value = formatSalary(Math.max(0, paid - total));
  }
  refreshAutoQr();
}

function toYMD(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const v = value.trim();
    // Handle DD-MM-YYYY
    const dmy = v.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    // Handle YYYY-MM-DD
    const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    return v.slice(0, 10);
  }
  if (value?.seconds) {
    const d = new Date(value.seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const d = new Date(value);
  if (!isNaN(d)) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function normalizeStatus(v) {
  return String(v || "").trim().toLowerCase();
}

function attendanceKeyFromRecord(r) {
  const email = (r.employeeEmail || r.email || "").toLowerCase().trim();
  if (email) return email;
  const empId = (r.employeeId || "").toString().trim();
  if (empId) return empId;
  const name = (r.name || r.fullName || "").toLowerCase().trim();
  return name || "";
}

function attendanceKeyFromEmployee(e) {
  const email = (e.email || "").toLowerCase().trim();
  if (email) return email;
  const empId = (e.employeeId || "").toString().trim();
  if (empId) return empId;
  const name = (e.fullName || "").toLowerCase().trim();
  return name || "";
}

function attendanceRecordTs(r) {
  const raw = r.attendanceAt || r.updatedAt || r.createdAt || r.attendanceDate || r.date;
  if (raw?.seconds) return raw.seconds * 1000;
  const d = new Date(raw || 0);
  if (!isNaN(d)) return d.getTime();
  const ymd = r.dateYMD ? new Date(r.dateYMD) : null;
  return ymd && !isNaN(ymd) ? ymd.getTime() : 0;
}

function renderAttendanceSummary(records, team = []) {
  let selectedDate = attFilterDate?.value || todayYMD();
  const latest = records
    .map(r => toYMD(r.dateYMD || r.attendanceAt || r.date || r.attendanceDate || r.createdAt || r.updatedAt))
    .filter(Boolean)
    .sort()
    .pop();
  if (!didAutoSetAttDate && latest) {
    const hasSelected = records.some(r => {
      const d = toYMD(r.dateYMD || r.attendanceAt || r.date || r.attendanceDate || r.createdAt || r.updatedAt);
      return d === selectedDate;
    });
    if (!hasSelected) {
      selectedDate = latest;
      if (attFilterDate) attFilterDate.value = latest;
      didAutoSetAttDate = true;
    }
  }
  if (attDate) attDate.textContent = selectedDate;
  let present = 0;
  let absent = 0;
  let leave = 0;
  let total = 0;
  const allowed = new Set(team.map(attendanceKeyFromEmployee).filter(Boolean));
  const latestByKey = new Map();

  records.forEach(r => {
    const dateVal = toYMD(r.dateYMD || r.attendanceAt || r.date || r.attendanceDate || r.createdAt || r.updatedAt);
    if (dateVal !== selectedDate) return;
    const key = attendanceKeyFromRecord(r);
    if (!key) return;
    if (allowed.size && !allowed.has(key)) return;
    const ts = attendanceRecordTs(r);
    const prev = latestByKey.get(key);
    if (!prev || ts >= prev.ts) latestByKey.set(key, { r, ts });
  });

  const offDay = isOffDay(selectedDate);
  latestByKey.forEach(({ r }) => {
    const hasPunchOut = Boolean(r.punchOutAt || r.punchOutTime || r.punchOut);
    let st = normalizeStatus(r.status);
    if (st === "present" && !hasPunchOut) st = "half-day";
    if (!st) return;
    if (offDay) {
      if (st === "present") { present += 1; total += 1; }
      else if (st === "half-day") { present += 0.5; total += 1; }
      return;
    }
    total += 1;
    if (st === "present") present += 1;
    else if (st === "half-day") present += 0.5;
    else if (st === "absent") absent += 1;
    else if (st === "leave") leave += 1;
  });

  if (attPresent) attPresent.textContent = present;
  if (attAbsent) attAbsent.textContent = absent;
  if (attLeave) attLeave.textContent = leave;
  if (attTotal) attTotal.textContent = total;
}

const parseEmpId = v => {
  const m = String(v || "").match(/(\d+)/g);
  return m ? Number(m.join("")) : 0;
};

function nextEmployeeId() {
  let max = 0;
  employees.forEach(e => {
    const n = parseEmpId(e.employeeId);
    if (n > max) max = n;
  });
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.style.background = isError ? "#ff4757" : "var(--accent)";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

async function createNotification({ userEmail, employeeId, title, message, type = "info" }) {
  try {
    await addDoc(collection(db, "notifications"), {
      userEmail: (userEmail || "").toLowerCase(),
      employeeId: employeeId || "",
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("createNotification error:", err);
  }
}

function setMessage(text, isError = false) {
  msg.textContent = text;
  msg.style.color = isError ? "#ffb7b7" : "#b6ffcc";
}

function openModal() {
  modalBg.style.display = "flex";
  modalBg.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modalBg.style.display = "none";
  modalBg.setAttribute("aria-hidden", "true");
  msg.textContent = "";
}

function resetForm() {
  [fName, fEmail, fRole, fDepartment, fPhone, fUpiId, fSalary, fBankName, fPayableSalary, fAccountNumber, fEmployeeId, fIfsc, fCurrent, fJoinDate, fExp, fSkills, fShiftStart, fShiftEnd].forEach(i => i.value = "");
  fEmployeeId.value = nextEmployeeId();
  fEmployeeId.readOnly = true;
  if (fJoinDate) {
    fJoinDate.value = new Date().toISOString().slice(0, 10);
    syncExperience();
  }
  if (tNotes) tNotes.value = "";
  if (saveBtn) saveBtn.textContent = "Save";
  setFormEditable(true);
  isEditMode = true;
}

function resetEmpJobsTable(text = "No projects loaded") {
  if (empJobsUnsubs.length) {
    empJobsUnsubs.forEach(u => u && u());
    empJobsUnsubs = [];
  }
  if (empAttendanceUnsub) empAttendanceUnsub();
  empJobsBody.innerHTML = `<tr><td colspan="7" class="table-empty">${text}</td></tr>`;
  currentEmpJobs = [];
  renderJobsChart([]);
  updateProfileStats([]);
  if (mPayableSalary) mPayableSalary.textContent = "0";
}

function validateForm() {
  if (!fName.value.trim()) return "Full name is required";
  if (!fEmail.value.trim()) return "Email is required";
  if (!fRole.value.trim()) return "Role is required";
  if (!fJoinDate.value) return "Joining date is required";
  return "";
}

function formatExperience(joinDate) {
  if (!joinDate) return "";
  const start = new Date(joinDate);
  if (isNaN(start)) return "";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0 && remMonths === 0) return "Fresher";
  const y = years > 0 ? `${years} year${years > 1 ? "s" : ""}` : "";
  const m = remMonths > 0 ? `${remMonths} month${remMonths > 1 ? "s" : ""}` : "";
  return [y, m].filter(Boolean).join(" ");
}

function formatSalary(value) {
  if (value == null || value === "") return "N/A";
  const num = Number(String(value).toString().replace(/,/g, "").trim());
  if (isNaN(num)) return String(value);
  return num.toLocaleString("en-IN");
}

function parseSalaryNumber(value) {
  const num = Number(String(value ?? "").replace(/,/g, "").trim());
  return isNaN(num) ? null : num;
}

function calcPayableSalary(monthlySalary, presentDays, leaveDays) {
  const base = parseSalaryNumber(monthlySalary);
  if (!base) return null;
  const WORKING_DAYS = 26;
  const HOURS_PER_DAY = 9;
  const PAID_LEAVE_DAYS = 3;
  const leave = Number(leaveDays || 0);
  const paidFull = Math.min(leave, PAID_LEAVE_DAYS);
  const paidHalf = Math.max(leave - PAID_LEAVE_DAYS, 0) * 0.5;
  const payableDays = Math.min(
    WORKING_DAYS,
    Number(presentDays || 0) + paidFull + paidHalf
  );
  const totalHours = WORKING_DAYS * HOURS_PER_DAY;
  const payableHours = payableDays * HOURS_PER_DAY;
  return Math.round((base / totalHours) * payableHours);
}

function syncExperience() {
  if (!fJoinDate) return;
  fExp.value = formatExperience(fJoinDate.value);
}

function dateFromTimestamp(ts) {
  if (!ts) return "";
  if (ts?.seconds) return new Date(ts.seconds * 1000).toISOString().slice(0, 10);
  const d = new Date(ts);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return "";
}

function normalizeSkills(raw) {
  return raw
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function buildEmployeePayload() {
  const finalEmpId = fEmployeeId.value.trim() || nextEmployeeId();
  fEmployeeId.value = finalEmpId;
  if (!fJoinDate.value) {
    fJoinDate.value = new Date().toISOString().slice(0, 10);
  }
  const exp = formatExperience(fJoinDate.value);
  fExp.value = exp;
  return {
    fullName: fName.value.trim(),
    email: fEmail.value.trim().toLowerCase(),
    role: fRole.value.trim(),
    department: fDepartment.value.trim(),
    phone: fPhone.value.trim(),
    phoneE164: normalizePhoneE164(fPhone.value),
    upiId: (fUpiId?.value || "").trim(),
    salary: (fSalary && fSalary.value || "").toString().trim(),
    bankName: (fBankName?.value || "").trim(),
    bankAccount: (fAccountNumber?.value || "").trim(),
    bankIfsc: (fIfsc?.value || "").trim(),
    employeeId: finalEmpId,
    current: fCurrent.value.trim(),
    joiningDate: fJoinDate.value,
    experience: exp,
    skills: normalizeSkills(fSkills.value || ""),
    shiftStart: (fShiftStart?.value || "").trim(),
    shiftEnd: (fShiftEnd?.value || "").trim(),
    updatedAt: serverTimestamp()
};
}

async function ensureAuthUser({ oldEmail, newEmail, phone, displayName }) {
  try {
    const res = await callUpdateAuthUser({
      oldEmail: (oldEmail || "").trim(),
      newEmail: (newEmail || "").trim(),
      phone: (phone || "").trim(),
      displayName: (displayName || "").trim()
    });
    return { ok: true, data: res?.data || {} };
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function sendResetIfCreated(authResult, email) {
  if (!authResult?.data?.created || !email) return;
  try {
    await sendPasswordResetEmail(auth, email);
    showToast("Auth user created. Reset email sent.");
  } catch (e) {
    console.error("Reset email failed:", e);
    showToast("Auth user created. Reset email failed.", true);
  }
}

function renderTeam() {
  if (!teamList) return;
  teamList.innerHTML = "";
  const teamCount = document.getElementById("teamCount");
  if (teamCount) teamCount.textContent = `${employees.length || 0} members`;
  if (!employees.length) {
    teamList.innerHTML = `<div class="empty-state">No team members found.</div>`;
    return;
  }

  const q = (teamSearch?.value || "").toLowerCase();
  const filtered = employees.filter(e => {
    if (!q) return true;
    const hay = `${e.fullName || ""} ${e.email || ""} ${e.role || ""} ${e.department || ""}`.toLowerCase();
    return hay.includes(q);
  });

  if (!filtered.length) {
    teamList.innerHTML = `<div class="empty-state">No matching team members.</div>`;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const keyA = (a.email || a.fullName || "").toLowerCase();
    const keyB = (b.email || b.fullName || "").toLowerCase();
    const countA = jobCounts.get(keyA) || 0;
    const countB = jobCounts.get(keyB) || 0;
    if (countB !== countA) return countB - countA;
    return (a.fullName || "").localeCompare(b.fullName || "");
  });

  sorted.forEach((d, idx) => {
    const key = (d.email || d.fullName || "").toLowerCase();
    const count = jobCounts.get(key) || 0;
    const card = document.createElement("div");
    card.className = "card";
    const joinText = d.joiningDate ? d.joiningDate : "N/A";
    const joinBadge = d.joiningDate ? "" : `<span class="badge warning">Set Joining Date</span>`;
    const email = d.email || "";
    const empId = d.employeeId || "";
    card.innerHTML = `
      <div class="name">${d.fullName || "No Name"}</div>
      <div class="small">${d.role || "No Role"} • ${d.department || "N/A"}</div>
      <div class="small">Experience: ${formatExperience(d.joiningDate) || d.experience || "N/A"}</div>
      <div class="small">Joining: ${joinText} ${joinBadge}</div>
      <div class="small">Email: ${d.email || "N/A"}</div>
      <div class="small">Salary: ${formatSalary(d.salary)}</div>
      <div class="small">Rank #${idx + 1} • Jobs: ${count}</div>
      <div class="att-controls">
        <input class="input att-date" type="date" />
        <input class="input att-time" type="time" />
        <select class="input att-select">
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="leave">Leave</option>
        </select>
        <button class="btn ghost att-mark-btn">Mark</button>
      </div>
    `;
    card.onclick = () => openProfile(d.id);
    const markBtn = card.querySelector(".att-mark-btn");
    const selectEl = card.querySelector(".att-select");
    const dateInput = card.querySelector(".att-date");
    const timeInput = card.querySelector(".att-time");
    if (dateInput) dateInput.value = todayYMD();
    if (timeInput) timeInput.value = nowHM();
    if (markBtn && selectEl && dateInput) {
      selectEl.addEventListener("click", (e) => e.stopPropagation());
      selectEl.addEventListener("change", (e) => e.stopPropagation());
      dateInput.addEventListener("click", (e) => e.stopPropagation());
      dateInput.addEventListener("change", (e) => e.stopPropagation());
      if (timeInput) {
        timeInput.addEventListener("click", (e) => e.stopPropagation());
        timeInput.addEventListener("change", (e) => e.stopPropagation());
      }
      markBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const status = selectEl.value || "present";
        const dateYMD = dateInput.value || todayYMD();
        const timeHM = timeInput?.value || nowHM();
        await markAttendance({
          name: d.fullName || "",
          email,
          employeeId: empId,
          status,
          dateYMD,
          timeHM,
        });
      });
    }
    teamList.appendChild(card);
  });
}

async function markAttendance({ name, email, employeeId, status, dateYMD, timeHM }) {
  try {
    const dateKey = dateYMD || todayYMD();
    const timeKey = timeHM || "00:00";
    const attendanceAt = new Date(`${dateKey}T${timeKey}:00`);
    let q = null;
    if (email) {
      q = query(
        collection(db, "attendance"),
        where("employeeEmail", "==", email),
        where("dateYMD", "==", dateKey)
      );
    } else if (employeeId) {
      q = query(
        collection(db, "attendance"),
        where("employeeId", "==", employeeId),
        where("dateYMD", "==", dateKey)
      );
    }

    if (q) {
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(doc(db, "attendance", snap.docs[0].id), {
          status,
          timeHM: timeKey,
          attendanceAt,
          updatedAt: serverTimestamp(),
        });
        showToast("Attendance updated");
        await createNotification({
          userEmail: email,
          employeeId,
          title: "Attendance Updated",
          message: `Attendance marked ${status} for ${dateKey} ${timeKey}.`,
          type: "attendance",
        });
        return;
      }
    }

    await addDoc(collection(db, "attendance"), {
      employeeEmail: email || "",
      employeeId: employeeId || "",
      name: name || "",
      status,
      dateYMD: dateKey,
      timeHM: timeKey,
      attendanceAt,
      createdAt: serverTimestamp(),
    });
    showToast("Attendance marked");
    await createNotification({
      userEmail: email,
      employeeId,
      title: "Attendance Marked",
      message: `Attendance marked ${status} for ${dateKey} ${timeKey}.`,
      type: "attendance",
    });
  } catch (err) {
    console.error("markAttendance error:", err);
    showToast("Attendance failed", true);
  }
}

async function getAttendanceDocForDate({ email, employeeId, dateKey }) {
  let q = null;
  if (email) {
    q = query(
      collection(db, "attendance"),
      where("employeeEmail", "==", email),
      where("dateYMD", "==", dateKey)
    );
  } else if (employeeId) {
    q = query(
      collection(db, "attendance"),
      where("employeeId", "==", employeeId),
      where("dateYMD", "==", dateKey)
    );
  }
  if (!q) return { id: null, data: null };
  const snap = await getDocs(q);
  if (snap.empty) return { id: null, data: null };
  const docSnap = snap.docs[0];
  return { id: docSnap.id, data: docSnap.data() };
}

async function refreshProfileAttendanceInfo() {
  if (!profilePunchInfo) return;
  const email = (fEmail?.value || "").toLowerCase().trim();
  const employeeId = fEmployeeId?.value || "";
  const dateKey = profileAttDate?.value || todayYMD();
  const { id, data } = await getAttendanceDocForDate({ email, employeeId, dateKey });
  profileAttendanceDocId = id;
  const punchIn = formatHM(data?.punchInAt || data?.punchInTime || data?.punchIn);
  const punchOut = formatHM(data?.punchOutAt || data?.punchOutTime || data?.punchOut);
  const workedMinutes = Number.isFinite(data?.workedMinutes)
    ? data.workedMinutes
    : minutesBetween(data?.punchInAt, data?.punchOutAt);
  const workedLabel = minutesToLabel(workedMinutes);
  profilePunchInfo.textContent = `Punch In: ${punchIn} • Punch Out: ${punchOut} • Worked: ${workedLabel}`;
}

async function punchAttendance(type) {
  const name = fName?.value || "";
  const email = (fEmail?.value || "").toLowerCase().trim();
  const employeeId = fEmployeeId?.value || "";
  const dateKey = profileAttDate?.value || todayYMD();
  const timeKey = profileAttTime?.value || nowHM();
  const attendanceAt = new Date(`${dateKey}T${timeKey}:00`);
  const payload = {
    employeeEmail: email || "",
    employeeId: employeeId || "",
    name: name || "",
    dateYMD: dateKey,
    attendanceAt,
    updatedAt: serverTimestamp()
};

  if (type === "in") {
    payload.punchInAt = attendanceAt;
    payload.punchInTime = timeKey;
    payload.status = "present";
  } else {
    payload.punchOutAt = attendanceAt;
    payload.punchOutTime = timeKey;
  }

  try {
    const { id, data } = await getAttendanceDocForDate({ email, employeeId, dateKey });
    if (type === "out") {
      const workedMinutes = minutesBetween(data?.punchInAt, attendanceAt);
      if (Number.isFinite(workedMinutes)) payload.workedMinutes = workedMinutes;
    }
    if (id) {
      await updateDoc(doc(db, "attendance", id), payload);
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "attendance"), payload);
    }
    showToast(type === "in" ? "Punch in saved" : "Punch out saved");
    await refreshProfileAttendanceInfo();
  } catch (err) {
    console.error("punchAttendance error:", err);
    showToast("Punch failed", true);
  }
}

async function assignMissingEmployeeIds() {
  if (isAssigningIds || didAutoAssignIds) return;
  if (!employees.length) return;
  isAssigningIds = true;
  try {
    const used = new Set();
    employees.forEach(e => {
      const id = (e.employeeId || "").toString().trim();
      if (id) used.add(id);
    });

    const missing = employees
      .filter(e => !(e.employeeId || "").toString().trim())
      .sort((a, b) => {
        const aKey = (a.fullName || a.email || a.id || "").toLowerCase();
        const bKey = (b.fullName || b.email || b.id || "").toLowerCase();
        return aKey.localeCompare(bKey);
      });

    let counter = 1;
    for (const e of missing) {
      while (used.has(`EMP-${String(counter).padStart(3, "0")}`)) counter++;
      const newId = `EMP-${String(counter).padStart(3, "0")}`;
      used.add(newId);
      await updateDoc(doc(db, "employees", e.id), { employeeId: newId });
      counter++;
    }
    didAutoAssignIds = true;
  } catch (err) {
    console.error("Auto-assign employee IDs failed:", err);
  } finally {
    isAssigningIds = false;
  }
}

async function openProfile(id) {
  currentID = id;
  deleteBtn.style.display = "inline-block";
  msg.textContent = "";
  resetEmpJobsTable();

  const snap = await getDoc(doc(db, "employees", id));
  if (!snap.exists()) return;

  const d = snap.data();
  fName.value = d.fullName || "";
  fEmail.value = d.email || "";
  currentEmpEmail = d.email || "";
  fRole.value = d.role || "";
  fDepartment.value = d.department || "";
  fPhone.value = d.phone || "";
  if (fUpiId) fUpiId.value = d.upiId || "";
  if (fSalary) fSalary.value = d.salary || "";
  if (fBankName) fBankName.value = d.bankName || "";
  if (fPayableSalary) fPayableSalary.value = "0";
  currentEmpSalary = d.salary || "";
  if (fAccountNumber) fAccountNumber.value = d.bankAccount || "";
  fEmployeeId.value = d.employeeId || "";
  fEmployeeId.readOnly = true;
  if (fIfsc) fIfsc.value = d.bankIfsc || "";
  if (fShiftStart) fShiftStart.value = d.shiftStart || "";
  if (fShiftEnd) fShiftEnd.value = d.shiftEnd || "";
  fCurrent.value = d.current || "";
  fJoinDate.value = d.joiningDate || dateFromTimestamp(d.createdAt) || "";
  fExp.value = formatExperience(fJoinDate.value) || d.experience || "N/A";
  fSkills.value = (d.skills || []).join(", ");
  if (tNotes) tNotes.value = d.notes || "";

  modalTitle.innerText = `Edit Team Member: ${d.fullName || "Unnamed"}`;
  if (saveBtn) saveBtn.textContent = "Edit";
  setFormEditable(false);
  isEditMode = false;
  if (profileAttDate) profileAttDate.value = todayYMD();
  if (profileAttTime) profileAttTime.value = nowHM();
  if (profileAttStatus) profileAttStatus.value = "present";
  refreshProfileAttendanceInfo();
  if (d.email || d.employeeId || d.fullName) {
    loadEmployeeJobs(d.email || "", d.employeeId || "", d.fullName || "");
  }
  loadEmployeeAttendance(d.email, d.employeeId, d.fullName || "");
  if (payMonth) payMonth.value = monthKeyFromYMD(todayYMD());
  if (payAmount) payAmount.value = "";
  if (payTxn) payTxn.value = "";
  if (payMethod) payMethod.value = "upi";
  listenPayment();
  openModal();
}

function loadEmployeeAttendance(email, empId, fullName = "") {
  if (empAttendanceUnsub) empAttendanceUnsub();

  const sources = [];
  if (email) {
    sources.push({
      key: "email",
      q: query(collection(db, "attendance"), where("employeeEmail", "==", email))
    });
  }
  if (empId) {
    sources.push({
      key: "empId",
      q: query(collection(db, "attendance"), where("employeeId", "==", empId))
    });
  }
  if (fullName) {
    sources.push({
      key: "name",
      q: query(collection(db, "attendance"), where("name", "==", fullName))
    });
    sources.push({
      key: "fullName",
      q: query(collection(db, "attendance"), where("fullName", "==", fullName))
    });
  }

  if (!sources.length) {
    currentEmpAttendanceRecords = [];
    renderEmployeeAttendanceSummary([]);
    return;
  }

  const recordsBySource = new Map();
  const handleSnapshot = (key, snap) => {
    const map = new Map();
    snap.forEach((docSnap) => {
      map.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
    });
    recordsBySource.set(key, map);
    const merged = new Map();
    recordsBySource.forEach(m => m.forEach((v, k) => merged.set(k, v)));
    const records = Array.from(merged.values());
    currentEmpAttendanceRecords = records;
    loadHolidays().then(() => renderEmployeeAttendanceSummary(records));
  };

  const unsubs = [];
  sources.forEach(({ key, q }) => {
    const unsub = onSnapshot(q, snap => handleSnapshot(key, snap));
    unsubs.push(unsub);
  });
  empAttendanceUnsub = () => unsubs.forEach(u => u && u());
}

function loadEmployeeJobs(email, empId = "", fullName = "") {
  // listen on multiple fields (email, name, employeeId) and merge results
  if (empJobsUnsubs.length) {
    empJobsUnsubs.forEach(u => u && u());
    empJobsUnsubs = [];
  }

  const sources = [];
  if (email) {
    sources.push({
      key: "email",
      q: query(collection(db, "jobs"), where("assignedToEmail", "==", email))
    });
  }
  if (fullName) {
    sources.push({
      key: "name",
      q: query(collection(db, "jobs"), where("assignedTo", "==", fullName))
    });
  }
  if (empId) {
    sources.push({
      key: "empId",
      q: query(collection(db, "jobs"), where("assignedToId", "==", empId))
    });
  }

  if (!sources.length) {
    resetEmpJobsTable("No projects");
    return;
  }

  const jobsBySource = new Map();
  const handleSnapshot = (key, snap) => {
    const map = new Map();
    snap.forEach(s => {
      const j = { id: s.id, ...s.data() };
      map.set(s.id, j);
    });
    jobsBySource.set(key, map);
    const merged = new Map();
    jobsBySource.forEach(m => m.forEach((v, k) => merged.set(k, v)));
    currentEmpJobs = Array.from(merged.values());
    if (!currentEmpJobs.length) return resetEmpJobsTable("No projects");
    renderJobsTable();
    renderJobsChart(currentEmpJobs);
    updateProfileStats(currentEmpJobs);
  };

  sources.forEach(({ key, q }) => {
    const unsub = onSnapshot(q, snap => handleSnapshot(key, snap));
    empJobsUnsubs.push(unsub);
  });
}

function updateProfileStats(jobs) {
  const totalJobs = jobs.length;
  const delivered = jobs.filter(j => (j.status || "").toLowerCase() === "delivered").length;
  const pending = jobs.filter(j => (j.status || "").toLowerCase() === "pending").length;
  const revenue = jobs.reduce((a, j) => a + Number(j.totalAmount || 0), 0);
  if (sJobs) sJobs.textContent = totalJobs;
  if (sDelivered) sDelivered.textContent = delivered;
  if (sPending) sPending.textContent = pending;
  if (sRevenue) sRevenue.textContent = `${revenue.toLocaleString("en-IN")}`;

  if (aPresent) aPresent.textContent = "0";
  if (aAbsent) aAbsent.textContent = "0";
  if (aLeave) aLeave.textContent = "0";

  const now = new Date();
  const range = getRange();

  let workSum = 0;
  let activeCount = 0;
  let pendingCount = 0;
  let rangeJobs = 0;

  const isDoneStatus = (status) => {
    const s = String(status || "").toLowerCase();
    return s === "ready" || s === "delivered" || s === "completed" || s === "cancelled";
  };

  jobs.forEach(j => {
    const rawDate = j.assignedAt || j.dataCopyDate || j.date || j.createdAt;
    const jobDate = rawDate?.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate || 0);
    if (isNaN(jobDate)) {
      if (chartMode === "lifetime") {
        workSum += Number(j.totalAmount || 0);
      }
      return;
    }
    const isInRange = inRange(jobDate, range);

    if (isInRange) {
      rangeJobs += 1;
      workSum += Number(j.totalAmount || 0);
    }

    const status = String(j.status || "").toLowerCase();
    const isAssigned = status === "assigned";
    if (!isDoneStatus(status) && isInRange && (isAssigned || status === "inprogress" || status === "progress")) {
      const ageDays = Math.floor((now - jobDate) / (1000 * 60 * 60 * 24));
      if (ageDays >= 10) pendingCount += 1;
      else activeCount += 1;
    }
  });

  if (mWork) mWork.textContent = workSum.toLocaleString("en-IN");
  if (mActive) mActive.textContent = activeCount;
  if (mPending) mPending.textContent = pendingCount;
  if (mTotalJobs) mTotalJobs.textContent = rangeJobs;
}

function renderJobsTable() {
  const q = (jobsSearch?.value || "").toLowerCase();
  empJobsBody.innerHTML = "";
  let rows = 0;
  const range = getRange();

  currentEmpJobs.forEach(j => {
    const hay = `${j.jobNo || ""} ${j.studioName || ""} ${j.projectName || ""}`.toLowerCase();
    if (q && !hay.includes(q)) return;
    const rawDate = j.assignedAt || j.dataCopyDate || j.date || j.createdAt;
    const jobDate = rawDate?.seconds ? new Date(rawDate.seconds * 1000) : new Date(rawDate || 0);
    if (!isNaN(jobDate) && !inRange(jobDate, range)) return;
    const total = Number(j.totalAmount || 0);
    const advance = Number(j.advancePayment || 0);
    empJobsBody.innerHTML += `
      <tr>
        <td data-label="Job No">${j.jobNo || "-"}</td>
        <td data-label="Studio">${j.studioName || "-"}</td>
        <td data-label="Project">${j.projectName || "-"}</td>
        <td data-label="Total">${total}</td>
        <td data-label="Advance">${advance}</td>
        <td data-label="Pending">${total - advance}</td>
        <td data-label="Status">${j.status || "Pending"}</td>
      </tr>`;
    rows++;
  });
  if (rows === 0) {
    empJobsBody.innerHTML = `<tr><td colspan="7" class="table-empty">No matching jobs</td></tr>`;
  }
}

function jobDateToYMD(j) {
  const raw = j.assignedAt || j.dataCopyDate || j.date || j.createdAt;
  if (!raw) return "";
  if (raw?.seconds) return new Date(raw.seconds * 1000).toISOString().slice(0, 10);
  const d = new Date(raw);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return "";
}

function getRange() {
  const now = new Date();
  let start = null;
  let end = null;
  if (chartMode === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (chartMode === "year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  } else if (chartMode === "custom" && customFrom && customTo) {
    start = new Date(customFrom + "T00:00:00");
    end = new Date(customTo + "T23:59:59");
  } else {
    start = null;
    end = null;
  }
  return { start, end };
}

function inRange(jobDate, range) {
  if (!range.start || !range.end) return true;
  return jobDate >= range.start && jobDate <= range.end;
}

function renderJobsChart(jobs) {
  if (!jobsLineChartEl || !window.Chart) return;
  const now = new Date();
  let labels = [];
  let data = [];

  if (chartMode === "year" || chartMode === "lifetime" || chartMode === "custom") {
    let start = new Date(now.getFullYear(), 0, 1);
    let end = now;

    if (chartMode === "custom") {
      const range = getRange();
      start = range.start || new Date(now.getFullYear(), now.getMonth(), 1);
      end = range.end || now;
    } else if (chartMode === "lifetime") {
      const dates = jobs.map(j => jobDateToYMD(j)).filter(Boolean).sort();
      if (dates.length) {
        const first = new Date(dates[0] + "T00:00:00");
        start = new Date(first.getFullYear(), first.getMonth(), 1);
      }
    }

    if (chartMode === "year") {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 1);
    }

    const monthKeys = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      monthKeys.push(key);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const counts = new Map(monthKeys.map(k => [k, 0]));
    jobs.forEach(j => {
      const ymd = jobDateToYMD(j);
      if (!ymd) return;
      const key = ymd.slice(0, 7);
      if (!counts.has(key)) return;
      const jobDate = new Date(ymd + "T00:00:00");
      if (chartMode === "custom" && !inRange(jobDate, getRange())) return;
      counts.set(key, counts.get(key) + 1);
    });
    labels = monthKeys;
    data = monthKeys.map(k => counts.get(k) || 0);
  } else {
    const days = [];
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    const counts = new Map(days.map(d => [d, 0]));
    jobs.forEach(j => {
      const ymd = jobDateToYMD(j);
      if (!counts.has(ymd)) return;
      counts.set(ymd, counts.get(ymd) + 1);
    });
    labels = days.map(d => String(parseInt(d.slice(8, 10), 10)));
    data = days.map(d => counts.get(d) || 0);
  }
  if (jobsChart) {
    jobsChart.data.labels = labels;
    jobsChart.data.datasets[0].data = data;
    jobsChart.update();
    return;
  }
  jobsChart = new Chart(jobsLineChartEl, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Jobs",
        data,
        borderColor: "#6ecbff",
        backgroundColor: "rgba(110,203,255,0.15)",
        tension: 0.35,
        fill: true,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#a9b6ff" }, grid: { color: "rgba(38,51,106,.4)" } },
        y: { ticks: { color: "#a9b6ff", precision: 0 }, grid: { color: "rgba(38,51,106,.4)" } }
      }
    }
  });
}

async function saveEmployee() {
  if (currentID && !isEditMode) {
    setFormEditable(true);
    isEditMode = true;
    if (saveBtn) saveBtn.textContent = "Save";
    return;
  }
  const error = validateForm();
  if (error) {
    setMessage(error, true);
    return;
  }

  const payload = buildEmployeePayload();

  try {
    const oldEmail = currentEmpEmail || "";
    const authPhone = payload.phoneE164 || "";
    if (!currentID) {
      const authResult = await ensureAuthUser({
        oldEmail: "",
        newEmail: payload.email,
        phone: authPhone,
        displayName: payload.fullName
      });
      if (!authResult.ok) {
        console.error("Auth user create failed:", authResult.error);
        showToast("Auth create failed. Saved employee only.", true);
      } else {
        await sendResetIfCreated(authResult, payload.email);
      }
      payload.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "employees"), payload);
      currentID = ref.id;
      showToast("Team member added");
      await createNotification({
        userEmail: payload.email,
        employeeId: payload.employeeId,
        title: "Profile Created",
        message: "Your profile has been created by admin.",
        type: "profile",
      });
    } else {
      const authResult = await ensureAuthUser({
        oldEmail,
        newEmail: payload.email,
        phone: authPhone,
        displayName: payload.fullName
      });
      if (!authResult.ok) {
        console.error("Auth user update failed:", authResult.error);
        showToast("Auth update failed. Saved employee only.", true);
      } else {
        await sendResetIfCreated(authResult, payload.email);
      }
      await updateDoc(doc(db, "employees", currentID), payload);
      showToast("Team member updated");
      await createNotification({
        userEmail: payload.email,
        employeeId: payload.employeeId,
        title: "Profile Updated",
        message: "Your profile details were updated by admin.",
        type: "profile",
      });
    }
    setMessage("");
    closeModal();
    isEditMode = false;
    currentEmpEmail = payload.email || "";
  } catch (err) {
    console.error("Save error:", err);
    setMessage("Failed to save. Check permissions.", true);
  }
}

function setFormEditable(editable) {
  const inputs = [fName, fEmail, fRole, fDepartment, fPhone, fUpiId, fSalary, fBankName, fAccountNumber, fIfsc, fCurrent, fJoinDate, fSkills, fShiftStart, fShiftEnd];
  inputs.forEach((el) => {
    if (!el) return;
    el.readOnly = !editable;
    el.disabled = !editable;
  });
  if (fEmployeeId) fEmployeeId.readOnly = true;
  if (fExp) fExp.readOnly = true;
  if (fPayableSalary) fPayableSalary.readOnly = true;
}

async function deleteEmployee() {
  if (!currentID) return;
  if (!confirm("Delete this team member?")) return;
  try {
    await deleteDoc(doc(db, "employees", currentID));
    showToast("Team member deleted");
    closeModal();
  } catch (err) {
    console.error("Delete error:", err);
    setMessage("Failed to delete.", true);
  }
}

onSnapshot(collection(db, "employees"), (snap) => {
  employees = [];
  snap.forEach((docSnap) => {
    employees.push({ id: docSnap.id, ...docSnap.data() });
  });
  renderTeam();
  loadHolidays().then(() => renderAttendanceSummary(attendanceRecords, employees));
  assignMissingEmployeeIds();
}, (err) => {
  if (teamList) teamList.innerHTML = `<div class="empty-state">Failed to load team. Check permissions.</div>`;
  console.error("Employees snapshot error:", err);
});

onSnapshot(collection(db, "jobs"), (snap) => {
  jobCounts = new Map();
  snap.forEach(docSnap => {
    const j = docSnap.data();
    
    const email = (j.assignedToEmail || "").toLowerCase();
    const name = (j.assignedTo || "").toLowerCase();
    const key = email || name;
    if (!key) return;
    const status = String(j.status || "").toLowerCase();
    if (status === "ready" || status === "delivered" || status === "completed" || status === "cancelled") return;
    jobCounts.set(key, (jobCounts.get(key) || 0) + 1);
  });
  renderTeam();
}, (err) => {
  console.error("Jobs snapshot error:", err);
});

onSnapshot(collection(db, "attendance"), (snap) => {
  const records = [];
  snap.forEach(docSnap => {
    records.push(docSnap.data());
  });
  attendanceRecords = records;
  loadHolidays().then(() => renderAttendanceSummary(attendanceRecords, employees));
}, (err) => {
  console.error("Attendance snapshot error:", err);
  if (attDate) attDate.textContent = "Failed to load";
});

onSnapshot(collection(db, "leaveRequests"), (snap) => {
  const rows = [];
  let pending = 0;
  snap.forEach((docSnap) => {
    const r = docSnap.data() || {};
    const status = String(r.status || "pending").toLowerCase();
    if (status === "pending") pending += 1;
    rows.push({
      id: docSnap.id,
      name: r.employeeName || r.name || r.employeeEmail || "-",
      from: r.fromDate || "",
      to: r.toDate || "",
      days: r.days || 0,
      reason: r.reason || "-",
      status,
      employeeEmail: r.employeeEmail || "",
      employeeId: r.employeeId || "",
    });
  });

  if (leaveMeta) leaveMeta.textContent = `${pending} pending`;
  if (!leaveRequestsBody) return;
  if (!rows.length) {
    leaveRequestsBody.innerHTML = `<tr><td colspan="7" class="table-empty">No leave requests</td></tr>`;
    return;
  }
  rows.sort((a, b) => (a.status === "pending" && b.status !== "pending" ? -1 : 1));
  leaveRequestsBody.innerHTML = rows
    .map((r) => {
      const isPending = r.status === "pending";
      const statusLabel = r.status.toUpperCase();
      return `
        <tr>
          <td data-label="Employee">${r.name}</td>
          <td data-label="From">${r.from}</td>
          <td data-label="To">${r.to}</td>
          <td data-label="Days">${r.days}</td>
          <td data-label="Reason">${r.reason}</td>
          <td data-label="Status">${statusLabel}</td>
          <td data-label="Actions">
            <button class="btn ${isPending ? "primary" : "ghost"}" data-approve="${r.id}" ${isPending ? "" : "disabled"}>Approve</button>
            <button class="btn danger" data-reject="${r.id}" ${isPending ? "" : "disabled"}>Reject</button>
          </td>
        </tr>
      `;
    })
    .join("");

  leaveRequestsBody.querySelectorAll("button[data-approve]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-approve");
      try {
        await updateDoc(doc(db, "leaveRequests", id), {
          status: "approved",
          adminNote: "Approved",
          actionAt: serverTimestamp(),
        });
        showToast("Leave approved");
      } catch (err) {
        console.error("approve leave error:", err);
        showToast("Approve failed", true);
      }
    });
  });
  leaveRequestsBody.querySelectorAll("button[data-reject]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-reject");
      const note = prompt("Reject reason?");
      if (!note) return;
      try {
        await updateDoc(doc(db, "leaveRequests", id), {
          status: "rejected",
          adminNote: note,
          actionAt: serverTimestamp(),
        });
        showToast("Leave rejected");
      } catch (err) {
        console.error("reject leave error:", err);
        showToast("Reject failed", true);
      }
    });
  });
}, (err) => {
  console.error("Leave requests snapshot error:", err);
  if (leaveRequestsBody) {
    leaveRequestsBody.innerHTML = `<tr><td colspan="7" class="table-empty">Failed to load leave requests</td></tr>`;
  }
});

if (jobsSearch) {
  jobsSearch.addEventListener("input", renderJobsTable);
}

if (chartRange) {
  chartRange.addEventListener("change", () => {
    chartMode = chartRange.value || "month";
    if (chartCustom) {
      chartCustom.style.display = chartMode === "custom" ? "flex" : "none";
    }
    renderJobsChart(currentEmpJobs);
    updateProfileStats(currentEmpJobs);
    renderJobsTable();
  });
}

if (chartApply) {
  chartApply.addEventListener("click", () => {
    customFrom = chartFrom?.value || "";
    customTo = chartTo?.value || "";
    renderJobsChart(currentEmpJobs);
    updateProfileStats(currentEmpJobs);
    renderJobsTable();
  });
}

if (teamSearch) {
  teamSearch.addEventListener("input", renderTeam);
}

if (attFilterDate) {
  attFilterDate.value = todayYMD();
  attFilterDate.addEventListener("change", () => {
    didAutoSetAttDate = true;
    loadHolidays().then(() => renderAttendanceSummary(attendanceRecords, employees));
  });
}

if (profileAttMark) {
  profileAttMark.addEventListener("click", async () => {
    if (!currentID) return;
    const name = fName?.value || "";
    const email = (fEmail?.value || "").toLowerCase().trim();
    const employeeId = fEmployeeId?.value || "";
    const dateYMD = profileAttDate?.value || todayYMD();
    const timeHM = profileAttTime?.value || nowHM();
    const status = profileAttStatus?.value || "present";
    await markAttendance({ name, email, employeeId, status, dateYMD, timeHM });
  });
}

if (profileAttDate) {
  profileAttDate.addEventListener("change", () => {
    refreshProfileAttendanceInfo();
  });
}

if (profilePunchIn) {
  profilePunchIn.addEventListener("click", () => punchAttendance("in"));
}

if (profilePunchOut) {
  profilePunchOut.addEventListener("click", () => punchAttendance("out"));
}

if (attMonthFilter) {
  attMonthFilter.value = monthKeyFromYMD(todayYMD());
  attMonthFilter.addEventListener("change", () => {
    renderMonthlyAttendanceRows(monthlyAttendanceRows);
    if (currentEmpAttendanceRecords.length) {
      renderEmployeeAttendanceSummary(currentEmpAttendanceRecords);
    }
  });
}

if (payMonth) {
  payMonth.value = monthKeyFromYMD(todayYMD());
  payMonth.addEventListener("change", () => {
    listenPayment();
    refreshAutoQr();
  });
}

if (btnGenQr) {
  btnGenQr.addEventListener("click", () => {
    const upiId = (fUpiId?.value || "").trim();
    const name = fName?.value || "Employee";
    const amount = parseSalaryNumber(payAmount?.value || "") || 0;
    const note = `Salary ${currentPayMonth()}`;
    const link = buildUpiLink({ upiId, name, amount, note });
    if (!link) return showToast("UPI ID missing", true);
    setQrFromUpi(link);
    showToast("QR generated");
  });
}

if (payMethod) {
  payMethod.addEventListener("change", refreshAutoQr);
}

if (payAmount) {
  payAmount.addEventListener("input", refreshAutoQr);
}

if (fUpiId) {
  fUpiId.addEventListener("input", refreshAutoQr);
}

if (payPaidAmount) {
  payPaidAmount.addEventListener("input", () => {
    const total = parseSalaryNumber(payAmount?.value || "") || 0;
    const paid = parseSalaryNumber(payPaidAmount.value || "") || 0;
    if (payPendingAmount) {
      payPendingAmount.value = formatSalary(Math.max(0, total - paid));
    }
    if (payOverpaidAmount) {
      payOverpaidAmount.value = formatSalary(Math.max(0, paid - total));
    }
  });
}

if (btnOpenUpi) {
  btnOpenUpi.addEventListener("click", () => {
    const upiId = (fUpiId?.value || "").trim();
    const name = fName?.value || "Employee";
    const amount = parseSalaryNumber(payAmount?.value || "") || 0;
    const note = `Salary ${currentPayMonth()}`;
    const link = buildUpiLink({ upiId, name, amount, note });
    if (!link) return showToast("UPI ID missing", true);
    window.location.href = link;
  });
}

if (btnMarkPaid) {
  btnMarkPaid.addEventListener("click", () => savePayment("paid"));
}

if (btnMarkPending) {
  btnMarkPending.addEventListener("click", () => savePayment("pending"));
}


if (fJoinDate) {
  fJoinDate.addEventListener("change", syncExperience);
}

if (modalBg) {
  modalBg.addEventListener("click", (e) => {
    if (e.target === modalBg) closeModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

saveBtn.addEventListener("click", saveEmployee);
closeBtn.addEventListener("click", closeModal);
deleteBtn.addEventListener("click", deleteEmployee);

document.getElementById("openAdd").onclick = () => {
  currentID = null;
  currentEmpEmail = "";
  modalTitle.innerText = "Add New Team Member";
  deleteBtn.style.display = "none";
  setMessage("");
  resetForm();
  resetEmpJobsTable();
  openModal();
};

const btnSyncAuth = document.getElementById("btnSyncAuth");
if (btnSyncAuth) {
  btnSyncAuth.addEventListener("click", async () => {
    if (!employees.length) return showToast("No team members to sync", true);
    if (!confirm("Sync all team emails to Firebase Authentication?")) return;
    let ok = 0;
    let failed = 0;
    for (const emp of employees) {
      const email = (emp.email || "").trim();
      if (!email) continue;
      const res = await ensureAuthUser({
        oldEmail: "",
        newEmail: email,
        phone: emp.phone || "",
        displayName: emp.fullName || ""
      });
      if (res.ok) ok += 1;
      else failed += 1;
    }
    if (failed === 0) showToast(`Synced ${ok} users to Auth`);
    else showToast(`Synced ${ok}, Failed ${failed}`, true);
  });
}

console.log("Team Admin Loaded");




