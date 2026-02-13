// public/admin/assets/drive.js
async function uploadFileToProxy(fileInputEl, opts = {}) {
  const file = fileInputEl.files[0];
  if (!file) throw new Error('No file selected');

  const form = new FormData();
  form.append('file', file);
  form.append('name', opts.name || file.name);
  form.append('target', opts.target || 'gallery');

  const proxyUrl = opts.proxyUrl || 'http://localhost:3000/api/drive-upload'; // change to deployed URL when ready
  const resp = await fetch(proxyUrl, {
    method: 'POST',
    body: form,
    headers: { 'X-Upload-Secret': opts.uploadSecret || 'change-this-secret' }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Proxy error ${resp.status}: ${text}`);
  }

  return resp.json(); // { ok:true, url, id, name, mimeType, target }
}

document.getElementById('btnUpload').addEventListener('click', async () => {
  const fileEl = document.getElementById('fileInput');
  const title = document.getElementById('fileTitle').value || '';
  const msgEl = document.getElementById('message');
  msgEl.textContent = 'Uploading...';

  try {
    const result = await uploadFileToProxy(fileEl, {
      uploadSecret: 'change-this-secret',
      proxyUrl: 'http://localhost:3000/api/drive-upload' // change to your deployed proxy URL when deployed
    });

    msgEl.textContent = 'Uploaded.';

    // Firestore write (non-blocking if helper absent)
    try {
      if (window.addGalleryRecord && typeof window.addGalleryRecord === 'function') {
        await window.addGalleryRecord({
          url: result.url,
          name: result.name,
          mimeType: result.mimeType,
          title: title || result.name,
          target: result.target || 'gallery'
        });
        msgEl.textContent = 'Uploaded and recorded.';
      } else {
        console.warn('addGalleryRecord helper not found — skipping Firestore write');
      }
    } catch (fwErr) {
      console.error('Firestore write failed:', fwErr);
      msgEl.textContent = 'Uploaded but Firestore update failed.';
    }

  } catch (err) {
    console.error(err);
    msgEl.textContent = 'Upload failed: ' + (err.message || err);
  }
});
