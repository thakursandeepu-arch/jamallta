const CACHE_NAME = "jamallta-pwa-v17";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/packages.html",
  "/login/login.html",
  "/customer/customer-profile.html",
  "/customer/chat/customer-chet.html",
  "/employee/index.html",
  "/employee/employee.html",
  "/employee/info.html",
  "/employee/create-new-job/create-new-job.html",
  "/admin/admin.html",
  "/privacy.html",
  "/terms.html",
  "/proof.html",
  "/service-areas.html",
  "/pay.html",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/assets/pwa.js",
  "/assets/app-session.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith("http")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/offline.html")))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch((error) => {
          if (cached) return cached;
          throw error;
        });

      return cached || fetched;
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsArr) => {
      if (clientsArr.length) {
        clientsArr[0].focus();
        return;
      }
      return self.clients.openWindow("/admin/admin.html");
    })
  );
});
