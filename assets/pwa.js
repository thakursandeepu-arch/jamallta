(function () {
  var isMobileInstallDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobileInstallDevice) return;

  if (!document.querySelector('link[rel="manifest"]')) {
    var manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);
  }

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js").catch(function (error) {
      console.warn("Service worker registration failed:", error);
    });
  });
})();
