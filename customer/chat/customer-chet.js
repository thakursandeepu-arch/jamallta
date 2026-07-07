import { auth, db, waitForAuthReady } from "/login/assets/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const storage = getStorage();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "pdf", "zip", "rar", "doc", "docx", "xls", "xlsx"
]);

const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const homeBtn = document.getElementById("homeBtn");
const backChatBtn = document.getElementById("backChatBtn");

let currentUser = null;
let msgRef = null;
let unsubscribeMessages = null;

homeBtn.onclick = () => {
  window.location.href = "/customer/customer-profile.html";
};
backChatBtn.onclick = homeBtn.onclick;

function safeFileName(name = "") {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";
}

function isAllowedFile(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) && file.size <= MAX_FILE_SIZE;
}

function appendMessage(message) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg ${message.sender === "customer" ? "customer" : "admin"}`;

  if (message.fileUrl) {
    const box = document.createElement("div");
    box.className = "file-box";

    const label = document.createElement("div");
    label.textContent = message.text || "File";

    const link = document.createElement("a");
    link.className = "file-link";
    link.href = message.fileUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = `Attachment: ${message.fileName || "file"}`;

    box.append(label, link);
    wrapper.appendChild(box);
  } else {
    wrapper.appendChild(document.createTextNode(message.text || ""));
  }

  const tick = document.createElement("span");
  tick.className = `tick ${message.seen ? "blue" : ""}`;
  tick.textContent = "✓✓";
  wrapper.appendChild(tick);
  messagesEl.appendChild(wrapper);
}

function listenMessages() {
  if (!msgRef) return;
  if (unsubscribeMessages) unsubscribeMessages();
  unsubscribeMessages = onSnapshot(
    query(msgRef, orderBy("createdAt")),
    (snap) => {
      messagesEl.innerHTML = "";
      snap.forEach((docSnap) => appendMessage(docSnap.data() || {}));
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  );
}

async function sendText() {
  if (!currentUser || !msgRef) return;
  const text = msgInput.value.trim();
  if (!text) return;

  await addDoc(msgRef, {
    text,
    sender: "customer",
    senderId: currentUser.uid,
    senderEmail: currentUser.email || "",
    createdAt: serverTimestamp(),
    seen: false
  });
  msgInput.value = "";
}

async function sendFile() {
  if (!currentUser || !msgRef) return;
  const file = fileInput.files[0];
  if (!file) return;
  if (!isAllowedFile(file)) {
    alert("Only common image, video, PDF, Office, ZIP/RAR files up to 25 MB are allowed.");
    fileInput.value = "";
    return;
  }

  const storagePath = `chatUploads/${currentUser.uid}/${Date.now()}_${safeFileName(file.name)}`;
  const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);

  uploadTask.on("state_changed", null, (error) => {
    alert(error?.message || "Upload failed.");
  }, async () => {
    const url = await getDownloadURL(uploadTask.snapshot.ref);
    await addDoc(msgRef, {
      sender: "customer",
      senderId: currentUser.uid,
      senderEmail: currentUser.email || "",
      text: file.name,
      fileUrl: url,
      fileName: file.name,
      storagePath,
      createdAt: serverTimestamp(),
      seen: false
    });
    fileInput.value = "";
  });
}

sendBtn.onclick = sendText;
msgInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendText();
  }
});
fileInput.onchange = sendFile;

waitForAuthReady().then(() => {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("/login/login.html");
      return;
    }
    currentUser = user;
    msgRef = collection(db, "chats", user.uid, "messages");
    listenMessages();
  });
});
