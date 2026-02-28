import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  addDoc,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const avatarEl = document.getElementById("avatar");
const userNameEl = document.getElementById("userName");
const userRoleEl = document.getElementById("userRole");
const loadingInfo = document.getElementById("loadingInfo");
const infoFields = document.getElementById("infoFields");
const attendanceStats = document.getElementById("attendanceStats");
const paymentStats = document.getElementById("paymentStats");
const empActiveCount = document.getElementById("empActiveCount");
const empPendingCount = document.getElementById("empPendingCount");
const empTotalCount = document.getElementById("empTotalCount");
const jobsTableBody = document.getElementById("jobsTableBody");
const jobsSearchInput = document.getElementById("jobsSearchInput");
const clearSearchBtn = document.getElementById("clearSearchBtn");
const empJobsChartEl = document.getElementById("empJobsChart");
const customRangeRow = document.getElementById("customRangeRow");
const customFromInput = document.getElementById("customFrom");
const customToInput = document.getElementById("customTo");
const applyCustomRangeBtn = document.getElementById("applyCustomRange");
const salarySlipBtn = document.getElementById("salarySlipBtn");
const salarySlipMode = document.getElementById("salarySlipMode");
const salaryMonthSingle = document.getElementById("salaryMonthSingle");
const salaryMonthRange = document.getElementById("salaryMonthRange");
const salaryMonthFrom = document.getElementById("salaryMonthFrom");
const salaryMonthTo = document.getElementById("salaryMonthTo");
const editorModal = document.getElementById("projectEditorModal");
const closeEditorModal = document.getElementById("closeEditorModal");
const cancelEditor = document.getElementById("cancelEditor");
const deleteProjectBtn = document.getElementById("deleteProjectBtn");
const saveProjectChanges = document.getElementById("saveProjectChanges");
const editProjectName = document.getElementById("editProjectName");
const editJobNo = document.getElementById("editJobNo");
const editStudioName = document.getElementById("editStudioName");
const editDataReadyDate = document.getElementById("editDataReadyDate");
const editDataReadyToday = document.getElementById("editDataReadyToday");
const editDataDeliverDate = document.getElementById("editDataDeliverDate");
const itemSelectSearch = document.getElementById("itemSelectSearch");
const itemSuggestions = document.getElementById("itemSuggestions");
const itemSelect = document.getElementById("itemSelect");
const itemValue = document.getElementById("itemValue");
const addItemBtn = document.getElementById("addItemBtn");
const itemsList = document.getElementById("itemsList");
const toastEl = document.getElementById("toast");
const leaveFrom = document.getElementById("leaveFrom");
const leaveTo = document.getElementById("leaveTo");
const leaveReason = document.getElementById("leaveReason");
const submitLeaveBtn = document.getElementById("submitLeaveBtn");
const leaveMsg = document.getElementById("leaveMsg");
const leaveTableBody = document.getElementById("leaveTableBody");

let allAssignedJobs = [];
let filteredJobs = [];
let jobsChart = null;
let activeCardFilter = "all";
let chartRange = "month";
let customRange = { from: null, to: null };
let jobsUnsubs = [];
let jobsBySource = new Map();
let currentEditingJobId = null;
let currentEditingJobData = null;
let currentJobItems = [];
let currentStudioItems = [];

const refreshInfoBtn = document.getElementById("refreshInfoBtn");
const logoutBtn = document.getElementById("logoutBtn");
const backToPanel = document.getElementById("backToPanel");

let currentUserEmail = "";
let currentUserId = "";
let currentUserData = null;
let paymentUnsub = null;
let leaveUnsub = null;

const setIfExists = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.value = value;
};

const formatDate = (value) => {
  if (!value) return "-";
  if (value?.seconds) {
    const d = new Date(value.seconds * 1000);
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  }
  const d = new Date(value);
  if (isNaN(d)) return "-";
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
};

const formatSalary = (value) => {
  if (value == null || value === "") return "-";
  const num = Number(String(value).toString().replace(/,/g, "").trim());
  if (isNaN(num)) return String(value);
  return num.toLocaleString("en-IN");
};

const parseSalaryNumber = (value) => {
  const num = Number(String(value ?? "").replace(/,/g, "").trim());
  return isNaN(num) ? null : num;
};

