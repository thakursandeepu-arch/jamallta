importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAcHb-VHdM30fb9qSR4dzclmNTxXsTofIw",
  authDomain: "jamallta-films-2-27d2b.firebaseapp.com",
  projectId: "jamallta-films-2-27d2b",
  storageBucket: "jamallta-films-2-27d2b.firebasestorage.app",
  messagingSenderId: "207209419416",
  appId: "1:207209419416:web:53ff512e34553e9286b6ed"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Notification";
  const options = {
    body: payload?.notification?.body || "",
    icon: "/favicon.ico",
    data: {
      url: payload?.data?.url || "/jamallta/admin/pages/dashboard/dashboard.html"
    }
  };
  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/jamallta/admin/pages/dashboard/dashboard.html";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(url)) {
          return c.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
