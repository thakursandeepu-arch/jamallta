import { db } from "/login/assets/firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";
import { app } from "/login/assets/firebase-config.js";

const storage = getStorage(app);

const uploadForm = document.getElementById("uploadForm");
const mediaTitle = document.getElementById("mediaTitle");
const mediaDesc = document.getElementById("mediaDesc");
const mediaFile = document.getElementById("mediaFile");
const mediaPublic = document.getElementById("mediaPublic");
const mediaType = document.getElementById("mediaType");
const mediaPlacement = document.getElementById("mediaPlacement");
const sizeHint = document.getElementById("sizeHint");
const autoFixSize = document.getElementById("autoFixSize");
const mediaPinned = document.getElementById("mediaPinned");
const openEditorBtn = document.getElementById("openEditor");
const editorBackdrop = document.getElementById("editorBackdrop");
const closeEditorBtn = document.getElementById("closeEditor");
const editorCanvas = document.getElementById("editorCanvas");
const editorHint = document.getElementById("editorHint");
const fltBrightness = document.getElementById("fltBrightness");
const fltContrast = document.getElementById("fltContrast");
const fltSaturation = document.getElementById("fltSaturation");
const fltWarmth = document.getElementById("fltWarmth");
const lutFile = document.getElementById("lutFile");
const lutInfo = document.getElementById("lutInfo");
const lutIntensity = document.getElementById("lutIntensity");
const fltSmoothing = document.getElementById("fltSmoothing");
const fltSharpen = document.getElementById("fltSharpen");
const fltSubjectLight = document.getElementById("fltSubjectLight");
const fltBackgroundLight = document.getElementById("fltBackgroundLight");
const focusX = document.getElementById("focusX");
const focusY = document.getElementById("focusY");
const targetColor = document.getElementById("targetColor");
const colorTolerance = document.getElementById("colorTolerance");
const colorSaturation = document.getElementById("colorSaturation");
const colorLightness = document.getElementById("colorLightness");
const brushOn = document.getElementById("brushOn");
const brushOff = document.getElementById("brushOff");
const clearMask = document.getElementById("clearMask");
const zoomLevel = document.getElementById("zoomLevel");
const cropX = document.getElementById("cropX");
const cropY = document.getElementById("cropY");
const presetCinematic = document.getElementById("presetCinematic");
const presetWarm = document.getElementById("presetWarm");
const presetCrisp = document.getElementById("presetCrisp");
const resetEdits = document.getElementById("resetEdits");
const applyEdits = document.getElementById("applyEdits");
const fileInfo = document.getElementById("fileInfo");
const uploadBar = document.getElementById("uploadBar");
const uploadPct = document.getElementById("uploadPct");
const uploadHint = document.getElementById("uploadHint");
const statusText = document.getElementById("statusText");
const mediaList = document.getElementById("mediaList");
const mediaCount = document.getElementById("mediaCount");

function setStatus(text) {
  statusText.textContent = text;
}

function resetProgress() {
  uploadBar.style.width = "0%";
  uploadPct.textContent = "0%";
}

function getRequiredSize(type) {
  if (type === "reel") return { w: 1080, h: 1920, label: "1080x1920" };
  return { w: 1920, h: 1080, label: "1920x1080" };
}

async function checkDimensions(file, type) {
  const required = getRequiredSize(type);
  if (file.type.startsWith("image/")) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Image load failed"));
      img.src = url;
    });
    URL.revokeObjectURL(url);
    return { ok: img.width === required.w && img.height === required.h, w: img.width, h: img.height, required };
  }

  if (file.type.startsWith("video/")) {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Video load failed"));
      video.src = url;
    });
    URL.revokeObjectURL(url);
    return { ok: video.videoWidth === required.w && video.videoHeight === required.h, w: video.videoWidth, h: video.videoHeight, required };
  }

  return { ok: false, w: 0, h: 0, required };
}

