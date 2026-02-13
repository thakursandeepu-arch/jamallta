// recycle-bin.js (ES module)

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, query, orderBy, onSnapshot, where,
  getDocs, updateDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAcHb-VHdM30fb9qSR4dzclmNTxXsTofIw",
  authDomain: "jamallta-films-2-27d2b.firebaseapp.com",
  projectId: "jamallta-films-2-27d2b",
  storageBucket: "jamallta-films-2-27d2b.firebasestorage.app",
  messagingSenderId: "207209419416",
  appId: "1:207209419416:web:53ff512e34553e9286b6ed"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let deletedItems = [];

document.addEventListener('DOMContentLoaded', () => {
  // If you have a recycle bin page embed, ensure these IDs exist in that HTML:
  // itemsList, btnEmptyBin, btnRefresh, btnRestoreSelected, btnDeleteSelected, selectAll, searchBox, filterType, filterDate, totalItems
  console.log('Recycle Bin script loaded');
  loadDeletedItems();

  // setup event listeners (if elements exist)
  const btnEmpty = document.getElementById('btnEmptyBin');
  if(btnEmpty) btnEmpty.addEventListener('click', emptyRecycleBin);
  const btnRefresh = document.getElementById('btnRefresh');
  if(btnRefresh) btnRefresh.addEventListener('click', loadDeletedItems);

  const btnRestoreSelected = document.getElementById('btnRestoreSelected');
  if(btnRestoreSelected) btnRestoreSelected.addEventListener('click', ()=> {
    const selectedItems = document.querySelectorAll('.item-select:checked');
    if(selectedItems.length === 0) return showToast('Please select items to restore.', 'warning');
    if(!confirm(`Restore ${selectedItems.length} selected item(s)?`)) return;
    selectedItems.forEach(cb => {
      const row = cb.closest('.item-row');
      const id = row.dataset.id;
      restoreItem(id);
    });
  });

  const btnDeleteSelected = document.getElementById('btnDeleteSelected');
  if(btnDeleteSelected) btnDeleteSelected.addEventListener('click', ()=> {
    const selectedItems = document.querySelectorAll('.item-select:checked');
    if(selectedItems.length === 0) return showToast('Please select items to delete permanently.', 'warning');
    if(!confirm(`Permanently delete ${selectedItems.length} selected item(s)? This action cannot be undone.`)) return;
    selectedItems.forEach(cb => {
      const row = cb.closest('.item-row');
      const id = row.dataset.id;
      deleteItemPermanently(id);
    });
  });

  const searchBox = document.getElementById('searchBox');
  if(searchBox) searchBox.addEventListener('input', function() {
    const value = this.value.toLowerCase();
    document.querySelectorAll('.item-row').forEach(r => {
      const name = r.querySelector('.file-name')?.textContent?.toLowerCase() || '';
      r.style.display = name.includes(value) ? 'grid' : 'none';
    });
  });
});

async function loadDeletedItems(){
  try {
    const recycleBinRef = collection(db, 'jobs');
    const q = query(recycleBinRef, where('deleteData', '==', true), orderBy('deletedAt', 'desc'));
    onSnapshot(q, (snapshot) => {
      deletedItems = [];
      const itemsList = document.getElementById('itemsList');
      if(itemsList) itemsList.innerHTML = '';

      if (snapshot.empty) {
        if(itemsList) itemsList.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🗑️</div>
            <h3>Recycle Bin is Empty</h3>
            <p>Deleted items will appear here</p>
          </div>`;
        updateStats();
        return;
      }

      snapshot.forEach((docSnap) => {
        const item = { id: docSnap.id, ...docSnap.data() };
        deletedItems.push(item);
        if(itemsList) displayDeletedItem(item, itemsList);
      });
      updateStats();
    });
  } catch (err) {
    console.error('Error loading deleted items', err);
    showToast('Error loading deleted items', 'error');
  }
}

function displayDeletedItem(item, container){
  if(!container) return;
  const fileType = getFileType(item);
  const fileIcon = getFileIcon(fileType);
  const fileName = item.jobNo ? `Job: ${item.jobNo} - ${item.projectName || 'No Project'}` :
    item.studioName ? `Client: ${item.studioName}` : 'Deleted Item';

  const itemRow = document.createElement('div');
  itemRow.className = 'item-row';
  itemRow.dataset.id = item.id;
  itemRow.dataset.type = fileType;

  itemRow.innerHTML = `
    <div class="item-checkbox"><input type="checkbox" class="item-select"></div>
    <div class="item-name"><span class="file-icon">${fileIcon}</span> <span class="file-name">${fileName}</span></div>
    <div class="item-type">${fileType}</div>
    <div class="item-date">${formatDate(item.deletedAt)}</div>
    <div class="item-actions">
      <button class="action-btn restore-btn" title="Restore">↩️</button>
      <button class="action-btn delete-btn" title="Delete Permanently">❌</button>
    </div>
  `;

  itemRow.querySelector('.restore-btn').addEventListener('click', ()=> restoreItem(item.id));
  itemRow.querySelector('.delete-btn').addEventListener('click', ()=> deleteItemPermanently(item.id));
  container.appendChild(itemRow);
}

async function restoreItem(itemId){
  try {
    await updateDoc(doc(db,'jobs',itemId), { deleteData:false, deletedAt: null });
    showToast('Item restored successfully');
  } catch (err) {
    console.error('Restore error', err);
    showToast('Error restoring item', 'error');
  }
}

async function deleteItemPermanently(itemId){
  if(!confirm('Permanently delete this item?')) return;
  try {
    await deleteDoc(doc(db,'jobs',itemId));
    showToast('Item permanently deleted');
  } catch (err) {
    console.error('Delete permanently error', err);
    showToast('Error deleting item', 'error');
  }
}

async function emptyRecycleBin(){
  if(!confirm('Empty the entire recycle bin? All items will be permanently deleted and this action cannot be undone.')) return;
  try {
    const snapshot = await getDocs(query(collection(db,'jobs'), where('deleteData','==',true)));
    const promises = [];
    snapshot.forEach(d => promises.push(deleteDoc(d.ref)));
    await Promise.all(promises);
    showToast('Recycle bin emptied successfully');
  } catch (err) {
    console.error(err);
    showToast('Error emptying recycle bin', 'error');
  }
}

function updateStats(){
  const totalItems = deletedItems.length;
  const el = document.getElementById('totalItems');
  if(el) el.textContent = totalItems;
}

function getFileType(item) {
  if (item.jobNo) return 'Job';
  if (item.studioName && !item.jobNo) return 'Client';
  if (item.amount) return 'Payment';
  return 'File';
}
function getFileIcon(fileType) {
  const iconMap = { 'Job': '🎬', 'Client': '👥', 'Payment': '💰', 'File': '📄' };
  return iconMap[fileType] || '📄';
}
function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString();
}

function showToast(message, type='success'){
  let toast = document.getElementById('toast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${message}</span>`;
  toast.className = 'toast';
  toast.classList.add(type);
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 3000);
}



