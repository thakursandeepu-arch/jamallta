import { auth, waitForAuthReady } from "/login/assets/firebase-config.js?v=2";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const REDIRECT_TO = "/login/login.html";

async function redirectIfLoggedOut(user) {
  await waitForAuthReady();
  if (!user && !auth.currentUser) {
    window.location.replace(REDIRECT_TO);
  }
}

waitForAuthReady().then(() => {
  redirectIfLoggedOut(auth.currentUser);
  onAuthStateChanged(auth, (user) => {
    redirectIfLoggedOut(user);
  });
});