async function resizeImageCover(file, targetW, targetH) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Image load failed"));
    img.src = url;
  });
  URL.revokeObjectURL(url);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");

  const scale = Math.max(targetW / img.width, targetH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (targetW - drawW) / 2;
  const dy = (targetH - drawH) / 2;

  ctx.drawImage(img, dx, dy, drawW, drawH);

  const blob = await new Promise((res) => {
    canvas.toBlob((b) => res(b), "image/jpeg", 0.9);
  });
  if (!blob) throw new Error("Resize failed");

  const newName = file.name.replace(/\.[^.]+$/, "") + "_1920x1080.jpg";
  return new File([blob], newName, { type: "image/jpeg" });
}

mediaFile.addEventListener("change", async () => {
  const file = mediaFile.files?.[0];
  if (!file) {
    fileInfo.textContent = "No file selected";
    sizeHint.textContent = "Recommended sizes: Photo 1920x1080, Video 1920x1080, Reel 1080x1920";
    return;
  }
  const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
  fileInfo.textContent = `${file.name} (${sizeMb} MB)`;
  uploadHint.textContent = "";

  try {
    const type = mediaType.value || "photo";
    const result = await checkDimensions(file, type);
    if (!result.ok) {
      if (type === "photo" && autoFixSize.checked && file.type.startsWith("image/")) {
        sizeHint.textContent = `Size mismatch: ${result.w}x${result.h}. Will auto-fix to ${result.required.label} on upload.`;
      } else {
        sizeHint.textContent = `Size mismatch: ${result.w}x${result.h}. Required ${result.required.label}.`;
      }
    } else {
      sizeHint.textContent = `Size OK: ${result.w}x${result.h}.`;
    }
  } catch {
    sizeHint.textContent = "Unable to read file dimensions.";
  }
});

uploadForm.addEventListener("reset", () => {
  fileInfo.textContent = "No file selected";
  uploadHint.textContent = "";
  setStatus("Ready");
  resetProgress();
});

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  uploadHint.textContent = "";

  const file = mediaFile.files?.[0];
  if (!file) {
    uploadHint.textContent = "Please select a file.";
    return;
  }

  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    uploadHint.textContent = "Only image or video files are allowed.";
    return;
  }

  const title = mediaTitle.value.trim();
  if (!title) {
    uploadHint.textContent = "Please enter a title.";
    return;
  }

  const description = mediaDesc.value.trim();
  const contentType = mediaType.value || "photo";
  const placement = mediaPlacement?.value || "portfolio";
  const pinned = !!mediaPinned?.checked;
  if (contentType === "photo" && !isImage) {
    uploadHint.textContent = "Please choose an image for Photo type.";
    return;
  }
  if ((contentType === "video" || contentType === "reel") && !isVideo) {
    uploadHint.textContent = "Please choose a video for Video/Reel type.";
    return;
  }

let uploadFile = file;
  try {
    const dimCheck = await checkDimensions(file, contentType);
    if (!dimCheck.ok) {
      if (contentType === "photo" && autoFixSize.checked && file.type.startsWith("image/")) {
        uploadFile = await resizeImageCover(file, dimCheck.required.w, dimCheck.required.h);
      } else {
        uploadHint.textContent = `Please upload ${dimCheck.required.label} size for ${contentType}.`;
        return;
      }
    }
  } catch {
    uploadHint.textContent = "Could not verify file size. Please try again.";
    return;
  }
  const isPublic = !!mediaPublic.checked;
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `media/${Date.now()}_${safeName}`;

  setStatus("Uploading...");
  resetProgress();

  const fileRef = ref(storage, storagePath);
  const uploadTask = uploadBytesResumable(fileRef, uploadFile);

  uploadTask.on("state_changed", (snap) => {
    const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
    uploadBar.style.width = `${pct}%`;
    uploadPct.textContent = `${pct}%`;
  }, (err) => {
    console.error(err);
    uploadHint.textContent = err.message || "Upload failed.";
    setStatus("Upload failed");
  }, async () => {
    try {
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      await addDoc(collection(db, "media"), {
        title,
        description,
        type: contentType,
        mimeType: uploadFile.type,
        url,
        storagePath,
        isPublic,
        placement,
        pinned,
        size: uploadFile.size,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      uploadHint.textContent = "Upload complete.";
      setStatus("Uploaded");
      uploadForm.reset();
    } catch (err) {
      console.error(err);
      uploadHint.textContent = err.message || "Failed to save media.";
      setStatus("Save failed");
    }
  });
});

