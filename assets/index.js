/* =====================================
   OPTIONAL SITE CMS (FIRESTORE)
===================================== */
const ENABLE_SITE_CMS = false;
const ENABLE_MEDIA_FEED = true;

const $ = (id) => document.getElementById(id);

const firebaseConfig = {
  apiKey: "AIzaSyAcHb-VHdM30fb9qSR4dzclmNTxXsTofIw",
  authDomain: "jamallta-films-2-27d2b.firebaseapp.com",
  projectId: "jamallta-films-2-27d2b",
  storageBucket: "jamallta-films-2-27d2b.firebasestorage.app",
  messagingSenderId: "207209419416",
  appId: "1:207209419416:web:53ff512e34553e9286b6ed"
};

async function getFirebase() {
  const { initializeApp, getApps } = await import(
    "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js"
  );
  const { getFirestore } = await import(
    "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
  );

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  return { db };
}

async function initSiteCms() {
  if (!ENABLE_SITE_CMS) return;

  try {
    const { db } = await getFirebase();
    const { doc, onSnapshot } = await import(
      "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
    );

    const siteRef = doc(db, "siteData", "siteData");
    onSnapshot(siteRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (data.homepageText) {
        $("mainHeading").textContent =
          data.homepageText.mainHeading || "Professional Video Editing";

        $("subHeading").textContent =
          data.homepageText.subHeading || "Cinematic Wedding & Event Films";

        $("description").textContent =
          data.homepageText.description || "";
      }

      if (data.about?.text) {
        $("aboutText").textContent = data.about.text;
      }
    }, (error) => {
      console.warn("Firestore disabled or blocked:", error?.code || error?.message);
    });
  } catch (err) {
    console.warn("CMS init failed:", err?.message || err);
  }
}

async function initMediaFeed() {
  if (!ENABLE_MEDIA_FEED) return;

  const photosEl = $("portfolioPhotos");
  const videosEl = $("portfolioVideos");
  const reelsEl = $("portfolioReels");
  if (!photosEl || !videosEl || !reelsEl) return;

  try {
    const { db } = await getFirebase();
    const { collection, query, orderBy, onSnapshot, limit } = await import(
      "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js"
    );

    const mediaRef = collection(db, "media");
    const q = query(mediaRef, orderBy("createdAt", "desc"), limit(80));

    onSnapshot(q, (snap) => {
      const items = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      })).filter((item) => item.isPublic !== false);

      photosEl.innerHTML = "";
      videosEl.innerHTML = "";
      reelsEl.innerHTML = "";

      const portfolioItems = items.filter((i) => (i.placement || "portfolio") === "portfolio");
      const photos = portfolioItems.filter((i) => (i.type || "photo") === "photo");
      const videos = portfolioItems.filter((i) => i.type === "video");
      const reels = portfolioItems.filter((i) => i.type === "reel");

      if (photos.length === 0) {
        photosEl.innerHTML = `<p class="media-empty">No photos yet.</p>`;
      }
      if (videos.length === 0) {
        videosEl.innerHTML = `<p class="media-empty">No videos yet.</p>`;
      }
      if (reels.length === 0) {
        reelsEl.innerHTML = `<p class="media-empty">No reels yet.</p>`;
      }

      const renderCard = (item) => {
        const card = document.createElement("div");
        card.className = "media-card";
        card.dataset.type = item.type || "photo";
        if ((item.type || "photo") === "photo") {
          card.classList.add("media-photo");
        }

        const thumb = document.createElement("div");
        thumb.className = "media-thumb";

        const badge = document.createElement("span");
        badge.className = "media-badge";
        badge.textContent = (item.type || "photo").toUpperCase();
        thumb.appendChild(badge);

        if (item.type === "video") {
          const video = document.createElement("video");
          video.src = item.url;
          video.controls = true;
          video.preload = "metadata";
          thumb.appendChild(video);
          const overlay = document.createElement("div");
          overlay.className = "play-overlay";
          thumb.appendChild(overlay);
        } else {
          const img = document.createElement("img");
          img.src = item.url;
          img.alt = item.title || "Portfolio work";
          img.loading = "lazy";
          thumb.appendChild(img);
        }

        const body = document.createElement("div");
        body.className = "media-body";

        const title = document.createElement("h3");
        title.className = "media-title";
        title.textContent = item.title || "Portfolio";

        const desc = document.createElement("p");
        desc.className = "media-desc";
        desc.textContent = item.description || "";
        if (!item.description) {
          desc.style.display = "none";
        }

        if ((item.type || "photo") === "photo") {
          const caption = document.createElement("div");
          caption.className = "media-caption";
          caption.appendChild(title);
          caption.appendChild(desc);
          thumb.appendChild(caption);
        } else {
          body.appendChild(title);
          body.appendChild(desc);
        }

        card.appendChild(thumb);
        if ((item.type || "photo") !== "photo") {
          card.appendChild(body);
        }

        return card;
      };

      const renderReel = (item) => {
        const card = document.createElement("div");
        card.className = "reel-card";

        const thumb = document.createElement("div");
        thumb.className = "reel-thumb";

        const badge = document.createElement("span");
        badge.className = "media-badge";
        badge.textContent = "REEL";
        thumb.appendChild(badge);

        const video = document.createElement("video");
        video.src = item.url;
        video.controls = true;
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;
        thumb.appendChild(video);

        const overlay = document.createElement("div");
        overlay.className = "play-overlay";
        thumb.appendChild(overlay);

        const body = document.createElement("div");
        body.className = "reel-body";

        const title = document.createElement("h3");
        title.className = "media-title";
        title.textContent = item.title || "Reel";

        const desc = document.createElement("p");
        desc.className = "media-desc";
        desc.textContent = item.description || "";
        if (!item.description) {
          desc.style.display = "none";
        }

        body.appendChild(title);
        body.appendChild(desc);

        card.appendChild(thumb);
        card.appendChild(body);

        return card;
      };

      photos.forEach((item) => photosEl.appendChild(renderCard(item)));
      videos.forEach((item) => videosEl.appendChild(renderCard(item)));
      reels.forEach((item) => reelsEl.appendChild(renderReel(item)));

      renderFeatured(items);
      renderMediaSchema(items);

    }, (error) => {
      console.warn("Media feed blocked:", error?.code || error?.message);
    });
  } catch (err) {
    console.warn("Media feed init failed:", err?.message || err);
  }
}

