// employee-user.js  (FINAL SYNCED WITH billing.html + clients.html)

// --------------- FIREBASE SETUP ---------------
import { auth, db, storage } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const ATTENDANCE_SELF_MARK = true;

async function createAdminNotification({ title, message, studioName = "", jobNo = "", source = "" }) {
  try {
    await addDoc(collection(db, "notifications"), {
      audience: "admin",
      title,
      message,
      studioName,
      jobNo,
      source,
      createdBy: currentUserEmail || currentUserData?.fullName || "",
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("createAdminNotification error:", err);
  }
}

// --------------- DOM ELEMENTS ---------------
const avatarEl = document.getElementById("avatar");
const userNameEl = document.getElementById("userName");
const userRoleEl = document.getElementById("userRole");

const loadingInfo = document.getElementById("loadingInfo");
const infoFields = document.getElementById("infoFields");

const jobsTableBody = document.getElementById("jobsTableBody");

const assignModal = document.getElementById("assignProjectModal");
const projectListEl = document.getElementById("projectList");
const projectSearch = document.getElementById("projectSearch"); // MODAL SEARCH
const confirmAssign = document.getElementById("confirmAssign");

const editorModal = document.getElementById("projectEditorModal");
const closeEditorModal = document.getElementById("closeEditorModal");
const cancelEditor = document.getElementById("cancelEditor");
const saveProjectChanges = document.getElementById("saveProjectChanges");

const infoToggleBtn = document.getElementById("infoToggleBtn");
const refreshInfoBtn = document.getElementById("refreshInfoBtn");
const infoSearchInput = document.getElementById("infoSearchInput");
const refreshBtn = document.getElementById("refreshBtn");
const punchInBtn = document.getElementById("punchInBtn");
const punchOutBtn = document.getElementById("punchOutBtn");
const punchConfirmModal = document.getElementById("punchConfirmModal");
const punchConfirmText = document.getElementById("punchConfirmText");
const confirmPunchIn = document.getElementById("confirmPunchIn");
const cancelPunchConfirm = document.getElementById("cancelPunchConfirm");
const closePunchConfirm = document.getElementById("closePunchConfirm");
const nextLeaveDateEl = document.getElementById("nextLeaveDate");
const notifBtn = document.getElementById("notifBtn");
const notifPanel = document.getElementById("notifPanel");
const notifList = document.getElementById("notifList");
const notifClose = document.getElementById("notifClose");
const notifCount = document.getElementById("notifCount");
const messageBtn = document.getElementById("messageBtn");
const assignProjectBtn = document.getElementById("assignProjectBtn");
const closeModalBtn = document.getElementById("closeModal");
const cancelAssignBtn = document.getElementById("cancelAssign");
const logoutBtn = document.getElementById("logoutBtn");
const openInfoBtn = document.getElementById("openInfoBtn");

// Optional create job button
const createJobBtn = document.getElementById("createJobBtn");

// Delete inside editor
const deleteProjectBtn = document.getElementById("deleteProjectBtn");

const toastEl = document.getElementById("toast");

// Punch-in elements
const punchGate = document.getElementById("punchInGate");
const punchVideo = document.getElementById("punchVideo");
const punchCanvas = document.getElementById("punchCanvas");
const punchPhoto = document.getElementById("punchPhoto");
const punchCapture = document.getElementById("punchCapture");
const punchSubmit = document.getElementById("punchSubmit");
const punchStatus = document.getElementById("punchStatus");

// editor form fields
const editProjectName = document.getElementById("editProjectName");
const editJobNo = document.getElementById("editJobNo");
const editStudioName = document.getElementById("editStudioName");
const editCustomerName = document.getElementById("editCustomerName");
const editDataCopyDate = document.getElementById("editDataCopyDate");
const editDataReadyToday = document.getElementById("editDataReadyToday");
const editDataReadyDate = document.getElementById("editDataReadyDate");
const editDataDeliverDate = document.getElementById("editDataDeliverDate");
const editMoveData = document.getElementById("editMoveData");
const editDeleteData = document.getElementById("editDeleteData");
const editCorrectionData = document.getElementById("editCorrectionData");
const itemSelect = document.getElementById("itemSelect");
const itemSelectSearch = document.getElementById("itemSelectSearch");
const itemSuggestions = document.getElementById("itemSuggestions");
const itemSearchInput = null;
const itemValue = document.getElementById("itemValue");
const addItemBtn = document.getElementById("addItemBtn");
const itemsList = document.getElementById("itemsList");
const correctionText = document.getElementById("correctionText");
const addCorrectionBtn = document.getElementById("addCorrectionBtn");
const correctionsList = document.getElementById("correctionsList");
const editEditorName = document.getElementById("editEditorName");
const editAssignedEmail = document.getElementById("editAssignedEmail");
const editAssignedDate = document.getElementById("editAssignedDate");
const editStatus = document.getElementById("editStatus");

// --------------- STATE ---------------
let currentUserEmail = "";
let currentUserId = "";
let currentUserData = null;

let availableProjects = [];
let selectedProjectId = null;

let infoHidden = false;

let currentEditingJobId = null;
let currentEditingJobData = null;

let currentStudioItems = [];      // studioItems se loaded price master
let currentJobItems = [];         // itemsAdded same format
let currentJobCorrections = [];   // correctionsList

// Cache of existing customer studio names for quick filtering
let cachedCustomerStudiosSet = new Set();

// NEW: For Jobs Table Search
let allAssignedJobs = [];         // All assigned jobs for current user
let filteredJobs = [];            // Filtered jobs based on search
let punchStream = null;
let punchBlob = null;
let punchReadyResolver = null;
let currentAttendanceId = null;
let currentAttendanceData = null;
let notifUnsub = null;
let seenNotifIds = new Set();

// --------------- TOAST ---------------
function showToast(msg, type = "success") {
  if (!toastEl) {
    // fallback
    console.log(type.toUpperCase() + ":", msg);
    return;
  }
  toastEl.textContent = msg;
  toastEl.className = "toast";
  if (type === "error") toastEl.classList.add("error");
  else if (type === "warning") toastEl.classList.add("warning");
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}

// --------------- PUNCH-IN GATE ---------------
// Use local date (not UTC) to avoid day shifts around midnight
const toYMD = (d) => {
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

async function checkPunchInToday() {
  const today = toYMD(new Date());
  const email = (currentUserEmail || "").toLowerCase();
  const empId = (currentUserData?.employeeId || "").toString().trim();
  let qAtt;
  if (email) {
    qAtt = query(collection(db, "attendance"), where("employeeEmail", "==", email));
  } else if (empId) {
    qAtt = query(collection(db, "attendance"), where("employeeId", "==", empId));
  } else {
    return false;
  }
  const snap = await getDocs(qAtt);
  return snap.docs.some((d) => (d.data().dateYMD || "") === today);
}

async function startCamera() {
  if (!punchVideo) return;
  punchStatus.textContent = "Starting camera...";
  try {
    punchStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    punchVideo.srcObject = punchStream;
    punchStatus.textContent = "Capture your selfie.";
  } catch (err) {
    punchStatus.textContent = "Camera permission denied.";
    throw err;
  }
}

function stopCamera() {
  if (punchStream) {
    punchStream.getTracks().forEach((t) => t.stop());
    punchStream = null;
  }
}

function captureSelfie() {
  if (!punchVideo || !punchCanvas) return;
  const w = punchVideo.videoWidth || 640;
  const h = punchVideo.videoHeight || 480;
  const maxW = 640;
  const scale = w > maxW ? maxW / w : 1;
  const targetW = Math.round(w * scale);
  const targetH = Math.round(h * scale);
  punchCanvas.width = targetW;
  punchCanvas.height = targetH;
  const ctx = punchCanvas.getContext("2d");
  ctx.drawImage(punchVideo, 0, 0, targetW, targetH);
  punchCanvas.toBlob((blob) => {
    if (!blob) return;
    punchBlob = blob;
    punchPhoto.src = URL.createObjectURL(blob);
    punchPhoto.style.display = "block";
    punchVideo.style.display = "none";
    punchSubmit.disabled = false;
    punchStatus.textContent = "Selfie captured. Submit to punch in.";
    // Auto-submit for faster flow
    setTimeout(() => {
      if (punchBlob && punchSubmit && !punchSubmit.disabled) {
        submitPunchIn();
      }
    }, 300);
  }, "image/jpeg", 0.7);
}

async function submitPunchIn() {
  if (!ATTENDANCE_SELF_MARK) {
    if (punchStatus) punchStatus.textContent = "Attendance marking is admin-only.";
    if (punchSubmit) punchSubmit.disabled = true;
    hidePunchGate();
    return;
  }
  if (punchSubmit) punchSubmit.disabled = true;
  if (punchStatus) punchStatus.textContent = "Punching in...";
  try {
    if (navigator.onLine === false) throw new Error("Offline");
    const today = toYMD(new Date());
    if (currentAttendanceId) {
      await updateDoc(doc(db, "attendance", currentAttendanceId), {
        status: "present",
        punchInAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const ref = await addDoc(collection(db, "attendance"), {
        employeeEmail: currentUserEmail || "",
        employeeId: currentUserData?.employeeId || "",
        name: currentUserData?.fullName || currentUserData?.name || "",
        status: "present",
        dateYMD: today,
        punchInAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      });
      currentAttendanceId = ref.id;
    }

    // Update local state so UI switches to Punch Out immediately
    currentAttendanceData = {
      ...(currentAttendanceData || {}),
      employeeEmail: currentUserEmail || "",
      employeeId: currentUserData?.employeeId || "",
      name: currentUserData?.fullName || currentUserData?.name || "",
      status: "present",
      dateYMD: today,
      punchInAt: { seconds: Date.now() / 1000 },
      updatedAt: { seconds: Date.now() / 1000 },
    };

    await createAdminNotification({
      title: "Punch In",
      message: `${currentUserData?.fullName || currentUserEmail || "Employee"} punched in.`,
      source: "attendance",
    });

    punchStatus.textContent = "Punch in successful.";
    hidePunchGate();
    if (punchReadyResolver) punchReadyResolver();
    updatePunchButtons();
  } catch (err) {
    console.error(err);
    const code = err?.code ? ` (${err.code})` : "";
    let msg = "Punch in failed. Check internet and try again.";
    if (err?.message?.includes("Offline")) {
      msg = "You are offline. Please check internet and try again.";
    }
    punchStatus.textContent = msg + code;
    punchSubmit.disabled = false;
  }
}

function showPunchGate() {
  if (!punchGate) return;
  punchGate.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function hidePunchGate() {
  if (!punchGate) return;
  punchGate.style.display = "none";
  document.body.style.overflow = "";
  stopCamera();
}

function updatePunchButtons() {
  if (!punchInBtn || !punchOutBtn) return;
  const hasIn = !!currentAttendanceData?.punchInAt;
  const hasOut = !!currentAttendanceData?.punchOutAt;
  if (hasIn && !hasOut) {
    punchInBtn.style.display = "none";
    punchOutBtn.style.display = "inline-flex";
  } else {
    punchInBtn.style.display = "inline-flex";
    punchOutBtn.style.display = "none";
  }
}

function toggleNotifPanel(show) {
  if (!notifPanel) return;
  notifPanel.style.display = show ? "block" : "none";
}

function renderNotifs(items) {
  if (!notifList) return;
  if (!items.length) {
    notifList.innerHTML = `<div class="muted">No notifications</div>`;
    if (notifCount) notifCount.style.display = "none";
    return;
  }
  const unreadCount = items.filter((n) => !n.read).length;
  if (notifCount) {
    notifCount.textContent = String(unreadCount);
    notifCount.style.display = unreadCount > 0 ? "inline-block" : "none";
  }
  notifList.innerHTML = items.map((n) => {
    const time = n.createdAt?.seconds
      ? new Date(n.createdAt.seconds * 1000).toLocaleString("en-IN")
      : "";
    return `
      <div class="notif-item" style="${n.read ? "opacity:.7;" : ""}">
        <div class="title">${n.title || "Update"}</div>
        <div>${n.message || ""}</div>
        <div class="time">${time}</div>
      </div>
    `;
  }).join("");
}

async function requestNotifPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const res = await Notification.requestPermission();
  return res === "granted";
}

async function showBrowserNotification(title, body) {
  const allowed = await requestNotifPermission();
  if (!allowed) return;
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      reg.showNotification(title, {
        body,
        icon: "/favicon.ico",
        tag: "employee-notif",
      });
      return;
    }
  }
  new Notification(title, { body, icon: "/favicon.ico" });
}

function listenNotifications() {
  if (!currentUserEmail && !currentUserData?.employeeId) return;
  if (notifUnsub) notifUnsub();
  const q = currentUserEmail
    ? query(
        collection(db, "notifications"),
        where("userEmail", "==", currentUserEmail),
        orderBy("createdAt", "desc"),
        limit(20)
      )
    : query(
        collection(db, "notifications"),
        where("employeeId", "==", currentUserData?.employeeId || ""),
        orderBy("createdAt", "desc"),
        limit(20)
      );
  notifUnsub = onSnapshot(q, (snap) => {
    const items = [];
    snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
    renderNotifs(items);
    items.forEach((n) => {
      if (seenNotifIds.has(n.id)) return;
      seenNotifIds.add(n.id);
      if (!n.read) {
        showBrowserNotification(n.title || "Notification", n.message || "");
      }
    });
  });
}

async function markNotifsRead() {
  if (!currentUserEmail && !currentUserData?.employeeId) return;
  const q = currentUserEmail
    ? query(collection(db, "notifications"), where("userEmail", "==", currentUserEmail), where("read", "==", false))
    : query(collection(db, "notifications"), where("employeeId", "==", currentUserData?.employeeId || ""), where("read", "==", false));
  const snap = await getDocs(q);
  const ops = [];
  snap.forEach((d) => {
    ops.push(updateDoc(doc(db, "notifications", d.id), { read: true }));
  });
  if (ops.length) await Promise.all(ops);
}

async function loadTodayAttendance() {
  const today = toYMD(new Date());
  let q = null;
  if (currentUserEmail) {
    q = query(
      collection(db, "attendance"),
      where("employeeEmail", "==", currentUserEmail),
      where("dateYMD", "==", today)
    );
  } else if (currentUserData?.employeeId) {
    q = query(
      collection(db, "attendance"),
      where("employeeId", "==", currentUserData.employeeId),
      where("dateYMD", "==", today)
    );
  }
  if (!q) return;
  const snap = await getDocs(q);
  if (!snap.empty) {
    const docSnap = snap.docs[0];
    currentAttendanceId = docSnap.id;
    currentAttendanceData = docSnap.data();
  } else {
    currentAttendanceId = null;
    currentAttendanceData = null;
  }
  updatePunchButtons();
}

function toYMDLocal(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateShort(d) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

async function loadNextLeaveInfo() {
  try {
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

    if (!last) return;
    let next = new Date(last);
    const today = new Date(toYMDLocal(new Date()));
    while (next < today) {
      next.setDate(next.getDate() + 8);
    }
    if (nextLeaveDateEl) {
      nextLeaveDateEl.textContent = next ? formatDateShort(next) : "-";
    }
  } catch (err) {
    console.error("next leave error:", err);
  }
}

async function punchOutNow() {
  if (!currentAttendanceId) {
    showToast("Punch in first", "error");
    return;
  }
  try {
    await updateDoc(doc(db, "attendance", currentAttendanceId), {
      punchOutAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (!currentAttendanceData) currentAttendanceData = {};
    currentAttendanceData.punchOutAt = { seconds: Date.now() / 1000 };
    currentAttendanceData.updatedAt = { seconds: Date.now() / 1000 };
    updatePunchButtons();
    showToast("Punch out successful");
  } catch (err) {
    console.error("punch out error:", err);
    showToast("Punch out failed", "error");
  }
}

async function markHalfDayForMissingPunchOut() {
  const today = toYMD(new Date());
  let q = null;
  if (currentUserEmail) {
    q = query(collection(db, "attendance"), where("employeeEmail", "==", currentUserEmail));
  } else if (currentUserData?.employeeId) {
    q = query(collection(db, "attendance"), where("employeeId", "==", currentUserData.employeeId));
  }
  if (!q) return;
  const snap = await getDocs(q);
  const updates = [];
  snap.forEach((docSnap) => {
    const r = docSnap.data() || {};
    const dKey = r.dateYMD || toYMD(r.date || r.attendanceDate || r.createdAt || r.updatedAt);
    if (!dKey || dKey >= today) return;
    if (r.punchInAt && !r.punchOutAt && String(r.status || "").toLowerCase() === "present") {
      updates.push(updateDoc(doc(db, "attendance", docSnap.id), {
        status: "half-day",
        updatedAt: serverTimestamp(),
      }));
    }
  });
  if (updates.length) await Promise.all(updates);
}

async function markAbsentForMissingPunchIn() {
  const today = new Date();
  const todayKey = toYMD(today);
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const joinRaw = currentUserData?.joiningDate || currentUserData?.createdAt;
  if (joinRaw) {
    const jd = joinRaw?.seconds ? new Date(joinRaw.seconds * 1000) : new Date(joinRaw);
    if (!isNaN(jd) && jd > start) start.setTime(jd.getTime());
  }

  let q = null;
  if (currentUserEmail) {
    q = query(collection(db, "attendance"), where("employeeEmail", "==", currentUserEmail));
  } else if (currentUserData?.employeeId) {
    q = query(collection(db, "attendance"), where("employeeId", "==", currentUserData.employeeId));
  }
  if (!q) return;

  const snap = await getDocs(q);
  const existing = new Set();
  snap.forEach((docSnap) => {
    const r = docSnap.data() || {};
    const key = r.dateYMD || toYMD(r.date || r.attendanceDate || r.createdAt || r.updatedAt);
    if (key) existing.add(key);
  });

  const day = new Date(start);
  const ops = [];
  while (day < today) {
    const key = toYMD(day);
    if (key && key < todayKey && !existing.has(key)) {
      ops.push(addDoc(collection(db, "attendance"), {
        employeeEmail: currentUserEmail || "",
        employeeId: currentUserData?.employeeId || "",
        name: currentUserData?.fullName || currentUserData?.name || "",
        status: "absent",
        dateYMD: key,
        createdAt: serverTimestamp(),
      }));
    }
    day.setDate(day.getDate() + 1);
  }
  if (ops.length) await Promise.all(ops);
}

async function ensurePunchIn() {
  // Punch-in disabled: allow normal login without selfie
  if (punchGate) punchGate.style.display = "none";
  document.body.style.overflow = "";
  stopCamera();
  return true;
}

if (punchCapture) punchCapture.addEventListener("click", captureSelfie);
if (punchSubmit) punchSubmit.addEventListener("click", submitPunchIn);
if (punchOutBtn) {
  punchOutBtn.addEventListener("click", () => {
    punchOutNow();
  });
}

// --------------- AUTH LISTENER ---------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login/login.html";
    return;
  }
  currentUserEmail = user.email || "";
  currentUserId = user.uid;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("../service-worker.js").catch(() => {});
  }

  await loadEmployeeInfo();
  await ensurePunchIn();
  await markHalfDayForMissingPunchOut();
  await markAbsentForMissingPunchIn();
  await loadTodayAttendance();
  await loadNextLeaveInfo();
  listenNotifications();
  startJobsListener();
  await preloadCustomerStudios(); // preload customers for filtering available projects
  loadAvailableProjects();
});

// --------------- EMPLOYEE INFO LOAD ---------------
async function loadEmployeeInfo() {
  try {
    const qEmp = query(
      collection(db, "employees"),
      where("email", "==", currentUserEmail)
    );
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
    const skills = Array.isArray(data.skills)
      ? data.skills.join(", ")
      : data.skills || "-";

    if (userNameEl) userNameEl.textContent = fullName;
    if (userRoleEl) userRoleEl.textContent = role;
    if (avatarEl)
      avatarEl.textContent = fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

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

    setIfExists("eName", fullName);
    setIfExists("eEmail", data.email || currentUserEmail);
    setIfExists("eRole", role);
    setIfExists("eDepartment", data.department || "-");
    setIfExists("ePhone", data.phone || "-");
    const empId =
      data.employeeId ||
      data.empId ||
      data.employeeID ||
      data.employee_id ||
      data.empID ||
      (currentUserId ? `EMP-${currentUserId.slice(-6).toUpperCase()}` : "-");
    setIfExists("eEmployeeId", empId);
    const joinRaw = data.joiningDate || data.createdAt;
    setIfExists("eJoiningDate", formatDate(joinRaw));

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

    setIfExists("eExperience", data.experience || calcExperience(joinRaw) || "-");
    setIfExists("eSkills", skills);

    if (loadingInfo) loadingInfo.style.display = "none";
    if (infoFields) infoFields.style.display = "grid";

    // Attendance summary for current month
    const attPresent = document.getElementById("attPresent");
    const attAbsent = document.getElementById("attAbsent");
    const attLeave = document.getElementById("attLeave");
    const attendanceStats = document.getElementById("attendanceStats");

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);

    if (attendanceStats) attendanceStats.style.display = "grid";

    const normalizeStatus = (v) => String(v || "").trim().toLowerCase();
    const toDate = (v) => {
      if (!v) return null;
      if (v?.seconds) return new Date(v.seconds * 1000);
      const d = new Date(v);
      return isNaN(d) ? null : d;
    };

    const emailKey = (data.email || currentUserEmail || "").toLowerCase();
    const empIdKey = (data.employeeId || "").toString().trim();

    try {
      const { collection, onSnapshot } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");
      onSnapshot(collection(db, "attendance"), (snap) => {
        let present = 0;
        let absent = 0;
        let leave = 0;
      snap.forEach((docSnap) => {
        const r = docSnap.data() || {};
        const d = toDate(r.date || r.attendanceDate || r.createdAt || r.updatedAt);
        if (!d || d < monthStart || d > monthEnd) return;
        const rEmail = (r.email || r.employeeEmail || "").toLowerCase();
        const rEmpId = (r.employeeId || r.empId || "").toString().trim();
        if (emailKey && rEmail && rEmail !== emailKey) return;
        if (!emailKey && empIdKey && rEmpId && rEmpId !== empIdKey) return;
        const st = normalizeStatus(r.status);
        if (st === "present") present += 1;
        else if (st === "half-day") present += 0.5;
        else if (st === "absent") absent += 1;
        else if (st === "leave") leave += 1;
      });
        if (attPresent) attPresent.textContent = present;
        if (attAbsent) attAbsent.textContent = absent;
        if (attLeave) attLeave.textContent = leave;
      });
    } catch (err) {
      console.error("Attendance load error:", err);
    }
  } catch (err) {
    console.error("loadEmployeeInfo error:", err);
    if (loadingInfo) loadingInfo.textContent = "Error loading employee info.";
  }
}

// --------------- INFO TOGGLE / REFRESH ---------------
if (openInfoBtn) {
  openInfoBtn.addEventListener("click", () => {
    window.location.href = "./info.html";
  });
}

// info page controls are not on this page anymore

if (infoSearchInput) {
  infoSearchInput.addEventListener("input", () => {
    const q = infoSearchInput.value.toLowerCase().trim();
    const fields = infoFields ? Array.from(infoFields.children) : [];
    fields.forEach((el) => {
      const label = el.querySelector("label");
      const text = (label ? label.textContent : "").toLowerCase();
      el.style.display = !q || text.includes(q) ? "" : "none";
    });
    if (attendanceStats) {
      attendanceStats.style.display = q ? "none" : (attendanceStats.style.display || "grid");
    }
  });
}

if (refreshInfoBtn) {
  refreshInfoBtn.addEventListener("click", () => {
    if (loadingInfo) loadingInfo.style.display = "block";
    if (infoFields) infoFields.style.display = "none";
    loadEmployeeInfo();
    showToast("Info refreshed");
  });
}

// --------------- ASSIGNED JOBS LISTENER (UPDATED FOR SEARCH) ---------------
function startJobsListener() {
  if (!currentUserEmail) return;

  const qJobs = query(
    collection(db, "jobs"),
    where("assignedToEmail", "==", currentUserEmail)
  );

  onSnapshot(qJobs, (snap) => {
    allAssignedJobs = [];
    
    if (snap.empty) {
      allAssignedJobs = [];
      renderJobsTable();
      return;
    }

    const jobsData = [];
    snap.forEach((docSnap) => {
      const j = docSnap.data();
      const jobId = docSnap.id;

      jobsData.push({
        id: jobId,
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
        addItemDate: j.addItemDate || "",
        deletedAt: j.deletedAt || j.deletedDate || j.deleteAt || j.deleteDate || "-",
        moveData: j.moveData ?? "0",
        deleteData: j.deleteData ?? "0",
        correctionData: j.correctionData ?? "0",
        status: j.status || "Assigned",
        assignedAt: j.assignedAt || null,
        rawData: j
      });
    });

    // Filter to current month only (Employee page requirement)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthFiltered = jobsData.filter((job) => {
      const d = parseJobDate(job);
      return d && d >= monthStart && d <= monthEnd;
    });

    // Sort by assignedAt timestamp (latest first)
    allAssignedJobs = monthFiltered.sort((a, b) => {
      const dateA = a.assignedAt ? 
        (a.assignedAt.toDate ? a.assignedAt.toDate() : new Date(a.assignedAt)) : 
        new Date(0);
      const dateB = b.assignedAt ? 
        (b.assignedAt.toDate ? b.assignedAt.toDate() : new Date(b.assignedAt)) : 
        new Date(0);
      return dateB - dateA; // Latest first
    });

    // Apply search filter if any
    applyJobsSearch();
  });
}