/* ===== Local Photo Editor ===== */
let editorImage = null;
let editedFile = null;
let lutData = null;
let lutSize = 0;
let maskData = null;
let maskW = 0;
let maskH = 0;
let brushMode = "on";

function getFilterString() {
  const b = fltBrightness.value / 100;
  const c = fltContrast.value / 100;
  const s = fltSaturation.value / 100;
  const w = fltWarmth.value / 100;
  return `brightness(${b}) contrast(${c}) saturate(${s}) sepia(${w})`;
}

function getCropBox(imgW, imgH) {
  const targetW = 1920;
  const targetH = 1080;
  const targetAR = targetW / targetH;
  let cropW = imgW;
  let cropH = imgH;
  if (imgW / imgH > targetAR) {
    cropH = imgH;
    cropW = imgH * targetAR;
  } else {
    cropW = imgW;
    cropH = imgW / targetAR;
  }

  const offsetX = (cropX.value / 100) * (imgW - cropW);
  const offsetY = (cropY.value / 100) * (imgH - cropH);
  const x = (imgW - cropW) / 2 + offsetX;
  const y = (imgH - cropH) / 2 + offsetY;
  return { x, y, w: cropW, h: cropH };
}

function renderEditor() {
  if (!editorImage) return;
  const ctx = editorCanvas.getContext("2d");
  const canvasW = editorCanvas.width;
  const canvasH = editorCanvas.height;
  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.filter = getFilterString();

  const crop = getCropBox(editorImage.width, editorImage.height);
  const zoom = (zoomLevel?.value || 100) / 100;
  const drawW = canvasW * zoom;
  const drawH = canvasH * zoom;
  const dx = (canvasW - drawW) / 2;
  const dy = (canvasH - drawH) / 2;
  ctx.drawImage(
    editorImage,
    crop.x, crop.y, crop.w, crop.h,
    dx, dy, drawW, drawH
  );
  ctx.filter = "none";

  if (lutData && lutSize) {
    applyLUTToCanvas(ctx, canvasW, canvasH);
  }

  applyAdvancedAdjustments(ctx, canvasW, canvasH);
  applyColorTargetAdjust(ctx, canvasW, canvasH);
  drawMaskOverlay(ctx, canvasW, canvasH);
}

function parseCubeLUT(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let size = 0;
  const values = [];
  for (const line of lines) {
    if (line.startsWith("#") || line.startsWith("//") || line.startsWith("TITLE")) continue;
    if (line.startsWith("LUT_3D_SIZE")) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
      continue;
    }
    if (line.startsWith("DOMAIN_")) continue;
    const parts = line.split(/\s+/);
    if (parts.length === 3) {
      values.push(parts.map(Number));
    }
  }
  if (!size || values.length !== size * size * size) {
    throw new Error("Invalid LUT file");
  }
  const flat = new Float32Array(values.length * 3);
  for (let i = 0; i < values.length; i++) {
    flat[i * 3 + 0] = values[i][0];
    flat[i * 3 + 1] = values[i][1];
    flat[i * 3 + 2] = values[i][2];
  }
  return { size, data: flat };
}

