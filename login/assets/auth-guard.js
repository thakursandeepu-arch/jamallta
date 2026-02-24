import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const REDIRECT_TO = "/jamallta/index.html";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace(REDIRECT_TO);
  }
});
