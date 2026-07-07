import { db } from "/login/assets/firebase-config.js";
import {
  collection, addDoc, onSnapshot,
  serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

import {
  getStorage, ref, uploadBytesResumable, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const storage = getStorage();

const studioName = "Jamallta Films";
const sender = "customer";

/* DOM */
const messagesEl = document.getElementById("messages");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput");
const homeBtn = document.getElementById("homeBtn");
const backChatBtn = document.getElementById("backChatBtn");

/* NAV */
homeBtn.onclick = () => {
  window.location.href = "/customer/customer-profile.html";
};
backChatBtn.onclick = homeBtn.onclick;

/* LISTEN MESSAGES */
const msgRef = collection(db,"chats",studioName,"messages");

onSnapshot(
  query(msgRef,orderBy("createdAt")),
  snap=>{
    messagesEl.innerHTML="";
    snap.forEach(d=>{
      const m=d.data();
      const div=document.createElement("div");
      div.className=`msg ${m.sender}`;

      if(m.fileUrl){
        div.innerHTML=`
          <div class="file-box">
            <div>${m.text || "File"}</div>
            <a class="file-link" href="${m.fileUrl}" target="_blank">
              📎 ${m.fileName}
            </a>
          </div>
          <span class="tick ${m.seen?'blue':''}">✔✔</span>
        `;
      }else{
        div.innerHTML=`
          ${m.text}
          <span class="tick ${m.seen?'blue':''}">✔✔</span>
        `;
      }

      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop=messagesEl.scrollHeight;
  }
);

/* SEND TEXT */
sendBtn.onclick = async () => {
  const text = msgInput.value.trim();
  if(!text) return;

  await addDoc(msgRef,{
    text,
    sender,
    createdAt: serverTimestamp(),
    seen:false
  });
  msgInput.value="";
};

/* SEND FILE (FIXED) */
fileInput.onchange = async () => {
  const file = fileInput.files[0];
  if(!file) return;

  const storageRef = ref(
    storage,
    `chatUploads/${studioName}/${Date.now()}_${file.name}`
  );

  const uploadTask = uploadBytesResumable(storageRef,file);

  uploadTask.on("state_changed",null,alert,async ()=>{
    const url = await getDownloadURL(uploadTask.snapshot.ref);

    await addDoc(msgRef,{
      sender,
      text: file.name,
      fileUrl: url,
      fileName: file.name,
      createdAt: serverTimestamp(),
      seen:false
    });

    fileInput.value="";
  });
};