function sampleLUT(r, g, b) {
  const size = lutSize;
  const data = lutData;
  const max = size - 1;
  const rf = r * max;
  const gf = g * max;
  const bf = b * max;
  const r0 = Math.floor(rf);
  const g0 = Math.floor(gf);
  const b0 = Math.floor(bf);
  const r1 = Math.min(r0 + 1, max);
  const g1 = Math.min(g0 + 1, max);
  const b1 = Math.min(b0 + 1, max);
  const dr = rf - r0;
  const dg = gf - g0;
  const db = bf - b0;

  const idx = (ri, gi, bi) => (ri * size * size + gi * size + bi) * 3;

  const c000 = idx(r0, g0, b0);
  const c001 = idx(r0, g0, b1);
  const c010 = idx(r0, g1, b0);
  const c011 = idx(r0, g1, b1);
  const c100 = idx(r1, g0, b0);
  const c101 = idx(r1, g0, b1);
  const c110 = idx(r1, g1, b0);
  const c111 = idx(r1, g1, b1);

  const lerp = (a, b, t) => a + (b - a) * t;

  const r00 = lerp(data[c000], data[c001], db);
  const r01 = lerp(data[c010], data[c011], db);
  const r10 = lerp(data[c100], data[c101], db);
  const r11 = lerp(data[c110], data[c111], db);

  const g00 = lerp(data[c000 + 1], data[c001 + 1], db);
  const g01 = lerp(data[c010 + 1], data[c011 + 1], db);
  const g10 = lerp(data[c100 + 1], data[c101 + 1], db);
  const g11 = lerp(data[c110 + 1], data[c111 + 1], db);

  const b00 = lerp(data[c000 + 2], data[c001 + 2], db);
  const b01 = lerp(data[c010 + 2], data[c011 + 2], db);
  const b10 = lerp(data[c100 + 2], data[c101 + 2], db);
  const b11 = lerp(data[c110 + 2], data[c111 + 2], db);

  const rr = lerp(lerp(r00, r01, dg), lerp(r10, r11, dg), dr);
  const gg = lerp(lerp(g00, g01, dg), lerp(g10, g11, dg), dr);
  const bb = lerp(lerp(b00, b01, dg), lerp(b10, b11, dg), dr);

  return { r: rr, g: gg, b: bb };
}

function applyLUTToCanvas(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const intensity = (lutIntensity?.value || 50) / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const mapped = sampleLUT(r, g, b);
    data[i] = Math.round((r * (1 - intensity) + mapped.r * intensity) * 255);
    data[i + 1] = Math.round((g * (1 - intensity) + mapped.g * intensity) * 255);
    data[i + 2] = Math.round((b * (1 - intensity) + mapped.b * intensity) * 255);
  }
  ctx.putImageData(img, 0, 0);
}

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

function boxBlur(data, w, h, radius) {
  const out = new Uint8ClampedArray(data.length);
  const r = Math.max(1, Math.floor(radius));
  const w4 = w * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rsum = 0, gsum = 0, bsum = 0, asum = 0, count = 0;
      for (let yy = y - r; yy <= y + r; yy++) {
        if (yy < 0 || yy >= h) continue;
        const row = yy * w4;
        for (let xx = x - r; xx <= x + r; xx++) {
          if (xx < 0 || xx >= w) continue;
          const i = row + xx * 4;
          rsum += data[i];
          gsum += data[i + 1];
          bsum += data[i + 2];
          asum += data[i + 3];
          count++;
        }
      }
      const idx = y * w4 + x * 4;
      out[idx] = rsum / count;
      out[idx + 1] = gsum / count;
      out[idx + 2] = bsum / count;
      out[idx + 3] = asum / count;
    }
  }
  return out;
}

function isSkin(r, g, b) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return y > 40 && cb > 85 && cb < 135 && cr > 135 && cr < 180;
}

