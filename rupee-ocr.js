/*
 * Aruvi Rupee Symbol OCR
 * A local visual glyph detector that repairs dropped U+20B9 symbols only when the
 * screenshot itself contains a strong rupee-shaped match. No uploads or OCR APIs.
 */
(function (root) {
  'use strict';

  var RUPEE = '\u20B9';
  var TW = 32, TH = 40, cachedTemplates = null;
  var FONTS = ['Arial', 'system-ui', 'Roboto', 'sans-serif', 'serif'];

  function makeTemplates() {
    if (cachedTemplates) return cachedTemplates;
    if (!root.document || !root.document.createElement) return [];
    var canvas = root.document.createElement('canvas');
    canvas.width = TW; canvas.height = TH;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    var templates = [], seen = Object.create(null);
    ['400', '700'].forEach(function (weight) {
      FONTS.forEach(function (family) {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, TW, TH);
        ctx.fillStyle = '#000'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = weight + ' 42px "' + family.replace(/"/g, '') + '", sans-serif';
        var metrics = ctx.measureText(RUPEE);
        var ascent = metrics.actualBoundingBoxAscent || 32;
        var descent = metrics.actualBoundingBoxDescent || 4;
        var visualHeight = Math.max(1, ascent + descent);
        ctx.fillText(RUPEE, (TW - metrics.width) / 2, (TH - visualHeight) / 2 + ascent);
        var pixels = ctx.getImageData(0, 0, TW, TH).data;
        var mask = new Uint8Array(TW * TH), ink = 0, signature = '';
        for (var i = 0, p = 0; i < pixels.length; i += 4, p++) {
          var l = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
          if (l < 225) { mask[p] = 1; ink++; }
          signature += mask[p] ? '1' : '0';
        }
        if (ink < 45 || ink > 850 || seen[signature]) return;
        seen[signature] = true;
        templates.push({ mask: mask, ink: ink });
      });
    });
    cachedTemplates = templates;
    return templates;
  }

  function readBox(item) {
    if (!item) return null;
    var points = item.poly || item.polygon || item.bboxPoints;
    var xs = [], ys = [];
    if (Array.isArray(points) && points.length) {
      if (Array.isArray(points[0])) {
        points.forEach(function (p) {
          if (p && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) {
            xs.push(Number(p[0])); ys.push(Number(p[1]));
          }
        });
      } else if (points.length >= 4) {
        for (var i = 0; i + 1 < points.length; i += 2) {
          if (Number.isFinite(Number(points[i])) && Number.isFinite(Number(points[i + 1]))) {
            xs.push(Number(points[i])); ys.push(Number(points[i + 1]));
          }
        }
      }
    }
    if (!xs.length && item.box) {
      var b = item.box;
      if (Array.isArray(b) && b.length >= 4) return { x0: +b[0], y0: +b[1], x1: +b[2], y1: +b[3] };
      if (typeof b === 'object') return { x0: +b.x0, y0: +b.y0, x1: +b.x1, y1: +b.y1 };
    }
    if (!xs.length && item.bbox && typeof item.bbox === 'object') {
      var bb = item.bbox;
      return { x0: +bb.x0, y0: +bb.y0, x1: +bb.x1, y1: +bb.y1 };
    }
    return xs.length ? {
      x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys),
      x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys)
    } : null;
  }

  function lumAt(gray, width, height, x, y) {
    x = Math.max(0, Math.min(width - 1, Math.floor(x)));
    y = Math.max(0, Math.min(height - 1, Math.floor(y)));
    return gray[y * width + x];
  }

  function median(values) {
    if (!values.length) return 255;
    values.sort(function (a, b) { return a - b; });
    return values[Math.floor(values.length / 2)];
  }

  function comparePatch(data, iw, ih, x, y, pw, ph, template) {
    if (x < 0 || y < 0 || x + pw > iw || y + ph > ih) return 0;
    var edges = [];
    for (var xx = 2; xx < TW - 2; xx += 5) {
      edges.push(lumAt(data, iw, ih, x + xx * pw / TW, y + 1.5 * ph / TH));
      edges.push(lumAt(data, iw, ih, x + xx * pw / TW, y + (TH - 1.5) * ph / TH));
    }
    for (var yy = 4; yy < TH - 4; yy += 5) {
      edges.push(lumAt(data, iw, ih, x + 1.5 * pw / TW, y + yy * ph / TH));
      edges.push(lumAt(data, iw, ih, x + (TW - 1.5) * pw / TW, y + yy * ph / TH));
    }
    var bg = median(edges), darkInk = bg >= 128, threshold = darkInk ? bg - 22 : bg + 22;
    var actual = 0, overlap = 0;
    for (var py = 0, p = 0; py < TH; py++) {
      for (var px = 0; px < TW; px++, p++) {
        var l = lumAt(data, iw, ih, x + (px + 0.5) * pw / TW, y + (py + 0.5) * ph / TH);
        var ink = darkInk ? l < threshold : l > threshold;
        if (ink) { actual++; if (template.mask[p]) overlap++; }
      }
    }
    if (actual < 35 || actual > 900) return 0;
    return 2 * overlap / (template.ink + actual);
  }

  function findAmount(text) {
    var re = /(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?/g, m;
    while ((m = re.exec(String(text || '')))) {
      var digits = m[0].replace(/\D/g, '').length;
      // No arbitrary 9/10 digit OCR ceiling. Unsafe numeric precision is rejected later
      // by the structured receipt parser, never silently truncated here.
      if (digits >= 1 || /(?:₹|Rs\.?|INR|amount|total|paid|spent|debited|credited|received)/i.test(text)) {
        return { value: m[0], index: m.index };
      }
    }
    return null;
  }
  function amountKey(text) {
    var found = findAmount(text);
    if (!found) return '';
    var value = Number(String(found.value).replace(/,/g, ''));
    return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
  }

  function shouldInspect(text) {
    if (!text || !findAmount(text)) return false;
    // A line where PaddleOCR retained ₹ is useful geometry when another OCR pass drops it.
    // The visual check below still verifies the actual glyph pixels.
    if (text.indexOf(RUPEE) >= 0) return true;
    if (/\b(?:RRN|UTR|UPI\s*ref(?:erence)?|transaction\s*ID|txn\s*ID|account(?:\s*(?:no|number|ending))?|IFSC|OTP|phone|mobile)\b/i.test(text) &&
        !/\b(?:amount|total|paid|spent|debited|credited|received|sent|payment)\b/i.test(text)) return false;
    return true;
  }

  function bestMatch(data, iw, ih, box, text, templates) {
    var amount = findAmount(text), h = box.y1 - box.y0, lineWidth = box.x1 - box.x0;
    if (!amount || !Number.isFinite(h) || !Number.isFinite(lineWidth) || h < 9 || lineWidth < 8) return 0;
    var ph = Math.max(16, h * 1.04), pw = ph * TW / TH;
    if (pw >= iw || ph >= ih) return 0;
    var anchorX = box.x0 + amount.index / Math.max(1, text.length) * lineWidth;
    var x0 = Math.max(0, anchorX - h * 1.03);
    var x1 = Math.min(iw - pw, anchorX + h * 0.12);
    var y0 = Math.max(0, box.y0 - h * 0.08);
    var y1 = Math.min(ih - ph, box.y0 + h * 0.08);
    var sx = Math.max(1, h * 0.11), sy = Math.max(1, h * 0.10), best = 0;
    for (var y = y0; y <= y1 + 0.5; y += sy) {
      for (var x = x0; x <= x1 + 0.5; x += sx) {
        for (var i = 0; i < templates.length; i++) {
          var score = comparePatch(data, iw, ih, x, y, pw, ph, templates[i]);
          if (score > best) best = score;
        }
      }
    }
    return best;
  }

  function insertSymbol(line, amount) {
    if (!line || line.indexOf(RUPEE) >= 0) return line;
    var before = line.slice(0, amount.index);
    var prefix = /^\s*(?:Rs\.?|INR|R|₨|\$)\s*$/i;
    if (prefix.test(before)) return before.replace(prefix, RUPEE + ' ') + line.slice(amount.index);
    return before + RUPEE + ' ' + line.slice(amount.index);
  }

  function norm(value) { return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  function recover(options) {
    options = options || {};
    var text = String(options.text || '');
    var unchanged = { text: text, detected: 0, matches: [], engine: 'Aruvi Rupee Glyph Detector' };
    var image = options.image, items = Array.isArray(options.items) ? options.items : [];
    if (!image || typeof image.getContext !== 'function' || !items.length || !text) return unchanged;
    var ctx = image.getContext('2d', { willReadFrequently: true });
    var iw = Number(image.width) || 0, ih = Number(image.height) || 0;
    if (!ctx || !iw || !ih) return unchanged;
    var rgba;
    try { rgba = ctx.getImageData(0, 0, iw, ih).data; } catch (_) { return unchanged; }
    // Cache a single luminance plane for this scan; repeated RGBA conversion inside every
    // sliding template comparison is needlessly expensive on phones.
    var data = new Uint8Array(iw * ih);
    for (var pixel = 0, source = 0; pixel < data.length; pixel++, source += 4) {
      data[pixel] = Math.round(rgba[source] * 0.299 + rgba[source + 1] * 0.587 + rgba[source + 2] * 0.114);
    }
    var templates = makeTemplates();
    if (!templates.length) return unchanged;
    var lines = text.split(/\r?\n/), used = Object.create(null), matches = [];
    items.forEach(function (item, itemIndex) {
      var itemText = String(item && item.text || '').trim();
      if (!shouldInspect(itemText)) return;
      var li = -1;
      if (lines[itemIndex] && norm(lines[itemIndex]) === norm(itemText) && !used[itemIndex]) li = itemIndex;
      else {
        for (var j = 0; j < lines.length; j++) {
          if (!used[j] && norm(lines[j]) === norm(itemText)) { li = j; break; }
        }
      }
      var itemAmountKey = amountKey(itemText);
      // OCR engines may format the same amount differently. Match by a unique numeric
      // amount only when an exact text-line match was not available; keep recognized text
      // intact while using PaddleOCR geometry as a visual hint.
      if (li < 0 && itemAmountKey) {
        var amountMatches = [];
        for (var k = 0; k < lines.length; k++) {
          if (used[k] || lines[k].indexOf(RUPEE) >= 0) continue;
          if (amountKey(lines[k]) === itemAmountKey) amountMatches.push(k);
        }
        if (amountMatches.length === 1) li = amountMatches[0];
      }
      if (li < 0 || lines[li].indexOf(RUPEE) >= 0) return;
      var box = readBox(item), amount = findAmount(lines[li]);
      if (!box || !amount) return;
      var score = bestMatch(data, iw, ih, box, itemText, templates);
      if (score < 0.58) return;
      var currentLine = lines[li];
      // Paddle may recognise the first ₹ glyph as the digit 2. Only when the actual
      // leading pixels match a rendered ₹ template do we consume that one OCR character.
      // This is a local, geometry-backed correction; ordinary amount digits are untouched.
      if (amount.index === 0 && /^2/.test(currentLine)) {
        var afterFalseSymbol = currentLine.slice(1).replace(/^[,\s]+/, '');
        var remainder = findAmount(afterFalseSymbol);
        if (remainder && remainder.index === 0 && /\d/.test(afterFalseSymbol)) {
          lines[li] = '₹ ' + afterFalseSymbol;
          matches.push({ lineIndex: li, confidence: Math.round(score * 1000) / 1000, correction: 'leading-2-visually-verified-as-rupee' });
          used[li] = true;
          return;
        }
      }
      lines[li] = insertSymbol(currentLine, amount);
      used[li] = true;
      matches.push({ lineIndex: li, confidence: Math.round(score * 1000) / 1000, correction: 'rupee-symbol-restored' });
    });
    if (!matches.length) return unchanged;
    return { text: lines.join('\n'), detected: matches.length, matches: matches, engine: 'Aruvi Rupee Glyph Detector' };
  }

  root.PocketWiseRupeeOCR = Object.freeze({ version: '1.0.0', recover: recover });
}(typeof window !== 'undefined' ? window : this));
