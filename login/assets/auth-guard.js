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

const REDIRECT_TO = "/login/login.html";
const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];
const PUBLIC_PATHS = new Set([
  "/",
  "/index.html",
  "/login/login.html",
  "/offline.html",
  "/404.html"
]);

function currentPath() {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

function revealPage() {
  delete document.documentElement.dataset.authPending;
}

function loginUrl() {
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `${REDIRECT_TO}?next=${encodeURIComponent(next)}`;
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes((email || "").toLowerCase());
}

async function getUserRole(user) {
  const email = (user.email || "").toLowerCase();
  if (isAdminEmail(email)) return "admin";

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const role = (userSnap.data()?.role || "").toString().toLowerCase();
    if (role.includes("admin")) return "admin";
    if (role.includes("employee") || role.includes("editor")) return "employee";
    if (role.includes("customer")) return "customer";
  } catch {}

  try {
    const empSnap = await getDoc(doc(db, "employees", user.uid));
    if (empSnap.exists()) return "employee";
    if (email) {
      const empByEmail = await getDocs(query(collection(db, "employees"), where("email", "==", email)));
      if (!empByEmail.empty) return "employee";
    }
  } catch {}

  try {
    const customerSnap = await getDoc(doc(db, "customers", user.uid));
    if (customerSnap.exists()) return "customer";
    if (email) {
      const customerByEmail = await getDocs(query(collection(db, "customers"), where("email", "==", email)));
      if (!customerByEmail.empty) return "customer";
    }
    if (user.phoneNumber) {
      const customerByPhone = await getDocs(query(collection(db, "customers"), where("phoneE164", "==", user.phoneNumber)));
      if (!customerByPhone.empty) return "customer";
    }
  } catch {}

  return "signed-in";
}

async function isAllowedForPath(user) {
  const path = currentPath();
  if (path.startsWith("/admin/")) return false;
  if (!path.startsWith("/employee/") && !path.startsWith("/customer/")) return true;

  const role = await getUserRole(user);
  if (role === "admin") return true;
  if (path.startsWith("/employee/")) return role === "employee";
  if (path.startsWith("/customer/")) return role === "customer";
  return true;
}

async function redirectIfLoggedOut(user) {
  await waitForAuthReady();
  if (!user && !auth.currentUser) {
    window.location.replace(loginUrl());
    return;
  }
  const activeUser = user || auth.currentUser;
  if (!(await isAllowedForPath(activeUser))) {
    window.location.replace("/");
    return;
  }
  revealPage();
}

if (PUBLIC_PATHS.has(currentPath())) {
  revealPage();
} else {
  waitForAuthReady()
    .then(() => {
      redirectIfLoggedOut(auth.currentUser);
      onAuthStateChanged(auth, (user) => {
        redirectIfLoggedOut(user);
      });
    })
    .catch(() => {
      window.location.replace(loginUrl());
    });
}
