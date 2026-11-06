/* Aruvi rolling-glyph word animation. The completion signal is emitted only
   after every character's actual CSS roll animation has ended. Offline-safe. */
(function () {
  'use strict';
  var boot = document.getElementById('pocketwise-boot-splash');
  var word = document.getElementById('pw-splash-wordmark');
  var GLYPHS = '0123456789₹$€£%+=−×÷';
  var TEXT = 'Aruvi';
  var FIRST_DELAY_MS = 200;
  var STAGGER_MS = 75;
  var done = false;
  var handleAnimationEnd = null;

  window.__pwSplashAnimationDone = false;

  function finish() {
    if (done) return;
    done = true;
    if (word && handleAnimationEnd) word.removeEventListener('animationend', handleAnimationEnd);
    if (word) {
      word.querySelectorAll('.pw-roll').forEach(function (roll) {
        roll.style.animation = 'none';
        roll.style.transform = 'translateY(calc(var(--pw-count)*var(--pw-row)*-1))';
        roll.style.color = 'var(--pw-money-green)';
      });
      word.querySelectorAll('.pw-char').forEach(function (character) {
        character.style.opacity = '1';
      });
    }
    window.__pwSplashAnimationDone = true;
    window.dispatchEvent(new Event('pocketwise:splash-animation-finished'));
  }

  if (!boot || !word) { finish(); return; }

  function build() {
    word.textContent = '';
    var fragment = document.createDocumentFragment();
    TEXT.split('').forEach(function (character, index) {
      var count = 6 + index;
      var delay = (FIRST_DELAY_MS + index * STAGGER_MS) / 1000;
      var column = document.createElement('span');
      column.className = 'pw-char';
      column.setAttribute('data-count', String(count));
      column.style.setProperty('--pw-count', String(count));
      column.style.setProperty('--pw-delay', delay.toFixed(3) + 's');

      var finalGlyph = document.createElement('span');
      finalGlyph.className = 'pw-final';
      finalGlyph.textContent = character;
      column.appendChild(finalGlyph);

      var roll = document.createElement('span');
      roll.className = 'pw-roll';
      for (var row = 0; row < count; row += 1) {
        var glyph = document.createElement('i');
        glyph.textContent = GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
        roll.appendChild(glyph);
      }
      var settled = document.createElement('i');
      settled.textContent = character;
      roll.appendChild(settled);
      column.appendChild(roll);
      fragment.appendChild(column);
    });
    word.appendChild(fragment);
  }

  function play() {
    var reducedMotion = false;
    try {
      reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {}

    function startAnimation() {
      build();
      if (reducedMotion) { finish(); return; }

      var rolls = Array.prototype.slice.call(word.querySelectorAll('.pw-roll'));
      if (!rolls.length) { finish(); return; }
      var completed = new Set();

      handleAnimationEnd = function (event) {
        if (event.animationName !== 'pwRoll' || !rolls.includes(event.target)) return;
        completed.add(event.target);
        // The app may be shown only after every letter has reached its final glyph.
        if (completed.size === rolls.length) finish();
      };
      word.addEventListener('animationend', handleAnimationEnd);

      // Force style calculation after registering the listener. If the browser
      // doesn't apply the roll animation, settle the word visibly before opening.
      var rollAnimationsAvailable = rolls.every(function (roll) {
        var names = window.getComputedStyle(roll).animationName || '';
        return names.split(',').some(function (name) { return name.trim() === 'pwRoll'; });
      });
      if (!rollAnimationsAvailable) finish();
    }

    if (reducedMotion) { startAnimation(); return; }

    // Wait for the requested bold face when possible. Offline or blocked
    // font requests fall back to the local stack after 700ms, without hanging.
    var fontReady = (document.fonts && document.fonts.load)
      ? Promise.race([
          document.fonts.load('700 1em "Bricolage Grotesque"').catch(function () {}),
          new Promise(function (resolve) { window.setTimeout(resolve, 700); })
        ])
      : Promise.resolve();
    fontReady.then(startAnimation, startAnimation);
  }

  play();
})();
