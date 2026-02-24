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
const forgotModal = document.getElementById("forgotModal");
const closeModal  = document.getElementById("closeModal");
const sendLinkBtn = document.getElementById("sendLinkBtn");
const sendOtpBtn  = document.getElementById("sendOtpBtn");
const verifyOtpBtn = document.getElementById("verifyOtpBtn");
const resetEmail  = document.getElementById("resetEmail");
const resetTitle = document.getElementById("resetTitle");
const resetHint = document.getElementById("resetHint");
const resetOtp    = document.getElementById("resetOtp");
const resetOtpRow = resetOtp ? resetOtp.parentElement : null;
const resetRecaptcha = document.getElementById("resetRecaptcha");
const resetMsg    = document.getElementById("resetMsg");

/* Create account modal */
const createBtn   = document.getElementById("createBtn");

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
let suppressAutoRedirect = false;
const FORCE_LOGIN_KEY = "force_login";
const SUPPRESS_KEY = "suppress_auto_redirect";
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
  if (suppressAutoRedirect || sessionStorage.getItem(SUPPRESS_KEY) === "1") return;
  if (localStorage.getItem(FORCE_LOGIN_KEY) === "1") {
    localStorage.removeItem(FORCE_LOGIN_KEY);
    try { signOut(auth); } catch (_) { /* ignore */ }
    return;
  }
  // avoid redirect loops on logout modal etc.
  startLoading();
  redirectByRole(user.uid);
});

/* ================== ROLE BASED REDIRECT ================== */
async function redirectByRole(uid) {
  const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];
  const currentEmail = (auth.currentUser && auth.currentUser.email) ? auth.currentUser.email : "";
  const isAllowedAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());
  const isAdminEmail = isAllowedAdminEmail(currentEmail);
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
    } catch (e) {
      console.error("Customer role check failed:", e);
    }
    return false;
  };

  if (!isAdminEmail) {
    if (await goEmployee()) return;
    if (await goCustomer()) return;
  } else {
    if (await goAdmin()) return;
    if (await goEmployee()) return;
    if (await goCustomer()) return;
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

    if (!pass) {
      stopLoading();
      errEl.textContent = "Password is required";
      return;
    }
    const looksLikeEmail = rawId.includes("@");
    const rawDigits = rawId.replace(/\D/g, "");
    const looksLikePhone = !looksLikeEmail && rawDigits.length >= 8;
    const lookupLogin = httpsCallable(functions, "lookupLogin");

    if (!looksLikeEmail) {
      try {
        const res = await lookupLogin({ identifier: rawId });
        const data = res?.data || {};
        if (!data?.ok || !data?.email) {
          stopLoading();
          if (looksLikePhone) {
            errEl.textContent = "Mobile number not found";
          } else {
            errEl.textContent = "Email not found";
          }
          return;
        }
        loginEmail = data.email;
      } catch (e) {
        stopLoading();
        errEl.textContent = "Login lookup failed. Try again.";
        return;
      }
    } else if (!loginEmail) {
      stopLoading();
      errEl.textContent = "Please enter a valid email address";
      return;
    }

    await ensurePersistence();
    const cred = await signInWithEmailAndPassword(auth, loginEmail, pass);
    localStorage.removeItem(FORCE_LOGIN_KEY);
    sessionStorage.removeItem(SUPPRESS_KEY);

    // Professional delay (UX)
    setTimeout(() => {
      redirectByRole(cred.user.uid);
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
let resetViewMode = "reset"; // "reset" | "create"

function openResetModal(mode = "reset") {
  resetViewMode = mode;
  suppressAutoRedirect = true;
  sessionStorage.setItem(SUPPRESS_KEY, "1");
  resetMsg.textContent = "";
  otpVerified = false;
  if (emailEl && emailEl.value.trim()) {
    resetEmail.value = emailEl.value.trim();
  }
  if (resetTitle) {
    resetTitle.textContent = mode === "create" ? "Create Password" : "Reset Password";
  }
  if (resetHint) {
    resetHint.textContent = mode === "create"
      ? "Enter your email to create a password (account must already exist)."
      : "Enter your email to receive a password reset link.";
  }
  if (sendLinkBtn) {
    sendLinkBtn.textContent = mode === "create" ? "Send Create Link" : "Send Link";
  }
  const modeDetected = detectResetMode(resetEmail.value);
  setResetMode(modeDetected);
  otpResetMode = modeDetected === "phone";
  forgotModal.style.display = "flex";
}

forgotBtn.onclick = () => {
  openResetModal("reset");
};

closeModal.onclick = () => {
  forgotModal.style.display = "none";
  suppressAutoRedirect = false;
  sessionStorage.removeItem(SUPPRESS_KEY);
  if (auth?.currentUser?.uid) {
    startLoading();
    redirectByRole(auth.currentUser.uid);
  }
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
    resetMsg.textContent = resetViewMode === "create"
      ? "If this email is registered, a create-password link has been sent."
      : "If this email is registered, a reset link has been sent.";
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
    const verifier = ensureResetRecaptcha();
    resetConfirmation = await signInWithPhoneNumber(auth, phone, verifier);
    suppressAutoRedirect = true;
    sessionStorage.setItem(SUPPRESS_KEY, "1");
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
  (async () => {
    suppressAutoRedirect = true;
    sessionStorage.setItem(SUPPRESS_KEY, "1");
    try {
      await signOut(auth);
    } catch (_) {
      // ignore
    }
    showNewPassModal();
  })();
}

/* ================== CREATE ACCOUNT ================== */
createBtn.onclick = () => {
  openResetModal("create");
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
    try {
      const code = getResetCodeFromUrl();
      if (!code) {
        if (!otpVerified || !otpResetMode) {
          newPassMsg.style.color = "red";
          newPassMsg.textContent = "Invalid or expired link. Please use the email reset link.";
          return;
        }
        const setPasswordFromOtp = httpsCallable(functions, "setPasswordFromOtp");
        await setPasswordFromOtp({ newPassword: p1 });
      } else {
        await confirmPasswordReset(auth, code, p1);
      }
      try { await signOut(auth); } catch (_) { /* ignore */ }
      suppressAutoRedirect = false;
      sessionStorage.removeItem(SUPPRESS_KEY);
      newPassMsg.style.color = "green";
      newPassMsg.textContent = "Password updated. You can login now.";
      setTimeout(() => {
        hideNewPassModal();
        window.location.href = "login.html";
      }, 1200);
    } catch (err) {
      newPassMsg.style.color = "red";
      const code = err?.code || "";
      if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        newPassMsg.textContent = "Reset link expired. Please request a new link.";
      } else if (code === "unauthenticated") {
        newPassMsg.textContent = "OTP session expired. Try again.";
      } else if (code === "auth/weak-password" || code === "invalid-argument") {
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