// --------------- APPLY SEARCH TO JOBS TABLE ---------------
function applyJobsSearch() {
  // If no search input element, show all jobs
  const searchInput = document.getElementById("jobsSearchInput");
  if (!searchInput) {
    filteredJobs = [...allAssignedJobs];
    renderJobsTable();
    return;
  }

  const searchTerm = searchInput.value.toLowerCase().trim();
  
  if (!searchTerm) {
    filteredJobs = [...allAssignedJobs];
  } else {
    filteredJobs = allAssignedJobs.filter(job => {
      return (
        (job.projectName && job.projectName.toLowerCase().includes(searchTerm)) ||
        (job.jobNo && job.jobNo.toLowerCase().includes(searchTerm)) ||
        (job.studioName && job.studioName.toLowerCase().includes(searchTerm))
      );
    });
  }
  
  renderJobsTable();
}

// --------------- RENDER JOBS TABLE (UPDATED) ---------------
function renderJobsTable() {
  if (!jobsTableBody) return;
  jobsTableBody.innerHTML = "";

  if (!filteredJobs.length) {
    jobsTableBody.innerHTML = `
      <tr>
        <td colspan="9" class="center muted">
          ${allAssignedJobs.length ? 'No matching projects found' : 'No projects assigned'}
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

    tr.addEventListener("click", (e) => {
      openProjectEditor(job.id);
    });

    jobsTableBody.appendChild(tr);
  });
}

// --------------- UTIL: DATE FORMAT ---------------
function formatDate(dateValue) {
  if (!dateValue) return "-";
  try {
    if (dateValue.toDate) {
      const d = dateValue.toDate();
      return isNaN(d) ? "-" : d.toLocaleDateString();
    }
    const d = new Date(dateValue);
    return isNaN(d) ? "-" : d.toLocaleDateString();
  } catch {
    return "-";
  }
}

function parseDateFlexible(value) {
  if (!value || value === "-") return null;
  if (value?.toDate) return value.toDate();
  if (value?.seconds) return new Date(value.seconds * 1000);
  if (value instanceof Date) return isNaN(value) ? null : value;
  const str = String(value).trim();
  if (!str) return null;
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

// --------------- QTY PARSER (same as billing) ---------------
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

// --------------- LOAD STUDIO ITEMS (FROM studioItems) ---------------
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

// --------------- RENDER ITEM DROPDOWN (NO PRICE SHOWN) ---------------
function renderItemDropdown() {
  if (!itemSelect) return;
  itemSelect.innerHTML = `<option value="">Select Service/Item</option>`;
  if (itemSelectSearch) itemSelectSearch.value = "";
  if (!currentStudioItems.length) return;

  currentStudioItems.forEach((it, idx) => {
    const name = (it.itemName || "Item").toString();
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = name; // price hide
    opt.dataset.price = String(it.itemPrice || 0); // internal use only
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


// --------------- ADD ITEM (EMPLOYEE VIEW: NO PRICE) ---------------
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
      // EXACT format jo billing.html expect karta hai
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

if (itemSelectSearch) {
  itemSelectSearch.addEventListener("input", () => {
    syncItemSelectFromSearch();
    renderItemSuggestions(false);
  });
}

if (itemSelectSearch) {
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

// --------------- CALCULATE TOTAL AMOUNT ---------------
function calculateTotalAmount() {
  let total = 0;
  currentJobItems.forEach((it) => {
    total += Number(it.rowTotal || 0);
  });
  return total;
}

// --------------- RENDER ITEMS LIST (NO PRICE VISIBLE) ---------------
function renderItemsList() {
  if (!itemsList) return;
  itemsList.innerHTML = "";
  if (!currentJobItems.length) {
    itemsList.innerHTML =
      '<div class="muted">No items added. Add items above.</div>';
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
        <button class="delete-btn" data-idx="${i}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    div
      .querySelector(".delete-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        currentJobItems.splice(i, 1);
        renderItemsList();
      });

    itemsList.appendChild(div);
  });

  // update delete button visibility after items rendered
  updateDeleteButtonState();
}

// --------------- CORRECTIONS ---------------
if (addCorrectionBtn) {
  addCorrectionBtn.addEventListener("click", () => {
    const txt = correctionText ? correctionText.value.trim() : "";
    if (!txt) {
      showToast("Enter correction text", "error");
      return;
    }
    currentJobCorrections.push({
      text: txt,
      createdAt: new Date().toISOString(),
    });
    if (correctionText) correctionText.value = "";
    renderCorrectionsList();
  });
}

function renderCorrectionsList() {
  if (!correctionsList) return;
  correctionsList.innerHTML = "";
  if (!currentJobCorrections.length) {
    correctionsList.innerHTML =
      '<div class="muted">No corrections added.</div>';
    return;
  }
  currentJobCorrections.forEach((c, i) => {
    const div = document.createElement("div");
    div.className = "correction-card";
    div.innerHTML = `
      <div class="correction-info">
        <div>${c.text}</div>
        <small class="muted">${formatDate(c.createdAt)}</small>
      </div>
      <div class="correction-actions">
        <button class="delete-btn" data-idx="${i}">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    div
      .querySelector(".delete-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        currentJobCorrections.splice(i, 1);
        renderCorrectionsList();
      });
    correctionsList.appendChild(div);
  });
}

