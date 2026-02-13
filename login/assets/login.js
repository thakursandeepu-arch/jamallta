/* ================== IMPORTS ================== */
import { auth, db, functions } from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  confirmPasswordReset,
  setPersistence,
  browserLocalPersistence,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-functions.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ================== ELEMENTS ================== */
const emailEl = document.getElementById("email");
const passEl  = document.getElementById("password");
const togglePass = document.getElementById("togglePass");
const btn     = document.getElementById("loginBtn");
const loginForm = document.getElementById("loginForm");
const errEl   = document.getElementById("error-message");
const pageLoader = document.getElementById("pageLoader");

/* Forgot password modal */
const forgotBtn   = document.getElementById("forgotBtn");
const loginOtpBtn = document.getElementById("loginOtpBtn");
const forgotModal = document.getElementById("forgotModal");
const closeModal  = document.getElementById("closeModal");
const sendLinkBtn = document.getElementById("sendLinkBtn");
const sendOtpBtn  = document.getElementById("sendOtpBtn");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const resetEmail  = document.getElementById("resetEmail");
const resetOtp    = document.getElementById("resetOtp");
const resetOtpRow = resetOtp ? resetOtp.parentElement : null;
const resetRecaptcha = document.getElementById("resetRecaptcha");
const resetMsg    = document.getElementById("resetMsg");

/* Create account modal */
const createBtn   = document.getElementById("createBtn");
const comingModal = document.getElementById("comingModal");
const closeComing = document.getElementById("closeComing");

const newPassModal = document.getElementById("newPassModal");
const newPassInput = document.getElementById("newPassInput");
const confirmPassInput = document.getElementById("confirmPassInput");
const saveNewPassBtn = document.getElementById("saveNewPassBtn");
const closeNewPass = document.getElementById("closeNewPass");
const newPassMsg = document.getElementById("newPassMsg");
const newPassForm = document.getElementById("newPassForm");

/* ================== LOADER ================== */
function startLoading() {
  btn.classList.add("loading");
  pageLoader.style.display = "flex";
}

function stopLoading() {
  btn.classList.remove("loading");
  pageLoader.style.display = "none";
}

if (togglePass && passEl) {
  togglePass.addEventListener("click", () => {
    const isHidden = passEl.type === "password";
    passEl.type = isHidden ? "text" : "password";
    togglePass.textContent = isHidden ? "Hide" : "Show";
    togglePass.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
  });
}

let persistenceReady = false;
async function ensurePersistence() {
  if (persistenceReady) return;
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (_) {
    // ignore; fallback to default persistence
  } finally {
    persistenceReady = true;
  }
}

// Auto-keep login on mobile/desktop if user didn't logout
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  // avoid redirect loops on logout modal etc.
  startLoading();
  redirectByRole(user.uid);
});

