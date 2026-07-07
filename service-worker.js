const CACHE_NAME = "jamallta-pwa-v26";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/login/login.html",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/assets/pwa.js",
  "/assets/app-session.js",
  "/login/assets/auth-init.js",
  "/login/assets/auth-guard.js",
  "/assets/brand/jamallta-films-luxury-logo-48.png",
  "/assets/brand/jamallta-films-luxury-logo.png",
  "/assets/brand/jamallta-films-luxury-logo-512.png",
  "/assets/brand/jamallta-films-luxury-logo-192.png"
];

const PUBLIC_NAVIGATION_PATHS = new Set([
  "/",
  "/index.html",
  "/login/login.html",
  "/offline.html",
  "/404.html"
]);

function pathnameFor(request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/";
  }
}

function isPublicNavigation(request) {
  return PUBLIC_NAVIGATION_PATHS.has(pathnameFor(request));
}

function isProtectedAsset(request) {
  const path = pathnameFor(request);
  return path.startsWith("/admin/") ||
    path.startsWith("/employee/") ||
    path.startsWith("/customer/");
}

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
    if (!isPublicNavigation(event.request)) {
      event.respondWith(
        fetch(event.request, { cache: "no-store" })
          .catch(() => Response.redirect("/login/login.html", 302))
      );
      return;
    }

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
          if (response && response.status === 200 && !isProtectedAsset(event.request)) {
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