// --------------- DATA READY TODAY ---------------
if (editDataReadyToday) {
  editDataReadyToday.addEventListener("change", () => {
    if (editDataReadyToday.checked) {
      editDataReadyDate.value = new Date().toISOString().split("T")[0];
    }
  });
}

// --------------- DELETE BUTTON VISIBILITY LOGIC ---------------
// allow delete if NO items added OR status is NOT 'Ready'
function updateDeleteButtonState() {
  if (!deleteProjectBtn) return;
  const status = (editStatus && editStatus.value) || (currentEditingJobData && currentEditingJobData.status) || "Assigned";
  const st = String(status || "").toLowerCase();
  const readyDate =
    (editDataReadyDate && editDataReadyDate.value) ||
    currentEditingJobData?.dataReadyDate ||
    "";
  const isReadyByDate = String(readyDate || "").trim() !== "";
  const isLocked = st === "ready" || st === "delivered" || isReadyByDate;
  const canDelete = !isLocked && (currentJobItems.length === 0 || st !== "ready");
  if (canDelete) {
    deleteProjectBtn.style.display = "inline-flex";
    deleteProjectBtn.disabled = false;
  } else {
    deleteProjectBtn.style.display = "inline-flex";
    deleteProjectBtn.disabled = true;
    deleteProjectBtn.title = "Ready/Delivered jobs cannot be deleted";
  }
}