/* ================== ROLE BASED REDIRECT ================== */
async function redirectByRole(uid, options = {}) {
  const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];
  const preferCustomer = !!options.preferCustomer;
  const currentEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : "";
  const phoneE164 = (auth.currentUser && auth.currentUser.phoneNumber) ? auth.currentUser.phoneNumber : "";
  const phoneCandidates = phoneE164 ? buildPhoneVariants(phoneE164) : [];
  const isAllowedAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());
  const isAdminEmail = isAllowedAdminEmail(currentEmail);

  const findByPhone = async (colName) => {
    if (!phoneCandidates.length) return false;
    for (const candidate of phoneCandidates) {
      // Try phoneE164 first
      const qE164 = query(collection(db, colName), where("phoneE164", "==", candidate));
      const snapE164 = await getDocs(qE164);
      if (!snapE164.empty) return true;

      // Fallback to phone field
      const qPhone = query(collection(db, colName), where("phone", "==", candidate));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) return true;
    }
    return false;
  };
  const goEmployee = async () => {
    try {
      // First try by uid
      const empSnap = await getDoc(doc(db, "employees", uid));
      if (empSnap.exists()) {
        location.href = "../employee/employee.html";
        return true;
      }
      // Fallback by email
      if (currentEmail) {
        const empQ = query(collection(db, "employees"), where("email", "==", currentEmail));
        const empEmailSnap = await getDocs(empQ);
        if (!empEmailSnap.empty) {
          location.href = "../employee/employee.html";
          return true;
        }
      }
      // Fallback by phone
      if (await findByPhone("employees")) {
        location.href = "../employee/employee.html";
        return true;
      }
    } catch (e) {
      console.error("Employee role check failed:", e);
    }
    return false;
  };

  const goAdmin = async () => {
    try {
      if (!isAdminEmail) return false;
      const adminSnap = await getDoc(doc(db, "users", uid));
      if (adminSnap.exists()) {
        const role = (adminSnap.data()?.role || "").toLowerCase();
        const docEmail = adminSnap.data()?.email || "";
        if (role.includes("admin") && (isAllowedAdminEmail(currentEmail) || isAllowedAdminEmail(docEmail))) {
          location.href = "../admin/admin.html";
          return true;
        }
      }
      if (currentEmail) {
        const adminQ = query(collection(db, "users"), where("email", "==", currentEmail));
        const adminEmailSnap = await getDocs(adminQ);
        if (!adminEmailSnap.empty) {
          const hasAdmin = adminEmailSnap.docs.some(d => ((d.data()?.role || "").toLowerCase()).includes("admin") && isAllowedAdminEmail(d.data()?.email));
          if (hasAdmin && isAllowedAdminEmail(currentEmail)) {
            location.href = "../admin/admin.html";
            return true;
          }
        }
      }
      if (phoneCandidates.length) {
        for (const candidate of phoneCandidates) {
          const qE164 = query(collection(db, "users"), where("phoneE164", "==", candidate));
          const snapE164 = await getDocs(qE164);
          if (!snapE164.empty) {
            const hasAdmin = snapE164.docs.some(d => ((d.data()?.role || "").toLowerCase()).includes("admin"));
            if (hasAdmin) { location.href = "../admin/admin.html"; return true; }
          }
          const qPhone = query(collection(db, "users"), where("phone", "==", candidate));
          const snapPhone = await getDocs(qPhone);
          if (!snapPhone.empty) {
            const hasAdmin = snapPhone.docs.some(d => ((d.data()?.role || "").toLowerCase()).includes("admin"));
            if (hasAdmin) { location.href = "../admin/admin.html"; return true; }
          }
        }
      }
    } catch (e) {
      console.error("Admin role check failed:", e);
    }
    return false;
  };

  const goCustomer = async () => {
    try {
      if (currentEmail) {
        const q = query(
          collection(db, "customers"),
          where("email", "==", currentEmail)
        );
        const customerSnap = await getDocs(q);
        if (!customerSnap.empty) {
          location.href = "../customer/customer-profile.html";
          return true;
        }
      }
      if (await findByPhone("customers")) {
        location.href = "../customer/customer-profile.html";
        return true;
      }
    } catch (e) {
      console.error("Customer role check failed:", e);
    }
    return false;
  };

  if (preferCustomer) {
    if (await goCustomer()) return;
    if (await goEmployee()) return;
    if (await goAdmin()) return;
  } else {
    if (!isAdminEmail) {
      if (await goEmployee()) return;
      if (await goCustomer()) return;
    } else {
      if (await goAdmin()) return;
      if (await goEmployee()) return;
      if (await goCustomer()) return;
    }
  }

  /* NO ACCESS */
  errEl.textContent = "No access assigned";
  stopLoading();
}

/* ================== LOGIN ================== */
btn.onclick = async () => {
  errEl.textContent = "";
  startLoading();

  try {
    const rawId = emailEl.value.trim();
    const pass = passEl.value.trim();

    let loginEmail = rawId;
    let preferCustomer = false;

    const looksLikeEmail = rawId.includes("@");
    const rawDigits = rawId.replace(/\D/g, "");
    const looksLikePhone = !looksLikeEmail && rawDigits.length >= 8;
    const lookupLogin = httpsCallable(functions, "lookupLogin");

    if (!pass) {
      stopLoading();
      errEl.textContent = "Password is required";
      return;
    }

    if (!looksLikeEmail) {
      try {
        const res = await lookupLogin({ identifier: rawId });
        const data = res?.data || {};
        if (!data?.ok || !data?.email) {
          stopLoading();
          if (data?.reason === "missing_email") {
            errEl.textContent = "Email missing for this mobile/ID. Please ask admin to add email.";
          } else if (looksLikePhone) {
            errEl.textContent = "Mobile number not found";
          } else {
            errEl.textContent = "Client ID not found";
          }
          return;
        }
        loginEmail = data.email;
        preferCustomer = data.role === "customer";
      } catch (e) {
        stopLoading();
        errEl.textContent = "Login lookup failed. Try again.";
        return;
      }
    } else {
      // Optional: check role hint for email to prefer customer
      try {
        const res = await lookupLogin({ identifier: rawId });
        const data = res?.data || {};
        if (data?.ok && data?.role === "customer") preferCustomer = true;
      } catch (_) {
        // ignore
      }
    }

    await ensurePersistence();
    const cred = await signInWithEmailAndPassword(auth, loginEmail, pass);

    // Professional delay (UX)
    setTimeout(() => {
      redirectByRole(cred.user.uid, { preferCustomer });
    }, 600);

  } catch (err) {
    stopLoading();
    const code = err?.code || "";
    if (code === "auth/user-not-found") {
      errEl.textContent = "Account not found. Ask admin to sync users or use Forgot password.";
    } else if (code === "auth/wrong-password") {
      errEl.textContent = "Invalid email or password";
    } else {
      errEl.textContent = "Invalid email or password";
    }
  }
};

