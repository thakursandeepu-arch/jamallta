// admin-auth.js
// Admin Security Guard

import { auth, db, waitForAuthReady } from "/login/assets/firebase-config.js?v=2";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];
const ADMIN_SESSION_KEY = "jamallta_admin_session";
const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const isAllowedAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());
const isFramedAdminPage = window.top && window.top !== window.self;

function readAdminSession(user) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ADMIN_SESSION_KEY) || localStorage.getItem(ADMIN_SESSION_KEY) || "{}");
    const email = (user?.email || "").toLowerCase();
    return cached?.uid === user?.uid &&
      cached?.email === email &&
      Date.now() - Number(cached?.savedAt || 0) < ADMIN_SESSION_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function saveAdminSession(user) {
  try {
    const payload = JSON.stringify({
      uid: user.uid,
      email: (user.email || "").toLowerCase(),
      savedAt: Date.now()
    });
    sessionStorage.setItem(ADMIN_SESSION_KEY, payload);
    localStorage.setItem(ADMIN_SESSION_KEY, payload);
  } catch {}
}

function clearAdminSession() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {}
}

function markAdminAuthBlocked(reason) {
  console.warn(`[admin-auth] access not confirmed: ${reason}`);
  document.documentElement.dataset.adminAuth = "blocked";
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => markAdminAuthBlocked(reason), { once: true });
    return;
  }
  const welcome = document.getElementById("welcomeName");
  if (welcome && !auth.currentUser) {
    welcome.textContent = "Login required";
  }
}

async function hasAdminRole(user) {
  const email = (user.email || "").toLowerCase();
  if (!isAllowedAdminEmail(email)) return false;

  const roleIncludesAdmin = (snap) => {
    if (!snap?.exists?.()) return false;
    return String(snap.data()?.role || "").toLowerCase().includes("admin");
  };

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (roleIncludesAdmin(userSnap)) return true;

    const userByEmail = await getDocs(query(collection(db, "users"), where("email", "==", email)));
    if (userByEmail.docs.some(roleIncludesAdmin)) return true;

    const empSnap = await getDoc(doc(db, "employees", user.uid));
    if (roleIncludesAdmin(empSnap)) return true;

    const empByEmail = await getDocs(query(collection(db, "employees"), where("email", "==", email)));
    return empByEmail.docs.some(roleIncludesAdmin);
  } catch (err) {
    console.error("[admin-auth] role check failed", err);
    return false;
  }
}

async function setWelcomeName(user) {
  const welcome = document.getElementById("welcomeName");
  if (!welcome) return;

  try {
    const empSnap = await getDoc(doc(db, "employees", user.uid));
    if (empSnap.exists() && empSnap.data().name) {
      welcome.textContent = "Welcome, " + empSnap.data().name;
      return;
    }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists() && userSnap.data().name) {
      welcome.textContent = "Welcome, " + userSnap.data().name;
      return;
    }

    welcome.textContent = "Welcome, " + (user.displayName || "Admin");
  } catch {
    welcome.textContent = "Welcome, Admin";
  }
}

async function checkAdminAccess(user) {
  try {
    if (!user) {
      clearAdminSession();
      markAdminAuthBlocked("not signed in");
      return;
    }

    if (isFramedAdminPage && (readAdminSession(user) || isAllowedAdminEmail(user.email))) {
      saveAdminSession(user);
      return;
    }

    const isAdmin = await hasAdminRole(user);
    if (!isAdmin) {
      console.warn("[admin-auth] access denied (not admin)");
      clearAdminSession();
      markAdminAuthBlocked("not admin");
      return;
    }

    saveAdminSession(user);

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setWelcomeName(user), { once: true });
    } else {
      setWelcomeName(user);
    }
  } catch (err) {
    console.error("[admin-auth] unexpected error", err);
    markAdminAuthBlocked("unexpected error");
  }
}

waitForAuthReady().then(() => {
  checkAdminAccess(auth.currentUser);
  onAuthStateChanged(auth, (user) => {
    checkAdminAccess(user);
  });
});