function applyAdvancedAdjustments(ctx, w, h) {
  const smoothing = (fltSmoothing?.value || 0) / 100;
  const sharpen = (fltSharpen?.value || 0) / 100;
  const subjectLight = (fltSubjectLight?.value || 0) / 100;
  const backgroundLight = (fltBackgroundLight?.value || 0) / 100;
  if (smoothing === 0 && sharpen === 0 && subjectLight === 0 && backgroundLight === 0) return;

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  let blurForSmooth = null;
  if (smoothing > 0) {
    blurForSmooth = boxBlur(data, w, h, 2 + smoothing * 2);
  }

  let blurForSharp = null;
  if (sharpen > 0) {
    blurForSharp = boxBlur(data, w, h, 1 + sharpen * 1.5);
  }

  const cx = w / 2 + (focusX?.value || 0) / 100 * w * 0.3;
  const cy = h / 2 + (focusY?.value || 0) / 100 * h * 0.3;
  const maxR = Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (blurForSmooth && isSkin(r, g, b)) {
        const mix = smoothing;
        r = r * (1 - mix) + blurForSmooth[i] * mix;
        g = g * (1 - mix) + blurForSmooth[i + 1] * mix;
        b = b * (1 - mix) + blurForSmooth[i + 2] * mix;
      }

      if (blurForSharp) {
        const amount = sharpen * 1.5;
        r = clamp(r + amount * (r - blurForSharp[i]));
        g = clamp(g + amount * (g - blurForSharp[i + 1]));
        b = clamp(b + amount * (b - blurForSharp[i + 2]));
      }

      if (subjectLight !== 0 || backgroundLight !== 0) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxR;
        const mask = Math.max(0, 1 - dist);
        const soft = mask * mask;
        const gain = subjectLight * 0.4 * soft + backgroundLight * 0.4 * (1 - soft);
        r = clamp(r * (1 + gain));
        g = clamp(g * (1 + gain));
        b = clamp(b * (1 + gain));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  ctx.putImageData(img, 0, 0);
}

