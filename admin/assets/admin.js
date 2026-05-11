// admin.js
// 🎛 Admin UI Controller – FINAL

document.addEventListener("DOMContentLoaded", () => {

  const frame       = document.getElementById("contentFrame");
  const pageTitle   = document.getElementById("pageTitle");
  const navButtons  = [...document.querySelectorAll(".nav-btn")];
  const logoutBtn   = document.getElementById("btnLogout");

  const sidebar     = document.getElementById("sidebar");
  const mobileBtn   = document.getElementById("mobileToggle");

  const modal       = document.getElementById("logoutModal");
  const confirmBtn  = document.getElementById("confirmLogout");
  const cancelBtn   = document.getElementById("cancelLogout");
  const notifBtn    = document.getElementById("adminNotifBtn");
  const notifCount  = document.getElementById("adminNotifCount");
  const notifPanel  = document.getElementById("adminNotifPanel");
  const notifList   = document.getElementById("adminNotifList");
  const notifSub    = document.getElementById("adminNotifSub");
  const markReadBtn = document.getElementById("adminNotifMarkRead");
  const notifyPermissionBox = document.getElementById("notifyPermissionBox");
  const enableAdminNotify = document.getElementById("enableAdminNotify");
  const notifyPermissionHint = document.getElementById("notifyPermissionHint");

  let adminNotifications = [];
  let adminNotifUnsub = null;
  let lastAdminNotifSeconds = 0;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const formatNotifTime = (value) => {
    if (!value) return "";
    const date = value?.seconds
      ? new Date(value.seconds * 1000)
      : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  function renderAdminNotifications() {
    const unread = adminNotifications.filter(n => !n.read).length;
    if (notifCount) notifCount.textContent = String(unread);
    if (notifBtn) notifBtn.classList.toggle("has-new", unread > 0);
    if (notifSub) notifSub.textContent = unread ? `${unread} new update${unread > 1 ? "s" : ""}` : "No new updates";

    if (!notifList) return;
    if (!adminNotifications.length) {
      notifList.innerHTML = `<div class="notif-empty">No notifications yet.</div>`;
      return;
    }

    notifList.innerHTML = adminNotifications.map(n => `
      <div class="notif-item ${n.read ? "" : "unread"}">
        <div class="notif-title">${escapeHtml(n.title || "Notification")}</div>
        <div class="notif-message">${escapeHtml(n.message || "")}</div>
        <div class="notif-meta">
          ${escapeHtml(formatNotifTime(n.createdAt))}
          ${n.createdBy ? ` by ${escapeHtml(n.createdBy)}` : ""}
          ${n.jobNo ? ` | Job ${escapeHtml(n.jobNo)}` : ""}
        </div>
      </div>
    `).join("");
  }

  function refreshNotifyPermissionUI() {
    if (!notifyPermissionBox) return;
    if (!("Notification" in window)) {
      notifyPermissionBox.classList.remove("show");
      return;
    }
    if (Notification.permission === "granted") {
      notifyPermissionBox.classList.remove("show");
      return;
    }
    notifyPermissionBox.classList.add("show");
    if (notifyPermissionHint) {
      notifyPermissionHint.textContent = Notification.permission === "denied"
        ? "Notifications blocked. Enable them from browser site settings."
        : "Tap allow to receive Job Assigned alerts.";
    }
    if (enableAdminNotify) {
      enableAdminNotify.disabled = Notification.permission === "denied";
      enableAdminNotify.textContent = Notification.permission === "denied" ? "Blocked" : "Allow";
    }
  }

  async function showAdminBrowserNotification(title, message) {
    if (window.JamalltaAndroid?.showNotification) {
      try {
        window.JamalltaAndroid.showNotification(title || "Notification", message || "");
        return;
      } catch {}
    }
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body: message,
          icon: "/assets/brand/jamallta-films-logo.png",
          tag: `admin-${Date.now()}`,
        });
        return;
      }
    } catch {}
    try {
      new Notification(title, { body: message, icon: "/assets/brand/jamallta-films-logo.png" });
    } catch {}
  }

  async function startAdminNotificationPanel() {
    if (adminNotifUnsub) return;
    try {
      const { auth, db } = await import("/login/assets/firebase-config.js");
      const { onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
      const {
        collection,
        query,
        orderBy,
        limit,
        onSnapshot,
        updateDoc,
        doc
      } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js");

      onAuthStateChanged(auth, (user) => {
        if (!user || adminNotifUnsub) return;
        if (window.JamalltaAndroid?.saveAuthToken) {
          user.getIdToken().then((token) => {
            try { window.JamalltaAndroid.saveAuthToken(token); } catch {}
          }).catch(() => {});
          setInterval(() => {
            user.getIdToken(true).then((token) => {
              try { window.JamalltaAndroid.saveAuthToken(token); } catch {}
            }).catch(() => {});
          }, 30 * 60 * 1000);
        }
        const q = query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(40));
        adminNotifUnsub = onSnapshot(q, (snap) => {
          adminNotifications = [];
          let maxSeen = lastAdminNotifSeconds;
          if (!snap.empty && lastAdminNotifSeconds === 0) {
            lastAdminNotifSeconds = Math.floor(Date.now() / 1000);
          }
          snap.forEach(d => {
            const data = d.data() || {};
            if ((data.audience || "admin") !== "admin") return;
            adminNotifications.push({ id: d.id, ...data });
            const ts = data.createdAt?.seconds || 0;
            if (lastAdminNotifSeconds && ts > lastAdminNotifSeconds) {
              showAdminBrowserNotification(data.title || "Notification", data.message || "");
              if (ts > maxSeen) maxSeen = ts;
            }
          });
          if (maxSeen > lastAdminNotifSeconds) lastAdminNotifSeconds = maxSeen;
          renderAdminNotifications();
        }, (err) => {
          console.error("Admin notifications listener failed:", err);
          if (notifList) notifList.innerHTML = `<div class="notif-empty">Notifications load failed.</div>`;
        });
      });

      if (markReadBtn) {
        markReadBtn.addEventListener("click", async () => {
          const unread = adminNotifications.filter(n => !n.read);
          await Promise.all(unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true })));
        });
      }
    } catch (err) {
      console.error("Admin notification setup failed:", err);
    }
  }

  /* ===== INITIAL TITLE ===== */
  const activeBtn = document.querySelector(".nav-btn.active");
  if (activeBtn && pageTitle) {
    pageTitle.textContent = activeBtn.innerText.trim();
  }

  refreshNotifyPermissionUI();
  startAdminNotificationPanel();

  if (enableAdminNotify) {
    enableAdminNotify.addEventListener("click", async () => {
      if (!("Notification" in window)) return;
      try {
        await Notification.requestPermission();
        refreshNotifyPermissionUI();
        if (Notification.permission === "granted") {
          await showAdminBrowserNotification("Notifications enabled", "Job Assigned alerts will appear on this device.");
        }
      } catch {
        refreshNotifyPermissionUI();
      }
    });
  }

  if (notifBtn && notifPanel) {
    notifBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      notifPanel.classList.toggle("show");
    });
    notifPanel.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      notifPanel.classList.remove("show");
    });
  }

  /* ===== PAGE NAVIGATION ===== */
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {

      if (!btn.dataset.page) return;

      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      pageTitle.textContent = btn.innerText.trim();

      // smooth iframe change
      frame.style.opacity = "0";
      setTimeout(() => {
        frame.src = btn.dataset.page;
      }, 150);

      // auto close sidebar on mobile
      if (window.innerWidth <= 768) {
        sidebar.classList.remove("show");
      }
    });
  });

  frame.addEventListener("load", () => {
    frame.style.opacity = "1";
  });

  /* ===== MOBILE SIDEBAR TOGGLE ===== */
  if (mobileBtn) {
    mobileBtn.addEventListener("click", () => {
      sidebar.classList.toggle("show");
    });
  }

  /* ===== LOGOUT MODAL ===== */
  logoutBtn.addEventListener("click", () => {
    modal.classList.add("show");
  });

  cancelBtn.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  confirmBtn.addEventListener("click", async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch(e){}
    try { localStorage.setItem("force_login", "1"); } catch(e){}

    try {
      const { auth } = await import("/login/assets/firebase-config.js");
      const { signOut } = await import("https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js");
      await signOut(auth);
    } catch (e) {
      console.warn("Admin signOut failed", e);
    }

    // Go back to home page (works with /public/ dev server)
    window.location.href = "../index.html";
  });

  /* ===== CLOSE MODAL ON ESC ===== */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      modal.classList.remove("show");
    }
  });

});