// update on status change
if (editStatus) {
  editStatus.addEventListener("change", () => {
    updateDeleteButtonState();
  });
}

// --------------- OPEN PROJECT EDITOR ---------------
async function openProjectEditor(jobId) {
  currentEditingJobId = jobId;
  currentEditingJobData = null;
  currentJobItems = [];
  currentJobCorrections = [];
  renderItemsList();
  renderCorrectionsList();

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
    if (editCustomerName) editCustomerName.value = job.customerName || "";
    if (editDataCopyDate) editDataCopyDate.value = job.dataCopyDate || "";
    if (editDataReadyDate) editDataReadyDate.value = job.dataReadyDate || "";
    if (editDataDeliverDate) editDataDeliverDate.value = job.dataDeliverDate || "";
    if (editMoveData) editMoveData.value = job.moveData ?? 0;
    if (editDeleteData) editDeleteData.value = job.deleteData ?? 0;
    if (editCorrectionData) editCorrectionData.value = job.correctionData ?? 0;

    if (editEditorName)
      editEditorName.value =
        job.editorName || currentUserData?.fullName || currentUserEmail;
    if (editAssignedEmail) editAssignedEmail.value = job.assignedToEmail || currentUserEmail;
    if (editAssignedDate)
      editAssignedDate.value = job.assignedAt
        ? formatDate(job.assignedAt.toDate ? job.assignedAt.toDate() : job.assignedAt)
        : "-";
    if (editStatus) editStatus.value = job.status || "Assigned";

    // load studio items (price master)
    if (job.studioName) {
      await loadStudioItems(job.studioName);
    } else if (job.customerName) {
      await loadStudioItems(job.customerName);
    } else {
      renderItemDropdown();
    }

    // itemsAdded normalize
    const rawItems = job.itemsAdded || [];
    currentJobItems = rawItems.map((it) => {
      const name = it.name || it.itemName || "Item";
      const price = Number(it.price || it.itemPrice || it.unitPrice || 0);
      const qtyMode =
        it.qtyMode || (it.rateType === "hourly" ? "time" : "qty") || "qty";
      const qtyValue =
        it.qtyValue != null
          ? Number(it.qtyValue)
          : it.timeMinutes
          ? Number(it.timeMinutes) / 60
          : Number(it.quantity || 1);
      const qtyInput =
        it.qtyInput ||
        it.displayValue ||
        (qtyMode === "time"
          ? it.inputValue || ""
          : it.inputValue || String(qtyValue));
      const rowTotal =
        it.rowTotal != null
          ? Number(it.rowTotal)
          : it.totalPrice != null
          ? Number(it.totalPrice)
          : price * qtyValue;

      return {
        name,
        price,
        qtyMode,
        qtyValue,
        qtyInput,
        rowTotal,
      };
    });
    renderItemsList();

    currentJobCorrections = job.correctionsList || [];
    renderCorrectionsList();

    // set delete button state based on items/status
    updateDeleteButtonState();

    if (editorModal) editorModal.style.display = "flex";
  } catch (err) {
    console.error("openProjectEditor error:", err);
    showToast("Error loading project", "error");
  }
}

