(function () {
  var path = window.location.pathname.replace(/\/+$/, "") || "/";
  var publicPaths = {
    "/": true,
    "/index.html": true,
    "/login/login.html": true,
    "/offline.html": true,
    "/404.html": true
  };

  if (publicPaths[path]) return;

  document.documentElement.dataset.authPending = "true";

  var style = document.createElement("style");
  style.id = "jamallta-auth-hide";
  style.textContent = [
    'html[data-auth-pending="true"] body{visibility:hidden!important}',
    'html[data-auth-pending="true"]::before{content:"";position:fixed;inset:0;background:#fff;z-index:2147483647}'
  ].join("");
  document.head.appendChild(style);
})();
