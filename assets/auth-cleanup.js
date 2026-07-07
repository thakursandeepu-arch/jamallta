(function () {
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(function (registrations) {
          registrations.forEach(function (registration) {
            registration.unregister().catch(function () {});
          });
        })
        .catch(function () {});
    }

    if ("caches" in window) {
      caches.keys()
        .then(function (keys) {
          return Promise.all(keys
            .filter(function (key) { return /^jamallta-pwa-/.test(key); })
            .map(function (key) { return caches.delete(key); }));
        })
        .catch(function () {});
    }
  } catch (_) {}
})();