// --------------- SAVE PROJECT CHANGES ---------------
if (saveProjectChanges) {
  saveProjectChanges.addEventListener("click", async () => {
    if (!currentEditingJobId || !currentEditingJobData) return;

    try {
      const finalTotal = calculateTotalAmount();
      const adv = Number(currentEditingJobData.advancePayment || 0);
      const wasReady =
        !!currentEditingJobData?.dataReadyDate ||
        String(currentEditingJobData?.status || "").toLowerCase() === "ready";

      const updates = {
        projectName: editProjectName.value.trim(),
        dataCopyDate: (editDataCopyDate && editDataCopyDate.value) || currentEditingJobData?.dataCopyDate || "",
        dataReadyDate: editDataReadyDate.value || "",
        dataDeliverDate: editDataDeliverDate.value || "",
        moveData: parseInt((editMoveData && editMoveData.value) || currentEditingJobData?.moveData || "0", 10),
        deleteData: parseInt((editDeleteData && editDeleteData.value) || currentEditingJobData?.deleteData || "0", 10),
        correctionData: parseInt((editCorrectionData && editCorrectionData.value) || currentEditingJobData?.correctionData || "0", 10),
        totalAmount: finalTotal,
        advancePayment: adv,
        itemsAdded: currentJobItems,
        correctionsList: currentJobCorrections,
        status: (editStatus && editStatus.value) || currentEditingJobData?.status || "Assigned",
        updatedAt: serverTimestamp(),
        editorName: currentUserData?.fullName || currentUserEmail,
      };

      await updateDoc(doc(db, "jobs", currentEditingJobId), updates);

      currentEditingJobData = {
        ...currentEditingJobData,
        ...updates,
      };

      if (currentEditingJobData.studioName) {
        await recalcAndUpdateCustomerBalance(currentEditingJobData.studioName);
      }

      const isReadyNow =
        !!currentEditingJobData?.dataReadyDate ||
        String(currentEditingJobData?.status || "").toLowerCase() === "ready";
      if (!wasReady && isReadyNow) {
        await createAdminNotification({
          title: "Job Ready",
          message: `Job ready for ${currentEditingJobData?.studioName || "Studio"} (${currentEditingJobData?.projectName || "Project"}).`,
          studioName: currentEditingJobData?.studioName || "",
          jobNo: currentEditingJobData?.jobNo || "",
          source: "job_ready",
        });
      }

      showToast("Project updated");
      if (editorModal) editorModal.style.display = "none";
    } catch (err) {
      console.error("saveProjectChanges error:", err);
      showToast("Error updating project", "error");
    }
  });
}