function hexToRgb(hex) {
  const c = hex.replace("#", "");
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function applyColorTargetAdjust(ctx, w, h) {
  const satAdj = (colorSaturation?.value || 0) / 100;
  const lightAdj = (colorLightness?.value || 0) / 100;
  if (satAdj === 0 && lightAdj === 0) return;

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const tgt = hexToRgb(targetColor?.value || "#d2a07c");
  const tol = (colorTolerance?.value || 25) / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dr = (r - tgt.r) / 255;
      const dg = (g - tgt.g) / 255;
      const db = (b - tgt.b) / 255;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      const inRange = dist <= tol;
      const masked = maskData ? maskData[i] > 0 : true;
      if (!inRange || !masked) continue;
      const hsl = rgbToHsl(r, g, b);
      hsl.s = Math.min(1, Math.max(0, hsl.s + satAdj));
      hsl.l = Math.min(1, Math.max(0, hsl.l + lightAdj));
      const out = hslToRgb(hsl.h, hsl.s, hsl.l);
      data[i] = out.r;
      data[i + 1] = out.g;
      data[i + 2] = out.b;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function ensureMask(w, h) {
  if (!maskData || maskW !== w || maskH !== h) {
    maskW = w;
    maskH = h;
    maskData = new Uint8ClampedArray(w * h * 4);
  }
}

function drawMaskOverlay(ctx, w, h) {
  if (!maskData) return;
  const overlay = ctx.getImageData(0, 0, w, h);
  const data = overlay.data;
  for (let i = 0; i < data.length; i += 4) {
    if (maskData[i] > 0) {
      data[i] = Math.min(255, data[i] + 15);
      data[i + 1] = Math.min(255, data[i + 1] + 10);
      data[i + 2] = Math.min(255, data[i + 2] + 10);
    }
  }
  ctx.putImageData(overlay, 0, 0);
}

function openEditor() {
  const file = mediaFile.files?.[0];
  if (!file) {
    editorHint.textContent = "Please choose a photo first.";
    return;
  }
  if (!file.type.startsWith("image/")) {
    editorHint.textContent = "Editor works for photos only.";
    return;
  }
  editorHint.textContent = "";
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    editorImage = img;
    URL.revokeObjectURL(url);
    ensureMask(editorCanvas.width, editorCanvas.height);
    editorBackdrop.classList.add("show");
    renderEditor();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    editorHint.textContent = "Could not load image.";
  };
  img.src = url;
}

async function applyEditor() {
  if (!editorImage) return;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = 1920;
  outCanvas.height = 1080;
  const ctx = outCanvas.getContext("2d");
  ctx.filter = getFilterString();
  const crop = getCropBox(editorImage.width, editorImage.height);
  ctx.drawImage(
    editorImage,
    crop.x, crop.y, crop.w, crop.h,
    0, 0, outCanvas.width, outCanvas.height
  );
  ctx.filter = "none";
  if (lutData && lutSize) {
    applyLUTToCanvas(ctx, outCanvas.width, outCanvas.height);
  }
  applyAdvancedAdjustments(ctx, outCanvas.width, outCanvas.height);

  const blob = await new Promise((res) => {
    outCanvas.toBlob((b) => res(b), "image/jpeg", 0.92);
  });
  if (!blob) return;
  const baseName = (mediaFile.files?.[0]?.name || "photo").replace(/\.[^.]+$/, "");
  editedFile = new File([blob], `${baseName}_edited.jpg`, { type: "image/jpeg" });

  // Replace selected file for upload
  const dt = new DataTransfer();
  dt.items.add(editedFile);
  mediaFile.files = dt.files;
  fileInfo.textContent = `${editedFile.name} (${(editedFile.size / (1024*1024)).toFixed(2)} MB)`;
  sizeHint.textContent = "Size OK: 1920x1080.";

  editorBackdrop.classList.remove("show");
}

openEditorBtn?.addEventListener("click", openEditor);
closeEditorBtn?.addEventListener("click", () => editorBackdrop.classList.remove("show"));

[fltBrightness, fltContrast, fltSaturation, fltWarmth, fltSmoothing, fltSharpen, fltSubjectLight, fltBackgroundLight, focusX, focusY, cropX, cropY].forEach((el) => {
  el?.addEventListener("input", renderEditor);
});
zoomLevel?.addEventListener("input", renderEditor);
targetColor?.addEventListener("input", renderEditor);
colorTolerance?.addEventListener("input", renderEditor);
colorSaturation?.addEventListener("input", renderEditor);
colorLightness?.addEventListener("input", renderEditor);
lutIntensity?.addEventListener("input", renderEditor);

brushOn?.addEventListener("click", () => brushMode = "on");
brushOff?.addEventListener("click", () => brushMode = "off");
clearMask?.addEventListener("click", () => {
  if (!maskData) return;
  maskData.fill(0);
  renderEditor();
});

editorCanvas?.addEventListener("pointerdown", (e) => {
  if (!maskData) return;
  editorCanvas.setPointerCapture(e.pointerId);
});
editorCanvas?.addEventListener("pointermove", (e) => {
  if (!e.buttons) return;
  if (!maskData) return;
  const rect = editorCanvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / rect.width * editorCanvas.width);
  const y = Math.floor((e.clientY - rect.top) / rect.height * editorCanvas.height);
  const radius = 18;
  for (let yy = y - radius; yy <= y + radius; yy++) {
    if (yy < 0 || yy >= maskH) continue;
    for (let xx = x - radius; xx <= x + radius; xx++) {
      if (xx < 0 || xx >= maskW) continue;
      const dx = xx - x;
      const dy = yy - y;
      if (dx*dx + dy*dy > radius*radius) continue;
      const idx = (yy * maskW + xx) * 4;
      maskData[idx] = brushMode === "on" ? 255 : 0;
      maskData[idx + 1] = 0;
      maskData[idx + 2] = 0;
      maskData[idx + 3] = 255;
    }
  }
  renderEditor();
});
lutIntensity?.addEventListener("input", renderEditor);