function renderFeatured(items) {
  const featuredBox = document.querySelector(".featured-photo");
  if (!featuredBox) return;

  const featuredItems = items.filter((i) => (i.placement || "") === "featured");
  if (featuredItems.length === 0) {
    featuredBox.style.backgroundImage = "";
    featuredBox.innerHTML = "";
    return;
  }

  featuredItems.sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    const at = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bt = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bt - at;
  });

  const item = featuredItems[0];
  featuredBox.innerHTML = "";

  if (item.type === "video" || item.type === "reel") {
    const video = document.createElement("video");
    video.src = item.url;
    video.controls = true;
    video.preload = "metadata";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    featuredBox.appendChild(video);
  } else {
    featuredBox.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.35)), url("${item.url}")`;
    featuredBox.style.backgroundSize = "cover";
    featuredBox.style.backgroundPosition = "center";
  }
}

function renderMediaSchema(items) {
  const existing = document.getElementById("mediaSchema");
  if (existing) existing.remove();

  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": items.map((item, idx) => ({
      "@type": item.type === "video" ? "VideoObject" : "ImageObject",
      "position": idx + 1,
      "name": item.title || "Portfolio",
      "description": item.description || "",
      "contentUrl": item.url
    }))
  };

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "mediaSchema";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

initSiteCms();
initMediaFeed();

/* =====================================
   RAZORPAY PAYMENTS
===================================== */
const PAYMENTS_API = {
  createOrder: "https://us-central1-jamallta-films-2-27d2b.cloudfunctions.net/createRazorpayOrder",
  verifyPayment: "https://us-central1-jamallta-films-2-27d2b.cloudfunctions.net/verifyRazorpayPayment"
};

const payNowBtn = $("payNowBtn");
const payAmountInput = $("payAmount");
const paymentStatus = $("paymentStatus");

function setPaymentStatus(message, type = "") {
  if (!paymentStatus) return;
  paymentStatus.textContent = message || "";
  paymentStatus.classList.remove("success", "error");
  if (type) paymentStatus.classList.add(type);
}

async function createOrder(amountInr) {
  const response = await fetch(PAYMENTS_API.createOrder, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: amountInr,
      currency: "INR",
      receipt: `jf_${Date.now()}`
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Order creation failed");
  }
  return data;
}

async function verifyPayment(details) {
  const response = await fetch(PAYMENTS_API.verifyPayment, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "Verification failed");
  }
  return data;
}

async function startRazorpayCheckout() {
  if (!window.Razorpay) {
    setPaymentStatus("Razorpay script not loaded. Please refresh.", "error");
    return;
  }

  const amount = Number(payAmountInput?.value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    setPaymentStatus("Enter a valid amount in INR.", "error");
    return;
  }

  try {
    if (payNowBtn) payNowBtn.disabled = true;
    setPaymentStatus("Creating order...", "");

    const order = await createOrder(amount);

    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Jamallta Films",
      description: "Video editing payment",
      order_id: order.orderId,
      handler: async function (response) {
        try {
          setPaymentStatus("Verifying payment...", "");
          const result = await verifyPayment({
            order_id: response.razorpay_order_id,
            payment_id: response.razorpay_payment_id,
            signature: response.razorpay_signature
          });

          if (result.verified) {
            setPaymentStatus("Payment successful. Thank you!", "success");
          } else {
            setPaymentStatus("Payment verification failed.", "error");
          }
        } catch (err) {
          setPaymentStatus(err?.message || "Verification failed.", "error");
        } finally {
          if (payNowBtn) payNowBtn.disabled = false;
        }
      },
      theme: { color: "#c9a347" }
    };

    const rzp = new Razorpay(options);
    rzp.on("payment.failed", function (resp) {
      const msg = resp?.error?.description || "Payment failed.";
      setPaymentStatus(msg, "error");
      if (payNowBtn) payNowBtn.disabled = false;
    });
    rzp.open();
  } catch (err) {
    setPaymentStatus(err?.message || "Payment failed.", "error");
    if (payNowBtn) payNowBtn.disabled = false;
  }
}

if (payNowBtn) {
  payNowBtn.addEventListener("click", startRazorpayCheckout);
}

/* =====================================
   SMOOTH SCROLL
===================================== */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener("click", e => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth" });
  });
});