// --------------- DELETE PROJECT HANDLER (EMPLOYEE DELETE = UNASSIGN ONLY) ---------------
if (deleteProjectBtn) {
  deleteProjectBtn.addEventListener("click", async () => {
    if (!currentEditingJobId) return;

    const ok = confirm(
      "Are you sure you want to delete this project from your profile?\n\nThis will NOT delete the project from the system. It will only unassign it from your account."
    );
    if (!ok) return;

    try {
      // Unassign from employee/profile only — DO NOT delete the job document
      await updateDoc(doc(db, "jobs", currentEditingJobId), {
        assignedToEmail: "",
        assignedTo: "",
        editorName: "",
        assignedAt: "",
        updatedAt: serverTimestamp()
      });

      // modal close
      if (editorModal) editorModal.style.display = "none";

      // local clear
      currentEditingJobId = null;
      currentEditingJobData = null;
      currentJobItems = [];
      currentJobCorrections = [];
      renderItemsList();
      renderCorrectionsList();

      // refresh available projects so it appears in the assign modal if needed
      await preloadCustomerStudios(); // refresh customer cache
      loadAvailableProjects();

      showToast("Project removed from your profile");
    } catch (err) {
      console.error("delete project error:", err);
      showToast("Error removing project", "error");
    }
  });
}

