/* Aruvi local clipboard import bridge.
 * Reads copied images (PNG on WebKit) and legacy transaction text/URLs/JSON.
 * The caller must invoke read() directly from a user-initiated button handler.
 */
(function attachPocketWiseClipboardImport(root) {
  'use strict';

  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const IMAGE_EXTENSIONS = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/heic': 'heic',
    'image/heif': 'heif'
  };

  function makeImageFile(blob, mimeType) {
    const type = String(mimeType || blob?.type || '').toLowerCase();
    if (!type.startsWith('image/')) throw new Error('The clipboard item is not an image.');
    if (!blob || !Number.isFinite(blob.size) || blob.size <= 0) {
      throw new Error('The copied image is empty. Copy the screenshot again and retry.');
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error('The copied image is larger than 15 MB. Copy a smaller screenshot.');
    }
    const extension = IMAGE_EXTENSIONS[type] || 'png';
    const name = `aruvi-clipboard-${Date.now()}.${extension}`;
    try {
      return new File([blob], name, { type, lastModified: Date.now() });
    } catch (_) {
      try { Object.defineProperty(blob, 'name', { value: name, configurable: true }); } catch (__) {}
      return blob;
    }
  }

  async function readClipboardImport() {
    const clipboard = root.navigator?.clipboard;
    if (!clipboard) throw new Error('Clipboard access is unavailable. Open Aruvi over HTTPS and try again.');

    let readError = null;
    if (typeof clipboard.read === 'function') {
      try {
        const items = await clipboard.read();
        const safeItems = Array.isArray(items) ? items : [];

        // Prefer image bytes over accompanying text so a copied payment screenshot
        // cannot accidentally be parsed as an old transaction payload.
        for (const item of safeItems) {
          const types = Array.from(item?.types || []);
          const imageType = types.find(type => typeof type === 'string' && type.toLowerCase().startsWith('image/'));
          if (!imageType || typeof item.getType !== 'function') continue;
          const blob = await item.getType(imageType);
          return { kind: 'image', file: makeImageFile(blob, imageType) };
        }

        // New and old Aruvi Shortcuts may place their payload in text/plain.
        for (const item of safeItems) {
          const types = Array.from(item?.types || []);
          if (!types.includes('text/plain') || typeof item.getType !== 'function') continue;
          const blob = await item.getType('text/plain');
          const text = await blob.text();
          if (String(text || '').trim()) return { kind: 'text', text: String(text) };
        }
      } catch (error) {
        // Safari/WebKit does not use the Permissions API for clipboard reads. A
        // NotAllowedError must be returned to the UI so it can offer a real,
        // user-driven paste-event target. Immediately calling readText() here can
        // consume the same transient activation and still will not show a prompt.
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
        readError = error;
      }
    }

    // Older Safari versions and older shortcuts expose text only through readText().
    if (typeof clipboard.readText === 'function') {
      try {
        const text = await clipboard.readText();
        if (String(text || '').trim()) return { kind: 'text', text: String(text) };
      } catch (error) {
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') throw error;
        if (!readError) readError = error;
      }
    }

    if (readError) throw readError;
    throw new Error('No image or Aruvi transaction was found on the clipboard.');
  }

  // Synchronous DataTransfer access from a user-initiated paste event is the
  // WebKit fallback when the asynchronous Clipboard API cannot expose content.
  async function readPasteEvent(dataTransfer) {
    if (!dataTransfer) return null;
    const items = Array.from(dataTransfer.items || []);
    for (const item of items) {
      const type = String(item?.type || '').toLowerCase();
      if (!type.startsWith('image/') || typeof item.getAsFile !== 'function') continue;
      const file = item.getAsFile();
      if (file) return { kind: 'image', file: makeImageFile(file, type) };
    }

    for (const file of Array.from(dataTransfer.files || [])) {
      if (String(file?.type || '').toLowerCase().startsWith('image/')) {
        return { kind: 'image', file: makeImageFile(file, file.type) };
      }
    }

    // Some WebKit paste sources expose an image as an HTML <img> subresource
    // rather than a DataTransfer file. Only resolve local data/blob URLs; never
    // fetch an arbitrary URL copied from untrusted clipboard HTML.
    const html = typeof dataTransfer.getData === 'function' ? String(dataTransfer.getData('text/html') || '') : '';
    if (html && html.length <= 22 * 1024 * 1024) {
      const match = html.match(/<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i);
      const src = match?.[2] || '';
      if (/^(?:data:image\/(?:png|jpeg|webp|gif|bmp);|blob:)/i.test(src) && typeof root.fetch === 'function') {
        try {
          const response = await root.fetch(src);
          if (response?.ok) {
            const blob = await response.blob();
            if (String(blob?.type || '').toLowerCase().startsWith('image/')) {
              return { kind: 'image', file: makeImageFile(blob, blob.type) };
            }
          }
        } catch (_) { /* Continue to the text fallback. */ }
      }
    }

    const text = typeof dataTransfer.getData === 'function' ? String(dataTransfer.getData('text/plain') || '') : '';
    if (text.trim()) return { kind: 'text', text };
    return null;
  }

  root.PocketWiseClipboardImport = Object.freeze({ read: readClipboardImport, readPasteEvent });
})(typeof window !== 'undefined' ? window : globalThis);
