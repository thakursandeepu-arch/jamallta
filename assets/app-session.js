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
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;

const isHomePage = ["/", "/index.html"].includes(window.location.pathname);
const isAllowedAdminEmail = (email) => ADMIN_EMAILS.includes((email || "").toLowerCase());

async function redirectLoggedInUser(user) {
  const email = user.email || "";
  const isAdminEmail = isAllowedAdminEmail(email);

  if (isAdminEmail) {
    try {
      const adminSnap = await getDoc(doc(db, "users", user.uid));
      const adminRole = (adminSnap.data()?.role || "").toLowerCase();
      if (adminSnap.exists() && adminRole.includes("admin")) {
        window.location.replace("/admin/admin.html");
        return;
      }
      const adminByEmail = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      if (adminByEmail.docs.some((d) => String(d.data()?.role || "").toLowerCase().includes("admin"))) {
        window.location.replace("/admin/admin.html");
        return;
      }
    } catch {}
  }

  try {
    const empSnap = await getDoc(doc(db, "employees", user.uid));
    if (empSnap.exists()) {
      window.location.replace("/employee/employee.html");
      return;
    }
    if (email) {
      const empByEmail = await getDocs(query(collection(db, "employees"), where("email", "==", email)));
      if (!empByEmail.empty) {
        window.location.replace("/employee/employee.html");
        return;
      }
    }
  } catch {}

  try {
    if (email) {
      const customerSnap = await getDocs(query(collection(db, "customers"), where("email", "==", email)));
      if (!customerSnap.empty) {
        window.location.replace("/customer/customer-profile.html");
      }
    }
  } catch {}
}

if (isStandalone && isHomePage) {
  onAuthStateChanged(auth, (user) => {
    if (user) redirectLoggedInUser(user);
  });
}