// --------------- RECALC CUSTOMER BALANCE (same as clients.html) ---------------
async function recalcAndUpdateCustomerBalance(studioName) {
  try {
    let totalBal = 0;
    let totalPay = 0;

    const jobSnap = await getDocs(
      query(collection(db, "jobs"), where("studioName", "==", studioName))
    );
    jobSnap.forEach((d) => {
      const j = d.data();
      totalBal +=
        (Number(j.totalAmount) || 0) - (Number(j.advancePayment) || 0);
    });

    const paySnap = await getDocs(
      query(collection(db, "payments"), where("studioName", "==", studioName))
    );
    paySnap.forEach((d) => {
      totalPay += Number(d.data().amount || 0);
    });

    let newBal = totalBal - totalPay;
    let advance = 0;
    if (newBal < 0) {
      advance = Math.abs(newBal);
      newBal = 0;
    }

    const custSnap = await getDocs(
      query(collection(db, "customers"), where("studioName", "==", studioName))
    );
    if (!custSnap.empty) {
      await updateDoc(doc(db, "customers", custSnap.docs[0].id), {
        balance: newBal,
        advanceAmount: advance,
        updatedAt: serverTimestamp()
      });
      // refresh cached set
      await preloadCustomerStudios();
    }
  } catch (err) {
    console.error("recalcAndUpdateCustomerBalance error:", err);
  }
}

// --------------- PRELOAD CUSTOMER STUDIOS (for filtering assignments) ---------------
async function preloadCustomerStudios() {
  try {
    const snap = await getDocs(collection(db, "customers"));
    cachedCustomerStudiosSet = new Set();
    snap.forEach((d) => {
      const s = (d.data().studioName || "").toString().trim();
      if (s) cachedCustomerStudiosSet.add(s.toLowerCase());
    });
  } catch (err) {
    console.error("preloadCustomerStudios error:", err);
    cachedCustomerStudiosSet = new Set();
  }
}

// --------------- AVAILABLE PROJECTS (ASSIGN MODAL) ---------------
// NOTE: only show projects that are not assigned, not deleted, and belong to a customer profile (studio exists)
async function loadAvailableProjects() {
  try {
    // ensure customers cache up to date
    await preloadCustomerStudios();

    const snap = await getDocs(collection(db, "jobs"));
    availableProjects = [];
    snap.forEach((d) => {
      const j = d.data();
      // skip jobs that are already assigned OR soft-deleted
      if (j.assignedToEmail) return;

      // job must have a studioName (or customerName) that exists in customers collection
      const studioName = (j.studioName || j.customerName || "").toString().trim();
      if (!studioName) return;

      // check in preload set (case-insensitive)
      if (!cachedCustomerStudiosSet.has(studioName.toLowerCase())) {
        // studio not found in customers -> skip it (do not show to assign)
        return;
      }

      availableProjects.push({
        id: d.id,
        jobNo: j.jobNo || "",
        projectName: j.projectName || "",
        studioName: j.studioName || "",
        customerName: j.customerName || "",
      });
    });
    renderProjectList(availableProjects);
  } catch (err) {
    console.error("loadAvailableProjects error:", err);
    if (projectListEl) projectListEl.innerHTML =
      '<div class="muted" style="padding:16px;">Error loading projects</div>';
  }
}

function renderProjectList(list) {
  if (!projectListEl) return;
  if (!list.length) {
    projectListEl.innerHTML =
      '<div class="muted" style="padding:16px;">No projects available</div>';
    return;
  }
  projectListEl.innerHTML = list
    .map(
      (p) => `
      <div class="project-item ${p.id === selectedProjectId ? "selected" : ""}" data-id="${p.id}">
        <div>
          <b>${p.projectName || "-"}</b><br>
          <span class="muted">Studio: ${p.studioName || "-"}</span><br>
          <span class="muted">Job No: ${p.jobNo || "-"}</span>
        </div>
      </div>
    `
    )
    .join("");

  document.querySelectorAll(".project-item").forEach((el) => {
    el.onclick = () => {
      selectedProjectId = el.dataset.id;
      renderProjectList(list);
      if (confirmAssign) confirmAssign.disabled = false;
    };
  });
}

// --------------- SEARCH IN MODAL (EXISTING - NO CHANGE) ---------------
if (projectSearch) {
  projectSearch.addEventListener("input", () => {
    const qTxt = projectSearch.value.toLowerCase();
    const filtered = availableProjects.filter(
      (p) =>
        (p.projectName || "").toLowerCase().includes(qTxt) ||
        (p.studioName || "").toLowerCase().includes(qTxt) ||
        (p.jobNo || "").toLowerCase().includes(qTxt)
    );
    renderProjectList(filtered);
  });
}

