/* Aruvi viewport guard.
 * The desktop gate is intentionally device-aware: a large physical display,
 * a hover-capable fine pointer, and no touch input must all be present.
 * This avoids locking phones and touch-first tablets, including those in
 * landscape or with a wide browser viewport. */
(function installPocketWiseViewportGuard(root) {
  'use strict';
  const doc = root.document;
  if (!doc || typeof doc.addEventListener !== 'function') return;

  // Preserve native browser pinch-to-zoom for users who need magnification.

  const pointerMedia = typeof root.matchMedia === 'function'
    ? root.matchMedia('(hover: hover) and (pointer: fine)')
    : null;
  function isUnsupportedDesktop() {
    const width = Math.max(0, Number(root.screen && root.screen.width) || 0);
    const touchPoints = Number(root.navigator && root.navigator.maxTouchPoints || 0);
    return width >= 960 && Boolean(pointerMedia && pointerMedia.matches) && touchPoints === 0;
  }

  const gate = doc.getElementById && doc.getElementById('pw-screen-limit');
  const shell = doc.querySelector && doc.querySelector('.app-shell');
  const tabbar = doc.querySelector && doc.querySelector('.mobile-tabbar');
  function setInert(element, inert) {
    if (!element) return;
    element.inert = inert;
    if (inert) element.setAttribute && element.setAttribute('inert', '');
    else element.removeAttribute && element.removeAttribute('inert');
  }
  function updateDesktopAccess() {
    const wasBlocked = Boolean(doc.documentElement && doc.documentElement.classList && doc.documentElement.classList.contains('pw-screen-restricted'));
    const blocked = isUnsupportedDesktop();
    if (gate) gate.hidden = !blocked;
    if (doc.documentElement && doc.documentElement.classList) {
      doc.documentElement.classList.toggle('pw-screen-restricted', blocked);
    }
    setInert(shell, blocked);
    setInert(tabbar, blocked);
    if (blocked) {
      if (doc.querySelectorAll) {
        doc.querySelectorAll('dialog[open]').forEach(dialog => { try { dialog.close(); } catch (_) {} });
      }
      if (!wasBlocked && gate && typeof gate.focus === 'function') {
        gate.focus({ preventScroll: true });
      }
    }
  }

  updateDesktopAccess();
  if (pointerMedia) {
    if (typeof pointerMedia.addEventListener === 'function') pointerMedia.addEventListener('change', updateDesktopAccess);
    else if (typeof pointerMedia.addListener === 'function') pointerMedia.addListener(updateDesktopAccess);
  }
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('resize', updateDesktopAccess, { passive: true });
    root.addEventListener('orientationchange', updateDesktopAccess, { passive: true });
  }

  // UI friction only. Context-menu suppression is not a security boundary.
  // Check the profile at interaction time so hybrid/touch devices stay usable.
  doc.addEventListener('contextmenu', event => {
    if (isUnsupportedDesktop()) event.preventDefault();
  }, { capture: true });
})(typeof window !== 'undefined' ? window : globalThis);