/* ================== FORGOT PASSWORD ================== */
forgotBtn.onclick = () => {
  resetMsg.textContent = "";
  otpVerified = false;
  otpPurpose = "reset";
  if (emailEl && emailEl.value.trim()) {
    resetEmail.value = emailEl.value.trim();
  }
  const mode = detectResetMode(resetEmail.value);
  setResetMode(mode);
  otpResetMode = mode === "phone";
  forgotModal.style.display = "flex";
};

closeModal.onclick = () => {
  forgotModal.style.display = "none";
};

let resetRecaptchaVerifier = null;
let resetConfirmation = null;
let otpResetMode = false;
let otpVerified = false;
let otpPurpose = "reset"; // "reset" only

function normalizePhone(input) {
  const raw = (input || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw.replace(/\s+/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return "";
}

function buildPhoneVariants(input) {
  const raw = (input || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  const set = new Set();
  set.add(digits);
  if (last10) set.add(last10);
  if (last10) set.add(`0${last10}`);
  if (last10) set.add(`+91${last10}`);
  if (digits.startsWith("91") && digits.length === 12) set.add(`+${digits}`);
  return [...set].filter(Boolean);
}

async function phoneExistsInProfiles(input) {
  // Client-side Firestore reads are blocked for logged-out users in production rules.
  // Keep this as a stub for future server-side validation.
  return true;
}

function setResetMode(mode) {
  if (mode === "phone") {
    sendLinkBtn.classList.add("hidden");
    sendOtpBtn.classList.remove("hidden");
    verifyOtpBtn.classList.add("hidden");
    resetOtpRow && resetOtpRow.classList.add("hidden");
  } else {
    sendLinkBtn.classList.remove("hidden");
    sendOtpBtn.classList.add("hidden");
    verifyOtpBtn.classList.add("hidden");
    resetOtpRow && resetOtpRow.classList.add("hidden");
  }
}

function ensureResetRecaptcha() {
  if (resetRecaptchaVerifier) return resetRecaptchaVerifier;
  resetRecaptchaVerifier = new RecaptchaVerifier(auth, resetRecaptcha, {
    size: "invisible"
  });
  return resetRecaptchaVerifier;
}

function detectResetMode(value) {
  const v = (value || "").trim();
  if (!v) return "email";
  if (v.includes("@")) return "email";
  return "phone";
}

resetEmail.addEventListener("input", () => {
  resetMsg.textContent = "";
  const mode = detectResetMode(resetEmail.value);
  setResetMode(mode);
  otpResetMode = mode === "phone";
});

sendLinkBtn.onclick = async () => {
  resetMsg.textContent = "";
  const email = resetEmail.value.trim();
  if (!email) {
    resetMsg.style.color = "red";
    resetMsg.textContent = "Enter a valid email address";
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    // Firebase can be configured to not reveal whether the email exists.
    resetMsg.style.color = "green";
    resetMsg.textContent = "If this email is registered, a reset link has been sent.";
  } catch (err) {
    resetMsg.style.color = "red";
    const code = err?.code || "";
    if (code === "auth/invalid-email") {
      resetMsg.textContent = "Invalid email address";
    } else if (code === "auth/user-not-found") {
      resetMsg.textContent = "Email not found in system";
    } else if (code === "auth/too-many-requests") {
      resetMsg.textContent = "Too many attempts. Try again later.";
    } else {
      resetMsg.textContent = "Reset failed. Please try again.";
    }
  }
};

sendOtpBtn.onclick = async () => {
  resetMsg.textContent = "";
  const phone = normalizePhone(resetEmail.value);
  if (!phone) {
    resetMsg.style.color = "red";
    resetMsg.textContent = "Enter valid mobile number with country code.";
    return;
  }
  try {
    await phoneExistsInProfiles(resetEmail.value);
    const verifier = ensureResetRecaptcha();
    resetConfirmation = await signInWithPhoneNumber(auth, phone, verifier);
    resetMsg.style.color = "green";
    resetMsg.textContent = "OTP sent to your phone.";
    verifyOtpBtn.classList.remove("hidden");
    resetOtpRow && resetOtpRow.classList.remove("hidden");
  } catch (err) {
    console.error("Reset OTP send failed:", err);
    resetMsg.style.color = "red";
    const code = err?.code || "";
    if (code === "auth/invalid-phone-number") {
      resetMsg.textContent = "Invalid phone number.";
    } else if (code === "auth/too-many-requests") {
      resetMsg.textContent = "Too many attempts. Try again later.";
    } else {
      resetMsg.textContent = "OTP send failed. Please try again.";
    }
  }
};

verifyOtpBtn.onclick = async () => {
  resetMsg.textContent = "";
  if (!resetConfirmation) {
    resetMsg.style.color = "red";
    resetMsg.textContent = "Please send OTP first.";
    return;
  }
  const code = (resetOtp?.value || "").trim();
  if (!code) {
    resetMsg.style.color = "red";
    resetMsg.textContent = "Enter the OTP.";
    return;
  }
  try {
    await resetConfirmation.confirm(code);
    otpVerified = true;
    resetMsg.style.color = "green";
    resetMsg.textContent = "OTP verified. Set a new password.";
    forgotModal.style.display = "none";
    showNewPassModal();
  } catch (err) {
    console.error("OTP verify failed:", err);
    resetMsg.style.color = "red";
    resetMsg.textContent = "Invalid OTP.";
  }
};

// Auto-open reset password modal if link contains reset code
const resetCode = getResetCodeFromUrl();
if (resetCode) {
  showNewPassModal();
}

/* ================== CREATE ACCOUNT ================== */
createBtn.onclick = () => {
  comingModal.style.display = "flex";
};

closeComing.onclick = () => {
  comingModal.style.display = "none";
};

function getResetCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");
  if (mode === "resetPassword" && oobCode) return oobCode;
  return "";
}

function showNewPassModal() {
  if (!newPassModal) return;
  newPassModal.style.display = "flex";
}

function hideNewPassModal() {
  if (!newPassModal) return;
  newPassModal.style.display = "none";
}

if (closeNewPass) {
  closeNewPass.onclick = hideNewPassModal;
}

if (saveNewPassBtn) {
  const handleSave = async () => {
    newPassMsg.textContent = "";
    const p1 = (newPassInput?.value || "").trim();
    const p2 = (confirmPassInput?.value || "").trim();
    if (!p1 || p1.length < 6) {
      newPassMsg.style.color = "red";
      newPassMsg.textContent = "Password must be at least 6 characters.";
      return;
    }
    if (p1 !== p2) {
      newPassMsg.style.color = "red";
      newPassMsg.textContent = "Passwords do not match.";
      return;
    }
    const code = getResetCodeFromUrl();
    if (!code) {
      if (!otpVerified) {
        newPassMsg.style.color = "red";
        newPassMsg.textContent = "Invalid or expired link.";
        return;
      }
    }
    try {
      if (otpVerified && otpResetMode) {
        const setPasswordFromOtp = httpsCallable(functions, "setPasswordFromOtp");
        await setPasswordFromOtp({ newPassword: p1 });
        await signOut(auth);
        newPassMsg.style.color = "green";
        newPassMsg.textContent = "Password updated. You can login now.";
        setTimeout(() => {
          hideNewPassModal();
          window.location.href = "login.html";
        }, 1200);
      } else {
        await confirmPasswordReset(auth, code, p1);
        newPassMsg.style.color = "green";
        newPassMsg.textContent = "Password updated. You can login now.";
        setTimeout(() => {
          hideNewPassModal();
          window.location.href = "login.html";
        }, 1200);
      }
    } catch (err) {
      newPassMsg.style.color = "red";
      const code = err?.code || "";
      if (code === "permission-denied") {
        newPassMsg.textContent = "Admin access required.";
      } else if (code === "unauthenticated") {
        newPassMsg.textContent = "OTP session expired. Try again.";
      } else if (code === "invalid-argument") {
        newPassMsg.textContent = "Password is too weak.";
      } else {
        newPassMsg.textContent = "Reset failed. Please try again.";
      }
      console.error("confirmPasswordReset failed:", err);
    }
  };
  saveNewPassBtn.onclick = handleSave;
  if (newPassForm) {
    newPassForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSave();
    });
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    btn.click();
  });
}
