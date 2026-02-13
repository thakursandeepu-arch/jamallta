// admin-auth.js
// 🔐 Admin Security Guard – FINAL

import { auth, db } from "/login/assets/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const ADMIN_EMAILS = ["thakursandeepu@gmail.com"];
const isAllowedAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());

/* ===== REDIRECT TO LOGIN ===== */
function redirectToLogin() {
  console.warn("[admin-auth] redirecting to login");
  window.location.replace("/login/login.html");
}

/* ===== CHECK USER ROLE ===== */
async function getUserRole(uid) {
  try {
    // employees collection first
    const empSnap = await getDoc(doc(db, "employees", uid));
    if (empSnap.exists()) {
      return (empSnap.data().role || "").toLowerCase();
    }

    // users collection fallback
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      return (userSnap.data().role || "").toLowerCase();
    }

    return "";
  } catch (err) {
    console.error("[admin-auth] role check failed", err);
    return "";
  }
}

/* ===== AUTH LISTENER ===== */
onAuthStateChanged(auth, async (user) => {
  try {
    // ❌ Not logged in
    if (!user) {
      redirectToLogin();
      return;
    }

    // ❌ Email must be whitelisted for admin
    if (!isAllowedAdminEmail(user.email)) {
      console.warn("[admin-auth] access denied (email not allowed)");
      redirectToLogin();
      return;
    }

    // ✅ Logged in → check role
    const role = await getUserRole(user.uid);

    if (!role || !role.includes("admin")) {
      console.warn("[admin-auth] access denied (not admin)");
      redirectToLogin();
      return;
    }

    // ✅ Admin allowed → set welcome name
    document.addEventListener("DOMContentLoaded", async () => {
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
    });

  } catch (err) {
    console.error("[admin-auth] unexpected error", err);
    redirectToLogin();
  }
});