lutFile?.addEventListener("change", async () => {
  const file = lutFile.files?.[0];
  if (!file) {
    lutInfo.textContent = "No LUT selected";
    lutData = null;
    lutSize = 0;
    renderEditor();
    return;
  }
  try {
    const text = await file.text();
    const parsed = parseCubeLUT(text);
    lutData = parsed.data;
    lutSize = parsed.size;
    lutInfo.textContent = `Loaded LUT: ${file.name} (${lutSize}x${lutSize}x${lutSize})`;
    renderEditor();
  } catch (err) {
    lutInfo.textContent = "Invalid LUT file";
    lutData = null;
    lutSize = 0;
  }
});

presetCinematic?.addEventListener("click", () => {
  fltBrightness.value = 95;
  fltContrast.value = 115;
  fltSaturation.value = 110;
  fltWarmth.value = 10;
  renderEditor();
});
presetWarm?.addEventListener("click", () => {
  fltBrightness.value = 105;
  fltContrast.value = 105;
  fltSaturation.value = 115;
  fltWarmth.value = 35;
  renderEditor();
});
presetCrisp?.addEventListener("click", () => {
  fltBrightness.value = 100;
  fltContrast.value = 125;
  fltSaturation.value = 105;
  fltWarmth.value = 0;
  renderEditor();
});
resetEdits?.addEventListener("click", () => {
  fltBrightness.value = 100;
  fltContrast.value = 100;
  fltSaturation.value = 100;
  fltWarmth.value = 0;
  cropX.value = 0;
  cropY.value = 0;
  renderEditor();
});
applyEdits?.addEventListener("click", applyEditor);

