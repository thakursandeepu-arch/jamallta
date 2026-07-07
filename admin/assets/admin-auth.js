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
const isAllowedAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());
const isFramedAdminPage = window.top && window.top !== window.self;

function revealPage() {
  delete document.documentElement.dataset.authPending;
  document.documentElement.dataset.adminAuth = "ok";
}

function currentTarget() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function redirectTop(url) {
  if (isFramedAdminPage) {
    window.top.location.replace(url);
    return;
  }
  window.location.replace(url);
}

function redirectToLogin() {
  redirectTop(`/login/login.html?next=${encodeURIComponent(currentTarget())}`);
}

function parentAdminSessionOk() {
  if (!isFramedAdminPage) return false;
  try {
    return window.parent?.document?.documentElement?.dataset?.adminAuth === "ok";
  } catch (_) {
    return false;
  }
}

function markAdminAuthBlocked(reason) {
  console.warn(`[admin-auth] access not confirmed: ${reason}`);
  document.documentElement.dataset.adminAuth = "blocked";
  delete document.documentElement.dataset.authPending;
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
  if (isAllowedAdminEmail(email)) return true;

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
    if (parentAdminSessionOk()) {
      revealPage();
      if (user) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", () => setWelcomeName(user), { once: true });
        } else {
          setWelcomeName(user);
        }
      }
      return;
    }

    if (!user) {
      markAdminAuthBlocked("not signed in");
      redirectToLogin();
      return;
    }

    const isAdmin = await hasAdminRole(user);
    if (!isAdmin) {
      console.warn("[admin-auth] access denied (not admin)");
      markAdminAuthBlocked("not admin");
      redirectTop("/");
      return;
    }

    revealPage();

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
