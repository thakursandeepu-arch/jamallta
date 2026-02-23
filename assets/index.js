/* =====================================
   OPTIONAL SITE CMS (FIRESTORE)
===================================== */
const ENABLE_SITE_CMS = false;
const ENABLE_MEDIA_FEED = true;

const $ = (id) => document.getElementById(id);

const ICONS = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true" class="ig-icon"><path d="M20.8 5.7a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  heartFilled: `<svg viewBox="0 0 24 24" aria-hidden="true" class="ig-icon"><path d="M20.8 5.7a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.5 1-1a5.5 5.5 0 0 0 0-7.8z" fill="currentColor"/></svg>`,
  comment: `<svg viewBox="0 0 24 24" aria-hidden="true" class="ig-icon"><path d="M20 15a4 4 0 0 1-4 4H8l-4 3V7a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true" class="ig-icon"><path d="m21 3-9 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M21 3 14 21l-3-7-7-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true" class="ig-icon"><path d="M6 4h12v16l-6-4-6 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  saveFilled: `<svg viewBox="0 0 24 24" aria-hidden="true" class="ig-icon"><path d="M6 4h12v16l-6-4-6 4z" fill="currentColor"/></svg>`
};

const setLikeIcon = (btn, liked) => {
  btn.innerHTML = liked ? ICONS.heartFilled : ICONS.heart;
};

const setSaveIcon = (btn, saved) => {
  btn.innerHTML = saved ? ICONS.saveFilled : ICONS.save;
};

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
  const feedEl = $("portfolioFeed");
  const storiesEl = $("portfolioStories");
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

      if (feedEl) feedEl.innerHTML = "";
      if (storiesEl) storiesEl.innerHTML = "";

      const renderCard = (item) => {
        const card = document.createElement("div");
        card.className = "media-card ig-card";
        const itemType = item.type || "photo";
        card.dataset.type = itemType;
        if (itemType === "photo") {
          card.classList.add("media-photo");
        } else if (itemType === "video") {
          card.classList.add("media-video");
        } else if (itemType === "reel") {
          card.classList.add("media-reel");
        }

        const header = document.createElement("div");
        header.className = "ig-header";
        const avatar = document.createElement("div");
        avatar.className = "ig-avatar";
        avatar.textContent = "JF";
        const hTitle = document.createElement("div");
        hTitle.className = "ig-title";
        hTitle.textContent = item.author || item.title || "Jamallta Films";
        const hMeta = document.createElement("div");
        hMeta.className = "ig-meta";
        hMeta.textContent = "Jamallta Films";
        const hText = document.createElement("div");
        hText.appendChild(hTitle);
        hText.appendChild(hMeta);
        header.appendChild(avatar);
        header.appendChild(hText);

        const thumb = document.createElement("div");
        thumb.className = "media-thumb";

        if (item.type === "video") {
          const video = document.createElement("video");
          video.src = item.url;
          video.controls = false;
          video.preload = "metadata";
          video.playsInline = true;
          video.muted = false;
          video.volume = 1;
          video.addEventListener("click", () => {
            if (video.paused) {
              video.play();
            } else {
              video.pause();
            }
          });
          thumb.appendChild(video);
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

        body.appendChild(title);
        body.appendChild(desc);

        const actions = document.createElement("div");
        actions.className = "ig-actions";

        const likeBtn = document.createElement("button");
        likeBtn.className = "ig-btn ig-like";
        likeBtn.setAttribute("aria-label", "Like");
        setLikeIcon(likeBtn, false);

        const commentBtn = document.createElement("button");
        commentBtn.className = "ig-btn";
        commentBtn.setAttribute("aria-label", "Comment");
        commentBtn.innerHTML = ICONS.comment;

        const shareBtn = document.createElement("button");
        shareBtn.className = "ig-btn";
        shareBtn.setAttribute("aria-label", "Share");
        shareBtn.innerHTML = ICONS.share;

        const saveBtn = document.createElement("button");
        saveBtn.className = "ig-btn ig-save";
        saveBtn.setAttribute("aria-label", "Save");
        setSaveIcon(saveBtn, false);

        const actionLeft = document.createElement("div");
        actionLeft.className = "ig-actions-left";
        actionLeft.appendChild(likeBtn);
        actionLeft.appendChild(commentBtn);
        actionLeft.appendChild(shareBtn);

        const actionRight = document.createElement("div");
        actionRight.className = "ig-actions-right";
        actionRight.appendChild(saveBtn);

        actions.appendChild(actionLeft);
        actions.appendChild(actionRight);

        const counts = document.createElement("div");
        counts.className = "ig-counts";
        const likeCount = document.createElement("span");
        const baseLikes = Number(item.likes || item.likeCount || 0);
        likeCount.textContent = `${baseLikes} likes`;
        counts.appendChild(likeCount);

        likeBtn.addEventListener("click", () => {
          const liked = likeBtn.classList.toggle("is-liked");
          setLikeIcon(likeBtn, liked);
          const current = Number(likeCount.textContent.split(" ")[0]) || 0;
          const next = liked ? current + 1 : Math.max(0, current - 1);
          likeCount.textContent = `${next} likes`;
        });
        saveBtn.addEventListener("click", () => {
          const saved = saveBtn.classList.toggle("is-saved");
          setSaveIcon(saveBtn, saved);
        });

        card.appendChild(thumb);
        card.appendChild(actions);
        card.appendChild(counts);
        card.appendChild(body);

        return card;
      };

      const renderReel = (item) => {
        const card = document.createElement("div");
        card.className = "reel-card ig-card reel-post";

        const thumb = document.createElement("div");
        thumb.className = "reel-thumb";

        const video = document.createElement("video");
        video.src = item.url;
        video.controls = false;
        video.preload = "metadata";
        video.muted = false;
        video.volume = 1;
        video.playsInline = true;
        video.addEventListener("click", () => {
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
        });
        thumb.appendChild(video);

        const actions = document.createElement("div");
        actions.className = "ig-actions";

        const likeBtn = document.createElement("button");
        likeBtn.className = "ig-btn ig-like";
        likeBtn.setAttribute("aria-label", "Like");
        setLikeIcon(likeBtn, false);

        const commentBtn = document.createElement("button");
        commentBtn.className = "ig-btn";
        commentBtn.setAttribute("aria-label", "Comment");
        commentBtn.innerHTML = ICONS.comment;

        const shareBtn = document.createElement("button");
        shareBtn.className = "ig-btn";
        shareBtn.setAttribute("aria-label", "Share");
        shareBtn.innerHTML = ICONS.share;

        const saveBtn = document.createElement("button");
        saveBtn.className = "ig-btn ig-save";
        saveBtn.setAttribute("aria-label", "Save");
        setSaveIcon(saveBtn, false);

        const actionLeft = document.createElement("div");
        actionLeft.className = "ig-actions-left";
        actionLeft.appendChild(likeBtn);
        actionLeft.appendChild(commentBtn);
        actionLeft.appendChild(shareBtn);

        const actionRight = document.createElement("div");
        actionRight.className = "ig-actions-right";
        actionRight.appendChild(saveBtn);

        actions.appendChild(actionLeft);
        actions.appendChild(actionRight);

        const counts = document.createElement("div");
        counts.className = "ig-counts";
        const likeCount = document.createElement("span");
        const baseLikes = Number(item.likes || item.likeCount || 0);
        likeCount.textContent = `${baseLikes} likes`;
        counts.appendChild(likeCount);

        likeBtn.addEventListener("click", () => {
          const liked = likeBtn.classList.toggle("is-liked");
          setLikeIcon(likeBtn, liked);
          const current = Number(likeCount.textContent.split(" ")[0]) || 0;
          const next = liked ? current + 1 : Math.max(0, current - 1);
          likeCount.textContent = `${next} likes`;
        });
        saveBtn.addEventListener("click", () => {
          const saved = saveBtn.classList.toggle("is-saved");
          setSaveIcon(saveBtn, saved);
        });

        card.appendChild(thumb);
        card.appendChild(actions);
        card.appendChild(counts);

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

/* =====================================
   SINGLE VIDEO PLAY AT A TIME
===================================== */
document.addEventListener("play", (e) => {
  const current = e.target;
  if (!current || current.tagName !== "VIDEO") return;
  document.querySelectorAll("video").forEach((vid) => {
    if (vid !== current && !vid.paused) {
      vid.pause();
    }
  });
}, true);

/* =====================================
   MOBILE FILTER (HOME / REELS)
===================================== */
const photosBlock = document.getElementById("photosBlock");
const videosBlock = document.getElementById("videosBlock");
const reelsBlock = document.getElementById("reelsBlock");
const navHome = document.getElementById("navHome");
const navReels = document.getElementById("navReels");
const isMobileView = () => window.matchMedia("(max-width: 700px)").matches;

const shuffleGrid = (grid) => {
  if (!grid) return;
  const items = Array.from(grid.children);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  items.forEach((item) => grid.appendChild(item));
};

const setVisibility = (showPhotos, showVideos, showReels) => {
  if (!isMobileView()) return;
  if (photosBlock) photosBlock.style.display = showPhotos ? "block" : "none";
  if (videosBlock) videosBlock.style.display = showVideos ? "block" : "none";
  if (reelsBlock) reelsBlock.style.display = showReels ? "block" : "none";
};

if (navHome) {
  navHome.addEventListener("click", () => {
    setVisibility(true, false, false);
  });
}

if (navReels) {
  navReels.addEventListener("click", () => {
    setVisibility(false, true, true);
    shuffleGrid(document.getElementById("portfolioVideos"));
    shuffleGrid(document.getElementById("portfolioReels"));
  });
}

window.addEventListener("resize", () => {
  if (isMobileView()) return;
  if (photosBlock) photosBlock.style.display = "block";
  if (videosBlock) videosBlock.style.display = "block";
  if (reelsBlock) reelsBlock.style.display = "block";
});

/* =====================================
   LIGHTBOX (PHOTOS)
===================================== */
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImage");
const lightboxClose = document.querySelector(".lightbox-close");
const lightboxPrev = document.querySelector(".lightbox-nav.prev");
const lightboxNext = document.querySelector(".lightbox-nav.next");
let lightboxImages = [];
let lightboxIndex = -1;

const setLightboxImage = (index) => {
  if (!lightboxImg || !lightboxImages.length) return;
  lightboxIndex = (index + lightboxImages.length) % lightboxImages.length;
  const img = lightboxImages[lightboxIndex];
  if (lightbox) lightbox.classList.add("is-switching");
  const newSrc = img.src;
  const newAlt = img.alt || "Full view";
  lightboxImg.onload = () => {
    if (lightbox) lightbox.classList.remove("is-switching");
  };
  lightboxImg.src = newSrc;
  lightboxImg.alt = newAlt;
};

const openLightbox = (src, alt, index) => {
  if (!lightbox || !lightboxImg) return;
  if (typeof index === "number") {
    setLightboxImage(index);
  } else {
    lightboxImg.src = src;
    lightboxImg.alt = alt || "Full view";
  }
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const closeLightbox = () => {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImg.src = "";
  document.body.style.overflow = "";
};

if (lightbox) {
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) closeLightbox();
  });
}
if (lightboxClose) {
  lightboxClose.addEventListener("click", closeLightbox);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") setLightboxImage(lightboxIndex - 1);
  if (e.key === "ArrowRight") setLightboxImage(lightboxIndex + 1);
});

document.addEventListener("click", (e) => {
  const img = e.target.closest(".media-thumb img");
  if (!img) return;
  lightboxImages = Array.from(document.querySelectorAll(".media-thumb img"));
  lightboxIndex = lightboxImages.indexOf(img);
  openLightbox(img.src, img.alt, lightboxIndex);
});

if (lightboxPrev) {
  lightboxPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    setLightboxImage(lightboxIndex - 1);
  });
}
if (lightboxNext) {
  lightboxNext.addEventListener("click", (e) => {
    e.stopPropagation();
    setLightboxImage(lightboxIndex + 1);
  });
}

/* =====================================
   REEL VIEWER (VIDEOS/REELS ON MOBILE)
===================================== */
const reelViewer = document.getElementById("reelViewer");
const reelPlayer = document.getElementById("reelPlayer");
const reelClose = document.querySelector(".reel-close");
let reelList = [];
let reelIndex = -1;
let startY = 0;

const isMobile = () => window.matchMedia("(max-width: 700px)").matches;

const setReel = (index) => {
  if (!reelPlayer || !reelList.length) return;
  reelIndex = (index + reelList.length) % reelList.length;
  const src = reelList[reelIndex]?.src || "";
  if (!src) return;
  reelPlayer.src = src;
  reelPlayer.muted = false;
  reelPlayer.volume = 1;
  reelPlayer.play().catch(() => {});
};

const openReelViewer = (videos, index) => {
  if (!reelViewer || !reelPlayer) return;
  reelList = videos;
  reelViewer.classList.add("is-open");
  reelViewer.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setReel(index);
};

const closeReelViewer = () => {
  if (!reelViewer || !reelPlayer) return;
  reelViewer.classList.remove("is-open");
  reelViewer.setAttribute("aria-hidden", "true");
  reelPlayer.pause();
  reelPlayer.src = "";
  document.body.style.overflow = "";
};

if (reelClose) {
  reelClose.addEventListener("click", closeReelViewer);
}

if (reelViewer) {
  reelViewer.addEventListener("click", (e) => {
    if (e.target === reelViewer) closeReelViewer();
  });
  reelViewer.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
  });
  reelViewer.addEventListener("touchend", (e) => {
    const endY = e.changedTouches[0].clientY;
    const delta = endY - startY;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) setReel(reelIndex + 1);
    if (delta > 0) setReel(reelIndex - 1);
  });
  reelViewer.addEventListener("click", () => {
    if (!reelPlayer) return;
    if (reelPlayer.paused) {
      reelPlayer.play().catch(() => {});
    } else {
      reelPlayer.pause();
    }
  });
}

document.addEventListener("click", (e) => {
  if (!isMobile()) return;
  const videoEl = e.target.closest(".media-thumb video, .reel-thumb video");
  if (!videoEl) return;
  e.preventDefault();
  const allVideos = Array.from(document.querySelectorAll(".media-thumb video, .reel-thumb video"));
  const idx = allVideos.indexOf(videoEl);
  openReelViewer(allVideos, idx);
});
