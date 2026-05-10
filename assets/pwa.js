(function () {
  var isMobileInstallDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobileInstallDevice) return;

  var ANDROID_APK_URL = "https://github.com/thakursandeepu-arch/jamallta/releases/download/android-latest/Jamallta-debug.apk";
  var isAndroid = /Android/i.test(navigator.userAgent);
  var deferredInstallPrompt = null;
  var isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  function createInstallButton(mode) {
    if (isStandalone || document.getElementById("jamalltaInstallAppBtn")) return;

    var button = document.createElement("button");
    button.id = "jamalltaInstallAppBtn";
    button.type = "button";
    button.textContent = isAndroid ? "Download Android App" : "Install App";
    button.setAttribute("aria-label", isAndroid ? "Download Jamallta Android app" : "Install Jamallta app");
    button.style.cssText = [
      "position:fixed",
      "left:16px",
      "right:16px",
      "bottom:16px",
      "z-index:99999",
      "min-height:48px",
      "border:0",
      "border-radius:999px",
      "background:#17120d",
      "color:#fffdf8",
      "font:700 15px Arial, sans-serif",
      "box-shadow:0 12px 32px rgba(23,18,13,.24)"
    ].join(";");

    button.addEventListener("click", function () {
      if (isAndroid) {
        window.location.href = ANDROID_APK_URL;
        return;
      }

      if (mode === "prompt" && deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.finally(function () {
          deferredInstallPrompt = null;
          button.remove();
        });
        return;
      }

      alert("Install karne ke liye browser menu/share button kholkar 'Add to Home Screen' dabayein.");
    });

    document.body.appendChild(button);
  }

  if (!document.querySelector('link[rel="manifest"]')) {
    var manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "/manifest.webmanifest";
    document.head.appendChild(manifest);
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    createInstallButton("prompt");
  });

  window.addEventListener("appinstalled", function () {
    var button = document.getElementById("jamalltaInstallAppBtn");
    if (button) button.remove();
  });

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js")
      .then(function () {
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          createInstallButton("ios");
        }
      })
      .catch(function (error) {
        console.warn("Service worker registration failed:", error);
      });
  });
})();
