// admin-auth.js
// Admin Security Guard

import { auth, db } from "/login/assets/firebase-config.js";
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

function redirectToLogin() {
  console.warn("[admin-auth] redirecting to login");
  const target = "/login/login.html";
  if (window.top && window.top !== window.self) {
    window.top.location.replace(target);
    return;
  }
  window.location.replace(target);
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

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      redirectToLogin();
      return;
    }

    const isAdmin = await hasAdminRole(user);
    if (!isAdmin) {
      console.warn("[admin-auth] access denied (not admin)");
      redirectToLogin();
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setWelcomeName(user), { once: true });
    } else {
      setWelcomeName(user);
    }
  } catch (err) {
    console.error("[admin-auth] unexpected error", err);
    redirectToLogin();
  }
});
