/* Browser-only receipt image handling. Financial decisions stay in the C++ WASM engine. */
(function (root) {
  'use strict';

  async function compress(file) {
    if (!(file instanceof Blob) || !/^image\//i.test(file.type) || file.size > 15 * 1024 * 1024) {
      throw new Error('Choose an image under 15 MB.');
    }
    let bitmap = null, source = null, url = '';
    try {
      if ('createImageBitmap' in root) {
        try { bitmap = await root.createImageBitmap(file); source = bitmap; }
        catch (_) { source = null; } // Safari may expose createImageBitmap but not decode a given camera format.
      }
      if (!source) {
        url = root.URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const image = new root.Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('This receipt image could not be opened.'));
          image.src = url;
        });
      }
      const scale = Math.min(1, 1440 / Math.max(source.width, source.height));
      const canvas = root.document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Receipt image processing is unavailable on this device.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Could not compress the receipt image.')),
        'image/jpeg', 0.78
      ));
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      if (url) root.URL.revokeObjectURL(url);
    }
  }

  async function save(db, id, blob) {
    if (db && db.objectStoreNames.contains('receipts')) {
      return new Promise((resolve, reject) => {
        try {
          const tx = db.transaction('receipts', 'readwrite');
          tx.objectStore('receipts').put(blob, id);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error('Could not store the receipt image locally.'));
          tx.onabort = () => reject(tx.error || new Error('Receipt image storage was cancelled.'));
        } catch (error) { reject(error); }
      });
    }
    const reader = new root.FileReader();
    const data = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Could not read the receipt image.'));
      reader.readAsDataURL(blob);
    });
    try { root.localStorage.setItem('pocketwise-receipt-' + id, data); }
    catch (_) { throw new Error('Receipt storage is full. Remove older receipt photos or use a device with IndexedDB enabled.'); }
  }

  async function load(db, id) {
    if (!id) return null;
    if (db && db.objectStoreNames.contains('receipts')) {
      const blob = await new Promise(resolve => {
        try {
          const request = db.transaction('receipts', 'readonly').objectStore('receipts').get(id);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => resolve(null);
        } catch (_) { resolve(null); }
      });
      if (blob instanceof Blob) return root.URL.createObjectURL(blob);
    }
    try { return root.localStorage.getItem('pocketwise-receipt-' + id) || null; }
    catch (_) { return null; }
  }

  root.PocketWiseReceiptMedia = Object.freeze({ compress, save, load });
})(typeof globalThis !== 'undefined' ? globalThis : this);