function toYMD(value) {
  if (!value) return "";
  if (value?.seconds) {
    const d = new Date(value.seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const d = new Date(value);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthKeyFromYMD(ymd) {
  if (!ymd) return "";
  return ymd.slice(0, 7);
}

function daysBetweenInclusive(fromStr, toStr) {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  if (isNaN(from) || isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
}

function includesWeeklyOff(fromStr, toStr, weeklyOffDay = 0) {
  const from = new Date(fromStr + "T00:00:00");
  const to = new Date(toStr + "T00:00:00");
  if (isNaN(from) || isNaN(to) || to < from) return false;
  const cursor = new Date(from);
  while (cursor <= to) {
    if (cursor.getDay() === weeklyOffDay) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

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
  const st = String(status || "").trim().toLowerCase();
  if (Number.isFinite(workedMinutes) && workedMinutes > 0) {
    return Math.round((workedMinutes / 60) * rate);
  }
  if (st === "present") return Math.round(9 * rate);
  if (st === "half-day") return Math.round(4.5 * rate);
  return 0;
}

function setLeaveMsg(text, isError = false) {
  if (!leaveMsg) return;
  leaveMsg.textContent = text;
  leaveMsg.style.color = isError ? "var(--error)" : "var(--muted)";
}

async function submitLeaveRequest() {
  if (!currentUserEmail) return;
  const from = leaveFrom?.value || "";
  const to = leaveTo?.value || "";
  const reason = (leaveReason?.value || "").trim();
  if (!from || !to) return setLeaveMsg("Select from and to dates", true);
  if (monthKeyFromYMD(from) !== monthKeyFromYMD(to)) {
    return setLeaveMsg("Leave must be within same month", true);
  }
  const days = daysBetweenInclusive(from, to);
  if (days <= 0) return setLeaveMsg("Invalid date range", true);
  if (days > 3) return setLeaveMsg("Max 3 days per request", true);
  if (!includesWeeklyOff(from, to, 0)) {
    return setLeaveMsg("Leave must include weekly off (Sunday)", true);
  }

  try {
    const monthKey = monthKeyFromYMD(from);
    const q = query(
      collection(db, "leaveRequests"),
      where("employeeEmail", "==", currentUserEmail),
      where("monthKey", "==", monthKey)
    );
    const snap = await getDocs(q);
    let used = 0;
    snap.forEach((d) => {
      const r = d.data() || {};
      const st = String(r.status || "").toLowerCase();
      if (st === "approved" || st === "pending") {
        used += Number(r.days || 0);
      }
    });
    if (used + days > 3) {
      return setLeaveMsg("Monthly leave limit is 3 days", true);
    }

    await addDoc(collection(db, "leaveRequests"), {
      employeeEmail: currentUserEmail,
      employeeId:
        currentUserData?.employeeId ||
        currentUserData?.empId ||
        currentUserData?.employeeID ||
        "",
      employeeName: currentUserData?.fullName || currentUserData?.name || "",
      fromDate: from,
      toDate: to,
      days,
      reason,
      status: "pending",
      monthKey,
      createdAt: serverTimestamp(),
    });
    setLeaveMsg("Leave request submitted");
    if (leaveReason) leaveReason.value = "";
  } catch (err) {
    console.error("leave request error:", err);
    setLeaveMsg("Failed to submit request", true);
  }
}

function listenLeaveRequests() {
  if (leaveUnsub) leaveUnsub();
  if (!currentUserEmail) return;
  const q = query(collection(db, "leaveRequests"), where("employeeEmail", "==", currentUserEmail));
  leaveUnsub = onSnapshot(q, (snap) => {
    if (!leaveTableBody) return;
    const rows = [];
    snap.forEach((d) => {
      const r = d.data() || {};
      rows.push({
        from: r.fromDate || toYMD(r.fromDate),
        to: r.toDate || toYMD(r.toDate),
        days: r.days || 0,
        status: (r.status || "pending").toString().toUpperCase(),
        note: r.adminNote || r.rejectionReason || "-",
        createdAt: r.createdAt?.seconds || 0,
      });
    });
    rows.sort((a, b) => b.createdAt - a.createdAt);
    if (!rows.length) {
      leaveTableBody.innerHTML = `<tr><td class="center muted" colspan="5">No leave requests</td></tr>`;
      return;
    }
    leaveTableBody.innerHTML = rows
      .map(
        (r) => `
        <tr>
          <td>${r.from || "-"}</td>
          <td>${r.to || "-"}</td>
          <td>${r.days}</td>
          <td>${r.status}</td>
          <td>${r.note}</td>
        </tr>
      `
      )
      .join("");
  });
}

const calcPayableSalary = (monthlySalary, presentDays, leaveDays) => {
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
  const payable = (base / totalHours) * payableHours;
  return Math.round(payable);
};

const calcExperience = (value) => {
  if (!value) return "-";
  const start = value?.seconds ? new Date(value.seconds * 1000) : new Date(value);
  if (isNaN(start)) return "-";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0 && rem === 0) return "Fresher";
  const y = years > 0 ? `${years} year${years > 1 ? "s" : ""}` : "";
  const m = rem > 0 ? `${rem} month${rem > 1 ? "s" : ""}` : "";
  return [y, m].filter(Boolean).join(" ");
};

function toYMDLocal(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextHolidayText() {
  const nameKey = (currentUserData?.fullName || currentUserData?.name || "").toString().trim().toLowerCase();
  const emailKey = (currentUserData?.email || currentUserEmail || "").toLowerCase().trim();
  const lastLeaveMap = {
    "shivani": "2026-02-03",
    "manisha": "2026-02-04",
    "maisha": "2026-02-04",
    "anjali": "2026-02-05",
    "ajali": "2026-02-05",
    "sandeep": "2026-02-06",
  };

  let last = null;
  Object.keys(lastLeaveMap).forEach((k) => {
    if (!last && nameKey.includes(k)) last = lastLeaveMap[k];
    if (!last && emailKey.includes(k)) last = lastLeaveMap[k];
  });
  if (!last) return "-";
  let next = new Date(last);
  const today = new Date(toYMDLocal(new Date()));
  while (next < today) {
    next.setDate(next.getDate() + 8);
  }
  return formatDate(next);
}

function monthKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function paymentKeyFromUser() {
  const empId =
    currentUserData?.employeeId ||
    currentUserData?.empId ||
    currentUserData?.employeeID ||
    currentUserData?.employee_id ||
    currentUserData?.empID ||
    "";
  const base = empId || currentUserEmail || "";
  return String(base).replace(/[^a-z0-9]/gi, "_").toLowerCase();
}

function listenPaymentSummary() {
  if (paymentUnsub) paymentUnsub();
  const key = paymentKeyFromUser();
  if (!key) return;
  const docId = `${key}_${monthKeyNow()}`;
  paymentUnsub = onSnapshot(doc(db, "salaryPayments", docId), (snap) => {
    const data = snap.exists() ? snap.data() : null;
    if (paymentStats) paymentStats.style.display = "grid";
    const total = formatSalary(data?.amount || 0);
    const paid = formatSalary(data?.paidAmount || 0);
    const pending = formatSalary(data?.pendingAmount || 0);
    const status = data?.status ? String(data.status).toUpperCase() : "UNPAID";
    const over = data?.overpaidAmount ? ` (Overpaid ${formatSalary(data.overpaidAmount)})` : "";
    setIfExists("payTotal", total);
    setIfExists("payPaid", paid);
    setIfExists("payPending", pending);
    setIfExists("payStatusText", `${status}${over}`);
  });
}

async function loadNextLeaveInfo() {
  try {
    setIfExists("eNextLeave", getNextHolidayText());
  } catch (err) {
    console.error("next leave error:", err);
  }
}

async function loadEmployeeInfo() {
  try {
    await loadHolidays();
    const qEmp = query(collection(db, "employees"), where("email", "==", currentUserEmail));
    const empSnap = await getDocs(qEmp);
    let data = null;
    if (!empSnap.empty) {
      data = empSnap.docs[0].data();
    } else {
      const userDoc = await getDoc(doc(db, "users", currentUserId));
      if (userDoc.exists()) data = userDoc.data();
    }

    if (!data) {
      if (loadingInfo) loadingInfo.textContent = "No employee profile found.";
      return;
    }

    currentUserData = data;
    const fullName = data.fullName || data.name || currentUserEmail;
    const role = data.role || "Employee";
    const skills = Array.isArray(data.skills) ? data.skills.join(", ") : data.skills || "-";

    if (userNameEl) userNameEl.textContent = fullName;
    if (userRoleEl) userRoleEl.textContent = role;
    if (avatarEl)
      avatarEl.textContent = fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    setIfExists("eName", fullName);
    setIfExists("eEmail", data.email || currentUserEmail);
    setIfExists("eRole", role);
    setIfExists("eDepartment", data.department || "-");
    setIfExists("ePhone", data.phone || "-");
    const baseSalary = data.salary || data.monthlySalary || data.pay;
    setIfExists("eSalary", formatSalary(baseSalary));
    setIfExists("eEmployeeId", data.employeeId || data.empId || data.employeeID || data.employee_id || data.empID || "-");
    const joinRaw = data.joiningDate || data.createdAt;
    setIfExists("eJoiningDate", formatDate(joinRaw));
    setIfExists("eExperience", data.experience || calcExperience(joinRaw) || "-");
    setIfExists("eSkills", skills);
    setIfExists("eUpiId", data.upiId || "-");
    setIfExists("eBankName", data.bankName || "-");
    setIfExists("eBankAccount", data.bankAccount || "-");
    setIfExists("eBankIfsc", data.bankIfsc || "-");
    setIfExists("eShiftStart", data.shiftStart || "-");
    setIfExists("eShiftEnd", data.shiftEnd || "-");
    loadNextLeaveInfo();
    listenPaymentSummary();
    listenLeaveRequests();

    if (loadingInfo) loadingInfo.style.display = "none";
    if (infoFields) infoFields.style.display = "grid";
    if (attendanceStats) attendanceStats.style.display = "grid";

    const attPresent = document.getElementById("attPresent");
    const attAbsent = document.getElementById("attAbsent");
    const attLeave = document.getElementById("attLeave");

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);

    const normalizeStatus = (v) => String(v || "").trim().toLowerCase();
    const toDate = (v) => {
      if (!v) return null;
      if (v?.seconds) return new Date(v.seconds * 1000);
      const d = new Date(v);
      return isNaN(d) ? null : d;
    };

    const emailKey = (data.email || currentUserEmail || "").toLowerCase();
    const empIdKey = (data.employeeId || "").toString().trim();

    onSnapshot(collection(db, "attendance"), (snap) => {
      let presentWork = 0;
      let absent = 0;
      let leave = 0;
      let holidayPresent = 0;
      let holidayBonus = 0;
      snap.forEach((docSnap) => {
        const r = docSnap.data() || {};
        const d = toDate(r.date || r.attendanceDate || r.createdAt || r.updatedAt);
        if (!d || d < monthStart || d > monthEnd) return;
        const rEmail = (r.email || r.employeeEmail || "").toLowerCase();
        const rEmpId = (r.employeeId || r.empId || "").toString().trim();
        if (emailKey && rEmail && rEmail !== emailKey) return;
        if (!emailKey && empIdKey && rEmpId && rEmpId !== empIdKey) return;
        const st = normalizeStatus(r.status);
        const ymd = toYMD(r.dateYMD || r.date || r.attendanceDate || r.createdAt || r.updatedAt);
        const offDay = isOffDay(ymd);
        const workedMinutes = Number.isFinite(r.workedMinutes)
          ? r.workedMinutes
          : minutesBetween(r.punchInAt, r.punchOutAt);
        if (offDay) {
          if (st === "present" || st === "half-day") {
            holidayPresent += st === "half-day" ? 0.5 : 1;
            holidayBonus += dailyEarnings({ status: st, workedMinutes, monthlySalary: baseSalary });
          }
          return;
        }
        if (st === "present") presentWork += 1;
        else if (st === "half-day") presentWork += 0.5;
        else if (st === "absent") absent += 1;
        else if (st === "leave") leave += 1;
      });
      const presentDisplay = presentWork + holidayPresent;
      if (attPresent) attPresent.textContent = presentDisplay;
      if (attAbsent) attAbsent.textContent = absent;
      if (attLeave) attLeave.textContent = leave;

      const basePayable = calcPayableSalary(baseSalary, presentWork, leave);
      const payable = basePayable == null ? 0 : basePayable + holidayBonus;
      setIfExists("ePayableSalary", basePayable == null ? "-" : formatSalary(payable));
    });
  } catch (err) {
    console.error("loadEmployeeInfo error:", err);
    if (loadingInfo) loadingInfo.textContent = "Error loading employee info.";
  }
}

// formatDate already defined above

function parseJobDate(job) {
  const raw =
    job.addItemDate ||
    job.dataCopyDate ||
    job.dataReadyDate ||
    job.dataDeliverDate ||
    (job.assignedAt && (job.assignedAt.toDate ? job.assignedAt.toDate() : job.assignedAt)) ||
    job.date ||
    null;
  return parseDateFlexible(raw);
}

function parseDateFlexible(value) {
  if (!value || value === "-") return null;
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value instanceof Date) return isNaN(value) ? null : value;

  const str = String(value).trim();
  if (!str) return null;

  // Handle DD-MM-YYYY or DD/MM/YYYY
  const dmY = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmY) {
    const day = Number(dmY[1]);
    const month = Number(dmY[2]) - 1;
    const year = Number(dmY[3]);
    const d = new Date(year, month, day);
    return isNaN(d) ? null : d;
  }

  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function applyJobsSearch() {
  const searchTerm = (jobsSearchInput && jobsSearchInput.value || "").toLowerCase().trim();
  const base = filterJobsByCard(filterJobsByRange(allAssignedJobs), activeCardFilter);
  if (!searchTerm) {
    filteredJobs = [...base];
  } else {
    filteredJobs = base.filter(job => {
      return (
        (job.projectName && job.projectName.toLowerCase().includes(searchTerm)) ||
        (job.jobNo && job.jobNo.toLowerCase().includes(searchTerm)) ||
        (job.studioName && job.studioName.toLowerCase().includes(searchTerm))
      );
    });
  }
  renderJobsTable();
}

function renderJobsTable() {
  if (!jobsTableBody) return;
  jobsTableBody.innerHTML = "";
  if (!filteredJobs.length) {
    jobsTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="center muted">
          ${allAssignedJobs.length ? "No matching projects found" : "No projects assigned"}
        </td>
      </tr>`;
    return;
  }
  filteredJobs.forEach((job) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    const total = Number(job.totalAmount || 0);
    const paid = Number(job.paidAmount || 0);
    const paymentStatus = total > 0 && paid >= total ? "Paid" : "Unpaid";
    tr.innerHTML = `
      <td>${job.jobNo}</td>
      <td>${formatDate(job.dataCopyDate)}</td>
      <td>${job.systemNo}</td>
      <td>${job.drive}</td>
      <td>${job.studioName}</td>
      <td>${job.projectName}</td>
      <td>${formatDate(job.dataReadyDate)}</td>
      <td>${formatDate(job.dataDeliverDate)}</td>
      <td>${paymentStatus}</td>
      <td>${formatDate(job.deletedAt)}</td>
    `;
    tr.addEventListener("click", () => {
      openProjectEditor(job.id);
    });
    jobsTableBody.appendChild(tr);
  });
}

function renderJobsChart(jobs) {
  if (!empJobsChartEl || !window.Chart) return;
  const now = new Date();
  let labels = [];
  let data = [];

  if (chartRange === "month") {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, "0"));
    data = new Array(daysInMonth).fill(0);
    jobs.forEach((job) => {
      const d = parseJobDate(job);
      if (!d) return;
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      data[d.getDate() - 1] += 1;
    });
  } else if (chartRange === "year") {
    const year = now.getFullYear();
    labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    data = new Array(12).fill(0);
    jobs.forEach((job) => {
      const d = parseJobDate(job);
      if (!d) return;
      if (d.getFullYear() !== year) return;
      data[d.getMonth()] += 1;
    });
  } else {
    if (chartRange === "custom" && customRange.from && customRange.to) {
      const from = new Date(customRange.from);
      const to = new Date(customRange.to);
      const dayCount = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
      if (dayCount <= 62) {
        labels = Array.from({ length: dayCount }, (_, i) => {
          const d = new Date(from);
          d.setDate(from.getDate() + i);
          return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        });
        data = new Array(dayCount).fill(0);
        jobs.forEach((job) => {
          const d = parseJobDate(job);
          if (!d) return;
          if (d < from || d > to) return;
          const idx = Math.floor((d - from) / (1000 * 60 * 60 * 24));
          if (idx >= 0 && idx < data.length) data[idx] += 1;
        });
      } else {
        const byMonth = new Map();
        jobs.forEach((job) => {
          const d = parseJobDate(job);
          if (!d || d < from || d > to) return;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          byMonth.set(key, (byMonth.get(key) || 0) + 1);
        });
        const months = Array.from(byMonth.keys()).sort();
        labels = months.map((m) => {
          const parts = m.split("-");
          return `${parts[1]}-${parts[0]}`;
        });
        data = months.map((m) => byMonth.get(m) || 0);
      }
    } else {
      // lifetime: group by month across all time
      const byMonth = new Map();
      let min = null;
      let max = null;
      jobs.forEach((job) => {
        const d = parseJobDate(job);
        if (!d) return;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        byMonth.set(key, (byMonth.get(key) || 0) + 1);
      });
      if (min && max) {
        const cursor = new Date(min.getFullYear(), min.getMonth(), 1);
        const end = new Date(max.getFullYear(), max.getMonth(), 1);
        while (cursor <= end) {
          const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
          const label = cursor.toLocaleString("en-US", { month: "short" }).toUpperCase() + `-${String(cursor.getFullYear()).slice(-2)}`;
          labels.push(label);
          data.push(byMonth.get(key) || 0);
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }
    }
  }

  if (jobsChart) {
    jobsChart.data.labels = labels;
    jobsChart.data.datasets[0].data = data;
    jobsChart.update();
    return;
  }

  jobsChart = new Chart(empJobsChartEl, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Jobs",
        data,
        borderColor: "#5eb1ff",
        backgroundColor: "rgba(94,177,255,0.18)",
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9fb0ff" }, grid: { color: "rgba(38,51,106,.3)" } },
        y: { ticks: { color: "#9fb0ff" }, grid: { color: "rgba(38,51,106,.3)" }, beginAtZero: true },
      },
    },
  });
}

function renderSummary(jobs) {
  const now = new Date();
  let active = 0;
  let pending = 0;
  let total = 0;

  jobs.forEach((job) => {
    if (!isJobInRange(job, now, chartRange)) return;
    total += 1;

    if (isJobActive(job.status)) active += 1;
    if (isJobPending(job, now)) pending += 1;
  });

  if (empActiveCount) empActiveCount.textContent = active;
  if (empPendingCount) empPendingCount.textContent = pending;
  if (empTotalCount) empTotalCount.textContent = total;
}

function isJobActive(status) {
  const st = String(status || "").toLowerCase();
  return st === "assigned" || st === "in progress";
}

function isJobReadyOrDelivered(status) {
  const st = String(status || "").toLowerCase();
  return st === "ready" || st === "delivered";
}

function isJobPending(job, now) {
  const d = parseJobDate(job);
  if (!d) return false;
  const ageDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  return ageDays >= 10 && !isJobReadyOrDelivered(job.status);
}

function isJobInCurrentMonth(job, now) {
  const d = parseJobDate(job);
  return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isJobInCurrentYear(job, now) {
  const d = parseJobDate(job);
  return !!d && d.getFullYear() === now.getFullYear();
}

function isJobInRange(job, now, range) {
  if (range === "year") return isJobInCurrentYear(job, now);
  if (range === "lifetime") return !!parseJobDate(job);
  if (range === "custom") {
    if (!customRange.from || !customRange.to) return false;
    const d = parseJobDate(job);
    if (!d) return false;
    const from = new Date(customRange.from);
    const to = new Date(customRange.to);
    return d >= from && d <= to;
  }
  return isJobInCurrentMonth(job, now);
}

function filterJobsByCard(jobs, filter) {
  if (!filter || filter === "all") return jobs;
  const now = new Date();
  if (filter === "active") {
    return jobs.filter(j => isJobActive(j.status) && isJobInRange(j, now, chartRange));
  }
  if (filter === "pending") {
    return jobs.filter(j => isJobPending(j, now) && isJobInRange(j, now, chartRange));
  }
  if (filter === "total") {
    return jobs.filter(j => isJobInRange(j, now, chartRange));
  }
  return jobs;
}

function filterJobsByRange(jobs) {
  const now = new Date();
  return jobs.filter(j => isJobInRange(j, now, chartRange));
}

function bindSummaryClicks() {
  const cards = document.querySelectorAll(".mini-card.clickable");
  if (!cards.length) return;
  cards.forEach((card) => {
    const setActive = () => {
      activeCardFilter = card.getAttribute("data-filter") || "all";
      applyJobsSearch();
    };
    card.addEventListener("click", setActive);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive();
      }
    });
  });
}

function bindChartFilters() {
  const buttons = document.querySelectorAll(".chart-filter");
  if (!buttons.length) return;
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      chartRange = btn.getAttribute("data-range") || "month";
      if (customRangeRow) customRangeRow.style.display = chartRange === "custom" ? "flex" : "none";
      if (chartRange === "custom") {
        const now = new Date();
        const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        if (customFromInput && !customFromInput.value) customFromInput.value = defaultFrom.toISOString().slice(0, 10);
        if (customToInput && !customToInput.value) customToInput.value = now.toISOString().slice(0, 10);
        if (!customRange.from || !customRange.to) {
          customRange = { from: customFromInput?.value || null, to: customToInput?.value || null };
        }
      }
      renderJobsChart(allAssignedJobs);
      renderSummary(allAssignedJobs);
      applyJobsSearch();
    });
  });
}

function bindCustomRange() {
  if (!applyCustomRangeBtn || !customFromInput || !customToInput) return;
  applyCustomRangeBtn.addEventListener("click", () => {
    const from = customFromInput.value;
    const to = customToInput.value;
    if (!from || !to) return;
    if (new Date(from) > new Date(to)) {
      customRange = { from: to, to: from };
      customFromInput.value = customRange.from;
      customToInput.value = customRange.to;
    } else {
      customRange = { from, to };
    }
    chartRange = "custom";
    document.querySelectorAll(".chart-filter").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-range") === "custom");
    });
    if (customRangeRow) customRangeRow.style.display = "flex";
    renderJobsChart(allAssignedJobs);
    renderSummary(allAssignedJobs);
    applyJobsSearch();
  });
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

async function fetchAttendanceRecords() {
  const emailKey = (currentUserData?.email || currentUserEmail || "").toLowerCase();
  const empIdKey = (currentUserData?.employeeId || "").toString().trim();
  const records = new Map();

  if (emailKey) {
    const snap = await getDocs(
      query(collection(db, "attendance"), where("employeeEmail", "==", emailKey))
    );
    snap.forEach((d) => records.set(d.id, d.data()));
  }
  if (empIdKey) {
    const snap = await getDocs(
      query(collection(db, "attendance"), where("employeeId", "==", empIdKey))
    );
    snap.forEach((d) => records.set(d.id, d.data()));
  }
  return Array.from(records.values());
}

function buildSalarySlipHtml({ name, empId, baseSalary, rows, nextHolidayText }) {
  const totalPayable = rows.reduce((sum, r) => sum + r.payable, 0);
  const totalPresent = rows.reduce((s, r) => s + r.present, 0);
  const totalLeave = rows.reduce((s, r) => s + r.leave, 0);
  const totalAbsent = rows.reduce((s, r) => s + r.absent, 0);
  const genDate = new Date().toLocaleDateString("en-IN");
  const baseText = formatSalary(baseSalary || 0);
  const nextHoliday = nextHolidayText || "-";
  const tableRows = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      <td>${r.present}</td>
      <td>${r.leave}</td>
      <td>${r.absent}</td>
      <td>${baseText}</td>
      <td>${formatSalary(r.payable)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Salary Slip</title>
    <style>
      :root{
        --ink:#0b1224;
        --muted:#667085;
        --accent:#2563eb;
        --accent-2:#0ea5e9;
        --soft:#eef2ff;
      }
      body{font-family:"Segoe UI",Arial,sans-serif;margin:24px;color:var(--ink);background:#fff;}
      .sheet{border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08);}
      .banner{
        padding:18px 22px;
        background:linear-gradient(135deg,var(--accent),var(--accent-2));
        color:#fff;
        display:flex;
        justify-content:space-between;
        align-items:center;
      }
      .brand{font-weight:800;font-size:18px;letter-spacing:.3px;}
      .muted{color:var(--muted);font-size:12px;}
      .badge{
        padding:6px 10px;
        border-radius:999px;
        background:rgba(255,255,255,.18);
        font-size:11px;
        font-weight:700;
      }
      .content{padding:18px 22px 10px 22px;}
      .title{font-size:20px;font-weight:800;margin:4px 0 6px 0;}
      .meta{font-size:12px;margin-top:4px;color:#1f2937;}
      .meta-row{display:flex;flex-wrap:wrap;gap:10px;}
      .chip{
        background:var(--soft);
        color:#1e293b;
        padding:6px 10px;
        border-radius:8px;
        font-size:12px;
        font-weight:600;
      }
      table{width:100%;border-collapse:separate;border-spacing:0;margin-top:14px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;}
      th,td{padding:9px 10px;text-align:left;font-size:12px;}
      th{background:#f8fafc;color:#0f172a;border-bottom:1px solid #e5e7eb;}
      td{border-bottom:1px solid #eef2f7;}
      tr:last-child td{border-bottom:none;}
      tbody tr:nth-child(even){background:#fbfdff;}
      tfoot td{font-weight:700;background:#f1f5f9;}
      .footer{padding:10px 22px 18px 22px;font-size:11px;color:var(--muted);}
      .watermark{
        position:fixed;
        inset:auto 20px 20px auto;
        font-size:10px;
        color:#94a3b8;
      }
      @media print{
        body{margin:0;}
        .sheet{box-shadow:none;border-radius:0;border:0;}
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="banner">
        <div>
          <div class="brand">Jaamalta Films</div>
          <div class="muted" style="color:rgba(255,255,255,.8)">Salary Slip (All Months)</div>
        </div>
        <div class="badge">Generated: ${genDate}</div>
      </div>
      <div class="content">
        <div class="title">Employee Salary Report</div>
        <div class="meta-row">
          <div class="chip">Name: ${name || "-"}</div>
          <div class="chip">Employee ID: ${empId || "-"}</div>
          <div class="chip">Base Salary (Monthly): ${baseText}</div>
        </div>
        <div class="meta-row" style="margin-top:8px;">
          <div class="chip">Present: ${totalPresent}</div>
          <div class="chip">Leave: ${totalLeave}</div>
          <div class="chip">Absent: ${totalAbsent}</div>
          <div class="chip">Total Payable: ${formatSalary(totalPayable)}</div>
          <div class="chip">Next Holiday: ${nextHoliday}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Present</th>
              <th>Leave</th>
              <th>Absent</th>
              <th>Base Salary</th>
              <th>Payable Salary</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || `<tr><td colspan="6">No attendance records.</td></tr>`}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="5">Total Payable</td>
              <td>${formatSalary(totalPayable)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="footer">Note: Payable salary is calculated on 26 working days, 9 hours/day, 3 paid leaves, remaining leaves half-paid.</div>
    </div>
    <div class="watermark">Jaamalta Films • Salary Slip</div>
  </body>
  </html>`;
}

function monthKeyToDate(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function isMonthInRange(key, fromKey, toKey) {
  if (!fromKey && !toKey) return true;
  const d = monthKeyToDate(key);
  if (fromKey) {
    const from = monthKeyToDate(fromKey);
    if (d < from) return false;
  }
  if (toKey) {
    const to = monthKeyToDate(toKey);
    if (d > to) return false;
  }
  return true;
}

async function generateSalarySlip() {
  try {
    await loadHolidays();
    const baseSalary = currentUserData?.salary || currentUserData?.monthlySalary || currentUserData?.pay || 0;
    const name = currentUserData?.fullName || currentUserData?.name || currentUserEmail || "";
    const empId =
      currentUserData?.employeeId ||
      currentUserData?.empId ||
      currentUserData?.employeeID ||
      currentUserData?.employee_id ||
      currentUserData?.empID ||
      "-";

    const records = await fetchAttendanceRecords();
    const byMonth = new Map();

    records.forEach((r) => {
      const raw = r.date || r.attendanceDate || r.createdAt || r.updatedAt || r.dateYMD;
      const d = parseDateFlexible(raw);
      if (!d) return;
      const key = monthKey(d);
      if (!byMonth.has(key)) {
        byMonth.set(key, { present: 0, leave: 0, absent: 0, bonus: 0 });
      }
      const st = String(r.status || "").toLowerCase();
      const row = byMonth.get(key);
      const ymd = toYMD(raw);
      const offDay = isOffDay(ymd);
      const workedMinutes = Number.isFinite(r.workedMinutes)
        ? r.workedMinutes
        : minutesBetween(r.punchInAt, r.punchOutAt);
      if (offDay) {
        if (st === "present" || st === "half-day") {
          row.bonus += dailyEarnings({ status: st, workedMinutes, monthlySalary: baseSalary });
        }
        return;
      }
      if (st === "present") row.present += 1;
      else if (st === "half-day") row.present += 0.5;
      else if (st === "leave") row.leave += 1;
      else if (st === "absent") row.absent += 1;
    });

    const mode = salarySlipMode?.value || "all";
    let fromKey = "";
    let toKey = "";
    if (mode === "single" && salaryMonthSingle?.value) {
      fromKey = salaryMonthSingle.value;
      toKey = salaryMonthSingle.value;
    } else if (mode === "range") {
      fromKey = salaryMonthFrom?.value || "";
      toKey = salaryMonthTo?.value || "";
    }

    const keys = Array.from(byMonth.keys())
      .filter((k) => isMonthInRange(k, fromKey, toKey))
      .sort();
    const rows = keys.map((k) => {
      const v = byMonth.get(k);
      return {
        label: formatMonthLabel(k),
        present: v.present,
        leave: v.leave,
        absent: v.absent,
        payable: (calcPayableSalary(baseSalary, v.present, v.leave) || 0) + (v.bonus || 0),
      };
    });

    const html = buildSalarySlipHtml({ name, empId, baseSalary, rows, nextHolidayText: getNextHolidayText() });
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  } catch (err) {
    console.error("salary slip error:", err);
    alert("Failed to generate salary slip.");
  }
}

function showToast(message = "Done", type = "success") {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.style.background = type === "error" ? "var(--error)" : "var(--accent)";
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function parseQtySmart(input) {
  if (!input || String(input).trim() === "")
    return { mode: "qty", qty: 1, display: "1" };

  input = String(input).trim();

  if (input.includes(":")) {
    let [h, m] = input.split(":").map((x) => parseInt(x || 0, 10));
    h = isNaN(h) ? 0 : h;
    m = isNaN(m) ? 0 : m;
    if (m >= 60) {
      const extra = Math.floor(m / 60);
      h += extra;
      m = m % 60;
    }
    const hours = h + m / 60;
    return {
      mode: "time",
      qty: hours,
      display: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    };
  }

  if (input.includes(".")) {
    const hours = parseFloat(input) || 0;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return {
      mode: "time",
      qty: hours,
      display: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
    };
  }

  const qty = parseInt(input, 10) || 1;
  return { mode: "qty", qty, display: `${qty}` };
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
        qtyDisplay: x.qtyDisplay || "",
        qtyMode: x.qtyMode || "qty",
        qtyValue: Number(x.qtyValue || 0),
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
    return;
  }
  const idx = currentStudioItems.findIndex(
    (it) => (it.itemName || "Item").toString().toLowerCase() === q
  );
  if (idx >= 0) {
    itemSelect.value = String(idx);
  } else {
    itemSelect.value = "";
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
      itemSuggestions.style.display = "none";
    });
  });
}

if (itemSelectSearch) {
  itemSelectSearch.addEventListener("input", () => {
    syncItemSelectFromSearch();
    renderItemSuggestions(false);
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

if (addItemBtn) {
  addItemBtn.addEventListener("click", () => {
    if (itemSelectSearch) syncItemSelectFromSearch();
    const idxStr = itemSelect ? itemSelect.value : "";
    const input = itemValue ? itemValue.value.trim() : "";

    if (!idxStr) {
      showToast("Please select an item", "error");
      return;
    }
    if (!input) {
      showToast("Enter time (HH:MM) or quantity", "error");
      return;
    }

    const idx = parseInt(idxStr, 10);
    const base = currentStudioItems[idx];
    if (!base) {
      showToast("Item not found", "error");
      return;
    }

    const parsed = parseQtySmart(input);
    const unitPrice = base.itemPrice || 0;
    const rowTotal = parsed.qty * unitPrice;

    currentJobItems.push({
      name: base.itemName,
      price: unitPrice,
      qtyMode: parsed.mode,
      qtyValue: parsed.qty,
      qtyInput: parsed.display,
      rowTotal: rowTotal,
    });

    if (itemSelect) itemSelect.value = "";
    if (itemValue) itemValue.value = "";

    renderItemsList();
  });
}

function calculateTotalAmount() {
  let total = 0;
  currentJobItems.forEach((it) => {
    total += Number(it.rowTotal || 0);
  });
  return total;
}

function renderItemsList() {
  if (!itemsList) return;
  const locked = isJobLocked();
  itemsList.innerHTML = "";
  if (!currentJobItems.length) {
    itemsList.innerHTML = '<div class="muted">No items added. Add items above.</div>';
    updateDeleteButtonState();
    return;
  }

  currentJobItems.forEach((it, i) => {
    const div = document.createElement("div");
    div.className = "item-card";
    const modeText =
      it.qtyMode === "time"
        ? `Time: ${it.qtyInput || it.qtyValue + " hr"}`
        : `Qty: ${it.qtyInput || it.qtyValue}`;
    div.innerHTML = `
      <div class="item-info">
        <strong>${it.name}</strong>
        <div class="muted">${modeText}</div>
      </div>
      <div class="item-actions">
        <button class="delete-btn" data-idx="${i}" ${locked ? "disabled" : ""} style="${locked ? "display:none;" : ""}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    if (!locked) {
      div.querySelector(".delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        currentJobItems.splice(i, 1);
        renderItemsList();
      });
    }
    itemsList.appendChild(div);
  });

  updateDeleteButtonState();
}

function updateDeleteButtonState() {
  if (!deleteProjectBtn) return;
  const st = String(currentEditingJobData?.status || "").toLowerCase();
  const locked = isJobLocked();
  const canDelete = !locked && (currentJobItems.length === 0 || st !== "ready");
  if (canDelete) {
    deleteProjectBtn.style.display = "inline-flex";
    deleteProjectBtn.disabled = false;
  } else {
    deleteProjectBtn.style.display = "inline-flex";
    deleteProjectBtn.disabled = true;
    deleteProjectBtn.title = "Ready/Delivered jobs cannot be deleted";
  }
}

function isJobLocked() {
  const st = String(currentEditingJobData?.status || "").toLowerCase();
  const readyDate =
    (editDataReadyDate && editDataReadyDate.value) ||
    currentEditingJobData?.dataReadyDate ||
    "";
  const isReadyByDate = String(readyDate || "").trim() !== "";
  return st === "ready" || st === "delivered" || isReadyByDate;
}

function updateItemsEditState() {
  // Items removal locks when job is ready/delivered or has ready date.
}

if (editDataReadyToday) {
  editDataReadyToday.addEventListener("change", () => {
    if (editDataReadyToday.checked && editDataReadyDate) {
      editDataReadyDate.value = new Date().toISOString().split("T")[0];
      updateDeleteButtonState();
      updateItemsEditState();
    }
  });
}

if (editDataReadyDate) {
  editDataReadyDate.addEventListener("change", () => {
    updateDeleteButtonState();
    updateItemsEditState();
  });
}

async function openProjectEditor(jobId) {
  currentEditingJobId = jobId;
  currentEditingJobData = null;
  currentJobItems = [];
  renderItemsList();

  try {
    const jobDoc = await getDoc(doc(db, "jobs", jobId));
    if (!jobDoc.exists()) {
      showToast("Project not found", "error");
      return;
    }
    const job = jobDoc.data();
    currentEditingJobData = { id: jobId, ...job };

    if (editProjectName) editProjectName.value = job.projectName || "";
    if (editJobNo) editJobNo.value = job.jobNo || "";
    if (editStudioName) editStudioName.value = job.studioName || "";
    if (editDataReadyDate) editDataReadyDate.value = job.dataReadyDate || "";
    if (editDataDeliverDate) editDataDeliverDate.value = job.dataDeliverDate || "";

    if (job.studioName) {
      await loadStudioItems(job.studioName);
    } else {
      renderItemDropdown();
    }

    const rawItems = job.itemsAdded || [];
    currentJobItems = rawItems.map((it) => {
      const name = it.name || it.itemName || "Item";
      const price = Number(it.price || it.itemPrice || it.unitPrice || 0);
      const qtyMode = it.qtyMode || (it.rateType === "hourly" ? "time" : "qty") || "qty";
      const qtyValue =
        it.qtyValue != null
          ? Number(it.qtyValue)
          : it.timeMinutes
          ? Number(it.timeMinutes) / 60
          : Number(it.quantity || 1);
      const qtyInput =
        it.qtyInput ||
        it.displayValue ||
        (qtyMode === "time" ? it.inputValue || "" : it.inputValue || String(qtyValue));
      const rowTotal =
        it.rowTotal != null
          ? Number(it.rowTotal)
          : it.totalPrice != null
          ? Number(it.totalPrice)
          : price * qtyValue;
      return { name, price, qtyMode, qtyValue, qtyInput, rowTotal };
    });
    renderItemsList();
    updateDeleteButtonState();
    updateItemsEditState();
    if (editorModal) editorModal.style.display = "flex";
  } catch (err) {
    console.error("openProjectEditor error:", err);
    showToast("Error loading project", "error");
  }
}

function closeEditor() {
  if (editorModal) editorModal.style.display = "none";
}

if (closeEditorModal) closeEditorModal.addEventListener("click", closeEditor);
if (cancelEditor) cancelEditor.addEventListener("click", closeEditor);

if (saveProjectChanges) {
  saveProjectChanges.addEventListener("click", async () => {
    if (!currentEditingJobId || !currentEditingJobData) return;
    try {
      const updates = {
        projectName: editProjectName ? editProjectName.value.trim() : currentEditingJobData.projectName || "",
        dataReadyDate: editDataReadyDate ? editDataReadyDate.value : currentEditingJobData.dataReadyDate || "",
        dataDeliverDate: editDataDeliverDate ? editDataDeliverDate.value : currentEditingJobData.dataDeliverDate || "",
        itemsAdded: currentJobItems,
        totalAmount: calculateTotalAmount(),
        updatedAt: serverTimestamp(),
        editorName: currentUserData?.fullName || currentUserEmail,
      };
      await updateDoc(doc(db, "jobs", currentEditingJobId), updates);
      showToast("Project updated");
      closeEditor();
    } catch (err) {
      console.error("saveProjectChanges error:", err);
      showToast("Error updating project", "error");
    }
  });
}

if (deleteProjectBtn) {
  deleteProjectBtn.addEventListener("click", async () => {
    if (!currentEditingJobId) return;
    const ok = confirm(
      "Are you sure you want to delete this project from your profile?\n\nThis will NOT delete the project from the system. It will only unassign it from your account."
    );
    if (!ok) return;
    try {
      await updateDoc(doc(db, "jobs", currentEditingJobId), {
        assignedToEmail: "",
        assignedTo: "",
        editorName: "",
        assignedAt: "",
        updatedAt: serverTimestamp(),
      });
      closeEditor();
      currentEditingJobId = null;
      currentEditingJobData = null;
      currentJobItems = [];
      renderItemsList();
      showToast("Project removed from your profile");
    } catch (err) {
      console.error("delete project error:", err);
      showToast("Error removing project", "error");
    }
  });
}

function startJobsListener() {
  if (!currentUserEmail) return;

  jobsUnsubs.forEach((u) => u && u());
  jobsUnsubs = [];
  jobsBySource = new Map();

  const fullName = currentUserData?.fullName || currentUserData?.name || "";
  const empId =
    currentUserData?.employeeId ||
    currentUserData?.empId ||
    currentUserData?.employeeID ||
    currentUserData?.employee_id ||
    currentUserData?.empID ||
    "";

  const sources = [
    {
      key: "email",
      q: query(collection(db, "jobs"), where("assignedToEmail", "==", currentUserEmail)),
    },
  ];
  if (fullName) {
    sources.push({
      key: "name",
      q: query(collection(db, "jobs"), where("assignedTo", "==", fullName)),
    });
  }
  if (empId) {
    sources.push({
      key: "empId",
      q: query(collection(db, "jobs"), where("assignedToId", "==", empId)),
    });
  }

  const handleSnapshot = (key, snap) => {
    const map = new Map();
    snap.forEach((docSnap) => {
      const j = docSnap.data();
      map.set(docSnap.id, {
        id: docSnap.id,
        jobNo: j.jobNo || "-",
        systemNo: j.systemNo || "-",
        drive: j.drive || "-",
        studioName: j.studioName || "-",
        projectName: j.projectName || "-",
        dataCopyDate: j.dataCopyDate || "-",
        dataReadyDate: j.dataReadyDate || "-",
        dataDeliverDate: j.dataDeliverDate || j.date || "-",
        totalAmount: j.totalAmount || 0,
        paidAmount: j.paidAmount || j.advancePayment || 0,
        deletedAt: j.deletedAt || j.deletedDate || j.deleteAt || j.deleteDate || "-",
        status: j.status || "Assigned",
        assignedAt: j.assignedAt || null,
        addItemDate: j.addItemDate || "",
      });
    });
    jobsBySource.set(key, map);
    const merged = new Map();
    jobsBySource.forEach((m) => {
      m.forEach((v, k) => merged.set(k, v));
    });
    allAssignedJobs = Array.from(merged.values());
    applyJobsSearch();
    renderSummary(allAssignedJobs);
    renderJobsChart(allAssignedJobs);
  };

  sources.forEach(({ key, q }) => {
    const unsub = onSnapshot(q, (snap) => handleSnapshot(key, snap));
    jobsUnsubs.push(unsub);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login/login.html";
    return;
  }
  currentUserEmail = user.email || "";
  currentUserId = user.uid;
  await loadEmployeeInfo();
  bindSummaryClicks();
  bindChartFilters();
  bindCustomRange();
  startJobsListener();
});

if (refreshInfoBtn) {
  refreshInfoBtn.addEventListener("click", () => {
    if (loadingInfo) loadingInfo.style.display = "block";
    if (infoFields) infoFields.style.display = "none";
    loadEmployeeInfo();
  });
}

if (salarySlipBtn) {
  salarySlipBtn.addEventListener("click", () => {
    generateSalarySlip();
  });
}

if (salarySlipMode) {
  salarySlipMode.addEventListener("change", () => {
    const mode = salarySlipMode.value;
    if (salaryMonthSingle) salaryMonthSingle.style.display = mode === "single" ? "inline-flex" : "none";
    if (salaryMonthRange) salaryMonthRange.style.display = mode === "range" ? "inline-flex" : "none";
    if (salaryMonthSingle && mode === "single" && !salaryMonthSingle.value) {
      const now = new Date();
      salaryMonthSingle.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    if (mode === "range") {
      const now = new Date();
      const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      if (salaryMonthFrom && !salaryMonthFrom.value) salaryMonthFrom.value = cur;
      if (salaryMonthTo && !salaryMonthTo.value) salaryMonthTo.value = cur;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    try { localStorage.setItem("force_login", "1"); } catch (e) {}
    signOut(auth).finally(() => {
      window.location.href = "../index.html";
    });
  });
}

if (backToPanel) {
  backToPanel.addEventListener("click", () => {
    window.location.href = "./employee.html";
  });
}

if (submitLeaveBtn) {
  submitLeaveBtn.addEventListener("click", submitLeaveRequest);
}

if (jobsSearchInput) {
  jobsSearchInput.addEventListener("input", applyJobsSearch);
}
if (clearSearchBtn) {
  clearSearchBtn.addEventListener("click", () => {
    jobsSearchInput.value = "";
    applyJobsSearch();
  });
}