function renderList(items) {
  mediaList.innerHTML = "";
  mediaCount.textContent = items.length;

  if (items.length === 0) {
    mediaList.innerHTML = `<p class="hint">No media uploaded yet.</p>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "media-item";
    card.dataset.id = item.id;

    const thumb = document.createElement("div");
    thumb.className = "media-thumb";

    if (item.type === "video") {
      const video = document.createElement("video");
      video.src = item.url;
      video.controls = true;
      video.preload = "metadata";
      thumb.appendChild(video);
    } else {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.title || "Media";
      img.loading = "lazy";
      thumb.appendChild(img);
    }

    const meta = document.createElement("div");
    meta.className = "media-meta";

    const titleInput = document.createElement("input");
    titleInput.value = item.title || "";

    const descInput = document.createElement("textarea");
    descInput.rows = 2;
    descInput.value = item.description || "";

    const publicWrap = document.createElement("label");
    publicWrap.className = "field checkbox";
    const publicText = document.createElement("span");
    publicText.textContent = "Publish on Website (SEO)";
    const publicToggle = document.createElement("input");
    publicToggle.type = "checkbox";
    publicToggle.checked = item.isPublic !== false;
    const publicHint = document.createElement("small");
    publicHint.textContent = "If unchecked, it will be hidden from front page.";
    publicWrap.appendChild(publicText);
    publicWrap.appendChild(publicToggle);
    publicWrap.appendChild(publicHint);

    const row = document.createElement("div");
    row.className = "meta-row";
    const typeLabel = document.createElement("span");
    const typeMap = { photo: "Photo", video: "Video", reel: "Reel" };
    typeLabel.textContent = typeMap[item.type] || "Photo";
    const placeLabel = document.createElement("span");
    placeLabel.textContent = item.placement === "featured"
      ? "Featured Banner"
      : "Portfolio";
    const dateLabel = document.createElement("span");
    dateLabel.textContent = item.createdAt
      ? new Date(item.createdAt.seconds * 1000).toLocaleString()
      : "Just now";

    const placement = document.createElement("span");
    placement.className = "placement";
    if ((item.placement || "portfolio") === "featured") {
      placement.textContent = "Shows in: Home > Featured Banner";
    } else {
      placement.textContent = `Shows in: ${
        (item.type || "photo") === "photo"
          ? "Home > Portfolio > Photos"
          : (item.type === "video"
            ? "Home > Portfolio > Videos"
            : "Home > Portfolio > Reels")
      }`;
    }

    row.appendChild(typeLabel);
    row.appendChild(placeLabel);
    row.appendChild(dateLabel);
    row.appendChild(placement);

    meta.appendChild(titleInput);
    meta.appendChild(descInput);

    const typeWrap = document.createElement("label");
    typeWrap.className = "field";
    const typeText = document.createElement("span");
    typeText.textContent = "Content Type";
    const typeSelect = document.createElement("select");
    ["photo", "video", "reel"].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      if ((item.type || "photo") === t) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeWrap.appendChild(typeText);
    typeWrap.appendChild(typeSelect);

    const placementWrap = document.createElement("label");
    placementWrap.className = "field";
    const placementText = document.createElement("span");
    placementText.textContent = "Placement";
    const placementSelect = document.createElement("select");
    [
      { value: "portfolio", label: "Home > Portfolio" },
      { value: "featured", label: "Home > Featured Banner" }
    ].forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if ((item.placement || "portfolio") === opt.value) o.selected = true;
      placementSelect.appendChild(o);
    });
    placementWrap.appendChild(placementText);
    placementWrap.appendChild(placementSelect);

    const pinWrap = document.createElement("label");
    pinWrap.className = "field checkbox";
    const pinText = document.createElement("span");
    pinText.textContent = "Pin to Top (Featured / First)";
    const pinToggle = document.createElement("input");
    pinToggle.type = "checkbox";
    pinToggle.checked = !!item.pinned;
    const pinHint = document.createElement("small");
    pinHint.textContent = "Pinned items show first in their section.";
    pinWrap.appendChild(pinText);
    pinWrap.appendChild(pinToggle);
    pinWrap.appendChild(pinHint);

    meta.appendChild(publicWrap);
    meta.appendChild(typeWrap);
    meta.appendChild(placementWrap);
    meta.appendChild(pinWrap);
    meta.appendChild(row);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const updateBtn = document.createElement("button");
    updateBtn.className = "btn";
    updateBtn.textContent = "Update";
    updateBtn.addEventListener("click", async () => {
      updateBtn.textContent = "Saving...";
      updateBtn.disabled = true;
      try {
        await updateDoc(doc(db, "media", item.id), {
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          isPublic: !!publicToggle.checked,
          type: typeSelect.value,
          placement: placementSelect.value,
          pinned: !!pinToggle.checked,
          updatedAt: serverTimestamp()
        });
        updateBtn.textContent = "Saved";
        setTimeout(() => {
          updateBtn.textContent = "Update";
          updateBtn.disabled = false;
        }, 800);
      } catch (err) {
        console.error(err);
        updateBtn.textContent = "Update";
        updateBtn.disabled = false;
        alert(err.message || "Update failed.");
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      const ok = confirm("Delete this media item?");
      if (!ok) return;
      deleteBtn.textContent = "Deleting...";
      deleteBtn.disabled = true;
      try {
        if (item.storagePath) {
          await deleteObject(ref(storage, item.storagePath));
        }
        await deleteDoc(doc(db, "media", item.id));
      } catch (err) {
        console.error(err);
        deleteBtn.textContent = "Delete";
        deleteBtn.disabled = false;
        alert(err.message || "Delete failed.");
      }
    });

    actions.appendChild(updateBtn);
    actions.appendChild(deleteBtn);

    card.appendChild(thumb);
    card.appendChild(meta);
    card.appendChild(actions);

    mediaList.appendChild(card);
  });
}

const mediaRef = collection(db, "media");
const q = query(mediaRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
  const items = snap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data()
  }));
  renderList(items);
}, (err) => {
  console.error(err);
  mediaList.innerHTML = `<p class="hint">Failed to load media list.</p>`;
});