// --------------- ASSIGN MODAL OPEN/CLOSE ---------------
if (assignProjectBtn) {
  assignProjectBtn.addEventListener("click", async () => {
    selectedProjectId = null;
    if (confirmAssign) confirmAssign.disabled = true;
    if (projectSearch) projectSearch.value = "";
    // refresh available projects each time modal opens
    await preloadCustomerStudios();
    await loadAvailableProjects();
    if (assignModal) assignModal.style.display = "flex";
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    if (assignModal) assignModal.style.display = "none";
  });
}
if (cancelAssignBtn) {
  cancelAssignBtn.addEventListener("click", () => {
    if (assignModal) assignModal.style.display = "none";
  });
}

if (assignModal) {
  assignModal.addEventListener("click", (e) => {
    if (e.target === assignModal) assignModal.style.display = "none";
  });
}

// --------------- ASSIGN PROJECT ---------------
// Ensure job belongs to a customer before assigning.
// Also ensure the job isn't soft-deleted.
if (confirmAssign) {
  confirmAssign.addEventListener("click", async () => {
    if (!selectedProjectId) return;
    const proj = availableProjects.find((p) => p.id === selectedProjectId);
    if (!proj) return;

    try {
      // double-check job doc exists & not deleted
      const jobDocRef = doc(db, "jobs", proj.id);
      const jobDocSnap = await getDoc(jobDocRef);
      if (!jobDocSnap.exists()) {
        showToast("Project not found", "error");
        return;
      }
      const jobData = jobDocSnap.data();

      // make sure the related customer exists
      const studioName = (jobData.studioName || jobData.customerName || "").toString().trim();
      if (!studioName) {
        showToast("Project missing studio/customer name. Cannot assign.", "error");
        return;
      }
      const custSnap = await getDocs(query(collection(db, "customers"), where("studioName", "==", studioName)));
      if (custSnap.empty) {
        showToast("Customer profile not found for the project's studio. Cannot assign.", "error");
        // refresh cache & list to remove this job from available list
        await preloadCustomerStudios();
        await loadAvailableProjects();
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      await updateDoc(jobDocRef, {
        assignedToEmail: currentUserEmail,
        assignedTo: currentUserData?.fullName || currentUserEmail,
        editorName: currentUserData?.fullName || currentUserEmail,
        status: "Assigned",
        addItemDate: today,
        dataCopyDate: today,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // update customer's lastAssignedEditor + timestamp
      try {
        if (!custSnap.empty) {
          await updateDoc(doc(db, "customers", custSnap.docs[0].id), {
            lastAssignedEditor: currentUserData?.fullName || currentUserEmail,
            lastAssignedAt: serverTimestamp()
          });
        }
      } catch (custErr) {
        console.error("Error updating customer's lastAssignedEditor:", custErr);
      }

      // remove from availableProjects and close modal
      availableProjects = availableProjects.filter((p) => p.id !== proj.id);
      if (assignModal) assignModal.style.display = "none";
      await createAdminNotification({
        title: "Job Assigned",
        message: `Job assigned to ${currentUserData?.fullName || currentUserEmail} (${jobData.projectName || "Project"}).`,
        studioName: jobData.studioName || jobData.customerName || "",
        jobNo: jobData.jobNo || "",
        source: "job_assigned",
      });
      showToast("Project assigned");
    } catch (err) {
      console.error("assign project error:", err);
      showToast("Error assigning project", "error");
    }
  });
}

// --------------- EDITOR MODAL CLOSE ---------------
if (closeEditorModal) {
  closeEditorModal.addEventListener("click", () => {
    if (editorModal) editorModal.style.display = "none";
  });
}
if (cancelEditor) {
  cancelEditor.addEventListener("click", () => {
    if (editorModal) editorModal.style.display = "none";
  });
}

if (editorModal) {
  editorModal.addEventListener("click", (e) => {
    if (e.target === editorModal) editorModal.style.display = "none";
  });
}

// --------------- REFRESH PROJECTS BUTTON ---------------
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    preloadCustomerStudios().then(loadAvailableProjects);
    startJobsListener(); // Refresh assigned jobs too
    showToast("Projects refreshed");
  });
}

if (punchInBtn) {
  punchInBtn.addEventListener("click", () => {
    showPunchConfirm();
  });
}

function showPunchConfirm() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN");
  const timeStr = now.toLocaleTimeString("en-IN");
  if (punchConfirmText) {
    punchConfirmText.textContent = `Are you sure you want to punch in on ${dateStr} at ${timeStr}?`;
  }
  if (punchConfirmModal) punchConfirmModal.style.display = "flex";
}

function closePunchConfirmModal() {
  if (punchConfirmModal) punchConfirmModal.style.display = "none";
}

if (confirmPunchIn) {
  confirmPunchIn.addEventListener("click", () => {
    closePunchConfirmModal();
    submitPunchIn();
  });
}
if (cancelPunchConfirm) cancelPunchConfirm.addEventListener("click", closePunchConfirmModal);
if (closePunchConfirm) closePunchConfirm.addEventListener("click", closePunchConfirmModal);
if (punchConfirmModal) {
  punchConfirmModal.addEventListener("click", (e) => {
    if (e.target === punchConfirmModal) closePunchConfirmModal();
  });
}

if (notifBtn) {
  notifBtn.addEventListener("click", () => {
    const willShow = !(notifPanel && notifPanel.style.display === "block");
    toggleNotifPanel(willShow);
    if (willShow) markNotifsRead();
  });
}
if (notifClose) {
  notifClose.addEventListener("click", () => toggleNotifPanel(false));
}

if (messageBtn) {
  messageBtn.addEventListener("click", () => {
    showToast("Messages coming soon");
  });
}

// --------------- CREATE NEW JOB BUTTON (optional) ---------------
if (createJobBtn) {
  createJobBtn.addEventListener("click", () => {
    window.location.href = "./create-new-job/create-new-job.html";
  });
}

// --------------- LOGOUT ---------------
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    signOut(auth)
      .catch(() => {})
      .finally(() => {
        window.location.href = "../index.html";
      });
  });
}

// --------------- SEARCH INPUT EVENT LISTENER (FOR JOBS TABLE) ---------------
document.addEventListener('DOMContentLoaded', function() {
  // Search input for jobs table (if exists in HTML)
  const jobsSearchInput = document.getElementById("jobsSearchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  
  if (jobsSearchInput) {
    jobsSearchInput.addEventListener('input', function() {
      applyJobsSearch();
    });
  }
  
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', function() {
      if (jobsSearchInput) {
        jobsSearchInput.value = '';
        applyJobsSearch();
      }
    });
  }
});

