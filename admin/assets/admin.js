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

  /* ===== INITIAL TITLE ===== */
  const activeBtn = document.querySelector(".nav-btn.active");
  if (activeBtn && pageTitle) {
    pageTitle.textContent = activeBtn.innerText.trim();
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
