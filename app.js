/* Aruvi: local-first personal finance PWA prototype. */
(() => {
  'use strict';
  (() => {
    const link = document.querySelector('link[href*="bootstrap-icons"]');
    if (!link || !document.fonts || typeof document.fonts.load !== 'function') return;
    const markWhenFontIsReady = async () => {
      try {
        const loadedFaces = await document.fonts.load('16px "bootstrap-icons"');
        const faceIsLoaded = loadedFaces.some(face => face && face.status === 'loaded');
        if (faceIsLoaded && document.fonts.check('16px "bootstrap-icons"')) {
          document.documentElement.classList.add('bi-loaded');
        }
      } catch (_) {
        // Keep the SVG fallbacks visible when the CDN or its font file is unavailable.
      }
    };
    if (link.sheet) void markWhenFontIsReady();
    else link.addEventListener('load', () => { void markWhenFontIsReady(); }, { once: true });
    link.addEventListener('error', () => document.documentElement.classList.remove('bi-loaded'), { once: true });
  })();
  const isAndroid = /Android/i.test(navigator.userAgent || '') || /Android/i.test(navigator.userAgentData?.platform || '');
  document.documentElement.classList.toggle('is-android', isAndroid);

  // Track the last interaction modality so touch browsers that classify a tapped
  // tabindex/role=button as :focus-visible don't leave a blue focus box behind.
  // Keyboard navigation still gets a visible focus ring for accessibility.
  const setPointerModality = () => { document.documentElement.dataset.inputModality = 'pointer'; };
  const setKeyboardModality = event => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Tab' || event.key.startsWith('Arrow') || ['Enter', ' ', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      document.documentElement.dataset.inputModality = 'keyboard';
    }
  };
  document.addEventListener('pointerdown', setPointerModality, { capture: true, passive: true });
  document.addEventListener('touchstart', setPointerModality, { capture: true, passive: true });
  document.addEventListener('mousedown', setPointerModality, true);
  document.addEventListener('keydown', setKeyboardModality, true);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const finance = window.PocketWiseAnalytics || null;
  const money = n => {
    const value = Number.isFinite(Number(n)) ? Number(n) : 0;
    const fractional = Math.abs(value % 1) > 0.0000001;
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: fractional ? 2 : 0, minimumFractionDigits: fractional ? 2 : 0 }).format(value);
  };
  const parseAmount = value => {
    // Accept plain digits, standard Western/Indian thousands grouping, and an optional currency prefix.
    // Do not strip arbitrary punctuation/whitespace: doing so silently changed malformed input like 1,2,3 into 123.
    const raw = String(value ?? '').trim().replace(/^(?:₹|INR\s*|Rs\.?\s*)/i, '').trim();
    const validNumber = /^(?:(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{0,2})?|\.\d{1,2})$/;
    if (!raw || !validNumber.test(raw)) return NaN;
    const valueNumber = Number(raw.replace(/,/g, ''));
    return Number.isFinite(valueNumber) ? Math.round((valueNumber + Number.EPSILON) * 100) / 100 : NaN;
  };
  // Financial arithmetic is accumulated in paise, not binary floating-point rupees.
  // Keep the persisted public shape in rupees for backward compatibility.
  const toMinorUnits = value => {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Math.sign(n) * Number.EPSILON) * 100);
  };
  const fromMinorUnits = value => Number((value / 100).toFixed(2));
  const addMoney = (...values) => fromMinorUnits(values.reduce((sum, value) => sum + toMinorUnits(value), 0));
  const sumMoney = values => fromMinorUnits(values.reduce((sum, value) => sum + toMinorUnits(value), 0));
  const uid = prefix => `${prefix || 'id'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const localDate = (date = new Date()) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const dayStart = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const dateFrom = value => value ? new Date(`${value}T12:00:00`) : new Date();
  const addCalendarInterval = (value, repeat, anchorDay = null) => {
    const d = dateFrom(value);
    if (repeat === 'weekly') d.setDate(d.getDate()+7);
    else if (repeat === 'monthly') {
      const day=Math.min(31,Math.max(1,Number(anchorDay)||d.getDate())); d.setDate(1); d.setMonth(d.getMonth()+1);
      d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));
    } else if (repeat === 'yearly' || repeat === 'year') {
      // Keep the original anniversary day through non-leap years. A Feb 29
      // reminder should fall on Feb 28 in common years and return to Feb 29
      // in the next leap year instead of permanently drifting to the 28th.
      const month=d.getMonth(), day=Math.min(31,Math.max(1,Number(anchorDay)||d.getDate()));
      const year=d.getFullYear()+1;
      const lastDay=new Date(year,month+1,0).getDate();
      d.setFullYear(year,month,Math.min(day,lastDay));
    }
    return localDate(d);
  };
  const niceDate = value => dateFrom(value).toLocaleDateString(undefined, { day:'numeric', month:'short', year: new Date().getFullYear() === dateFrom(value).getFullYear() ? undefined : 'numeric' });
  const currentMonth = () => localDate().slice(0,7);
  const monthStart = (offset = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset); return localDate(d); };
  const monthEnd = (offset = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+offset+1); d.setDate(0); return localDate(d); };
  const inRange = (date, start, end) => date >= start && date <= end;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const icons = {
    plus:'<path d="M12 4v16M4 12h16"/>',
    coffee:'<path d="M4 8h12v7a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z"/><path d="M16 10h2a2 2 0 1 1 0 4h-2M7 4c0 1 1 1 1 2M11 4c0 1 1 1 1 2"/>',
    bus:'<path d="M5 16V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M4 16h16l-2 4h-2l-1-2H9l-1 2H6Z"/><path d="M5 9h14M7 13h.01M17 13h.01"/>',
    shopping:'<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>' ,
    cosmetics:'<path d="m14 3 7 7-3 3-7-7 3-3Z"/><path d="m11 6 7 7M4 20l7-7 3 3-7 7H4v-3Z"/><path d="m8 16 3 3"/',
    book:'<path d="M4 4a3 3 0 0 1 3-2h13v18H7a3 3 0 0 1-3-3V4Z"/><path d="M4 17a3 3 0 0 1 3-3h13M9 6h7"/>',
    phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M11 18h2"/>',
    food:'<path d="M4 3v8m-2-8v5a2 2 0 0 0 4 0V3M4 11v10M14 3v18M14 3c4 2 5 5 5 8h-5"/>',
    health:'<path d="M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11Z"/><path d="M8 12h8M12 8v8"/>',
    gift:'<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M2 6h20v4H2zM12 6v15M12 6H8a2 2 0 1 1 2-2l2 2Zm0 0h4a2 2 0 1 0-2-2l-2 2Z"/>',
    game:'<path d="M7 8h10a4 4 0 0 1 4 4l1 5a2 2 0 0 1-3 2l-4-3H9l-4 3a2 2 0 0 1-3-2l1-5a4 4 0 0 1 4-4Z"/><path d="M8 11v4m-2-2h4m6-1h.01M18 14h.01"/>',
    more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    dollar:'<path d="M12 2v20M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6"/>',
    wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 8V5a2 2 0 0 1 2-2h13M16 13h5M17 13h.01"/>',
    people:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/>',
    tag:'<path d="m3 3 8 0 10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/>',
    transfer:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4 4-4-4 4-4"/>',
    income:'<path d="M7 17 17 7M7 7h10v10"/>',
    expense:'<path d="M7 7 17 17M17 8v9H8"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    bell:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    edit:'<path d="m4 16-.8 4.8L8 20l11.6-11.6a2.1 2.1 0 0 0-3-3L5 17"/><path d="m14.5 6.5 3 3"/>',
    trash:'<path d="M3 6h18M8 6V3h8v3m3 0-1 15H6L5 6m4 4v7m6-7v7"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
    chart:'<path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    goal:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    file:'<path d="M5 3h9l5 5v13H5Z M14 3v5h5M8 16l3-3 2 2 3-4"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 18v3h16v-3"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 18v3h16v-3"/>',
    clipboard:'<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M8 10h8m-8 4h8m-8 4h5"/>',
    moon:'<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkle:'<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/>',
    receipt:'<path d="M5 3 7 4.5 9 3l3 1.5L15 3l2 1.5L19 3v18l-2-1.5L15 21l-3-1.5L9 21l-2-1.5L5 21Z M8 8h8M8 12h8M8 16h5"/>',
    archive:'<path d="M3 4h18v4H3zM5 8v12h14V8M9 12h6"/>',
    note:'<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8"/>',
    sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
    swap:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4 4-4-4 4-4"/>'
  };
  const extraIcons = {
    airplane:'<path d="M2 16l8-4-5-8 2-1 8 7 5-1a2 2 0 0 1 1 4l-6 2-3 6-2 0 1-7-7 3Z"/>',
    bank:'<path d="m3 9 9-6 9 6M4 10h16M5 10v9m4-9v9m6-9v9m4-9v9M3 21h18"/>',
    bicycle:'<circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="m5 17 4-8h4l4 8m-6-8 3 8H8m2-8-2-3H5"/>',
    briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
    building:'<path d="M4 21V4l8-2v19M12 8h8v13M2 21h20M7 7h2m-2 4h2m-2 4h2m8-3h2m-2 4h2"/>',
    camera:'<path d="M3 8h4l2-3h6l2 3h4v12H3Z"/><circle cx="12" cy="14" r="4"/>',
    car:'<path d="m5 11 2-5h10l2 5 2 2v5h-3v-2H6v2H3v-5Z"/><path d="M5 11h14M6 14h.01M18 14h.01"/>',
    cash:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5 9h.01M19 15h.01"/>',
    creditcard:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20M6 15h4"/>',
    fuel:'<path d="M5 21V4h10v17M3 21h14M7 8h6M15 9h3l2 3v5a2 2 0 0 1-4 0v-3"/>',
    home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    laptop:'<rect x="5" y="3" width="14" height="13" rx="1"/><path d="M2 19h20l-2 2H4Z"/>',
    lightbulb:'<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 .7-1 2-1 2H9s0-1.3-1-2Z"/>',
    music:'<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    plant:'<path d="M12 21v-9M12 13C3 13 3 6 3 6s7-1 9 7M12 10c0-7 8-7 8-7s1 7-8 10"/>',
    piggybank:'<path d="M4 12a7 7 0 0 1 7-6h4l2 2h3v6h-3l-2 3h-3v4H9v-4a7 7 0 0 1-5-5Z"/><path d="M8 9h.01M3 12H1M18 8l2-2"/>',
    pin:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    rocket:'<path d="M5 14c-2 0-3 2-3 5 3 0 5-1 5-3M8 16l-1-5 7-8c3-1 5 0 5 0s1 2 0 5l-8 7-3-1Z"/><path d="m12 8 4 4"/>',
    school:'<path d="m2 9 10-6 10 6-10 6Z M6 12v5c4 3 8 3 12 0v-5M22 9v6"/>',
    store:'<path d="M4 10v11h16V10M3 10l2-7h14l2 7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 21v-6h6v6"/>',
    train:'<rect x="5" y="2" width="14" height="17" rx="3"/><path d="M5 12h14M9 6h.01M15 6h.01M8 22l2-3m6 3-2-3"/>',
    television:'<rect x="2" y="4" width="20" height="14" rx="2"/><path d="m8 22 4-4 4 4"/>',
    umbrella:'<path d="M3 12a9 9 0 0 1 18 0H3ZM12 12v7a2 2 0 0 0 4 0"/>',
    wifi:'<path d="M2 8a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0m-11 4a5 5 0 0 1 8 0m-4 4h.01"/>',
    tools:'<path d="m14 7 3-3 3 3-3 3M4 20l8-8m-3-6a5 5 0 0 0 6 6l-9 9-4-4 9-9a5 5 0 0 1-6-6l3 3 3-3Z"/>',
    ticket:'<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Z"/><path d="M13 7v2m0 3v2m0 3v1"/>',
    medicine:'<path d="M8 4a5 5 0 0 0-7 7l12 12a5 5 0 0 0 7-7Z"/><path d="m7 7 10 10"/>',
    paw:'<circle cx="6" cy="8" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="18" cy="8" r="2"/><path d="M4 17c0-3 4-6 8-6s8 3 8 6-4 4-8 4-8-1-8-4Z"/>',
    palette:'<path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 1.5-4.5 1.5 1.5 0 0 1 1-2.5H19a2 2 0 0 0 2-2 9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="10" cy="6.5" r=".8"/>',
    laundry:'<path d="M4 3h16v18H4Z M8 7h.01M12 7h.01M8 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/>',
    cloud:'<path d="M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-1 4.5 4.5 0 0 1 0 9Z"/><path d="M12 11v7m-3-3 3 3 3-3"/>',
    shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
    tickets:'<path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4Z"/><path d="M12 7v10"/>',
    box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4Z M3 7l9 4 9-4M12 11v10"/>',
    child:'<circle cx="12" cy="5" r="3"/><path d="M12 8v7m-5-4 5 2 5-2M8 21l4-6 4 6"/>',
    charity:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M7 12h10m-5-5v10"/>',
  };
  const svgIcon = name => `<svg class="icon-fallback" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || extraIcons[name] || icons.more}</svg>`;
  const biNames={plus:'plus-lg',coffee:'cup-hot',food:'fork-knife',bus:'bus-front',shopping:'bag',cosmetics:'brush',book:'book',phone:'phone',health:'heart-pulse',gift:'gift',game:'controller',more:'three-dots',dollar:'currency-rupee',wallet:'wallet2',people:'people',tag:'tag',transfer:'arrow-left-right',income:'arrow-up-right',expense:'arrow-down-left',calendar:'calendar3',bell:'bell',search:'search',edit:'pencil',trash:'trash3',check:'check-lg',info:'info-circle',chart:'bar-chart-line',heart:'heart-pulse',mic:'mic',close:'x-lg',arrow:'arrow-right',goal:'bullseye',file:'file-earmark-bar-graph',download:'download',upload:'upload',clipboard:'clipboard',moon:'moon-stars',sun:'sun',shield:'shield-check',lock:'lock',clock:'clock',sparkle:'stars',receipt:'receipt',archive:'archive',note:'journal-text',sliders:'sliders',swap:'arrow-left-right',airplane:'airplane',bank:'bank',bicycle:'bicycle',briefcase:'briefcase',building:'building',camera:'camera',car:'car-front',cash:'cash-coin',creditcard:'credit-card',fuel:'fuel-pump',home:'house-door',laptop:'laptop',lightbulb:'lightbulb',music:'music-note-beamed',plant:'flower1',piggybank:'piggy-bank',pin:'geo-alt',rocket:'rocket',school:'mortarboard',store:'shop',train:'train-front',television:'tv',umbrella:'umbrella',wifi:'wifi',tools:'tools',ticket:'ticket-perforated',medicine:'capsule',paw:'paw',palette:'palette',laundry:'washer',cloud:'cloud-sun',tickets:'ticket-perforated',box:'box-seam',child:'person-standing',charity:'hand-thumbs-up'};
  const icon = (name, cls = '') => `<span class="icon-wrap ${cls}"><i class="bi bi-${biNames[name]||name}" aria-hidden="true"></i>${svgIcon(name)}</span>`;
  const activityIconChoices = [
    ['coffee','Food & drink'],['food','Restaurant / meal'],['shopping','Shopping'],['bus','Bus / transit'],['car','Car / taxi'],['bicycle','Cycling'],['train','Train'],['airplane','Flights / travel'],['fuel','Fuel'],['home','Home / rent'],['building','Building / office'],['bank','Banking'],['wallet','Savings / wallet'],['cash','Cash'],['creditcard','Cards / payments'],['receipt','Bills / receipts'],['phone','Phone / digital'],['wifi','Internet'],['laptop','Computer / software'],['camera','Photography'],['music','Music'],['television','TV / streaming'],['game','Games'],['book','Books / learning'],['school','Education'],['briefcase','Work'],['dollar','Income / money'],['gift','Gifts'],['people','People'],['child','Childcare'],['paw','Pets'],['health','Health'],['medicine','Medicine'],['plant','Plants / garden'],['lightbulb','Home supplies'],['tools','Repairs / tools'],['ticket','Events / tickets'],['umbrella','Insurance / protection'],['piggybank','Investing'],['palette','Creative / hobbies'],['laundry','Laundry'],['cloud','Cloud / online services'],['charity','Charity'],['rocket','Projects'],['pin','Location / travel'],['box','Delivery / parcels'],['tag','Other tag'],['more','Miscellaneous']
  ];
  function activityIconOptions(selected='tag') { return activityIconChoices.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join(''); }
  const activityDefaults = [
    {id:'groceries',name:'Groceries',icon:'shopping',kind:'expense',freq:0},{id:'bills-rent',name:'Bills & rent',icon:'receipt',kind:'expense',freq:0},{id:'savings-investing',name:'Savings & investing',icon:'wallet',kind:'both',freq:0},{id:'food',name:'Food & drinks',icon:'coffee',kind:'expense',freq:0},{id:'transport',name:'Transport',icon:'bus',kind:'expense',freq:0},{id:'shopping',name:'Shopping',icon:'shopping',kind:'expense',freq:0},{id:'cosmetics',name:'Cosmetics',icon:'cosmetics',kind:'expense',freq:0},{id:'education',name:'Education',icon:'book',kind:'expense',freq:0},{id:'subscriptions',name:'Subscriptions',icon:'phone',kind:'expense',freq:0},{id:'health',name:'Health',icon:'health',kind:'expense',freq:0},{id:'entertainment',name:'Entertainment',icon:'game',kind:'expense',freq:0},{id:'gifts',name:'Gifts',icon:'gift',kind:'expense',freq:0},{id:'salary',name:'Salary / allowance',icon:'wallet',kind:'income',freq:0},{id:'freelance',name:'Side income',icon:'dollar',kind:'income',freq:0},{id:'refunds',name:'Refund',icon:'receipt',kind:'refund',freq:0},{id:'other',name:'Other',icon:'more',kind:'both',freq:0}
  ];
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate()-n); return localDate(d); };
  const initialState = () => ({
    version:2, sample:false,
    settings:{theme:'light',gradientPreset:'coral-wave',liquidGlass:false,smartUI:false,homeRecentEnabled:true,dailyStory:true,interactionFeedback:{enabled:false,haptics:true,sounds:true,soundStyle:'soft'},shakeQuickEntryEnabled:false,dailyStoryPreferenceSet:false,profileName:'',profileColor:'mint',profileComplete:false,privacyReviewed:false,firstRunFlowStarted:false,firstRunFlowCompleted:false,hideBalances:false,alertThreshold:90,notifyBudget:true,notifyPositive:true,notifyBills:true,notifyDebts:true,notifyWeekly:true,quietStart:'21:00',quietEnd:'08:00',lastBackup:null,lastPositiveMonth:null,seenAlerts:[],notifications:[],categoryChart:'doughnut',weeklyAllowance:0,debtPayoffMonthly:0,debtStrategy:'snowball',smartRules:[],merchantRules:[],salaryPlan:{expectedSalary:0,frequency:'monthly',paydayDay:1,paydayDate:null,allocations:[]}},
    accounts:[{id:'cash',name:'Cash',type:'cash',openingBalance:0,openingBalanceDate:null},{id:'bank',name:'Bank / UPI',type:'bank',openingBalance:0,openingBalanceDate:null},{id:'card',name:'Card',type:'card',openingBalance:0,openingBalanceDate:null}],
    activities: activityDefaults.map(a=>({...a})),
    budgets:{total:0,categories:{},note:''}, goals:[], reminders:[], pendingRecurringEntries:[], debts:[], transactions:[], billSplits:[], eventPlans:[], shoppingItems:[],
    forecasting:{version:3,labels:{},lastForecast:null,grades:[],backtest:null,selections:{},calibration:{},teacher:null}
  });
  let state = initialState();
  let db = null;
  let currentPage = 'home';
  let hiddenAmounts = false;
  let currentFilter = 'all';
  let activityAdvancedFilters = {accountId:'',categoryId:'',tag:'',min:'',max:''};
  let currentYearFilter = null;
  let currentEditId = null;
  let currentTxType = 'expense';
  let mixView = 'doughnut';
  let chartFrame = null;
  let installedPrompt = null;
  let forecastMonthOffset = 0;
  let forecastingClient = null;
  let forecastingRequestKey = '';
  let forecastingBacktestKey = '';
  let forecastingBacktestRunning = false;
  let forecastingTeacherRunning = false;
  let dailyStoryTimer = null;
  let financeAnchor = today();
  let shoppingListOpen = false;

  const STORE_KEY = 'pocketwise-state-v1';
  const RECOVERY_KEY = 'pocketwise-recovery-v1';
  let recoverySnapshot = null;
  function openDB(){
    return new Promise(resolve => {
      if (!('indexedDB' in window)) return resolve(null);
      try {
        const req = indexedDB.open('PocketwiseDB', 2);
        req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('app')) d.createObjectStore('app'); if (!d.objectStoreNames.contains('receipts')) d.createObjectStore('receipts'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  async function dbLoad(){
    if(!db) return null;
    return new Promise(resolve=>{try{const req=db.transaction('app','readonly').objectStore('app').get(STORE_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);}catch{resolve(null)}});
  }
  async function persistMutation(snapshot, fallbackMessage='Could not save this change. Your previous records were restored.') {
    try { await persist(); return true; }
    catch (error) {
      state = JSON.parse(snapshot);
      try { renderAll(); } catch (renderError) { console.error('Aruvi rollback render failed.', renderError); }
      console.error('Aruvi could not persist a state mutation; previous state restored.', error);
      toast(error.message || fallbackMessage, 'error');
      return false;
    }
  }
  async function persist(){
    // Write both stores where possible. Most importantly, never report a save
    // as successful just because an IndexedDB request failed without throwing.
    state.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(state);
    let indexedSaved = false, localSaved = false, indexedError = null, localError = null;
    if (db) {
      try {
        await new Promise((resolve, reject) => {
          let tx;
          try {
            tx = db.transaction('app', 'readwrite');
            tx.objectStore('app').put(state, STORE_KEY);
          } catch (error) { reject(error); return; }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
          tx.onabort = () => reject(tx.error || new Error('IndexedDB write was cancelled'));
        });
        indexedSaved = true;
      } catch (error) {
        indexedError = error;
        try { db.close(); } catch {}
        db = null;
        console.error('Aruvi IndexedDB save failed; falling back to browser storage.', error);
      }
    }
    try { localStorage.setItem(STORE_KEY, serialized); localSaved = true; }
    catch (error) { localError = error; console.error('Aruvi localStorage save failed.', error); }
    if (!indexedSaved && !localSaved) {
      const error = new Error('Aruvi could not save this record. Export a backup, check available browser storage, and try again.');
      error.cause = indexedError || localError;
      throw error;
    }
    return { indexedDB: indexedSaved, localStorage: localSaved };
  }
  function validRecordId(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id);}
  function validStoredAmount(value){if(typeof value!=='number'&&typeof value!=='string')return false;if(typeof value==='string'&&!value.trim())return false;return Number.isFinite(Number(value))&&Number(value)>=0;}
  function validStoredDate(value){if(value===undefined||value===null)return true;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [year,month,day]=value.split('-').map(Number),date=new Date(year,month-1,day);return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day;}
  function isLoadableState(record){
    if(!record||typeof record!=='object'||Array.isArray(record)||!Array.isArray(record.transactions))return false;
    const recordKeys=['transactions','accounts','activities','debts','goals','reminders','pendingRecurringEntries','billSplits','eventPlans','shoppingItems'];
    for(const key of recordKeys){
      if(key!=='transactions'&&record[key]===undefined)continue;
      const list=record[key];
      if(!Array.isArray(list)||list.some(item=>!item||typeof item!=='object'||Array.isArray(item)||!validRecordId(item.id)))return false;
      const ids=list.map(item=>item.id);
      if(new Set(ids).size!==ids.length)return false;
    }
    if(record.settings!==undefined&&(!record.settings||typeof record.settings!=='object'||Array.isArray(record.settings)))return false;
    if(record.budgets!==undefined&&(!record.budgets||typeof record.budgets!=='object'||Array.isArray(record.budgets)))return false;
    if(record.settings?.smartRules!==undefined&&(!Array.isArray(record.settings.smartRules)||record.settings.smartRules.some(rule=>!rule||typeof rule!=='object'||Array.isArray(rule)||!validRecordId(rule.id))))return false;
    if(record.settings?.merchantRules!==undefined&&(!Array.isArray(record.settings.merchantRules)||record.settings.merchantRules.some(rule=>!rule||typeof rule!=='object'||Array.isArray(rule)||!validRecordId(rule.id))))return false;
    return record.transactions.every(tx=>validStoredAmount(tx.amount)&&validStoredDate(tx.date));
  }
  const BACKUP_COLLECTION_LIMITS={transactions:100000,accounts:500,activities:2000,debts:20000,goals:20000,reminders:20000,pendingRecurringEntries:50000,billSplits:20000,eventPlans:20000,shoppingItems:20000,smartRules:2000,seenAlerts:10000,notifications:10000,sentAlerts:10000};
  function hasSafeBackupShape(value,depth=0,key=''){
    if(depth>12)return false;
    if(value===null||typeof value==='boolean')return true;
    if(typeof value==='number')return Number.isFinite(value);
    if(typeof value==='string')return value.length<=5000;
    if(Array.isArray(value)){
      const limit=BACKUP_COLLECTION_LIMITS[key]??100000;
      if(value.length>limit)return false;
      return value.every(item=>hasSafeBackupShape(item,depth+1,''));
    }
    if(typeof value!=='object')return false;
    const keys=Object.keys(value);
    if(keys.length>2000||keys.some(k=>k.length>200||['__proto__','prototype','constructor'].includes(k)))return false;
    return keys.every(k=>hasSafeBackupShape(value[k],depth+1,k));
  }
  function isSafeBackupState(record){
    if(!isLoadableState(record)||!hasSafeBackupShape(record))return false;
    if(record.transactions.length>BACKUP_COLLECTION_LIMITS.transactions||record.accounts.length>BACKUP_COLLECTION_LIMITS.accounts||record.activities.length>BACKUP_COLLECTION_LIMITS.activities)return false;
    for(const key of ['debts','goals','reminders','pendingRecurringEntries','billSplits','eventPlans','shoppingItems'])if(record[key]!==undefined&&(!Array.isArray(record[key])||record[key].length>BACKUP_COLLECTION_LIMITS[key]))return false;
    if(record.settings){for(const key of ['smartRules','merchantRules','seenAlerts','notifications','sentAlerts'])if(record.settings[key]!==undefined&&(!Array.isArray(record.settings[key])||record.settings[key].length>BACKUP_COLLECTION_LIMITS[key]))return false;}
    return true;
  }
  function normalizeDailyStoryPreference(settings){
    const next={...(settings&&typeof settings==='object'&&!Array.isArray(settings)?settings:{})};
    // Before 2.4.7 the feature defaulted to off, so an unmarked false value may only be
    // the old default. Turn it on once; a toggle made in this release records an explicit choice.
    if(next.dailyStoryPreferenceSet!==true){next.dailyStory=true;next.dailyStoryPreferenceSet=false;}
    else next.dailyStory=next.dailyStory===true;
    return next;
  }
  function normalizeStateShape(record){
    const defaults=initialState(),source=record&&typeof record==='object'?record:{};
    const next={...defaults,...source};
    for(const key of ['transactions','accounts','activities','debts','goals','reminders','pendingRecurringEntries','billSplits','eventPlans','shoppingItems'])if(!Array.isArray(source[key]))next[key]=defaults[key];
    if(!next.accounts.length)next.accounts=defaults.accounts.map(a=>({...a}));
    if(!next.activities.length)next.activities=defaults.activities.map(a=>({...a}));
    next.settings=normalizeDailyStoryPreference({...defaults.settings,...(source.settings&&typeof source.settings==='object'&&!Array.isArray(source.settings)?source.settings:{})});
    const feedbackSource=next.settings.interactionFeedback&&typeof next.settings.interactionFeedback==='object'&&!Array.isArray(next.settings.interactionFeedback)?next.settings.interactionFeedback:{};
    next.settings.interactionFeedback={enabled:feedbackSource.enabled===true,haptics:feedbackSource.haptics!==false,sounds:feedbackSource.sounds!==false,soundStyle:['soft','glass','classic','minimal'].includes(feedbackSource.soundStyle)?feedbackSource.soundStyle:'soft'};
    next.settings.shakeQuickEntryEnabled=next.settings.shakeQuickEntryEnabled===true;
    next.settings.homeRecentEnabled=next.settings.homeRecentEnabled!==false;
    if(!['coral-wave','green-screen','retro-magic','on-fire'].includes(next.settings.gradientPreset))next.settings.gradientPreset='coral-wave';
    if(!['light','dark','system','gradient'].includes(next.settings.theme))next.settings.theme='light';
    for(const key of ['seenAlerts','notifications','sentAlerts','smartRules','merchantRules'])if(!Array.isArray(next.settings[key]))next.settings[key]=[];
    const salarySource=source.settings&&source.settings.salaryPlan&&typeof source.settings.salaryPlan==='object'&&!Array.isArray(source.settings.salaryPlan)?source.settings.salaryPlan:{};
    next.settings.salaryPlan={expectedSalary:Math.max(0,Number(salarySource.expectedSalary)||0),frequency:['monthly','fortnightly','weekly'].includes(salarySource.frequency)?salarySource.frequency:'monthly',paydayDay:Number.isFinite(Number(salarySource.paydayDay))?Number(salarySource.paydayDay):1,paydayDate:typeof salarySource.paydayDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(salarySource.paydayDate)?salarySource.paydayDate:null,allocations:Array.isArray(salarySource.allocations)?salarySource.allocations.filter(rule=>rule&&typeof rule==='object'&&!Array.isArray(rule)).slice(0,100):[]};
    next.budgets=source.budgets&&typeof source.budgets==='object'&&!Array.isArray(source.budgets)?{...defaults.budgets,...source.budgets}: {...defaults.budgets};
    if(!next.budgets.categories||typeof next.budgets.categories!=='object'||Array.isArray(next.budgets.categories))next.budgets.categories={};
    if(!Number.isFinite(Number(next.budgets.total)))next.budgets.total=0;
    const forecastSource=source.forecasting&&typeof source.forecasting==='object'&&!Array.isArray(source.forecasting)?source.forecasting:{};
    const labelsSource=forecastSource.labels&&typeof forecastSource.labels==='object'&&!Array.isArray(forecastSource.labels)?forecastSource.labels:{};
    const labels={};for(const [key,value] of Object.entries(labelsSource).slice(0,500)){if(typeof key==='string'&&key.length<=300&&value&&typeof value==='object'&&!Array.isArray(value)){const status=['auto','confirmed','rejected','muted'].includes(value.status)?value.status:'auto';labels[key]={status,amountMinor:Number.isFinite(Number(value.amountMinor))?Math.max(0,Math.round(Number(value.amountMinor))):undefined};}}
    const selectionSource=forecastSource.selections&&typeof forecastSource.selections==='object'&&!Array.isArray(forecastSource.selections)?forecastSource.selections:{};
    const selections={};for(const key of ['day_expense','day_income','week_expense','week_income','month_expense','month_income'])selections[key]=selectionSource[key]==='seasonalNaive'?'seasonalNaive':'equalWeight';
    const calibrationSource=forecastSource.calibration&&typeof forecastSource.calibration==='object'&&!Array.isArray(forecastSource.calibration)?forecastSource.calibration:{};
    const calibration={};for(const key of ['day_expense','day_income','week_expense','week_income','month_expense','month_income']){const value=calibrationSource[key];if(value&&typeof value==='object'&&!Array.isArray(value))calibration[key]={n:Math.max(0,Math.min(52,Number(value.n)||0)),scores:Array.isArray(value.scores)?value.scores.slice(-52).map(Number).filter(Number.isFinite):[],delta:Number.isFinite(Number(value.delta))?Number(value.delta):null,coverage:Number.isFinite(Number(value.coverage))?Number(value.coverage):null,source:'backtest'};}
    const teacherSource=forecastSource.teacher&&typeof forecastSource.teacher==='object'&&!Array.isArray(forecastSource.teacher)?forecastSource.teacher:null;
    const teacher=teacherSource?{
      version:3,
      initializedOn:typeof teacherSource.initializedOn==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(teacherSource.initializedOn)?teacherSource.initializedOn:null,
      lastOrigin:typeof teacherSource.lastOrigin==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(teacherSource.lastOrigin)?teacherSource.lastOrigin:null,
      forecasts:Array.isArray(teacherSource.forecasts)?teacherSource.forecasts.slice(-1800):[],
      grades:Array.isArray(teacherSource.grades)?teacherSource.grades.slice(-600):[],
      calibration:teacherSource.calibration&&typeof teacherSource.calibration==='object'&&!Array.isArray(teacherSource.calibration)?teacherSource.calibration:{},
      expertStats:teacherSource.expertStats&&typeof teacherSource.expertStats==='object'&&!Array.isArray(teacherSource.expertStats)?teacherSource.expertStats:{},
      streamPredictions:Array.isArray(teacherSource.streamPredictions)?teacherSource.streamPredictions.slice(-2400):[],
      streamStats:teacherSource.streamStats&&typeof teacherSource.streamStats==='object'&&!Array.isArray(teacherSource.streamStats)?teacherSource.streamStats:{},
      regimeEvents:Array.isArray(teacherSource.regimeEvents)?teacherSource.regimeEvents.slice(-36):[],
      circuitBreakers:teacherSource.circuitBreakers&&typeof teacherSource.circuitBreakers==='object'&&!Array.isArray(teacherSource.circuitBreakers)?teacherSource.circuitBreakers:{},
      points:Number.isFinite(Number(teacherSource.points))?Number(teacherSource.points):0,
      streak:Math.max(0,Number(teacherSource.streak)||0),
      longestStreak:Math.max(0,Number(teacherSource.longestStreak)||0),
      brain:teacherSource.brain&&typeof teacherSource.brain==='object'&&!Array.isArray(teacherSource.brain)?teacherSource.brain:{tier:'Learning',graded:0,skillVsNaive:null,coverage:null,coverageWilson:null,calibrationReady:false,points:0,streak:0}
    }:null;
    next.forecasting={version:3,labels,lastForecast:forecastSource.lastForecast&&typeof forecastSource.lastForecast==='object'&&!Array.isArray(forecastSource.lastForecast)?forecastSource.lastForecast:null,grades:Array.isArray(forecastSource.grades)?forecastSource.grades.slice(-250):[],backtest:forecastSource.backtest&&typeof forecastSource.backtest==='object'&&!Array.isArray(forecastSource.backtest)?forecastSource.backtest:null,selections,calibration,teacher};
    return next;
  }
  async function preserveRecoverySnapshot(snapshot){
    try{localStorage.setItem(RECOVERY_KEY,JSON.stringify(snapshot));}catch(error){console.warn('Could not write localStorage recovery copy.',error);}
    if(!db)return;
    try{await new Promise((resolve,reject)=>{const tx=db.transaction('app','readwrite');tx.objectStore('app').put(snapshot,RECOVERY_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Recovery copy write failed'));tx.onabort=()=>reject(tx.error||new Error('Recovery copy write aborted'));});}
    catch(error){console.warn('Could not write IndexedDB recovery copy.',error);}
  }
  function exportRecoverySnapshot(){
    if(!recoverySnapshot){toast('There is no storage recovery snapshot to export.','amber');return;}
    downloadBlob(`aruvi-storage-recovery-${today()}.json`,new Blob([JSON.stringify(recoverySnapshot,null,2)],{type:'application/json'}));
    toast('Storage recovery snapshot exported. Keep it private and do not overwrite your regular backup.');
  }
  let resetAdaptiveHeaderSurface=()=>{};
  let syncAdaptiveNavState=()=>{};
  function initAdaptiveHeaderSurface(){
    const scroller=$('.main-content');
    const header=$('.main-content > .topbar');
    const mobileNav=$('.mobile-tabbar');
    if(!scroller||!header||header.dataset.scrollSurfaceReady==='true')return;
    header.dataset.scrollSurfaceReady='true';

    // Follow deliberate scroll direction, not a position threshold alone.
    // Sub-pixel scroll updates are accumulated; a short reverse movement resets
    // the travel counter instead of making the header chatter between states.
    const collapseAt=56;
    const expandAt=20;
    const directionThreshold=14;
    const minimumDelta=1.25;
    const mobileQuery=window.matchMedia('(max-width: 720px)');
    const brand=header.querySelector('.mobile-brand');
    const date=header.querySelector('.page-heading .eyebrow');
    let collapsed=false;
    let lastScrollTop=Math.max(0,Number(scroller.scrollTop)||0);
    let pendingDelta=0;
    let direction=0;
    let directionTravel=0;
    header.setAttribute('data-header-state','expanded');
    if(brand)brand.setAttribute('aria-hidden','false');
    if(date)date.setAttribute('aria-hidden','false');

    const applyState=()=>{
      const isChanged=header.classList.contains('is-scrolled')!==collapsed;
      if(isChanged){
        header.classList.toggle('is-scrolled',collapsed);
        header.setAttribute('data-header-state',collapsed?'compact':'expanded');
        if(brand)brand.setAttribute('aria-hidden',collapsed?'true':'false');
        if(date)date.setAttribute('aria-hidden',collapsed?'true':'false');
      }
      syncAdaptiveNavState();
    };
    const resetDirectionTracking=scrollTop=>{
      lastScrollTop=scrollTop;
      pendingDelta=0;
      direction=0;
      directionTravel=0;
    };
    // Smart UI shares the header's direction state, so both surfaces react to
    // the same deliberate gesture instead of running competing scroll timers.
    // Classic navigation is never altered by this controller.
    // During the capsule width transition, the active grid cell changes width
    // continuously. Observe the nav rail so the inner selection stays centred
    // on the active button at every frame instead of jumping only at the end.
    let navResizeObserver=null;
    if(mobileNav&&typeof ResizeObserver==='function'){
      navResizeObserver=new ResizeObserver(()=>{
        if(mobileNav.classList.contains('is-geometry-animating')&&document.documentElement.dataset.smartUi==='on')syncSmartNavIndicator(false);
      });
      navResizeObserver.observe(mobileNav);
    }
    syncAdaptiveNavState=()=>{
      if(!mobileNav)return;
      const shouldCollapse=mobileQuery.matches&&document.documentElement.dataset.smartUi==='on'&&collapsed;
      const wasCollapsed=mobileNav.classList.contains('is-scroll-collapsed');
      const reducedMotion=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if(wasCollapsed!==shouldCollapse){
        mobileNav.classList.toggle('is-geometry-animating',!reducedMotion);
        mobileNav.classList.toggle('is-scroll-collapsed',shouldCollapse);
      }
      mobileNav.dataset.scrollState=shouldCollapse?'compact':'expanded';
      if(wasCollapsed!==shouldCollapse&&document.documentElement.dataset.smartUi==='on'&&(!navResizeObserver||reducedMotion))syncSmartNavIndicator(false);
    };
    mobileNav?.addEventListener?.('transitionend',event=>{
      if(event.target===mobileNav&&event.propertyName==='width'){
        mobileNav.classList.remove('is-geometry-animating');
        if(document.documentElement.dataset.smartUi==='on')syncSmartNavIndicator(false);
      }
    });
    const update=()=>{
      const scrollTop=Math.max(0,Number(scroller.scrollTop)||0);
      if(!mobileQuery.matches){
        collapsed=false;
        resetDirectionTracking(scrollTop);
        applyState();
        return;
      }

      pendingDelta+=scrollTop-lastScrollTop;
      lastScrollTop=scrollTop;

      // Always restore the full header close to the top, even after a short flick.
      if(scrollTop<=expandAt){
        collapsed=false;
        resetDirectionTracking(scrollTop);
        applyState();
        return;
      }

      // Accumulate tiny deltas so slow, deliberate finger movement still counts.
      if(Math.abs(pendingDelta)<minimumDelta)return;
      const movement=pendingDelta;
      pendingDelta=0;
      const nextDirection=movement>0?1:-1;
      if(nextDirection!==direction){
        direction=nextDirection;
        directionTravel=0;
      }
      directionTravel+=Math.abs(movement);

      if(!collapsed&&nextDirection===1&&scrollTop>=collapseAt&&directionTravel>=directionThreshold){
        collapsed=true;
        directionTravel=0;
      }else if(collapsed&&nextDirection===-1&&directionTravel>=directionThreshold){
        collapsed=false;
        directionTravel=0;
      }
      applyState();
    };
    resetAdaptiveHeaderSurface=()=>{
      collapsed=false;
      resetDirectionTracking(Math.max(0,Number(scroller.scrollTop)||0));
      if(header.classList.contains('is-scrolled'))header.classList.remove('is-scrolled');
      header.setAttribute('data-header-state','expanded');
      if(brand)brand.setAttribute('aria-hidden','false');
      if(date)date.setAttribute('aria-hidden','false');
      syncAdaptiveNavState();
    };
    const onViewportChange=()=>{
      if(!mobileQuery.matches)resetAdaptiveHeaderSurface();
      else resetDirectionTracking(Math.max(0,Number(scroller.scrollTop)||0));
      syncAdaptiveNavState();
    };

    scroller.addEventListener('scroll',update,{passive:true});
    window.addEventListener('resize',onViewportChange,{passive:true});
    if(typeof mobileQuery.addEventListener==='function')mobileQuery.addEventListener('change',onViewportChange);
    else if(typeof mobileQuery.addListener==='function')mobileQuery.addListener(onViewportChange);
    onViewportChange();
  }
  async function initialise(){
    try { localStorage.removeItem('pocketwise-sync-v1'); } catch {}
    db=await openDB();
    const indexedRaw=await dbLoad();
    let localRaw=null,localSaved=null;
    try{localRaw=localStorage.getItem(STORE_KEY);localSaved=localRaw?JSON.parse(localRaw):null;}catch{try{localRaw=localStorage.getItem(STORE_KEY);}catch{localRaw=null}localSaved=null;}
    const indexedValid=isLoadableState(indexedRaw),localValid=isLoadableState(localSaved);
    const stamp = record => { const n = Date.parse(record?.updatedAt || ''); return Number.isFinite(n) ? n : 0; };
    let saved = indexedValid&&localValid?(stamp(localSaved)>stamp(indexedRaw)?localSaved:indexedRaw):(indexedValid?indexedRaw:localValid?localSaved:null);
    const invalidIndexed=indexedRaw!==null&&!indexedValid;
    const invalidLocal=localRaw!==null&&!localValid;
    const isFreshInstall=!saved;
    if(invalidIndexed||invalidLocal){
      recoverySnapshot={format:'pocketwise-storage-recovery',version:1,capturedAt:new Date().toISOString(),reason:saved?'A malformed storage copy was found; Aruvi loaded the other valid copy when available.':'Neither primary storage copy could be safely loaded. A fresh workspace will open; the original data is preserved in this snapshot.',indexedDB:invalidIndexed?indexedRaw:undefined,localStorageRaw:invalidLocal?localRaw:undefined};
      await preserveRecoverySnapshot(recoverySnapshot);
    }
    if(saved){
      state=normalizeStateShape(saved);
      // Earlier builds shipped with fabricated demo finances. Remove those once, so users start clean.
      if(saved.sample===true){
        const fresh=initialState();
        state={...fresh,settings:{...fresh.settings,theme:saved.settings?.theme||'light',gradientPreset:saved.settings?.gradientPreset||'coral-wave',liquidGlass:!!saved.settings?.liquidGlass,smartUI:!!saved.settings?.smartUI,hideBalances:!!saved.settings?.hideBalances,shakeQuickEntryEnabled:saved.settings?.shakeQuickEntryEnabled===true}};
      }
      state.sample=false;
      // Add newly shipped categories to existing local data without changing transactions or user categories.
      const known=new Set((state.activities||[]).map(a=>a.id));
      activityDefaults.forEach(a=>{if(!known.has(a.id))state.activities.push({...a});});
    } else if(isFreshInstall) {
      // Persist the first-run marker before leaving the startup path, so a reload
      // between profile setup and privacy acknowledgement resumes the right step.
      state.settings.firstRunFlowStarted=true;
      state.settings.firstRunFlowCompleted=false;
    }
    try{const shakePreference=localStorage.getItem('aruvi-shake-quick-entry-v1');if(shakePreference==='1'||shakePreference==='0')state.settings.shakeQuickEntryEnabled=shakePreference==='1';}catch(_){}
    try { await processDueRecurringEntries(false); await persist(); } catch (error) { console.error(error); toast(error.message || 'Could not prepare local storage. Export backups before continuing.', 'error'); }
    if(recoverySnapshot)toast('A storage recovery copy was preserved. Open Settings → Your data to export it before clearing site data.','amber');
    applyTheme();
    bindEvents();
    syncShakeMotion();
    updateDateHeader();
    renderAll();
    scheduleDailyStoryRefresh();
    setTimeout(()=>{void processForecastTeacher((state.transactions||[]).map(tx=>({...tx})),state.forecasting?.labels||{},today());},0);
    await evaluateBudgetAlerts(false);
    renderProfile();
    initAdaptiveHeaderSurface();
    if(state.settings.firstRunFlowStarted&&!state.settings.firstRunFlowCompleted&&window.PocketwiseFirstRun){
      window.PocketwiseFirstRun.start({
        profileComplete:!!state.settings.profileComplete,
        privacyReviewed:!!state.settings.privacyReviewed,
        profileName:state.settings.profileName||'',
        profileColor:state.settings.profileColor||'mint',
        saveProfile:async({name,color})=>{
          const safeName=String(name||'').trim().slice(0,48);
          if(!safeName)return false;
          const snapshot=JSON.stringify(state);
          state.settings.profileName=safeName;
          state.settings.profileColor=profileColors[color]?color:'mint';
          state.settings.profileComplete=true;
          if(!(await persistMutation(snapshot,'Could not save your profile. Your previous settings were restored.')))return false;
          renderProfile();
          return true;
        },
        acceptPrivacy:async()=>{
          const snapshot=JSON.stringify(state);
          state.settings.privacyReviewed=true;
          state.settings.firstRunFlowCompleted=true;
          state.settings.firstRunFlowStarted=false;
          if(!(await persistMutation(snapshot,'Could not save the privacy acknowledgement. Your previous settings were restored.')))return false;
          applyTheme();
          return true;
        }
      });
    } else if(!state.settings.profileComplete) setTimeout(()=>showProfileForm(true),120);
    if(window.PocketWisePush?.isConfigured?.()&&window.PocketWisePush?.hasInstallation?.())syncBackgroundReminders();
  }
  const activityById = id => state.activities.find(a=>a.id===id) || {id:'other',name:'Other',icon:'more',kind:'both',freq:0};
  const accountById = id => state.accounts.find(a=>a.id===id) || state.accounts[0] || {id:'none',name:'No account',openingBalance:0};
  const debtById = id => state.debts.find(d=>d.id===id);
  const txActivity = tx => activityById(tx.activityId);
  const typeLabel = type => ({income:'Income',expense:'Expense',transfer:'Transfer',refund:'Refund',borrowed:'Borrowed',lent:'Lent',repay_out:'Repayment',repay_in:'Repayment received'}[type]||'Transaction');
  const txIsIncome = t => t.type==='income';
  const txIsExpense = t => t.type==='expense';
  const txIsDebt = t => ['borrowed','lent','repay_out','repay_in'].includes(t.type);
  const txCashDelta = t => { const n=Number(t.amount)||0; return ({income:n,refund:n,borrowed:n,lent:-n,repay_out:-n,repay_in:n,expense:-n}[t.type]||0); };
  function balanceForAccount(accountId){let a=accountById(accountId);if(a.openingBalanceDate&&a.openingBalanceDate>today())return 0;let total=toMinorUnits(a.openingBalance);state.transactions.forEach(t=>{if(a.openingBalanceDate&&t.date<a.openingBalanceDate)return;if(t.accountId===accountId)total+=toMinorUnits(txCashDelta(t));if(t.type==='transfer'&&t.accountId===accountId)total-=toMinorUnits(t.amount);if(t.type==='transfer'&&t.toAccountId===accountId)total+=toMinorUnits(t.amount);});return fromMinorUnits(total);}
  function totalBalance(){return sumMoney(state.accounts.map(a=>balanceForAccount(a.id)));}
  function debtPaid(debt){return sumMoney(state.transactions.filter(t=>t.debtId===debt.id&&((debt.direction==='borrowed'&&t.type==='repay_out')||(debt.direction==='lent'&&t.type==='repay_in'))).map(t=>t.amount));}
  function debtRemaining(debt){return Math.max(0,fromMinorUnits(toMinorUnits(debt.amount)-toMinorUnits(debtPaid(debt))));}
  function debtTotals(){let receivable=0,payable=0;state.debts.forEach(d=>{if(d.direction==='lent')receivable+=toMinorUnits(debtRemaining(d));else payable+=toMinorUnits(debtRemaining(d));});return {receivable:fromMinorUnits(receivable),payable:fromMinorUnits(payable)};}
  function getPeriodRange(period){const today=localDate();if(period==='all')return ['0000-01-01','9999-12-31'];if(period==='year')return [`${today.slice(0,4)}-01-01`,`${today.slice(0,4)}-12-31`];if(period==='last-month')return [monthStart(-1),monthEnd(-1)];return [monthStart(0),monthEnd(0)];}
  function periodTransactions(period='month'){const [start,end]=getPeriodRange(period);return state.transactions.filter(t=>inRange(t.date||today(),start,end));}
  function today(){return localDate();}
  function totalsFor(txs){let income=0,expenses=0,refunds=0;txs.forEach(t=>{const amount=toMinorUnits(t.amount);if(t.type==='income')income+=amount;else if(t.type==='expense')expenses+=amount;else if(t.type==='refund')refunds+=amount;});return {income:fromMinorUnits(income),expenses:fromMinorUnits(Math.max(0,expenses-refunds)),grossExpenses:fromMinorUnits(expenses),refunds:fromMinorUnits(refunds),net:fromMinorUnits(income-expenses+refunds)};}
  function spentForMonth(){return totalsFor(periodTransactions('month')).expenses;}
  function budgetAmount(){return Math.max(0,Number(state.budgets.total)||0);}
  function safeToSpend(){const upcoming=sumMoney(state.reminders.filter(r=>r.active&&r.date>=today()&&r.date<=monthEnd()).map(r=>r.amount));const balance=totalBalance(),budget=budgetAmount();const planned=budget>0?Math.min(balance,Math.max(0,addMoney(budget,-spentForMonth()))):balance;return Math.max(0,addMoney(planned,-upcoming));}
  function fmtHidden(v){return hiddenAmounts||state.settings.hideBalances?'••••••':money(v);}
  function fmtSmall(n){n=Number(n)||0;if(Math.abs(n)>=100000)return `₹${(n/100000).toFixed(1)}L`;if(Math.abs(n)>=1000)return `₹${(n/1000).toFixed(1)}k`;return `₹${Math.round(n)}`;}
  // Interaction feedback is opt-in. Web Audio is created/resumed only from a
  // user gesture; unsupported haptics fail silently and never block an action.
  function interactionFeedbackPrefs(){
    const value=state?.settings?.interactionFeedback;
    return value&&typeof value==='object'?value:{enabled:false,haptics:true,sounds:true,soundStyle:'soft'};
  }
  function hasVibrationSupport(){return !isIOSShareContext()&&typeof navigator!=='undefined'&&typeof navigator.vibrate==='function';}
  function getAruviAudioContext(){
    const AudioCtx=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtx)return null;
    try{
      const context=window.__aruviAudioContext||(window.__aruviAudioContext=new AudioCtx());
      if(context.state==='suspended')context.resume().catch(()=>{});
      return context;
    }catch(_){return null;}
  }
  function playInteractionFeedback(kind='tap'){
    const prefs=interactionFeedbackPrefs();
    if(!prefs.enabled||document.hidden)return false;
    if(prefs.haptics&&hasVibrationSupport()){
      try{navigator.vibrate(kind==='success'?[10,24,12]:kind==='download'?[12,22,8]:8);}catch(_){}
    }
    if(!prefs.sounds)return true;
    const profiles={
      soft:{wave:'sine',notes:[740,988],gain:.018},
      glass:{wave:'sine',notes:[1046,1318],gain:.019},
      classic:{wave:'triangle',notes:[622,831],gain:.016},
      minimal:{wave:'sine',notes:[520,660],gain:.012}
    };
    const profile=profiles[prefs.soundStyle]||profiles.soft;
    const ctx=getAruviAudioContext();if(!ctx)return false;
    const sequences=kind==='download'?[profile.notes[0],profile.notes[1],profile.notes[1]*1.19]:kind==='success'?[profile.notes[0],profile.notes[1]]:[profile.notes[0]];
    try{
      const now=ctx.currentTime;
      sequences.forEach((frequency,index)=>{
        const start=now+index*(kind==='download'?.082:.105),duration=kind==='tap'?.045:.075;
        const oscillator=ctx.createOscillator(),gain=ctx.createGain();
        oscillator.type=profile.wave;oscillator.frequency.setValueAtTime(Math.min(1800,frequency),start);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(profile.gain,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start);oscillator.stop(start+duration+.012);
      });
      return true;
    }catch(_){return false;}
  }
  function transactionHaptic(){playInteractionFeedback('success');}

  // Shake-to-Quick-Entry is foreground-only and requires an explicit opt-in.
  // Two distinct acceleration peaks reduce accidental launches from normal movement.
  let shakeMotionAttached=false,shakePeaks=[],lastShakeTrigger=0,lastShakePointer=0,lastShakeVector=null;
  function detachShakeMotion(){if(!shakeMotionAttached)return;window.removeEventListener('devicemotion',handleShakeMotion);shakeMotionAttached=false;shakePeaks=[];lastShakeVector=null;}
  function attachShakeMotion(){
    if(shakeMotionAttached||!state.settings.shakeQuickEntryEnabled||document.hidden||!window.isSecureContext||!('DeviceMotionEvent'in window))return;
    window.addEventListener('devicemotion',handleShakeMotion,{passive:true});shakeMotionAttached=true;
  }
  function syncShakeMotion(){if(state.settings.shakeQuickEntryEnabled&&!document.hidden)attachShakeMotion();else detachShakeMotion();}
  function handleShakeMotion(event){
    if(!state.settings.shakeQuickEntryEnabled||document.hidden||Date.now()-lastShakePointer<900||Date.now()-lastShakeTrigger<1500)return;
    if(document.querySelector('dialog[open]'))return;
    const focused=document.activeElement;
    if(focused&&((focused.matches&&focused.matches('input,textarea,select'))||focused.isContentEditable))return;
    const acceleration=event.acceleration;
    let strength=0;
    if(acceleration&&[acceleration.x,acceleration.y,acceleration.z].every(value=>Number.isFinite(value))){
      strength=Math.hypot(acceleration.x,acceleration.y,acceleration.z);
    }
    // Some mobile browsers expose a zeroed linear-acceleration vector while
    // still providing useful gravity-inclusive samples. Compare consecutive
    // samples as a fallback rather than disabling shake detection on them.
    const sample=event.accelerationIncludingGravity;
    if(sample&&[sample.x,sample.y,sample.z].every(value=>Number.isFinite(value))){
      const vector={x:sample.x,y:sample.y,z:sample.z};
      if(lastShakeVector){
        const delta=Math.hypot(vector.x-lastShakeVector.x,vector.y-lastShakeVector.y,vector.z-lastShakeVector.z);
        strength=Math.max(strength,delta);
      }
      lastShakeVector=vector;
    }else lastShakeVector=null;
    if(strength<14.5)return;
    const now=performance.now();shakePeaks=shakePeaks.filter(time=>now-time<780);
    if(shakePeaks.length&&now-shakePeaks[shakePeaks.length-1]<130)return;
    shakePeaks.push(now);
    if(shakePeaks.length>=2){
      shakePeaks=[];lastShakeTrigger=Date.now();
      quickAddStart();toast('Shake detected. Review your Quick Entry before saving.');
    }
  }
  window.addEventListener('pointerdown',()=>{lastShakePointer=Date.now();},{capture:true,passive:true});
  let lastToastSignature='',lastToastAt=0;
  function toast(message, type='success'){
    const signature=`${type}:${String(message)}`;
    const now=Date.now();
    if(signature===lastToastSignature&&now-lastToastAt<2200)return;
    lastToastSignature=signature;lastToastAt=now;
    const region=$('#toast-region');
    // Keep the UI readable on small screens: replace stale notifications instead
    // of stacking identical or multiple long errors over the navigation.
    region.querySelectorAll('.toast').forEach(el=>el.remove());
    const el=document.createElement('div');el.className='toast';el.innerHTML=`${icon(type==='error'?'info':type==='amber'?'bell':'check')}<span>${escapeHTML(message)}</span>`;region.append(el);setTimeout(()=>el.remove(),3600);
  }
  function applyTheme(){
    const pref=state.settings.theme||'light';
    const preset=['coral-wave','green-screen','retro-magic','on-fire'].includes(state.settings.gradientPreset)?state.settings.gradientPreset:'coral-wave';
    const presetLabels={'coral-wave':'Coral Wave','green-screen':'Green Screen','retro-magic':'Retro Magic','on-fire':'On Fire'};
    const presetColors={'coral-wave':'#FBECE9','green-screen':'#EDF5E9','retro-magic':'#F2ECF8','on-fire':'#FBEFE4'};
    let actual=pref;
    if(pref==='system')actual=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
    const isGradient=pref==='gradient';
    const scheme=actual==='dark'?'dark':'light';
    const canvas=actual==='dark'?'#000000':isGradient?presetColors[preset]:'#f6f8f5';
    const themeColor=isGradient?presetColors[preset]:canvas;
    const root=document.documentElement;
    root.dataset.theme=actual;
    const topbar=$('.main-content > .topbar'),mobileBrand=topbar?.querySelector('.mobile-brand');
    if(mobileBrand)mobileBrand.setAttribute('aria-hidden',topbar.classList.contains('is-scrolled')?'true':'false');
    root.dataset.gradient=preset;
    root.dataset.liquidGlass=(isGradient||state.settings.liquidGlass)?'on':'off';
    root.dataset.smartUi=state.settings.smartUI?'on':'off';
    syncAdaptiveNavState();
    root.style.backgroundColor=canvas;
    root.style.colorScheme=scheme;
    try{localStorage.setItem('pocketwise-appearance-v1',JSON.stringify({theme:pref,gradientPreset:preset,liquidGlass:!!state.settings.liquidGlass,smartUI:!!state.settings.smartUI}));}catch(_){}
    const meta=$('meta[name="theme-color"]');if(meta)meta.content=themeColor;
    const appleStatus=$('meta[name="apple-mobile-web-app-status-bar-style"]');if(appleStatus)appleStatus.content=actual==='dark'?'black':'default';
    const label=$('#theme-label');if(label)label.textContent=isGradient?`${presetLabels[preset]} gradient`:pref==='system'?'System appearance':`${pref[0].toUpperCase()+pref.slice(1)} appearance`;
    const themeToggle=$('#theme-toggle');if(themeToggle)themeToggle.setAttribute('aria-label',`Switch appearance. Current: ${isGradient?`${presetLabels[preset]} gradient`:pref}`);
    $$('#theme-choice button').forEach(b=>{
      const selected=b.dataset.theme===pref;
      b.classList.toggle('selected',selected);
      b.setAttribute('aria-pressed',selected?'true':'false');
    });
    $$('#gradient-preset-picker [data-gradient-preset]').forEach(b=>{
      const selected=b.dataset.gradientPreset===preset;
      b.classList.toggle('selected',selected);
      b.setAttribute('aria-pressed',selected?'true':'false');
    });
    const picker=$('#gradient-preset-picker');if(picker)picker.hidden=!isGradient;
    const glassSetting=$('#liquid-glass-setting');
    if(glassSetting){glassSetting.checked=isGradient||!!state.settings.liquidGlass;glassSetting.disabled=isGradient;glassSetting.setAttribute('aria-label',isGradient?'Liquid Glass is always enabled for gradient themes':'Enable Liquid Glass');}
    const glassCopy=$('#liquid-glass-setting-copy');if(glassCopy)glassCopy.textContent=isGradient?'White glass surfaces are built into Gradient themes. Switch to Light or Dark to control this separately.':'Translucent surfaces. With Smart UI, the navigation pill also becomes glass-like.';
    if($('#hide-setting'))$('#hide-setting').checked=!!state.settings.hideBalances;
    if($('#smart-ui-setting'))$('#smart-ui-setting').checked=!!state.settings.smartUI;
    if($('#daily-story-setting'))$('#daily-story-setting').checked=!!state.settings.dailyStory;
    syncSmartNavIndicator(false);
    syncGlassSegmentIndicators();
  }
  // One animated material follows the selected control. The control states and their
  // data attributes remain the source of truth; this span is purely decorative.
  function syncGlassSegmentIndicators(root=document){
    const groupSelector='.type-switch, #activity-filters, #theme-choice';
    const groups=[];if(root.matches?.(groupSelector))groups.push(root);groups.push(...root.querySelectorAll(groupSelector));
    const glass=document.documentElement.dataset.liquidGlass==='on';
    groups.forEach(group=>{
      let indicator=group.querySelector(':scope > .glass-segment-indicator');
      if(!glass){if(indicator)indicator.remove();group.classList.remove('glass-segments-ready');delete group.dataset.glassIndicatorReady;return;}
      const target=group.querySelector('button.selected, button.active');
      if(!target){if(indicator)indicator.remove();return;}
      const isNew=!indicator;
      if(!indicator){indicator=document.createElement('span');indicator.className='glass-segment-indicator';indicator.setAttribute('aria-hidden','true');group.insertBefore(indicator,group.firstChild);group.classList.remove('glass-segments-ready');delete group.dataset.glassIndicatorReady;}
      const groupRect=group.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
      const x=targetRect.left-groupRect.left+group.scrollLeft-group.clientLeft;
      const y=targetRect.top-groupRect.top+group.scrollTop-group.clientTop;
      indicator.style.width=`${targetRect.width}px`;
      indicator.style.height=`${targetRect.height}px`;
      indicator.style.transform=`translate3d(${x}px,${y}px,0)`;
      if(isNew||!group.dataset.glassIndicatorReady){
        indicator.style.transition='none';
        requestAnimationFrame(()=>{if(!indicator.isConnected)return;indicator.style.removeProperty('transition');group.dataset.glassIndicatorReady='true';group.classList.add('glass-segments-ready');});
      }else group.classList.add('glass-segments-ready');
    });
  }
  // A single moving capsule follows the selected mobile destination. The buttons
  // remain the source of truth, so page routing and the central Quick Add action
  // keep their existing behavior.
  function syncSmartNavIndicator(animate=true){
    const nav=$('.mobile-tabbar'),indicator=$('.smart-nav-indicator');
    if(!nav||!indicator)return;
    if(!state.settings.smartUI){indicator.hidden=true;indicator.removeAttribute('data-positioned');return;}

    // currentPage is the navigation source of truth. Do not pick the first
    // element carrying .active: hidden/desktop navigation controls and rapid
    // route changes can briefly leave stale active classes in the document.
    const tabs=[...nav.querySelectorAll('.mobile-tab[data-page]')];
    const active=tabs.find(tab=>tab.dataset.page===currentPage);
    if(!active){indicator.hidden=true;indicator.removeAttribute('data-positioned');return;}

    // Keep the mobile tabs' active state aligned with the same route used to
    // position the capsule. Quick Add is deliberately not a destination.
    tabs.forEach(tab=>tab.classList.toggle('active',tab===active));

    const activeWidth=active.offsetWidth,activeHeight=active.offsetHeight;
    if(!activeWidth||!activeHeight||!nav.getBoundingClientRect().width){
      indicator.hidden=true;
      indicator.removeAttribute('data-positioned');
      return;
    }

    // Use layout coordinates local to the positioned nav rail. Comparing two
    // viewport rectangles while the rail itself is translated/width-animated
    // made the capsule chase a moving coordinate system on Android. The tab's
    // offset geometry is stable in the rail's own coordinate space.
    let x,y;
    if(active.offsetParent===nav){
      x=active.offsetLeft;
      y=active.offsetTop;
    }else{
      const navRect=nav.getBoundingClientRect(),activeRect=active.getBoundingClientRect();
      x=activeRect.left-navRect.left-nav.clientLeft;
      y=activeRect.top-navRect.top-nav.clientTop;
    }

    const firstPosition=!indicator.hasAttribute('data-positioned');
    const disableMotion=!animate||firstPosition;
    indicator.hidden=false;
    if(disableMotion)indicator.style.transition='none';
    indicator.style.width=`${activeWidth}px`;
    indicator.style.height=`${activeHeight}px`;
    indicator.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
    indicator.setAttribute('data-positioned','true');
    if(disableMotion)requestAnimationFrame(()=>{
      if(indicator.isConnected)indicator.style.removeProperty('transition');
    });
  }

  const profileColors={mint:'#2f8f67',ocean:'#3478c8',plum:'#8756b5',sunset:'#d46b43'};
  function renderProfile(){const name=String(state.settings.profileName||'').trim()||'Personal space';const initial=[...name][0]?.toLocaleUpperCase()||'P';const color=profileColors[state.settings.profileColor]||profileColors.mint;['#profile-avatar','#settings-profile-avatar'].forEach(sel=>{const el=$(sel);if(el){el.textContent=initial;el.style.background=color;el.style.color='#fff';}});const side=$('#profile-sidebar-name'),preview=$('#settings-profile-name');if(side)side.textContent=name;if(preview)preview.textContent=name;}
  function showProfileForm(firstRun=false){const name=String(state.settings.profileName||'');const color=state.settings.profileColor||'mint';const colors=[['mint','Mint','#2f8f67'],['ocean','Ocean','#3478c8'],['plum','Plum','#8756b5'],['sunset','Sunset','#d46b43']];openModal(firstRun?'Make Aruvi yours':'Edit your profile',`<form id="profile-form" class="modal-body"><p class="muted">Choose the name you want to see in the app. Your avatar uses its first letter.</p><div class="profile-preview-large"><span class="avatar" id="profile-form-avatar" style="background:${profileColors[color]||profileColors.mint}">${escapeHTML(([...name.trim()][0]||'P').toLocaleUpperCase())}</span><span id="profile-form-preview-name">${escapeHTML(name.trim()||'Your name')}</span></div><div class="form-field"><label for="profile-name-input">DISPLAY NAME</label><input id="profile-name-input" name="profileName" type="text" maxlength="48" autocomplete="nickname" placeholder="What should Aruvi call you?" value="${escapeHTML(name)}" required></div><div class="form-field"><label>AVATAR BACKGROUND</label><div class="profile-color-options" role="radiogroup" aria-label="Avatar background">${colors.map(([id,label,hex])=>`<label class="profile-color-option"><input type="radio" name="profileColor" value="${id}" ${color===id?'checked':''}><span style="--profile-color:${hex}"></span><small>${label}</small></label>`).join('')}</div></div><p class="fine-print">This is a local profile, not an account. No sign-in or server profile is created.</p><div class="form-actions">${firstRun?'':'<button class="secondary-button" type="button" data-cancel-modal>Cancel</button>'}<button class="primary-button" type="submit">${firstRun?'Save profile & continue':'Save profile'}</button></div></form>`,'PROFILE · STORED ON THIS DEVICE');}
  function showPrivacyPage(){
    const policy=window.PocketwisePrivacyPolicy?.markup?.()||'<p>Aruvi stores your records in this browser on this device. Export backups regularly and protect access to your device.</p>';
    openModal('Privacy & your data',`<div class="modal-body privacy-page-content"><div class="privacy-callout"><strong>Privacy notice · Updated 2 November 2026</strong><p>Review how Aruvi stores records locally, what optional network requests occur, and the controls available to you.</p></div><div class="pw-privacy-policy">${policy}</div><div class="form-actions"><button class="primary-button" type="button" id="privacy-done">I understand</button></div></div>`,'LOCAL-FIRST · STORED IN THIS BROWSER');
  }
  function updateDateHeader(){const now=new Date();const date=$('#date-eyebrow');if(date)date.textContent=now.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});}
  function setPage(page){if(!['home','activity','insights','settings'].includes(page))page='home';currentPage=page;const root=document.documentElement,previousScrollBehavior=root.style.scrollBehavior;root.style.scrollBehavior='auto';const scroller=$('.main-content');if(scroller)scroller.scrollTop=0;else window.scrollTo(0,0);resetAdaptiveHeaderSurface();$$('.page').forEach(p=>p.classList.toggle('active',p.dataset.pagePanel===page));$$('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));const heads={home:'Overview',activity:'Activity',insights:'Insights',settings:'Settings'};$('#page-title').textContent=heads[page];$('#page-title').parentElement.style.display='';try{renderPage(page);syncSmartNavIndicator();}finally{root.style.scrollBehavior=previousScrollBehavior;}}
  function applyHiddenAmounts(){document.body.classList.toggle('hide-amounts',hiddenAmounts||state.settings.hideBalances);$('#hide-balances').setAttribute('aria-label',(hiddenAmounts||state.settings.hideBalances)?'Show balances':'Hide balances');}
  // Compute the two outer-ring segments from this month's totals. In a loss
  // state the complete outer arc becomes red, so a large leftover grey section
  // cannot imply that income is winning. Empty months keep the neutral track.
  function outerArcLengths(incomeValue, expenseValue, netValue){
    const income=Math.max(0,Number(incomeValue)||0);
    const expenses=Math.max(0,Number(expenseValue)||0);
    const total=income+expenses;
    const isLoss=Number(netValue)<0;
    const availableArc=total>0?98:0;
    const incomeLen=!isLoss&&total>0?(income/total)*availableArc:0;
    const expenseLen=isLoss&&total>0?100:(total>0?(expenses/total)*availableArc:0);
    const expenseOffset=isLoss?0:(expenseLen>0.05?-(100-expenseLen):0);
    return {incomeLen,expenseLen,expenseOffset,isLoss,total};
  }

  function updateMoneyText(){
    const bal=totalBalance(),t=totalsFor(periodTransactions('month')),dt=debtTotals(),budget=budgetAmount(),spent=spentForMonth(),daysTotal=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate(),day=new Date().getDate(),daysLeft=daysTotal-day;
    $$('[data-money="balance"]').forEach(el=>el.textContent=fmtHidden(bal));$$('[data-money="income"]').forEach(el=>el.textContent=fmtHidden(t.income));$$('[data-money="expense"]').forEach(el=>el.textContent=fmtHidden(t.expenses));$$('[data-money="net"]').forEach(el=>el.textContent=fmtHidden(t.net));$$('[data-money="safe"]').forEach(el=>el.textContent=fmtHidden(safeToSpend()));$$('[data-money="receivable"]').forEach(el=>el.textContent=fmtHidden(dt.receivable));$$('[data-money="payable"]').forEach(el=>el.textContent=fmtHidden(dt.payable));
    const percent=budget?Math.min(spent/budget*100,100):0;$('#budget-progress').style.width=`${percent}%`;$('#budget-progress').style.background=budget&&spent>budget?'var(--red)':'var(--green)';$('#budget-percent').textContent=budget?`${Math.round(spent/budget*100)}% used`:'Set a limit';$('[data-money="budget"]').textContent=budget?fmtHidden(budget):'Not set';$('#budget-spent-text').textContent=budget?`${money(spent)} spent`:'Set a budget to begin';$('#budget-left-text').textContent=budget?`${money(Math.max(0,budget-spent))} left`:'';$('#days-left').textContent=daysLeft;$('#period-caption').textContent=`${day} of ${daysTotal} days elapsed`;const desktopPeriodCaption=$('#desktop-period-caption');if(desktopPeriodCaption)desktopPeriodCaption.textContent=`${daysLeft} days left · ${day} of ${daysTotal} days elapsed`;
    // Match the reference: income grows inward from the LEFT endpoint, while
    // spending grows inward from the RIGHT endpoint on the SAME semicircle.
    // A small neutral break separates the segments. Zero-length rounded SVG
    // dashes can look like dots, so hide empty segments completely.
    const arc=outerArcLengths(t.income,t.expenses,t.net);
    const {incomeLen,expenseLen,expenseOffset}=arc;
    const incomeArc=$('.arc-income'), expenseArc=$('.arc-expense');
    incomeArc.style.strokeDasharray=incomeLen>0.05?`${incomeLen} 100`:'0 100';
    incomeArc.style.strokeDashoffset='0';
    incomeArc.style.opacity=incomeLen>0.05?'1':'0';
    incomeArc.style.visibility=incomeLen>0.05?'visible':'hidden';
    expenseArc.style.strokeDasharray=expenseLen>0.05?`${expenseLen} 100`:'0 100';
    // A monthly loss uses a full 100-unit dash with zero offset, covering both
    // rounded endpoints and eliminating the grey gap seen in the loss state.
    expenseArc.style.strokeDashoffset=String(expenseOffset);
    expenseArc.style.opacity=expenseLen>0.05?'1':'0';
    expenseArc.style.visibility=expenseLen>0.05?'visible':'hidden';
    const elapsedPct=Math.max(0,Math.min(100,day/daysTotal*100));
    $('.days-progress').style.strokeDasharray=`${elapsedPct} 100`;
    const mobileProgress=$('.mobile-inner-progress');
    if(mobileProgress){mobileProgress.style.strokeDasharray=elapsedPct>0.05?`${elapsedPct} 100`:'0 100';mobileProgress.style.strokeDashoffset='0';}
    if(t.net<0) $$('[data-money="net"]').forEach(el=>el.style.color='var(--red)');else $$('[data-money="net"]').forEach(el=>el.style.color='var(--green)');
    $('#activity-count').textContent=state.transactions.length;
    renderBudgetCategoryPreview();
  }

  function fitLargeMoneyAmounts(root=document){
    const textSelectors='[data-money],.balance-number,.money-stats strong,.metric-card>strong,.goal-amount,.goal-insight-grid strong,.amount-positive,.amount-negative,.yearly-positive,.yearly-negative,.transaction-amount strong,.daily-story-transaction-amount';
    const inputSelectors='.amount-input,.quick-flow-value';
    const collect=selector=>[...(root.matches?.(selector)?[root]:[]),...(root.querySelectorAll?.(selector)||[])];
    collect(textSelectors).forEach(el=>{const raw=String(el.textContent||'');const value=Number(raw.replace(/[^0-9.\-]/g,''));el.classList.toggle('pw-large-money',Number.isFinite(value)&&Math.abs(value)>=100000);});
    collect(inputSelectors).forEach(el=>{const value=Number(String(el.value||'').replace(/[^0-9.\-]/g,''));el.classList.toggle('pw-large-money',Number.isFinite(value)&&Math.abs(value)>=100000);});
  }
  function renderAll(){updateMoneyText();renderRecent();renderDailyStory();renderAlerts();renderActivity();renderFrequent();renderInsights();renderSettingsSummary();applyHiddenAmounts();$('#sample-banner').hidden=!state.sample;scheduleCharts();fitLargeMoneyAmounts();syncSmartNavIndicator(false);}
  function renderBudgetCategoryPreview(){const target=$('#budget-category-list');if(!target)return;const limits=Object.entries(state.budgets.categories||{}).map(([id,limit])=>({id,activity:activityById(id),limit:Number(limit)||0,spent:spentForActivityThisMonth(id)})).filter(x=>x.activity&&x.limit>0).sort((a,b)=>(b.spent/b.limit)-(a.spent/a.limit)).slice(0,4);target.innerHTML=limits.length?`<div class="category-budget-heading">CATEGORY LIMITS <span>THIS MONTH</span></div>`+limits.map(x=>{const p=Math.min(100,x.spent/x.limit*100);return `<div class="category-budget-row"><div class="category-budget-row-top"><div class="row-between category-budget-row-values"><span>${escapeHTML(x.activity.name)}</span><small>${fmtHidden(x.spent)} / ${fmtHidden(x.limit)}</small></div><button type="button" class="category-budget-remove" data-remove-category-budget="${escapeHTML(x.id)}" aria-label="Remove ${escapeHTML(x.activity.name)} budget limit" title="Remove category limit"><span class="icon-wrap" aria-hidden="true"><i class="bi bi-x-lg"></i><svg class="icon-fallback" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></span></button></div><div class="progress-track"><span style="width:${p}%;background:${p>=100?'var(--red)':p>=(+state.settings.alertThreshold||90)?'var(--amber)':'var(--green)'}"></span></div></div>`}).join(''):`<div class="category-budget-empty">Set category limits to see what's on track.</div>`;syncBudgetResetButtons();}
  function syncBudgetResetButtons(){const monthly=$('#monthly-budget-reset'),weekly=$('#weekly-allowance-reset');if(monthly)monthly.disabled=!(Number(state.budgets?.total)>0||Object.values(state.budgets?.categories||{}).some(value=>Number(value)>0)||String(state.budgets?.note||'').trim());if(weekly)weekly.disabled=!(Number(state.settings?.weeklyAllowance)>0);}
  async function clearMonthlyBudget(){const categories=state.budgets?.categories||{};const hasBudget=Number(state.budgets?.total)>0||Object.values(categories).some(value=>Number(value)>0)||String(state.budgets?.note||'').trim();if(!hasBudget){toast('No monthly budget is set.');return;}if(!confirm('Remove the total monthly budget, all category limits, and the budget note? Transactions will not be deleted.'))return;const snapshot=JSON.stringify(state);state.budgets={...state.budgets,total:0,categories:{},note:''};if(!(await persistMutation(snapshot,'Could not remove the monthly budget. Your previous settings were restored.')))return;renderAll();void evaluateBudgetAlerts().catch(error=>console.warn('Budget alert refresh failed.',error));toast('Monthly budget and category limits removed. Transactions were kept.');}
  async function clearWeeklyAllowance(){if(!(Number(state.settings?.weeklyAllowance)>0)){toast('No weekly allowance is set.');return;}if(!confirm('Remove your weekly spending allowance? Your transactions will be kept.'))return;const snapshot=JSON.stringify(state);state.settings.weeklyAllowance=0;if(!(await persistMutation(snapshot,'Could not remove the weekly allowance. Your previous settings were restored.')))return;renderPlanningTools();syncBudgetResetButtons();toast('Weekly allowance removed. Transactions were kept.');}
  async function removeCategoryBudget(activityId){const id=String(activityId||'');if(!id||!Object.prototype.hasOwnProperty.call(state.budgets.categories||{},id)||!(Number(state.budgets.categories[id])>0)){toast('That category has no budget limit.');return;}const activity=activityById(id);const name=activity?.name||'this category';if(!confirm(`Remove the budget limit for ${name}? Transactions in this category will be kept.`))return;const snapshot=JSON.stringify(state);const categories={...(state.budgets.categories||{})};delete categories[id];state.budgets={...state.budgets,categories};if(!(await persistMutation(snapshot,'Could not remove this category limit. Your previous settings were restored.')))return;renderAll();void evaluateBudgetAlerts().catch(error=>console.warn('Budget alert refresh failed.',error));toast(`${name} budget limit removed. Transactions were kept.`);}

  function spentForActivityThisMonth(id){const amount=periodTransactions('month').filter(t=>t.activityId===id&&['expense','refund'].includes(t.type)).reduce((sum,t)=>sum+(t.type==='refund'?-1:1)*toMinorUnits(t.amount),0);return fromMinorUnits(Math.max(0,amount));}
  function renderPage(page){if(page==='home'){renderRecent();renderDailyStory();renderAlerts();updateMoneyText();scheduleCharts()}if(page==='activity'){renderActivity();renderFrequent()}if(page==='insights'){renderInsights();scheduleCharts()}if(page==='settings'){renderSettingsSummary()}fitLargeMoneyAmounts();}
  function createTxIcon(tx){const a=txActivity(tx);let name=a.icon||'receipt',color='';if(tx.type==='income'||tx.type==='repay_in'||tx.type==='refund'){color='positive';if(tx.type==='income')name='income';else if(tx.type==='refund')name='receipt';}else if(tx.type==='expense'||tx.type==='repay_out'){color='negative';if(tx.type==='expense')name=a.icon||'receipt';}else if(tx.type==='transfer'){color='blue';name='transfer';}else if(tx.type==='borrowed'||tx.type==='lent'){color='amber';name='people';}return `<span class="transaction-icon ${color}">${icon(name)}</span>`;}
  function previousLocalDate(){const d=new Date();d.setDate(d.getDate()-1);return localDate(d);}
  function dailyStoryDates(){
    const dates=[];
    const base=new Date();base.setHours(12,0,0,0);
    for(let offset=1;offset<=7;offset++){const d=new Date(base);d.setDate(d.getDate()-offset);dates.push(localDate(d));}
    return dates;
  }
  function storyBalanceDeltaMinor(tx,accountIds){
    if(!tx||!accountIds)return 0;
    const amount=toMinorUnits(tx.amount);
    if(tx.type==='transfer')return (accountIds.has(tx.toAccountId)?amount:0)-(accountIds.has(tx.accountId)?amount:0);
    return accountIds.has(tx.accountId)?toMinorUnits(txCashDelta(tx)):0;
  }
  function storyBalanceBefore(date){
    const accounts=state.accounts||[],accountIds=new Set(accounts.map(account=>account.id));
    let totalMinor=accounts.reduce((sum,account)=>sum+toMinorUnits(account.openingBalance),0);
    (state.transactions||[]).forEach(tx=>{if(tx&&String(tx.date||'')<date)totalMinor+=storyBalanceDeltaMinor(tx,accountIds);});
    return totalMinor;
  }
  function dailyStoryData(date=previousLocalDate()){
    const transactions=state.transactions.filter(tx=>tx&&tx.date===date).sort((a,b)=>String(b.createdAt||b.id||'').localeCompare(String(a.createdAt||a.id||'')));
    let incomeMinor=0,expenseMinor=0,refundMinor=0,dayBalanceDeltaMinor=0;
    const categoryMinor=new Map();
    const accountIds=new Set((state.accounts||[]).map(account=>account.id));
    const openingBalanceMinor=storyBalanceBefore(date);
    transactions.forEach(tx=>{
      const amount=toMinorUnits(tx.amount);
      dayBalanceDeltaMinor+=storyBalanceDeltaMinor(tx,accountIds);
      if(tx.type==='income')incomeMinor+=amount;
      else if(tx.type==='expense'){
        expenseMinor+=amount;
        const name=String(txActivity(tx).name||'Other');
        categoryMinor.set(name,(categoryMinor.get(name)||0)+amount);
      } else if(tx.type==='refund')refundMinor+=amount;
    });
    const categories=[...categoryMinor.entries()].map(([name,minor])=>({name,value:fromMinorUnits(minor)})).filter(item=>item.value>0).sort((a,b)=>b.value-a.value);
    const visibleCategories=categories.length>5?[...categories.slice(0,4),{id:'__others__',name:'Other categories',value:fromMinorUnits(categories.slice(4).reduce((sum,item)=>sum+toMinorUnits(item.value),0))}]:categories;
    return {date,transactions,income:fromMinorUnits(incomeMinor),expenses:fromMinorUnits(expenseMinor),refunds:fromMinorUnits(refundMinor),net:fromMinorUnits(incomeMinor-expenseMinor+refundMinor),categories:visibleCategories,openingBalance:fromMinorUnits(openingBalanceMinor),closingBalance:fromMinorUnits(openingBalanceMinor+dayBalanceDeltaMinor)};
  }
  function storyDateLabel(date){return dateFrom(date).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});}
  function storyBubbleDateLabel(date){return dateFrom(date).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
  function storyPieSVG(categories){
    categories=chartCategoryItems(categories,5);
    const total=categories.reduce((sum,item)=>sum+Math.max(0,Number(item.value)||0),0);
    if(total<=0)return '<svg class="daily-story-pie" viewBox="0 0 180 180" role="img" aria-label="No expense categories recorded"><circle cx="90" cy="90" r="76" fill="var(--surface-3)"/><circle cx="90" cy="90" r="54" fill="var(--surface)"/></svg>';
    if(categories.length===1)return `<svg class="daily-story-pie" viewBox="0 0 180 180" role="img" aria-label="Expense breakdown: ${escapeHTML(categories[0].name)} ${escapeHTML(fmtHidden(categories[0].value))}"><circle cx="90" cy="90" r="78" fill="${chartCategoryColor(categories[0],0)}"/></svg>`;
    let angle=-Math.PI/2;
    const paths=categories.map((item,index)=>{
      const value=Math.max(0,Number(item.value)||0);if(!value)return '';
      const sweep=value/total*Math.PI*2;const end=angle+sweep;
      const x1=90+78*Math.cos(angle),y1=90+78*Math.sin(angle),x2=90+78*Math.cos(end),y2=90+78*Math.sin(end);
      const large=sweep>Math.PI?1:0;
      const path=`M 90 90 L ${x1.toFixed(3)} ${y1.toFixed(3)} A 78 78 0 ${large} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
      angle=end;
      return `<path d="${path}" fill="${chartCategoryColor(item,index)}" stroke="var(--surface)" stroke-width="2"><title>${escapeHTML(item.name)}: ${escapeHTML(fmtHidden(item.value))}</title></path>`;
    }).join('');
    return `<svg class="daily-story-pie" viewBox="0 0 180 180" role="img" aria-label="Expense breakdown with ${categories.length} categories">${paths}</svg>`;
  }
  function dailyStoryTransactionHTML(tx){
    const activity=txActivity(tx);
    const title=tx.type==='transfer'?`Transfer · ${accountById(tx.accountId).name} to ${accountById(tx.toAccountId).name}`:tx.note||activity.name||typeLabel(tx.type);
    return `<div class="daily-story-transaction">${createTxIcon(tx)}<div class="daily-story-transaction-copy"><strong>${escapeHTML(title)}</strong><small>${escapeHTML([activity.name,typeLabel(tx.type)].filter(Boolean).join(' · '))}</small></div><strong class="daily-story-transaction-amount ${['income','refund','repay_in','borrowed'].includes(tx.type)?'amount-positive':''}" data-money>${txAmountText(tx)}</strong></div>`;
  }
  function renderDailyStory(){
    const region=$('#daily-story-region');if(!region)return;
    const enabled=!!state.settings.dailyStory;region.hidden=!enabled;
    if(!enabled)return;
    const list=$('#daily-story-list');if(!list)return;
    list.innerHTML=dailyStoryDates().map(date=>{
      const data=dailyStoryData(date),count=data.transactions.length;
      const dateLabel=storyBubbleDateLabel(date),spokenDate=storyDateLabel(date);
      const transactionLabel=count===1?'1 transaction':`${count} transactions`;
      const aria=`Open money story for ${spokenDate}. ${transactionLabel}. Income ${fmtHidden(data.income)}. Spent ${fmtHidden(data.expenses)}. Balance brought down ${fmtHidden(data.openingBalance)}. Balance carried down ${fmtHidden(data.closingBalance)}.`;
      const pie=storyPieSVG(data.categories).replace('class="daily-story-pie"','class="daily-story-pie daily-story-thumbnail-pie"');
      return `<div class="daily-story-list-item" role="listitem"><button class="daily-story-bubble ${count?'has-transactions':'is-quiet'}" type="button" data-story-date="${date}" aria-label="${escapeHTML(aria)}" aria-haspopup="dialog" title="${escapeHTML(spokenDate)}"><span class="daily-story-ring" aria-hidden="true"><span class="daily-story-ring-inner">${pie}</span></span><span class="daily-story-bubble-label">${escapeHTML(dateLabel)}</span></button></div>`;
    }).join('');
  }
  function openDailyStory(date=previousLocalDate()){
    const data=dailyStoryData(date),count=data.transactions.length;
    const dateLabel=storyDateLabel(data.date),topCategories=data.categories;
    const categoryLegend=topCategories.length?topCategories.map((item,index)=>`<div class="daily-story-legend-row"><span class="daily-story-legend-swatch" style="--story-swatch:${chartCategoryColor(item,index)}"></span><span>${escapeHTML(item.name)}</span><strong>${fmtHidden(item.value)}</strong></div>`).join(''):'<p class="daily-story-empty-note">No expenses to break down for this day.</p>';
    const txMarkup=count?data.transactions.slice(0,12).map(dailyStoryTransactionHTML).join(''):'<div class="daily-story-empty"><span class="daily-story-empty-icon">'+icon('wallet')+'</span><strong>A quiet day</strong><span>No transactions were recorded for this date.</span></div>';
    const extra=count>12?`<p class="daily-story-more">Showing 12 of ${count} transactions. Open Activity to see the full history.</p>`:'';
    const content=`<div class="modal-body daily-story-modal-body"><div class="daily-story-cover"><span class="daily-story-kicker">DAILY MONEY RECAP</span><h3>${escapeHTML(dateLabel)}</h3><p>${count?`${count} transaction${count===1?'':'s'} recorded on this day`:'A quiet day. No transactions were recorded.'}</p><section class="daily-story-chart-section" aria-labelledby="daily-story-chart-title"><div class="section-header"><div><span class="section-kicker">WHERE IT WENT</span><h3 id="daily-story-chart-title">Spending breakdown</h3></div><span class="muted tiny">Spent: ${fmtHidden(data.expenses)}</span></div><div class="daily-story-chart-layout">${storyPieSVG(topCategories)}<div class="daily-story-legend">${categoryLegend}</div></div></section><div class="daily-story-cover-metrics"><div><small>MONEY IN</small><strong>${fmtHidden(data.income)}</strong><span>Income recorded that day</span></div><div><small>MONEY OUT</small><strong>${fmtHidden(data.expenses)}</strong><span>Recorded spending</span></div></div></div><section class="daily-story-balances" aria-label="Start and end balances"><div><small>STARTED WITH · B/D</small><strong>${fmtHidden(data.openingBalance)}</strong><span>Balance brought down · Start of day</span></div><div><small>ENDED WITH · C/D</small><strong>${fmtHidden(data.closingBalance)}</strong><span>Balance carried down · End of day</span></div></section><div class="daily-story-cashflow"><div><small>Refunds received</small><strong>${fmtHidden(data.refunds)}</strong></div><div><small>Income minus spending</small><strong class="${data.net<0?'daily-story-negative':'daily-story-positive'}">${fmtHidden(data.net)}</strong></div></div><section class="daily-story-transactions"><div class="section-header"><div><span class="section-kicker">YOUR DAY</span><h3>Transactions</h3></div><span class="muted tiny">${count}</span></div><div class="daily-story-transaction-list">${txMarkup}</div>${extra}<div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Close story</button><button class="primary-button" type="button" data-story-view-activity>View activity</button></div></section></div>`;
    openModal(`Money story · ${dateLabel}`,content,'DAILY RECAP');
    $('#app-modal').classList.add('daily-story-dialog');
  }
  function scheduleDailyStoryRefresh(){
    if(dailyStoryTimer!==null)clearTimeout(dailyStoryTimer);
    const now=new Date(),nextMidnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,2);
    dailyStoryTimer=setTimeout(()=>{updateDateHeader();renderDailyStory();scheduleDailyStoryRefresh();},Math.max(1000,nextMidnight.getTime()-now.getTime()));
  }
  function txAmountText(tx){if(tx.type==='expense'||tx.type==='lent'||tx.type==='repay_out')return `−${fmtHidden(tx.amount)}`;if(tx.type==='transfer')return fmtHidden(tx.amount);return `+${fmtHidden(tx.amount)}`;}
  function txMeta(tx){const a=txActivity(tx);const account=accountById(tx.accountId).name;const bits=[a.name,account,niceDate(tx.date)];if(tx.note)bits.push(tx.note);return bits.filter(Boolean).join(' · ');}
  function transactionHTML(tx){const a=txActivity(tx),d=tx.debtId?debtById(tx.debtId):null;const title=tx.type==='borrowed'?`Borrowed from ${d?.person||'friend'}`:tx.type==='lent'?`Lent to ${d?.person||'friend'}`:tx.type==='repay_out'?`Repaid ${d?.person||'friend'}`:tx.type==='repay_in'?`Received from ${d?.person||'friend'}`:tx.type==='transfer'?`Transfer · ${accountById(tx.accountId).name} to ${accountById(tx.toAccountId).name}`:tx.note||a.name;const id=escapeHTML(tx.id);return `<div class="transaction-swipe-shell" data-tx-shell="${id}"><button class="transaction-delete-action" type="button" data-tx-swipe-delete="${id}" aria-label="Delete transaction" title="Delete transaction">${icon('trash')}<span>Delete</span></button><div class="transaction-row" role="button" tabindex="0" aria-expanded="false" aria-description="Swipe left or press Left Arrow to reveal delete." data-tx-open="${id}">${createTxIcon(tx)}<div class="transaction-main"><strong>${escapeHTML(title)}</strong><small>${escapeHTML([a.name, tx.type==='transfer'?'Between accounts':accountById(tx.accountId).name,niceDate(tx.date)].filter(Boolean).join(' · '))}${tx.tags?.length?` · ${escapeHTML(tx.tags.map(tag=>'#'+tag).join(' '))}`:''}</small></div><div class="transaction-amount"><strong data-money class="${['income','refund','repay_in','borrowed'].includes(tx.type)?'amount-positive':''}">${txAmountText(tx)}</strong><small>${escapeHTML(typeLabel(tx.type))}</small></div></div></div>`;}
  function renderRecent(){
    const card=$('.recent-card');if(card)card.hidden=state.settings.homeRecentEnabled===false;
    const host=$('#recent-transactions');if(!host)return;const items=[];
    for(const tx of state.transactions)items.push({sort:String(tx.createdAt||`${tx.date||''}T00:00:00`),html:transactionHTML(tx)});
    for(const split of state.billSplits||[])items.push({sort:String(split.createdAt||`${split.date||''}T00:00:00`),html:`<button type="button" class="recent-activity-row" data-bill-open="${escapeHTML(split.id)}"><span class="recent-activity-icon">${icon('people')}</span><span class="recent-activity-copy"><strong>${escapeHTML(split.name||'Shared bill')}</strong><small>Bill split · ${escapeHTML(niceDate(split.date||today()))}</small></span><span class="recent-activity-value">${fmtHidden(fromMinorUnits(split.totalMinor||0))}</span></button>`});
    for(const goal of state.goals||[]){items.push({sort:String(goal.createdAt||''),html:`<button type="button" class="recent-activity-row" data-goal-edit="${escapeHTML(goal.id)}"><span class="recent-activity-icon">${icon('goal')}</span><span class="recent-activity-copy"><strong>${escapeHTML(goal.name||'Savings goal')}</strong><small>Savings goal · ${escapeHTML(niceDate(String(goal.createdAt||today()).slice(0,10)))}</small></span><span class="recent-activity-value">${fmtHidden(goal.target||0)}</span></button>`});for(const entry of goal.contributions||[])items.push({sort:String(entry.createdAt||`${entry.date||''}T00:00:00`),html:`<button type="button" class="recent-activity-row" data-goal-history="${escapeHTML(goal.id)}"><span class="recent-activity-icon">${icon(entry.direction==='withdraw'?'expense':'income')}</span><span class="recent-activity-copy"><strong>${entry.direction==='withdraw'?'Goal withdrawal':'Goal contribution'}</strong><small>${escapeHTML(goal.name||'Savings goal')} · ${escapeHTML(niceDate(entry.date||today()))}</small></span><span class="recent-activity-value">${entry.direction==='withdraw'?'−':'+'}${fmtHidden(entry.amount||0)}</span></button>`});}
    for(const reminder of state.reminders||[]){if(reminder.active===false)continue;items.push({sort:String(reminder.createdAt||reminder.date||''),html:`<button type="button" class="recent-activity-row" data-page="activity"><span class="recent-activity-icon">${icon('bell')}</span><span class="recent-activity-copy"><strong>${escapeHTML(reminder.name||'Reminder')}</strong><small>Reminder · next ${escapeHTML(niceDate(reminder.date||today()))}</small></span><span class="recent-activity-value">${fmtHidden(reminder.amount||0)}</span></button>`});}
    for(const debt of state.debts||[])items.push({sort:String(debt.createdAt||debt.date||''),html:`<button type="button" class="recent-activity-row" data-page="debts"><span class="recent-activity-icon">${icon('people')}</span><span class="recent-activity-copy"><strong>${escapeHTML(debt.person||debt.name||'Debt record')}</strong><small>Money owed · ${escapeHTML(niceDate(String(debt.createdAt||debt.date||today()).slice(0,10)))}</small></span><span class="recent-activity-value">${fmtHidden(debt.amount||0)}</span></button>`});
    for(const plan of state.eventPlans||[])items.push({sort:String(plan.createdAt||plan.date||''),html:`<button type="button" class="recent-activity-row" data-page="activity"><span class="recent-activity-icon">${icon('calendar')}</span><span class="recent-activity-copy"><strong>${escapeHTML(plan.name||'Event plan')}</strong><small>Event plan · ${escapeHTML(niceDate(String(plan.createdAt||plan.date||today()).slice(0,10)))}</small></span><span class="recent-activity-value">${fmtHidden(plan.total||0)}</span></button>`});
    const activeGroceries=(state.shoppingItems||[]).filter(item=>!item.done).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    const groceryHTML=item=>`<div class="recent-grocery-row"><label><input type="checkbox" data-grocery-toggle="${escapeHTML(item.id)}" aria-label="Mark ${escapeHTML(item.name)} as bought"><span class="recent-grocery-check"></span></label><span class="recent-activity-copy"><strong>${escapeHTML(item.name)}</strong><small>${item.quantity?`${escapeHTML(item.quantity)} · `:''}To buy</small></span><button type="button" class="recent-grocery-remove" data-grocery-remove="${escapeHTML(item.id)}" aria-label="Remove ${escapeHTML(item.name)}">${icon('close')}</button></div>`;
    const shoppingPill=`<div class="shopping-list-pill-row"><button type="button" class="shopping-list-pill ${shoppingListOpen?'is-open':''}" id="recent-grocery-list-toggle" aria-expanded="${shoppingListOpen?'true':'false'}" aria-controls="recent-grocery-items"><span class="shopping-list-pill-icon">${icon('shopping')}</span><span class="shopping-list-pill-copy"><strong>Shopping list</strong><small>${activeGroceries.length?`${activeGroceries.length} ${activeGroceries.length===1?'item':'items'} to buy`:'Your list is clear'}</small></span><span class="shopping-list-pill-count">${activeGroceries.length}</span><span class="shopping-list-pill-chevron" aria-hidden="true">${shoppingListOpen?'⌃':'⌄'}</span></button><button type="button" class="shopping-list-add" id="recent-add-grocery" aria-label="Add grocery items">${icon('plus')}</button></div>`;
    const shoppingPanel=shoppingListOpen?`<section class="recent-grocery-list" id="recent-grocery-items" aria-label="Shopping list">${activeGroceries.length?activeGroceries.map(groceryHTML).join(''):`<div class="shopping-list-empty"><span>${icon('check')}</span><strong>All caught up</strong><small>Add more items whenever you need them.</small><button type="button" class="text-button" id="recent-list-add-empty">Add items</button></div>`}</section>`:'';
    host.innerHTML=`${shoppingPill}${shoppingPanel}${items.sort((a,b)=>b.sort.localeCompare(a.sort)).slice(0,6).map(item=>item.html).join('')}${!items.length&&!activeGroceries.length?`<div class="empty-state"><span class="empty-icon">${icon('receipt')}</span><h3>Your activity will appear here.</h3><p>Transactions, bill splits and other updates appear here, alongside your shopping list.</p><button type="button" class="primary-button" data-action="add">Add transaction</button></div>`:''}`;
  }
  function makeAlerts(){const alerts=[];const budget=budgetAmount(),spent=spentForMonth(),th=(+state.settings.alertThreshold||90)/100;const pct=budget?spent/budget:0;const todayDate=today();
    if(budget&&state.settings.notifyBudget){if(pct>=1)alerts.push({id:'budget-over-'+currentMonth(),type:'red',icon:'bell',title:'Monthly budget passed',body:`You're ${money(spent-budget)} over your ${money(budget)} spending budget. Review recent expenses or adjust your plan.`,time:'Budget'});else if(pct>=th)alerts.push({id:'budget-near-'+currentMonth(),type:'amber',icon:'chart',title:'Getting close to your limit',body:`You've used ${Math.round(pct*100)}% of this month's budget, with ${Math.max(0,new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()-new Date().getDate())} days left.`,time:'Budget'});else if(budget-spent>0&&new Date().getDate()>=new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate()-1&&state.settings.notifyPositive)alerts.push({id:'budget-positive-'+currentMonth(),type:'green',icon:'sparkle',title:'You stayed under budget',body:`You finished ${money(budget-spent)} under your spending limit. Unspent budget isn't automatically savings, but it is room you kept.`,time:'Monthly'});}
    if(state.settings.notifyBudget){const monthTxs=periodTransactions('month');Object.entries(state.budgets.categories||{}).forEach(([activityId,limit])=>{limit=Number(limit)||0;if(limit<=0)return;const activity=activityById(activityId);const usedMinor=monthTxs.reduce((sum,tx)=>tx.activityId===activityId?(sum+(tx.type==='expense'?1:tx.type==='refund'?-1:0)*toMinorUnits(tx.amount)):sum,0),used=fromMinorUnits(usedMinor);const categoryPct=used/limit;if(categoryPct>=1)alerts.push({id:`category-over-${currentMonth()}-${activityId}`,type:'red',icon:activity.icon||'tag',title:`${activity.name} budget passed`,body:`${money(Math.max(0,used-limit))} over your ${money(limit)} limit. Review this category or adjust your plan.`,time:'Category'});else if(categoryPct>=th)alerts.push({id:`category-near-${currentMonth()}-${activityId}`,type:'amber',icon:activity.icon||'tag',title:`${activity.name} is near its limit`,body:`You've used ${Math.round(categoryPct*100)}% of this category's budget. ${money(Math.max(0,limit-used))} remains.`,time:'Category'});});}
    state.reminders.filter(r=>r.active&&r.date>=todayDate).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,3).forEach(r=>{const days=Math.round((dateFrom(r.date)-dateFrom(todayDate))/86400000);if(days<=3&&state.settings.notifyBills)alerts.push({id:`rem-${r.id}-${r.date}`,type:'blue',icon:'calendar',title:r.name,body:`${money(r.amount)} due ${days===0?'today':days===1?'tomorrow':`in ${days} days`}.`,time:'Reminder'});});
    state.debts.filter(d=>debtRemaining(d)>0&&d.due&&d.due<=daysAgo(-1)).forEach(d=>{if(state.settings.notifyDebts)alerts.push({id:`debt-${d.id}`,type:'amber',icon:'people',title:d.direction==='lent'?`${d.person} may owe you`: `Repayment to ${d.person}`,body:`${money(debtRemaining(d))} remains ${d.direction==='lent'?'to collect':'to repay'}. Check in when it feels right.`,time:'Debt'});});
    if(state.settings.notifyWeekly && new Date().getDay()===1){
      const startDate=dateFrom(todayDate);startDate.setDate(startDate.getDate()-7);const weekStart=localDate(startDate);
      const weekTx=state.transactions.filter(t=>inRange(t.date||todayDate,weekStart,todayDate));
      if(weekTx.length){const weekly=totalsFor(weekTx);const daily=weekly.expenses/7;alerts.push({id:`weekly-summary-${todayDate}`,type:'blue',icon:'chart',title:'Your weekly money recap',body:`You spent ${money(weekly.expenses)} and received ${money(weekly.income)} over the last 7 days. That's about ${money(daily)} per day in spending.`,time:'Weekly'});}
    }
    if(finance){
      const financeRisks=finance.priorityInsights(state,finance.periodRange('month',today()),today());
      financeRisks.filter(item=>item.priority===1||item.priority===2||item.kind==='salary-overallocated').forEach(item=>{
        const budgetRisk=item.priority===2||['major-budget-overrun','salary-overallocated'].includes(item.kind);
        const billRisk=['cash-shortage','negative-projection'].includes(item.kind);
        if((budgetRisk&&!state.settings.notifyBudget)||(billRisk&&!state.settings.notifyBills))return;
        const id=`finance-risk-${currentMonth()}-${item.kind}-${String(item.title).toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,32)}`;
        if(alerts.some(alert=>alert.id===id))return;
        alerts.push({id,type:'red',icon:'chart',title:item.title,body:`${item.detail} ${item.evidence}`,time:'Financial risk'});
      });
    }
    if(!alerts.length)alerts.push({id:'all-clear',type:'green',icon:'check',title:'Looking steady',body:state.transactions.length?'No urgent budget alerts right now. Keep tracking at your own pace.':'Your workspace is ready when you are. Add a transaction to get started.',time:'Today'});
    return alerts;
  }
  function renderAlerts(){const alerts=makeAlerts();$('#home-alerts').innerHTML=alerts.slice(0,3).map(a=>`<div class="alert-item"><span class="alert-symbol ${a.type}">${icon(a.icon)}</span><div class="alert-copy"><strong>${escapeHTML(a.title)}</strong><p>${escapeHTML(a.body)}</p></div><span class="alert-time">${escapeHTML(a.time)}</span></div>`).join('');$('#notification-dot').hidden=!alerts.some(a=>!state.settings.seenAlerts.includes(a.id)&&a.id!=='all-clear');}
  function parseNaturalSearch(raw){
    let text=String(raw||'').trim().toLowerCase();
    const out={terms:text,amount:null,amountMode:'exact',dateStart:null,dateEnd:null,type:null};
    const amountMatch=text.match(/\b(over|above|more than|greater than|under|below|less than|exactly|equal to)\s*(?:₹|rs\.?\s*)?([\d,]+(?:\.\d{1,2})?)|(?:₹|rs\.?\s*)([\d,]+(?:\.\d{1,2})?)/i);
    if(amountMatch){const op=(amountMatch[1]||'exactly').toLowerCase();out.amount=Number((amountMatch[2]||amountMatch[3]).replace(/,/g,''));out.amountMode=/over|above|more than|greater than/.test(op)?'over':/under|below|less than/.test(op)?'under':'exact';out.terms=out.terms.replace(amountMatch[0],' ').trim();}
    const iso=text.match(/\b(before|after|on)\s+(\d{4}-\d{2}-\d{2})\b/);
    if(iso){if(iso[1]==='before'||iso[1]==='after'){const boundary=dateFrom(iso[2]);boundary.setDate(boundary.getDate()+(iso[1]==='after'?1:-1));const shifted=localDate(boundary);if(iso[1]==='before')out.dateEnd=shifted;else out.dateStart=shifted;}else out.dateStart=out.dateEnd=iso[2];out.terms=out.terms.replace(iso[0],' ');}
    const todayDate=dateFrom(today());const phrase=text.match(/\b(today|yesterday|this week|last week|this month|last month|this year)\b/);
    if(phrase&&!iso){const word=phrase[1];let start,end;const d=new Date(todayDate);if(word==='today'){start=end=today();}else if(word==='yesterday'){d.setDate(d.getDate()-1);start=end=localDate(d);}else if(word==='this week'||word==='last week'){const monday=new Date(todayDate);monday.setDate(monday.getDate()-(monday.getDay()+6)%7+(word==='last week'?-7:0));const sunday=new Date(monday);sunday.setDate(sunday.getDate()+6);start=localDate(monday);end=localDate(sunday);}else if(word==='this month'){start=monthStart(0);end=monthEnd(0);}else if(word==='last month'){start=monthStart(-1);end=monthEnd(-1);}else {start=`${today().slice(0,4)}-01-01`;end=`${today().slice(0,4)}-12-31`;}out.dateStart=start;out.dateEnd=end;out.terms=out.terms.replace(phrase[0],' ');}
    if(/\b(income|received|money in|salary)\b/.test(out.terms)){out.type='income';out.terms=out.terms.replace(/\b(income|received|money in|salary)\b/g,' ');}
    else if(/\b(refund|refunded|money back)\b/.test(out.terms)){out.type='refund';out.terms=out.terms.replace(/\b(refund|refunded|money back)\b/g,' ');}
    else if(/\b(expense|expenses|spent|spending|purchase|purchases)\b/.test(out.terms)){out.type='expense';out.terms=out.terms.replace(/\b(expense|expenses|spent|spending|purchase|purchases)\b/g,' ');}
    else if(/\b(transfer|transfers)\b/.test(out.terms)){out.type='transfer';out.terms=out.terms.replace(/\b(transfer|transfers)\b/g,' ');}
    else if(/\b(debt|debts|borrowed|lent|repayment|repayments)\b/.test(out.terms)){out.type='debt';out.terms=out.terms.replace(/\b(debt|debts|borrowed|lent|repayment|repayments)\b/g,' ');}
    out.terms=out.terms.replace(/\b(from|to|for|with|in|the|transaction|transactions|activity)\b/g,' ').replace(/[^\p{L}\p{N}@._-]+/gu,' ').trim().split(/\s+/).filter(Boolean);
    return out;
  }
  function naturalSearchMatches(tx,parsed){
    if(parsed.amount!==null){const n=Number(tx.amount)||0;if(parsed.amountMode==='over'&&!(n>parsed.amount))return false;if(parsed.amountMode==='under'&&!(n<parsed.amount))return false;if(parsed.amountMode==='exact'&&Math.abs(n-parsed.amount)>.009)return false;}
    const date=String(tx.date||'');if(parsed.dateStart&&date<parsed.dateStart)return false;if(parsed.dateEnd&&date>parsed.dateEnd)return false;
    if(parsed.type==='income'&&tx.type!=='income')return false;if(parsed.type==='expense'&&!['expense','refund'].includes(tx.type))return false;if(parsed.type==='refund'&&tx.type!=='refund')return false;if(parsed.type==='transfer'&&tx.type!=='transfer')return false;if(parsed.type==='debt'&&!txIsDebt(tx))return false;
    return true; // Free-text terms are evaluated by the C++ search kernel below.
  }
  function activityRange(period){
    const anchor=today();
    if(period==='week')return finance?.periodRange('week',anchor)||{start:monthStart(),end:monthEnd()};
    if(period==='year')return finance?.periodRange('year',anchor)||{start:`${anchor.slice(0,4)}-01-01`,end:`${anchor.slice(0,4)}-12-31`};
    if(period==='month')return finance?.periodRange('month',anchor)||{start:monthStart(),end:monthEnd()};
    return {start:'0000-01-01',end:'9999-12-31'};
  }
  function activityGroupSummary(group){
    let income=0,expenses=0,refunds=0,net=0;
    group.forEach(tx=>{const value=toMinorUnits(tx.amount);if(tx.type==='income')income+=value;if(tx.type==='expense')expenses+=value;if(tx.type==='refund')refunds+=value;net+=toMinorUnits(txCashDelta(tx));});
    return `<div class="activity-period-summary"><span>Income <b>${money(fromMinorUnits(income))}</b></span><span>Expenses <b>${money(fromMinorUnits(expenses))}</b></span><span>Refunds <b>${money(fromMinorUnits(refunds))}</b></span><span>Net <b class="${net<0?'amount-negative':'amount-positive'}">${money(fromMinorUnits(net))}</b></span><span>${group.length} transaction${group.length===1?'':'s'}</span></div>`;
  }
  function activityGroupHTML(title,group,open=false,details=false){
    if(details)return `<details class="activity-date-group activity-year-group" ${open?'open':''}><summary><span>${escapeHTML(title)}</span><small>${group.length} transactions</small></summary><div class="activity-date-group-body">${activityGroupHTML('',group,false,false)}</div></details>`;
    return `<section class="activity-date-group"><header><strong>${escapeHTML(title||'Transactions')}</strong>${activityGroupSummary(group)}</header><div class="activity-date-group-list">${group.map(transactionHTML).join('')}</div></section>`;
  }
  function renderGroupedActivity(txs,period){
    const byDate=new Map();const grouped=[];
    const push=(key,title,tx)=>{if(!byDate.has(key)){const item={key,title,items:[]};byDate.set(key,item);grouped.push(item);}byDate.get(key).items.push(tx);};
    txs.forEach(tx=>{
      const d=dateFrom(tx.date);let key,title;
      if(period==='week'){
        key=tx.date;title=d.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'});
      }else if(period==='year'){
        key=tx.date.slice(0,7);title=d.toLocaleDateString(undefined,{month:'long',year:'numeric'});
      }else if(period==='all'){
        key=tx.date.slice(0,4);title=key;
      }else{
        const monday=new Date(d);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));key=localDate(monday);
        const sunday=new Date(monday);sunday.setDate(sunday.getDate()+6);
        const monthRange=activityRange('month');const first=dateFrom(monthRange.start),last=dateFrom(monthRange.end);
        if(monday<first)monday.setTime(first.getTime());if(sunday>last)sunday.setTime(last.getTime());
        title=`${monday.toLocaleDateString(undefined,{day:'numeric',month:'short'})} – ${sunday.toLocaleDateString(undefined,{day:'numeric',month:'short'})}`;
      }
      push(key,title,tx);
    });
    if(period==='all')return grouped.map(year=>{
      const months=new Map();year.items.forEach(tx=>{const key=tx.date.slice(0,7);if(!months.has(key))months.set(key,[]);months.get(key).push(tx);});
      const body=[...months.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([key,items])=>activityGroupHTML(dateFrom(`${key}-01`).toLocaleDateString(undefined,{month:'long',year:'numeric'}),items)).join('');
      return `<details class="activity-date-group activity-year-group"><summary><span>${escapeHTML(year.title)}</span>${activityGroupSummary(year.items)}</summary><div class="activity-date-group-body">${body}</div></details>`;
    }).join('');
    return grouped.map(item=>activityGroupHTML(item.title,item.items)).join('');
  }
  function activityFiltersManager(){
    const tags=[...new Set(state.transactions.flatMap(tx=>Array.isArray(tx.tags)?tx.tags:[]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const advanced=!!(activityAdvancedFilters.tag||activityAdvancedFilters.min!==''||activityAdvancedFilters.max!=='');
    openModal('Filter transactions',`<form id="activity-advanced-filter-form" class="modal-body activity-filter-form">
      <p class="muted small">Start with an account or category. Add amount and tag rules only when you need a narrower result.</p>
      <label class="entry-field" for="activity-filter-account"><span class="entry-field-icon">${icon('wallet')}</span><span class="entry-field-copy"><span class="entry-field-name">Account</span><select id="activity-filter-account" name="accountId"><option value="">All accounts</option>${state.accounts.map(a=>`<option value="${escapeHTML(a.id)}" ${activityAdvancedFilters.accountId===a.id?'selected':''}>${escapeHTML(a.name)}</option>`).join('')}</select></span></label>
      <label class="entry-field" for="activity-filter-category"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">Category</span><select id="activity-filter-category" name="categoryId"><option value="">All categories</option>${state.activities.filter(a=>!a.archived).map(a=>`<option value="${escapeHTML(a.id)}" ${activityAdvancedFilters.categoryId===a.id?'selected':''}>${escapeHTML(a.name)}</option>`).join('')}</select></span></label>
      <details class="form-disclosure activity-filter-more" ${advanced?'open':''}><summary><span class="disclosure-title">${icon('sliders')} More filters</span><span class="disclosure-hint">Tag and amount range</span></summary><div class="disclosure-content">
        <div class="form-field"><label for="activity-filter-tag">TAG</label><input id="activity-filter-tag" name="tag" list="activity-filter-tags" value="${escapeHTML(activityAdvancedFilters.tag)}" placeholder="e.g. reimbursable"><datalist id="activity-filter-tags">${tags.map(t=>`<option value="${escapeHTML(t)}"></option>`).join('')}</datalist></div>
        <div class="form-grid"><div class="form-field"><label for="activity-filter-min">MINIMUM · INR</label><input id="activity-filter-min" name="min" inputmode="decimal" type="number" min="0" step="0.01" value="${escapeHTML(activityAdvancedFilters.min)}" placeholder="No minimum"></div><div class="form-field"><label for="activity-filter-max">MAXIMUM · INR</label><input id="activity-filter-max" name="max" inputmode="decimal" type="number" min="0" step="0.01" value="${escapeHTML(activityAdvancedFilters.max)}" placeholder="No maximum"></div></div>
      </div></details>
      <div class="form-actions"><button class="text-button" type="button" id="activity-filter-clear">Clear filters</button><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Apply filters</button></div>
    </form>`,'ACTIVITY SEARCH');
  }
  async function saveActivityFilters(form){const fd=new FormData(form),min=String(fd.get('min')||'').trim(),max=String(fd.get('max')||'').trim();if(min&&(!Number.isFinite(Number(min))||Number(min)<0)){toast('Enter a valid minimum amount.','error');return;}if(max&&(!Number.isFinite(Number(max))||Number(max)<0)){toast('Enter a valid maximum amount.','error');return;}if(min&&max&&Number(min)>Number(max)){toast('Minimum amount cannot exceed maximum amount.','error');return;}activityAdvancedFilters={accountId:String(fd.get('accountId')||''),categoryId:String(fd.get('categoryId')||''),tag:String(fd.get('tag')||'').trim().replace(/^#/,'').slice(0,32),min,max};closeModal();renderActivity();}
  function renderActivity(){
    const rawQuery=($('#activity-search')?.value||'').trim(),parsed=parseNaturalSearch(rawQuery),period=$('#activity-period')?.value||'month';
    let txs=[...state.transactions];
    if(period!=='all'&&!parsed.dateStart&&!parsed.dateEnd){const range=activityRange(period),end=range.end>today()?today():range.end;txs=txs.filter(t=>inRange(t.date,range.start,end));}
    if(parsed.dateStart||parsed.dateEnd)txs=txs.filter(t=>(!parsed.dateStart||String(t.date||'')>=parsed.dateStart)&&(!parsed.dateEnd||String(t.date||'')<=parsed.dateEnd));
    if(currentYearFilter)txs=txs.filter(t=>String(t.date||'').slice(0,4)===String(currentYearFilter));
    if(currentFilter==='income')txs=txs.filter(t=>t.type==='income');else if(currentFilter==='expense')txs=txs.filter(t=>t.type==='expense'||t.type==='refund');else if(currentFilter==='transfer')txs=txs.filter(t=>t.type==='transfer');else if(currentFilter==='debt')txs=txs.filter(txIsDebt);else if(currentFilter==='refund')txs=txs.filter(t=>t.type==='refund');
    if(rawQuery)txs=txs.filter(t=>naturalSearchMatches(t,parsed));
    const amountFilters={};if(activityAdvancedFilters.min!=='')amountFilters.minMinor=toMinorUnits(Number(activityAdvancedFilters.min));if(activityAdvancedFilters.max!=='')amountFilters.maxMinor=toMinorUnits(Number(activityAdvancedFilters.max));if(parsed.amount!==null){const minor=toMinorUnits(parsed.amount);if(parsed.amountMode==='exact'){amountFilters.minMinor=minor;amountFilters.maxMinor=minor;}else if(parsed.amountMode==='over')amountFilters.minMinor=minor+1;else if(parsed.amountMode==='under')amountFilters.maxMinor=minor-1;}
    const accountIndex=activityAdvancedFilters.accountId?state.accounts.findIndex(a=>a.id===activityAdvancedFilters.accountId):-1,categoryIndex=activityAdvancedFilters.categoryId?state.activities.findIndex(a=>a.id===activityAdvancedFilters.categoryId):-1;
    const wasmRows=txs.map(tx=>({amountMinor:toMinorUnits(tx.amount),dateKey:dateKeyFromISO(tx.date),accountIndex:state.accounts.findIndex(a=>a.id===tx.accountId),categoryIndex:state.activities.findIndex(a=>a.id===tx.activityId),typeCode:window.PocketWiseWasm.typeCodes[tx.type]||0,searchText:[tx.note,tx.merchantName,tx.paymentMethod,tx.date,typeLabel(tx.type),txActivity(tx).name,accountById(tx.accountId).name,debtById(tx.debtId)?.person].filter(Boolean).join(' '),tags:tx.tags||[]}));
    const matches=window.PocketWiseWasm.filterTransactions(wasmRows,{...amountFilters,accountIndex,categoryIndex,query:parsed.terms.join(' '),tag:activityAdvancedFilters.tag,dateFrom:parsed.dateStart?dateKeyFromISO(parsed.dateStart):0,dateTo:parsed.dateEnd?dateKeyFromISO(parsed.dateEnd):0});txs=txs.filter((tx,index)=>matches[index]===1);txs.sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    $('#all-transactions').innerHTML=txs.length?renderGroupedActivity(txs,period):`<div class="empty-state"><span class="empty-icon">${icon('search')}</span><h3>No matching activity</h3><p>Try a different keyword, amount or date such as “over ₹500”, “yesterday” or “income”.</p><button type="button" class="text-button" data-reset-filters>Clear filters</button></div>`;
    $('#transaction-total').textContent=txs.length;$$('#activity-filters .filter-pill').forEach(b=>{const selected=b.dataset.filter===currentFilter;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',selected?'true':'false');});syncGlassSegmentIndicators();
  }
  function sortedActivities(){return state.activities.map(a=>({...a,count:state.transactions.filter(t=>t.activityId===a.id).length})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
  function renderFrequent(){const sorted=sortedActivities().filter(a=>!a.archived);const top=sorted.filter(a=>a.count>0).slice(0,7);const html=(top.length?top:sorted.slice(0,6)).map(a=>{const last=state.transactions.filter(t=>t.activityId===a.id&&t.type==='expense').sort((x,y)=>(y.createdAt||'').localeCompare(x.createdAt||''))[0];return `<button type="button" class="activity-chip" data-repeat-activity="${escapeHTML(a.id)}" title="${last?'Repeat last amount '+escapeHTML(money(last.amount)):'Add '+escapeHTML(a.name)}">${icon(a.icon)}<span>${escapeHTML(a.name)}</span>${last?`<span class="chip-count">${escapeHTML(money(last.amount))}</span>`:''}</button>`;}).join('');$('#frequent-activities').innerHTML=html;}
  function renderSettingsSummary(){
    const set=state.settings,recoveryPanel=$('#storage-recovery');
    if(recoveryPanel)recoveryPanel.hidden=!recoverySnapshot;
    $('#alert-threshold').value=set.alertThreshold||90;$('#alert-output').value=`${set.alertThreshold||90}%`;$('#threshold-copy').textContent=`${set.alertThreshold||90}%`;
    $('#notify-budget').checked=!!set.notifyBudget;$('#notify-positive').checked=!!set.notifyPositive;$('#notify-bills').checked=!!set.notifyBills;$('#notify-debts').checked=!!set.notifyDebts;$('#notify-weekly').checked=!!set.notifyWeekly;
    $('#quiet-start').value=set.quietStart||'21:00';$('#quiet-end').value=set.quietEnd||'08:00';
    $('#hide-setting').checked=!!set.hideBalances;$('#smart-ui-setting').checked=!!set.smartUI;$('#daily-story-setting').checked=!!set.dailyStory;const recentToggle=$('#home-recent-setting');if(recentToggle)recentToggle.checked=set.homeRecentEnabled!==false;
    const feedback=interactionFeedbackPrefs();
    const feedbackMaster=$('#interaction-feedback-setting'),feedbackOptions=$('#interaction-feedback-options'),haptics=$('#interaction-feedback-haptics'),sounds=$('#interaction-feedback-sounds'),style=$('#interaction-feedback-style');
    if(feedbackMaster)feedbackMaster.checked=!!feedback.enabled;
    if(feedbackOptions)feedbackOptions.hidden=!feedback.enabled;
    if(haptics){const vibrationAvailable=hasVibrationSupport(),row=haptics.closest('.setting-row');if(row)row.hidden=!vibrationAvailable;haptics.checked=vibrationAvailable&&!!feedback.haptics;haptics.disabled=!vibrationAvailable;}
    if(sounds)sounds.checked=!!feedback.sounds;
    if(style)style.value=feedback.soundStyle||'soft';
    const hapticsNote=$('#interaction-feedback-haptics-note');
    if(hapticsNote)hapticsNote.textContent=hasVibrationSupport()?'Short device vibration on browsers that support it.':'Vibration is not exposed by Safari on iPhone. Sound remains available.';
    const preview=$('#interaction-feedback-preview');if(preview)preview.disabled=!feedback.enabled||!feedback.sounds;
    const shake=$('#shake-quick-entry-toggle'),shakeStatus=$('#shake-quick-entry-status');
    const shakeAvailable=!!(window.isSecureContext&&('DeviceMotionEvent'in window));
    if(shake){shake.checked=!!set.shakeQuickEntryEnabled;shake.disabled=!shakeAvailable;}
    if(shakeStatus)shakeStatus.textContent=!window.isSecureContext?'Shake entry needs a secure HTTPS connection.':!('DeviceMotionEvent'in window)?'This browser does not provide device-motion access.':set.shakeQuickEntryEnabled?'On. Shake twice while Aruvi is open to start Quick Entry.':'Off. Enabling requests motion permission; Aruvi listens only while open.';
    $('#last-backup').textContent=set.lastBackup?`Last exported ${new Date(set.lastBackup).toLocaleString()}`:'Never exported on this device';
    const notificationsAllowed=('Notification'in window&&Notification.permission==='granted'),pushConfigured=!!window.PocketWisePush?.isConfigured?.(),pushLinked=!!window.PocketWisePush?.hasInstallation?.();
    $('#notification-permission').textContent=('Notification'in window)?(Notification.permission==='denied'?'Notifications blocked in browser settings.':notificationsAllowed?(pushConfigured?(pushLinked?'System permission granted. Background reminder delivery is configured.':'System permission granted. Link this device for background reminders.'):'System permission granted. Background push needs a configured push service.'):'System permission not granted.'):'System notifications are not supported here';
    $('#enable-notifications').textContent=notificationsAllowed?(pushConfigured?(pushLinked?'Refresh background push':'Enable background push'):'Enabled'):'Enable';$('#enable-notifications').disabled=notificationsAllowed&&!pushConfigured;
  }
  function financeSelectedRange(){
    if(!finance)return null;
    const type=$('#finance-period-type')?.value||'month',anchor=$('#finance-period-anchor')?.value||financeAnchor||today();
    let range;
    if(type==='custom'){const from=$('#finance-custom-start'),to=$('#finance-custom-end');if(from&&!from.value)from.value=monthStart();if(to&&!to.value)to.value=today();range=finance.periodRange('custom',anchor,from?.value,to?.value);}
    else range=finance.periodRange(type,anchor);
    if(!range)return null;
    const end=range.end>today()?today():range.end;
    return {...range,effectiveEnd:end};
  }
  function financeDateLabel(date,options={day:'numeric',month:'short',year:'numeric'}){return dateFrom(date).toLocaleDateString(undefined,options);}
  function financeMetricHTML(label,value,note='',color=''){return `<div class="finance-metric"><small>${escapeHTML(label)}</small><strong ${color?`style="color:${color}"`:''}>${escapeHTML(fmtHidden(value))}</strong><em>${escapeHTML(note)}</em></div>`;}
  function financeCategoryColor(row){return chartCategoryColor(row,chartColorFallback.length-1);}
  function financeCategoryLegendHTML(comparison){
    const rows=Array.isArray(comparison?.categories)?comparison.categories:[];
    if(!rows.length)return '';
    return `<div class="finance-category-name-legend" role="list" aria-label="Spending categories">${rows.map(row=>`<span role="listitem"><i aria-hidden="true" style="--category-color:${financeCategoryColor(row)}"></i>${escapeHTML(row.name||'Other')}</span>`).join('')}</div>`;
  }
  function financeCategoryGraphSVG(comparison){
    const rows=Array.isArray(comparison?.categories)?comparison.categories:[];
    if(!rows.length)return '<div class="finance-empty">Record expenses to build a category comparison.</div>';
    const labels=Array.isArray(comparison.labels)&&comparison.labels.length?comparison.labels:['Period'];
    const width=360,left=43,right=350,top=14,bottom=168,plotWidth=right-left,plotHeight=bottom-top;
    const values=rows.flatMap(row=>[...(row.current||[]),...(row.previous||[])]).map(value=>toMinorUnits(value));
    const minValue=Math.min(0,...values),maxValue=Math.max(1,...values);
    const span=Math.max(1,maxValue-minValue),y=value=>bottom-((toMinorUnits(value)-minValue)/span)*plotHeight;
    const x=index=>labels.length===1?(left+right)/2:left+(plotWidth*index/Math.max(1,labels.length-1));
    const tickValues=Array.from({length:4},(_,i)=>minValue+(span*i/3));
    const grid=tickValues.map(value=>{const yy=y(fromMinorUnits(Math.round(value)));return `<g><line x1="${left}" y1="${yy.toFixed(2)}" x2="${right}" y2="${yy.toFixed(2)}" stroke="currentColor" stroke-opacity=".11" stroke-width="1"/><text x="${left-7}" y="${(yy+3).toFixed(2)}" fill="currentColor" fill-opacity=".58" font-size="8" text-anchor="end">${escapeHTML(`₹${new Intl.NumberFormat('en-IN',{notation:'compact',maximumFractionDigits:1}).format(fromMinorUnits(Math.round(value)))}`)}</text></g>`;}).join('');
    const lines=rows.map(row=>{
      const color=financeCategoryColor(row),previous=lightenFinanceColor(color,.52);
      const curr=Array.isArray(row.current)?row.current:[],prev=Array.isArray(row.previous)?row.previous:[];
      const currentPath=curr.map((value,index)=>`${index?'L':'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
      const previousPath=prev.map((value,index)=>`${index?'L':'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
      const currentMarks=curr.map((value,index)=>`<circle cx="${x(index).toFixed(2)}" cy="${y(value).toFixed(2)}" r="2.7" fill="${color}"/>`).join('');
      return `<g class="finance-category-series"><path d="${previousPath}" fill="none" stroke="${previous}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 4"/><path d="${currentPath}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>${currentMarks}</g>`;
    }).join('');
    const step=labels.length>8?Math.ceil(labels.length/6):1;
    const xLabels=labels.map((label,index)=>{
      if(index%step!==0&&index!==labels.length-1)return '';
      return `<text x="${x(index).toFixed(2)}" y="${bottom+17}" fill="currentColor" fill-opacity=".62" font-size="8" text-anchor="middle">${escapeHTML(label)}</text>`;
    }).join('');
    const currentRange=comparison.currentRange||{},previousRange=comparison.previousRange||{};
    const summary=rows.map(row=>`${row.name}: selected ${money(row.currentTotal)}, previous ${money(row.previousTotal)}`).join('; ');
    const chartTitle=`Category spending comparison for ${currentRange.start||'selected period'} to ${currentRange.end||''} compared with ${previousRange.start||'previous period'} to ${previousRange.end||''}. ${summary}`;
    // Custom ranges contain one aggregate bucket; plot paired period bars rather than a one-point line.
    if(labels.length===1){
      const max=Math.max(1,...rows.flatMap(row=>[toMinorUnits(row.currentTotal),toMinorUnits(row.previousTotal)]).map(Math.abs));
      const center=164,half=145,rowHeight=34,height=24+rows.length*rowHeight+8;
      const bars=rows.map((row,index)=>{const yy=18+index*rowHeight,color=financeCategoryColor(row),light=lightenFinanceColor(color,.52),a=toMinorUnits(row.currentTotal),b=toMinorUnits(row.previousTotal),aw=half*Math.abs(a)/max,bw=half*Math.abs(b)/max,label=String(row.name||'Other'),short=label.length>34?`${label.slice(0,33)}…`:label;return `<g><text x="0" y="${yy+8}" fill="currentColor" font-size="9" font-weight="650">${escapeHTML(short)}</text><rect x="${a>=0?center:center-aw}" y="${yy+12}" width="${aw.toFixed(2)}" height="5" rx="2.5" fill="${color}"/><rect x="${b>=0?center:center-bw}" y="${yy+21}" width="${bw.toFixed(2)}" height="5" rx="2.5" fill="${light}"/></g>`;}).join('');
      return `<svg class="finance-category-compare-svg is-aggregate" viewBox="0 0 320 ${height}" role="img" aria-label="${escapeHTML(chartTitle)}"><title>Category spending comparison</title><desc>Paired bars compare net category spending for the selected custom period and the previous equivalent period. Positive amounts extend right of zero; refund-heavy negative net amounts extend left. Solid bars are selected-period spending; lighter bars are previous-period spending.</desc><line x1="${center}" y1="12" x2="${center}" y2="${height-5}" stroke="currentColor" stroke-opacity=".20" stroke-width="1"/>${bars}</svg>`;
    }
    return `<svg class="finance-category-compare-svg" viewBox="0 0 ${width} 194" role="img" aria-label="${escapeHTML(chartTitle)}"><title>Category spending trend comparison</title><desc>Each coloured line represents an existing spending category. Solid lines show the selected period and lighter dashed lines show the previous equivalent period. Horizontal labels represent ${comparison.type==='week'?'weekdays':comparison.type==='year'?'months':'calendar weeks'}; vertical values represent net spending in rupees after refunds.</desc>${grid}<line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="currentColor" stroke-opacity=".20"/>${lines}${xLabels}</svg>`;
  }
  function renderFinanceCategoryComparison(range){
    if(!finance)return;
    const type=range.type,comparison=finance.compareCategories(state,type,range.start,range);
    const prefix=type==='week'?'Week':type==='year'?'Year':type==='custom'?'Selected range':'Month';
    $('#finance-category-title').textContent=`${prefix} category comparison`;
    const chart=$('#finance-category-chart-view');
    if(chart)chart.innerHTML=`${financeCategoryLegendHTML(comparison)}${financeCategoryGraphSVG(comparison)}`;
    const accessible=$('#finance-category-accessibility-summary');
    if(accessible)accessible.textContent=comparison.categories.length?comparison.categories.map(row=>`${row.name}: ${money(row.currentTotal)} in selected period, ${money(row.previousTotal)} in previous period.`).join(' '):'No category spending has been recorded in these periods.';
  }
  function lightenFinanceColor(hex,amount=.58){const value=String(hex).replace('#','');if(!/^[0-9a-f]{6}$/i.test(value))return hex;const channels=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16));return '#'+channels.map(c=>Math.round(c+(255-c)*amount).toString(16).padStart(2,'0')).join('');}
  function renderFinanceSalaryAndBudget(range){
    const budget=finance.budgetDashboard(state,range,today()),salary=budget.salary;
    const plan=state.settings.salaryPlan||{};
    const activeRules=(plan.allocations||[]).filter(rule=>rule&&rule.enabled!==false&&Number(rule.value)>0).length;
    const frequencyLabel={monthly:'Monthly',fortnightly:'Fortnightly',weekly:'Weekly'}[salary.frequency||plan.frequency||'monthly'];
    const salaryConfigured=Number(plan.expectedSalary)>0||activeRules>0;
    const categoryLimits=budget.rows.filter(row=>toMinorUnits(row.plannedAllocation)>0).length;
    const budgetConfigured=toMinorUnits(budget.totalBudget)>0||categoryLimits>0;
    const alerts=[];
    if(salary.overAllocated)alerts.push('Salary allocations exceed the available pay for this period.');
    else if(salary.percentageOver100)alerts.push('Percentage allocations exceed 100%.');
    if(budget.categoryBudgetsExceedTotal)alerts.push('Category limits add up to more than the overall budget.');
    if(toMinorUnits(budget.totalBudget)>0&&toMinorUnits(budget.totalSpent)>toMinorUnits(budget.totalBudget))alerts.push('Recorded spending is above the overall budget.');
    if(budget.rows.some(row=>toMinorUnits(row.plannedAllocation)>0&&toMinorUnits(row.spent)>=toMinorUnits(row.plannedAllocation)))alerts.push('One or more category limits have been reached or exceeded.');
    const alertCopy=alerts.length?`<div class="finance-plan-alert" role="status"><span aria-hidden="true">!</span><div><strong>${alerts.length} item${alerts.length===1?'':'s'} need review</strong><small>${escapeHTML(alerts[0])}${alerts.length>1?` + ${alerts.length-1} more`:''}</small></div></div>`:`<div class="finance-plan-clear" role="status"><span aria-hidden="true">✓</span><span>${salaryConfigured||budgetConfigured?'No allocation or budget warnings for this period.':'Set up a salary plan or budget to enable personalised alerts.'}</span></div>`;
    $('#finance-salary-panel').innerHTML=`<div class="finance-plan-status"><span class="finance-plan-status-icon" aria-hidden="true">₹</span><div class="finance-plan-status-copy"><strong>${salaryConfigured?'Salary plan configured':'No salary plan yet'}</strong><small>${salaryConfigured?`${frequencyLabel} pay · ${activeRules} active allocation rule${activeRules===1?'':'s'}`:'Add expected take-home pay and allocation rules.'}</small></div><span class="finance-plan-state ${salaryConfigured?'is-configured':''}">${salaryConfigured?'Configured':'Not set'}</span></div>`;
    $('#finance-budget-panel').innerHTML=`<div class="finance-plan-status"><span class="finance-plan-status-icon" aria-hidden="true">◷</span><div class="finance-plan-status-copy"><strong>${budgetConfigured?'Budget monitoring active':'No budget limits yet'}</strong><small>${budgetConfigured?`${categoryLimits} category limit${categoryLimits===1?'':'s'} configured`:'Add an overall or category budget to track spending.'}</small></div><span class="finance-plan-state ${state.settings.notifyBudget?'is-configured':''}">${state.settings.notifyBudget?'Alerts on':'Alerts off'}</span></div>${alertCopy}<p class="finance-plan-report-note">Detailed salary allocations, category plans, actual spending and remaining amounts are included in the downloadable Cash Flow Statement for the selected period. Plans never create transactions or move money.</p>`;
  }
  function renderFinancePriorities(){
    const insights=finance.priorityInsights(state,finance.periodRange('month',today()),today());
    $('#finance-priority-panel').innerHTML=insights.length?`<div class="finance-priority-list">${insights.map(item=>`<article class="finance-priority-item"><div class="finance-priority-meta">Priority ${item.priority} · ${escapeHTML(item.kind.replace(/-/g,' '))}</div><div class="finance-priority-top"><strong>${escapeHTML(item.title)}</strong><span class="finance-priority-amount">${escapeHTML(fmtHidden(item.amount))}</span></div><p>${escapeHTML(item.detail)}</p><p><b>Evidence:</b> ${escapeHTML(item.evidence)}</p><p><b>Suggested action:</b> ${escapeHTML(item.action)}</p></article>`).join('')}</div>`:'<div class="finance-empty">No material alerts are supported by the current records. Keep recording transactions and upcoming commitments to improve the analysis.</div>';
  }
  function renderFinanceAnalytics(){
    if(!finance||!$('#finance-overview-metrics'))return;
    const range=financeSelectedRange();if(!range){$('#finance-coverage-note').textContent='Choose valid start and end dates for this report.';return;}
    const period=finance.calculatePeriod(state,{range,today:today()});
    const partialPeriod=range.effectiveEnd<range.end;const label=range.type==='custom'?`${financeDateLabel(range.start)} – ${financeDateLabel(range.effectiveEnd)}`:range.type==='week'?`Week of ${financeDateLabel(range.start)} – ${financeDateLabel(range.end)}`:range.type==='year'?range.start.slice(0,4):financeDateLabel(range.start,{month:'long',year:'numeric'});
    $('#finance-period-label').textContent=partialPeriod?`${label} · through ${financeDateLabel(range.effectiveEnd)}`:label;
    const reportHint=$('#finance-report-period-hint');if(reportHint)reportHint.textContent=`Downloads use ${partialPeriod?`${label} · through ${financeDateLabel(range.effectiveEnd)}`:label}. Detailed figures appear only in the downloaded report.`;

    $('#finance-custom-range').hidden=range.type!=='custom';
    const prevDelta=period.delta.netCashMovement,pct=period.percentage.netCashMovement;
    const compareNote=period.previous?.netCashMovement!==undefined?`Previous period ${money(period.previous.netCashMovement)} · change ${prevDelta>=0?'+':''}${money(prevDelta)}${pct===null?'':` (${pct>=0?'+':''}${pct.toFixed(1)}%)`}`:'No previous-period comparison available';
    $('#finance-overview-metrics').innerHTML=[
      financeMetricHTML('Closing balance',period.closingBalance,period.closingBalanceComplete?'At selected period end':'Historical estimate is provisional'),
      financeMetricHTML('Income received',period.income,'Earned income only'),
      financeMetricHTML('Expenses',period.grossExpenses,'Before separately listed refunds'),
      financeMetricHTML('Net cash movement',period.netCashMovement,compareNote,period.netCashMovement<0?'var(--red)':'var(--green)')
    ].join('');
    const coverage=[period.historyNote];
    if(Math.abs(period.reconciliationDifference)>0.01)coverage.push(`Period movements and account balances differ by ${money(period.reconciliationDifference)}. Check uncategorised or missing account entries.`);
    $('#finance-coverage-note').textContent=coverage.join(' ');
    renderFinanceCategoryComparison(range);renderFinanceSalaryAndBudget(range);renderFinancePriorities();
    const type=$('#finance-period-type');if(type)type.value=range.type;
    const anchor=$('#finance-period-anchor');if(anchor)anchor.value=financeAnchor;
    const customStart=$('#finance-custom-start'),customEnd=$('#finance-custom-end');if(customStart&&!customStart.value){customStart.value=range.start;customEnd.value=range.end;}
    const next=$('#finance-period-next');if(next){let nextStart;if(range.type==='week')nextStart=finance.addDays(range.start,7);else if(range.type==='year')nextStart=`${Number(range.start.slice(0,4))+1}-01-01`;else if(range.type==='month'){const d=dateFrom(range.start);d.setDate(1);d.setMonth(d.getMonth()+1);nextStart=localDate(d);}else nextStart=finance.addDays(range.end,1);next.disabled=nextStart>today();}
  }
  function financeAllocationRowHTML(rule={}){
    const activities=state.activities.filter(activity=>!activity.archived&&(activity.kind==='expense'||activity.kind==='both'));
    const targetValue=rule.type==='category'?`category:${rule.activityId||''}`:(['savings','debt','discretionary'].includes(rule.type)?rule.type:'');
    const options=[...activities.map(activity=>`<option value="category:${escapeHTML(activity.id)}" ${targetValue===`category:${activity.id}`?'selected':''}>${escapeHTML(activity.name)}</option>`),`<option value="savings" ${targetValue==='savings'?'selected':''}>Savings</option>`,`<option value="debt" ${targetValue==='debt'?'selected':''}>Debt repayment</option>`,`<option value="discretionary" ${targetValue==='discretionary'?'selected':''}>Discretionary</option>`].join('');
    return `<article class="finance-modal-allocation-row">
      <div class="finance-modal-allocation-top">
        <div class="form-field finance-modal-allocation-target"><label>ALLOCATE TO</label><select name="allocationTarget">${options}</select></div>
        <button type="button" class="finance-modal-allocation-remove" data-finance-remove-allocation aria-label="Remove allocation">×</button>
      </div>
      <div class="finance-modal-allocation-controls">
        <div class="form-field finance-modal-allocation-rule"><label>ALLOCATION TYPE</label><select name="allocationMode"><option value="fixed" ${rule.mode!=='percent'?'selected':''}>Fixed amount</option><option value="percent" ${rule.mode==='percent'?'selected':''}>Percentage</option></select></div>
        <div class="form-field finance-modal-allocation-value"><label>VALUE</label><input name="allocationValue" type="number" min="0" step="0.01" value="${rule.value??''}" placeholder="0.00" inputmode="decimal"></div>
        <label class="finance-allocation-enabled"><input name="allocationEnabled" type="checkbox" ${rule.enabled===false?'':'checked'}> Include this rule in my plan</label>
      </div>
    </article>`;
  }
  function syncFinanceSalaryPaydayFields(){
    const frequency=$('#finance-salary-frequency')?.value||'monthly';
    const monthly=$('[data-finance-payday-monthly]'),anchor=$('[data-finance-payday-anchor]');
    if(monthly)monthly.hidden=frequency!=='monthly';
    if(anchor)anchor.hidden=frequency==='monthly';
  }
  function salaryPlanForm(){
    const plan=state.settings.salaryPlan||{expectedSalary:0,frequency:'monthly',paydayDay:1,paydayDate:null,allocations:[]};
    const rows=(plan.allocations||[]).map(financeAllocationRowHTML).join('');
    openModal('Salary & budget plan',`<form id="finance-salary-plan-form" class="modal-body finance-salary-form">
      <div class="finance-salary-intro"><strong>Give every payday a plan.</strong><p>Set your expected take-home pay, choose when you receive it, then assign amounts to categories or planning goals. Nothing here creates a transaction or moves money.</p></div>
      <section class="finance-salary-section" aria-labelledby="finance-pay-details-title">
        <div class="finance-salary-section-heading"><span class="finance-salary-step">01</span><div><strong id="finance-pay-details-title">Pay details</strong><small>Your usual take-home amount and schedule</small></div></div>
        <div class="finance-pay-grid">
          <div class="form-field finance-pay-amount"><label for="finance-expected-salary">EXPECTED TAKE-HOME PAY · INR</label><input id="finance-expected-salary" name="expectedSalary" type="number" min="0" step="0.01" value="${Number(plan.expectedSalary)||0}" inputmode="decimal" placeholder="0.00"></div>
          <div class="form-field"><label for="finance-salary-frequency">PAY FREQUENCY</label><select id="finance-salary-frequency" name="frequency"><option value="monthly" ${plan.frequency==='monthly'?'selected':''}>Monthly</option><option value="fortnightly" ${plan.frequency==='fortnightly'?'selected':''}>Every 2 weeks</option><option value="weekly" ${plan.frequency==='weekly'?'selected':''}>Weekly</option></select></div>
          <div class="form-field" data-finance-payday-monthly><label for="finance-payday-day">PAYDAY OF THE MONTH</label><input id="finance-payday-day" name="paydayDay" type="number" min="1" max="31" value="${Number(plan.paydayDay??1)}" inputmode="numeric"><small class="muted">1–31. Short months use their final day.</small></div>
          <div class="form-field" data-finance-payday-anchor><label for="finance-payday-date">NEXT KNOWN PAYDAY</label><input id="finance-payday-date" name="paydayDate" type="date" value="${escapeHTML(plan.paydayDate||today())}"><small class="muted">Weekly and fortnightly dates are counted from this anchor.</small></div>
        </div>
      </section>
      <section class="finance-salary-section" aria-labelledby="finance-allocation-title">
        <div class="finance-salary-section-heading"><span class="finance-salary-step">02</span><div><strong id="finance-allocation-title">Allocation rules</strong><small>Choose existing categories or a savings/debt goal</small></div></div>
        <details class="form-disclosure finance-allocation-details" ${rows?'open':''}>
          <summary><span class="disclosure-title">${icon('sliders')} Allocation rules</span><span class="disclosure-hint">Optional · ${plan.allocations?.length||0} set</span></summary>
          <div class="disclosure-content">
            <div id="finance-allocation-rows" class="finance-allocation-list">${rows||'<p class="muted small finance-no-allocation">No allocation rules yet. Your salary plan can be saved without them.</p>'}</div>
            <button class="finance-add-allocation-button" type="button" data-finance-add-allocation><span aria-hidden="true">+</span> Add allocation rule</button>
            <p class="finance-form-guidance">Percentage rules use actual salary received in the current pay cycle when available; otherwise they use expected pay. Fixed rules stay at the amount entered. Aruvi warns when the active plan exceeds available income.</p>
          </div>
        </details>
      </section>
      <div class="form-actions finance-salary-form-actions"><button type="button" class="secondary-button" data-cancel-modal>Cancel</button><button type="submit" class="primary-button">Save plan</button></div>
    </form>`,'BUDGET PLANNING');
    syncFinanceSalaryPaydayFields();
  }
  async function saveSalaryPlan(form){
    const fd=new FormData(form),expected=Number(fd.get('expectedSalary')||0),frequency=String(fd.get('frequency')||'monthly'),paydayDay=Number(fd.get('paydayDay')),paydayDate=String(fd.get('paydayDate')||'');
    if(!Number.isFinite(expected)||expected<0){toast('Enter a valid expected take-home salary.','error');return;}
    if(!['monthly','fortnightly','weekly'].includes(frequency)){toast('Choose a supported salary frequency.','error');return;}
    const validMonthlyPayday=Number.isInteger(paydayDay)&&paydayDay>=1&&paydayDay<=31;
    if(frequency==='monthly'&&!validMonthlyPayday){toast('Monthly payday must be between 1 and 31.','error');return;}
    if(frequency!=='monthly'&&!finance.validISO(paydayDate)){toast('Choose a known payday date to anchor the pay cycle.','error');return;}
    const allocations=[];let percentTotal=0;
    $$('#finance-allocation-rows .finance-modal-allocation-row').forEach(row=>{
      const target=row.querySelector('[name="allocationTarget"]')?.value||'',mode=row.querySelector('[name="allocationMode"]')?.value||'fixed',raw=row.querySelector('[name="allocationValue"]')?.value;
      if(raw===''||!target)return;
      const value=Number(raw);if(!Number.isFinite(value)||value<0|| (mode==='percent'&&value>100))throw new Error('Each allocation must have a non-negative value. Percentage rules cannot exceed 100% individually.');
      const normalized=mode==='percent'?Math.round(value*100)/100:fromMinorUnits(toMinorUnits(value));
      const enabled=!!row.querySelector('[name="allocationEnabled"]')?.checked;
      if(mode==='percent'&&enabled)percentTotal+=normalized;
      if(target.startsWith('category:'))allocations.push({id:uid('alloc'),type:'category',activityId:target.slice(9),mode,value:normalized,enabled});
      else allocations.push({id:uid('alloc'),type:target,mode,value:normalized,enabled});
    });
    if(percentTotal>100.0001){toast('Combined percentage allocations cannot exceed 100%.','error');return;}
    const snapshot=JSON.stringify(state);
    state.settings.salaryPlan={expectedSalary:fromMinorUnits(toMinorUnits(expected)),frequency,paydayDay:validMonthlyPayday?paydayDay:(Number.isInteger(paydayDay)&&paydayDay>=1&&paydayDay<=31?paydayDay:1),paydayDate:paydayDate||null,allocations};
    if(!(await persistMutation(snapshot,'Could not save the salary plan. Your previous settings were restored.')))return;
    closeModal();renderAll();const summary=finance.salaryAllocationSummary(state,today());toast(summary.overAllocated?'Salary plan saved, but enabled allocations exceed available pay.':'Salary allocation plan saved.',summary.overAllocated?'amber':'success');
  }
  async function openFinancialReport(kind){
    if(!finance)return;
    const range=financeSelectedRange();if(!range){toast('Choose valid report dates first.','error');return;}
    const effectiveRange={start:range.start,end:range.effectiveEnd,type:range.type};
    const reportDate=today(),generated=new Date().toLocaleString(),isPartial=effectiveRange.end<range.end,periodLabel=range.type==='year'?`${range.start.slice(0,4)}${isPartial?` (through ${effectiveRange.end})`:''}`:`${range.start} to ${effectiveRange.end}${isPartial?' (to date)':''}`;
    let title,sections='';
    const reportTable=(headers,rows,options={})=>{
      const numericColumns=Array.isArray(options.numericColumns)?options.numericColumns:headers.map((_,index)=>index).filter(index=>index>0);
      const wrapColumns=Array.isArray(options.wrapColumns)?options.wrapColumns:[];
      const columnClass=index=>[numericColumns.includes(index)?'is-numeric':'',wrapColumns.includes(index)?'is-wrap':''].filter(Boolean).join(' ');
      const widths=headers.length===2?['66%','34%']:headers.length===3?['42%','33%','25%']:headers.length===4?['34%','22%','22%','22%']:['31%','17.25%','17.25%','17.25%','17.25%'];
      const headerCells=headers.map((value,index)=>`<th scope="col" class="${columnClass(index)}">${escapeHTML(value)}</th>`).join('');
      const dataRows=(rows||[]).map(row=>({cells:row,total:false}));
      if(!dataRows.length)dataRows.push({cells:[options.emptyText||'No records are available for this reporting period.'],empty:true});
      (options.totalRows||[]).forEach(row=>dataRows.push({cells:row,total:true}));
      const body=dataRows.map(item=>item.empty?`<tr><td class="empty-cell" colspan="${headers.length}">${escapeHTML(String(item.cells[0]))}</td></tr>`:`<tr class="${item.total?'total-row':''}">${item.cells.map((value,index)=>`<td class="${columnClass(index)}">${escapeHTML(String(value??''))}</td>`).join('')}</tr>`).join('');
      return `<div class="report-table-wrap"><table class="report-table report-table-${headers.length}"><colgroup>${widths.map(width=>`<col style="width:${width}">`).join('')}</colgroup><thead><tr>${headerCells}</tr></thead><tbody>${body}</tbody></table></div>`;
    };
    if(kind==='category'){
      title='Category Comparison Report';
      const comparison=finance.compareCategories(state,range.type,range.start,range);
      const currentMinor=comparison.categories.reduce((sum,row)=>sum+toMinorUnits(row.currentTotal),0);
      const previousMinor=comparison.categories.reduce((sum,row)=>sum+toMinorUnits(row.previousTotal),0);
      const delta=currentMinor-previousMinor,pct=previousMinor?delta/previousMinor*100:null;
      const previousRangeLabel=comparison.previousRange?`${financeDateLabel(comparison.previousRange.start)} – ${financeDateLabel(comparison.previousRange.end)}`:'Not available';
      const selectedRangeLabel=`${financeDateLabel(comparison.currentRange.start)} – ${financeDateLabel(comparison.currentRange.end)}`;
      const detailRows=comparison.categories.map(row=>{
        const change=toMinorUnits(row.currentTotal)-toMinorUnits(row.previousTotal);
        const changePct=toMinorUnits(row.previousTotal)>0?`${change>=0?'+':''}${(change/toMinorUnits(row.previousTotal)*100).toFixed(1)}%`:'No previous spend';
        return [row.name,money(row.currentTotal),money(row.previousTotal),`${change>=0?'+':'−'}${money(fromMinorUnits(Math.abs(change)))}`,changePct];
      });
      const chartLegend=`<div class="chart-legend"><span><i class="current"></i>Selected period</span><span><i class="previous"></i>Previous period</span></div>${financeCategoryLegendHTML(comparison)}`;
      sections=`<div class="summary"><div><small>Selected-period category spend</small><strong>${escapeHTML(money(fromMinorUnits(currentMinor)))}</strong></div><div><small>Previous-period spend</small><strong>${escapeHTML(money(fromMinorUnits(previousMinor)))}</strong></div><div><small>Change</small><strong>${escapeHTML(`${delta>=0?'+':'−'}${money(fromMinorUnits(Math.abs(delta)))}`)}${pct===null?'':` (${pct>=0?'+':''}${pct.toFixed(1)}%)`}</strong></div></div>
        <p class="meta">Selected: ${escapeHTML(selectedRangeLabel)} · Compared with: ${escapeHTML(previousRangeLabel)}</p>
        <h2>Category spending comparison</h2>${chartLegend}<div class="report-category-chart">${financeCategoryGraphSVG(comparison)}</div>
        <h2>Category detail</h2>${reportTable(['Category','Selected period','Previous period','Change','Change %'],detailRows,{numericColumns:[1,2,3,4],wrapColumns:[4],totalRows:[['Total net category spending',money(fromMinorUnits(currentMinor)),money(fromMinorUnits(previousMinor)),`${delta>=0?'+':'−'}${money(fromMinorUnits(Math.abs(delta)))}`,pct===null?'Not available':`${pct>=0?'+':''}${pct.toFixed(1)}%`]]})}
        <p class="note category-report-note">Net spend = expenses less refunds. Transfers and debt movements are excluded; percentage change is omitted for a zero prior-period baseline.</p>`;
    }else if(kind==='cashflow'){
      title='Cash Flow Statement';const statement=finance.cashFlowStatement(state,effectiveRange),inRows=[['Salary',statement.inflows.salary],['Other earned income',statement.inflows.otherIncome],['Refunds',statement.inflows.refunds],['Repayments received',statement.inflows.repaymentsReceived],['Money borrowed',statement.inflows.borrowed],['Other inflows',statement.inflows.other]],outRows=[['Everyday expenses',statement.outflows.everydayExpenses],['Bills',statement.outflows.bills],['Shopping',statement.outflows.shopping],['Subscriptions',statement.outflows.subscriptions],['Debt principal repayments',statement.outflows.debtRepayments],['Money lent',statement.outflows.moneyLent],['Other outflows',statement.outflows.other]];
      const table=(rows,totalLabel,total)=>reportTable(['Description','Amount (INR)'],rows.map(row=>[row[0],money(row[1])]),{numericColumns:[1],totalRows:[[totalLabel,money(total)]]});
      sections=`<div class="summary"><div><small>Opening cash position</small><strong>${escapeHTML(money(statement.openingBalance))}</strong></div><div><small>Net cash movement</small><strong>${escapeHTML(money(statement.netCashMovement))}</strong></div><div><small>Closing cash position</small><strong>${escapeHTML(money(statement.closingBalance))}</strong></div></div><h2>Cash inflows</h2>${table(inRows,'Total inflows',statement.totalInflows)}<h2>Cash outflows</h2>${table(outRows,'Total outflows',statement.totalOutflows)}<div class="reconcile"><span>Opening position + net movement</span><strong>${escapeHTML(money(statement.openingBalance+statement.netCashMovement))}</strong></div><div class="reconcile"><span>Calculated closing position</span><strong>${escapeHTML(money(statement.closingBalance))}</strong></div><p class="note">Internal account transfers are excluded from consolidated inflows and outflows. ${statement.openingComplete&&statement.closingComplete?'Historical account coverage is complete based on recorded opening balances and transactions.':'Historical balance coverage is provisional because one or more account opening dates or pre-history records are incomplete.'} ${Math.abs(statement.reconciliationDifference)>0.01?`Reconciliation difference: ${money(statement.reconciliationDifference)}. Review account assignments and transaction history.`:''}</p>`;
      const planning=finance.budgetDashboard(state,{...range,effectiveEnd:effectiveRange.end},reportDate);
      const salary=planning.salary;
      const allocationRows=salary.allocations.map(row=>{const activity=row.activityId?activityById(row.activityId):null;const label=activity?.name||({savings:'Savings plan',debt:'Debt repayment plan',discretionary:'Discretionary spending'}[row.type]||row.type||'Allocation');return [label,`${row.mode==='percent'?`${Number(row.value)||0}%`:'Fixed amount'} · ${salary.payCycles} pay cycle${salary.payCycles===1?'':'s'}`,money(row.amount)];});
      const budgetRows=planning.rows.map(row=>[row.name,money(row.plannedAllocation),money(row.spent),money(row.remaining)]);
      sections+=`<h2>Salary & budget plan · ${escapeHTML(({week:'week',month:'month',year:'year',custom:'selected period'})[range.type]||'period')}</h2><p class="note">This is a planning addendum configured in Aruvi. It is not part of the cash-flow movement above. Allocation rules do not create transactions, move cash or change the closing balance.</p><div class="summary"><div><small>Expected salary for period</small><strong>${escapeHTML(money(salary.expectedSalaryForPeriod??salary.expectedSalary))}</strong></div><div><small>Actual salary received</small><strong>${escapeHTML(money(salary.actualSalary))}</strong></div><div><small>Unallocated salary</small><strong>${escapeHTML(money(salary.unallocated))}</strong></div></div><p class="meta">Pay frequency: ${escapeHTML(salary.frequency)} · Scheduled pay cycles: ${salary.payCycles} · Allocations use ${salary.usesActual?'recorded salary':'expected salary'} where available.</p><h2>Configured salary allocations</h2>${reportTable(['Allocation','Rule','Period amount'],allocationRows,{numericColumns:[2],emptyText:'No configured salary allocations for this period.'})}<h2>Budget by category</h2>${reportTable(['Category','Period plan','Actual spent','Remaining'],budgetRows,{numericColumns:[1,2,3],emptyText:'No category budgets are configured for this period.'})}<p class="note">Existing category limits are based on monthly budget values scaled to this reporting period. Expected salary is a forecast only. Borrowing, lending and transfers are not treated as earned salary.</p>`;
    }else{
      title='Personal Balance Sheet';const sheet=finance.balanceSheet(state,effectiveRange.end),positive=sheet.accounts.filter(a=>a.amount!==null&&a.amount>=0),negative=sheet.accounts.filter(a=>a.amount!==null&&a.amount<0);
      const rows=(items)=>items.map(account=>[`${account.name} (${account.type})`,money(Math.abs(account.amount))]);
      const debts=(items)=>items.map(debt=>[debt.person,money(debt.amount)]);
      sections=`<div class="summary"><div><small>Total assets</small><strong>${escapeHTML(money(sheet.totalAssets))}</strong></div><div><small>Total liabilities</small><strong>${escapeHTML(money(sheet.totalLiabilities))}</strong></div><div><small>Net worth</small><strong>${escapeHTML(money(sheet.netWorth))}</strong></div></div><h2>Assets · positive account balances</h2>${reportTable(['Account','Amount (INR)'],rows(positive),{numericColumns:[1],totalRows:[['Total tracked cash',money(sheet.cash)]],emptyText:'No positive account balances are recorded.'})}<h2>Receivables · money owed to you</h2>${reportTable(['Person / record','Outstanding'],debts(sheet.receivablesList),{numericColumns:[1],totalRows:[['Total receivables',money(sheet.receivables)]],emptyText:'No outstanding receivables are recorded.'})}<h2>Liabilities</h2>${reportTable(['Account / person','Outstanding'],[...rows(negative),...debts(sheet.debtsPayableList)],{numericColumns:[1],totalRows:[['Total liabilities',money(sheet.totalLiabilities)]],emptyText:'No tracked liabilities are recorded.'})}<p class="note">${escapeHTML(sheet.coverageNote)}</p>`;
    }
    const reportStyles=`
      :root{color-scheme:light;--report-ink:#1d2a22;--report-muted:#65736a;--report-line:#dfe7e0;--report-green:#16784a;--report-green-soft:#edf6ef;--report-wash:#f5f8f5}
      *{box-sizing:border-box}
      html{-webkit-text-size-adjust:100%;text-size-adjust:100%;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      body{margin:0;padding:24px;background:#edf2ed;color:var(--report-ink);font:11px/1.48 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-variant-numeric:tabular-nums}
      .report-actions{width:min(100%,210mm);margin:0 auto 12px;display:flex;justify-content:flex-end}
      .report-actions button{min-height:42px;padding:10px 16px;border:0;border-radius:10px;background:var(--report-green);color:#fff;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}
      .report-page{width:min(100%,210mm);min-height:250mm;margin:0 auto;padding:17mm 16mm 14mm;background:#fff;border:1px solid #e0e8e0;border-top:4px solid var(--report-green);box-shadow:0 12px 38px #1b352514}
      .report-brand-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:15px;border-bottom:1px solid var(--report-line)}
      .report-brand{display:flex;align-items:center;gap:10px;color:var(--report-green);font-size:18px;font-weight:850;letter-spacing:-.5px}
      .report-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--report-green-soft);font-size:19px}
      .report-private{color:var(--report-muted);font-size:9px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;text-align:right}
      .report-eyebrow{margin:16px 0 3px;color:var(--report-green);font-size:9px;line-height:1.3;letter-spacing:1.35px;font-weight:850;text-transform:uppercase}
      .report-page h1{margin:0;color:var(--report-ink);font-size:26px;line-height:1.16;letter-spacing:-.85px;font-weight:800}
      .report-meta{display:flex;flex-wrap:wrap;gap:5px 14px;margin:7px 0 14px;color:var(--report-muted);font-size:9px;line-height:1.45}
      .report-period-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:6px;background:var(--report-green-soft);color:var(--report-green);font-weight:750}
      .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0 15px}
      .summary>div{min-width:0;padding:11px 12px;border:1px solid var(--report-line);border-radius:9px;background:#fbfdfb}
      .summary small{display:block;margin-bottom:5px;color:var(--report-muted);font-size:8px;line-height:1.35;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
      .summary strong{display:block;color:var(--report-ink);font-size:16px;line-height:1.2;font-weight:800;letter-spacing:-.35px;overflow-wrap:anywhere}
      .report-page h2{margin:12px 0 6px;padding-bottom:6px;border-bottom:1px solid var(--report-line);color:var(--report-ink);font-size:13px;line-height:1.3;font-weight:800;letter-spacing:-.15px;break-after:avoid;page-break-after:avoid}
      .report-table-wrap{width:100%;min-width:0;margin:0 0 17px;break-inside:auto;page-break-inside:auto}
      .report-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0;font-size:9.2px;line-height:1.4}
      .report-table thead{display:table-header-group}
      .report-table th{padding:8px 7px;background:#f0f5f0;border-top:1px solid var(--report-line);border-bottom:1px solid #ccd8ce;color:#59685e;text-align:left;vertical-align:bottom;font-size:7.6px;line-height:1.3;font-weight:800;letter-spacing:.055em;text-transform:uppercase;white-space:normal;overflow-wrap:anywhere}
      .report-table td{padding:8px 7px;border-bottom:1px solid #e8eee8;color:#263229;text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere;word-break:normal}
      .report-table th.is-numeric,.report-table td.is-numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:normal}
      .report-table th.is-numeric.is-wrap,.report-table td.is-numeric.is-wrap{white-space:normal;overflow-wrap:anywhere;word-break:normal}
      .report-table tbody tr:nth-child(even):not(.total-row){background:#fbfcfb}
      .report-table .total-row td{background:#f0f6f1;border-top:1.5px solid #aebeb0;border-bottom:1px solid #cfdacf;font-weight:850;color:#173f2a}
      .report-table-5 th,.report-table-5 td{padding:6px 6px}
      .report-table .empty-cell{text-align:left;color:var(--report-muted);font-style:italic;padding:13px 8px}
      .reconcile{display:flex;justify-content:space-between;align-items:baseline;gap:16px;padding:9px 0;border-bottom:1px solid var(--report-line);font-size:9.5px}
      .reconcile span{color:var(--report-muted)}
      .reconcile strong{color:var(--report-ink);font-size:11px;white-space:nowrap}
      .note{margin:14px 0 18px;padding:10px 12px;border-left:3px solid #7cad89;border-radius:0 7px 7px 0;background:#f4f8f4;color:#58675d;font-size:8.5px;line-height:1.5;break-inside:avoid;page-break-inside:avoid}
      .category-report-note{margin:5px 0 0!important;padding:5px 8px!important;border-left-width:2px!important;font-size:7.6px!important;line-height:1.35!important}
      .report-footer{display:flex;justify-content:space-between;gap:12px;margin-top:16px;padding-top:9px;border-top:1px solid var(--report-line);color:#76847a;font-size:8px}
      .chart-legend{display:flex;align-items:center;flex-wrap:wrap;gap:7px 16px;margin:5px 0 8px;color:var(--report-muted);font-size:8.5px}
      .chart-legend span{display:inline-flex;align-items:center;gap:6px}
      .chart-legend i{display:inline-block;width:17px;border-top:2.5px solid var(--report-green)}
      .chart-legend .previous{border-top-style:dashed;opacity:.6}
      .finance-category-name-legend{display:flex;align-items:center;flex-wrap:wrap;gap:6px 13px;margin:7px 0 10px;color:#526157;font-size:8px}
      .finance-category-name-legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
      .finance-category-name-legend i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--category-color)}
      .report-category-chart{width:100%;margin:6px 0 10px;padding:7px 8px;border:1px solid var(--report-line);border-radius:8px;background:#fcfdfc;break-inside:avoid;page-break-inside:avoid}
      .report-category-chart svg{display:block;width:100%;max-width:100%;height:auto;max-height:390px;overflow:hidden;color:#526157}
      .report-category-chart svg text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
      @page{size:A4 portrait;margin:10mm 12mm 11mm}
      @media(max-width:620px){body{padding:8px}.report-page{width:100%;min-height:0;padding:24px 18px}.report-page h1{font-size:23px}.summary{gap:6px}.summary>div{padding:8px}.summary strong{font-size:13px}.report-table{font-size:8px}.report-table th,.report-table td{padding:7px 4px}.report-table th.is-numeric,.report-table td.is-numeric{white-space:normal;overflow-wrap:anywhere}.report-private{font-size:7px}}
      @media print{html,body{margin:0!important;padding:0!important;background:#fff!important;color:#1d2a22!important}.report-actions{display:none!important}.report-page{width:auto!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;border-top:3px solid var(--report-green)!important;box-shadow:none!important}.report-brand-row{break-inside:avoid;page-break-inside:avoid}.summary,.reconcile,.note,.report-category-chart{break-inside:avoid;page-break-inside:avoid}.report-table-wrap{overflow:visible!important} .report-table{width:100%!important;table-layout:fixed!important} .report-table thead{display:table-header-group!important}.report-table tfoot{display:table-footer-group!important}.report-table tr{break-inside:avoid!important;page-break-inside:avoid!important}.report-page h2{break-after:avoid!important;page-break-after:avoid!important}.report-category-chart svg{width:88%!important;max-height:none!important;margin:0 auto}.report-footer{break-inside:avoid;page-break-inside:avoid}}
    `;
    const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Aruvi · ${escapeHTML(title)}</title><style>${reportStyles}</style></head><body><div class="report-actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div><main class="report-page"><header class="report-brand-row"><div class="report-brand"><span class="report-mark">₹</span><span>Aruvi</span></div><span class="report-private">Private · Stored on this device</span></header><div class="report-eyebrow">Personal finance report</div><h1>${escapeHTML(title)}</h1><div class="report-meta"><span class="report-period-chip">${escapeHTML(periodLabel)}</span><span>Generated ${escapeHTML(generated)}</span><span>Currency: INR (₹)</span></div>${sections}<footer class="report-footer"><span>Aruvi · Private local report</span><span>Generated ${escapeHTML(reportDate)}</span></footer></main></body></html>`;
    const reportSlug={cashflow:'cash-flow-statement',balance:'personal-balance-sheet',category:'category-comparison'}[kind]||'financial-report';
    const fileName=`aruvi-${reportSlug}-${range.effectiveEnd}.pdf`;
    await deliverGeneratedPDF(html,fileName,`Aruvi ${title}`);
  }
  function forecastingSignature(){
    let hash=2166136261;
    for(const tx of state.transactions||[]){
      const value=[tx.id,tx.date,tx.type,tx.amount,tx.activityId,tx.accountId,tx.merchantName,tx.note].join('|');
      for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
      hash^=10;hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(36);
  }
  function forecastMoney(minorValue){return Number.isFinite(Number(minorValue))?fmtHidden(Number(minorValue)/100):'—';}
  function forecastStatusLabel(status){return status==='live-calibrated'?'Live calibrated':status==='backtest-calibrated'?'Backtest-calibrated':status==='early'?'Early estimate':status==='ready'?'Estimate':'Still learning';}
  function forecastWindowCard(window,flow,label){
    const result=window&&window[flow];
    if(!result)return `<article class="pw-forecast-window"><div class="pw-forecast-window-heading"><span>${label}</span><small>Still learning</small></div><strong class="pw-forecast-window-empty">Not enough history</strong><p>Log more transactions to unlock this forecast.</p></article>`;
    const calibration=result.calibration||{},status=calibration.state==='live-calibrated'?'live-calibrated':calibration.state==='backtest-calibrated'?'backtest-calibrated':window.status==='early'?'early':'learning';
    const intervalLabel=status==='live-calibrated'?'80% target range · calibrated on live outcomes':status==='backtest-calibrated'?'80% target range · backtest only':'Exploratory range · not calibrated';
    return `<article class="pw-forecast-window"><div class="pw-forecast-window-heading"><span>${label}</span><small>${forecastStatusLabel(status)}</small></div><strong>${forecastMoney(result.medianMinor)}</strong><div class="pw-forecast-range"><span>Could be ${forecastMoney(result.lowerMinor)} – ${forecastMoney(result.upperMinor)}</span><small>${intervalLabel}</small></div><p>${flow==='expense'?'Spending estimate':'Income estimate'} · ${result.selection==='seasonalNaive'?'using the recent seasonal baseline':'equal-weight local ensemble'}</p></article>`;
  }
  function renderForecastingPanels(snapshot){
    const host=$('#pw-forecast-cards');if(!host)return;
    if(!snapshot){host.innerHTML='';return;}
    const windows=snapshot.windows||[];
    const heading={day:'Tomorrow',week:'Next 7 days',month:'Next 28 days'};
    host.innerHTML=windows.map(window=>`<section class="pw-forecast-range-group"><h3>${heading[window.key]||window.key}</h3><div class="pw-forecast-flow-cards">${forecastWindowCard(window,'expense','Spending')}${forecastWindowCard(window,'income','Income')}</div></section>`).join('');
    const whyHost=$('#pw-forecast-why');
    if(whyHost){
      const reasons=Array.isArray(snapshot.explanations)?snapshot.explanations:[];
      whyHost.innerHTML=reasons.length?reasons.map(item=>{
        const period=heading[item.window]||item.window;
        const scheduled=(item.scheduled||[]).slice(0,5).map(event=>`${escapeHTML(event.merchant||'Scheduled activity')} ${escapeHTML(event.date||'')} · ${forecastMoney(event.amountMedianMinor)} · ${Math.round((Number(event.p)||0)*100)}% observed-hit estimate`).join('; ');
        const patterns=(item.patterns||[]).slice(0,4).map(pattern=>`${escapeHTML(pattern.name)} (${escapeHTML(pattern.cadence)}, ${Math.round((Number(pattern.confidence)||0)*100)}% pattern confidence)`).join(', ');
        const width=Number.isFinite(Number(item.uncertainty))?forecastMoney(item.uncertainty):'not available';
        return `<div class="pw-forecast-why-row"><strong>${escapeHTML(period)}</strong><p>${scheduled?`Scheduled events: ${scheduled}.`:'No detected scheduled event falls inside this period.'} ${patterns?`Recurring signals: ${patterns}.`:'Not enough repeat observations for a habit explanation.'} The spending estimate has an exploratory range width of ${width}; one-off purchases can make it wider.</p></div>`;
      }).join(''):'<p class="muted small">Explanations will appear after the first forecast is generated.</p>';
    }
    const patterns=$('#pw-forecast-patterns');
    const streams=Array.isArray(snapshot.streams)?snapshot.streams:[];
    if($('#pw-pattern-count'))$('#pw-pattern-count').textContent=`${streams.length} detected`;
    if(patterns){
      if(!streams.length)patterns.innerHTML='<p class="muted small">No recurring patterns have been confirmed yet. More history may reveal bills and weekly habits.</p>';
      else patterns.innerHTML=streams.slice(0,10).map(stream=>{
        const status=stream.status||'auto';
        const statusText=status==='confirmed'?'Confirmed by you':status==='rejected'?'Rejected':status==='muted'?'Muted':stream.possible?'Possible pattern':'Suggested pattern';
        const amount=(Number(stream.amountModel?.medianMinor)||0)/100;
        const safeKey=escapeHTML(stream.key||'');
        const actions=status==='rejected'?`<button type="button" data-forecast-action="restore" data-forecast-key="${safeKey}">Restore</button>`:`<button type="button" data-forecast-action="confirm" data-forecast-key="${safeKey}" ${status==='confirmed'?'disabled':''}>Confirm</button><button type="button" data-forecast-action="reject" data-forecast-key="${safeKey}">Not recurring</button><button type="button" data-forecast-action="${status==='muted'?'unmute':'mute'}" data-forecast-key="${safeKey}">${status==='muted'?'Unmute':'Mute'}</button>`;
        return `<article class="pw-forecast-pattern" data-forecast-pattern="${safeKey}"><div class="pw-forecast-pattern-copy"><strong>${escapeHTML(stream.merchant||stream.activityId||'Recurring activity')}</strong><small>${escapeHTML(stream.cadence?.type||'pattern')} · ${Number(stream.occurrences)||0} records · ${Math.round((Number(stream.confidence)||0)*100)}% confidence</small><small>${escapeHTML(statusText)} · Next expected ${escapeHTML(stream.nextExpected||'not estimated')}</small></div><div class="pw-forecast-pattern-edit"><label>Amount ₹<input type="number" min="0" step="0.01" value="${amount.toFixed(2)}" data-forecast-amount></label><button type="button" data-forecast-action="save-amount" data-forecast-key="${safeKey}">Save</button></div><div class="pw-forecast-pattern-actions">${actions}</div></article>`;
      }).join('');
    }
    const notice=$('#pw-forecast-status');
    if(notice){
      const gaps=(snapshot.gapDays||[]).length;
      const calibrations=windows.flatMap(w=>['expense','income'].map(flow=>w[flow]?.calibration?.state)).filter(Boolean);
      const hasCalibrated=calibrations.includes('backtest-calibrated')||calibrations.includes('live-calibrated');
      notice.textContent=snapshot.historyDays<14?`You have ${snapshot.historyDays} days of usable history. The forecasting engine needs about 14 days before making an early estimate.`:hasCalibrated?(calibrations.includes('live-calibrated')?'Ranges are being calibrated against live outcomes on this device.':'Backtest-calibrated ranges are based on earlier history and may be optimistic until live forecasts are graded.'):'Forecasts are local estimates. Their ranges are not calibrated yet; recurring bills are generally more predictable than one-off spending.'+(gaps?` ${gaps} possible logging-gap days were excluded.`:'');
    }
    const tier=$('#pw-forecast-tier');if(tier){const earned=state.forecasting?.teacher?.brain?.tier;tier.textContent=earned||'Learning';}
  }
  function renderForecastLearning(){
    const host=$('#pw-forecast-learning');if(!host)return;
    const teacher=state.forecasting?.teacher,brain=teacher?.brain;
    const live=brain?(()=>{
      const n=Number(brain.graded)||0,skill=brain.skillVsNaive!==null&&brain.skillVsNaive!==undefined&&Number.isFinite(Number(brain.skillVsNaive))?`${Math.round(Number(brain.skillVsNaive)*100)}% vs seasonal baseline`:'Not enough baseline loss to compare';
      const coverage=brain.coverage!==null&&brain.coverage!==undefined&&Number.isFinite(Number(brain.coverage))?`${Math.round(Number(brain.coverage)*100)}% outer-interval coverage`:'Coverage still learning';
      const ci=Array.isArray(brain.coverageWilson)&&brain.coverageWilson.length===2?` · 95% interval ${Math.round(brain.coverageWilson[0]*100)}–${Math.round(brain.coverageWilson[1]*100)}%`:'';
      const calibration=brain.calibrationReady?'Live calibration active':'Calibrating · 20 live grades per weekly flow needed';
      return `<section class="pw-teacher-live"><div class="pw-teacher-live-heading"><strong>Live learning</strong><span>${escapeHTML(String(brain.tier||'Learning'))}</span></div><div class="pw-teacher-live-metrics"><div><strong>${n}</strong><small>weekly live grades</small></div><div><strong>${Number(teacher.points)||0}</strong><small>points earned</small></div><div><strong>${Number(teacher.streak)||0}</strong><small>coverage streak</small></div></div><p>${escapeHTML(skill)} · ${escapeHTML(coverage)}${escapeHTML(ci)}</p><small>${escapeHTML(calibration)}. ${Number(brain.catchupGraded)||0} reconstructed catch-up grades are reported separately and do not increase live skill or points.</small></section>`;
    })():'';
    const backtest=state.forecasting?.backtest;
    if(!backtest||backtest.status!=='complete'){
      const status=backtest?.status==='running'?`<p class="muted small">Studying your history: ${Number(backtest.completed)||0}/${Number(backtest.jobs)||0}. This work runs in a separate local worker.</p>`:'<p class="muted small">A rolling-origin backtest will run once enough history is available. Backtest results are not the same as live accuracy.</p>';
      host.innerHTML=live+status;return;
    }
    const summary=backtest.summary||{};
    const rows=[['7-day spending','week_expense'],['7-day income','week_income'],['28-day spending','month_expense'],['28-day income','month_income']];
    host.innerHTML=live+`<p class="muted small">${Number(backtest.completed)||0} historical forecasts graded · backtest-derived</p><div class="pw-forecast-score-list">${rows.map(([label,key])=>{const item=summary[key]||{};const skill=item.skillVsNaive!==null&&item.skillVsNaive!==undefined&&Number.isFinite(Number(item.skillVsNaive))?`${Math.round(Number(item.skillVsNaive)*100)}% vs baseline`:'Baseline is a zero-loss result';const coverage=item.coverage!==null&&item.coverage!==undefined&&Number.isFinite(Number(item.coverage))?`${Math.round(item.coverage*100)}% interval coverage`:'Coverage unavailable';return `<div><span>${label}</span><strong>${item.n?`${Number(item.n)} grades`:'Not enough grades'}</strong><small>${escapeHTML(skill)} · ${escapeHTML(coverage)}</small></div>`;}).join('')}</div>`;
  }
  function ensureForecastingClient(){
    if(!forecastingClient&&window.PocketWiseForecasting)forecastingClient=window.PocketWiseForecasting.createClient({onFallback:error=>console.warn('Aruvi forecasting worker unavailable; using local fallback.',error)});
    return forecastingClient;
  }
  async function processForecastTeacher(transactions,labels,asOf){
    if(forecastingTeacherRunning)return;
    const current=state.forecasting?.teacher;
    const core=window.PocketWiseForecastCore;
    const historyDays=core?core.buildDailySeries(transactions,asOf,{maxDays:365}).historyDays:0;
    const backtest=state.forecasting?.backtest;
    const labelSignature=JSON.stringify(Object.keys(labels||{}).sort().map(key=>[key,labels[key]]));
    const expectedBacktestSignature=[forecastingSignature(),labelSignature].join('|');
    const backtestMatches=backtest?.signature===expectedBacktestSignature;
    // On a first run or changed history, the matching rolling-origin backtest
    // must seed calibration before the first live-origin forecast is committed.
    if(historyDays>=28&&(forecastingBacktestRunning||!backtestMatches||!['complete','failed'].includes(backtest?.status)))return;
    if(current?.lastOrigin===asOf)return;
    const client=ensureForecastingClient();if(!client||!window.PocketWiseForecastTeacher)return;
    forecastingTeacherRunning=true;
    try{
      let teacher=current||null,loops=0,pending=true;
      const teacherStateStamp=value=>JSON.stringify([value?.lastOrigin,Object.keys(value?.streamStats||{}).length,Object.values(value?.streamStats||{}).reduce((sum,row)=>sum+(Number(row.liveHits)||0)+(Number(row.liveMisses)||0),0),Object.entries(value?.circuitBreakers||{}).map(([key,row])=>[key,!!row?.tripped,Number(row?.recent?.length)||0]),Object.keys(value?.expertStats||{}).length]);
      const beforeTeacherSignature=teacherStateStamp(current);
      while(pending&&loops<14){
        const result=await client.runTeacher(transactions,labels,teacher,asOf,{
          seed:0x51a7e,
          paths:300,chunkDays:7,
          selections:state.forecasting?.selections||{},
          backtestCalibration:state.forecasting?.calibration||{}
        },progress=>{
          const host=$('#pw-forecast-learning');
          if(host&&progress.pending)host.innerHTML=`<p class="muted small">Catching up local forecast grades · ${escapeHTML(progress.nextOrigin||'')} onward. Your records stay on this device.</p>`;
        });
        if(!result||!result.teacher)throw new Error('Forecast teacher returned no state.');
        teacher=result.teacher;state.forecasting.teacher=teacher;
        await persistForecastState();renderForecastLearning();
        pending=!!result.pending;loops++;
      }
      if(pending){const host=$('#pw-forecast-learning');if(host)host.insertAdjacentHTML('beforeend','<p class="muted small">Catch-up paused at a safe checkpoint. It will continue the next time Aruvi is opened or returns to the foreground.</p>');}
      const afterTeacherSignature=teacherStateStamp(teacher);
      if(beforeTeacherSignature!==afterTeacherSignature&&!pending){state.forecasting.lastForecast=null;await persistForecastState();}
    }catch(error){console.error('Aruvi live forecast grading failed.',error);}
    finally{forecastingTeacherRunning=false;renderForecastLearning();if(state.forecasting?.lastForecast===null)void refreshForecasting(false);}
  }
  function persistForecastState(){return persist().catch(error=>{console.warn('Forecasting state could not be saved.',error);toast('Forecasts could not be saved. Your transactions remain untouched.','amber');});}
  async function refreshForecasting(force){
    const client=ensureForecastingClient(),host=$('#pw-forecast-status');if(!client||!window.PocketWiseForecastCore)return;
    const asOf=today(),signature=forecastingSignature(),labels=state.forecasting?.labels||{};
    const transactions=(state.transactions||[]).map(tx=>({...tx}));
    const labelSignature=JSON.stringify(Object.keys(labels).sort().map(key=>[key,labels[key]]));
    const teacherState=state.forecasting?.teacher||{};
    const breakerSignature=Object.entries(teacherState.circuitBreakers||{}).map(([key,value])=>[key,!!value?.tripped,Number(value?.recent?.length)||0]);
    const selectionSignature=JSON.stringify([state.forecasting?.selections,state.forecasting?.calibration,teacherState.lastOrigin||null,Object.keys(teacherState.streamStats||{}).length,Object.keys(teacherState.expertStats||{}).length,breakerSignature]);
    const backtestSignature=[signature,labelSignature].join('|');
    const requestKey=[asOf,signature,labelSignature,selectionSignature].join('|');
    const stored=state.forecasting?.lastForecast;
    const storedHistory=Number(stored?.historyDays)||0;
    const backtestSettled=storedHistory<28||['complete','failed'].includes(state.forecasting?.backtest?.status);
    if(!force&&stored&&stored.asOf===asOf&&stored.signature===signature&&stored.labelSignature===labelSignature&&stored.selectionSignature===selectionSignature&&backtestSettled&&state.forecasting?.backtest?.status!=='running'){renderForecastingPanels(stored);renderForecastLearning();await processForecastTeacher(transactions,labels,asOf);return;}
    if(forecastingRequestKey===requestKey)return;
    forecastingRequestKey=requestKey;
    if(host)host.textContent='Analysing your recorded transactions on this device…';
    try{
      const forecastTeacher=state.forecasting?.teacher||{};
      const result=await client.forecast(transactions,{asOf,labels,seed:parseInt(signature,36)||0x51a7e,paths:2000,selections:state.forecasting?.selections||{},calibration:state.forecasting?.calibration||{},streamStats:forecastTeacher.streamStats||{},expertStats:forecastTeacher.expertStats||{},circuitBreakers:forecastTeacher.circuitBreakers||{},regimeEvents:forecastTeacher.regimeEvents||[]});
      if(forecastingRequestKey!==requestKey)return;
      const compact={version:2,asOf,signature,labelSignature,selectionSignature,historyDays:result.historyDays,tier:result.tier,gapDays:result.gapDays||[],windows:result.windows||[],streams:(result.streams||[]).map(stream=>({...stream,matchedTransactionIds:undefined})),events:result.events||[],regimeChanges:result.regimeChanges||[],regimeActive:!!result.regimeActive,lookbackDays:Number(result.lookbackDays)||84,explanations:result.explanations||[]};
      state.forecasting.lastForecast=compact;
      renderForecastingPanels(compact);renderForecastLearning();await persistForecastState();
      const history=Number(result.historyDays)||0;
      const currentBacktest=state.forecasting.backtest;
      if(history>=28&&(!currentBacktest||currentBacktest.signature!==backtestSignature||currentBacktest.status!=='complete')&&!forecastingBacktestRunning){
        forecastingBacktestRunning=true;forecastingBacktestKey=backtestSignature;
        state.forecasting.backtest={status:'running',signature:backtestSignature,jobs:0,completed:0,summary:{}};
        renderForecastLearning();
        try{
          const test=await client.runBacktest(transactions,labels,asOf,progress=>{
            const progressHost=$('#pw-forecast-learning');
            if(progressHost)progressHost.innerHTML=`<p class="muted small">Studying your history: ${progress.completed}/${progress.total} · ${escapeHTML(progress.origin||'')}</p>`;
            state.forecasting.backtest={status:'running',signature,jobs:progress.total,completed:progress.completed,summary:{}};
          });
          if(test&&test.cancelled)throw new Error('Backtest cancelled before completion.');
          state.forecasting.grades=(test.grades||[]).slice(-250);
          state.forecasting.backtest={status:'complete',signature:backtestSignature,jobs:test.jobs||0,completed:test.completed||0,elapsedMs:test.elapsedMs||0,summary:test.summary||{}};
          state.forecasting.selections=test.selections||{};
          state.forecasting.calibration=test.calibration||{};
          state.forecasting.lastForecast=null;
          await persistForecastState();
          forecastingRequestKey='';
          renderForecastLearning();
          refreshForecasting(true);
        }catch(error){
          console.error('Aruvi initial backtest failed.',error);
          state.forecasting.backtest={status:'failed',signature:backtestSignature,jobs:state.forecasting.backtest?.jobs||0,completed:state.forecasting.backtest?.completed||0,message:error.message};
          await persistForecastState();renderForecastLearning();
        }finally{forecastingBacktestRunning=false;}
      }
      await processForecastTeacher(transactions,labels,asOf);
    }catch(error){
      if(forecastingRequestKey===requestKey)forecastingRequestKey='';
      console.error('Aruvi local forecast failed.',error);
      if(host)host.textContent='Forecasting is unavailable in this session. Your existing finance tools and records are unaffected.';
    }
  }
  function renderForecasting(){
    renderForecastingPanels(state.forecasting?.lastForecast||null);
    renderForecastLearning();
    refreshForecasting(false);
  }
  async function handleForecastingAction(button){
    const action=button.dataset.forecastAction,key=button.dataset.forecastKey||'';
    if(action==='export'){
      const payload={format:'pocketwise-forecast-learning',version:3,exportedAt:today(),labels:state.forecasting.labels||{},grades:state.forecasting.grades||[],backtest:state.forecasting.backtest||null,selections:state.forecasting.selections||{},calibration:state.forecasting.calibration||{},teacher:state.forecasting.teacher||null};
      downloadBlob(`aruvi-learning-${today()}.json`,new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}));toast('Forecast learning data exported.');return;
    }
    if(action==='import'){$('#pw-forecast-import')?.click();return;}
    if(action==='delete'){
      if(!confirm('Delete all forecasting patterns, labels, backtest grades and calibration data? Your transactions and other Aruvi records will remain.'))return;
      const snapshot=JSON.stringify(state);state.forecasting={version:3,labels:{},lastForecast:null,grades:[],backtest:null,selections:{},calibration:{},teacher:null};
      forecastingRequestKey='';if(!(await persistMutation(snapshot,'Could not delete forecasting data.')))return;renderForecasting();toast('Forecast learning data deleted.');return;
    }
    if(!key)return;
    const snapshot=JSON.stringify(state),label={...(state.forecasting.labels[key]||{})};
    if(action==='confirm')label.status='confirmed';
    else if(action==='reject')label.status='rejected';
    else if(action==='restore')label.status='auto';
    else if(action==='mute')label.status='muted';
    else if(action==='unmute')label.status='auto';
    else if(action==='save-amount'){
      const pattern=button.closest('[data-forecast-pattern]'),input=pattern?.querySelector('[data-forecast-amount]'),amount=Number(input?.value);
      if(!Number.isFinite(amount)||amount<=0){toast('Enter a valid recurring amount.','amber');return;}
      label.amountMinor=Math.round(amount*100);
    }else return;
    state.forecasting.labels[key]=label;state.forecasting.lastForecast=null;forecastingRequestKey='';
    if(!(await persistMutation(snapshot,'Could not save your pattern decision.')))return;
    refreshForecasting(true);toast(action==='confirm'?'Pattern confirmed.':action==='reject'?'Pattern rejected.':'Pattern updated.');
  }
  async function importForecastLearning(file){
    if(!file)return;
    if(file.size>2*1024*1024){toast('Learning data file is too large.','error');return;}
    try{
      const payload=JSON.parse(await file.text());
      if(payload.format!=='pocketwise-forecast-learning'||![1,2,3].includes(payload.version)||!payload.labels||typeof payload.labels!=='object'||Array.isArray(payload.labels)||!Array.isArray(payload.grades)||payload.grades.length>250)throw new Error('This is not a supported Aruvi learning export.');
      const importedLabels={};for(const [key,value] of Object.entries(payload.labels).slice(0,500)){if(key.length<=300&&value&&typeof value==='object'&&!Array.isArray(value)){const status=['auto','confirmed','rejected','muted'].includes(value.status)?value.status:'auto';const amountMinor=Number(value.amountMinor);importedLabels[key]={status,...(Number.isFinite(amountMinor)&&amountMinor>0?{amountMinor:Math.round(amountMinor)}:{})};}}
      const importedSelections={};for(const key of ['day_expense','day_income','week_expense','week_income','month_expense','month_income'])importedSelections[key]=payload.selections?.[key]==='seasonalNaive'?'seasonalNaive':'equalWeight';
      const importedCalibration={};for(const key of ['day_expense','day_income','week_expense','week_income','month_expense','month_income']){const value=payload.calibration?.[key];if(value&&typeof value==='object'&&!Array.isArray(value)){const scores=Array.isArray(value.scores)?value.scores.slice(-52).map(Number).filter(Number.isFinite):[];importedCalibration[key]={n:Math.min(52,Math.max(0,Number(value.n)||0)),scores,delta:Number.isFinite(Number(value.delta))?Number(value.delta):null,coverage:Number.isFinite(Number(value.coverage))?Number(value.coverage):null,source:'backtest'};}}
      const safeGrades=payload.grades.filter(g=>g&&typeof g==='object'&&!Array.isArray(g)&&typeof g.origin==='string'&&['day','week','month'].includes(g.window)).slice(-250);
      const safeBacktest=payload.backtest&&typeof payload.backtest==='object'&&!Array.isArray(payload.backtest)?{status:payload.backtest.status==='complete'?'complete':'failed',signature:String(payload.backtest.signature||'').slice(0,500),jobs:Math.max(0,Number(payload.backtest.jobs)||0),completed:Math.max(0,Number(payload.backtest.completed)||0),elapsedMs:Math.max(0,Number(payload.backtest.elapsedMs)||0),summary:payload.backtest.summary&&typeof payload.backtest.summary==='object'?payload.backtest.summary:{}}:null;
      const snapshot=JSON.stringify(state);const importedTeacher=payload.version>=2&&payload.teacher&&typeof payload.teacher==='object'&&!Array.isArray(payload.teacher)?{...payload.teacher,version:3,forecasts:Array.isArray(payload.teacher.forecasts)?payload.teacher.forecasts.slice(-1800):[],grades:Array.isArray(payload.teacher.grades)?payload.teacher.grades.slice(-600):[],streamPredictions:Array.isArray(payload.teacher.streamPredictions)?payload.teacher.streamPredictions.slice(-2400):[],regimeEvents:Array.isArray(payload.teacher.regimeEvents)?payload.teacher.regimeEvents.slice(-36):[]}:null;
      state.forecasting={version:3,labels:importedLabels,grades:safeGrades,backtest:safeBacktest,selections:importedSelections,calibration:importedCalibration,teacher:importedTeacher,lastForecast:null};
      if(!(await persistMutation(snapshot,'Could not import forecasting data.')))return;
      forecastingRequestKey='';renderForecasting();toast('Forecast learning data imported.');
    }catch(error){toast(error.message||'Could not read the learning data file.','error');}
  }

  function renderInsights(){const period=$('#insights-period')?.value||'month';const txs=periodTransactions(period);let filtered=txs;if(period==='last-month')filtered=periodTransactions('last-month');const t=totalsFor(filtered);$$('[data-money="insight-income"]').forEach(e=>e.textContent=fmtHidden(t.income));$$('[data-money="insight-expense"]').forEach(e=>e.textContent=fmtHidden(t.expenses));$$('[data-money="insight-net"]').forEach(e=>{e.textContent=fmtHidden(t.net);e.style.color=t.net<0?'var(--red)':'var(--green)'});let [start,end]=getPeriodRange(period);if(period==='all'){start=state.transactions.length?state.transactions.reduce((min,t)=>t.date<min? t.date:min,today()):today();end=today();}const span=Math.max(1,Math.ceil((dateFrom(end)-dateFrom(start))/86400000)+1);$$('[data-money="daily-average"]').forEach(e=>e.textContent=fmtHidden(t.expenses/Math.max(1,Math.min(span,Math.ceil((dateFrom(today())-dateFrom(start))/86400000)||span))));renderCategoryLegend(period);renderHeatmap(period);renderRankings(period);renderGoals();renderInsightDebts();renderYearArchive();renderForecasting();renderPlanningTools();renderFinanceAnalytics();scheduleCharts();fitLargeMoneyAmounts();}
  const chartColorFallback=['#456F91','#A96345','#3D7969','#806486','#A35250','#4D8290','#8C7445','#667580'];
  function chartColor(index){const normalized=((Number(index)||0)%chartColorFallback.length+chartColorFallback.length)%chartColorFallback.length;return cssVar(`--chart-${normalized+1}`)||chartColorFallback[normalized];}
  function chartCategoryColor(item,index=0){if(item?.id==='__others__'||item?.id==='__uncategorised__'||item?.name==='Other categories')return chartColor(chartColorFallback.length-1);const activity=state.activities.find(candidate=>candidate.name===item?.name||candidate.id===item?.id);const stableIndex=activity?state.activities.findIndex(candidate=>candidate.id===activity.id):index;return chartColor(stableIndex>=0?stableIndex:index);}
  function chartCategoryItems(items,limit=5){if(items.length<=limit)return items;const kept=items.slice(0,limit-1),rest=items.slice(limit-1);return [...kept,{id:'__others__',name:'Other categories',value:sumMoney(rest.map(item=>Number(item.value)||0)),count:rest.reduce((total,item)=>total+(Number(item.count)||0),0)}];}
  function expenseByCategory(period='month'){const txs=periodTransactions(period),minorByName={};txs.forEach(t=>{const name=txActivity(t).name;if(t.type==='expense')minorByName[name]=(minorByName[name]||0)+toMinorUnits(t.amount);if(t.type==='refund')minorByName[name]=(minorByName[name]||0)-toMinorUnits(t.amount);});return Object.entries(minorByName).map(([name,minor])=>({name,value:fromMinorUnits(Math.max(0,minor))})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);}
  function renderCategoryLegend(period){const items=chartCategoryItems(expenseByCategory(period),5);$('#category-legend').innerHTML=items.length?items.map((a,i)=>`<div class="legend-item"><span class="legend-swatches" style="background:${chartCategoryColor(a,i)}"></span><span>${escapeHTML(a.name)}</span><strong>${fmtHidden(a.value)}</strong></div>`).join(''):`<div class="empty-inline">Add expenses to see your spending mix.</div>`;}
  function renderHeatmap(period){const [start,end]=getPeriodRange(period);let base=period==='all'?new Date():dateFrom(end);if(period==='year')base=new Date(new Date().getFullYear(),11,31);else if(period==='last-month')base=dateFrom(end);else base=new Date();const y=base.getFullYear(),m=base.getMonth(),days=new Date(y,m+1,0).getDate(),first=new Date(y,m,1).getDay();const daily={};state.transactions.forEach(t=>{if(t.type==='expense'&&t.date.startsWith(`${y}-${String(m+1).padStart(2,'0')}`))daily[t.date]=addMoney(daily[t.date]||0,t.amount);});const max=Math.max(1,...Object.values(daily));let html=['S','M','T','W','T','F','S'].map(d=>`<div class="heat-day"><small>${d}</small></div>`).join('');for(let i=0;i<first;i++)html+='<div></div>';for(let d=1;d<=days;d++){const date=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,v=daily[date]||0;const level=v?Math.min(4,Math.ceil(v/max*4)):0;html+=`<div class="heat-day"><small>${d}</small><button type="button" class="heat-cell heat-${level}" title="${escapeHTML(date)} · ${money(v)}" data-heat-date="${date}" aria-label="${escapeHTML(date)}, ${money(v)} spending"></button></div>`;}$('#heatmap').innerHTML=html;}
  function renderRankings(period){let items=expenseByCategory(period);const mode=$('#ranking-mode')?.value||'amount';if(mode==='count'){const counts={};periodTransactions(period).filter(t=>t.type==='expense').forEach(t=>{const name=txActivity(t).name;counts[name]=(counts[name]||0)+1;});items.forEach(i=>i.count=counts[i.name]||0);items.sort((a,b)=>b.count-a.count);}else items.sort((a,b)=>b.value-a.value);items=chartCategoryItems(items,5);const max=Math.max(1,...items.map(x=>mode==='count'?x.count:x.value));$('#category-ranking').innerHTML=items.length?items.map((a,i)=>`<div class="ranking-row"><div class="ranking-name"><span class="legend-swatches" style="background:${chartCategoryColor(a,i)}"></span><span>${escapeHTML(a.name)}</span></div><div class="ranking-bar"><span style="width:${Math.max(1,(mode==='count'?a.count:a.value)/max*100)}%;background:${chartCategoryColor(a,i)}"></span></div><div class="ranking-value">${mode==='count'?`${a.count} entries`:fmtHidden(a.value)}</div></div>`).join(''):`<div class="empty-inline">Your category ranking will appear here.</div>`;}
  function renderGoals(){
    const list=$('#goals-list');if(!list)return;
    if(!state.goals.length){list.innerHTML=`<div class="empty-state"><span class="empty-icon">${icon('goal')}</span><h3>Give your next goal a name.</h3><p>Track progress, deadlines and every contribution in one place.</p><button type="button" class="soft-button" id="goal-empty-add">Create a savings goal</button></div>`;return;}
    list.innerHTML=state.goals.map(g=>{const target=Math.max(0,Number(g.target)||0),saved=Math.max(0,Number(g.saved)||0),remaining=Math.max(0,target-saved),pct=target?Math.min(100,saved/target*100):0,due=String(g.due||''),dueText=/^\d{4}-\d{2}-\d{2}$/.test(due)?`Target · ${dateFrom(due).toLocaleDateString(undefined,{day:'numeric',month:'short'})}`:'Keep going at your pace';return `<article class="goal-row goal-card-item" data-goal-id="${escapeHTML(g.id)}"><div class="goal-pill-head"><span class="goal-pill-mark">${icon('goal')}</span><span class="goal-pill-copy"><strong>${escapeHTML(g.name)}</strong><small>${Math.round(pct)}% there · ${escapeHTML(dueText)}</small></span><button type="button" class="goal-edit-pill" data-goal-edit="${escapeHTML(g.id)}">Edit</button></div><div class="goal-progress-track" role="progressbar" aria-label="${escapeHTML(g.name)} savings progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span style="width:${pct.toFixed(2)}%"></span></div><div class="goal-pill-footer"><span><strong data-money>${fmtHidden(saved)}</strong> saved</span><span><strong data-money>${fmtHidden(remaining)}</strong> to go</span><button type="button" class="text-button" data-goal-add="${escapeHTML(g.id)}" aria-label="Update progress for ${escapeHTML(g.name)}">Add progress →</button></div></article>`;}).join('');
  }
  function renderYearArchive(){const target=$('#yearly-archive');if(!target)return;const currentYear=new Date().getFullYear();const years=state.transactions.map(t=>Number(String(t.date||'').slice(0,4))).filter(y=>y>=1900&&y<=currentYear);const firstYear=years.length?Math.min(...years):currentYear;const rows=[];for(let year=currentYear;year>=Math.max(firstYear,currentYear-39);year--){const txs=state.transactions.filter(t=>String(t.date||'').slice(0,4)===String(year));if(!txs.length&&year!==currentYear)continue;const totals=totalsFor(txs);rows.push({year,...totals,count:txs.length});}if(!rows.length){target.innerHTML='<div class="empty-inline">Your yearly summaries will appear as you record transactions.</div>';return;}target.innerHTML=`<div class="yearly-table-wrap"><div class="yearly-row yearly-header"><span>Year</span><span>Income</span><span>Expenses</span><span>Net flow</span><span>Records</span><span></span></div>${rows.map(r=>`<div class="yearly-row"><strong>${r.year}</strong><span class="yearly-positive">${fmtHidden(r.income)}</span><span>${fmtHidden(r.expenses)}</span><span class="${r.net<0?'yearly-negative':'yearly-positive'}">${fmtHidden(r.net)}</span><span>${r.count}</span><button type="button" class="inline-link" data-year-view="${r.year}">View</button></div>`).join('')}</div><p class="fine-print">Annual totals use the records currently stored on this device. Transfers and debt movements are excluded from income and spending totals.</p>`;}
  function renderInsightDebts(){const d=debtTotals();$('#insight-debts').innerHTML=`<div class="debt-insight-row"><span class="debt-mini-icon owes-you">${icon('income')}</span><div><strong>Owed to you</strong><small>Money to collect</small></div><b class="amount-positive">${fmtHidden(d.receivable)}</b></div><div class="debt-insight-row"><span class="debt-mini-icon you-owe">${icon('expense')}</span><div><strong>You owe</strong><small>Money to repay</small></div><b>${fmtHidden(d.payable)}</b></div>`;}

  function cssVar(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim();}
  function canvasContext(canvas){if(!canvas)return null;const w=Math.max(230,canvas.clientWidth||canvas.parentElement?.clientWidth||300),h=Number(canvas.dataset.height)||canvas.clientHeight||Number(canvas.getAttribute('height'))||210;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.style.height=`${h}px`;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return {ctx,w,h};}
  function drawEmpty(ctx,w,h,text='Add some records to reveal your patterns.'){ctx.fillStyle=cssVar('--muted');ctx.font='11px "DM Sans", sans-serif';ctx.textAlign='center';ctx.fillText(text,w/2,h/2);}
  function drawLineChart(canvas,labels,series,mode='line'){
    const setup=canvasContext(canvas);if(!setup)return;const {ctx,w,h}=setup;const ink=cssVar('--muted'),grid=cssVar('--chart-grid'),incomeColor=cssVar('--chart-income'),expenseColor=cssVar('--chart-expense'),surface=cssVar('--surface');const pad={l:39,r:10,t:18,b:29},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;const vals=series.flatMap(s=>s.values);const rawMax=mode==='stacked'?Math.max(0,...labels.map((_,i)=>series.reduce((sum,s)=>sum+(s.values[i]||0),0))):Math.max(0,...vals);const max=Math.max(10,rawMax)*1.14;ctx.font='9px "DM Sans", sans-serif';ctx.strokeStyle=grid;ctx.lineWidth=1;ctx.fillStyle=ink;ctx.textAlign='right';for(let i=0;i<4;i++){const y=pad.t+ph*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(fmtSmall(max*(1-i/3)),pad.l-7,y+3);}const x=i=>pad.l+(labels.length<=1?pw/2:i*pw/(labels.length-1)),y=v=>pad.t+ph-(v/max)*ph;
    if(!vals.some(v=>v>0)){drawEmpty(ctx,w,h,'Your history will build this graph.');return;}
    series.forEach((s,si)=>{const color=s.color||(si===0?incomeColor:expenseColor);ctx.beginPath();s.values.forEach((v,i)=>{if(i===0)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v));});if(mode==='area'){ctx.lineTo(x(labels.length-1),pad.t+ph);ctx.lineTo(x(0),pad.t+ph);ctx.closePath();ctx.globalAlpha=.12;ctx.fillStyle=color;ctx.fill();ctx.globalAlpha=1;}if(mode!=='bar'&&mode!=='stacked'&&mode!=='waterfall'){ctx.strokeStyle=color;ctx.lineWidth=2.4;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(s.dash?[5,4]:[]);ctx.stroke();ctx.setLineDash([]);s.values.forEach((v,i)=>{ctx.beginPath();ctx.fillStyle=surface;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.arc(x(i),y(v),2.5,0,Math.PI*2);ctx.fill();ctx.stroke();});}});
    if(mode==='bar'||mode==='stacked'){
      const n=labels.length,groupW=pw/n,baseY=pad.t+ph;labels.forEach((_,i)=>{if(mode==='stacked'){let stack=0;series.forEach((s,si)=>{const bh=s.values[i]/max*ph;ctx.fillStyle=s.color||(si===0?incomeColor:expenseColor);ctx.fillRect(pad.l+i*groupW+groupW*.2,baseY-(stack+bh),groupW*.6,bh);stack+=bh;});}else{const bw=Math.min(18,groupW/(series.length+1));series.forEach((s,si)=>{const bx=pad.l+i*groupW+groupW/2+(si-(series.length-1)/2)*bw-bw/2;const bh=s.values[i]/max*ph;ctx.fillStyle=s.color||(si===0?incomeColor:expenseColor);ctx.beginPath();ctx.roundRect(bx,baseY-bh,bw,Math.max(1,bh),[4,4,0,0]);ctx.fill();});}});
    }
    if(mode==='waterfall'){
      let base=0;const n=labels.length,groupW=pw/n;labels.forEach((label,i)=>{const inc=(series[0]?.values[i]||0)-(series[1]?.values[i]||0);const next=base+inc;const y1=y(Math.max(base,next)),y2=y(Math.min(base,next));ctx.fillStyle=inc>=0?incomeColor:expenseColor;ctx.globalAlpha=.85;ctx.fillRect(pad.l+i*groupW+groupW*.22,y1,groupW*.56,Math.max(2,y2-y1));ctx.globalAlpha=1;base=next;});
    }
    ctx.fillStyle=ink;ctx.textAlign='center';labels.forEach((label,i)=>{if(labels.length>12&&i%Math.ceil(labels.length/7)!==0&&i!==labels.length-1)return;ctx.fillText(String(label).slice(0,7),x(i),h-9);});
  }
  function drawSingleBar(canvas,labels,values){drawLineChart(canvas,labels,[{name:'Spending',values,color:cssVar('--chart-primary')}],'bar');}
  function drawDonut(canvas,items,pieMode=false){const setup=canvasContext(canvas);if(!setup)return;const {ctx,w,h}=setup;const ink=cssVar('--muted'),surface=cssVar('--surface-3');if(!items.length){drawEmpty(ctx,w,h,'Category mix appears after you record spending.');return;}const total=sumMoney(items.map(a=>a.value));const cx=w/2,cy=Math.min(h*.46,105),r=Math.min(w*.28,h*.36,78),inner=pieMode?0:r*.66;let angle=-Math.PI/2;chartCategoryItems(items,5).forEach((it,i)=>{const arc=it.value/total*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,angle,angle+arc-.018);if(inner){ctx.arc(cx,cy,inner,angle+arc-.018,angle,true);}else{ctx.lineTo(cx,cy);}ctx.closePath();ctx.fillStyle=chartCategoryColor(it,i);ctx.fill();angle+=arc;});if(!pieMode){ctx.fillStyle=ink;ctx.textAlign='center';ctx.font='10px "DM Sans", sans-serif';ctx.fillText('Total spent',cx,cy-5);ctx.fillStyle=cssVar('--ink');ctx.font='700 16px Manrope, sans-serif';ctx.fillText(fmtSmall(total),cx,cy+14);}}
  function drawHorizontal(canvas,items){const setup=canvasContext(canvas);if(!setup)return;const {ctx,w,h}=setup;const ink=cssVar('--muted'),line=cssVar('--line');const pad={l:92,r:46,t:16,b:16},ph=h-pad.t-pad.b,barH=Math.min(17,ph/Math.max(1,items.length)*.52),step=ph/Math.max(1,items.length),max=Math.max(1,...items.map(i=>i.value));ctx.font='9px "DM Sans",sans-serif';chartCategoryItems(items,5).forEach((it,i)=>{const y=pad.t+i*step;ctx.fillStyle=ink;ctx.textAlign='right';ctx.fillText(it.name.slice(0,15),pad.l-9,y+barH);ctx.fillStyle=line;ctx.beginPath();ctx.roundRect(pad.l,y,w-pad.l-pad.r,barH,5);ctx.fill();ctx.fillStyle=chartCategoryColor(it,i);ctx.beginPath();ctx.roundRect(pad.l,y,(w-pad.l-pad.r)*(it.value/max),barH,5);ctx.fill();ctx.fillStyle=ink;ctx.textAlign='right';ctx.fillText(fmtSmall(it.value),w-3,y+barH);});if(!items.length)drawEmpty(ctx,w,h,'No spending categories yet.');}
  function drawHistogram(canvas,txs){
    const setup=canvasContext(canvas);if(!setup)return;const {ctx,w,h}=setup;const expenses=txs.filter(t=>t.type==='expense'&&Number(t.amount)>0).map(t=>Number(t.amount));if(!expenses.length){drawEmpty(ctx,w,h,'Record a few expenses to see amount ranges.');return;}
    const bins=6,maxValue=Math.max(...expenses),step=maxValue/bins||1,counts=Array(bins).fill(0);expenses.forEach(value=>{counts[Math.min(bins-1,Math.floor(value/step))]++;});const pad={l:30,r:10,t:18,b:34},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,maxCount=Math.max(1,...counts)*1.2;ctx.strokeStyle=cssVar('--chart-grid');ctx.fillStyle=cssVar('--muted');ctx.font='9px "DM Sans",sans-serif';ctx.textAlign='right';for(let i=0;i<4;i++){const y=pad.t+ph*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(String(Math.round(maxCount*(1-i/3))),pad.l-6,y+3);}const bw=pw/bins*.62;counts.forEach((count,i)=>{const bh=count/maxCount*ph,x=pad.l+i*pw/bins+(pw/bins-bw)/2,y=pad.t+ph-bh;ctx.fillStyle=cssVar('--chart-primary');ctx.beginPath();ctx.roundRect(x,y,bw,Math.max(1,bh),[5,5,0,0]);ctx.fill();ctx.fillStyle=cssVar('--muted');ctx.textAlign='center';const lo=Math.round(step*i),hi=Math.round(step*(i+1));ctx.fillText(`${fmtSmall(lo)}–${fmtSmall(hi)}`,x+bw/2,h-12);});ctx.fillStyle=cssVar('--ink');ctx.textAlign='left';ctx.font='10px "DM Sans",sans-serif';ctx.fillText(`${expenses.length} expense entries`,pad.l,11);
  }
  function drawScatter(canvas,buckets){
    const setup=canvasContext(canvas);if(!setup)return;const {ctx,w,h}=setup;const points=buckets.map((b,i)=>({x:b.income,y:b.expense,label:b.label,index:i}));if(!points.length||!points.some(p=>p.x>0||p.y>0)){drawEmpty(ctx,w,h,'Record income and expenses to compare days.');return;}
    const pad={l:42,r:15,t:20,b:32},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,maxX=Math.max(100,...points.map(p=>p.x))*1.12,maxY=Math.max(100,...points.map(p=>p.y))*1.12;ctx.strokeStyle=cssVar('--chart-grid');ctx.fillStyle=cssVar('--muted');ctx.font='9px "DM Sans",sans-serif';ctx.textAlign='right';for(let i=0;i<4;i++){const y=pad.t+ph*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.fillText(fmtSmall(maxY*(1-i/3)),pad.l-6,y+3);}for(let i=0;i<4;i++){const x=pad.l+pw*i/3;ctx.fillText('',x,h-10);ctx.textAlign='center';ctx.fillText(fmtSmall(maxX*i/3),x,h-10);}points.forEach(p=>{const x=pad.l+p.x/maxX*pw,y=pad.t+ph-p.y/maxY*ph;ctx.beginPath();ctx.globalAlpha=.84;ctx.fillStyle=cssVar('--chart-blue');ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});ctx.fillStyle=cssVar('--muted');ctx.textAlign='center';ctx.font='9px "DM Sans",sans-serif';ctx.fillText('Income →',pad.l+pw/2,h-1);ctx.save();ctx.translate(10,pad.t+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText('Spending →',0,0);ctx.restore();
  }

  function bucketSeries(period, weekMode=false){
    const txs=periodTransactions(period);let buckets=[];
    if(weekMode){const mode=$('#home-chart-mode')?.value||'week';if(mode==='week'){for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const date=localDate(d);buckets.push({key:date,label:d.toLocaleDateString(undefined,{weekday:'short'}),income:0,expense:0});}}else if(mode==='month'){for(let w=0;w<5;w++)buckets.push({key:String(w),label:`W${w+1}`,income:0,expense:0});}else{for(let m=0;m<12;m++)buckets.push({key:String(m),label:new Date(new Date().getFullYear(),m,1).toLocaleDateString(undefined,{month:'short'}),income:0,expense:0});}}
    else if(period==='year'){for(let m=0;m<12;m++)buckets.push({key:`${new Date().getFullYear()}-${String(m+1).padStart(2,'0')}`,label:new Date(new Date().getFullYear(),m,1).toLocaleDateString(undefined,{month:'short'}),income:0,expense:0});}
    else if(period==='all'){const currentYear=new Date().getFullYear();const years=state.transactions.map(t=>Number(String(t.date||'').slice(0,4))).filter(y=>y>=1900&&y<=currentYear);const firstYear=years.length?Math.min(...years):currentYear;for(let y=Math.max(firstYear,currentYear-39);y<=currentYear;y++)buckets.push({key:String(y),label:String(y),income:0,expense:0});}
    else {const [start,end]=getPeriodRange(period);const d=dateFrom(start),last=dateFrom(end);while(d<=last){const date=localDate(d);buckets.push({key:date,label:String(d.getDate()),income:0,expense:0});d.setDate(d.getDate()+1);}}
    txs.forEach(t=>{if(t.type!=='income'&&t.type!=='expense'&&t.type!=='refund')return;let b;if(weekMode){const mode=$('#home-chart-mode')?.value||'week';if(mode==='week')b=buckets.find(x=>x.key===t.date);else if(mode==='month')b=buckets[ Math.min(4,Math.floor((dateFrom(t.date).getDate()-1)/7)) ];else b=buckets[dateFrom(t.date).getMonth()];}else if(period==='year')b=buckets.find(x=>x.key===t.date.slice(0,7));else if(period==='all')b=buckets.find(x=>x.key===t.date.slice(0,4));else {b=buckets.find(x=>x.key===t.date);if(!b){const idx=Math.min(buckets.length-1,Math.floor((dateFrom(t.date).getDate()-1)/Math.max(1,Math.ceil(dateFrom(t.date).getDate()/buckets.length))));b=buckets[idx];}}if(b){if(t.type==='income')b.income=addMoney(b.income,t.amount);else b.expense=addMoney(b.expense,(t.type==='refund'?-1:1)*(Number(t.amount)||0));}});
    buckets.forEach(b=>b.expense=Math.max(0,b.expense));return buckets;
  }
  function chartPeriod(){const val=$('#insights-period')?.value||'month';return ['month','last-month','year','all'].includes(val)?val:'month';}
  function scheduleCharts(){if(chartFrame)cancelAnimationFrame(chartFrame);chartFrame=requestAnimationFrame(()=>{if(currentPage==='home'||$('#page-home').classList.contains('active')){const mode=$('#home-chart-mode')?.value||'week';const buckets=bucketSeries(mode==='week'?'all':mode,true);const labels=buckets.map(b=>b.label),values=buckets.map(b=>b.expense);drawLineChart($('#home-spending-chart'),labels,[{name:'Spending',values,color:cssVar('--chart-expense')}],'area');const current=totalsFor(periodTransactions(mode==='week'?'all':mode));$('#week-total').textContent=fmtHidden(mode==='week'?sumMoney(values):current.expenses);$('#week-comparison').textContent=mode==='week'?'Spend recorded across the last 7 days':mode==='month'?'Current month to date':'Year to date';}
    if($('#page-insights').classList.contains('active')){if(finance&&$('#finance-category-chart-view')){const selected=financeSelectedRange();if(selected)renderFinanceCategoryComparison(selected);}const period=chartPeriod();const b=bucketSeries(period,false);const labels=b.map(x=>x.label);const type=$('#trend-type')?.value||'line';const trendLegend=$('#trend-series-legend');if(trendLegend)trendLegend.hidden=['histogram','scatter'].includes(type);if(type==='histogram')drawHistogram($('#trend-chart'),periodTransactions(period));else if(type==='scatter')drawScatter($('#trend-chart'),b);else drawLineChart($('#trend-chart'),labels,[{name:'Income',values:b.map(x=>x.income),color:cssVar('--chart-income')},{name:'Expenses',values:b.map(x=>x.expense),color:cssVar('--chart-expense')}],type);const cats=chartCategoryItems(expenseByCategory(period),5);const cc=$('#category-chart');if(mixView==='doughnut')drawDonut(cc,cats.slice(0,8));else if(mixView==='pie')drawDonut(cc,cats.slice(0,8),true);else drawHorizontal(cc,cats);const yrBuckets=bucketSeries('year');drawLineChart($('#comparison-chart'),yrBuckets.map(x=>x.label),[{name:'Income',values:yrBuckets.map(x=>x.income),color:cssVar('--chart-income')},{name:'Expenses',values:yrBuckets.map(x=>x.expense),color:cssVar('--chart-expense')}],'bar');}
    });}
  async function showInstallGuide(){
    if(installedPrompt){try{await installedPrompt.prompt();const result=await installedPrompt.userChoice;installedPrompt=null;if(result?.outcome==='accepted'){toast('Aruvi installation started.');return;}}catch(_){} }
    const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
    const android=/android/i.test(navigator.userAgent);
    const instructions=ios
      ? '<ol><li>Open Aruvi in Safari.</li><li>Tap Share.</li><li>Choose <strong>Add to Home Screen</strong>, then Add.</li></ol>'
      : android
      ? '<ol><li>Open Aruvi in Chrome or another supported browser.</li><li>Use the browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li><li>Confirm installation. The wording varies by browser.</li></ol>'
      : '<ol><li>Open Aruvi in a supported browser over HTTPS.</li><li>Use the browser install icon or menu and choose <strong>Install</strong> or <strong>Create shortcut</strong>.</li></ol>';
    openModal('Install Aruvi',`<div class="modal-body install-guide-content"><p class="muted">Aruvi is an installable website app (PWA), not a native app-store package.</p>${instructions}<p class="fine-print">Installation availability depends on your browser and device. Your local records remain in that browser profile, so export backups before clearing site data.</p><div class="form-actions"><button class="primary-button" type="button" data-cancel-modal>Done</button></div></div>`,'INSTALL ON YOUR DEVICE');
  }
  function openModal(title,body,kicker='QUICK ACTION'){const dlg=$('#app-modal');dlg.classList.remove('daily-story-dialog');if(dlg.open)dlg.close();$('#modal-title').textContent=title;$('#modal-kicker').textContent=kicker;$('#modal-content').innerHTML=body;dlg.showModal();fitLargeMoneyAmounts($('#modal-content'));syncGlassSegmentIndicators(dlg);}
  function closeModal(){if($('#app-modal').open)$('#app-modal').close();$('#app-modal').classList.remove('daily-story-dialog');currentEditId=null;}
  function accountOptions(selected=''){return state.accounts.map(a=>`<option value="${escapeHTML(a.id)}" ${selected===a.id?'selected':''}>${escapeHTML(a.name)}</option>`).join('');}
  function activityOptions(kind='expense',selected='') {const list=state.activities.filter(a=>(!a.archived||a.id===selected)&&(a.kind==='both'||a.kind===kind||(kind==='expense'&&a.kind==='refund')));list.sort((a,b)=>{const ca=state.transactions.filter(t=>t.activityId===a.id).length,cb=state.transactions.filter(t=>t.activityId===b.id).length;return cb-ca||a.name.localeCompare(b.name)});return list.map(a=>`<option value="${escapeHTML(a.id)}" ${selected===a.id?'selected':''}>${escapeHTML(a.name)}${a.archived?' · archived':''}</option>`).join('');}
  function defaultPaymentMethodForAccount(accountId){const account=state.accounts.find(item=>item.id===accountId);if(account?.type==='bank')return 'UPI';if(account?.type==='card')return 'Debit card';if(account?.type==='savings')return 'Bank transfer';if(account?.type==='other')return 'Other';return 'Cash';}
  function transactionForm(tx=null,forceType=null){
    currentEditId=tx?.id||null;currentTxType=forceType||tx?.type||'expense';
    if(['borrowed','lent','repay_out','repay_in'].includes(currentTxType))currentTxType='expense';
    const existing=tx||{},isTransfer=currentTxType==='transfer';
    const typeList=[['expense','Expense','expense'],['income','Income','income'],['transfer','Transfer','transfer'],['refund','Refund','receipt']];
    const amount=existing.amount??'';
    const selectedActivity=existing.activityId||(currentTxType==='income'?'salary':currentTxType==='refund'?'refunds':'food');
    const existingTags=Array.isArray(existing.tags)?existing.tags.join(', '):'';
    const selectedAccountId=existing.accountId||state.accounts[0]?.id;
    const defaultPaymentMethod=existing.paymentMethod||defaultPaymentMethodForAccount(selectedAccountId);
    const hasMoreDetails=!!(existing.note||existing.merchantName||existingTags||existing.receiptPhotoId||(existing.paymentMethod&&existing.paymentMethod!==defaultPaymentMethodForAccount(selectedAccountId))||(existing.repeat&&existing.repeat!=='none'));
    openModal(tx?'Edit transaction':'Quick Add',`<form id="transaction-form" class="modal-body transaction-entry-form">
      <div class="transaction-entry-type"><div class="transaction-entry-label"><span>TYPE</span><small>Choose a type</small></div><div class="type-switch">${typeList.map(([t,l,ico])=>`<button type="button" data-type="${t}" class="${currentTxType===t?'selected':''}" ${currentTxType===t?'aria-pressed="true"':'aria-pressed="false"'}>${icon(ico)}<span>${l}</span></button>`).join('')}</div></div>
      <section class="transaction-amount-panel" aria-label="Transaction amount">
        <div class="transaction-entry-label"><span>AMOUNT</span><small>INR · Indian rupees</small></div>
        <div class="form-field transaction-amount-field"><label class="sr-only" for="tx-amount">Amount in rupees</label><input id="tx-amount" class="amount-input" name="amount" inputmode="decimal" enterkeyhint="done" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="₹ 0.00" value="${escapeHTML(amount)}" aria-describedby="tx-amount-error" required autofocus></div>
        <p class="amount-helper">Enter the exact amount, including paise.</p><p class="field-error" id="tx-amount-error" role="alert" hidden></p>
      </section>
      <section class="transaction-entry-section transaction-essentials" aria-label="Transaction details">
        <label class="entry-field" for="tx-activity"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">Category</span><select id="tx-activity" name="activityId">${activityOptions(currentTxType==='refund'?'refund':currentTxType,selectedActivity)}</select></span></label>
        <label class="entry-field" for="tx-account"><span class="entry-field-icon">${icon('wallet')}</span><span class="entry-field-copy"><span class="entry-field-name">Account</span><select id="tx-account" name="accountId">${accountOptions(existing.accountId||state.accounts[0]?.id)}</select></span></label>
        <label class="entry-field" for="tx-date"><span class="entry-field-icon">${icon('calendar')}</span><span class="entry-field-copy"><span class="entry-field-name">Transaction date</span><input type="date" id="tx-date" name="date" value="${escapeHTML(existing.date||today())}" required></span></label>
        
        ${isTransfer?`<label class="entry-field" for="tx-to-account" id="tx-to-account-wrap"><span class="entry-field-icon">${icon('transfer')}</span><span class="entry-field-copy"><span class="entry-field-name">Transfer to</span><select id="tx-to-account" name="toAccountId">${accountOptions(existing.toAccountId||state.accounts.find(a=>a.id!==existing.accountId)?.id)}</select></span></label>`:''}
      </section>
      <details class="form-disclosure transaction-more-details" ${hasMoreDetails?'open':''}>
        <summary><span class="disclosure-title">${icon('more')} More details</span><span class="disclosure-hint">Optional fields</span></summary>
        <div class="disclosure-content">
          
          <label class="entry-field" for="tx-payment-method"><span class="entry-field-icon">${icon('creditcard')}</span><span class="entry-field-copy"><span class="entry-field-name">Payment method</span><select id="tx-payment-method" name="paymentMethod" data-auto-payment="${tx?'false':'true'}">${['Cash','UPI','Bank transfer','Debit card','Credit card','Wallet','Other'].map(v=>`<option value="${v}" ${defaultPaymentMethod===v?'selected':''}>${v}</option>`).join('')}</select></span></label>
          <div class="form-field"><label for="tx-repeat">REPEAT</label><select id="tx-repeat" name="repeat"><option value="none" ${!existing.repeat||existing.repeat==='none'?'selected':''}>Does not repeat</option><option value="weekly" ${existing.repeat==='weekly'?'selected':''}>Weekly · confirm when due</option><option value="monthly" ${existing.repeat==='monthly'?'selected':''}>Monthly · confirm when due</option><option value="yearly" ${existing.repeat==='yearly'?'selected':''}>Yearly · confirm when due</option></select></div>
          <div class="form-field"><label for="tx-merchant">MERCHANT / PAYEE <span class="muted">· OPTIONAL</span></label><input id="tx-merchant" name="merchantName" maxlength="100" value="${escapeHTML(existing.merchantName||merchantFromRecord(existing))}" placeholder="e.g. Swiggy, Lulu, KSEB"></div>
          <div class="form-field"><label for="tx-note">NOTE <span class="muted">· OPTIONAL</span></label><textarea id="tx-note" name="note" placeholder="What was this for?" rows="2">${escapeHTML(existing.note||'')}</textarea></div>
          <div class="form-field"><label for="tx-tags">TAGS <span class="muted">· OPTIONAL</span></label><input id="tx-tags" name="tags" maxlength="240" value="${escapeHTML(existingTags)}" placeholder="e.g. work, family, reimbursable"></div>
          <div class="form-field receipt-upload-field"><label for="tx-receipt-photo">RECEIPT IMAGE <span class="muted">· OPTIONAL</span></label><div class="receipt-picker"><input id="tx-receipt-photo" name="receiptPhoto" type="file" accept="image/*" hidden><input id="tx-receipt-camera" type="file" accept="image/*" capture="environment" hidden><div class="receipt-picker-actions"><button class="secondary-button" type="button" data-receipt-source="gallery">Gallery</button><button class="secondary-button" type="button" data-receipt-source="camera">Camera</button></div><small id="tx-receipt-status" class="muted" role="status">Stored on this device.</small></div></div>
          <button class="secondary-button voice-draft-action" type="button" id="voice-entry">${icon('mic')} Voice draft</button>
        </div>
      </details>
      <div class="form-actions transaction-entry-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit" name="saveMode" value="save">${tx?'Save changes':'Save transaction'}</button>${!tx?'<button class="text-button transaction-save-another" type="submit" name="saveMode" value="another">Save &amp; add another</button>':''}</div>
      <p class="form-note" id="tx-form-note">${currentTxType==='transfer'?'Transfers move money between your accounts and are not counted as income or spending.':currentTxType==='refund'?'Refunds reduce recorded spending, rather than inflate income.':'You can add a note or receipt later. Your records stay on this device.'}</p>
    </form>`);
    $('#transaction-form').dataset.type=currentTxType;$('#tx-amount').focus({preventScroll:true});
  }
  let quickAddDraft = null;
  let quickAddSaving = false;
  function showAddEntryChoices(){
    openModal('Add an entry',`<div class="modal-body add-entry-choices">
      <p class="muted">Choose how much detail you need.</p>
      <section class="entry-choice-primary"><span class="entry-choice-label">FASTEST WAY TO RECORD</span>
        <button type="button" class="quick-choice quick-choice-primary" id="start-simple-entry" aria-label="Quick entry. Add an amount in a few taps."><span class="quick-choice-icon" aria-hidden="true">${icon('edit')}</span><span class="quick-choice-copy"><strong>Quick entry</strong><small>Add an amount in a few taps.</small></span><span class="quick-choice-arrow" aria-hidden="true">›</span></button>
      </section>
      <div class="entry-choice-secondary" aria-label="Other entry methods">
        <button type="button" class="quick-choice" id="start-advanced-entry"><span class="quick-choice-icon" aria-hidden="true">${icon('sliders')}</span><span><strong>Advanced entry</strong><small>Transactions, transfers and debts.</small></span><span aria-hidden="true">›</span></button>
        <button type="button" class="quick-choice" id="start-payment-import"><span class="quick-choice-icon" aria-hidden="true">${icon('upload')}</span><span><strong>Import entry</strong><small>Paste a payment or import a statement.</small></span><span aria-hidden="true">›</span></button>
        <button type="button" class="quick-choice" id="start-detailed-entry"><span class="quick-choice-icon" aria-hidden="true">${icon('people')}</span><span><strong>Detailed entry</strong><small>Split bills and plan an event.</small></span><span aria-hidden="true">›</span></button>
      </div>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button></div>
    </div>`,'ADD TRANSACTION');
  }
  function showDetailedEntryTools(){
    const savedSplits=(state.billSplits||[]).slice(0,5);
    openModal('Detailed entry',`<div class="modal-body add-entry-choices"><p class="muted">Tools for shared costs, trips and gatherings. Calculations are saved separately from your bank transactions.</p><div class="entry-tools-list">
      <button type="button" class="quick-choice" id="start-bill-split"><span class="quick-choice-icon" aria-hidden="true">${icon('people')}</span><span><strong>Quick bill split</strong><small>Divide a bill, adjust each person's share and create a print-ready settlement sheet.</small></span><span>›</span></button>
      <button type="button" class="quick-choice" id="start-event-planner"><span class="quick-choice-icon" aria-hidden="true">${icon('calendar')}</span><span><strong>Event planning</strong><small>Plan trips, gatherings or events with categories, groups and unequal contributions.</small></span><span>›</span></button>
    </div>${savedSplits.length?`<section class="event-planner-section"><div class="event-planner-section-heading"><strong>RECENT BILL SPLITS</strong></div><div class="event-plan-list">${savedSplits.map(item=>`<div class="event-plan-list-item"><div><strong>${escapeHTML(item.name||'Shared bill')}</strong><small>${escapeHTML(item.date||'')} · ${escapeHTML(money(fromMinorUnits(item.totalMinor||0)))}</small></div><button type="button" class="mini-button" data-bill-open="${escapeHTML(item.id)}">Open</button></div>`).join('')}</div></section>`:''}<button class="text-button entry-tools-back" type="button" id="entry-tools-back">← Back to entry methods</button></div>`,'SHARED COST TOOLS');
  }
  function showAdvancedEntryTools(){
    openModal('Advanced entry',`<div class="modal-body add-entry-choices"><p class="muted">Use the full transaction controls when a record needs extra detail.</p><div class="entry-tools-list">
      <button type="button" class="quick-choice" id="advanced-manual-entry"><span class="quick-choice-icon">☷</span><span><strong>Detailed transaction</strong><small>Set category, date, account, payment method, reminder and notes.</small></span><span>›</span></button>
      <button type="button" class="quick-choice" id="advanced-grocery-entry"><span class="quick-choice-icon" aria-hidden="true">${icon('shopping')}</span><span><strong>Grocery list item</strong><small>Add several products with quantities. Your shopping list stays together on Home until items are marked bought.</small></span><span>›</span></button>
      <button type="button" class="quick-choice" id="advanced-transfer-entry"><span class="quick-choice-icon" aria-hidden="true">${icon('transfer')}</span><span><strong>Account transfer</strong><small>Move money between your own accounts without counting it as income or spending.</small></span><span>›</span></button>
      <button type="button" class="quick-choice" id="advanced-debt-entry"><span class="quick-choice-icon" aria-hidden="true">${icon('dollar')}</span><span><strong>Money owed</strong><small>Track lending, borrowing and repayments.</small></span><span>›</span></button>
    </div><button class="text-button entry-tools-back" type="button" id="entry-tools-back">← Back to entry methods</button></div>`,'ADVANCED CONTROLS');
  }
  const groceryUnits=[['pcs','Pieces'],['kg','Kilograms'],['g','Grams'],['L','Litres'],['ml','Millilitres'],['pack','Pack'],['packet','Packet'],['bunch','Bunch'],['bottle','Bottle'],['box','Box'],['sachet','Sachet']];
  const groceryProducts=['Atta','Rice','Toor dal','Moong dal','Chana dal','Urad dal','Rajma','Chole','Sugar','Salt','Cooking oil','Ghee','Tea','Coffee','Milk','Curd','Paneer','Eggs','Bread','Butter','Potatoes','Onions','Tomatoes','Green chillies','Ginger','Garlic','Coriander','Spinach','Bananas','Apples','Lemons','Detergent','Dishwash liquid','Soap'];
  function groceryUnitOptions(selected='pcs'){return groceryUnits.map(([unit,label])=>`<option value="${unit}" ${unit===selected?'selected':''}>${unit}</option>`).join('');}
  function groceryEntryRow(){return `<div class="grocery-entry-row"><label class="grocery-product-field"><span>PRODUCT</span><input name="itemName" list="grocery-product-suggestions" maxlength="80" placeholder="e.g. Tomatoes" autocomplete="off" required></label><label class="grocery-quantity-field"><span>QUANTITY</span><input name="itemQuantity" type="number" inputmode="decimal" min="0.01" step="any" value="1" required></label><label class="grocery-unit-field"><span>UNIT</span><select name="itemUnit" aria-label="Unit">${groceryUnitOptions()}</select></label><button type="button" class="grocery-row-remove" data-grocery-row-remove aria-label="Remove this item" disabled>${icon('close')}</button></div>`;}
  function syncGroceryRowButtons(form){const rows=[...form.querySelectorAll('.grocery-entry-row')];rows.forEach(row=>{const button=row.querySelector('[data-grocery-row-remove]');if(button)button.disabled=rows.length<=1;});}
  function groceryItemForm(){shoppingListOpen=true;openModal('Shopping list',`<form id="grocery-item-form" class="modal-body grocery-item-form"><div class="grocery-form-intro"><span class="grocery-form-icon">${icon('shopping')}</span><div><strong>Add to your list</strong><small>Add a few things at once. Pick a quantity and unit for each.</small></div></div><datalist id="grocery-product-suggestions">${groceryProducts.map(name=>`<option value="${name}">`).join('')}</datalist><div class="grocery-entries" id="grocery-entry-rows">${groceryEntryRow()}</div><button type="button" class="grocery-add-row" id="grocery-add-row">${icon('plus')} Add another item</button><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Save items</button></div></form>`,'SHOPPING LIST');const form=$('#grocery-item-form');if(form)syncGroceryRowButtons(form);}
  async function saveGroceryItem(form){const rows=[...form.querySelectorAll('.grocery-entry-row')].map(row=>({name:String(row.querySelector('[name="itemName"]')?.value||'').trim().slice(0,80),quantity:Number(row.querySelector('[name="itemQuantity"]')?.value),unit:String(row.querySelector('[name="itemUnit"]')?.value||'pcs')}));if(!rows.length||rows.some(item=>!item.name||!Number.isFinite(item.quantity)||item.quantity<=0)){toast('Add a product and a quantity for each row.','error');return;}const snapshot=JSON.stringify(state);ensurePersonalWorkspace();const now=new Date().toISOString();state.shoppingItems=[...rows.map(item=>({id:uid('grocery'),name:item.name,quantity:`${item.quantity} ${item.unit}`,unit:item.unit,done:false,createdAt:now})),...(state.shoppingItems||[])].slice(0,500);shoppingListOpen=true;if(!(await persistMutation(snapshot,'Could not save the grocery items. Your previous records were restored.')))return;closeModal();renderAll();toast(`${rows.length} ${rows.length===1?'item':'items'} added to your shopping list.`);}
  let billSplitDraft = null;
  let eventPlannerDraft = null;
  const sharedCosts = () => window.PocketwiseSharedCosts;
  const safeMinorInput = value => sharedCosts().toMinorUnits(String(value ?? '').trim());
  const minorToInput = minor => (minor / 100).toFixed(2);
  const makePerson = index => ({ id: uid('person'), name: `Person ${index + 1}` });
  const eventUnits = plan => plan.splitMode === 'groups' ? plan.groups : plan.participants;
  function eventShareDefaults(category, units) {
    if (category.mode === 'equal') return [];
    if (category.mode === 'percent') {
      const base = Math.floor(10000 / Math.max(1, units.length));
      let left = 10000 - base * units.length;
      return units.map((unit, index) => ({ unitId: unit.id, value: (base + (index < left ? 1 : 0)) / 100 }));
    }
    const amounts = sharedCosts().equalSplit(Math.max(0, Number(category.amountMinor) || 0), Math.max(1, units.length));
    return units.map((unit, index) => ({ unitId: unit.id, value: amounts[index] }));
  }
  function normalizeEventCategoryShares(plan) {
    const units = eventUnits(plan);
    plan.categories.forEach(category => {
      if (category.mode === 'equal') { category.shares = []; return; }
      const expected = units.map(unit => unit.id);
      const current = Array.isArray(category.shares) ? category.shares : [];
      if (current.length !== expected.length || expected.some(id => !current.some(share => String(share.unitId) === String(id)))) {
        category.shares = eventShareDefaults(category, units);
      }
    });
  }
  function showBillSplitStart() {
    billSplitDraft = null;
    openModal('Quick bill split', `<form id="bill-split-start-form" class="modal-body shared-cost-form">
      <div class="shared-cost-intro"><strong>Split a shared bill fairly</strong><p>Enter the total and number of people. Aruvi divides every paise exactly, then lets you adjust names and individual shares.</p></div>
      <div class="form-field"><label for="bill-split-name">BILL OR MEAL NAME · OPTIONAL</label><input id="bill-split-name" name="name" maxlength="80" placeholder="e.g. Dinner at the cafe"></div>
      <div class="form-field"><label for="bill-split-total">TOTAL AMOUNT · INR</label><input id="bill-split-total" name="total" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required></div>
      <div class="form-field"><label for="bill-split-count">NUMBER OF PEOPLE</label><input id="bill-split-count" name="count" type="number" inputmode="numeric" min="2" max="100" step="1" value="2" required></div>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Divide bill</button></div>
    </form>`, 'SHARED COSTS');
    $('#bill-split-total')?.focus({ preventScroll: true });
  }
  function renderBillSplitEditor(draft) {
    billSplitDraft = draft;
    const total = draft.totalMinor;
    const rows = draft.people.map((person, index) => `<div class="shared-cost-person-row" data-bill-person="${escapeHTML(person.id)}">
      <label>PERSON ${index + 1}<input type="text" maxlength="48" data-bill-name="${escapeHTML(person.id)}" value="${escapeHTML(person.name)}" aria-label="Person ${index + 1} name"></label>
      <label>SHARE · INR<input type="text" inputmode="decimal" autocomplete="off" data-bill-share="${escapeHTML(person.id)}" value="${escapeHTML(minorToInput(person.amountMinor))}" aria-label="Person ${index + 1} share in rupees"></label>
    </div>`).join('');
    openModal(draft.id ? 'Edit bill split' : 'Bill split', `<form id="bill-split-form" class="modal-body shared-cost-form" data-id="${escapeHTML(draft.id || '')}">
      <div class="shared-cost-intro"><strong>${escapeHTML(draft.name || 'Shared bill')}</strong><p>${draft.people.length} people · ${escapeHTML(money(fromMinorUnits(total)))} total. Edit each person's name or share. The amounts must add up exactly.</p></div>
      <div class="form-field"><label for="bill-split-edit-name">BILL OR MEAL NAME</label><input id="bill-split-edit-name" maxlength="80" value="${escapeHTML(draft.name || '')}" placeholder="e.g. Dinner at the cafe"></div>
      <div class="shared-cost-summary"><div><small>Total bill</small><strong>${escapeHTML(money(fromMinorUnits(total)))}</strong></div><div><small>People</small><strong>${draft.people.length}</strong></div><div><small>Starting share</small><strong>${escapeHTML(money(fromMinorUnits(Math.floor(total / draft.people.length))))}</strong></div></div>
      <div class="shared-cost-person-list">${rows}</div>
      <div class="shared-cost-total-line"><span>Allocated shares</span><strong id="bill-split-allocated">${escapeHTML(money(fromMinorUnits(draft.people.reduce((sum, person) => sum + person.amountMinor, 0))))}</strong></div>
      <div id="bill-split-validation" class="shared-cost-validation" role="status" aria-live="polite">Checking shares…</div>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Close</button><button class="secondary-button" type="button" id="bill-split-download">Download PDF</button><button class="primary-button" type="submit">Save bill split</button></div>
      <p class="form-note">A split is a planning record. Saving it does not create transactions or change account balances.</p>
    </form>`, 'SHARED COSTS');
    validateBillSplitForm();
  }
  function readBillSplitForm() {
    const form = $('#bill-split-form');
    if (!form || !billSplitDraft) return null;
    const people = billSplitDraft.people.map(person => ({
      id: person.id,
      name: String(form.querySelector(`[data-bill-name="${CSS.escape(person.id)}"]`)?.value || '').trim(),
      amountMinor: safeMinorInput(form.querySelector(`[data-bill-share="${CSS.escape(person.id)}"]`)?.value)
    }));
    return { ...billSplitDraft, name: String($('#bill-split-edit-name')?.value || '').trim(), people };
  }
  function validateBillSplitForm() {
    const draft = readBillSplitForm();
    const status = $('#bill-split-validation');
    const allocated = $('#bill-split-allocated');
    const button = $('#bill-split-download');
    if (!draft || !status) return { valid: false };
    const parsed = draft.people.map(person => person.amountMinor);
    const validNames = draft.people.every(person => person.name && person.name.length <= 48);
    const validAmounts = parsed.every(Number.isSafeInteger) && parsed.every(value => value >= 0);
    const sum = validAmounts ? parsed.reduce((total, value) => total + value, 0) : NaN;
    const valid = !!draft.name && validNames && validAmounts && Number.isSafeInteger(sum) && sum === draft.totalMinor;
    if (allocated) allocated.textContent = validAmounts ? money(fromMinorUnits(sum)) : 'Check amounts';
    status.classList.toggle('is-valid', valid);
    status.classList.toggle('is-invalid', !valid);
    status.textContent = valid ? 'All shares reconcile exactly to the bill total.' : !draft.name ? 'Enter a name for this bill.' : !validNames ? 'Give every person a name.' : !validAmounts ? 'Enter valid non-negative shares with up to two decimal places.' : `Shares are ${money(fromMinorUnits(Math.abs(draft.totalMinor - (Number.isFinite(sum) ? sum : 0))))} ${sum < draft.totalMinor ? 'short' : 'over'} the bill total.`;
    if (button) button.disabled = !valid;
    return { valid, draft };
  }
  function sharedCostReportDocument(title, subtitle, content, notes = '') {
    const generated = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>
      :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f2f4f3;color:#17211c;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.report{max-width:820px;margin:28px auto;padding:42px 48px;background:#fff;box-shadow:0 8px 35px #10241912}.brand{display:flex;justify-content:space-between;gap:24px;align-items:center;padding-bottom:18px;border-bottom:2px solid #1fbd65}.brand-mark{font-size:12px;font-weight:850;letter-spacing:.16em;color:#159653}.meta{font-size:10px;color:#66736b;text-align:right}.eyebrow{margin:28px 0 5px;color:#168b4c;font-size:10px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}h1{margin:0;font-size:29px;line-height:1.15;letter-spacing:-.04em} .subtitle{margin:9px 0 25px;color:#68746c;font-size:12px}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 25px}.summary>div{padding:13px;border:1px solid #e2e8e3;border-radius:10px;background:#f8faf8}.summary small{display:block;color:#66736b;font-size:10px}.summary strong{display:block;margin-top:5px;font-size:17px;font-variant-numeric:tabular-nums}.report h2{margin:24px 0 10px;font-size:14px}.report-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}.report-table th{padding:9px 8px;background:#eff5f0;color:#526258;font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #cfd9d1}.report-table td{padding:10px 8px;border-bottom:1px solid #e6ebe7;vertical-align:top;overflow-wrap:anywhere}.report-table tr{break-inside:avoid}.report-table .numeric{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.report-table tfoot td{font-weight:800;border-top:2px solid #aebdb2;background:#f8faf8}.report-note{margin-top:18px;padding:12px 14px;border-left:3px solid #1fbd65;background:#f3f8f4;color:#536159;font-size:10px}.report-footer{display:flex;justify-content:space-between;gap:16px;margin-top:30px;padding-top:12px;border-top:1px solid #dce4dd;color:#748077;font-size:9px}.report-actions{display:flex;justify-content:flex-end;gap:10px;margin:0 auto 28px;max-width:820px;padding:0 48px}.report-actions button{padding:10px 18px;border:0;border-radius:9px;background:#159653;color:#fff;font-weight:750}.report-actions button.secondary{background:#e3eae4;color:#203128}@page{size:A4 portrait;margin:14mm}@media print{body{background:#fff}.report{max-width:none;margin:0;padding:0;box-shadow:none}.report-actions{display:none!important}.brand,.report-table tr,.summary,.report-note{break-inside:avoid}.report-table{font-size:10px}.report-table th{padding:7px 7px}.report-table td{padding:6px 7px}.report h2{margin:17px 0 8px}.summary{margin-bottom:18px}.report-table thead{display:table-header-group}.report-table tfoot{display:table-row-group}h1,h2{break-after:avoid}.report-note{margin-top:10px;padding:8px 10px}.report-footer{break-inside:avoid;page-break-inside:avoid;margin-top:8px;padding-top:6px;font-size:8px}a{color:inherit;text-decoration:none}}@media(max-width:600px){.report{margin:0;padding:24px 18px}.report-actions{padding:0 18px}.summary{grid-template-columns:1fr 1fr}}
    </style></head><body><main class="report"><header class="brand"><div class="brand-mark">ARUVI · PERSONAL FINANCE</div><div class="meta">PRIVATE DOCUMENT<br>Generated ${escapeHTML(generated)}</div></header><p class="eyebrow">Shared cost record</p><h1>${escapeHTML(title)}</h1><p class="subtitle">${escapeHTML(subtitle)}</p>${content}${notes ? `<aside class="report-note">${notes}</aside>` : ''}<footer class="report-footer"><span>Aruvi · Prepared locally on this device</span><span>Amounts shown in Indian rupees (INR)</span></footer></main><div class="report-actions"><button type="button" class="secondary" onclick="window.close()">Close</button><button type="button" onclick="window.print()">Print / Save as PDF</button></div></body></html>`;
  }
  async function openSharedCostReport(title, subtitle, content, filename, notes = '') {
    const html = sharedCostReportDocument(title, subtitle, content, notes);
    return deliverGeneratedPDF(html, filename, `Aruvi · ${title}`);
  }
  async function saveBillSplitRecord(draft, showToast = true) {
    const snapshot = JSON.stringify(state);
    const record = { ...draft, id: draft.id || uid('split'), createdAt: draft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = state.billSplits.findIndex(item => item.id === record.id);
    if (index >= 0) state.billSplits[index] = record; else state.billSplits.unshift(record);
    if (state.billSplits.length > 500) state.billSplits.length = 500;
    if (!(await persistMutation(snapshot, 'Could not save this bill split. Your previous records were restored.'))) return null;
    billSplitDraft = record;
    if (showToast) toast('Bill split saved. No transactions or account balances were changed.');
    return record;
  }
  async function saveBillSplitFromForm() {
    const check = validateBillSplitForm();
    if (!check.valid) { toast('Fix the bill split amounts before saving.', 'error'); return; }
    const saved = await saveBillSplitRecord({ ...check.draft, date: check.draft.date || today() });
    if (saved) renderBillSplitEditor(saved);
  }
  async function downloadBillSplitFromForm() {
    const check = validateBillSplitForm();
    if (!check.valid) { toast('Fix the bill split amounts before downloading.', 'error'); return; }
    const draft = check.draft;
    const saved = await saveBillSplitRecord({ ...draft, date: draft.date || today() }, false);
    if (!saved) return;
    const rows = saved.people.map(person => `<tr><td>${escapeHTML(person.name)}</td><td class="numeric">${escapeHTML(money(fromMinorUnits(person.amountMinor)))}</td><td class="numeric">${(person.amountMinor / Math.max(1, saved.totalMinor) * 100).toFixed(2)}%</td></tr>`).join('');
    const content = `<section class="summary"><div><small>Total bill</small><strong>${escapeHTML(money(fromMinorUnits(saved.totalMinor)))}</strong></div><div><small>People</small><strong>${saved.people.length}</strong></div><div><small>Total allocated</small><strong>${escapeHTML(money(fromMinorUnits(saved.totalMinor)))}</strong></div></section><h2>Individual shares</h2><table class="report-table"><thead><tr><th style="width:48%">Person</th><th class="numeric" style="width:30%">Share</th><th class="numeric" style="width:22%">Share of bill</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total allocated</td><td class="numeric">${escapeHTML(money(fromMinorUnits(saved.people.reduce((sum, person) => sum + person.amountMinor, 0))))}</td><td class="numeric">100.00%</td></tr></tfoot></table>`;
    await openSharedCostReport(saved.name || 'Bill split', `Split date: ${saved.date || today()} · ${saved.people.length} participants`, content, `aruvi-bill-split-${today()}.pdf`, "This is a shared-cost calculation, not a bank transaction or proof of payment. Each person’s share is entered or agreed by the participants.");
  }
  function showEventPlannerHub() {
    const plans = Array.isArray(state.eventPlans) ? state.eventPlans : [];
    openModal('Event planning', `<div class="modal-body event-planner-hub"><div class="shared-cost-intro"><strong>A clear plan for shared costs</strong><p>Add people, set the total, and split each category. Saving a plan never creates transactions.</p></div><button type="button" class="primary-button" id="event-plan-new">Create an event plan</button><div class="event-plan-list">${plans.length ? plans.map(plan => `<div class="event-plan-list-item"><div><strong>${escapeHTML(plan.name || 'Untitled event')}</strong><small>${escapeHTML(plan.date || '')} · ${escapeHTML(money(fromMinorUnits(Number(plan.totalMinor) || 0)))}</small></div><button type="button" class="mini-button" data-event-open="${escapeHTML(plan.id)}">Open</button></div>`).join('') : '<div class="empty-inline">No event plans yet. Your saved trips and gatherings will appear here.</div>'}</div><div class="form-actions"><button type="button" class="secondary-button" id="entry-tools-back">← Back to entry methods</button><button type="button" class="secondary-button" data-cancel-modal>Close</button></div></div>`, 'TRIPS · GATHERINGS · EVENTS');
  }
  function showEventPlannerStart(existing = null) {
    eventPlannerDraft = existing ? JSON.parse(JSON.stringify(existing)) : null;
    openModal(existing ? 'Edit event plan' : 'New event plan', `<form id="event-plan-start-form" class="modal-body event-planner-form">
      <div class="shared-cost-intro"><strong>Start with the event outline</strong><p>Name the event, enter its full cost, then decide whether costs are split between individuals or groups. You can create and customize categories next.</p></div>
      <div class="form-field"><label for="event-start-name">EVENT NAME</label><input id="event-start-name" name="name" maxlength="80" value="${escapeHTML(existing?.name || '')}" placeholder="e.g. Munnar weekend trip" required></div>
      <div class="form-grid"><div class="form-field"><label for="event-start-date">EVENT DATE</label><input id="event-start-date" name="date" type="date" value="${escapeHTML(existing?.date || today())}" required></div><div class="form-field"><label for="event-start-total">TOTAL COST · INR</label><input id="event-start-total" name="total" type="text" inputmode="decimal" placeholder="0.00" value="${existing ? escapeHTML(minorToInput(existing.totalMinor)) : ''}" required></div><div class="form-field"><label for="event-start-count">NUMBER OF PEOPLE</label><input id="event-start-count" name="count" type="number" inputmode="numeric" min="1" max="100" step="1" value="${existing?.participants?.length || 2}" required></div><div class="form-field"><label for="event-start-mode">ALLOCATION BASIS</label><select id="event-start-mode" name="splitMode"><option value="individual" ${!existing || existing.splitMode === 'individual' ? 'selected' : ''}>Individual people</option><option value="groups" ${existing?.splitMode === 'groups' ? 'selected' : ''}>Groups</option></select></div><div class="form-field full" id="event-start-groups-wrap" ${existing?.splitMode === 'groups' ? '' : 'hidden'}><label for="event-start-groups">NUMBER OF GROUPS</label><input id="event-start-groups" name="groupCount" type="number" inputmode="numeric" min="1" max="25" step="1" value="${existing?.groups?.length || 2}"></div></div>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">${existing ? 'Continue editing' : 'Create plan'}</button></div>
    </form>`, 'EVENT BUDGET');
  }
  function createEventPlanFromStart(form) {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const totalMinor = safeMinorInput(fd.get('total'));
    const date = String(fd.get('date') || '');
    const count = Number(fd.get('count'));
    const splitMode = fd.get('splitMode') === 'groups' ? 'groups' : 'individual';
    const groupCount = splitMode === 'groups' ? Number(fd.get('groupCount')) : 0;
    if (!name || name.length > 80 || !Number.isSafeInteger(totalMinor) || totalMinor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(count) || count < 1 || count > 100) throw new Error('Check the event name, date, total cost and number of people.');
    if (splitMode === 'groups' && (!Number.isInteger(groupCount) || groupCount < 1 || groupCount > 25 || groupCount > count)) throw new Error('Choose between 1 and 25 groups, no more than the number of people.');
    if (eventPlannerDraft && eventPlannerDraft.id) {
      const old = eventPlannerDraft;
      const participants = Array.from({ length: count }, (_, index) => old.participants[index] ? { ...old.participants[index] } : makePerson(index));
      let groups = splitMode === 'groups' ? old.groups?.slice(0, groupCount).map(group => ({ ...group, memberIds: [] })) || [] : [];
      while (splitMode === 'groups' && groups.length < groupCount) groups.push({ id: uid('group'), name: `Group ${groups.length + 1}`, memberIds: [] });
      if (splitMode === 'groups') participants.forEach((person, index) => { const previous = old.groups?.find(group => group.memberIds?.includes(person.id)); const group = groups.find(item => item.id === previous?.id) || groups[index % groups.length]; group.memberIds.push(person.id); });
      const categories = (old.categories || []).map(category => ({ ...category }));
      if (categories.length) categories[0].amountMinor = Math.max(0, Math.max(0, Number(categories[0].amountMinor) || 0) + totalMinor - old.totalMinor);
      eventPlannerDraft = { ...old, name, date, totalMinor, splitMode, participants, groups, categories };
    } else {
      const participants = Array.from({ length: count }, (_, index) => makePerson(index));
      const groups = splitMode === 'groups' ? Array.from({ length: groupCount }, (_, index) => ({ id: uid('group'), name: `Group ${index + 1}`, memberIds: [] })) : [];
      if (groups.length) participants.forEach((person, index) => groups[index % groups.length].memberIds.push(person.id));
      eventPlannerDraft = { id: null, name, date, totalMinor, splitMode, participants, groups, categories: [{ id: uid('category'), name: 'General costs', amountMinor: totalMinor, mode: 'equal', shares: [] }], createdAt: null };
    }
    normalizeEventCategoryShares(eventPlannerDraft);
    renderEventPlannerEditor(eventPlannerDraft);
  }
  function captureEventPlannerForm() {
    const form = $('#event-plan-form');
    if (!form || !eventPlannerDraft) return null;
    const draft = JSON.parse(JSON.stringify(eventPlannerDraft));
    draft.name = String($('#event-plan-name')?.value || '').trim();
    draft.date = String($('#event-plan-date')?.value || '');
    draft.totalMinor = safeMinorInput($('#event-plan-total')?.value);
    draft.splitMode = $('#event-plan-mode')?.value === 'groups' ? 'groups' : 'individual';
    draft.participants = $$('.event-participant-row', form).map(row => {
      const id = row.dataset.eventPerson;
      const previous = draft.participants.find(person => person.id === id);
      const groupControl = row.querySelector('[data-event-person-group]');
      return { id, name: String(row.querySelector('[data-event-person-name]')?.value || '').trim(), groupId: groupControl ? String(groupControl.value || '') : String(previous?.groupId || '') };
    });
    const renderedGroups = $$('.event-group-card', form).map(card => ({ id: card.dataset.eventGroup, name: String(card.querySelector('[data-event-group-name]')?.value || '').trim(), memberIds: [] }));
    if (renderedGroups.length) draft.groups = renderedGroups;
    if (draft.splitMode === 'groups') {
      const groupIds = new Set(draft.groups.map(group => group.id));
      draft.participants.forEach(person => {
        if (groupIds.has(person.groupId)) draft.groups.find(group => group.id === person.groupId).memberIds.push(person.id);
      });
    }
    draft.categories = $$('.event-category-card', form).map(card => {
      const id = card.dataset.eventCategory;
      const mode = card.querySelector('[data-event-category-mode]')?.value || 'equal';
      const shares = mode === 'equal' ? [] : $$('.event-share-row', card).map(row => {
        const raw = row.querySelector('[data-event-share-value]')?.value ?? '';
        return { unitId: row.dataset.eventUnit, value: mode === 'percent' ? Number(raw) : safeMinorInput(raw) };
      });
      return { id, name: String(card.querySelector('[data-event-category-name]')?.value || '').trim(), amountMinor: safeMinorInput(card.querySelector('[data-event-category-amount]')?.value), mode, shares };
    });
    return draft;
  }
  function renderEventPlannerEditor(draft) {
    eventPlannerDraft = JSON.parse(JSON.stringify(draft));
    normalizeEventCategoryShares(eventPlannerDraft);
    const plan = eventPlannerDraft;
    const units = eventUnits(plan);
    const groupsHTML = plan.splitMode === 'groups' ? `<section class="event-planner-section"><div class="event-planner-section-heading"><div><strong>YOUR GROUPS</strong><small>Name each group, then assign people below.</small></div><button type="button" class="event-add-inline" id="event-add-group">+ Add group</button></div><div class="event-group-list">${plan.groups.map((group, index) => `<div class="event-group-card" data-event-group-card data-event-group="${escapeHTML(group.id)}"><div class="event-group-card-head"><strong>GROUP ${index + 1}</strong>${plan.groups.length > 1 ? `<button type="button" class="event-remove-button" data-event-remove-group="${escapeHTML(group.id)}" aria-label="Remove group">×</button>` : ''}</div><label>GROUP NAME<input data-event-group-name maxlength="48" value="${escapeHTML(group.name)}"></label></div>`).join('')}</div></section>` : '';
    const membersHTML = `<section class="event-planner-section"><div class="event-planner-section-heading"><div><strong>PEOPLE</strong><small>${plan.participants.length} participants · Give everyone a name${plan.splitMode === 'groups' ? ' and assign them to a group' : ''}.</small></div><button type="button" class="event-add-inline" id="event-add-person">+ Add person</button></div><div class="event-member-list">${plan.participants.map((person, index) => `<div class="event-participant-row event-member-item ${plan.splitMode === 'groups' ? 'is-group-member' : ''}" data-event-person="${escapeHTML(person.id)}"><label class="sr-only" for="event-person-${escapeHTML(person.id)}">Person ${index + 1} name</label><input id="event-person-${escapeHTML(person.id)}" data-event-person-name maxlength="48" value="${escapeHTML(person.name)}" aria-label="Person ${index + 1} name">${plan.splitMode === 'groups' ? `<select data-event-person-group aria-label="${escapeHTML(person.name || `Person ${index + 1}`)} group">${plan.groups.map(group => `<option value="${escapeHTML(group.id)}" ${person.groupId === group.id || (!person.groupId && group.memberIds.includes(person.id)) ? 'selected' : ''}>${escapeHTML(group.name)}</option>`).join('')}</select><button type="button" class="event-remove-button" data-event-remove-person="${escapeHTML(person.id)}" aria-label="Remove person ${index + 1}">×</button>` : `<button type="button" class="event-remove-button" data-event-remove-person="${escapeHTML(person.id)}" aria-label="Remove person ${index + 1}">×</button>`}</div>`).join('')}</div></section>`;
    const categoriesHTML = `<section class="event-planner-section"><div class="event-planner-section-heading"><div><strong>COST CATEGORIES</strong><small>Each category amount must add up to the event total. Use equal, percentage or exact rupee shares.</small></div><button type="button" class="event-add-inline" id="event-add-category">+ Add category</button></div><div class="event-category-list">${plan.categories.map((category, index) => `<div class="event-category-card" data-event-category-card data-event-category="${escapeHTML(category.id)}"><div class="event-category-card-head"><strong>CATEGORY ${index + 1}</strong>${plan.categories.length > 1 ? `<button type="button" class="event-remove-button" data-event-remove-category="${escapeHTML(category.id)}" aria-label="Remove category">×</button>` : ''}</div><div class="event-category-top"><label>CATEGORY NAME<input data-event-category-name maxlength="48" value="${escapeHTML(category.name)}"></label><label>CATEGORY COST · INR<input data-event-category-amount type="text" inputmode="decimal" value="${escapeHTML(minorToInput(Number(category.amountMinor) || 0))}"></label></div><div class="event-category-controls"><label>HOW TO ALLOCATE<select data-event-category-mode><option value="equal" ${category.mode === 'equal' ? 'selected' : ''}>Equal shares</option><option value="percent" ${category.mode === 'percent' ? 'selected' : ''}>Percentage</option><option value="amount" ${category.mode === 'amount' ? 'selected' : ''}>Exact amounts</option></select></label><div class="shared-cost-total-line"><span>Allocated unit</span><strong>${plan.splitMode === 'groups' ? 'Groups' : 'People'}</strong></div></div>${category.mode === 'equal' ? '<p class="form-note">This category is split equally across the selected people or groups.</p>' : `<div class="event-share-list">${units.map((unit, unitIndex) => { const share = category.shares.find(item => item.unitId === unit.id) || { value: 0 }; return `<div class="event-share-row" data-event-share-row data-event-unit="${escapeHTML(unit.id)}"><small>${escapeHTML(unit.name || `${plan.splitMode === 'groups' ? 'Group' : 'Person'} ${unitIndex + 1}`)}</small><label class="sr-only">${category.mode === 'percent' ? 'Percentage share' : 'Amount share in rupees'}</label><input type="text" inputmode="decimal" data-event-share-value value="${escapeHTML(category.mode === 'percent' ? String(share.value) : minorToInput(Number(share.value) || 0))}" aria-label="${escapeHTML(unit.name)} ${category.mode === 'percent' ? 'percentage' : 'amount'} share">${category.mode === 'percent' ? '<small>%</small>' : '<small>INR</small>'}</div>`; }).join('')}</div>`}</div>`).join('')}</div></section>`;
    openModal(plan.id ? 'Edit event plan' : 'Event planning', `<form id="event-plan-form" class="modal-body event-planner-form" data-id="${escapeHTML(plan.id || '')}"><div class="shared-cost-intro"><strong>Plan your shared costs</strong><p>Add people, assign costs and check that every share reconciles.</p></div><div class="form-grid"><div class="form-field full"><label for="event-plan-name">EVENT NAME</label><input id="event-plan-name" maxlength="80" value="${escapeHTML(plan.name)}" required></div><div class="form-field"><label for="event-plan-date">EVENT DATE</label><input id="event-plan-date" type="date" value="${escapeHTML(plan.date)}" required></div><div class="form-field"><label for="event-plan-total">TOTAL EVENT COST · INR</label><input id="event-plan-total" type="text" inputmode="decimal" value="${escapeHTML(minorToInput(plan.totalMinor))}" required></div><div class="form-field full"><label for="event-plan-mode">SPLIT BETWEEN</label><select id="event-plan-mode"><option value="individual" ${plan.splitMode === 'individual' ? 'selected' : ''}>Individual people</option><option value="groups" ${plan.splitMode === 'groups' ? 'selected' : ''}>Groups (split each group's share equally among its members)</option></select></div></div>${groupsHTML}${membersHTML}${categoriesHTML}<div id="event-plan-validation" class="shared-cost-validation" role="status" aria-live="polite">Checking event allocation…</div><div id="event-plan-summary" class="event-planner-summary" aria-live="polite"></div><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button><button type="button" class="secondary-button" id="event-plan-download">Download PDF</button><button type="submit" class="primary-button">Save event plan</button></div><p class="form-note">Saved plans remain separate from your transaction history and account balances.</p></form>`, 'EVENT BUDGET');
    validateEventPlannerForm();
  }
  function validateEventPlannerForm() {
    const status = $('#event-plan-validation');
    const summary = $('#event-plan-summary');
    const save = $('#event-plan-form button[type="submit"]');
    const draft = captureEventPlannerForm();
    if (!draft || !status) return { valid: false };
    let result = null, error = '';
    try {
      if (!draft.name || draft.name.length > 80) throw new Error('Enter an event name.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error('Choose the event date.');
      if (!Number.isSafeInteger(draft.totalMinor) || draft.totalMinor <= 0) throw new Error('Enter a total event cost greater than zero.');
      if (draft.participants.some(person => !person.name || person.name.length > 48)) throw new Error('Give every participant a name.');
      if (draft.splitMode === 'groups' && draft.groups.some(group => !group.name || group.name.length > 48)) throw new Error('Give every group a name.');
      if (draft.categories.some(category => !category.name || category.name.length > 48)) throw new Error('Give every category a name.');
      result = sharedCosts().calculateEvent(draft);
    } catch (exception) { error = exception.message || 'Check the event allocations.'; }
    const valid = !!result;
    status.classList.toggle('is-valid', valid);
    status.classList.toggle('is-invalid', !valid);
    status.textContent = valid ? 'All category costs and participant shares reconcile exactly to the event total.' : error;
    if (summary) summary.innerHTML = valid ? `<strong>${escapeHTML(money(fromMinorUnits(result.totalMinor)))}</strong>${result.people.length} people · ${result.categories.length} categories · ${draft.splitMode === 'groups' ? `${result.groups.length} groups` : 'Individual allocation'} · fully allocated` : 'Complete the event details and make sure category amounts add up to the total.';
    if (save) save.disabled = !valid;
    eventPlannerDraft = draft;
    return { valid, draft, result, error };
  }
  async function persistEventPlanDraft(draft) {
    const snapshot = JSON.stringify(state);
    const record = { ...draft, id: draft.id || uid('event'), createdAt: draft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = state.eventPlans.findIndex(item => item.id === record.id);
    if (index >= 0) state.eventPlans[index] = record; else state.eventPlans.unshift(record);
    if (state.eventPlans.length > 200) state.eventPlans.length = 200;
    if (!(await persistMutation(snapshot, 'Could not save this event plan. Your previous records were restored.'))) return null;
    eventPlannerDraft = record;
    return record;
  }
  async function saveEventPlanFromForm() {
    const check = validateEventPlannerForm();
    if (!check.valid) { toast(check.error || 'Fix the event allocation before saving.', 'error'); return; }
    const saved = await persistEventPlanDraft(check.draft);
    if (!saved) return;
    showEventPlannerHub();
    toast('Event plan saved. Transaction history and account balances are unchanged.');
  }
  async function downloadEventPlanFromForm() {
    const check = validateEventPlannerForm();
    if (!check.valid) { toast(check.error || 'Fix the event allocation before downloading.', 'error'); return; }
    // Persist before rendering or showing the PDF sheet. If PDF creation/sharing is
    // cancelled or fails, the event remains available in the Event planning list.
    const saved = await persistEventPlanDraft(check.draft);
    if (!saved) return;
    const draft = saved;
    const { result } = check;
    const categoryRows = result.categories.map(category => `<tr><td>${escapeHTML(category.name)}</td><td class="numeric">${escapeHTML(money(fromMinorUnits(category.amountMinor)))}</td><td>${escapeHTML(category.mode === 'equal' ? 'Equal' : category.mode === 'percent' ? 'Percentage' : 'Exact amounts')}</td></tr>`).join('');
    const groupRows = result.groups.map(group => `<tr><td>${escapeHTML(group.name)}</td><td>${escapeHTML(group.members.map(person => person.name).join(', '))}</td><td class="numeric">${escapeHTML(money(fromMinorUnits(group.amountMinor)))}</td></tr>`).join('');
    const peopleRows = result.people.map(person => `<tr><td>${escapeHTML(person.name)}</td><td class="numeric">${escapeHTML(money(fromMinorUnits(person.amountMinor)))}</td><td class="numeric">${(person.amountMinor / result.totalMinor * 100).toFixed(2)}%</td></tr>`).join('');
    const categoryDetails = result.categories.map(category => `<h2>${escapeHTML(category.name)} · ${escapeHTML(money(fromMinorUnits(category.amountMinor)))}</h2><table class="report-table"><thead><tr><th style="width:45%">${draft.splitMode === 'groups' ? 'Group / people' : 'Person'}</th><th class="numeric" style="width:30%">Share</th><th class="numeric" style="width:25%">Split mode</th></tr></thead><tbody>${category.allocations.map(unit => `<tr><td>${escapeHTML(unit.unitName)}${unit.members.length > 1 ? `<br><small>${escapeHTML(unit.members.map(person => person.name).join(', '))}</small>` : ''}</td><td class="numeric">${escapeHTML(money(fromMinorUnits(unit.amountMinor)))}</td><td class="numeric">${escapeHTML(category.mode === 'equal' ? 'Equal' : category.mode === 'percent' ? 'Percent' : 'Amount')}</td></tr>`).join('')}</tbody></table>`).join('');
    const content = `<section class="summary"><div><small>Total event cost</small><strong>${escapeHTML(money(fromMinorUnits(result.totalMinor)))}</strong></div><div><small>Participants</small><strong>${result.people.length}</strong></div><div><small>Categories</small><strong>${result.categories.length}</strong></div></section><h2>Category budget</h2><table class="report-table"><thead><tr><th style="width:48%">Category</th><th class="numeric" style="width:30%">Cost</th><th style="width:22%">Allocation</th></tr></thead><tbody>${categoryRows}</tbody><tfoot><tr><td>Total categories</td><td class="numeric">${escapeHTML(money(fromMinorUnits(result.categoryTotalMinor)))}</td><td>100%</td></tr></tfoot></table>${draft.splitMode === 'groups' ? `<h2>Group allocation</h2><table class="report-table"><thead><tr><th style="width:28%">Group</th><th style="width:47%">Members</th><th class="numeric" style="width:25%">Total share</th></tr></thead><tbody>${groupRows}</tbody></table>` : ''}<h2>Final contribution per person</h2><table class="report-table"><thead><tr><th style="width:50%">Person</th><th class="numeric" style="width:28%">Contribution</th><th class="numeric" style="width:22%">Share</th></tr></thead><tbody>${peopleRows}</tbody><tfoot><tr><td>Total contributions</td><td class="numeric">${escapeHTML(money(fromMinorUnits(result.allocatedMinor)))}</td><td>100%</td></tr></tfoot></table>${categoryDetails}`;
    await openSharedCostReport(draft.name, `Event date: ${draft.date} · ${draft.splitMode === 'groups' ? 'Group allocation' : 'Individual allocation'}`, content, `aruvi-event-plan-${today()}.pdf`, 'This is a planning and cost-allocation document. It does not represent payment, create transactions or change bank/account balances. Group allocations are divided equally among members of each group unless the event plan is edited.');
  }
  function addEventParticipant() {
    const draft = captureEventPlannerForm(); if (!draft) return;
    if (draft.participants.length >= 100) { toast('An event can contain at most 100 participants.', 'amber'); return; }
    const person = makePerson(draft.participants.length);
    if (draft.splitMode === 'groups') { if (!draft.groups.length) draft.groups.push({ id: uid('group'), name: 'Group 1', memberIds: [] }); person.groupId = draft.groups[0].id; }
    draft.participants.push(person); renderEventPlannerEditor(draft);
  }
  function addEventGroup() {
    const draft = captureEventPlannerForm(); if (!draft) return;
    if (draft.groups.length >= 25) { toast('An event can contain at most 25 groups.', 'amber'); return; }
    draft.groups.push({ id: uid('group'), name: `Group ${draft.groups.length + 1}`, memberIds: [] }); renderEventPlannerEditor(draft);
  }
  function addEventCategory() {
    const draft = captureEventPlannerForm(); if (!draft) return;
    if (draft.categories.length >= 30) { toast('An event can contain at most 30 categories.', 'amber'); return; }
    draft.categories.push({ id: uid('category'), name: `Category ${draft.categories.length + 1}`, amountMinor: 0, mode: 'equal', shares: [] }); renderEventPlannerEditor(draft);
  }

  function quickAddStart(){
    quickAddDraft={amount:'',type:'',activityId:'',accountId:state.settings.lastQuickAddAccountId||state.accounts[0]?.id||'cash',paymentMethod:state.settings.lastQuickAddPaymentMethod||'Cash',note:'',date:today()};
    renderQuickAddStep('amount');
  }
  function renderQuickAddStep(step){
    if(!quickAddDraft)return;
    const d=quickAddDraft;
    const steps=['amount','type','activity'],stepIndex=steps.indexOf(step);const progress=`<div class="quick-progress" aria-label="Step ${stepIndex+1} of 3">${steps.map((_,i)=>`<span class="${i<=stepIndex?'done':''}"></span>`).join('')}</div>`;
    let body='';
    if(step==='amount'){
      body=`<form id="quick-flow-amount" class="modal-body quick-flow"><p class="quick-step-label">STEP 1 OF 3</p><h3>How much?</h3><p class="muted">Start with the amount. Add the rest in a few taps.</p><label class="quick-amount-wrap" for="quick-flow-value"><span>₹</span><input id="quick-flow-value" name="amount" class="quick-flow-value" inputmode="decimal" enterkeyhint="done" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="0" value="${escapeHTML(d.amount)}" style="font-family:var(--display)!important;font-weight:800!important;line-height:1.06!important;-webkit-text-size-adjust:100%;font-variant-numeric:tabular-nums" required aria-label="Amount in rupees"></label><p id="quick-flow-error" class="field-error" hidden></p><button class="primary-button quick-next" type="submit">Continue <span aria-hidden="true">→</span></button><div class="quick-paste-grid ${isAndroid?'single-action':''}" aria-label="Import transaction details">${isAndroid?'':`<button class="secondary-button quick-paste-button" type="button" id="paste-shortcut-quick">${icon('clipboard')} <span>Paste shortcut</span></button>`}<button class="secondary-button quick-paste-button" type="button" id="paste-bank-sms-quick"><span>Paste bank SMS</span></button></div>${isAndroid?'':`<button class="text-button quick-manual-key" type="button" id="enter-shortcut-key">Enter transaction key manually</button>`}<button class="text-button quick-cancel" type="button" data-cancel-modal>Cancel</button></form>`;
    } else if(step==='type'){
      body=`<div class="modal-body quick-flow"><p class="quick-step-label">STEP 2 OF 3 · ${escapeHTML(money(parseAmount(d.amount)))}</p><h3>What happened?</h3><p class="muted">Choose how this amount should affect your records.</p><div class="quick-choice-list"><button type="button" class="quick-choice income-choice" data-quick-type="income"><span class="quick-choice-icon" aria-hidden="true">${icon('dollar')}</span><span><strong>Income</strong><small>Allowance, salary or other money received</small></span><span>›</span></button><button type="button" class="quick-choice expense-choice" data-quick-type="expense"><span class="quick-choice-icon">↘</span><span><strong>Purchase / expense</strong><small>A purchase, bill, food, travel or another cost</small></span><span>›</span></button><button type="button" class="quick-choice" data-quick-type="refund"><span class="quick-choice-icon">↩</span><span><strong>I got a refund</strong><small>Money returned for a previous purchase</small></span><span>›</span></button></div><button class="text-button quick-cancel" type="button" data-quick-back="amount">← Change amount</button></div>`;
    } else if(step==='activity'){
      const type=d.type;const options=state.activities.filter(a=>a.kind==='both'||a.kind===type||(type==='expense'&&a.kind==='refund')).sort((a,b)=>{const ca=state.transactions.filter(t=>t.activityId===a.id).length,cb=state.transactions.filter(t=>t.activityId===b.id).length;return cb-ca||a.name.localeCompare(b.name)});
      body=`<div class="modal-body quick-flow"><p class="quick-step-label">STEP 3 OF 3 · ${escapeHTML(type==='income'?'MONEY IN':type==='refund'?'REFUND':'MONEY OUT')}</p><h3>Choose a category</h3><p class="muted">Choose a category to save and open your receipt. You can change it later.</p><div class="quick-category-grid">${options.map(a=>`<button type="button" class="quick-category" data-quick-activity="${escapeHTML(a.id)}"><span>${icon(a.icon)}</span><strong>${escapeHTML(a.name)}</strong></button>`).join('')}</div><button class="text-button quick-cancel" type="button" data-quick-back="type">← Back</button></div>`;
    }
    openModal('Quick Add',`${progress}${body}`,'QUICK ENTRY · PRIVATE ON THIS DEVICE');
    if(step==='amount')setTimeout(()=>{const amountField=$('#quick-flow-value');if(amountField){amountField.style.setProperty('font-family','var(--display)','important');amountField.style.setProperty('font-weight','800','important');amountField.style.setProperty('line-height','1.06','important');amountField.style.setProperty('-webkit-text-size-adjust','100%');fitLargeMoneyAmounts(amountField);amountField.focus({preventScroll:true});}},60);
  }
  async function saveQuickAdd(){
    if(!quickAddDraft||quickAddSaving)return;
    const d=quickAddDraft,amount=parseAmount(d.amount);
    if(!Number.isFinite(amount)||amount<=0){renderQuickAddStep('amount');toast('Enter an amount greater than ₹0.','error');return;}
    if(!['income','expense','refund'].includes(d.type)){renderQuickAddStep('type');toast('Choose a transaction type before saving.','error');return;}
    if(d.requestId){
      const existing=state.transactions.find(t=>t.shortcutRequestId===d.requestId);
      if(existing){quickAddDraft=null;closeModal();toast('This Shortcut transaction was already saved. Showing its receipt instead.','amber');showTransactionReceipt(existing);return;}
    }
    const snapshot=JSON.stringify(state);
    quickAddSaving=true;
    try{
      if(state.sample)ensurePersonalWorkspace();
      const data={type:d.type,amount,activityId:d.activityId,accountId:d.accountId,date:d.date||today(),note:d.note||'',paymentMethod:d.paymentMethod||'Cash',repeat:'none'};
      // Apply the same Smart Rules to Quick Add and Shortcut imports as the full transaction form.
      // Previously this save path bypassed the rule engine, making rules appear broken for a common workflow.
      const matchedRule=applySmartRule(data);
      const tx=addTransaction(data);
      if(!tx)throw new Error('The transaction could not be created.');
      if(d.requestId)tx.shortcutRequestId=d.requestId;
      state.settings.lastQuickAddAccountId=d.accountId;state.settings.lastQuickAddPaymentMethod=d.paymentMethod||'Cash';
      await persist();transactionHaptic();quickAddDraft=null;closeModal();renderAll();
      try{await evaluateBudgetAlerts();}catch(e){console.warn('Quick Add saved, but alerts did not refresh.',e)}
      const savedTransaction=state.transactions.find(t=>t.id===tx.id)||tx;
      showTransactionReceipt(savedTransaction);
      toast(matchedRule ? `Smart rule applied: ${matchedRule.name || matchedRule.keyword}.` : 'Saved. Your receipt is ready.');
    }catch(error){state=JSON.parse(snapshot);renderAll();console.error('Quick Add save failed.',error);toast(error.message||'Could not save. Your previous records were restored.','error');}
    finally{quickAddSaving=false;}
  }
  function dateKeyFromISO(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?Number(m[1]+m[2]+m[3]):0;}
  function isoFromDateKey(key){const value=String(Number(key)||0).padStart(8,'0');return value.length===8?`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`:'';}
  function nextRecurringDate(value,frequency,anchorDay){const normalized=frequency==='year'?'yearly':frequency;const key=dateKeyFromISO(value);if(!key)return '';return isoFromDateKey(window.PocketWiseWasm.nextRecurrence(key,normalized,Number(anchorDay)||Number(String(value).slice(-2))||1));}
  function addTransaction(data){const tx={id:uid('tx'),type:data.type,amount:fromMinorUnits(toMinorUnits(data.amount)),activityId:data.activityId||'other',accountId:data.accountId||state.accounts[0]?.id,date:data.date||today(),note:(data.note||'').trim(),merchantName:String(data.merchantName||'').trim().slice(0,100),tags:Array.isArray(data.tags)?data.tags:[],receiptPhotoId:data.receiptPhotoId||null,paymentMethod:data.paymentMethod||'Cash',createdAt:new Date().toISOString()};if(data.type==='transfer'){tx.toAccountId=data.toAccountId;if(!tx.toAccountId||tx.toAccountId===tx.accountId){toast('Choose two different accounts.','error');return false;}}if(data.repeat&&data.repeat!=='none'){const anchorDay=dateFrom(data.date||today()).getDate(),frequency=data.repeat==='year'?'yearly':data.repeat;let next=nextRecurringDate(data.date||today(),frequency,anchorDay),guard=0;while(next&&next<=today()&&guard++<1200)next=nextRecurringDate(next,frequency,anchorDay);state.reminders.push({id:uid('rem'),name:data.note||data.merchantName||activityById(data.activityId).name,merchantName:data.merchantName||'',amount:tx.amount,date:next||today(),anchorDay,accountId:tx.accountId,repeat:frequency,kind:data.type==='income'?'income':data.activityId==='subscriptions'?'subscription':data.activityId==='savings-investing'?'investment':'bill',transactionType:data.type,activityId:data.activityId,autoPost:true,active:true,note:'Recurring transaction · confirm to post when due'});}state.transactions.push(tx);return tx;}
  async function saveTransactionForm(form){
    const snapshot = JSON.stringify(state);
    const editing = !!currentEditId;
    const editId = currentEditId;
    const fd = new FormData(form);
    const type = form.dataset.type || currentTxType;
    const amount = parseAmount(fd.get('amount'));
    const errorEl = $('#tx-amount-error');
    if (!Number.isFinite(amount) || amount <= 0) {
      if (errorEl) { errorEl.hidden = false; errorEl.textContent = 'Enter a valid amount greater than ₹0. Use up to two decimal places.'; }
      $('#tx-amount')?.focus({preventScroll:true});
      toast('Check the amount. It must be greater than ₹0.', 'error');
      return;
    }
    if (errorEl) { errorEl.hidden = true; errorEl.textContent = ''; }
    let data = {type,amount,activityId:fd.get('activityId'),accountId:fd.get('accountId'),toAccountId:fd.get('toAccountId'),date:fd.get('date'),note:fd.get('note'),repeat:fd.get('repeat'),paymentMethod:fd.get('paymentMethod')||'Cash',merchantName:String(fd.get('merchantName')||'').trim().slice(0,100),tags:[...new Set(String(fd.get('tags')||'').split(',').map(x=>x.trim().replace(/^#/, '').slice(0,32)).filter(Boolean))].slice(0,12)};
    if(form.dataset.importReview==='true'){
      let meta={};try{meta=JSON.parse(form.dataset.importMeta||'{}')||{};}catch(_){}
      const merchant=String(fd.get('merchantName')||'').trim().slice(0,100);
      const reference=String(fd.get('referenceId')||'').trim().slice(0,100);
      data.merchantName=merchant;data.note=[merchant?`Merchant: ${merchant}`:'',reference?`${String(meta.referenceType||'Reference ID')}: ${reference}`:'',meta.upi?`UPI: ${String(meta.upi).slice(0,100)}`:'',meta.sourceApp?`Payment app: ${String(meta.sourceApp).slice(0,60)}`:'',meta.accountSuffix?`Account ending ${String(meta.accountSuffix).slice(-6)}`:''].filter(Boolean).join(' · ');
    }
    const matchedRule = editing || form.dataset.importReview==='true' ? null : applySmartRule(data);
    if (matchedRule) data = {...data,activityId:matchedRule.activityId};
    if (!data.date) { toast('Choose a transaction date.', 'error'); return; }
    if (type === 'transfer' && (!data.toAccountId || data.accountId === data.toAccountId)) { toast('Choose two different accounts.', 'error'); return; }
    if (state.sample && editing) { toast('Clear the preview records before editing one, so sample data does not become real financial history.', 'amber'); return; }
    try {
      if (state.sample && !editing) ensurePersonalWorkspace();
      const receiptFile=form.__pwReceiptFile||fd.get('receiptPhoto');if(receiptFile instanceof Blob&&receiptFile.size>0){const receiptPhotoId=editing?(state.transactions.find(t=>t.id===editId)?.receiptPhotoId||uid('receipt')):uid('receipt');const receiptBlob=await window.PocketWiseReceiptMedia.compress(receiptFile);await window.PocketWiseReceiptMedia.save(db,receiptPhotoId,receiptBlob);data.receiptPhotoId=receiptPhotoId;}
      if(editing&&!data.merchantName){const previous=state.transactions.find(t=>t.id===editId);if(previous?.merchantName)data.merchantName=previous.merchantName;}
      let savedTx;
      if (editing) {
        const idx = state.transactions.findIndex(t => t.id === editId);
        if (idx < 0) throw new Error('This transaction is no longer available. Close the form and try again.');
        state.transactions[idx] = {...state.transactions[idx],...data,updatedAt:new Date().toISOString()};
        savedTx = state.transactions[idx];
      } else {
        savedTx = addTransaction(data);
        if (!savedTx) { state = JSON.parse(snapshot); renderAll(); return; }
      }
      const originalTx=editing?snapshot&&JSON.parse(snapshot).transactions.find(t=>t.id===editId):null;
      if(data.merchantName&&((editing&&originalTx&&originalTx.activityId!==data.activityId)||form.dataset.importReview==='true'))learnMerchantCategory(data.merchantName,data.activityId,data.type);
      await persist();
      if(!editing&&data.repeat&&data.repeat!=='none')await syncBackgroundReminders();
      transactionHaptic();
      if(form.dataset.saveMode==='another'&&!editing){closeModal();renderAll();transactionForm(null,currentTxType);toast('Saved. Ready for the next transaction.');return;}
      closeModal();
      renderAll();
      try { await evaluateBudgetAlerts(); } catch (alertError) { console.warn('Transaction saved, but alert refresh failed.', alertError); }
      toast(matchedRule ? `Smart rule applied: ${matchedRule.name || matchedRule.keyword}.` : editing ? 'Transaction updated. Receipt is ready.' : 'Transaction saved. Receipt is ready.');
      // Show a real receipt preview immediately after a successful save. It can
      // be printed or saved to PDF, and remains accessible from transaction details.
      showTransactionReceipt(state.transactions.find(t => t.id === savedTx.id) || savedTx);
    } catch (error) {
      state = JSON.parse(snapshot);
      renderAll();
      console.error('Aruvi transaction save failed.', error);
      toast(error.message || 'Could not save this transaction. Your previous records were restored.', 'error');
    }
  }

  function budgetForm(){
    const cats=state.activities.filter(a=>!a.archived&&(a.kind==='expense'||a.kind==='both'));
    const activeCategoryLimits=Object.values(state.budgets.categories||{}).some(value=>Number(value)>0);
    const activeCount=Object.values(state.budgets.categories||{}).filter(value=>Number(value)>0).length;
    openModal('Prepare your budget',`<form id="budget-form" class="modal-body budget-entry-form">
      <section class="transaction-amount-panel budget-total-panel"><div class="transaction-entry-label"><span>MONTHLY SPENDING LIMIT</span><small>INR · Total budget</small></div><div class="form-field transaction-amount-field"><label class="sr-only" for="budget-total">Total monthly spending limit in rupees</label><input class="amount-input" id="budget-total" name="total" type="number" enterkeyhint="done" min="0" step="0.01" inputmode="decimal" placeholder="₹ 8,000" value="${state.budgets.total||''}" required></div><span class="amount-helper">Choose the overall limit you are comfortable with. It does not restrict or move money.</span></section>
      <details class="form-disclosure budget-category-details" ${activeCategoryLimits?'open':''}><summary><span class="disclosure-title">${icon('chart')} Category limits</span><span class="disclosure-hint">Optional · ${activeCount} set</span></summary><div class="disclosure-content"><p class="muted small">Set separate ceilings for categories. Leave a field empty to use no separate limit.</p><div class="budget-category-list">${cats.map(a=>`<div class="form-field budget-category-field"><div class="form-field-label-row"><label for="budget-${escapeHTML(a.id)}">${escapeHTML(a.name)}</label><button type="button" class="form-clear-link" data-clear-budget-input="${escapeHTML(a.id)}" aria-label="Clear ${escapeHTML(a.name)} budget limit">Clear</button></div><input id="budget-${escapeHTML(a.id)}" name="cat-${escapeHTML(a.id)}" type="number" inputmode="decimal" enterkeyhint="done" min="0" step="0.01" placeholder="No limit" value="${Number(state.budgets.categories[a.id])>0?state.budgets.categories[a.id]:''}"></div>`).join('')}</div></div></details>
      <details class="form-disclosure budget-note-details" ${state.budgets.note?'open':''}><summary><span class="disclosure-title">${icon('note')} Add a personal note</span><span class="disclosure-hint">Optional</span></summary><div class="disclosure-content"><div class="form-field"><label for="budget-note">YOUR INTENTION</label><textarea id="budget-note" placeholder="e.g. Keep food spending steady during exams" name="note" rows="2">${escapeHTML(state.budgets.note||'')}</textarea></div></div></details>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Save budget</button></div>
    </form>`,'YOUR PLAN');
  }
  function categoryBudgetsFromFormData(formData,activities){const categories={};for(const activity of activities){const raw=formData.get(`cat-${activity.id}`);if(raw!==null&&String(raw).trim()!==''&&Number.isFinite(Number(raw))&&Number(raw)>0)categories[activity.id]=fromMinorUnits(toMinorUnits(Number(raw)));}return categories;}
  async function saveBudget(form){const fd=new FormData(form),total=Number(fd.get('total'));if(!Number.isFinite(total)||total<0){toast('Enter a valid budget.','error');return;}const snapshot=JSON.stringify(state);ensurePersonalWorkspace();const categories=categoryBudgetsFromFormData(fd,state.activities);state.budgets={...state.budgets,total:fromMinorUnits(toMinorUnits(total)),categories,note:fd.get('note')||''};if(!(await persistMutation(snapshot,'Could not save this budget. Your previous settings were restored.')))return;closeModal();renderAll();void evaluateBudgetAlerts().catch(error=>console.warn('Budget alert refresh failed.',error));toast('Budget updated. Your plan, your call.');}
  function debtForm(debt=null){
    const direction=debt?.direction||'lent';
    const hasDebtExtras=!!(debt?.due||Number(debt?.interestRate)||debt?.note);
    openModal(debt?'Edit money owed':'Track money owed',`<form id="debt-form" class="modal-body debt-form" data-id="${debt?.id||''}">
      <div class="debt-direction-switch" role="group" aria-label="Who owes whom"><button type="button" data-debt-direction="lent" class="${direction==='lent'?'selected':''}" aria-pressed="${direction==='lent'}"><span class="debt-direction-icon">${icon('income')}</span><span><strong>Owed to me</strong><small>I gave them money</small></span></button><button type="button" data-debt-direction="borrowed" class="${direction==='borrowed'?'selected':''}" aria-pressed="${direction==='borrowed'}"><span class="debt-direction-icon">${icon('expense')}</span><span><strong>I owe them</strong><small>I received money</small></span></button></div>
      <input type="hidden" name="direction" id="debt-direction" value="${direction}">
      <label class="entry-field" for="debt-person"><span class="entry-field-icon">${icon('people')}</span><span class="entry-field-copy"><span class="entry-field-name">Person</span><input id="debt-person" name="person" placeholder="Who is this with?" value="${escapeHTML(debt?.person||'')}" autocomplete="name" required></span></label>
      <label class="entry-field" for="debt-amount"><span class="entry-field-icon">${icon('dollar')}</span><span class="entry-field-copy"><span class="entry-field-name">${direction==='lent'?'Amount they owe you':'Amount you owe'} · INR</span><input class="amount-input" id="debt-amount" name="amount" type="number" inputmode="decimal" enterkeyhint="done" min="0.01" step="0.01" placeholder="0.00" value="${debt?.amount??''}" required></span></label>
      <label class="entry-field" for="debt-date"><span class="entry-field-icon">${icon('calendar')}</span><span class="entry-field-copy"><span class="entry-field-name">Date</span><input type="date" id="debt-date" name="date" value="${debt?.date||today()}" required></span></label>
      <label class="entry-field" for="debt-account"><span class="entry-field-icon">${icon('wallet')}</span><span class="entry-field-copy"><span class="entry-field-name">Account used</span><select id="debt-account" name="accountId">${accountOptions(debt?.accountId||state.accounts[0]?.id)}</select></span></label>
      <details class="form-disclosure debt-more-details" ${hasDebtExtras?'open':''}><summary><span class="disclosure-title">${icon('more')} More details</span><span class="disclosure-hint">Due date, interest &amp; note</span></summary><div class="disclosure-content">
        <div class="form-field"><label for="debt-due">DUE DATE <span class="muted">· OPTIONAL</span></label><input type="date" id="debt-due" name="due" value="${debt?.due||''}"></div>
        <div class="form-field"><label for="debt-interest">INTEREST · YEARLY %</label><input id="debt-interest" name="interestRate" type="number" inputmode="decimal" enterkeyhint="done" min="0" max="100" step="0.1" value="${Number(debt?.interestRate)||0}" placeholder="0"><small class="muted">Used for payoff estimates only.</small></div>
        <div class="form-field"><label for="debt-note">NOTE <span class="muted">· OPTIONAL</span></label><textarea id="debt-note" name="note" placeholder="Reason or context, if useful" rows="2">${escapeHTML(debt?.note||'')}</textarea></div>
      </div></details>
      <p class="form-note">${direction==='lent'?'This tracks money you expect to get back. It is not counted as spending.':'This tracks money you need to repay. It is not counted as income.'}</p>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">${debt?'Save changes':'Save record'}</button></div>
    </form>`,'DEBTS & LENDING');
  }
  async function saveDebt(form){
    const fd=new FormData(form),amount=Number(fd.get('amount')),id=form.dataset.id,person=String(fd.get('person')||'').trim();
    if(!(Number.isFinite(amount)&&amount>0)){toast('Enter a valid amount.','error');return;}
    if(!person){toast('Add the person’s name.','error');return;}
    if(state.sample&&id){toast('Clear the preview records before editing sample debt history.','amber');return;}
    const snapshot=JSON.stringify(state);
    try{
      if(state.sample&&!id)ensurePersonalWorkspace();
      const item={id:id||uid('debt'),person,direction:fd.get('direction'),amount:fromMinorUnits(toMinorUnits(amount)),date:fd.get('date')||today(),due:fd.get('due')||'',note:String(fd.get('note')||'').trim(),accountId:fd.get('accountId'),interestRate:Math.min(100,Math.max(0,Number(fd.get('interestRate'))||0))};
      if(id){
        const previous=debtById(id);
        if(!previous)throw new Error('This debt record is no longer available. Close the form and try again.');
        if(previous.direction!==item.direction||previous.amount!==item.amount||previous.accountId!==item.accountId){toast('To preserve accounting history, edit the linked transaction or settle and recreate this debt.','amber');return;}
        Object.assign(previous,item);
        const openingTx=state.transactions.find(t=>t.debtId===id&&['borrowed','lent'].includes(t.type));
        if(openingTx){openingTx.date=item.date;openingTx.note=item.note;openingTx.updatedAt=new Date().toISOString();}
      }else{state.debts.push(item);state.transactions.push({id:uid('tx'),type:item.direction,amount:item.amount,activityId:'other',accountId:item.accountId,date:item.date,note:item.note,debtId:item.id});}
      await persist();closeModal();renderAll();toast(id?'Debt details updated.':'Debt record saved.');
    }catch(error){state=JSON.parse(snapshot);renderAll();console.error('Aruvi debt save failed; previous records restored.',error);toast(error.message||'Could not save this debt. Your previous records were restored.','error');}
  }
  function showDebts(){const dt=debtTotals();const debts=[...state.debts].sort((a,b)=>{const aOpen=debtRemaining(a)>0,bOpen=debtRemaining(b)>0;return Number(bOpen)-Number(aOpen)||b.date.localeCompare(a.date)});openModal('Debts & lending',`<div class="modal-body"><div class="insight-metrics" style="grid-template-columns:1fr 1fr;margin-bottom:14px"><div class="card metric-card"><span class="metric-label">Owed to you</span><strong class="amount-positive">${fmtHidden(dt.receivable)}</strong></div><div class="card metric-card"><span class="metric-label">You owe</span><strong>${fmtHidden(dt.payable)}</strong></div></div><div class="row-between"><span class="modal-section-title" style="margin:10px 0">PEOPLE & BALANCES</span><button type="button" class="text-button" data-action="new-debt">+ Add record</button></div><div class="entity-list">${debts.length?debts.map(d=>{const rem=debtRemaining(d),paid=debtPaid(d);return `<div class="entity-row"><span class="transaction-icon ${d.direction==='lent'?'positive':'negative'}">${icon('people')}</span><div class="entity-copy"><strong>${escapeHTML(d.person)} · ${d.direction==='lent'?'Owes you':'You owe'}</strong><small>${escapeHTML(d.note||'No note')} · ${niceDate(d.date)}${d.due?` · Due ${niceDate(d.due)}`:''}</small><small>${money(paid)} repaid · ${rem?`${money(rem)} remaining`:'Settled'}</small></div><div class="entity-value">${fmtHidden(rem)}</div><div class="entity-actions">${rem>0?`<button type="button" class="mini-button" title="Record repayment" data-debt-repay="${d.id}">${icon('check')}</button>`:''}<button type="button" class="mini-button" title="View details" data-debt-detail="${d.id}">${icon('info')}</button></div></div>`}).join(''):`<div class="empty-state"><span class="empty-icon">${icon('people')}</span><h3>No debts recorded</h3><p>Record money lent or borrowed, then track partial repayments here.</p></div>`}</div><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button><button type="button" class="primary-button" data-action="new-debt">Add debt</button></div></div>`,'CLEAR RECORDS, NO AWKWARD GUESSING');}
  function repaymentForm(debt){const rem=debtRemaining(debt);openModal(debt.direction==='lent'?'Record money received':'Record repayment',`<form id="repayment-form" class="modal-body" data-debt-id="${debt.id}"><div class="detail-grid"><div class="detail-cell"><small>PERSON</small><strong>${escapeHTML(debt.person)}</strong></div><div class="detail-cell"><small>REMAINING</small><strong>${money(rem)}</strong></div></div><div class="form-field"><label for="repay-amount">AMOUNT · INR</label><input id="repay-amount" class="amount-input" name="amount" type="number" enterkeyhint="done" min="0.01" max="${rem}" step="0.01" value="${rem}" required></div><details class="form-disclosure repayment-more-details"><summary><span class="disclosure-title">${icon('more')} More details</span><span class="disclosure-hint">Date, account and note</span></summary><div class="disclosure-content"><label class="entry-field" for="repay-date"><span class="entry-field-icon">${icon('calendar')}</span><span class="entry-field-copy"><span class="entry-field-name">Repayment date</span><input type="date" id="repay-date" name="date" value="${today()}" required></span></label><label class="entry-field" for="repay-account"><span class="entry-field-icon">${icon('wallet')}</span><span class="entry-field-copy"><span class="entry-field-name">Account</span><select id="repay-account" name="accountId">${accountOptions(debt.accountId||state.accounts[0]?.id)}</select></span></label><div class="form-field"><label for="repay-note">NOTE <span class="muted">· OPTIONAL</span></label><input id="repay-note" name="note" placeholder="Part repayment, final settlement…"></div></div></details><p class="form-note">This will be linked to the original record. The outstanding balance will update automatically.</p><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Record repayment</button></div></form>`,'UPDATE THE BALANCE');}
  async function saveRepayment(form){
    const d=debtById(form.dataset.debtId);if(!d)throw new Error('This debt record is no longer available.');
    const fd=new FormData(form),rawAmount=Number(fd.get('amount')),amount=fromMinorUnits(toMinorUnits(rawAmount)),rem=debtRemaining(d);
    if(!(Number.isFinite(amount)&&amount>0)||toMinorUnits(amount)>toMinorUnits(rem)){toast(`Enter an amount up to ${money(rem)}.`,'error');return;}
    const snapshot=JSON.stringify(state);
    try{state.transactions.push({id:uid('tx'),type:d.direction==='lent'?'repay_in':'repay_out',amount,activityId:'other',accountId:fd.get('accountId'),date:fd.get('date'),note:fd.get('note')||`Repayment · ${d.person}`,debtId:d.id});await persist();closeModal();renderAll();toast(amount>=rem?'Debt settled. History preserved.':'Repayment recorded. Outstanding balance updated.');}
    catch(error){state=JSON.parse(snapshot);renderAll();console.error('Aruvi repayment save failed; previous records restored.',error);toast(error.message||'Could not save this repayment. Your previous records were restored.','error');}
  }
  function debtDetail(debt){const txs=state.transactions.filter(t=>t.debtId===debt.id).sort((a,b)=>a.date.localeCompare(b.date));const rem=debtRemaining(debt),paid=debtPaid(debt);openModal(debt.person,'<div class="modal-body"><div class="detail-grid"><div class="detail-cell"><small>ORIGINAL AMOUNT</small><strong>'+money(debt.amount)+'</strong></div><div class="detail-cell"><small>OUTSTANDING</small><strong>'+money(rem)+'</strong></div><div class="detail-cell"><small>DIRECTION</small><strong>'+(debt.direction==='lent'?'Money lent':'Money borrowed')+'</strong></div><div class="detail-cell"><small>REPAID</small><strong>'+money(paid)+'</strong></div></div><div class="note-box"><small>NOTE</small><p>'+escapeHTML(debt.note||'No note added.')+'</p></div><div class="section-header"><h2>History</h2><span class="muted tiny">'+txs.length+' entries</span></div><div class="entity-list">'+txs.map(t=>`<div class="entity-row"><span class="transaction-icon ${['repay_in'].includes(t.type)?'positive':t.type==='repay_out'?'negative':'blue'}">${icon(t.type==='repay_in'?'income':t.type==='repay_out'?'expense':'people')}</span><div class="entity-copy"><strong>${escapeHTML(typeLabel(t.type))}</strong><small>${niceDate(t.date)} · ${escapeHTML(t.note||'No note')}</small></div><div class="entity-value">${money(t.amount)}</div></div>`).join('')+'</div><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button>'+(rem>0?`<button type="button" class="primary-button" data-debt-repay="${debt.id}">Record repayment</button>`:'<span class="status-pill success-pill"><i></i> Settled</span>')+'</div></div>','REPAYMENT HISTORY');}

  function ensurePersonalWorkspace(){if(!state.sample)return;state.transactions=[];state.debts=[];state.goals=[];state.reminders=[];state.pendingRecurringEntries=[];state.billSplits=[];state.eventPlans=[];state.accounts.forEach(a=>a.openingBalance=0);state.budgets={total:0,categories:{},note:''};state.settings.notifications=[];state.settings.sentAlerts=[];state.settings.seenAlerts=[];state.sample=false;toast('Sample records cleared. You are now using your own workspace.');}
  function showTransactionDetail(tx){const a=txActivity(tx),account=accountById(tx.accountId),debt=tx.debtId?debtById(tx.debtId):null;let title=tx.note||a.name;if(debt)title=tx.type==='borrowed'?`Borrowed from ${debt.person}`:tx.type==='lent'?`Lent to ${debt.person}`:tx.type==='repay_out'?`Repayment to ${debt.person}`:`Repayment from ${debt.person}`;if(tx.type==='transfer')title=`Transfer · ${account.name} to ${accountById(tx.toAccountId).name}`;
    const detailType=['expense','repay_out','lent'].includes(tx.type)?'out':'in';const editable=!tx.debtId;
    openModal(title,`<div class="modal-body"><div class="detail-grid"><div class="detail-cell"><small>AMOUNT</small><strong data-money class="${detailType==='in'?'amount-positive':''}">${['expense','repay_out','lent'].includes(tx.type)?'−':''}${money(tx.amount)}</strong></div><div class="detail-cell"><small>TYPE</small><strong>${escapeHTML(typeLabel(tx.type))}</strong></div><div class="detail-cell"><small>ACTIVITY</small><strong>${escapeHTML(a.name)}</strong></div><div class="detail-cell"><small>ACCOUNT</small><strong>${escapeHTML(account.name)}${tx.toAccountId?` → ${escapeHTML(accountById(tx.toAccountId).name)}`:''}</strong></div><div class="detail-cell"><small>DATE</small><strong>${niceDate(tx.date)}</strong></div><div class="detail-cell"><small>IDENTIFIER</small><strong style="font-size:9px;word-break:break-all">${escapeHTML(tx.id)}</strong></div></div><div class="note-box"><small>NOTE</small><p>${escapeHTML(tx.note||'No note added.')}</p></div>${tx.merchantName?`<div class="detail-cell"><small>MERCHANT / PAYEE</small><strong>${escapeHTML(tx.merchantName)}</strong></div>`:''}${tx.tags?.length?`<div class="note-box"><small>TAGS</small><p>${tx.tags.map(tag=>`#${escapeHTML(tag)}`).join(' ')}</p></div>`:''}<div id="tx-receipt-photo-preview"></div>${debt?`<div class="form-note">Linked debt: ${escapeHTML(debt.person)} · ${money(debtRemaining(debt))} remains. Repayment history is preserved.</div>`:''}<div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button>${debt?`<button type="button" class="secondary-button" data-debt-detail="${debt.id}">Debt history</button>`:editable?`<button type="button" class="secondary-button" data-tx-edit="${tx.id}">${icon('edit')} Edit</button>`:''}<button type="button" class="secondary-button" data-tx-receipt="${tx.id}">${icon('receipt')} Receipt</button><button type="button" class="danger-button" data-tx-delete="${tx.id}">Delete</button></div></div>`,'ACTIVITY DETAILS');
    if(tx.receiptPhotoId)window.PocketWiseReceiptMedia.load(db,tx.receiptPhotoId).then(url=>{const host=$('#tx-receipt-photo-preview');if(!host||!url)return;host.innerHTML=`<div class="note-box"><small>ATTACHED RECEIPT PHOTO</small><img src="${url}" alt="Receipt attached to this transaction" style="display:block;width:100%;max-height:320px;object-fit:contain;border-radius:12px;margin-top:8px"></div>`;const photo=host.querySelector('img');if(url.startsWith('blob:'))photo?.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});}).catch(error=>console.warn('Could not display receipt photo.',error));}
  function receiptMarkup(tx){
    const a=txActivity(tx), from=accountById(tx.accountId), to=tx.toAccountId?accountById(tx.toAccountId):null;
    const isOut=['expense','lent','repay_out'].includes(tx.type);
    const isIn=['income','refund','borrowed','repay_in'].includes(tx.type);
    const title=tx.note?.trim() || (tx.type==='transfer'?'Account transfer':a.name);
    const ref=String(tx.id||'').replace(/[^a-zA-Z0-9_-]/g,'');
    return `<article class="receipt-paper" id="receipt-paper">
      <header class="receipt-brand"><span class="receipt-mark">✓</span><div><strong>Aruvi</strong><small>PERSONAL FINANCE RECORD</small></div><span class="receipt-status">SAVED</span></header>
      <div class="receipt-rule"></div><p class="receipt-kicker">TRANSACTION RECEIPT</p><h3 class="receipt-title">${escapeHTML(title)}</h3>
      <p class="receipt-amount ${isOut?'receipt-out':isIn?'receipt-in':''}">${isOut?'−':isIn?'+':''}${escapeHTML(money(tx.amount))}</p>
      <p class="receipt-subtitle">${escapeHTML(typeLabel(tx.type))} · ${escapeHTML(tx.date?niceDate(tx.date):'Date not set')}</p>
      <div class="receipt-rule receipt-rule-dashed"></div>
      <dl class="receipt-fields">
        <div><dt>Reference ID</dt><dd>${escapeHTML(ref || 'Not available')}</dd></div>
        <div><dt>Activity</dt><dd>${escapeHTML(a.name)}</dd></div>
        <div><dt>Account</dt><dd>${escapeHTML(from.name)}</dd></div>
        ${to?`<div><dt>Transferred to</dt><dd>${escapeHTML(to.name)}</dd></div>`:''}
        <div><dt>Payment method</dt><dd>${escapeHTML(tx.paymentMethod||'Not specified')}</dd></div>
        <div><dt>Record status</dt><dd>Saved on this device</dd></div>
        <div><dt>Saved on</dt><dd>${escapeHTML(tx.createdAt?new Date(tx.createdAt).toLocaleString():niceDate(tx.date))}</dd></div>
      </dl>
      ${tx.note?`<div class="receipt-note"><small>NOTE</small><p>${escapeHTML(tx.note)}</p></div>`:''}
      <div class="receipt-rule receipt-rule-dashed"></div><p class="receipt-footnote">This is a Aruvi personal record generated from information you entered. It is not a bank, card-network, or UPI-issued receipt and does not independently prove payment settlement.</p>
      <footer class="receipt-footer"><span>Private by design</span><span>Receipt · ${escapeHTML(ref.slice(-8).toUpperCase()||'LOCAL')}</span></footer>
    </article>`;
  }
  function receiptFilename(tx){
    const ref=String(tx?.id||'LOCAL').replace(/[^a-zA-Z0-9_-]/g,'').slice(-28)||'LOCAL';
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(tx?.date||''))?tx.date:today();
    return `Aruvi-Receipt-${date}-${ref}.html`;
  }
  function receiptShareText(tx){
    const account=accountById(tx.accountId),activity=txActivity(tx);
    const title=String(tx.note||'').trim()||activity.name;
    const amountPrefix=['expense','lent','repay_out'].includes(tx.type)?'−':['income','refund','borrowed','repay_in'].includes(tx.type)?'+':'';
    return [
      'Aruvi · Personal finance receipt',
      title,
      `${amountPrefix}${money(tx.amount)} · ${typeLabel(tx.type)}`,
      `Date: ${tx.date?niceDate(tx.date):'Date not set'}`,
      `Reference ID: ${String(tx.id||'').replace(/[^a-zA-Z0-9_-]/g,'')||'Not available'}`,
      `Activity: ${activity.name}`,
      `Account: ${account.name}`,
      `Payment method: ${tx.paymentMethod||'Not specified'}`,
      tx.note?`Note: ${tx.note}`:'',
      'Personal record generated from information entered in Aruvi. It is not a bank-issued receipt or proof of settlement.'
    ].filter(Boolean).join('\n');
  }
  function standaloneReceiptHTML(tx){
    const markup=receiptMarkup(tx);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Aruvi receipt</title><style>
      *{box-sizing:border-box}html{background:#f3f5f2}body{margin:0;padding:clamp(12px,4vw,32px);background:#f3f5f2;color:#202820;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.receipt-paper{max-width:450px;margin:8px auto 18px;padding:24px;background:#fff;color:#202820;border:1px solid #e3e9e2;border-radius:18px;box-shadow:0 8px 28px rgba(18,35,22,.06)}.receipt-brand{display:flex;align-items:center;gap:10px;min-width:0}.receipt-mark{display:grid;place-items:center;width:38px;height:38px;flex:none;border-radius:12px;background:#e2f2e8;color:#258456;font-size:22px;font-weight:800}.receipt-brand>div{min-width:0}.receipt-brand strong,.receipt-brand small{display:block}.receipt-brand strong{font-size:18px}.receipt-brand small{font-size:9px;letter-spacing:1.05px;color:#78837b;margin-top:2px}.receipt-status{margin-left:auto;border-radius:30px;padding:5px 9px;background:#e7f5eb;color:#258456;font-size:9px;font-weight:800;letter-spacing:.9px}.receipt-rule{height:1px;background:#e5eae4;margin:18px 0}.receipt-rule-dashed{height:1px;background:repeating-linear-gradient(to right,#cbd4cc 0 5px,transparent 5px 10px)}.receipt-kicker{margin:0;color:#77837a;font-size:10px;font-weight:800;letter-spacing:1.5px}.receipt-title{margin:6px 0 0;font-size:22px;line-height:1.25;overflow-wrap:anywhere}.receipt-amount{font-size:36px;line-height:1.2;font-weight:800;letter-spacing:-1px;font-variant-numeric:tabular-nums;margin:18px 0 5px}.receipt-in{color:#258456}.receipt-out{color:#c84e48}.receipt-subtitle{color:#77837b;font-size:12px;margin:0}.receipt-fields{display:grid;gap:0;margin:0}.receipt-fields>div{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:9px 0;border-bottom:1px solid #edf0ec}.receipt-fields dt{color:#78827a;font-size:12px;flex:0 0 38%}.receipt-fields dd{margin:0;max-width:62%;text-align:right;font-size:12px;font-weight:650;overflow-wrap:anywhere;word-break:break-word}.receipt-note{margin-top:15px;padding:12px;background:#f6f8f5;border-radius:10px}.receipt-note small{font-size:9px;font-weight:800;letter-spacing:1px;color:#77837a}.receipt-note p{margin:4px 0 0;overflow-wrap:anywhere}.receipt-footnote{font-size:10px;color:#768078;line-height:1.55}.receipt-footer{display:flex;justify-content:space-between;gap:10px;color:#8b948d;font-size:9px;letter-spacing:.25px;flex-wrap:wrap}.receipt-export-actions{max-width:450px;margin:0 auto 14px;padding:8px 0 14px;display:flex;gap:9px;flex-wrap:wrap;position:sticky;top:0;z-index:10;background:#f3f5f2}.receipt-export-actions button{min-height:44px;border:1px solid #d9e2da;border-radius:12px;background:#fff;color:#202820;padding:10px 14px;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.receipt-export-actions button[data-export-print]{background:#258456;color:#fff;border-color:#258456}@media print{html,body{background:#fff;padding:0}.receipt-paper{border:0;box-shadow:none;border-radius:0;margin:0 auto;padding:0}.receipt-export-actions{display:none}}
      </style></head><body><div class="receipt-export-actions"><button type="button" onclick="history.back()">Back</button><button type="button" onclick="if(navigator.share){navigator.share({title:'Aruvi receipt',text:document.getElementById('receipt-paper')?.innerText||document.body.innerText}).catch(()=>{})}else{alert('Use your browser or Files share action to share this receipt.')} ">Share receipt</button><button type="button" data-export-print onclick="window.print()">Print / Save PDF</button></div>${markup}</body></html>`;
  }
  function showTransactionReceipt(tx){
    openModal('Receipt preview',`<div class="receipt-actions receipt-actions-top"><button class="secondary-button" type="button" data-cancel-modal>← Back</button><button class="secondary-button" type="button" data-share-receipt="${escapeHTML(tx.id)}">${icon('upload')} Share receipt</button><button class="secondary-button" type="button" data-download-receipt="${escapeHTML(tx.id)}">${icon('download')} Download copy</button><button class="primary-button" type="button" data-print-receipt="${escapeHTML(tx.id)}">${icon('file')} Print / Save PDF</button></div>${receiptMarkup(tx)}`,'RECEIPT · PRIVATE ON THIS DEVICE');
  }
  async function shareTransactionReceipt(id){
    const tx=state.transactions.find(item=>item.id===id);if(!tx){toast('This transaction could not be found.','error');return;}
    const title='Aruvi transaction receipt',text=receiptShareText(tx);
    if(typeof navigator.share==='function'){
      try{await navigator.share({title,text});toast('Receipt shared.');return;}
      catch(error){if(error?.name==='AbortError')return;console.warn('Native receipt sharing failed.',error);}
    }
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);toast('Receipt details copied. You can paste them into a message.');return;}
    }catch(error){console.warn('Receipt copy fallback failed.',error);}
    const filename=receiptFilename(tx).replace(/\.html$/i,'.txt');
    downloadBlob(filename,new Blob([text],{type:'text/plain;charset=utf-8'}));
    toast('Receipt details downloaded as a text file.','amber');
  }
  function downloadTransactionReceipt(id){
    const tx=state.transactions.find(item=>item.id===id);if(!tx){toast('This transaction could not be found.','error');return;}
    const filename=receiptFilename(tx),html=standaloneReceiptHTML(tx);
    try{
      const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
      anchor.href=url;anchor.download=filename;anchor.rel='noopener';anchor.hidden=true;document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
      toast('Receipt download started. Check Downloads or Files.');
    }catch(error){console.error('Receipt download failed.',error);toast('Could not download this receipt. Use Share receipt or Print / Save PDF instead.','error');}
  }
  async function printTransactionReceipt(id){
    const tx=state.transactions.find(item=>item.id===id);if(!tx){toast('This transaction could not be found.','error');return;}
    const html=standaloneReceiptHTML(tx).replace(/<div class=\"receipt-export-actions\">[\s\S]*?<\/div>/,'');
    const filename=receiptFilename(tx).replace(/\.html$/i,'.pdf');
    return deliverGeneratedPDF(html,filename,'Aruvi transaction receipt');
  }
  const deletingTransactionIds = new Set();
  async function confirmDeleteTransaction(id){
    if(deletingTransactionIds.has(id))return;
    const tx=state.transactions.find(t=>t.id===id);if(!tx)return;
    const debt=(tx.debtId&&['borrowed','lent'].includes(tx.type))?state.debts.find(d=>d.id===tx.debtId):null;
    const linkedCount=debt?state.transactions.filter(t=>t.debtId===debt.id).length:1;
    if(debt&&!confirm(`Delete the ${debt.direction==='borrowed'?'borrowed':'lent'} debt for ${debt.person||'this person'} and its ${linkedCount} linked transaction${linkedCount===1?'':'s'}? The linked repayment history will also be removed.`))return;
    const snapshot=JSON.stringify(state);
    const removedTransactions=state.transactions.filter(t=>debt?t.debtId===debt.id:t.id===id).map(t=>({...t}));
    deletingTransactionIds.add(id);
    window.__pocketwiseUndoTx={action:'restore',tx:{...tx},transactions:removedTransactions,debt:debt?{...debt}:null};
    state.transactions=state.transactions.filter(t=>debt?t.debtId!==debt.id:t.id!==id);
    if(debt)state.debts=state.debts.filter(d=>d.id!==debt.id);
    try{
      await persist();
      closeModal();renderAll();
      const region=$('#toast-region');region.querySelectorAll('.toast').forEach(el=>el.remove());
      const el=document.createElement('div');el.className='toast';el.innerHTML=`${icon('check')}<span>${debt?'Debt and linked history deleted.':'Transaction deleted.'}</span><button type="button" class="text-button" data-undo-tx="${escapeHTML(tx.id)}">Undo</button>`;region.append(el);setTimeout(()=>el.remove(),6000);
    }catch(error){state=JSON.parse(snapshot);window.__pocketwiseUndoTx=null;closeModal();renderAll();console.error('Aruvi delete failed; prior records restored.',error);toast(error.message||'Could not delete this record. Your previous records were restored.','error');}
    finally{deletingTransactionIds.delete(id);}
  }
  let repeatTransactionInFlight=false;
  const reminderActionInFlight = new Set();
  async function repeatActivityTransaction(activityId){
    if(repeatTransactionInFlight)return;
    const activity=activityById(activityId);
    const last=state.transactions.filter(t=>t.activityId===activity.id&&t.type==='expense').sort((x,y)=>(y.createdAt||'').localeCompare(x.createdAt||''))[0];
    if(!last){transactionForm(null,'expense');$('#tx-activity').value=activity.id;return;}
    repeatTransactionInFlight=true;
    const snapshot=JSON.stringify(state);
    try{
      const tx=addTransaction({type:'expense',amount:last.amount,activityId:activity.id,accountId:last.accountId,date:today(),note:last.note||activity.name,paymentMethod:last.paymentMethod||'Cash'});
      if(!tx)return;
      await persist();
      window.__pocketwiseUndoTx={action:'remove',tx:{...tx},transactions:[{...tx}],debt:null};
      renderAll();const region=$('#toast-region');region.querySelectorAll('.toast').forEach(el=>el.remove());
      const el=document.createElement('div');el.className='toast';el.innerHTML=`${icon('check')}<span>Repeated ${escapeHTML(activity.name)}.</span><button type="button" class="text-button" data-undo-tx="${escapeHTML(tx.id)}">Undo</button>`;region.append(el);setTimeout(()=>el.remove(),6000);
    }catch(error){state=JSON.parse(snapshot);window.__pocketwiseUndoTx=null;renderAll();console.error('Aruvi repeat failed; prior records restored.',error);toast(error.message||'Could not repeat this transaction. Your previous records were restored.','error');}
    finally{repeatTransactionInFlight=false;}
  }
  function accountCreateForm(){openModal('Add account',`<form id="account-form" class="modal-body account-create-form"><p class="account-form-intro">Add the place where you keep money. You can set a starting balance now or skip it.</p><label class="entry-field" for="account-name"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">Account name</span><input id="account-name" name="name" placeholder="e.g. Scholarship account" autocomplete="off" required></span></label><label class="entry-field" for="account-type"><span class="entry-field-icon">${icon('wallet')}</span><span class="entry-field-copy"><span class="entry-field-name">Account type</span><select id="account-type" name="type"><option value="cash">Cash</option><option value="bank">Bank / UPI</option><option value="card">Card</option><option value="savings">Savings</option><option value="other">Other</option></select></span></label><details class="form-disclosure account-opening-details"><summary><span class="disclosure-title">${icon('dollar')} Starting balance</span><span class="disclosure-hint">Optional · existing money</span></summary><div class="disclosure-content"><div class="form-field"><label for="account-opening">STARTING BALANCE · INR</label><input id="account-opening" name="openingBalance" type="number" inputmode="decimal" enterkeyhint="done" step="0.01" value="0"></div><div class="form-field"><label for="account-opening-date">BALANCE DATE <span class="muted">· OPTIONAL</span></label><input id="account-opening-date" name="openingBalanceDate" type="date"><small class="muted">Set when this balance was accurate to improve older reports.</small></div></div></details><div class="form-actions account-create-actions"><button class="secondary-button" type="button" id="account-back-to-list">Back to accounts</button><button class="primary-button" type="submit">${icon('plus')} Add account</button></div></form>`,'NEW ACCOUNT');}
  function accountsManager(){openModal('Accounts',`<div class="modal-body account-manager"><div class="account-list-heading"><div><strong>Your accounts</strong><small>${state.accounts.length} ${state.accounts.length===1?'account':'accounts'} · balances stay separate</small></div><span class="account-count-icon">${icon('wallet')}</span></div><div class="entity-list account-entity-list">${state.accounts.map(a=>{const typeLabel=a.type==='cash'?'Cash':a.type==='bank'?'Bank / UPI':a.type==='card'?'Card':a.type==='savings'?'Savings':'Other';return `<div class="entity-row account-entity-row"><span class="transaction-icon blue">${icon(a.type==='cash'?'wallet':a.type==='card'?'creditcard':a.type==='savings'?'piggybank':'bank')}</span><div class="entity-copy"><strong>${escapeHTML(a.name)}</strong><small>${typeLabel} · Starting at ${money(a.openingBalance)}</small></div><div class="entity-value">${fmtHidden(balanceForAccount(a.id))}</div><div class="entity-actions"><button class="mini-button" type="button" data-account-edit="${escapeHTML(a.id)}" title="Edit account" aria-label="Edit ${escapeHTML(a.name)}">${icon('edit')}</button>${state.accounts.length>1?`<button class="mini-button" type="button" data-account-remove="${escapeHTML(a.id)}" title="Remove account" aria-label="Remove ${escapeHTML(a.name)}">${icon('trash')}</button>`:''}</div></div>`;}).join('')}</div><button class="primary-button account-open-create" id="account-open-create" type="button">${icon('plus')} Add an account</button><div class="form-actions account-manager-done"><button class="secondary-button" type="button" data-cancel-modal>Done</button></div></div>`,'ACCOUNTS');}
  async function addAccountForm(form){const fd=new FormData(form),name=String(fd.get('name')||'').trim(),openingBalance=Number(fd.get('openingBalance')||0);if(!name){toast('Give the account a name.','error');return;}if(!Number.isFinite(openingBalance)){toast('Enter a valid opening balance.','error');return;}const snapshot=JSON.stringify(state);try{ensurePersonalWorkspace();state.accounts.push({id:uid('acct'),name,type:fd.get('type'),openingBalance:fromMinorUnits(toMinorUnits(openingBalance)),openingBalanceDate:fd.get('openingBalanceDate')||null});await persist();accountsManager();renderAll();toast('Account added.');}catch(error){state=JSON.parse(snapshot);renderAll();toast(error.message||'Could not save this account. Your previous records were restored.','error');}}
  function editAccount(id){const account=accountById(id),hasStarting=!!(Number(account.openingBalance)||account.openingBalanceDate);openModal('Edit account',`<form class="modal-body account-edit-form" id="account-edit-form" data-id="${escapeHTML(id)}"><label class="entry-field" for="edit-account-name"><span class="entry-field-icon">${icon('wallet')}</span><span class="entry-field-copy"><span class="entry-field-name">Account name</span><input id="edit-account-name" name="name" value="${escapeHTML(account.name)}" autocomplete="off" required></span></label><details class="form-disclosure account-opening-details" ${hasStarting?'open':''}><summary><span class="disclosure-title">${icon('dollar')} Starting balance</span><span class="disclosure-hint">Optional · historical setup</span></summary><div class="disclosure-content"><div class="form-field"><label for="edit-account-opening">STARTING BALANCE · INR</label><input id="edit-account-opening" name="openingBalance" type="number" inputmode="decimal" enterkeyhint="done" step="0.01" value="${account.openingBalance}"></div><div class="form-field"><label for="edit-account-opening-date">BALANCE DATE <span class="muted">· OPTIONAL</span></label><input id="edit-account-opening-date" name="openingBalanceDate" type="date" value="${escapeHTML(account.openingBalanceDate||'')}"></div><p class="form-note">This is the amount held before transactions on the balance date.</p></div></details><div class="form-actions"><button class="secondary-button" type="button" id="account-back-to-list">Back to accounts</button><button class="primary-button" type="submit">Save account</button></div></form>`,'ACCOUNT SETTINGS');}
  async function saveAccountEdit(form){const a=state.accounts.find(item=>item.id===form.dataset.id),fd=new FormData(form),openingBalance=Number(fd.get('openingBalance'));if(!a)throw new Error('This account is no longer available.');if(!Number.isFinite(openingBalance)){toast('Enter a valid opening balance.','error');return;}const snapshot=JSON.stringify(state);try{a.name=String(fd.get('name')||a.name).trim();a.openingBalance=fromMinorUnits(toMinorUnits(openingBalance));a.openingBalanceDate=fd.get('openingBalanceDate')||null;await persist();accountsManager();renderAll();toast('Account updated.');}catch(error){state=JSON.parse(snapshot);renderAll();toast(error.message||'Could not update this account. Your previous records were restored.','error');}}
  async function removeAccount(id){const account=state.accounts.find(item=>item.id===id);if(!account)return;if(state.transactions.some(t=>t.accountId===id||t.toAccountId===id)){toast('This account has transaction history. Keep it, or move its transactions before removing it.','amber');return;}if(!confirm(`Remove ${account.name}?`))return;const snapshot=JSON.stringify(state);state.accounts=state.accounts.filter(a=>a.id!==id);try{await persist();accountsManager();renderAll();toast('Account removed.');}catch(error){state=JSON.parse(snapshot);renderAll();toast(error.message||'Could not remove this account. Your previous records were restored.','error');}}
  function activitiesManager(){
    const sorted=sortedActivities();
    openModal('Activities & categories',`<div class="modal-body activity-manager">
      <p class="muted small">Your categories organise spending and income. Archived categories remain attached to older transactions.</p>
      <div class="entity-list">${sorted.map(a=>`<div class="entity-row ${a.archived?'activity-archived':''}"><span class="transaction-icon">${icon(a.icon)}</span><div class="entity-copy"><strong>${escapeHTML(a.name)}${a.archived?' · Archived':''}</strong><small>${a.count} ${a.count===1?'use':'uses'} · ${escapeHTML(a.kind)}</small></div><button type="button" class="mini-button" data-activity-edit="${escapeHTML(a.id)}" title="Edit category" aria-label="Edit ${escapeHTML(a.name)}">${icon('edit')}</button>${a.archived?`<button type="button" class="mini-button" data-activity-restore="${escapeHTML(a.id)}" title="Restore category" aria-label="Restore ${escapeHTML(a.name)}">${icon('check')}</button>`:`<button type="button" class="mini-button" data-activity-remove="${escapeHTML(a.id)}" title="Archive category" aria-label="Archive ${escapeHTML(a.name)}">${icon('archive')}</button>`}</div>`).join('')}</div>
      <button class="primary-button activity-open-create" id="activity-open-create" type="button">${icon('plus')} Add a category</button>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Done</button></div>
    </div>`,'CATEGORIES');
  }
  function activityCreateForm(){
    openModal('Add a category',`<form id="activity-form" class="modal-body activity-create-form">
      <p class="account-form-intro">Give this category a name and choose whether it is used for income, expenses or both.</p>
      <label class="entry-field" for="new-activity-name"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">Category name</span><input id="new-activity-name" name="name" placeholder="e.g. College canteen" maxlength="48" required></span></label>
      <label class="entry-field" for="new-activity-kind"><span class="entry-field-icon">${icon('swap')}</span><span class="entry-field-copy"><span class="entry-field-name">Used for</span><select id="new-activity-kind" name="kind"><option value="expense">Expenses</option><option value="income">Income</option><option value="both">Both</option></select></span></label>
      <details class="form-disclosure"><summary><span class="disclosure-title">${icon('palette')} Choose an icon</span><span class="disclosure-hint">Optional · default icon is fine</span></summary><div class="disclosure-content"><div class="form-field"><label for="new-activity-icon">CATEGORY ICON</label><select id="new-activity-icon" name="icon">${activityIconOptions('tag')}</select></div></div></details>
      <div class="form-actions"><button class="secondary-button" type="button" id="activity-back-to-list">Back to categories</button><button class="primary-button" type="submit">Add category</button></div>
    </form>`,'NEW CATEGORY');
  }
  async function addActivityForm(form){const fd=new FormData(form),name=String(fd.get('name')||'').trim();if(!name){toast('Give the activity a name.','error');return;}if(state.activities.some(a=>a.name.toLowerCase()===name.toLowerCase())){toast('That activity already exists.','amber');return;}const snapshot=JSON.stringify(state);ensurePersonalWorkspace();state.activities.push({id:uid('act'),name,kind:fd.get('kind'),icon:activityIconChoices.some(x=>x[0]===fd.get('icon'))?fd.get('icon'):'tag',freq:0,custom:true,archived:false});if(!(await persistMutation(snapshot,'Could not save this activity. Your previous records were restored.')))return;activitiesManager();renderAll();toast('Activity added.');}
  function editActivity(id){const a=activityById(id);openModal('Edit activity',`<form id="activity-edit-form" class="modal-body" data-id="${escapeHTML(id)}"><div class="form-field"><label for="rename-activity">ACTIVITY NAME</label><input id="rename-activity" name="name" value="${escapeHTML(a.name)}" required></div><div class="form-field"><label for="edit-activity-icon">ICON · ${activityIconChoices.length} OPTIONS</label><select id="edit-activity-icon" name="icon">${activityIconOptions(a.icon||'tag')}</select></div><p class="form-note">Renaming changes the displayed category name for old entries too. Your transaction records and amounts are not changed.</p><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Save activity</button></div></form>`,'ACTIVITY SETTINGS');}
  async function saveActivityEdit(form){const a=activityById(form.dataset.id),fd=new FormData(form),name=String(fd.get('name')||'').trim();if(!a||!name)return;if(state.activities.some(x=>x.id!==a.id&&x.name.toLowerCase()===name.toLowerCase())){toast('That activity name is already used.','amber');return;}const snapshot=JSON.stringify(state);a.name=name;a.icon=activityIconChoices.some(x=>x[0]===fd.get('icon'))?fd.get('icon'):a.icon||'tag';if(!(await persistMutation(snapshot,'Could not update this activity. Your previous records were restored.')))return;activitiesManager();renderAll();toast('Activity updated.');}
  async function removeActivity(id){const activity=state.activities.find(a=>a.id===id);if(!activity)return;if(activity.archived){toast('This activity is already archived.','amber');return;}if(!confirm(`Archive “${activity.name}”? It will disappear from new transaction choices, but past transactions and reports will remain intact.`))return;const snapshot=JSON.stringify(state);activity.archived=true;if(!(await persistMutation(snapshot,'Could not archive this activity. Your previous records were restored.')))return;activitiesManager();renderAll();toast('Activity archived. Existing history was preserved.');}
  async function restoreActivity(id){const a=state.activities.find(x=>x.id===id);if(!a)return;const snapshot=JSON.stringify(state);a.archived=false;if(!(await persistMutation(snapshot,'Could not restore this activity. Your previous records were restored.')))return;activitiesManager();renderAll();toast(`${a.name} restored to new transaction choices.`);}
  function goalForm(goal=null){
    const hasGoalExtras=!!(Number(goal?.saved)||goal?.due||goal?.priority==='high'||goal?.priority==='low');
    openModal(goal?'Edit savings goal':'Create a savings goal',`<form id="goal-form" class="modal-body goal-form" data-id="${goal?.id||''}">
      <div class="goal-form-intro"><span class="section-kicker">YOUR NEXT MILESTONE</span><p>Name the target and set the amount you want to reach. You can add the rest later.</p></div>
      <label class="entry-field" for="goal-name"><span class="entry-field-icon">${icon('goal')}</span><span class="entry-field-copy"><span class="entry-field-name">Goal name</span><input id="goal-name" name="name" placeholder="e.g. Laptop for college" value="${escapeHTML(goal?.name||'')}" maxlength="64" required></span></label>
      <label class="entry-field" for="goal-target"><span class="entry-field-icon">${icon('dollar')}</span><span class="entry-field-copy"><span class="entry-field-name">Target amount · INR</span><input id="goal-target" name="target" type="number" inputmode="decimal" enterkeyhint="done" min="1" step="0.01" placeholder="0.00" value="${goal?.target||''}" required></span></label>
      <details class="form-disclosure goal-more-details" ${hasGoalExtras?'open':''}><summary><span class="disclosure-title">${icon('sliders')} More goal details</span><span class="disclosure-hint">Current savings, date &amp; priority</span></summary><div class="disclosure-content">
        <div class="form-field"><label for="goal-saved">CURRENT SAVINGS · INR</label><input id="goal-saved" name="saved" type="number" inputmode="decimal" enterkeyhint="done" min="0" step="0.01" value="${goal?.saved||0}"></div>
        <div class="form-field"><label for="goal-due">TARGET DATE <span class="muted">· OPTIONAL</span></label><input id="goal-due" name="due" type="date" min="${today()}" value="${goal?.due||''}"></div>
        <div class="form-field"><label for="goal-priority">PRIORITY</label><select id="goal-priority" name="priority"><option value="high" ${goal?.priority==='high'?'selected':''}>High</option><option value="medium" ${!goal?.priority||goal?.priority==='medium'?'selected':''}>Medium</option><option value="low" ${goal?.priority==='low'?'selected':''}>Low</option></select></div>
      </div></details>
      <p class="form-note">Goal progress is a tracker. It does not move money between accounts or count as an expense.</p>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Save goal</button></div>
    </form>`,'SAVINGS GOALS');
  }
  async function saveGoal(form){const fd=new FormData(form),target=Number(fd.get('target')),saved=Number(fd.get('saved')),id=form.dataset.id,name=String(fd.get('name')||'').trim(),due=String(fd.get('due')||'');if(!name||!(Number.isFinite(target)&&target>0)||!(Number.isFinite(saved)&&saved>=0)){toast('Check the goal details.','error');return;}if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||localDate(dateFrom(due))!==due||due<today())){toast('Choose a valid target date that is today or later.','error');return;}if(state.sample&&id){toast('Clear preview records before editing sample goals.','amber');return;}const snapshot=JSON.stringify(state);ensurePersonalWorkspace();const previous=id?state.goals.find(g=>g.id===id):null;const goal={...(previous||{}),id:id||uid('goal'),name,target:fromMinorUnits(toMinorUnits(target)),saved:fromMinorUnits(toMinorUnits(saved)),due:due||null,priority:['high','medium','low'].includes(fd.get('priority'))?fd.get('priority'):'medium',contributions:Array.isArray(previous?.contributions)?previous.contributions:[],createdAt:previous?.createdAt||new Date().toISOString()};if(id){const i=state.goals.findIndex(g=>g.id===id);if(i>=0)state.goals[i]=goal;else{toast('This savings goal is no longer available.','error');return;}}else state.goals.push(goal);if(!(await persistMutation(snapshot,'Could not save this goal. Your previous records were restored.')))return;closeModal();renderAll();toast('Savings goal saved.');}
  function remindersManager(){
    const reminders=[...state.reminders].sort((a,b)=>a.date.localeCompare(b.date));
    const pending=Array.isArray(state.pendingRecurringEntries)?state.pendingRecurringEntries:[];
    openModal('Bills & reminders',`<div class="modal-body reminder-manager">
      <p class="muted small">Review upcoming payments and confirm prepared recurring entries. Aruvi only records a payment after you confirm it.</p>
      ${pending.length?`<section class="reminder-group" aria-labelledby="reminder-pending-title"><div class="modal-section-title" id="reminder-pending-title">READY FOR YOUR REVIEW · ${pending.length}</div><div class="entity-list">${pending.map(p=>`<div class="entity-row"><span class="transaction-icon blue">${icon('calendar')}</span><div class="entity-copy"><strong>${escapeHTML(p.name)}</strong><small>${niceDate(p.dueDate)} · ${escapeHTML(p.kind||'recurring')} · ${escapeHTML(typeLabel(p.transactionType||'expense'))}</small><small>${escapeHTML(accountById(p.accountId).name)} · awaiting confirmation</small></div><div class="entity-value">${money(p.amount)}</div><div class="entity-actions"><button type="button" class="mini-button" data-recurring-confirm="${escapeHTML(p.id)}" title="Confirm and post transaction" aria-label="Confirm ${escapeHTML(p.name)}">${icon('check')}</button></div></div>`).join('')}</div></section>`:''}
      <section class="reminder-group" aria-labelledby="reminder-upcoming-title"><div class="modal-section-title" id="reminder-upcoming-title">UPCOMING COMMITMENTS</div><div class="entity-list">${reminders.length?reminders.map(r=>`<div class="entity-row"><span class="transaction-icon blue">${icon('calendar')}</span><div class="entity-copy"><strong>${escapeHTML(r.name)}</strong><small>${niceDate(r.date)} · ${escapeHTML(r.kind||'bill')} · ${escapeHTML(r.repeat||'once')}${r.autoPost?' · Review before posting':''}${r.active?'':' · Paused'}</small><small>${escapeHTML(r.note||'')}${r.accountId?` · ${escapeHTML(accountById(r.accountId).name)}`:''}</small></div><div class="entity-value">${money(r.amount)}</div><div class="entity-actions">${r.autoPost?'':`<button type="button" class="mini-button" data-reminder-paid="${escapeHTML(r.id)}" title="Mark paid and log expense" aria-label="Mark ${escapeHTML(r.name)} paid">${icon('check-circle')}</button>`}<button type="button" class="mini-button" data-reminder-toggle="${escapeHTML(r.id)}" title="${r.active?'Pause':'Resume'} reminder" aria-label="${r.active?'Pause':'Resume'} ${escapeHTML(r.name)}">${icon(r.active?'check':'clock')}</button><button type="button" class="mini-button" data-reminder-remove="${escapeHTML(r.id)}" title="Delete reminder" aria-label="Delete ${escapeHTML(r.name)}">${icon('trash')}</button></div></div>`).join(''):`<div class="empty-inline">No planned payments yet. Add a reminder for rent, subscriptions or expected income.</div>`}</div></section>
      <button class="primary-button reminder-open-create" id="reminder-open-create" type="button">${icon('plus')} Add a reminder</button>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Done</button></div>
    </div>`,'UPCOMING COMMITMENTS');
  }
  function reminderCreateForm(){
    openModal('Add a reminder',`<form id="reminder-form" class="modal-body reminder-create-form">
      <p class="account-form-intro">Add a payment or expected income. You can keep it one-time or set a repeat schedule.</p>
      <label class="entry-field" for="reminder-name"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">What is it?</span><input id="reminder-name" name="name" placeholder="e.g. Rent, electricity or salary" maxlength="100" required></span></label>
      <label class="entry-field" for="reminder-amount"><span class="entry-field-icon">${icon('dollar')}</span><span class="entry-field-copy"><span class="entry-field-name">Amount · INR</span><input id="reminder-amount" name="amount" type="number" inputmode="decimal" enterkeyhint="done" min="0" step="0.01" placeholder="0.00" required></span></label>
      <label class="entry-field" for="reminder-date"><span class="entry-field-icon">${icon('calendar')}</span><span class="entry-field-copy"><span class="entry-field-name">Next due date</span><input id="reminder-date" name="date" type="date" value="${today()}" required></span></label>
      <label class="entry-field" for="reminder-repeat"><span class="entry-field-icon">${icon('clock')}</span><span class="entry-field-copy"><span class="entry-field-name">Repeat</span><select id="reminder-repeat" name="repeat"><option value="once">One time</option><option value="weekly">Every week</option><option value="monthly">Every month</option><option value="yearly">Every year</option></select></span></label>
      <details class="form-disclosure reminder-more-details"><summary><span class="disclosure-title">${icon('more')} More options</span><span class="disclosure-hint">Type, account, note &amp; confirmation</span></summary><div class="disclosure-content">
        <div class="form-field"><label for="reminder-kind">COMMITMENT TYPE</label><select id="reminder-kind" name="kind"><option value="bill">Bill / payment</option><option value="subscription">Subscription / membership</option><option value="investment">SIP / investment</option><option value="income">Expected income / salary</option></select></div>
        <div class="form-field"><label for="reminder-account">ACCOUNT</label><select id="reminder-account" name="accountId">${accountOptions(state.accounts[0]?.id)}</select></div>
        <div class="form-field"><label for="reminder-note">NOTE <span class="muted">· OPTIONAL</span></label><input id="reminder-note" name="note" placeholder="Renewal date, bill reference…" maxlength="240"></div>
        <label class="checkbox-label reminder-autopost-option"><input type="checkbox" name="autoPost" checked> Prepare a transaction for my review when this is due</label>
      </div></details>
      <div class="form-actions"><button class="secondary-button" type="button" id="reminder-back-to-list">Back to reminders</button><button class="primary-button" type="submit">Add reminder</button></div>
    </form>`,'NEW REMINDER');
  }
  async function saveReminder(form){const fd=new FormData(form),amount=Number(fd.get('amount'));if(!(Number.isFinite(amount)&&amount>=0)||!String(fd.get('name')||'').trim()){toast('Check the reminder details.','error');return;}const snapshot=JSON.stringify(state);ensurePersonalWorkspace();const reminderDate=fd.get('date')||today(),kind=fd.get('kind')||'bill',repeat=fd.get('repeat')||'once',transactionType=kind==='income'?'income':'expense',activityId=kind==='income'?'salary':kind==='subscription'?'subscriptions':kind==='investment'?'savings-investing':'bills-rent';state.reminders.push({id:uid('rem'),name:String(fd.get('name')).trim(),amount:fromMinorUnits(toMinorUnits(amount)),date:reminderDate,anchorDay:Number(reminderDate.slice(-2))||dateFrom(reminderDate).getDate(),repeat,kind,transactionType,activityId,accountId:fd.get('accountId'),autoPost:!!fd.get('autoPost')&&repeat!=='once',active:true,note:String(fd.get('note')||'').trim()});if(!(await persistMutation(snapshot,'Could not save this reminder. Your previous records were restored.')))return;await processDueRecurringEntries();await syncBackgroundReminders();remindersManager();renderAll();toast('Reminder added.');}
  async function processDueRecurringEntries(persistChanges=true){const pending=Array.isArray(state.pendingRecurringEntries)?state.pendingRecurringEntries:[],snapshot=JSON.stringify(state),todayDate=today();let changed=false;state.pendingRecurringEntries=pending;for(const reminder of state.reminders){if(!reminder||!reminder.active||!reminder.autoPost||!reminder.date||reminder.date>todayDate)continue;let guard=0;while(reminder.active&&reminder.date<=todayDate&&guard++<1200){const dueDate=reminder.date,occurrenceKey=`${reminder.id}:${dueDate}`;const alreadyPosted=state.transactions.some(tx=>tx.recurringOccurrenceId===occurrenceKey),alreadyPending=state.pendingRecurringEntries.some(item=>item.occurrenceKey===occurrenceKey);if(!alreadyPosted&&!alreadyPending){const transactionType=reminder.transactionType||(reminder.kind==='income'?'income':'expense');state.pendingRecurringEntries.push({id:uid('recurring'),reminderId:reminder.id,occurrenceKey,dueDate,name:reminder.name,amount:reminder.amount,kind:reminder.kind,transactionType,activityId:reminder.activityId||(transactionType==='income'?'salary':reminder.kind==='subscription'?'subscriptions':reminder.kind==='investment'?'savings-investing':'bills-rent'),accountId:reminder.accountId,merchantName:reminder.merchantName||''});changed=true;}if(['weekly','monthly','yearly','year'].includes(reminder.repeat)){const next=nextRecurringDate(dueDate,reminder.repeat,Number(reminder.anchorDay)||Number(dueDate.slice(-2)));if(!next||next<=dueDate){reminder.active=false;changed=true;break;}reminder.date=next;changed=true;}else{reminder.active=false;changed=true;break;}}}if(changed&&persistChanges){if(!(await persistMutation(snapshot,'Could not prepare recurring transactions. Your previous records were restored.')))return false;}return changed;}
  async function confirmRecurringOccurrence(pendingId){const pending=(state.pendingRecurringEntries||[]).find(item=>item.id===pendingId);if(!pending)return;const snapshot=JSON.stringify(state);if(state.transactions.some(tx=>tx.recurringOccurrenceId===pending.occurrenceKey)){state.pendingRecurringEntries=state.pendingRecurringEntries.filter(item=>item.id!==pendingId);if(!(await persistMutation(snapshot,'Could not clear this duplicate pending entry.')))return;remindersManager();return;}const tx=addTransaction({type:pending.transactionType,amount:pending.amount,activityId:pending.activityId,accountId:pending.accountId||state.accounts[0]?.id,date:pending.dueDate,note:pending.name,merchantName:pending.merchantName,paymentMethod:'Scheduled'});if(!tx){state=JSON.parse(snapshot);return;}tx.recurringOccurrenceId=pending.occurrenceKey;state.pendingRecurringEntries=state.pendingRecurringEntries.filter(item=>item.id!==pendingId);if(!(await persistMutation(snapshot,'Could not post this recurring transaction. Your previous records were restored.')))return;transactionHaptic();remindersManager();renderAll();toast('Recurring transaction posted.');}


  async function syncBackgroundReminders(){if(!window.PocketWisePush?.isConfigured?.()||!window.PocketWisePush?.hasInstallation?.())return;try{await window.PocketWisePush.syncReminders(state.reminders||[]);}catch(error){console.warn('Background reminder sync failed.',error);}}
  function isQuietNow(){const start=state.settings.quietStart||'21:00',end=state.settings.quietEnd||'08:00',now=new Date().toTimeString().slice(0,5);if(start<=end)return now>=start&&now<end;return now>=start||now<end;}
  async function showSystemNotification(title,options={}){if(!('Notification'in window)||Notification.permission!=='granted')return false;const payload={body:String(options.body||''),tag:String(options.tag||`pw-${Date.now()}`),icon:new URL('assets/icons/icon-192.PNG',location.href).href,badge:new URL('assets/icons/icon-192.PNG',location.href).href,data:{url:location.href}};try{if('serviceWorker'in navigator){const registration=await navigator.serviceWorker.ready;await registration.showNotification(title,payload);}else{new Notification(title,payload);}return true;}catch(error){console.warn('System notification could not be displayed.',error);return false;}}
  async function evaluateBudgetAlerts(allowSystem=true){const alerts=makeAlerts().filter(a=>a.id!=='all-clear'),snapshot=JSON.stringify(state);state.settings.sentAlerts=state.settings.sentAlerts||[];state.settings.notifications=state.settings.notifications||[];let added=false;for(const a of alerts){if(state.settings.sentAlerts.includes(a.id))continue;state.settings.sentAlerts.push(a.id);state.settings.notifications.unshift({...a,createdAt:new Date().toISOString()});added=true;if(allowSystem&&'Notification'in window&&Notification.permission==='granted'&&!isQuietNow()){try{await showSystemNotification(a.title,{body:a.body,tag:a.id});}catch(error){console.warn('System notification could not be shown.',error);}}}if(state.settings.notifications.length>100)state.settings.notifications.length=100;if(added&&await persistMutation(snapshot,'Could not save alert history. Your previous records were restored.'))renderAlerts();}
  function openNotifications(){const active=makeAlerts().filter(a=>a.id!=='all-clear'),history=state.settings.notifications||[],previousSeen=[...(state.settings.seenAlerts||[])];active.forEach(a=>{if(!state.settings.seenAlerts.includes(a.id))state.settings.seenAlerts.push(a.id)});$('#notifications-content').innerHTML=(history.length?[...history.slice(0,20)]:active).map(a=>`<div class="notification-record"><span class="alert-symbol ${a.type||'blue'}">${icon(a.icon||'bell')}</span><div><strong>${escapeHTML(a.title||'Financial reminder')}</strong><p>${escapeHTML(a.body||'')}</p><small>${escapeHTML(a.createdAt?new Date(a.createdAt).toLocaleString():a.time||'Current')}</small></div></div>`).join('')||'<div class="empty-state"><span class="empty-icon">'+icon('bell')+'</span><h3>All caught up</h3><p>Important reminders will show up here.</p></div>';$('#notifications-modal').showModal();persist().then(()=>renderAlerts()).catch(error=>{state.settings.seenAlerts=previousSeen;console.error('Could not persist notification read state.',error);toast('Could not save notification read status. Your other records are unchanged.','error');renderAlerts();});}
  function downloadBlob(filename,blob){
    if(!(blob instanceof Blob)||!blob.size){toast('The file is empty and could not be saved.','error');return false;}
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=String(filename||'aruvi-export');a.rel='noopener';
    a.style.position='fixed';a.style.left='-10000px';a.style.top='0';
    document.body.appendChild(a);
    try{a.click();}catch(error){console.error('Aruvi file download failed.',error);URL.revokeObjectURL(url);a.remove();return false;}
    a.remove();
    playInteractionFeedback('download');
    // Mobile browsers may not consume a Blob URL until after their download
    // manager has handled the click. Do not revoke it after only 1.8 seconds.
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    return true;
  }

  const PDF_RENDERER_URL='https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js';
  const IOS_PDF_RENDERER_URL='https://cdn.jsdelivr.net/npm/html3pdf@0.12.2/dist/html3pdf.bundle.min.js';
  let pendingGeneratedPDF=null;
  let pdfReturnModal=null;
  function isIOSShareContext(){
    const ua=navigator.userAgent||'';
    return /iPad|iPhone|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&Number(navigator.maxTouchPoints)>1);
  }
  function isMobilePDFDeliveryContext(){
    const ua=navigator.userAgent||'';
    return isIOSShareContext()||/Android/i.test(ua)||navigator.userAgentData?.mobile===true;
  }
  function getPDFRenderScale(root,ios=isIOSShareContext()){
    // html3pdf renders one canvas per A4 page rather than one canvas for the
    // complete report. Keep each iOS page modest to stay below WebKit's
    // device-dependent canvas memory limits.
    if(ios)return 1.15;
    return 2;
  }
  async function assertValidPDFBlob(blob){
    if(!blob||typeof blob.size!=='number'||blob.size<500)throw new Error('The PDF renderer returned an empty document.');
    let signature='';
    try{signature=await blob.slice(0,5).text();}catch(_){
      const buffer=await blob.slice(0,5).arrayBuffer();
      signature=String.fromCharCode(...new Uint8Array(buffer));
    }
    if(signature!=='%PDF-')throw new Error('The PDF renderer returned an invalid file. Please retry.');
    return blob;
  }
  async function renderPDFBlobFromHTML(html,filename){
    const ios=isIOSShareContext();
    const rendererURL=ios?IOS_PDF_RENDERER_URL:PDF_RENDERER_URL;
    const source=String(html||'');
    const renderWithRenderer=async function(url,pageWise,context){
      const signal=context&&context.signal;
      const frame=document.createElement('iframe');
      frame.setAttribute('title','PDF rendering surface');
      frame.setAttribute('aria-hidden','true');
      frame.tabIndex=-1;
      // Keep the rendering document in the layout/paint tree. iOS WebKit can
      // fail to initialise html2canvas in a far-offscreen srcdoc iframe.
      // Opacity prevents a visual flash without using display:none/visibility:hidden.
      frame.style.cssText='position:fixed;left:0;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;z-index:-1';
      document.body.appendChild(frame);
      const makeAbortError=()=>{const error=new Error('PDF rendering was cancelled after its provider route timed out or was replaced.');error.name='AbortError';return error;};
      let rejectAbort;
      const aborted=new Promise((resolve,reject)=>{rejectAbort=reject;});
      const onAbort=()=>{try{frame.remove();}catch(_){};rejectAbort(makeAbortError());};
      if(signal?.aborted)onAbort();
      else signal?.addEventListener('abort',onAbort,{once:true});
      const work=(async()=>{
        try{
          if(!/<head(?:\s[^>]*)?>/i.test(source)||!/<\/head>/i.test(source))throw new Error('The report document is missing its head section.');
          // Use the same-origin blank frame, then wait for the renderer script's
          // own load event before touching the html2pdf global.
          const doc=frame.contentDocument;
          if(!doc)throw new Error('The PDF rendering document is unavailable.');
          doc.open();doc.write(source);doc.close();
          await new Promise((resolve,reject)=>{
            let settled=false;
            const finish=error=>{
              if(settled)return;settled=true;window.clearTimeout(timeout);
              signal?.removeEventListener('abort',abortDuringLoad);
              if(error)reject(error);else resolve();
            };
            const abortDuringLoad=()=>finish(makeAbortError());
            const timeout=window.setTimeout(()=>finish(new Error('PDF renderer loading timed out. Check the connection and retry.')),20000);
            signal?.addEventListener('abort',abortDuringLoad,{once:true});
            const script=doc.createElement('script');script.src=url;script.crossOrigin='anonymous';script.async=true;
            script.onload=()=>{
              const renderer=frame.contentWindow?.html2pdf;
              if(typeof renderer!=='function')finish(new Error('The PDF renderer script loaded but did not expose html2pdf.'));
              else finish();
            };
            script.onerror=()=>finish(new Error('Could not load the PDF renderer from its cached or network source.'));
            doc.head.appendChild(script);
          });
          const win=frame.contentWindow;
          if(!win||!doc||typeof win.html2pdf!=='function')throw new Error('The PDF renderer did not initialize.');
          try{await Promise.race([doc.fonts?.ready||Promise.resolve(),new Promise(resolve=>window.setTimeout(resolve,3000))]);}catch(_){}
          const root=doc.querySelector('.report-page,.report,.receipt-paper,main')||doc.body;
          if(!root)throw new Error('The report content could not be found in the PDF rendering document.');
          const scale=getPDFRenderScale(root,ios);
          const width=Math.max(794,Math.ceil(root.scrollWidth||root.getBoundingClientRect().width||794));
          const height=Math.max(1123,Math.ceil(root.scrollHeight||root.getBoundingClientRect().height||1123));
          const options={
            margin:[10,10,12,10],filename,
            image:{type:'jpeg',quality:ios?0.88:0.96},
            html2canvas:{scale,useCORS:true,allowTaint:false,logging:false,backgroundColor:'#ffffff',windowWidth:width,windowHeight:height,imageTimeout:15000},
            jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
            pagebreak:{mode:['css','legacy'],avoid:['.brand','.report-brand-row','.summary','.report-note','.note','.report-footer','.receipt-brand','.receipt-fields']}
          };
          const worker=win.html2pdf().set(options).from(root);
          let result;
          if(pageWise){
            // html3pdf paginates first and renders each A4 page into its own canvas.
            if(typeof worker.toCanvases!=='function')throw new Error('The iOS page-wise PDF renderer is missing its page-splitting support.');
            result=await worker.toCanvases().toPdf().outputPdf('blob');
          }else{
            // Preserve html2pdf for desktop/Android and as a secondary iOS route.
            result=await worker.outputPdf('blob');
          }
          const blob=result instanceof Blob?result:new Blob([result],{type:'application/pdf'});
          return await assertValidPDFBlob(blob);
        }finally{try{frame.remove();}catch(_){}}
      })();
      try{return await Promise.race([work,aborted]);}
      finally{signal?.removeEventListener('abort',onAbort);try{frame.remove();}catch(_){}}
    };

    const system=window.PocketWiseSystem;
    if(system&&typeof system.run==='function'){
      const providers=ios?[
        {id:201,priority:120,label:'iOS page-wise PDF renderer',timeoutMs:150000,supported:true,available:true,enabled:true,
          run:(input,context)=>renderWithRenderer(IOS_PDF_RENDERER_URL,true,context),
          assess:blob=>({ok:!!blob&&blob.size>=500,reason:'The page-wise renderer did not produce a valid PDF.'})},
        {id:202,priority:100,label:'Standard PDF renderer',timeoutMs:150000,supported:true,available:true,enabled:true,
          run:(input,context)=>renderWithRenderer(PDF_RENDERER_URL,false,context),
          assess:blob=>({ok:!!blob&&blob.size>=500,reason:'The standard renderer did not produce a valid PDF.'})}
      ]:[
        {id:202,priority:110,label:'Standard PDF renderer',timeoutMs:150000,supported:true,available:true,enabled:true,
          run:(input,context)=>renderWithRenderer(PDF_RENDERER_URL,false,context),
          assess:blob=>({ok:!!blob&&blob.size>=500,reason:'The standard renderer did not produce a valid PDF.'})}
      ];
      const routed=await system.run('pdf-export',providers,{html:source,filename,ios},{timeoutMs:150000,keepLastResort:false});
      return await assertValidPDFBlob(routed.result);
    }
    // Compatibility for isolated tests/embedded hosts without the adaptive router.
    return renderWithRenderer(rendererURL,ios,null);
  }
  function canSharePDFFile(file){
    try{return !!file&&typeof File==='function'&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});}
    catch(_){return false;}
  }
  function capturePDFReturnModal(){
    const dialog=$('#app-modal'),content=$('#modal-content');
    if(!dialog?.open)return null;
    const controls=content?[...content.querySelectorAll('input,select,textarea')].map(control=>({
      tagName:control.tagName,
      type:control.type||'',
      value:control.type==='file'?'':control.value,
      checked:'checked'in control?!!control.checked:null,
      selectedValues:control.tagName==='SELECT'?[...control.selectedOptions].map(option=>option.value):null
    })):[];
    return {title:$('#modal-title')?.textContent||'',kicker:$('#modal-kicker')?.textContent||'',body:content?.innerHTML||'',controls,scrollTop:dialog.scrollTop,contentScrollTop:content?.scrollTop||0};
  }
  function restorePDFReturnModal(){
    const previous=pdfReturnModal;
    pdfReturnModal=null;
    pendingGeneratedPDF=null;
    if(!previous){closeModal();return;}
    openModal(previous.title,previous.body,previous.kicker);
    const dialog=$('#app-modal'),content=$('#modal-content');
    const controls=content?[...content.querySelectorAll('input,select,textarea')]:[];
    (previous.controls||[]).forEach((saved,index)=>{
      const control=controls[index];
      if(!control||control.tagName!==saved.tagName||control.type==='file')return;
      if(control.tagName==='SELECT'&&Array.isArray(saved.selectedValues)){
        const selected=new Set(saved.selectedValues);
        [...control.options].forEach(option=>{option.selected=selected.has(option.value);});
      }else if(saved.value!==undefined)control.value=saved.value;
      if(saved.checked!==null&&saved.checked!==undefined&&'checked'in control)control.checked=saved.checked;
    });
    requestAnimationFrame(()=>{if(dialog?.open)dialog.scrollTop=previous.scrollTop||0;if(content)content.scrollTop=previous.contentScrollTop||0;});
  }
  function showPDFReadyActions(file,title,shareSupported=true,kind='pdf'){
    pdfReturnModal=capturePDFReturnModal();
    pendingGeneratedPDF={file,title,shareSupported,kind};
    const printable=kind==='html';
    const itemLabel=printable?'print-ready report':'PDF';
    const message=printable
      ?'The PDF engine could not finish on this device. A print-ready report is ready instead. Open it in your browser and choose Print / Save as PDF.'
      :isIOSShareContext()
        ?(shareSupported?'Your PDF is ready. Save PDF or Share PDF opens the iOS Share Sheet. Choose Save to Files to keep a copy.':'Your PDF is ready. Open the PDF preview, then use Share to save it to Files.')
        :shareSupported
          ?'Your PDF is ready. Tap Save PDF to download it, or Share PDF to open your device sharing options.'
          :'Your PDF is ready. Tap Save PDF to download it to your device.';
    const titleText=printable?'Print-ready report is ready':'Your PDF is ready';
    const saveLabel=printable?'Save report':'Save PDF';
    const shareLabel=printable?'Share report':'Share PDF';
    openModal(titleText,`<div class="modal-body generated-pdf-ready"><div class="shared-cost-intro"><strong>${escapeHTML(file.name||'Aruvi-report.pdf')}</strong><p>${message}</p></div><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button><button type="button" class="secondary-button" id="download-ready-pdf">${saveLabel}</button>${shareSupported?`<button type="button" class="primary-button" id="share-ready-pdf">${shareLabel}</button>`:''}</div></div>`,printable?'PRINT-READY EXPORT':'PDF EXPORT');
  }
  async function deliverGeneratedPDF(html,filename,title){
    const safeName=String(filename||'Aruvi-report.pdf').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/\.html$/i,'.pdf');
    try{
      const blob=await renderPDFBlobFromHTML(html,safeName);
      if(isMobilePDFDeliveryContext()){
        const file=typeof File==='function'?new File([blob],safeName,{type:'application/pdf',lastModified:Date.now()}):blob;
        const shareSupported=canSharePDFFile(file);
        showPDFReadyActions(file,title||'Aruvi PDF',shareSupported,'pdf');
        toast(isIOSShareContext()?(shareSupported?'PDF created. Tap Save PDF and choose Save to Files.':'PDF created. Tap Save PDF to open the preview.'):'PDF created. Tap Save PDF to download it.','green');
        return true;
      }
      if(!downloadBlob(safeName,blob))throw new Error('The browser did not accept the PDF download.');
      toast('PDF download started. Check Files or Downloads.');
      return true;
    }catch(error){
      console.error('Aruvi PDF export failed; preparing the original printable report fallback.',error);
      try{
        // Keep the older, self-contained print-ready HTML export as a safety
        // net. This avoids losing the report when a CDN renderer cannot load
        // or a mobile canvas renderer runs out of memory.
        const htmlName=safeName.replace(/\.pdf$/i,'.html');
        const htmlBlob=new Blob([String(html||'')],{type:'text/html;charset=utf-8'});
        if(!htmlBlob.size||!/<html[\s>]/i.test(String(html||'')))throw new Error('The print-ready report source is empty or invalid.');
        if(isMobilePDFDeliveryContext()){
          const file=typeof File==='function'?new File([htmlBlob],htmlName,{type:'text/html',lastModified:Date.now()}):htmlBlob;
          const shareSupported=canSharePDFFile(file);
          showPDFReadyActions(file,title||'Aruvi report',shareSupported,'html');
        }else if(!downloadBlob(htmlName,htmlBlob)){
          throw new Error('The browser did not accept the print-ready report download.');
        }
        toast('PDF generation was unavailable. A print-ready report is ready instead. Open it and choose Print / Save as PDF.','amber');
        return true;
      }catch(fallbackError){
        console.error('Aruvi printable report fallback failed.',fallbackError);
        toast('Could not export this report. Your saved transactions were not changed. Please retry.','error');
        return false;
      }
    }
  }
  function openPDFInBrowser(file){
    const url=URL.createObjectURL(file);
    let opened=null;
    try{opened=window.open(url,'_blank');}catch(_){}
    if(!opened){
      const link=document.createElement('a');
      link.href=url;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Open generated report file');
      document.body.appendChild(link);link.click();link.remove();
    }
    // iOS PDF preview may fetch the blob after the new browsing context starts.
    window.setTimeout(()=>URL.revokeObjectURL(url),300000);
    return true;
  }
  async function savePendingGeneratedPDF(){
    const pending=pendingGeneratedPDF;
    if(!pending)return;
    const printable=pending.kind==='html';
    const fileLabel=printable?'print-ready report':'PDF';
    if(isIOSShareContext()){
      if(pending.shareSupported&&canSharePDFFile(pending.file)){
        // Invoke navigator.share synchronously in this click handler, before
        // yielding to any awaited operation. iOS requires transient activation.
        let sharePromise;
        try{sharePromise=navigator.share({files:[pending.file]});}
        catch(error){console.warn('iOS export Share Sheet could not be opened.',error);pending.shareSupported=false;toast('The Share Sheet could not open. Tap Save again to open the file.','amber');return;}
        try{await sharePromise;restorePDFReturnModal();toast(printable?'Report shared. Open it in a browser and choose Print / Save as PDF.':'PDF shared. Choose Save to Files to keep a copy.');return;}
        catch(error){
          if(error?.name==='AbortError')return;
          console.warn('iOS export via Share Sheet failed; browser preview fallback is available.',error);
          pending.shareSupported=false;
          toast('The Share Sheet could not open. Tap Save again to open the file.','amber');return;
        }
      }
      openPDFInBrowser(pending.file);restorePDFReturnModal();toast(printable?'Print-ready report opened. Choose Print / Save as PDF.':'PDF opened. Use Share, then Save to Files.','amber');return;
    }
    // Android now downloads only from this explicit Save tap. The previous
    // flow attempted a hidden download after a long async render, outside the
    // original tap's activation window, which can be rejected by mobile PWAs.
    if(downloadBlob(pending.file.name,pending.file)){
      restorePDFReturnModal();
      toast(printable?'Print-ready report downloaded. Open it and choose Print / Save as PDF.':'PDF download started. Check Files or Downloads.');
    }else{
      toast(`Could not save the ${fileLabel}. Try Share instead.`,'error');
    }
  }
  async function sharePendingGeneratedPDF(){
    const pending=pendingGeneratedPDF;
    if(!pending)return;
    if(!pending.shareSupported||!canSharePDFFile(pending.file)){
      openPDFInBrowser(pending.file);restorePDFReturnModal();
      toast(pending.kind==='html'?'Print-ready report opened. Choose Print / Save as PDF.':'PDF opened. Use your device Share action to send or save it.','amber');return;
    }
    // Keep the Web Share call in the direct button activation path.
    let sharePromise;
    try{sharePromise=navigator.share({files:[pending.file]});}
    catch(error){console.warn('The system Share Sheet could not be opened.',error);pending.shareSupported=false;toast('The Share Sheet could not open. Tap Save to open the file.','amber');return;}
    try{await sharePromise;restorePDFReturnModal();toast(pending.kind==='html'?'Print-ready report shared.':'PDF shared.');}
    catch(error){
      if(error?.name==='AbortError')return;
      console.warn('The system Share Sheet could not be opened.',error);
      pending.shareSupported=false;
      toast('The Share Sheet could not open. Tap Save to open the file.','amber');
    }
  }
  async function exportBackup(){const snapshot=JSON.stringify(state);state.settings.lastBackup=new Date().toISOString();if(!(await persistMutation(snapshot,'Could not update backup metadata. Your previous records were restored.')))return;const pack={app:'Aruvi',format:'pocketwise-backup',version:2,exportedAt:state.settings.lastBackup,description:'Complete local financial records. Keep this file private.',data:state};downloadBlob(`aruvi-backup-${today()}.json`,new Blob([JSON.stringify(pack,null,2)],{type:'application/json'}));renderSettingsSummary();toast('Full backup exported. Keep it somewhere safe.');}
  function csvCell(v){let s=String(v??'');const formulaPrefix=/^[\u0000-\u0020]*[=+\-@]/.test(s);const plainNumber=/^-?\d+(?:\.\d+)?$/.test(s);if(formulaPrefix&&!plainNumber)s="'"+s;return `"${s.replace(/"/g,'""')}"`;}
  function exportCSV(){const headers=['id','date','type','amount_inr','activity','account','to_account','debt_person','note'];const rows=state.transactions.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(t=>[t.id,t.date,typeLabel(t.type),t.amount,txActivity(t).name,accountById(t.accountId).name,t.toAccountId?accountById(t.toAccountId).name:'',t.debtId?debtById(t.debtId)?.person||'':'',t.note]);const csv=[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n');downloadBlob(`aruvi-transactions-${today()}.csv`,new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));toast('CSV ready for your spreadsheet.');}
  async function importBackup(file){
    if(!file)return;
    const snapshot=JSON.stringify(state);let mutated=false;
    try{
      // Check the Blob size before file.text() allocates a second full copy in memory.
      if(!Number.isFinite(file.size)||file.size<=0||file.size>50*1024*1024)throw new Error('Choose a non-empty backup smaller than 50 MB. No records were changed.');
      const text=await file.text(),raw=JSON.parse(text),imported=raw?.data||raw;
      if(!imported||typeof imported!=='object'||!Array.isArray(imported.transactions)||!Array.isArray(imported.accounts)||!Array.isArray(imported.activities))throw new Error('That file does not look like a Aruvi backup.');
      if(imported.transactions.length>100000||imported.accounts.length>500||imported.activities.length>2000)throw new Error('This backup is larger than Aruvi can safely restore in one step.');
      if(!isSafeBackupState(imported)||imported.transactions.some(t=>!t||typeof t!=='object'||!t.id||!Number.isFinite(Number(t.amount))||Number(t.amount)<0||typeof t.date!=='string'||!t.date))throw new Error('The backup contains malformed or oversized state records. No records were changed.');
      if(!confirm(`Backup contains ${imported.transactions.length} transactions, ${imported.accounts.length} accounts, and ${imported.debts?.length||0} debt records.\n\nOK = Replace this workspace\nCancel = Keep current records`)){
        const merge=confirm('Merge records instead? Existing record identifiers will not be duplicated.');if(!merge)return;
        mutated=true;ensurePersonalWorkspace();
        const mergeItems=key=>{const list=state[key]||[],ids=new Set(list.map(x=>x.id));(imported[key]||[]).forEach(x=>{if(!ids.has(x.id)){list.push(x);ids.add(x.id);}});state[key]=list;};
        ['accounts','activities','transactions','debts','goals','reminders','billSplits','eventPlans'].forEach(mergeItems);
        state.budgets={...state.budgets,...(imported.budgets||{})};state.settings={...state.settings,...(imported.settings||{}),theme:state.settings.theme};state.sample=false;
      }else{
        if(!confirm('Replace all current Aruvi records with this backup? Export the current data first if you need it.'))return;
        mutated=true;state=normalizeStateShape({...initialState(),...imported,settings:{...initialState().settings,...imported.settings},sample:false});
      }
      state=normalizeStateShape(state);await persist();closeModal();renderAll();toast('Backup restored. Records recalculated.');
    }catch(err){if(mutated){state=JSON.parse(snapshot);renderAll();console.error('Aruvi restore failed; previous records restored.',err);}toast(err.message||'Could not read that backup.','error');}
    finally{$('#backup-file-input').value='';}
  }

  function showBackTapGuide(){
    const appURL='webapp://nithan.in/Aruvi/';
    openModal('Quick Add Shortcut',`<div class="modal-body"><p class="muted"><strong>Local-only setup:</strong> the Shortcut copies a URL containing the transaction to the clipboard, then opens Aruvi. Since iOS may strip URL data during launch. Tap <strong>Paste transaction from Shortcut</strong> in Quick Add or Settings; Aruvi saves the copied transaction and opens its receipt automatically.</p><div class="detail-grid"><div class="detail-cell"><small>STEP 1</small><strong>Ask for amount</strong></div><div class="detail-cell"><small>STEP 2</small><strong>Choose income, expense or refund</strong></div><div class="detail-cell"><small>STEP 3</small><strong>Choose category and note</strong></div><div class="detail-cell"><small>STEP 4</small><strong>Copy the encoded transaction URL</strong></div><div class="detail-cell"><small>STEP 5</small><strong>Open Aruvi</strong></div></div><div class="note-box"><small>APP LAUNCH URL</small><p style="word-break:break-all">${escapeHTML(appURL)}</p><button type="button" class="text-button" id="copy-quickadd">Copy app launch URL</button></div><p class="muted small">The Shortcut should URL-encode the category and note, build a URL with <code>quickadd=shortcut&amp;amount=…&amp;type=…&amp;category=…&amp;note=…&amp;reqId=…</code>, copy that full URL to the clipboard, then open the app launch URL above. Generate a fresh request ID for each run. Aruvi validates and previews the transaction before it saves anything.</p><p class="muted small">This handoff does not send your finances to a server. Clipboard access depends on iOS permission and requires you to tap Paste. If the clipboard cannot be read, enter the transaction normally. Assign the Shortcut at Settings → Accessibility → Touch → Back Tap → Double Tap.</p><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button></div></div>`,'IPHONE SHORTCUT');
  }
  function voiceDraft(){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){toast('Voice recognition is not available in this browser. You can use the keyboard microphone instead.','amber');$('#tx-note').focus();return;}const rec=new Speech();rec.lang='en-IN';rec.interimResults=false;rec.maxAlternatives=1;toast('Listening for a short transaction description…');rec.onresult=e=>{const phrase=e.results[0][0].transcript;$('#tx-note').value=phrase;const match=phrase.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)/i);if(match)$('#tx-amount').value=match[1];const txt=phrase.toLowerCase();const choices=[['food',['lunch','dinner','breakfast','food','tea','coffee','snack','canteen']],['transport',['bus','auto','taxi','petrol','fuel','travel']],['shopping',['bought','shop','shopping','clothes','headphones']],['education',['book','college','exam','notes','photocopy','course']],['subscriptions',['subscription','recharge','data pack','streaming']]];for(const [id,words] of choices){if(words.some(w=>txt.includes(w))){const act=state.activities.find(a=>a.id===id);if(act)$('#tx-activity').value=act.id;break;}}toast('Draft created. Check the amount and category before saving.');};rec.onerror=()=>toast('Could not hear that clearly. Please enter the details manually.','amber');rec.start();}

  function bindEvents(){
    if(isAndroid){$('#shortcut-import-setting')?.remove();$('#apple-shortcut-setting')?.remove();$('#apple-image-shortcut-setting')?.remove();$('#backtap-setting')?.remove();}
    const appModal=$('#app-modal');
    appModal.addEventListener('cancel',event=>{
      if(pendingGeneratedPDF){event.preventDefault();restorePDFReturnModal();return;}
      currentEditId=null;
    });
    appModal.addEventListener('click',event=>{
      if(event.target===appModal){if(pendingGeneratedPDF)restorePDFReturnModal();else closeModal();}
    });
    $('#pw-forecast-import')?.addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';await importForecastLearning(file);});
    document.addEventListener('change',async event=>{
      const groceryToggle=event.target?.closest?.('[data-grocery-toggle]');if(groceryToggle){const item=(state.shoppingItems||[]).find(row=>row.id===groceryToggle.dataset.groceryToggle);if(!item)return;const snapshot=JSON.stringify(state);item.done=!!groceryToggle.checked;item.completedAt=item.done?new Date().toISOString():null;if(!(await persistMutation(snapshot,'Could not update the grocery item.'))){renderRecent();return;}renderRecent();return;}
      if(event.target?.matches?.('#tx-payment-method')){event.target.dataset.userChanged='true';return;}
      if(event.target?.matches?.('#tx-account')){
        const method=$('#tx-payment-method');
        if(method&&method.dataset.autoPayment==='true'&&method.dataset.userChanged!=='true')method.value=defaultPaymentMethodForAccount(event.target.value);
      }
    });
    document.addEventListener('click', async event=>{
      const forecastAction=event.target.closest('[data-forecast-action]');if(forecastAction){await handleForecastingAction(forecastAction);return;}
      const openSwipeShell=document.querySelector('.transaction-swipe-shell.is-open');
      const clickedSwipeShell=event.target.closest('.transaction-swipe-shell');
      if(openSwipeShell&&openSwipeShell!==clickedSwipeShell)closeTransactionSwipeActions();
      if(event.target.closest('#edit-profile')){showProfileForm(false);return;}
      if(event.target.closest('#open-privacy')){showPrivacyPage();return;}
      if(event.target.closest('#privacy-done')){if(!state.settings.privacyReviewed){const privacySnapshot=JSON.stringify(state);state.settings.privacyReviewed=true;if(!(await persistMutation(privacySnapshot,'Could not save the privacy acknowledgement.'))){state.settings.privacyReviewed=false;return;}}closeModal();return;}
      if(event.target.closest('#resume-paste')){await pasteShortcutTransaction();return;}
      if(event.target.closest('#paste-bank-sms-quick')){await pasteBankSms();return;}
      if(event.target.closest('#resume-key')){showShortcutKeyPrompt();return;}
      const quickType=event.target.closest('[data-quick-type]');if(quickType&&quickAddDraft){quickAddDraft.type=quickType.dataset.quickType;renderQuickAddStep('activity');return;}
      const quickActivity=event.target.closest('[data-quick-activity]');if(quickActivity&&quickAddDraft){quickAddDraft.activityId=quickActivity.dataset.quickActivity;await saveQuickAdd();return;}
      const quickBack=event.target.closest('[data-quick-back]');if(quickBack&&quickAddDraft){renderQuickAddStep(quickBack.dataset.quickBack);return;}
      
      const storyButton=event.target.closest('[data-story-date]');if(storyButton){openDailyStory(storyButton.dataset.storyDate);return;}
      if(event.target.closest('[data-story-view-activity]')){closeModal();setPage('activity');return;}
      const pageBtn=event.target.closest('[data-page]');if(pageBtn){setPage(pageBtn.dataset.page);return;}
      if(event.target.closest('#finance-salary-edit')){salaryPlanForm();return;}
      if(event.target.closest('#finance-report-cashflow')){openFinancialReport('cashflow');return;}
      if(event.target.closest('#finance-report-balance')){openFinancialReport('balance');return;}
      if(event.target.closest('#finance-report-category')){openFinancialReport('category');return;}
      if(event.target.closest('[data-finance-add-allocation]')){$('#finance-allocation-rows')?.insertAdjacentHTML('beforeend',financeAllocationRowHTML({type:'category',activityId:state.activities.find(a=>!a.archived&&(a.kind==='expense'||a.kind==='both'))?.id,mode:'fixed',value:'',enabled:true}));return;}
      const removeFinanceAllocation=event.target.closest('[data-finance-remove-allocation]');if(removeFinanceAllocation){removeFinanceAllocation.closest('.finance-modal-allocation-row')?.remove();return;}
      const removeCategoryLimit=event.target.closest('[data-remove-category-budget]');if(removeCategoryLimit){await removeCategoryBudget(removeCategoryLimit.dataset.removeCategoryBudget);return;}
      if(event.target.closest('#monthly-budget-reset')){await clearMonthlyBudget();return;}
      if(event.target.closest('#weekly-allowance-reset')){await clearWeeklyAllowance();return;}
      const clearBudgetInput=event.target.closest('[data-clear-budget-input]');if(clearBudgetInput){const form=$('#budget-form'),field=form?.elements.namedItem(`cat-${clearBudgetInput.dataset.clearBudgetInput}`);if(field){field.value='';field.dispatchEvent(new Event('input',{bubbles:true}));}return;}
      const typeBtn=event.target.closest('.type-switch button[data-type]');if(typeBtn&&typeBtn.closest('#transaction-form')){event.preventDefault();currentTxType=typeBtn.dataset.type;const form=$('#transaction-form');form.dataset.type=currentTxType;$$('.type-switch [data-type]',form).forEach(b=>{b.classList.toggle('selected',b===typeBtn);b.setAttribute('aria-pressed',b===typeBtn?'true':'false');});syncGlassSegmentIndicators(typeBtn.closest('.type-switch'));const act=$('#tx-activity');const wanted=currentTxType==='income'?'salary':currentTxType==='refund'?'refunds':'food';act.innerHTML=activityOptions(currentTxType,wanted);const note=$('#tx-form-note');if(note)note.textContent=currentTxType==='transfer'?'Transfers move money between your accounts and are not counted as income or spending.':currentTxType==='refund'?'Refunds reduce recorded spending, rather than inflate income.':'You can add a note or receipt later. Your records stay on this device.';if(currentTxType==='transfer'&&!$('#tx-to-account')){$('#tx-account').closest('.entry-field').insertAdjacentHTML('afterend',`<label class="entry-field" for="tx-to-account" id="tx-to-account-wrap"><span class="entry-field-icon">${icon('transfer')}</span><span class="entry-field-copy"><span class="entry-field-name">Transfer to</span><select id="tx-to-account" name="toAccountId">${accountOptions(state.accounts.find(a=>a.id!==$('#tx-account').value)?.id)}</select></span></label>`);}else if(currentTxType!=='transfer')$('#tx-to-account-wrap')?.remove();return;}
      const debtDir=event.target.closest('[data-debt-direction]');if(debtDir){const direction=debtDir.dataset.debtDirection;$('#debt-direction').value=direction;$$('[data-debt-direction]').forEach(b=>{b.classList.toggle('selected',b===debtDir);b.setAttribute('aria-pressed',b===debtDir?'true':'false')});const label=$('#debt-amount')?.closest('.form-field')?.querySelector('label');if(label)label.textContent=(direction==='lent'?'AMOUNT THEY OWE YOU':'AMOUNT YOU OWE')+' · INR';const note=$('.debt-form .form-note');if(note)note.textContent=direction==='lent'?'This tracks money you expect to get back. It is not counted as spending.':'This tracks money you need to repay. It is not counted as income.';return;}
      const closeBtn=event.target.closest('[data-cancel-modal]');if(closeBtn){if(pendingGeneratedPDF)restorePDFReturnModal();else closeModal();return;}
      if(event.target.closest('[data-close-notifications]')){$('#notifications-modal').close();return;}
      if(event.target.closest('#modal-close')){if(pendingGeneratedPDF)restorePDFReturnModal();else closeModal();return;}
      if(event.target.closest('#share-ready-pdf')){await sharePendingGeneratedPDF();return;}
      if(event.target.closest('#download-ready-pdf')){if(pendingGeneratedPDF)await savePendingGeneratedPDF();else closeModal();return;}
      if(event.target.closest('#mobile-add')){showAddEntryChoices();return;}
      if(event.target.closest('#start-simple-entry')){quickAddStart();return;}
      if(event.target.closest('#start-detailed-entry')){showDetailedEntryTools();return;}
      if(event.target.closest('#start-advanced-entry')){showAdvancedEntryTools();return;}
      if(event.target.closest('#entry-tools-back')){showAddEntryChoices();return;}
      if(event.target.closest('#start-bill-split')){showBillSplitStart();return;}
      if(event.target.closest('#start-event-planner')){showEventPlannerHub();return;}
      if(event.target.closest('#start-payment-import')){pwShowImport();return;}
      if(event.target.closest('#advanced-manual-entry')){transactionForm();return;}
      if(event.target.closest('#advanced-transfer-entry')){transactionForm(null,'transfer');return;}
      if(event.target.closest('#advanced-debt-entry')){debtForm();return;}
      if(event.target.closest('#recent-grocery-list-toggle')){shoppingListOpen=!shoppingListOpen;renderRecent();return;}
      if(event.target.closest('#grocery-add-row')){const form=$('#grocery-item-form'),rows=$('#grocery-entry-rows');if(form&&rows){rows.insertAdjacentHTML('beforeend',groceryEntryRow());syncGroceryRowButtons(form);form.querySelector('.grocery-entry-row:last-child [name="itemName"]')?.focus();}return;}
      const removeGroceryRow=event.target.closest('[data-grocery-row-remove]');if(removeGroceryRow){const form=removeGroceryRow.closest('form'),rows=form?.querySelectorAll('.grocery-entry-row');if(form&&rows?.length>1){removeGroceryRow.closest('.grocery-entry-row').remove();syncGroceryRowButtons(form);}return;}
      if(event.target.closest('#advanced-grocery-entry')||event.target.closest('#recent-add-grocery')||event.target.closest('#recent-list-add-empty')||event.target.closest('#recent-add-grocery-empty')){groceryItemForm();return;}
      if(event.target.closest('#paste-shortcut-quick')||event.target.closest('#paste-shortcut-settings')){await pasteShortcutTransaction();return;}if(event.target.closest('#enter-shortcut-key')){showShortcutKeyPrompt();return;}if(event.target.closest('#top-add')){showAddEntryChoices();return;}if(event.target.closest('#activity-add')||event.target.closest('[data-action="add"]')){transactionForm();return;}
      if(event.target.closest('#event-plan-new')){showEventPlannerStart();return;}
      const openBillSplit=event.target.closest('[data-bill-open]');if(openBillSplit){const split=state.billSplits.find(item=>item.id===openBillSplit.dataset.billOpen);if(split)renderBillSplitEditor(split);return;}
      const openEventPlan=event.target.closest('[data-event-open]');if(openEventPlan){const plan=state.eventPlans.find(item=>item.id===openEventPlan.dataset.eventOpen);if(plan)showEventPlannerStart(plan);return;}
      if(event.target.closest('#event-add-person')){addEventParticipant();return;}
      if(event.target.closest('#event-add-group')){addEventGroup();return;}
      if(event.target.closest('#event-add-category')){addEventCategory();return;}
      const removeEventPerson=event.target.closest('[data-event-remove-person]');if(removeEventPerson){const draft=captureEventPlannerForm();if(draft.participants.length<=1){toast('An event needs at least one participant.','amber');return;}draft.participants=draft.participants.filter(person=>person.id!==removeEventPerson.dataset.eventRemovePerson);draft.groups.forEach(group=>{group.memberIds=group.memberIds.filter(id=>id!==removeEventPerson.dataset.eventRemovePerson);});renderEventPlannerEditor(draft);return;}
      const removeEventGroup=event.target.closest('[data-event-remove-group]');if(removeEventGroup){const draft=captureEventPlannerForm();if(draft.groups.length<=1){toast('Keep at least one group.','amber');return;}const removed=removeEventGroup.dataset.eventRemoveGroup;draft.groups=draft.groups.filter(group=>group.id!==removed);const fallback=draft.groups[0].id;draft.participants.forEach(person=>{if(person.groupId===removed)person.groupId=fallback;});draft.groups.forEach(group=>{group.memberIds=draft.participants.filter(person=>person.groupId===group.id).map(person=>person.id);});renderEventPlannerEditor(draft);return;}
      const removeEventCategory=event.target.closest('[data-event-remove-category]');if(removeEventCategory){const draft=captureEventPlannerForm();if(draft.categories.length<=1){toast('Keep at least one cost category.','amber');return;}draft.categories=draft.categories.filter(category=>category.id!==removeEventCategory.dataset.eventRemoveCategory);renderEventPlannerEditor(draft);return;}
      if(event.target.closest('#bill-split-download')){await downloadBillSplitFromForm();return;}
      if(event.target.closest('#event-plan-download')){await downloadEventPlanFromForm();return;}
      const addType=event.target.closest('[data-add-type]');if(addType){transactionForm(null,addType.dataset.addType);return;}
      const action=event.target.closest('[data-action]')?.dataset.action;if(action){if(action==='budget')budgetForm();else if(action==='debts')showDebts();else if(action==='new-debt')debtForm();else if(action==='accounts')accountsManager();return;}
      if(event.target.closest('#theme-toggle')){const snapshot=JSON.stringify(state);state.settings.theme=state.settings.theme==='dark'?'light':state.settings.theme==='gradient'?'light':'dark';if(!(await persistMutation(snapshot,'Could not change the theme. Your previous settings were restored.'))){applyTheme();return;}applyTheme();scheduleCharts();return;}
      const gradientPresetBtn=event.target.closest('button[data-gradient-preset]');if(gradientPresetBtn){const preset=gradientPresetBtn.dataset.gradientPreset;if(!['coral-wave','green-screen','retro-magic','on-fire'].includes(preset))return;const snapshot=JSON.stringify(state);state.settings.theme='gradient';state.settings.gradientPreset=preset;if(!(await persistMutation(snapshot,'Could not save the gradient appearance. Your previous settings were restored.'))){applyTheme();return;}applyTheme();scheduleCharts();return;}
      const themeBtn=event.target.closest('button[data-theme]');if(themeBtn){const snapshot=JSON.stringify(state);state.settings.theme=themeBtn.dataset.theme;if(!(await persistMutation(snapshot,'Could not change the theme. Your previous settings were restored.'))){applyTheme();return;}applyTheme();scheduleCharts();return;}
      if(event.target.closest('#hide-balances')){if(state.settings.hideBalances){const snapshot=JSON.stringify(state);state.settings.hideBalances=false;hiddenAmounts=false;if(!(await persistMutation(snapshot,'Could not save the balance visibility setting.'))){applyHiddenAmounts();return;}renderSettingsSummary();}else{hiddenAmounts=!hiddenAmounts;}applyHiddenAmounts();return;}
      if(event.target.closest('#open-notifications')||event.target.closest('#view-alerts')){openNotifications();return;}
      if(event.target.closest('#clear-sample')){if(confirm('Clear all preview records, sample balances, goals and reminders so you can start with a clean workspace?')){const snapshot=JSON.stringify(state);state.transactions=[];state.debts=[];state.goals=[];state.reminders=[];state.pendingRecurringEntries=[];state.billSplits=[];state.eventPlans=[];state.accounts.forEach(a=>a.openingBalance=0);state.budgets={total:0,categories:{},note:''};state.sample=false;state.settings.notifications=[];state.settings.sentAlerts=[];state.settings.seenAlerts=[];if(!(await persistMutation(snapshot,'Could not clear preview records. Your previous records were restored.')))return;renderAll();toast('Clean workspace ready.');}return;}
      const debtRepay=event.target.closest('[data-debt-repay]');if(debtRepay){const d=debtById(debtRepay.dataset.debtRepay);if(d&&debtRemaining(d)>0)repaymentForm(d);return;}
      const debtDetails=event.target.closest('[data-debt-detail]');if(debtDetails){const d=debtById(debtDetails.dataset.debtDetail);if(d)debtDetail(d);return;}
      const swipeDelete=event.target.closest('[data-tx-swipe-delete]');if(swipeDelete){const txId=swipeDelete.dataset.txSwipeDelete;closeTransactionSwipeActions();await confirmDeleteTransaction(txId);return;}
      const txOpen=event.target.closest('[data-tx-open]');if(txOpen){const shell=txOpen.closest('.transaction-swipe-shell');if(shell?.classList.contains('is-open')){closeTransactionSwipeActions();return;}const tx=state.transactions.find(t=>t.id===txOpen.dataset.txOpen);if(tx)showTransactionDetail(tx);return;}
      const txReceipt=event.target.closest('[data-tx-receipt]');if(txReceipt){const tx=state.transactions.find(t=>t.id===txReceipt.dataset.txReceipt);if(tx)showTransactionReceipt(tx);return;}
      const shareReceipt=event.target.closest('[data-share-receipt]');if(shareReceipt){await shareTransactionReceipt(shareReceipt.dataset.shareReceipt);return;}
      const downloadReceipt=event.target.closest('[data-download-receipt]');if(downloadReceipt){downloadTransactionReceipt(downloadReceipt.dataset.downloadReceipt);return;}
      const printReceipt=event.target.closest('[data-print-receipt]');if(printReceipt){printTransactionReceipt(printReceipt.dataset.printReceipt);return;}
      const txEdit=event.target.closest('[data-tx-edit]');if(txEdit){const tx=state.transactions.find(t=>t.id===txEdit.dataset.txEdit);if(tx)transactionForm(tx,tx.type);return;}
      const undo=event.target.closest('[data-undo-tx]');if(undo){
        const entry=window.__pocketwiseUndoTx;
        if(entry&&((entry.tx||entry).id===undo.dataset.undoTx)&&!undo.disabled){
          undo.disabled=true;const snapshot=JSON.stringify(state);const items=Array.isArray(entry.transactions)?entry.transactions:[entry.tx||entry];
          try{
            if(entry.action==='remove'){
              const ids=new Set(items.map(item=>item.id));state.transactions=state.transactions.filter(item=>!ids.has(item.id));
            }else{
              const existingIds=new Set(state.transactions.map(item=>item.id));items.forEach(item=>{if(!existingIds.has(item.id)){state.transactions.push({...item});existingIds.add(item.id);}});
              if(entry.debt&&!state.debts.some(d=>d.id===entry.debt.id))state.debts.push({...entry.debt});
            }
            await persist();renderAll();toast(entry.action==='remove'?'Repeated transaction removed.':'Transaction restored.');window.__pocketwiseUndoTx=null;undo.closest('.toast')?.remove();
          }catch(error){state=JSON.parse(snapshot);renderAll();console.error('Aruvi undo failed; previous records restored.',error);toast(error.message||'Undo could not be saved. Your records were restored.','error');undo.disabled=false;}
        }
        return;
      }
      const txDelete=event.target.closest('[data-tx-delete]');if(txDelete){confirmDeleteTransaction(txDelete.dataset.txDelete);return;}
      const repeatChip=event.target.closest('[data-repeat-activity]');if(repeatChip){await repeatActivityTransaction(repeatChip.dataset.repeatActivity);return;}
      const activityQuick=event.target.closest('[data-activity-quick]');if(activityQuick){const chosen=activityById(activityQuick.dataset.activityQuick);transactionForm(null,chosen.kind==='income'?'income':chosen.kind==='refund'?'refund':'expense');$('#tx-activity').value=activityQuick.dataset.activityQuick;return;}
      if(event.target.closest('#manage-activities')||event.target.closest('#settings-activities')){activitiesManager();return;}
      const actEdit=event.target.closest('[data-activity-edit]');if(actEdit){editActivity(actEdit.dataset.activityEdit);return;}
      const actRemove=event.target.closest('[data-activity-remove]');if(actRemove){removeActivity(actRemove.dataset.activityRemove);return;}
      const actRestore=event.target.closest('[data-activity-restore]');if(actRestore){await restoreActivity(actRestore.dataset.activityRestore);return;}
      if(event.target.closest('#forecast-prev')){forecastMonthOffset=Math.max(-24,forecastMonthOffset-1);renderPlanningTools();return;}
      if(event.target.closest('#forecast-next')){forecastMonthOffset=Math.min(24,forecastMonthOffset+1);renderPlanningTools();return;}
      const forecastDate=event.target.closest('[data-forecast-date]');if(forecastDate){const d=forecastDate.dataset.forecastDate;const entries=projectedEvents(d,d);$('#forecast-agenda-title').textContent=entries.length?`${niceDate(d)} · ${entries.length} planned ${entries.length===1?'event':'events'}`:`${niceDate(d)} · no planned events`;$('#forecast-events').innerHTML=entries.length?entries.map(e=>`<div class="forecast-event"><span class="forecast-event-date"><strong>${dateFrom(e.date).getDate()}</strong><small>${dateFrom(e.date).toLocaleDateString(undefined,{month:'short'})}</small></span><span class="forecast-event-icon ${e.impact>0?'inflow':'outflow'}">${icon(e.impact>0?'income':e.kind==='subscription'?'phone':e.kind==='debt'?'people':'receipt')}</span><span class="forecast-event-copy"><strong>${escapeHTML(e.name)}</strong><small>${escapeHTML(e.kind==='income'?'Expected income':e.kind==='subscription'?'Subscription':e.kind==='debt'?'Debt due':e.kind==='receivable'?'Expected repayment':'Bill / payment')}</small></span><strong class="forecast-event-amount ${e.impact>0?'positive-text':'negative-text'}">${e.impact>0?'+':'−'}${fmtHidden(e.amount)}</strong></div>`).join(''):'<div class="empty-inline">No planned events on this date.</div>';return;}
      if(event.target.closest('#weekly-allowance-edit')||event.target.closest('#weekly-allowance-empty-edit')){weeklyAllowanceForm();return;}
      if(event.target.closest('#subscriptions-manage')||event.target.closest('#subscriptions-manage-inline')){remindersManager();return;}
      if(event.target.closest('#smart-rules-create-first')){smartRuleCreateForm();return;}
      if(event.target.closest('#smart-rules-manage')||event.target.closest('#smart-rules-manage-inline')){smartRulesManager();return;}
      const merchantRuleRemove=event.target.closest('[data-merchant-rule-remove]');if(merchantRuleRemove){if(confirm('Remove this merchant category rule? Future imports will use built-in categorisation or other active rules.')){const snapshot=JSON.stringify(state);state.settings.merchantRules=(state.settings.merchantRules||[]).filter(r=>r.id!==merchantRuleRemove.dataset.merchantRuleRemove);if(!(await persistMutation(snapshot,'Could not remove this merchant rule. Your previous settings were restored.')))return;merchantRulesManager();renderAll();toast('Merchant rule removed.');}return;}
      const ruleRemove=event.target.closest('[data-smart-rule-remove]');if(ruleRemove){if(confirm('Remove this smart rule? Future transactions will no longer match it.')){const snapshot=JSON.stringify(state);state.settings.smartRules=(state.settings.smartRules||[]).filter(r=>r.id!==ruleRemove.dataset.smartRuleRemove);if(!(await persistMutation(snapshot,'Could not remove this smart rule. Your previous settings were restored.')))return;renderPlanningTools();smartRulesManager();toast('Smart rule removed.');}return;}
      if(event.target.closest('#debt-plan-edit')||event.target.closest('#debt-plan-edit-inline')){debtPlanForm();return;}
      if(event.target.closest('#monthly-review-export')||event.target.closest('#monthly-review-export-inline')){exportMonthlyReview();return;}
      if(event.target.closest('#settings-accounts')){accountsManager();return;}
      if(event.target.closest('#settings-merchant-rules')){merchantRulesManager();return;}
      if(event.target.closest('#activity-filter-options')){activityFiltersManager();return;}
      if(event.target.closest('#activity-filter-clear')){activityAdvancedFilters={accountId:'',categoryId:'',tag:'',min:'',max:''};closeModal();renderActivity();return;}
      if(event.target.closest('#account-open-create')){accountCreateForm();return;}
      if(event.target.closest('#account-back-to-list')){accountsManager();return;}
      if(event.target.closest('#reminder-open-create')){reminderCreateForm();return;}
      if(event.target.closest('#reminder-back-to-list')){remindersManager();return;}
      if(event.target.closest('#activity-open-create')){activityCreateForm();return;}
      if(event.target.closest('#activity-back-to-list')){activitiesManager();return;}
      if(event.target.closest('#smart-rule-open-create')){smartRuleCreateForm();return;}
      if(event.target.closest('#smart-rule-back-to-list')){smartRulesManager();return;}
      if(event.target.closest('#merchant-rule-open-create')){merchantRuleCreateForm();return;}
      if(event.target.closest('#merchant-rule-back-to-list')){merchantRulesManager();return;}
      const accountEditBtn=event.target.closest('[data-account-edit]');if(accountEditBtn){editAccount(accountEditBtn.dataset.accountEdit);return;}
      const accountRemoveBtn=event.target.closest('[data-account-remove]');if(accountRemoveBtn){removeAccount(accountRemoveBtn.dataset.accountRemove);return;}
      const recurringConfirm=event.target.closest('[data-recurring-confirm]');if(recurringConfirm){const pendingId=recurringConfirm.dataset.recurringConfirm;if(reminderActionInFlight.has(pendingId))return;reminderActionInFlight.add(pendingId);try{await confirmRecurringOccurrence(pendingId);}finally{reminderActionInFlight.delete(pendingId);}return;}
      const reminderPaid=event.target.closest('[data-reminder-paid]');if(reminderPaid){const reminderId=reminderPaid.dataset.reminderPaid;if(reminderActionInFlight.has(reminderId))return;reminderActionInFlight.add(reminderId);try{const r=state.reminders.find(x=>x.id===reminderId);if(r){const snapshot=JSON.stringify(state),reminderKind=inferredReminderKind(r),reminderType=reminderKind==='income'?'income':'expense',preferredName=reminderType==='income'?'salary':reminderKind==='subscription'?'subscriptions':reminderKind==='investment'?'savings-investing':'bills-rent';const tx=addTransaction({type:reminderType,amount:r.amount,activityId:state.activities.find(a=>a.id===preferredName&&!a.archived)?.id||state.activities.find(a=>(a.name.toLowerCase().includes(reminderType==='income'?'salary':reminderKind==='subscription'?'subscription':'bill'))&&!a.archived)?.id||'other',accountId:r.accountId||state.accounts[0]?.id,date:today(),note:r.name,paymentMethod:'Bill'});if(tx){if(r.repeat&&r.repeat!=='once'){let next=nextRecurringDate(r.date,r.repeat,Number(r.anchorDay)||dateFrom(r.date).getDate()),guard=0;const anchorDay=Number(r.anchorDay)||dateFrom(r.date).getDate();r.anchorDay=anchorDay;while(next&&next<=today()&&guard++<1200)next=nextRecurringDate(next,r.repeat,anchorDay);r.date=next||r.date;r.active=true;}else r.active=false;if(!(await persistMutation(snapshot,'Could not record this payment. Your reminder and transaction list were restored.')))return;transactionHaptic();remindersManager();renderAll();toast(reminderType==='income'?'Expected income recorded.':reminderKind==='investment'?'SIP recorded as an investment.':`${reminderKind==='subscription'?'Subscription payment':'Bill'} recorded as an expense.`);}}}finally{reminderActionInFlight.delete(reminderId);}return;}
      const reminderToggle=event.target.closest('[data-reminder-toggle]');if(reminderToggle){const reminderId=reminderToggle.dataset.reminderToggle;if(reminderActionInFlight.has(reminderId))return;reminderActionInFlight.add(reminderId);try{const r=state.reminders.find(x=>x.id===reminderId);if(!r)return;const snapshot=JSON.stringify(state);r.active=!r.active;if(!(await persistMutation(snapshot,'Could not update this reminder. Your previous records were restored.')))return;await syncBackgroundReminders();remindersManager();renderAll();}finally{reminderActionInFlight.delete(reminderId);}return;}
      const reminderRemove=event.target.closest('[data-reminder-remove]');if(reminderRemove){const reminderId=reminderRemove.dataset.reminderRemove;if(reminderActionInFlight.has(reminderId))return;if(confirm('Delete this reminder?')){reminderActionInFlight.add(reminderId);try{const snapshot=JSON.stringify(state);state.reminders=state.reminders.filter(r=>r.id!==reminderId);if(!(await persistMutation(snapshot,'Could not delete this reminder. Your previous records were restored.')))return;await syncBackgroundReminders();remindersManager();renderAll();}finally{reminderActionInFlight.delete(reminderId);}}return;}
      if(event.target.closest('#manage-reminders')){remindersManager();return;}
      if(event.target.closest('#goals-jump')){const target=$('.goal-card');if(target){target.scrollIntoView({behavior:'auto',block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}return;}
      if(event.target.closest('#add-goal')||event.target.closest('#goal-empty-add')){goalForm();return;}
      const goalEditBtn=event.target.closest('[data-goal-edit]');if(goalEditBtn){const g=state.goals.find(x=>x.id===goalEditBtn.dataset.goalEdit);if(g)goalForm(g);return;}
      const groceryRemove=event.target.closest('[data-grocery-remove]');if(groceryRemove){const snapshot=JSON.stringify(state);state.shoppingItems=(state.shoppingItems||[]).filter(item=>item.id!==groceryRemove.dataset.groceryRemove);if(await persistMutation(snapshot,'Could not remove the grocery item.')){renderAll();toast('Grocery item removed.');}return;}
      const goalAddBtn=event.target.closest('[data-goal-add]');if(goalAddBtn){goalContributionForm(goalAddBtn.dataset.goalAdd);return;}
      const goalHistoryBtn=event.target.closest('[data-goal-history]');if(goalHistoryBtn){goalHistory(goalHistoryBtn.dataset.goalHistory);return;}
      if(event.target.closest('#export-backup')||event.target.closest('#insights-backup')||event.target.closest('#archive-export')){await exportBackup();return;}
      if(event.target.closest('#export-recovery-snapshot')){exportRecoverySnapshot();return;}
      const yearView=event.target.closest('[data-year-view]');if(yearView){currentYearFilter=yearView.dataset.yearView;$('#activity-period').value='all';$('#activity-search').value='';currentFilter='all';setPage('activity');renderActivity();return;}
      if(event.target.closest('#export-csv')||event.target.closest('#export-settings-csv')){exportCSV();return;}
      if(event.target.closest('#import-backup')){$('#backup-file-input').click();return;}
      if(event.target.closest('#persistent-storage')){if(navigator.storage?.persist){const granted=await navigator.storage.persist();toast(granted?'Persistent storage granted by browser.':'Browser did not grant persistent storage. Keep backups.',granted?'success':'amber');}else toast('Persistent storage request is not supported here. Export backups regularly.','amber');return;}
      if(event.target.closest('#backtap-guide')){showBackTapGuide();return;}
      if(event.target.closest('#install-guide')){showInstallGuide();return;}
      if(event.target.closest('#copy-quickadd')){const url='webapp://nithan.in/Aruvi/';try{await navigator.clipboard.writeText(url);toast('App launch URL copied.');}catch{toast(url,'amber');}return;}
      if(event.target.closest('#enable-notifications')){if(!('Notification'in window)){toast('System notifications are not supported in this browser.','amber');return;}const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();let message=permission==='granted'?'System notification permission enabled. Background delivery needs a configured push service.':'Permission was not granted.';if(permission==='granted'&&window.PocketWisePush?.isConfigured()){if(!confirm('Enable background bill reminders? Aruvi will send reminder titles and due dates to your configured push server so it can notify this device while the app is closed. Amounts, notes and transaction history are not sent.')){renderSettingsSummary();return;}try{const pushResult=await window.PocketWisePush.subscribe();if(pushResult.ok){await window.PocketWisePush.syncReminders(state.reminders||[]);message='Background bill reminders are enabled on this device.';}else message=pushResult.reason==='permission-denied'?'Notification permission was not granted.':'Push is unavailable on this device.';}catch(error){console.error('Push subscription failed.',error);message='Could not connect this device to the push service. Check the server settings.';}}if(permission==='granted'&&'serviceWorker'in navigator){try{await navigator.serviceWorker.ready;}catch(_){}}renderSettingsSummary();toast(message,permission==='granted'?'success':'amber');return;}
      if(event.target.closest('#reset-data')){if(!confirm('Clear all transactions, debts, goals, accounts, budgets, activities, reminders, bill splits and event plans stored in this app? This cannot be undone.'))return;if(!confirm('Last check: export a backup first if you want to keep any records. Continue clearing?'))return;const snapshot=JSON.stringify(state);state=initialState();state.sample=false;state.transactions=[];state.debts=[];state.goals=[];state.reminders=[];state.pendingRecurringEntries=[];state.billSplits=[];state.eventPlans=[];state.accounts=state.accounts.map(a=>({...a,openingBalance:0}));state.budgets={total:0,categories:{}};if(!(await persistMutation(snapshot,'Could not clear this workspace. Your previous records were restored.')))return;applyTheme();renderAll();toast('Workspace cleared.');return;}
      if(event.target.closest('[data-reset-filters]')){$('#activity-search').value='';$('#activity-period').value='all';currentFilter='all';activityAdvancedFilters={accountId:'',categoryId:'',tag:'',min:'',max:''};renderActivity();return;}
      const heat=event.target.closest('[data-heat-date]');if(heat){setPage('activity');$('#activity-period').value='all';$('#activity-search').value=heat.dataset.heatDate;renderActivity();return;}
      if(event.target.closest('#mix-view-toggle')){mixView=mixView==='doughnut'?'pie':mixView==='pie'?'bar':'doughnut';const btn=$('#mix-view-toggle');btn.title=mixView==='doughnut'?'Switch to pie chart':mixView==='pie'?'Switch to category bars':'Switch to doughnut chart';scheduleCharts();return;}
      if(event.target.closest('#goal-empty-add')){goalForm();return;}
    });
    document.addEventListener('submit', async e=>{
      const form=e.target;if(!(form instanceof HTMLFormElement))return;e.preventDefault();
      if(form.id==='bill-split-start-form'){
        try{const fd=new FormData(form),totalMinor=safeMinorInput(fd.get('total')),count=Number(fd.get('count'));if(!Number.isSafeInteger(totalMinor)||totalMinor<=0)throw new Error('Enter a total amount greater than ₹0.');if(!Number.isInteger(count)||count<2||count>100)throw new Error('Choose between 2 and 100 people.');const people=Array.from({length:count},(_,index)=>makePerson(index));const calculated=sharedCosts().calculateBill(totalMinor,people);renderBillSplitEditor({id:null,name:String(fd.get('name')||'').trim()||'Shared bill',date:today(),totalMinor,people:calculated.shares,createdAt:null});}catch(error){toast(error.message||'Check the bill details.','error');}return;
      }
      if(form.id==='bill-split-form'){if(form.dataset.submitting==='true')return;form.dataset.submitting='true';try{await saveBillSplitFromForm();}finally{delete form.dataset.submitting;}return;}
      if(form.id==='event-plan-start-form'){
        try{createEventPlanFromStart(form);}catch(error){toast(error.message||'Check the event details.','error');}return;
      }
      if(form.id==='event-plan-form'){if(form.dataset.submitting==='true')return;form.dataset.submitting='true';try{await saveEventPlanFromForm();}finally{delete form.dataset.submitting;}return;}
      if(form.dataset.submitting==='true')return;
      form.dataset.submitting='true';
      const submitButtons=[...form.querySelectorAll('button[type="submit"],input[type="submit"]')];
      submitButtons.forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true');});
      try {
        if(form.id==='profile-form'){const fd=new FormData(form),name=String(fd.get('profileName')||'').trim(),color=String(fd.get('profileColor')||'mint');if(!name){$('#profile-name-input')?.focus();toast('Enter a display name first.','error');return;}const snapshot=JSON.stringify(state);state.settings.profileName=name.slice(0,48);state.settings.profileColor=profileColors[color]?color:'mint';state.settings.profileComplete=true;if(!(await persistMutation(snapshot,'Could not save your profile. Your previous settings were restored.')))return;renderProfile();closeModal();if(!state.settings.privacyReviewed){showPrivacyPage();}else toast('Profile updated.');return;}else if(form.id==='shortcut-key-form'){const raw=String(new FormData(form).get('payload')||'').trim();try{await importShortcutText(raw);}catch(error){const field=$('#shortcut-key-value');toast(error.message||'Could not read that transaction.','error');field?.focus();}return;}else if(form.id==='quick-flow-amount'){const fd=new FormData(form),amount=parseAmount(fd.get('amount'));if(!Number.isFinite(amount)||amount<=0){$('#quick-flow-error').hidden=false;$('#quick-flow-error').textContent='Enter an amount greater than ₹0.';$('#quick-flow-value').focus();return;}quickAddDraft.amount=String(amount);renderQuickAddStep('type');}else if(form.id==='transaction-form'){form.dataset.saveMode=e.submitter?.value==='another'?'another':'save';await saveTransactionForm(form);}else if(form.id==='budget-form')await saveBudget(form);else if(form.id==='debt-form')await saveDebt(form);else if(form.id==='repayment-form')await saveRepayment(form);else if(form.id==='account-form')await addAccountForm(form);else if(form.id==='account-edit-form')await saveAccountEdit(form);else if(form.id==='activity-form')await addActivityForm(form);else if(form.id==='activity-edit-form')await saveActivityEdit(form);else if(form.id==='goal-form')await saveGoal(form);else if(form.id==='goal-contribution-form')await saveGoalContribution(form);else if(form.id==='grocery-item-form')await saveGroceryItem(form);else if(form.id==='reminder-form')await saveReminder(form);else if(form.id==='weekly-allowance-form')await saveWeeklyAllowance(form);else if(form.id==='smart-rule-form')await saveSmartRule(form);else if(form.id==='merchant-rule-form')await saveMerchantRule(form);else if(form.id==='activity-advanced-filter-form')await saveActivityFilters(form);else if(form.id==='debt-plan-form')await saveDebtPlan(form);else if(form.id==='finance-salary-plan-form')await saveSalaryPlan(form);
      } catch(error) { console.error('Aruvi form action failed.',error); toast(error.message||'That change could not be saved. Please try again.','error'); }
      finally { if(form.isConnected){delete form.dataset.submitting;submitButtons.forEach(button=>{if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');}});} }
    });
    document.addEventListener('keydown',e=>{const tx=e.target.closest?.('[data-tx-open]');if(e.key==='Escape'&&document.querySelector('.transaction-swipe-shell.is-open')){closeTransactionSwipeActions();return;}if(tx&&e.key==='ArrowLeft'){const shell=tx.closest('.transaction-swipe-shell');if(shell){e.preventDefault();closeTransactionSwipeActions(shell);shell.classList.add('is-open');tx.setAttribute('aria-expanded','true');shell.querySelector('[data-tx-swipe-delete]')?.focus({preventScroll:true});}return;}if(tx&&(e.key==='Enter'||e.key===' ')){e.preventDefault();tx.click();}});
    $('#activity-search').addEventListener('input',renderActivity);$('#activity-period').addEventListener('change',()=>{currentYearFilter=null;renderActivity()});$('#insights-period').addEventListener('change',()=>{renderInsights();scheduleCharts()});
    const financeAnchorInput=$('#finance-period-anchor');if(financeAnchorInput)financeAnchorInput.value=financeAnchor;
    $('#finance-period-type')?.addEventListener('change',()=>{const type=$('#finance-period-type').value;if(type==='custom'){if(!$('#finance-custom-start').value)$('#finance-custom-start').value=monthStart();if(!$('#finance-custom-end').value)$('#finance-custom-end').value=today();}renderFinanceAnalytics();scheduleCharts();});
    $('#finance-period-anchor')?.addEventListener('change',e=>{financeAnchor=e.target.value||today();renderFinanceAnalytics();scheduleCharts();});
    ['finance-custom-start','finance-custom-end'].forEach(id=>$('#'+id)?.addEventListener('change',()=>{renderFinanceAnalytics();scheduleCharts();}));
    $('#finance-period-prev')?.addEventListener('click',()=>{const type=$('#finance-period-type').value,range=financeSelectedRange();if(!range)return;if(type==='custom'){const days=Math.max(1,Math.round((dateFrom(range.end)-dateFrom(range.start))/86400000)+1);$('#finance-custom-start').value=finance.addDays(range.start,-days);$('#finance-custom-end').value=finance.addDays(range.end,-days);}else if(type==='week')financeAnchor=finance.addDays(financeAnchor,-7);else if(type==='year'){const d=dateFrom(financeAnchor);d.setFullYear(d.getFullYear()-1);financeAnchor=localDate(d);}else{const d=dateFrom(financeAnchor);d.setDate(1);d.setMonth(d.getMonth()-1);financeAnchor=localDate(d);}$('#finance-period-anchor').value=financeAnchor;renderFinanceAnalytics();scheduleCharts();});
    $('#finance-period-next')?.addEventListener('click',()=>{const type=$('#finance-period-type').value,range=financeSelectedRange();if(!range)return;if(type==='custom'){const days=Math.max(1,Math.round((dateFrom(range.end)-dateFrom(range.start))/86400000)+1);const start=finance.addDays(range.start,days),end=finance.addDays(range.end,days);if(start>today())return;$('#finance-custom-start').value=start;$('#finance-custom-end').value=end>today()?today():end;}else{let nextAnchor;if(type==='week')nextAnchor=finance.addDays(range.start,7);else if(type==='year')nextAnchor=`${Number(range.start.slice(0,4))+1}-01-01`;else{const d=dateFrom(range.start);d.setDate(1);d.setMonth(d.getMonth()+1);nextAnchor=localDate(d);}if(nextAnchor>today())return;financeAnchor=nextAnchor;$('#finance-period-anchor').value=financeAnchor;}renderFinanceAnalytics();scheduleCharts();});$('#home-chart-mode').addEventListener('change',scheduleCharts);$('#trend-type').addEventListener('change',scheduleCharts);$('#ranking-mode').addEventListener('change',()=>renderRankings(chartPeriod()));
    $('#activity-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;currentFilter=b.dataset.filter;renderActivity();syncGlassSegmentIndicators($('#activity-filters'));});
    window.addEventListener('resize',()=>{syncGlassSegmentIndicators();syncSmartNavIndicator(false);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncShakeMotion();updateDateHeader();renderDailyStory();syncSmartNavIndicator(false);void processDueRecurringEntries();void processForecastTeacher((state.transactions||[]).map(tx=>({...tx})),state.forecasting?.labels||{},today());}else detachShakeMotion();});window.addEventListener('pageshow',()=>{syncShakeMotion();void processDueRecurringEntries();void processForecastTeacher((state.transactions||[]).map(tx=>({...tx})),state.forecasting?.labels||{},today());});
    $('#hide-setting').addEventListener('change',async e=>{const snapshot=JSON.stringify(state);state.settings.hideBalances=e.target.checked;if(!(await persistMutation(snapshot,'Could not save the balance visibility setting.'))){e.target.checked=!!state.settings.hideBalances;applyHiddenAmounts();return;}applyHiddenAmounts();renderAll();});
    $('#home-recent-setting')?.addEventListener('change',async e=>{const snapshot=JSON.stringify(state);state.settings.homeRecentEnabled=!!e.target.checked;if(!(await persistMutation(snapshot,'Could not save the Home recent activity setting.'))){e.target.checked=state.settings.homeRecentEnabled!==false;return;}renderRecent();toast(e.target.checked?'Recent activity shown on Home.':'Recent activity hidden on Home.');});
    $('#liquid-glass-setting').addEventListener('change',async e=>{if(state.settings.theme==='gradient'){applyTheme();return;}const snapshot=JSON.stringify(state);state.settings.liquidGlass=!!e.target.checked;if(!(await persistMutation(snapshot,'Could not save the appearance setting.'))){e.target.checked=!!state.settings.liquidGlass;applyTheme();return;}applyTheme();scheduleCharts();toast(state.settings.liquidGlass?'Liquid Glass enabled.':'Liquid Glass disabled.');});
    $('#smart-ui-setting').addEventListener('change',async e=>{const snapshot=JSON.stringify(state);state.settings.smartUI=!!e.target.checked;if(!(await persistMutation(snapshot,'Could not save Smart UI. Your previous settings were restored.'))){e.target.checked=!!state.settings.smartUI;applyTheme();return;}applyTheme();syncSmartNavIndicator(false);toast(state.settings.smartUI?'Smart UI enabled. Your navigation capsule follows the selected section.':'Smart UI disabled. Your classic navigation is restored.');});
    $('#daily-story-setting').addEventListener('change',async e=>{const snapshot=JSON.stringify(state);state.settings.dailyStory=!!e.target.checked;state.settings.dailyStoryPreferenceSet=true;if(!(await persistMutation(snapshot,'Could not save the daily story setting. Your previous settings were restored.'))){e.target.checked=!!state.settings.dailyStory;renderDailyStory();return;}renderDailyStory();toast(state.settings.dailyStory?'Daily money story enabled.':'Daily money story hidden.');});
    ['alert-threshold','notify-budget','notify-positive','notify-bills','notify-debts','notify-weekly','quiet-start','quiet-end'].forEach(id=>{const el=$(`#${id}`);el.addEventListener('change',async()=>{const map={'alert-threshold':'alertThreshold','notify-budget':'notifyBudget','notify-positive':'notifyPositive','notify-bills':'notifyBills','notify-debts':'notifyDebts','notify-weekly':'notifyWeekly','quiet-start':'quietStart','quiet-end':'quietEnd'},snapshot=JSON.stringify(state);state.settings[map[id]]=id==='alert-threshold'?Number(el.value):el.type==='checkbox'?el.checked:el.value;if(!(await persistMutation(snapshot,'Could not save this notification setting. Your previous settings were restored.'))){renderSettingsSummary();return;}renderSettingsSummary();});});
    // Start motion permission from the toggle's direct user gesture on iOS.
    $('#shake-quick-entry-toggle')?.addEventListener('change',async event=>{
      const control=event.target,enabled=!!control.checked;
      if(enabled){
        if(!window.isSecureContext||!('DeviceMotionEvent'in window)){control.checked=false;toast('Shake entry is not supported in this browser or connection.','amber');renderSettingsSummary();return;}
        let permissionRequest;
        try{permissionRequest=typeof DeviceMotionEvent.requestPermission==='function'?DeviceMotionEvent.requestPermission():Promise.resolve('granted');}
        catch(error){permissionRequest=Promise.reject(error);}
        let permission='denied';try{permission=await permissionRequest;}catch(_){permission='denied';}
        if(permission!=='granted'){control.checked=false;toast('Motion access was not granted. You can still use Quick Entry normally.','amber');renderSettingsSummary();return;}
      }
      const snapshot=JSON.stringify(state);state.settings.shakeQuickEntryEnabled=enabled;
      if(!(await persistMutation(snapshot,'Could not save the shake-to-entry setting. Your previous preference was restored.'))){renderSettingsSummary();syncShakeMotion();return;}
      try{localStorage.setItem('aruvi-shake-quick-entry-v1',enabled?'1':'0');}catch(_){}
      syncShakeMotion();renderSettingsSummary();toast(enabled?'Shake to Quick Entry enabled. Shake twice while Aruvi is open.':'Shake to Quick Entry disabled.');
    });
    $('#interaction-feedback-setting')?.addEventListener('change',async event=>{
      const enabled=!!event.target.checked;
      if(enabled&&interactionFeedbackPrefs().sounds)getAruviAudioContext();
      const snapshot=JSON.stringify(state);state.settings.interactionFeedback={...interactionFeedbackPrefs(),enabled};
      if(!(await persistMutation(snapshot,'Could not save interaction feedback. Your previous preference was restored.'))){renderSettingsSummary();return;}
      renderSettingsSummary();if(enabled)playInteractionFeedback('tap');toast(enabled?'Tap feedback enabled.':'Tap feedback disabled.');
    });
    $('#interaction-feedback-haptics')?.addEventListener('change',async event=>{
      const snapshot=JSON.stringify(state);state.settings.interactionFeedback={...interactionFeedbackPrefs(),haptics:!!event.target.checked};
      if(!(await persistMutation(snapshot,'Could not save vibration feedback.'))){renderSettingsSummary();return;}renderSettingsSummary();playInteractionFeedback('tap');
    });
    $('#interaction-feedback-sounds')?.addEventListener('change',async event=>{
      if(event.target.checked)getAruviAudioContext();
      const snapshot=JSON.stringify(state);state.settings.interactionFeedback={...interactionFeedbackPrefs(),sounds:!!event.target.checked};
      if(!(await persistMutation(snapshot,'Could not save sound effects.'))){renderSettingsSummary();return;}renderSettingsSummary();if(event.target.checked)playInteractionFeedback('tap');
    });
    $('#interaction-feedback-style')?.addEventListener('change',async event=>{
      const snapshot=JSON.stringify(state);state.settings.interactionFeedback={...interactionFeedbackPrefs(),soundStyle:event.target.value};
      if(!(await persistMutation(snapshot,'Could not save the sound style.'))){renderSettingsSummary();return;}renderSettingsSummary();playInteractionFeedback('success');
    });
    $('#interaction-feedback-preview')?.addEventListener('click',()=>playInteractionFeedback('success'));
    document.addEventListener('click',event=>{
      if(!event.isTrusted||!(event.target instanceof Element))return;
      const control=event.target.closest('button:not(:disabled),a[href],summary,label.switch,[role="button"],input[type="checkbox"]:not(:disabled),input[type="radio"]:not(:disabled),select:not(:disabled)');
      if(!control||control.id==='interaction-feedback-preview'||control.matches('button[type="submit"],input[type="submit"]'))return;
      if(control.closest('.interaction-feedback-options')||control.id==='interaction-feedback-setting'||control.id==='shake-quick-entry-toggle')return;
      const label=`${control.id||''} ${control.textContent||''}`;
      if(/download|export|backup/i.test(label))return;
      playInteractionFeedback('tap');
    },true);
    $('#backup-file-input').addEventListener('change',e=>importBackup(e.target.files?.[0]));
    $('#modal-content').addEventListener('click',e=>{const receiptChoice=e.target.closest('[data-receipt-source]');if(receiptChoice){const input=receiptChoice.dataset.receiptSource==='camera'?$('#tx-receipt-camera'):$('#tx-receipt-photo');input?.click();return;}if(e.target.closest('#voice-entry'))voiceDraft();});
    $('#notifications-modal').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close();});
    $('#notifications-modal').addEventListener('click',e=>{if(e.target.closest('[data-cancel-modal]'))e.currentTarget.close();});
    $('#modal-content').addEventListener('input',e=>{
      if(e.target.matches('.amount-input,.quick-flow-value'))fitLargeMoneyAmounts(e.target.form||$('#modal-content'));
      if(e.target.id==='profile-name-input'){const n=e.target.value.trim();$('#profile-form-preview-name').textContent=n||'Your name';$('#profile-form-avatar').textContent=([...(n||'P')][0]||'P').toLocaleUpperCase();}
      if(e.target.closest('#bill-split-form')&&(e.target.matches('[data-bill-name],[data-bill-share],#bill-split-edit-name')))validateBillSplitForm();
      if(e.target.closest('#event-plan-form')&&(e.target.matches('[data-event-person-name],[data-event-person-group],[data-event-group-name],[data-event-category-name],[data-event-category-amount],[data-event-share-value],#event-plan-name,#event-plan-date,#event-plan-total')))validateEventPlannerForm();
    });
    $('#modal-content').addEventListener('change',e=>{
      if(e.target.id==='tx-receipt-photo'||e.target.id==='tx-receipt-camera'){const file=e.target.files?.[0],form=$('#transaction-form');if(file&&form){form.__pwReceiptFile=file;const status=$('#tx-receipt-status');if(status)status.textContent=`Selected ${file.name||'receipt image'} · stored on this device`;}}
      if(e.target.name==='profileColor'){const hex=profileColors[e.target.value]||profileColors.mint;$('#profile-form-avatar').style.background=hex;}
      if(e.target.id==='finance-salary-frequency')syncFinanceSalaryPaydayFields();
      if(e.target.id==='event-start-mode'){const wrap=$('#event-start-groups-wrap');if(wrap)wrap.hidden=e.target.value!=='groups';}
      if(e.target.id==='event-plan-mode'){
        const draft=captureEventPlannerForm();draft.splitMode=e.target.value==='groups'?'groups':'individual';
        if(draft.splitMode==='groups'&&!draft.groups.length){draft.groups=[{id:uid('group'),name:'Group 1',memberIds:[]}];draft.participants.forEach(person=>{person.groupId=draft.groups[0].id;draft.groups[0].memberIds.push(person.id);});}
        if(draft.splitMode==='groups'&&draft.groups.length){draft.participants.forEach((person,index)=>{if(!draft.groups.some(group=>group.id===person.groupId))person.groupId=draft.groups[index%draft.groups.length].id;});draft.groups.forEach(group=>group.memberIds=draft.participants.filter(person=>person.groupId===group.id).map(person=>person.id));}
        normalizeEventCategoryShares(draft);renderEventPlannerEditor(draft);return;
      }
      const modeSelect=e.target.closest('[data-event-category-mode]');if(modeSelect){const draft=captureEventPlannerForm(),category=draft.categories.find(item=>item.id===modeSelect.closest('.event-category-card')?.dataset.eventCategory);if(category){category.mode=modeSelect.value;category.shares=eventShareDefaults(category,eventUnits(draft));}renderEventPlannerEditor(draft);return;}
      if(e.target.closest('#event-plan-form'))validateEventPlannerForm();
      if(e.target.closest('#bill-split-form'))validateBillSplitForm();
    });
    window.addEventListener('resize',scheduleCharts);window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='system'){applyTheme();scheduleCharts();}});
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installedPrompt=e;});
  }
  function goalContributionForm(id){const goal=state.goals.find(g=>g.id===id);if(!goal)return;openModal('Update savings progress',`<form id="goal-contribution-form" class="modal-body goal-contribution-form" data-id="${escapeHTML(goal.id)}"><div class="goal-contribution-summary"><small>${escapeHTML(goal.name)}</small><strong data-money>${fmtHidden(Math.max(0,goal.target-goal.saved))}</strong><span>left to reach your target</span></div><label class="entry-field" for="goal-entry-kind"><span class="entry-field-icon">${icon('swap')}</span><span class="entry-field-copy"><span class="entry-field-name">Entry type</span><select id="goal-entry-kind" name="direction"><option value="add">Contribution</option><option value="withdraw">Withdrawal</option></select></span></label><div class="form-field goal-contribution-amount"><label for="goal-add-amount">AMOUNT · INR</label><input id="goal-add-amount" name="amount" type="text" inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="0.00" required><small>Record money added to or taken from this goal.</small></div><details class="form-disclosure goal-contribution-details"><summary><span class="disclosure-title">${icon('more')} More details</span><span class="disclosure-hint">Date and note · optional</span></summary><div class="disclosure-content"><label class="entry-field" for="goal-entry-date"><span class="entry-field-icon">${icon('calendar')}</span><span class="entry-field-copy"><span class="entry-field-name">Entry date</span><input id="goal-entry-date" name="date" type="date" max="${today()}" value="${today()}"></span></label><div class="form-field"><label for="goal-entry-note">NOTE <span class="muted">· OPTIONAL</span></label><input id="goal-entry-note" name="note" maxlength="80" placeholder="e.g. Monthly savings"></div></div></details><p class="form-note">This updates the tracker only. It does not move money between accounts.</p><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Save progress</button></div></form>`,'SAVINGS GOAL');}
  async function saveGoalContribution(form){const goal=state.goals.find(g=>g.id===form.dataset.id);if(!goal)return;if(state.sample){toast('Clear preview records before changing a sample goal.','amber');return;}const fd=new FormData(form),amount=Number(fd.get('amount')),direction=fd.get('direction')==='withdraw'?'withdraw':'add',date=String(fd.get('date')||today()),note=String(fd.get('note')||'').trim().slice(0,80);if(!(Number.isFinite(amount)&&amount>0)){toast('Enter an amount greater than zero.','error');return;}if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||localDate(dateFrom(date))!==date||date>today()){toast('Choose a valid date that is not in the future.','error');return;}if(direction==='withdraw'&&amount>Number(goal.saved||0)){toast('A withdrawal cannot exceed the amount saved in this goal.','error');return;}const snapshot=JSON.stringify(state);goal.saved=fromMinorUnits(toMinorUnits(direction==='withdraw'?Number(goal.saved||0)-amount:Number(goal.saved||0)+amount));if(!Array.isArray(goal.contributions))goal.contributions=[];goal.contributions.push({id:uid('goal-entry'),date,direction,amount:fromMinorUnits(toMinorUnits(amount)),note,createdAt:new Date().toISOString()});goal.contributions=goal.contributions.slice(-300);if(!(await persistMutation(snapshot,'Could not update goal progress. Your previous records were restored.')))return;closeModal();renderAll();toast(direction==='withdraw'?'Goal withdrawal recorded.':'Goal contribution recorded.');}
  function goalHistory(id){const goal=state.goals.find(g=>g.id===id);if(!goal)return;const entries=(Array.isArray(goal.contributions)?goal.contributions:[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,30);openModal('Progress history',`<div class="modal-body goal-history"><div class="goal-contribution-summary"><small>${escapeHTML(goal.name)}</small><strong data-money>${fmtHidden(goal.saved)}</strong><span>current saved amount</span></div><div class="goal-history-heading"><strong>Recent entries</strong><span>${entries.length} shown</span></div>${entries.length?`<div class="goal-history-list">${entries.map(item=>`<div class="goal-history-item"><span class="goal-history-sign ${item.direction==='withdraw'?'withdraw':'contribution'}">${item.direction==='withdraw'?'−':'+'}</span><span><strong>${item.direction==='withdraw'?'Withdrawal':'Contribution'}</strong><small>${escapeHTML(item.date||'')}${item.note?` · ${escapeHTML(item.note)}`:''}</small></span><b data-money>${item.direction==='withdraw'?'−':'+'}${fmtHidden(item.amount)}</b></div>`).join('')}</div>`:'<div class="empty-inline">No contribution history yet. Add a contribution to start tracking your pace.</div>'}<div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Close</button><button type="button" class="primary-button" data-goal-add="${escapeHTML(goal.id)}">Add entry</button></div></div>`,'SAVINGS GOAL · LOCAL HISTORY');}
  function inferredReminderKind(r){if(r.kind==='income')return 'income';if(r.kind==='investment'||/\bSIP\b|mutual fund|systematic investment|recurring deposit/i.test(`${r.name||''} ${r.note||''}`))return 'investment';if(r.kind==='subscription'||/subscription|netflix|spotify|prime video|youtube premium|disney\+|icloud|google one|adobe|membership|gym fee|microsoft 365/i.test(`${r.name||''} ${r.note||''}`))return 'subscription';return 'bill';}
  function projectedEvents(start,end){
    const events=[];
    for(const r of state.reminders||[]){if(!r.active)continue;const kind=inferredReminderKind(r),repeat=['weekly','monthly','yearly','year'].includes(r.repeat)?(r.repeat==='year'?'yearly':r.repeat):'once';let next=String(r.date||today()),guard=0;if(!next)continue;
      const anchorDay=Number(r.anchorDay)||dateFrom(next).getDate();while(next<start&&repeat!=='once'&&guard++<600)next=addCalendarInterval(next,repeat,anchorDay);if(next<start||next>end)continue;
      while(next<=end&&guard++<1200){events.push({id:`rem-${r.id}-${next}`,date:next,name:r.name||'Planned payment',amount:Math.max(0,Number(r.amount)||0),kind,impact:kind==='income'?1:-1,source:'reminder',reminderId:r.id,repeat});if(repeat==='once')break;next=addCalendarInterval(next,repeat,anchorDay);if(!next)break;}
    }
    for(const d of state.debts||[]){if(!['borrowed','lent'].includes(d.direction)||!d.due||d.due<start||d.due>end)continue;const remaining=debtRemaining(d);if(remaining>0){const receivable=d.direction==='lent';events.push({id:`debt-${d.id}`,date:d.due,name:receivable?`Expected repayment · ${d.person}`:`Debt due · ${d.person}`,amount:remaining,kind:receivable?'receivable':'debt',impact:receivable?1:-1,source:'debt',debtId:d.id,repeat:'once'});}}
    return events.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
  }
  function monthBounds(offset=0){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset);const start=localDate(d);const last=new Date(d.getFullYear(),d.getMonth()+1,0);return {start,end:localDate(last),year:d.getFullYear(),month:d.getMonth(),days:last.getDate(),label:d.toLocaleDateString(undefined,{month:'long',year:'numeric'})};}
  function renderForecastCalendar(){
    const target=$('#forecast-calendar');if(!target)return;const b=monthBounds(forecastMonthOffset),events=projectedEvents(b.start,b.end),byDate={};events.forEach(e=>(byDate[e.date]||(byDate[e.date]=[])).push(e));$('#forecast-month').textContent=b.label;
    const first=(new Date(b.year,b.month,1).getDay()+6)%7;let markup=['M','T','W','T','F','S','S'].map(d=>`<div class="forecast-weekday">${d}</div>`).join('');for(let i=0;i<first;i++)markup+='<div class="forecast-empty-day"></div>';for(let day=1;day<=b.days;day++){const date=`${b.year}-${String(b.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,list=byDate[date]||[],isToday=date===today();markup+=`<button type="button" class="forecast-day ${isToday?'is-today':''} ${list.length?'has-events':''}" data-forecast-date="${date}" aria-label="${escapeHTML(niceDate(date))}${list.length?`, ${list.length} planned ${list.length===1?'event':'events'}`:''}"><span>${day}</span>${list.length?`<i class="forecast-dots ${list.some(x=>x.impact>0)?'has-income':''}"></i>`:''}</button>`;}target.innerHTML=markup;
    const totalIn=sumMoney(events.filter(e=>e.impact>0).map(e=>e.amount)),totalOut=sumMoney(events.filter(e=>e.impact<0).map(e=>e.amount));const projected=forecastMonthOffset<0?null:addMoney(totalBalance(),sumMoney(projectedEvents(today(),b.end).map(e=>e.impact*e.amount)));
    $('#forecast-summary').innerHTML=`<div class="forecast-stat"><small>Expected in</small><strong class="positive-text">${fmtHidden(totalIn)}</strong></div><div class="forecast-stat"><small>Expected out</small><strong class="negative-text">${fmtHidden(totalOut)}</strong></div><div class="forecast-stat"><small>${projected===null?'Projection':'Est. balance by month-end'}</small><strong>${projected===null?'Past month':fmtHidden(projected)}</strong></div>`;
    $('#forecast-agenda-title').textContent=events.length?`${events.length} planned ${events.length===1?'event':'events'}`:'No planned events';const upcoming=events.filter(e=>e.date>=today()).slice(0,6);$('#forecast-events').innerHTML=upcoming.length?upcoming.map(e=>`<div class="forecast-event"><span class="forecast-event-date"><strong>${dateFrom(e.date).getDate()}</strong><small>${dateFrom(e.date).toLocaleDateString(undefined,{month:'short'})}</small></span><span class="forecast-event-icon ${e.impact>0?'inflow':e.kind==='subscription'?'subscription':'outflow'}">${icon(e.impact>0?'income':e.kind==='subscription'?'phone':e.kind==='debt'?'people':'receipt')}</span><span class="forecast-event-copy"><strong>${escapeHTML(e.name)}</strong><small>${escapeHTML(e.kind==='income'?'Expected income':e.kind==='subscription'?'Subscription':e.kind==='debt'?'Debt due':e.kind==='receivable'?'Expected repayment':'Bill / payment')}${e.repeat!=='once'?` · ${escapeHTML(e.repeat)}`:''}</small></span><strong class="forecast-event-amount ${e.impact>0?'positive-text':'negative-text'}">${e.impact>0?'+':'−'}${fmtHidden(e.amount)}</strong></div>`).join(''):'<div class="empty-inline">Add a bill, subscription or expected income reminder to see it here.</div>';
  }
  function renderWeeklyAllowance(){const host=$('#weekly-allowance-panel');if(!host){syncBudgetResetButtons();return;}const cap=Math.max(0,Number(state.settings.weeklyAllowance)||0),now=dateFrom(today()),monday=new Date(now);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);const start=localDate(monday),sunday=new Date(monday);sunday.setDate(sunday.getDate()+6);const end=localDate(sunday);const txs=state.transactions.filter(t=>t.date>=start&&t.date<=today());const spent=Math.max(0,totalsFor(txs).expenses);const remaining=cap?cap-spent:0;const dayLeft=Math.max(1,7-((now.getDay()+6)%7));const pct=cap?Math.min(100,spent/cap*100):0;host.innerHTML=cap?`<div class="allowance-main"><small>LEFT THIS WEEK</small><strong>${fmtHidden(Math.max(0,remaining))}</strong><p>${spent>cap?`${fmtHidden(spent-cap)} over your allowance`: `${fmtHidden(spent)} of ${fmtHidden(cap)} used`}</p></div><div class="progress-track allowance-track"><span style="width:${pct}%;background:${spent>cap?'var(--red)':'var(--green)'}"></span></div><div class="row-between allowance-foot"><span>Daily guide</span><strong>${fmtHidden(Math.max(0,remaining)/dayLeft)}</strong></div><small class="muted">${start===today()?'New week starts today':`${niceDate(start)} – ${niceDate(end)}`}</small>`:`<div class="planner-empty"><span class="planner-empty-icon">${icon('calendar')}</span><p>Choose a weekly spending limit. Aruvi will compare this week’s expenses and refunds against it.</p><button type="button" class="soft-button" id="weekly-allowance-empty-edit">Set weekly allowance</button></div>`;syncBudgetResetButtons();}
  function subscriptionItems(){return (state.reminders||[]).filter(r=>r.active&&inferredReminderKind(r)==='subscription').sort((a,b)=>String(a.date).localeCompare(String(b.date)));}
  function monthlyEquivalent(r){const amount=Math.max(0,Number(r.amount)||0);if(r.repeat==='weekly')return amount*52/12;if(r.repeat==='yearly'||r.repeat==='year')return amount/12;if(r.repeat==='once')return 0;return amount;}
  function renderSubscriptions(){const host=$('#subscriptions-panel');if(!host)return;const subs=subscriptionItems(),monthly=sumMoney(subs.map(r=>monthlyEquivalent(r)));const list=subs.slice(0,4);host.innerHTML=`<div class="subscription-total"><small>ESTIMATED MONTHLY RUN-RATE</small><strong>${fmtHidden(monthly)}</strong><span>${subs.length} active ${subs.length===1?'subscription':'subscriptions'}</span></div>${list.length?`<div class="subscription-list">${list.map(r=>`<div class="subscription-item"><span class="subscription-glyph">${icon('phone')}</span><span><strong>${escapeHTML(r.name)}</strong><small>${escapeHTML(r.repeat||'once')} · next ${escapeHTML(niceDate(r.date))}</small></span><b>${fmtHidden(r.amount)}</b></div>`).join('')}</div>`:'<div class="planner-empty compact-empty"><p>No subscriptions tracked yet. Add one in Bills & reminders and choose “Subscription / membership”.</p></div>'}<button type="button" class="text-button" id="subscriptions-manage-inline">${subs.length>4?`View all ${subs.length} subscriptions`:'Manage bills & subscriptions'} →</button>`;}
  function activityAcceptsType(activityId,type){return state.activities.some(a=>a.id===activityId&&!a.archived&&(a.kind==='both'||a.kind===type||(type==='expense'&&a.kind==='refund')));}
  function merchantFromRecord(record){if(record?.merchantName)return String(record.merchantName).trim().slice(0,120);const note=String(record?.note||'');const match=note.match(/(?:^|[·|;])\s*Merchant:\s*([^·|;]+)/i);return match?match[1].trim().slice(0,120):'';}
  function smartRuleMatch(data){const rules=(Array.isArray(state.settings.smartRules)?state.settings.smartRules:[]).filter(r=>r&&typeof r==='object'&&r.active!==false&&String(r.keyword||'').trim()).sort((a,b)=>String(b.keyword).length-String(a.keyword).length);const hay=`${data.merchantName||''} ${data.note||''} ${data.paymentMethod||''}`;return rules.find(r=>window.PocketWiseWasm?.containsText?.(hay,String(r.keyword).trim())&&(!r.type||r.type==='any'||r.type===data.type)&&activityAcceptsType(r.activityId,data.type))||null;}
  function merchantRuleMatch(data){const merchant=String(data.merchantName||merchantFromRecord(data)||'').trim();if(!merchant)return null;const rules=(Array.isArray(state.settings.merchantRules)?state.settings.merchantRules:[]).slice().sort((a,b)=>Math.max(String(b.merchant||'').length,...(b.aliases||[]).map(x=>String(x).length))-Math.max(String(a.merchant||'').length,...(a.aliases||[]).map(x=>String(x).length)));for(const rule of rules){if(!rule||rule.active===false||(rule.type&&rule.type!=='any'&&rule.type!==data.type)||!activityAcceptsType(rule.activityId,data.type))continue;const aliases=[rule.merchant,...(Array.isArray(rule.aliases)?rule.aliases:[])].filter(Boolean);if(aliases.some(alias=>window.PocketWiseWasm?.containsText?.(merchant,String(alias))))return rule;}return null;}
  function merchantCategorySuggestion(merchant,type){const source=String(merchant||'').trim();if(!source)return null;const learned=merchantRuleMatch({merchantName:source,type});if(learned)return {activityId:learned.activityId,source:'learned'};const smart=smartRuleMatch({merchantName:source,note:source,type,paymentMethod:''});if(smart)return {activityId:smart.activityId,source:'smart-rule'};const match=window.PocketWiseWasm?.merchantLookup?.(source);if(match&&activityAcceptsType(match.category,type))return {activityId:match.category,source:'built-in',canonical:match.canonical};return null;}
  function applySmartRule(data){const learned=merchantRuleMatch(data);if(learned){data.activityId=learned.activityId;return learned;}const rule=smartRuleMatch(data);if(rule){data.activityId=rule.activityId;return rule;}const builtin=merchantCategorySuggestionFromBuiltin(data.merchantName,data.type);if(builtin){data.activityId=builtin.activityId;return builtin;}return null;}
  function merchantCategorySuggestionFromBuiltin(merchant,type){const match=window.PocketWiseWasm?.merchantLookup?.(merchant||'');return match&&activityAcceptsType(match.category,type)?{activityId:match.category,source:'built-in',canonical:match.canonical}:null;}
  function learnMerchantCategory(merchant,activityId,type='expense'){const name=String(merchant||'').trim().slice(0,100);if(name.length<2||!activityAcceptsType(activityId,type))return false;const rules=Array.isArray(state.settings.merchantRules)?state.settings.merchantRules:[];const normalized=name.toLowerCase();const found=rules.find(r=>String(r.merchant||'').toLowerCase()===normalized||(Array.isArray(r.aliases)&&r.aliases.some(x=>String(x).toLowerCase()===normalized)));if(found){found.activityId=activityId;found.active=true;found.updatedAt=new Date().toISOString();}else rules.push({id:uid('merchant-rule'),merchant:name,aliases:[name],activityId,type,active:true,createdAt:new Date().toISOString()});state.settings.merchantRules=rules;return true;}
  function renderSmartRules(){const host=$('#smart-rules-panel');if(!host)return;const rules=(Array.isArray(state.settings.smartRules)?state.settings.smartRules:[]).filter(r=>r&&typeof r==='object');host.innerHTML=rules.length?`<div class="smart-rules-count">${rules.length} local rule${rules.length===1?'':'s'} · applied to new entries</div><div class="smart-rules-list">${rules.slice(0,3).map(r=>`<div class="smart-rule-item"><span class="smart-rule-bullet">${icon('sparkle')}</span><span><strong>${escapeHTML(r.keyword)}</strong><small>→ ${escapeHTML(activityById(r.activityId)?.name||'Unavailable activity')}${r.type&&r.type!=='any'?` · ${escapeHTML(r.type)}`:''}</small></span></div>`).join('')}</div>${rules.length>3?`<button class="text-button" id="smart-rules-manage-inline" type="button">View all ${rules.length} rules →</button>`:''}`:'<div class="planner-empty compact-empty"><p>Teach Aruvi a merchant keyword. For example, “Netflix” can always use Subscriptions.</p><button class="soft-button" type="button" id="smart-rules-create-first">Create your first rule</button></div>';}
  function smartRulesManager(){
    const rules=(Array.isArray(state.settings.smartRules)?state.settings.smartRules:[]).filter(r=>r&&typeof r==='object');
    openModal('Smart transaction rules',`<div class="modal-body rule-manager">
      <p class="muted small">Choose a keyword that appears in a new transaction. Aruvi can then suggest its category. Rules stay on this device and never rewrite old records.</p>
      <div class="entity-list">${rules.length?rules.map(r=>`<div class="entity-row"><span class="transaction-icon">${icon('sparkle')}</span><div class="entity-copy"><strong>${escapeHTML(r.keyword)}</strong><small>Assign to ${escapeHTML(activityById(r.activityId)?.name||'Unavailable activity')} · ${escapeHTML(r.type||'any transaction')}</small></div><button type="button" class="mini-button" data-smart-rule-remove="${escapeHTML(r.id)}" aria-label="Remove rule for ${escapeHTML(r.keyword)}">${icon('trash')}</button></div>`).join(''):'<div class="empty-inline">No smart rules yet. Add one when you notice a repeated merchant or phrase.</div>'}</div>
      <button type="button" class="primary-button rule-open-create" id="smart-rule-open-create">${icon('plus')} Add a rule</button>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Done</button></div>
    </div>`,'LOCAL AUTOMATION');
  }
  function smartRuleCreateForm(){
    openModal('Add a smart rule',`<form id="smart-rule-form" class="modal-body rule-create-form">
      <p class="account-form-intro">Match a word in the transaction note or payment method and choose the category to suggest.</p>
      <label class="entry-field" for="smart-rule-keyword"><span class="entry-field-icon">${icon('search')}</span><span class="entry-field-copy"><span class="entry-field-name">Keyword or merchant</span><input id="smart-rule-keyword" name="keyword" placeholder="e.g. Netflix, Uber, canteen" maxlength="80" required></span></label>
      <label class="entry-field" for="smart-rule-activity"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">Suggest category</span><select id="smart-rule-activity" name="activityId">${state.activities.filter(a=>!a.archived).map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}</option>`).join('')}</select></span></label>
      <details class="form-disclosure"><summary><span class="disclosure-title">${icon('sliders')} Match options</span><span class="disclosure-hint">Optional · transaction type</span></summary><div class="disclosure-content"><div class="form-field"><label for="smart-rule-type">TRANSACTION TYPE</label><select id="smart-rule-type" name="type"><option value="any">Any compatible type</option><option value="expense">Expense</option><option value="income">Income</option><option value="refund">Refund</option></select></div></div></details>
      <p class="form-note">A rule only suggests a category when you save a new transaction. You can still change it before saving.</p>
      <div class="form-actions"><button class="secondary-button" type="button" id="smart-rule-back-to-list">Back to rules</button><button class="primary-button" type="submit">Save rule</button></div>
    </form>`,'LOCAL AUTOMATION');
  }
  async function saveSmartRule(form){const fd=new FormData(form),keyword=String(fd.get('keyword')||'').trim(),activityId=String(fd.get('activityId')||''),type=String(fd.get('type')||'any');if(keyword.length<2){toast('Use a keyword with at least two characters.','error');return;}const activity=state.activities.find(a=>a.id===activityId&&!a.archived);if(!activity){toast('Choose an active activity.','error');return;}if((activity.kind==='income'&&type==='expense')||(activity.kind==='expense'&&type==='income')||(activity.kind==='refund'&&type==='income')){toast('That activity is not compatible with the selected transaction type.','error');return;}const existingRules=Array.isArray(state.settings.smartRules)?state.settings.smartRules:[];if(existingRules.some(r=>r&&String(r.keyword||'').toLowerCase()===keyword.toLowerCase()&&(r.type||'any')===type)){toast('A rule with that keyword and type already exists.','amber');return;}const snapshot=JSON.stringify(state);state.settings.smartRules=existingRules;state.settings.smartRules.push({id:uid('rule'),keyword,activityId,type,active:true,createdAt:new Date().toISOString()});if(!(await persistMutation(snapshot,'Could not save this smart rule. Your previous settings were restored.')))return;smartRulesManager();renderPlanningTools();toast('Smart rule saved. It will apply to matching new transactions.');}
  function merchantRulesManager(){
    const rules=(Array.isArray(state.settings.merchantRules)?state.settings.merchantRules:[]).filter(r=>r&&typeof r==='object');
    openModal('Merchant category rules',`<div class="modal-body rule-manager">
      <p class="muted small">Aruvi learns the category you choose for a merchant and reuses it for future statement, payment-text and receipt imports on this device.</p>
      <div class="entity-list">${rules.length?rules.map(r=>`<div class="entity-row"><span class="transaction-icon">${icon('tag')}</span><div class="entity-copy"><strong>${escapeHTML(r.merchant||'Merchant')}</strong><small>${escapeHTML(activityById(r.activityId)?.name||'Unavailable category')} · ${escapeHTML((r.aliases||[]).filter(x=>x!==r.merchant).join(', ')||'No aliases')}</small></div><button type="button" class="mini-button" data-merchant-rule-remove="${escapeHTML(r.id)}" aria-label="Remove ${escapeHTML(r.merchant)} rule">${icon('trash')}</button></div>`).join(''):'<div class="empty-inline">No merchant matches saved yet. You can add one from a corrected import too.</div>'}</div>
      <button type="button" class="primary-button rule-open-create" id="merchant-rule-open-create">${icon('plus')} Add a merchant</button>
      <div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Done</button></div>
    </div>`,'LOCAL CATEGORISATION');
  }
  function merchantRuleCreateForm(){
    openModal('Add a merchant match',`<form id="merchant-rule-form" class="modal-body rule-create-form">
      <p class="account-form-intro">Choose the category Aruvi should suggest when this merchant appears.</p>
      <label class="entry-field" for="merchant-rule-name"><span class="entry-field-icon">${icon('store')}</span><span class="entry-field-copy"><span class="entry-field-name">Merchant name</span><input id="merchant-rule-name" name="merchant" maxlength="100" placeholder="e.g. Swiggy" required></span></label>
      <label class="entry-field" for="merchant-rule-category"><span class="entry-field-icon">${icon('tag')}</span><span class="entry-field-copy"><span class="entry-field-name">Match category</span><select id="merchant-rule-category" name="activityId">${state.activities.filter(a=>!a.archived).map(a=>`<option value="${escapeHTML(a.id)}">${escapeHTML(a.name)}</option>`).join('')}</select></span></label>
      <details class="form-disclosure"><summary><span class="disclosure-title">${icon('sliders')} More matching options</span><span class="disclosure-hint">Aliases and transaction type</span></summary><div class="disclosure-content"><div class="form-field"><label for="merchant-rule-aliases">ALTERNATE BILLING NAMES · OPTIONAL</label><input id="merchant-rule-aliases" name="aliases" maxlength="500" placeholder="e.g. SWIGGY TECHNOLOGIES, Bundl Technologies"></div><div class="form-field"><label for="merchant-rule-type">TRANSACTION TYPE</label><select id="merchant-rule-type" name="type"><option value="expense">Expense</option><option value="income">Income</option><option value="refund">Refund</option><option value="any">Any compatible type</option></select></div></div></details>
      <p class="form-note">More specific merchant names take priority over shorter matches. Rules stay on this device.</p>
      <div class="form-actions"><button class="secondary-button" type="button" id="merchant-rule-back-to-list">Back to merchants</button><button class="primary-button" type="submit">Save match</button></div>
    </form>`,'LOCAL CATEGORISATION');
  }
  async function saveMerchantRule(form){const fd=new FormData(form),merchant=String(fd.get('merchant')||'').trim(),aliases=String(fd.get('aliases')||'').split(/[;,]/).map(x=>x.trim()).filter(x=>x.length>=2).slice(0,30),activityId=String(fd.get('activityId')||''),type=String(fd.get('type')||'expense');if(merchant.length<2||!state.activities.some(a=>a.id===activityId&&!a.archived)){toast('Enter a merchant and choose a category.','error');return;}if(type!=='any'&&!activityAcceptsType(activityId,type)){toast('That category is not compatible with this transaction type.','error');return;}const snapshot=JSON.stringify(state);state.settings.merchantRules=Array.isArray(state.settings.merchantRules)?state.settings.merchantRules:[];const existing=state.settings.merchantRules.find(r=>String(r.merchant||'').toLowerCase()===merchant.toLowerCase());if(existing){existing.activityId=activityId;existing.aliases=[...new Set([merchant,...aliases])];existing.type=type;existing.active=true;}else state.settings.merchantRules.push({id:uid('merchant-rule'),merchant,aliases:[...new Set([merchant,...aliases])],activityId,type,active:true,createdAt:new Date().toISOString()});if(!(await persistMutation(snapshot,'Could not save the merchant rule. Your previous settings were restored.')))return;merchantRulesManager();toast('Merchant category rule saved.');}
  function weeklyAllowanceForm(){openModal('Set weekly allowance',`<form id="weekly-allowance-form" class="modal-body"><p class="muted">Set a simple ceiling for Monday through Sunday. Spending is calculated from recorded expenses minus refunds. It does not change your monthly budget.</p><div class="form-field"><label for="weekly-allowance-value">WEEKLY SPENDING LIMIT · INR</label><input class="amount-input" id="weekly-allowance-value" name="allowance" type="number" enterkeyhint="done" min="0" step="0.01" value="${Number(state.settings.weeklyAllowance)||''}" placeholder="e.g. 2500" required></div><p class="form-note">Set to ₹0 to disable the weekly allowance. No money moves automatically.</p><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Cancel</button><button type="submit" class="primary-button">Save allowance</button></div></form>`,'WEEKLY SPENDING PLAN');}
  async function saveWeeklyAllowance(form){const amount=Number(new FormData(form).get('allowance'));if(!Number.isFinite(amount)||amount<0){toast('Enter a valid weekly amount.','error');return;}const snapshot=JSON.stringify(state);state.settings.weeklyAllowance=fromMinorUnits(toMinorUnits(amount));if(!(await persistMutation(snapshot,'Could not save the weekly allowance. Your previous settings were restored.')))return;closeModal();renderPlanningTools();toast(amount?'Weekly allowance updated.':'Weekly allowance turned off.');}
  function simulateDebtPlan(monthlyPayment,strategy){
    const debts=(state.debts||[]).filter(d=>d.direction==='borrowed'&&debtRemaining(d)>0);
    const rows=debts.map(d=>({id:d.id,name:d.person,balance:debtRemaining(d),rate:Math.max(0,Number(d.interestRate)||0)}));
    if(!rows.length)return {empty:true};
    if(!(monthlyPayment>0))return {needsPlan:true,rows};
    const wasm=window.PocketWiseWasm;
    if(!wasm||typeof wasm.debtAmortize!=='function')throw new Error('The required C++ WebAssembly debt-planning engine is unavailable.');
    const result=wasm.debtAmortize(rows.map(row=>({
      balanceMinor:toMinorUnits(row.balance),
      annualRateBasisPoints:Math.max(0,Math.min(10000000,Math.round(row.rate*100)))
    })),toMinorUnits(monthlyPayment),strategy==='avalanche'?'avalanche':'snowball');
    const updatedRows=rows.map((row,index)=>({...row,balance:fromMinorUnits(result.rows[index].balanceMinor),interest:fromMinorUnits(result.rows[index].interestMinor)})).filter(row=>row.balance>0);
    return {months:result.months,interestTotal:fromMinorUnits(result.interestMinor),rows:updatedRows,unworkable:result.outcome===2,done:result.outcome===1};
  }
  function renderDebtPlanner(){const host=$('#debt-planner-panel');if(!host)return;const total=sumMoney((state.debts||[]).filter(d=>d.direction==='borrowed').map(d=>debtRemaining(d))),payment=Number(state.settings.debtPayoffMonthly)||0,strategy=state.settings.debtStrategy||'snowball';if(!total){host.innerHTML='<div class="planner-empty compact-empty"><p>Track a borrowed debt first. The planner will estimate payoff timing from that record.</p><button class="soft-button" type="button" data-action="debts">View debt records</button></div>';return;}const sim=simulateDebtPlan(payment,strategy);if(sim.needsPlan){host.innerHTML=`<div class="debt-plan-total"><small>OUTSTANDING BORROWED DEBT</small><strong>${fmtHidden(total)}</strong></div><p class="muted small">Set a monthly payment target to estimate the payoff timeline. Add optional annual interest rates to debts for a more useful estimate.</p><button class="soft-button" type="button" id="debt-plan-edit-inline">Set payoff plan</button>`;return;}if(sim.unworkable||sim.done===false){host.innerHTML=`<div class="debt-plan-total"><small>OUTSTANDING BORROWED DEBT</small><strong>${fmtHidden(total)}</strong></div><p class="negative-text small">${sim.unworkable?'Your estimated monthly interest is at least as high as the payment. Increase the payment or review the APR values.':'At this payment, the estimate extends beyond 50 years. Increase the payment or review the debt details.'}</p><button class="soft-button" type="button" id="debt-plan-edit-inline">Adjust plan</button>`;return;}const date=new Date();date.setDate(1);date.setMonth(date.getMonth()+sim.months);host.innerHTML=`<div class="debt-plan-total"><small>OUTSTANDING BORROWED DEBT</small><strong>${fmtHidden(total)}</strong></div><div class="debt-plan-highlight"><span class="debt-plan-icon">${icon(strategy==='avalanche'?'chart':'goal')}</span><div><small>ESTIMATED DEBT-FREE</small><strong>${escapeHTML(date.toLocaleDateString(undefined,{month:'short',year:'numeric'}))}</strong><small>${sim.months} ${sim.months===1?'month':'months'} · ${strategy==='avalanche'?'highest interest first':'smallest balance first'}</small></div></div><div class="debt-plan-numbers"><div><small>Monthly target</small><strong>${fmtHidden(payment)}</strong></div><div><small>Estimated interest</small><strong>${fmtHidden(sim.interestTotal)}</strong></div></div><p class="fine-print">Planning estimate only. Assumes the same payment every month, no new borrowing and monthly compounding. Actual terms may differ.</p><button class="text-button" type="button" id="debt-plan-edit-inline">Adjust payoff plan →</button>`;}
  function debtPlanForm(){openModal('Debt payoff plan',`<form id="debt-plan-form" class="modal-body"><p class="muted">This calculator is a planning aid, not a lender quote. It uses your borrowed debts, optional APR entries, and one total monthly payment target.</p><div class="form-field"><label for="debt-plan-monthly">TOTAL MONTHLY PAYMENT · INR</label><input id="debt-plan-monthly" name="monthlyPayment" type="number" enterkeyhint="done" min="0" step="0.01" value="${Number(state.settings.debtPayoffMonthly)||''}" placeholder="e.g. 3000" required></div><div class="form-field"><label for="debt-plan-strategy">PAYOFF ORDER</label><select id="debt-plan-strategy" name="strategy"><option value="snowball" ${(state.settings.debtStrategy||'snowball')==='snowball'?'selected':''}>Snowball · smallest balance first</option><option value="avalanche" ${state.settings.debtStrategy==='avalanche'?'selected':''}>Avalanche · highest interest first</option></select></div><p class="form-note">Avalanche is only meaningfully different when interest rates are entered on debt records. Aruvi does not make payments or contact lenders.</p><div class="form-actions"><button type="button" class="secondary-button" data-cancel-modal>Cancel</button><button type="submit" class="primary-button">Save payoff plan</button></div></form>`,'DEBT PLANNING');}
  async function saveDebtPlan(form){const fd=new FormData(form),monthly=Number(fd.get('monthlyPayment')),strategy=String(fd.get('strategy')||'snowball');if(!Number.isFinite(monthly)||monthly<0||!['snowball','avalanche'].includes(strategy)){toast('Check your payoff plan.','error');return;}const snapshot=JSON.stringify(state);state.settings.debtPayoffMonthly=fromMinorUnits(toMinorUnits(monthly));state.settings.debtStrategy=strategy;if(!(await persistMutation(snapshot,'Could not save your debt plan. Your previous settings were restored.')))return;closeModal();renderPlanningTools();toast('Debt payoff plan updated.');}
  function renderMonthlyReview(){const host=$('#monthly-review-panel');if(!host)return;const current=periodTransactions('month'),prev=periodTransactions('last-month'),cur=totalsFor(current),old=totalsFor(prev),delta=cur.expenses-old.expenses;const categories=expenseByCategory('month'),top=categories[0],largest=current.filter(t=>t.type==='expense').sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0))[0],budget=budgetAmount(),spent=cur.expenses;let headline='Add a few transactions to create your first useful monthly review.';if(current.length){if(cur.net<0)headline='Spending is higher than recorded income this month. Check the largest costs before changing everything at once.';else if(budget&&spent>budget)headline='You are over your monthly budget. Review the top category and decide what is worth adjusting.';else if(old.expenses&&delta<0)headline='Recorded spending is lower than last month. Keep the habits that made the difference.';else if(cur.net>=0)headline='Your recorded cash flow is positive so far. Keep an eye on planned bills still due this month.';}const change=old.expenses?delta/old.expenses*100:null;host.innerHTML=`<div class="review-headline"><span class="review-headline-icon">${icon(cur.net<0?'chart':'sparkle')}</span><p>${escapeHTML(headline)}</p></div><div class="review-metrics"><div><small>Spent this month</small><strong>${fmtHidden(cur.expenses)}</strong></div><div><small>Last month</small><strong>${fmtHidden(old.expenses)}</strong></div><div><small>Net cash flow</small><strong class="${cur.net<0?'negative-text':'positive-text'}">${fmtHidden(cur.net)}</strong></div></div><div class="review-observations">${top?`<div><span>Top category</span><strong>${escapeHTML(top.name)} · ${fmtHidden(top.value)}</strong></div>`:''}${largest?`<div><span>Largest single expense</span><strong>${escapeHTML(txActivity(largest).name)} · ${fmtHidden(largest.amount)}</strong></div>`:''}<div><span>vs. last month</span><strong>${change===null?'Not enough history':`${Math.abs(change).toFixed(0)}% ${delta>0?'higher':delta<0?'lower':'unchanged'}`}</strong></div>${budget?`<div><span>Monthly budget used</span><strong>${Math.round(spent/budget*100)}% · ${fmtHidden(Math.max(0,budget-spent))} left</strong></div>`:''}</div><button type="button" class="text-button" id="monthly-review-export-inline">Export this review →</button>`;}
  function exportMonthlyReview(){const current=periodTransactions('month'),prev=periodTransactions('last-month'),cur=totalsFor(current),old=totalsFor(prev),top=expenseByCategory('month')[0],largest=current.filter(t=>t.type==='expense').sort((a,b)=>(Number(b.amount)||0)-(Number(a.amount)||0))[0];const lines=[`Aruvi monthly money review · ${new Date().toLocaleDateString(undefined,{month:'long',year:'numeric'})}`,'',`Income recorded: ${money(cur.income)}`,`Expenses recorded: ${money(cur.expenses)}`,`Net cash flow: ${money(cur.net)}`,`Last month expenses: ${money(old.expenses)}`,`Transactions this month: ${current.length}`,`Top category: ${top?`${top.name} · ${money(top.value)}`:'Not enough category data'}`,`Largest expense: ${largest?`${txActivity(largest).name} · ${money(largest.amount)} on ${largest.date}`:'None recorded'}`,`Monthly budget: ${budgetAmount()?money(budgetAmount()):'Not set'}`,'','This report is generated from records stored in this browser. Figures may be incomplete if transactions have not been entered.'];downloadBlob(`aruvi-monthly-review-${today()}.txt`,new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'}));toast('Monthly review exported.');}
  function renderPlanningTools(){renderForecastCalendar();renderWeeklyAllowance();renderSubscriptions();renderSmartRules();renderDebtPlanner();renderMonthlyReview();}

  // Detect when the app returns from Shortcuts or another app. The redirect URL may
  // arrive on a reused page, but iOS may also remove its parameters entirely.
  let appReady = false;
  let pocketwiseHiddenAt=0;
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){pocketwiseHiddenAt=Date.now();return;}
    if(document.visibilityState==='visible'){
      const wasAway=pocketwiseHiddenAt>0&&Date.now()-pocketwiseHiddenAt>700;
      pocketwiseHiddenAt=0;
      if(wasAway&&appReady)showShortcutReturnNudge();
      checkIncomingShortcutRoute();
    }
  });

  function normalizeShortcutType(raw){
    const value=String(raw||'').trim().toLowerCase().replace(/[\s_-]+/g,' ');
    const typeMap={'income':'income','money in':'income','expense':'expense','purchase':'expense','purchase / expense':'expense','purchase/expense':'expense','spending':'expense','refund':'refund','money back':'refund'};
    return typeMap[value]||'';
  }
  function shortcutFieldsFromURL(rawURL){
    try{
      const url=new URL(rawURL,location.href);
      const params=new URLSearchParams(url.search);
      const hash=url.hash.startsWith('#')?url.hash.slice(1):url.hash;
      const hashParams=new URLSearchParams(hash.includes('?')?hash.split('?').pop():hash);
      for(const [key,value] of hashParams.entries())if(!params.has(key))params.set(key,value);
      if(!params.has('quickadd')&&!params.has('amount')&&!params.has('type'))return null;
      return {amount:params.get('amount')||'',type:params.get('type')||'',category:params.get('category')||'',note:params.get('note')||'',date:params.get('date')||'',accountId:params.get('accountId')||params.get('account')||'',paymentMethod:params.get('paymentMethod')||params.get('payment')||'',requestId:params.get('requestId')||params.get('reqId')||params.get('id')||''};
    }catch{return null;}
  }
  function createShortcutDraft(fields){
    const rawAmount=fields?.amount??'';
    const amount=parseAmount(rawAmount);
    const type=normalizeShortcutType(fields?.type);
    const category=String(fields?.category??fields?.activity??'').trim().slice(0,100);
    const note=String(fields?.note??'').slice(0,240);
    const normalizeCategory=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'').trim();
    const categoryKey=normalizeCategory(category);
    const categoryMatch=category?state.activities.find(a=>(normalizeCategory(a.id)===categoryKey||normalizeCategory(a.name)===categoryKey)&&(a.kind==='both'||a.kind===type||(type==='expense'&&a.kind==='refund')))||state.activities.find(a=>categoryKey&&(normalizeCategory(a.name).includes(categoryKey)||categoryKey.includes(normalizeCategory(a.name)))&&(a.kind==='both'||a.kind===type||(type==='expense'&&a.kind==='refund'))):null;
    const incomingDate=String(fields?.date||'').slice(0,10);
    const dateValid=/^\d{4}-\d{2}-\d{2}$/.test(incomingDate)&&!Number.isNaN(new Date(`${incomingDate}T12:00:00`).getTime())&&localDate(new Date(`${incomingDate}T12:00:00`))===incomingDate;
    const requestId=String(fields?.requestId??fields?.reqId??fields?.id??'').trim().slice(0,120);
    const fallbackActivity=state.activities.find(a=>a.id==='other'&&(a.kind==='both'||a.kind===type))||state.activities.find(a=>a.kind==='both'||a.kind===type)||(state.activities[0]||null);
    const requestedAccount=String(fields?.accountId??fields?.account??'').trim();
    const accountId=state.accounts.some(a=>a.id===requestedAccount)?requestedAccount:(state.settings.lastQuickAddAccountId||state.accounts[0]?.id||'cash');
    const requestedPayment=String(fields?.paymentMethod??fields?.payment??'').trim();
    const paymentMethod=['Cash','UPI','Bank transfer','Debit card','Credit card','Wallet','Other','Bank / UPI'].find(v=>v.toLowerCase()===requestedPayment.toLowerCase())||state.settings.lastQuickAddPaymentMethod||'Cash';
    return {amount:Number.isFinite(amount)&&amount>0?String(amount):'',type,activityId:categoryMatch?.id||fallbackActivity?.id||'other',accountId,paymentMethod,note,date:dateValid?incomingDate:'',requestId,fromShortcut:true};
  }
  function showShortcutDraft(draft){
    quickAddDraft=draft;
    if(!draft.amount){renderQuickAddStep('amount');toast('The copied data did not contain a valid amount. Enter it to continue.','amber');return;}
    if(!draft.type){renderQuickAddStep('type');toast('Choose Income, Expense or Refund to continue.','amber');return;}
    if(!draft.activityId){renderQuickAddStep('activity');toast('Choose the closest Aruvi category.','amber');return;}
    renderQuickAddStep('activity');
  }
  function parseBankSms(raw){
    const text=String(raw||'').trim();if(!text)throw new Error('Copy a bank SMS first.');
    // Most Indian bank SMS formats omit a currency symbol: “debited by 10.00”.
    const amountMatch=text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i)
      || text.match(/\b(?:debited|credited|spent|received|paid)\b(?:\s+(?:by|with|of|for))?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const amount=parseAmount(String(amountMatch?.[1]||'').replace(/,/g,''));
    if(!(amount>0))throw new Error('Could not find the amount. Copy the full bank message and try again.');
    const wasmParty=window.PocketWiseWasm&&typeof window.PocketWiseWasm.extractMerchant==='function'
      ?window.PocketWiseWasm.extractMerchant(text):null;
    const textCredit=/\b(?:credited|received|deposited)\b/i.test(text)&&!/\b(?:debited|spent|paid|purchase)\b/i.test(text);
    const credit=wasmParty?.direction==='incoming'?true:wasmParty?.direction==='outgoing'?false:textCredit;
    const type=credit?'income':'expense';
    // Merchant/payee inference is exclusively handled by the C++/Wasm narration grammar.
    // A generic JS `to <words>` regex mislabels prose such as “log in to your account” as a merchant.
    // Keep the transaction review useful without inventing a payee when confidence is insufficient.
    const merchant=wasmParty&&Number(wasmParty.confidence)>=.55?String(wasmParty.name||'').trim():'Bank transaction';
    const refMatch=text.match(/\b(?:ref(?:erence)?\s*(?:no\.?|number)?|utr|rrn)\s*[:#-]?\s*([A-Z0-9-]{6,})/i);
    const reference=refMatch?.[1]||'';
    let date=today();
    const isoDate=text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const numericDate=text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
    if(isoDate){const year=Number(isoDate[1]),month=Number(isoDate[2]),day=Number(isoDate[3]),check=new Date(year,month-1,day);if(year>=2000&&year<=2100&&check.getFullYear()===year&&check.getMonth()===month-1&&check.getDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
    else if(numericDate){let day=Number(numericDate[1]),month=Number(numericDate[2]),year=Number(numericDate[3]);if(year<100)year+=2000;if(month>12&&day<=12)[day,month]=[month,day];const check=new Date(year,month-1,day);if(year>=2000&&year<=2100&&check.getFullYear()===year&&check.getMonth()===month-1&&check.getDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
    else {const dateMatch=text.match(/\b(\d{1,2})[- /]?([A-Z]{3,9})[- ,/]?(\d{2,4})\b/i);if(dateMatch){const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};const day=Number(dateMatch[1]),month=months[String(dateMatch[2]).slice(0,3).toLowerCase()],rawYear=String(dateMatch[3]),year=Number(rawYear.length===2?'20'+rawYear:rawYear),check=new Date(year,(month||1)-1,day);if(month&&year>=2000&&year<=2100&&check.getFullYear()===year&&check.getMonth()===month-1&&check.getDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}}
    const accountMatch=text.match(/\bA\/C\s+(?:X|\*|x)?([A-Z0-9]{3,})\b/i)||text.match(/\b(?:A\/c|account)\s*[*Xx-]+([0-9]{3,})\b/i);
    const accountSuffix=accountMatch?.[1] ? accountMatch[1].slice(-4) : '';
    const noteParts=[`Transfer ${credit?'from':'to'}: ${merchant}`];if(accountSuffix)noteParts.push(`Account ••${accountSuffix}`);if(reference)noteParts.push(`Ref: ${reference}`);noteParts.push('Imported from bank SMS');
    return {amount,type,activityId:'',note:noteParts.join(' · '),date,accountSuffix,reference,merchant,accountId:state.settings.lastQuickAddAccountId||state.accounts[0]?.id||'cash',paymentMethod:/UPI|VPA|@/i.test(text)?'UPI':'Bank transfer',bankSmsRaw:text};
  }
  async function pasteBankSms(){try{if(!navigator.clipboard?.readText)throw new Error('Clipboard access is unavailable. Open Aruvi over HTTPS and try again.');const raw=await navigator.clipboard.readText();quickAddDraft={...parseBankSms(raw),requestId:null};transactionHaptic();renderQuickAddStep('activity');toast('Amount, date and transfer details extracted. Choose the category for this entry.');}catch(e){toast(e.message||'Could not read the bank SMS.','error');}}
  function parseClipboardShortcut(raw){
    const text=String(raw||'').trim();
    if(!text)throw new Error('The clipboard is empty. Run the Shortcut again and copy its transaction first.');
    let trimmed=text.replace(/^(?:ARUVI|POCKETWISE)\s*:\s*/i,'');
    // Accept valid JSON directly. Also repair common Apple Shortcuts text-template
    // mistakes such as {{ ... }} or an extra brace at either edge, but only when
    // a complete inner JSON object parses successfully.
    let data=null;
    let jsonError=null;
    try { data=JSON.parse(trimmed); } catch(error) { jsonError=error; }
    if(data===null && trimmed.includes('{') && trimmed.includes('}')){
      const first=trimmed.indexOf('{');
      const last=trimmed.lastIndexOf('}');
      if(first>=0&&last>first){
        const candidate=trimmed.slice(first,last+1).trim();
        try { data=JSON.parse(candidate); trimmed=candidate; } catch(error) { jsonError=error; }
      }
      if(data===null){
        // If the whole object is enclosed by an accidental extra brace, try removing
        // one layer from each side as a second recovery path.
        const candidate=trimmed.startsWith('{{')&&trimmed.endsWith('}}')?trimmed.slice(1,-1).trim():'';
        if(candidate){try{data=JSON.parse(candidate);trimmed=candidate;}catch(error){jsonError=error;}}
      }
    }
    let fields=null;
    if(trimmed.startsWith('{')||data!==null){
      if(data===null){
        const fromURL=shortcutFieldsFromURL(trimmed);
        if(fromURL)fields=fromURL;
        else throw new Error('Aruvi could not parse this JSON. Check that it starts with {, ends with }, uses double quotes, and has no extra commas. Details: '+(jsonError?.message||'invalid JSON'));
      }
      if(data&&typeof data==='object'&&!Array.isArray(data)){
        if(data.transaction&&typeof data.transaction==='object')data=data.transaction;
        fields={amount:data.amount,type:data.type,category:data.category??data.activity,note:data.note,date:data.date||data.ts,accountId:data.accountId??data.account,paymentMethod:data.paymentMethod??data.payment,requestId:data.requestId??data.reqId??data.id};
      }
    }else{
      const fromURL=shortcutFieldsFromURL(trimmed);if(fromURL)fields=fromURL;
    }
    if(!fields)throw new Error('No Aruvi transaction was found on the clipboard. Copy the transaction JSON or its Quick Add URL.');
    const amount=parseAmount(fields.amount);
    if(!Number.isFinite(amount)||amount<=0)throw new Error('The copied transaction has no valid amount greater than ₹0.');
    return fields;
  }
  function showShortcutKeyPrompt(){
    openModal('Import from Shortcut',`<form id="shortcut-key-form" class="modal-body"><p class="muted">Paste the transaction key, complete Aruvi Quick Add URL, or transaction JSON copied by your Shortcut. This is a local import; nothing is sent to a server.</p><div class="form-field"><label for="shortcut-key-value">TRANSACTION KEY OR PAYLOAD</label><textarea id="shortcut-key-value" name="payload" rows="5" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder='Paste the Aruvi URL or JSON here' required></textarea></div><p class="form-note">Paste the complete URL or JSON payload. Aruvi validates it, saves the transaction, and opens the receipt automatically.</p><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit">Validate & continue</button></div><button class="text-button dismiss-import" type="button" data-cancel-modal>Close without importing</button></form>`,'SHORTCUT IMPORT');
  }
  async function importShortcutText(raw){
    const fields=parseClipboardShortcut(raw);
    transactionHaptic();
    const draft=createShortcutDraft(fields);
    // The Shortcut has already collected the transaction details. Do not send
    // the user through Quick Add to enter/review the same information again.
    // Save the pasted payload directly and show the existing receipt on success.
    closeModal();
    if(!draft.amount||!draft.type){throw new Error('The copied Shortcut payload is missing a valid amount or transaction type. Run the Shortcut again.');}
    quickAddDraft=draft;
    await saveQuickAdd();
  }
  async function processShortcutClipboardPayload(clipboardPayload){
    if(!clipboardPayload)throw new Error('The clipboard content is not a supported image or Aruvi Shortcut payload.');
    if(clipboardPayload.kind==='image'){
      transactionHaptic();
      await pwProcessPaymentImage(clipboardPayload.file,{shared:true});
      return;
    }
    if(clipboardPayload.kind==='text'){
      await importShortcutText(clipboardPayload.text);
      return;
    }
    throw new Error('The clipboard content is not a supported image or Aruvi Shortcut payload.');
  }
  function showNativePasteFallback(){
    openModal('Paste from iPhone',`<div class="modal-body pw-native-paste-fallback"><p>iOS did not expose the clipboard through automatic reading. This is not a Settings permission switch. Use the iPhone's own Paste action instead.</p><div id="pw-native-paste-target" class="pw-native-paste-target" contenteditable="true" role="textbox" aria-label="Paste payment screenshot or Shortcut text here" aria-multiline="true" spellcheck="false" autocapitalize="off" data-placeholder="Touch and hold here, then choose Paste"></div><p class="fine-print">After pasting, Aruvi detects an image or an older Shortcut's transaction text and continues locally. Your transaction is not saved automatically from an image.</p><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" id="pw-native-paste-gallery" type="button">Choose from Photos</button></div></div>`,'IOS NATIVE PASTE');
    const target=$('#pw-native-paste-target');
    $('#pw-native-paste-gallery')?.addEventListener('click',()=>{pwShowImport();$('#pw-choose-gallery')?.click();});
    target?.addEventListener('paste',event=>{
      // Read DataTransfer synchronously inside the trusted paste event. This is
      // WebKit's native paste-event route and avoids a second permission probe.
      const transfer=event.clipboardData;
      event.preventDefault();
      target.textContent='';
      void (async()=>{
        try{
          const payload=await window.PocketWiseClipboardImport?.readPasteEvent(transfer);
          if(!payload){toast('No usable image or Shortcut text was pasted. Try Copy to Clipboard again.','error');return;}
          await processShortcutClipboardPayload(payload);
        }catch(error){toast(error?.message||'Aruvi could not read that pasted item.','error');}
      })();
    });
  }
  async function pasteShortcutTransaction(){
    try{
      // Must be called directly from a Paste button gesture. Safari does not
      // support clipboard-read permission queries; it may expose a native Paste
      // callout. If it rejects, offer an editable target for a real paste event.
      const clipboardPayload=await window.PocketWiseClipboardImport?.read();
      if(!clipboardPayload)throw new Error('Clipboard import is unavailable.');
      await processShortcutClipboardPayload(clipboardPayload);
    }catch(error){
      const manualPasteRequired=error?.name==='NotAllowedError'||error?.name==='SecurityError'||/Clipboard access is unavailable|No image or Aruvi transaction was found|Clipboard import is unavailable/i.test(String(error?.message||''));
      if(manualPasteRequired){showNativePasteFallback();return;}
      toast(error?.message||'Could not read the copied image or Shortcut transaction.','error');
    }
  }
  function showShortcutReturnNudge(){
    if(isAndroid)return;
    const el=document.createElement('div');el.className='toast shortcut-return-toast';
    el.innerHTML=`${icon('upload')}<span>Back from another app? Paste the copied image or Shortcut transaction.</span><button type="button" class="toast-action" id="resume-paste">Paste</button><button type="button" class="toast-action" id="resume-key">Enter key</button>`;
    $('#toast-region').append(el);
    // Dismiss the return banner with a left-to-right swipe, including touch screens.
    let startX=0,startY=0,tracking=false;
    el.addEventListener('pointerdown',event=>{if(event.target.closest('button'))return;startX=event.clientX;startY=event.clientY;tracking=true;el.setPointerCapture?.(event.pointerId);});
    el.addEventListener('pointerup',event=>{if(!tracking)return;tracking=false;const dx=event.clientX-startX,dy=event.clientY-startY;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2){el.classList.add('shortcut-toast-dismiss');setTimeout(()=>el.remove(),220);}});
    el.addEventListener('pointercancel',()=>{tracking=false;});
    setTimeout(()=>{if(el.isConnected){el.classList.add('shortcut-toast-dismiss');setTimeout(()=>el.remove(),220);}},9000);
  }
  let lastShortcutRouteSignature='';
  function handleShortcutQuickAdd(){
    // A direct payment-text import owns its URL. Do not also launch a Quick Add flow
    // when an external link accidentally carries both payload and shortcut parameters.
    const launchParams=new URLSearchParams(location.search);
    if(['transaction','payload','text'].some(key=>Boolean(launchParams.get(key))))return;
    // Check both the current query string and the fragment. Some iOS launch paths
    // update a reused page; lifecycle listeners below re-run this parser then.
    const fields=shortcutFieldsFromURL(location.href);
    if(!fields)return;
    const params=new URLSearchParams(location.search);
    const hashText=location.hash.startsWith('#')?location.hash.slice(1):location.hash;
    const hashParams=new URLSearchParams(hashText.includes('?')?hashText.split('?').pop():hashText);
    const mode=params.get('quickadd')||hashParams.get('quickadd')||'shortcut';
    const signature=location.href;
    if(signature===lastShortcutRouteSignature)return;
    lastShortcutRouteSignature=signature;
    // Strip personal financial details from the address bar as soon as they are read.
    try{history.replaceState(null,'',location.pathname);}catch{}
    setTimeout(()=>{
      try{
        if(mode==='debt'){showDebts();return;}
        if(mode==='shortcut'||mode==='capture'){
          const draft=createShortcutDraft(fields);
          if(!draft.amount){quickAddDraft=draft;renderQuickAddStep('amount');return;}
          showShortcutDraft(draft);
          return;
        }
        if(mode==='key'||mode==='input')showShortcutKeyPrompt();
        else if(mode==='1'||mode==='quick')quickAddStart();
        else transactionForm(null,['expense','income','transfer','refund'].includes(mode)?mode:'expense');
      }finally{
        // Suppress duplicate lifecycle events for this launch, but permit the exact same
        // URL to be opened again in a later run of the Shortcut.
        setTimeout(()=>{if(lastShortcutRouteSignature===signature)lastShortcutRouteSignature='';},500);
      }
    },220);
  }
  async function checkIncomingShortcutRoute(){
    if(!appReady)return;
    const shared=await handleIncomingPaymentShare();
    if(!shared)handleShortcutQuickAdd();
  }
  window.addEventListener('pageshow',()=>{void checkIncomingShortcutRoute();});
  window.addEventListener('focus',()=>{void checkIncomingShortcutRoute();});
  window.addEventListener('popstate',()=>{void checkIncomingShortcutRoute();});
  window.addEventListener('hashchange',()=>{void checkIncomingShortcutRoute();});
  window.addEventListener('error', event => { console.error('Aruvi runtime error:',event.error||event.message); });
  window.addEventListener('unhandledrejection', event => { console.error('Aruvi async error:',event.reason); toast(event.reason?.message||'A background action failed. Your existing records are unchanged.','error'); });
  const announcePocketwiseReady=()=>{try{window.dispatchEvent(new Event('pocketwise:app-ready'));}catch(_){}};
  initialise().then(async()=>{
    appReady=true;
    announcePocketwiseReady();
    const shared=await handleIncomingPaymentShare();
    if(!shared)handleShortcutQuickAdd();
  }).catch(error=>{
    console.error('Aruvi could not initialise.',error);
    window.dispatchEvent(new CustomEvent('pocketwise:app-init-error', { detail: { message: error?.message || 'Workspace initialization failed.' } }));
  });

  // Aruvi 2.0 import helpers: conservative parsing, preview-before-save and duplicate checks.
  // Screenshot OCR runs through the browser engines in the PWA; all extracted details remain review-before-save.
  function pwParsePaymentText(raw){
    const text=String(raw||'').replace(/\u00a0/g,' ').trim(); if(!text)return null;
    const lastOCR=window.PocketWiseLastReceiptOCR;
    const spatial=lastOCR&&String(lastOCR.sourceText||'').trim()===text?lastOCR.fields:null;
    if(/\b(OTP|one time password|verification code|offer|cashback|won a prize)\b/i.test(text) && !/\b(debited|credited|sent|received|paid|payment)\b/i.test(text))return {ignored:true,reason:'This looks like an OTP or promotional message, not a transaction.'};
    // Prefer an amount adjacent to transaction language over arbitrary currency figures
    // (promotions, balances and cashback banners often contain several rupee values).
    const contextualAmount=text.match(/\b(?:debited|credited|spent|received|paid|payment of|amount)\b(?:\s+(?:by|with|of|for))?\s*(?:₹|Rs\.?|INR\s*)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    const currencyAmount=text.match(/(?:₹|Rs\.?|INR\s*)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
    const spatialAmount=spatial?.amount&&Number(spatial.amount.confidence)>=.62?spatial.amount:null;
    const amountText=spatialAmount?.formatted||contextualAmount?.[1]||currencyAmount?.[1];
    if(!amountText)return {error:'No clear INR amount found. Check the pasted text.'};
    const amount=spatialAmount?Number(spatialAmount.value):Number(amountText.replace(/,/g,'')); if(!Number.isFinite(amount)||amount<=0)return {error:'The amount could not be read safely.'};
    const spatialUTR=String(spatial?.references?.utr||'').trim();
    const spatialTxn=String(spatial?.references?.transactionId||'').trim();
    const textUTR=(text.match(/\b(?:UTR|RRN|UPI\s*Ref(?:erence)?(?:\s*No)?|Bank\s*Reference)\s*[:#.-]?\s*([A-Z0-9/-]{6,40})/i)||[])[1]||'';
    const textTxn=(text.match(/\b(?:UPI\s*)?(?:Txn\s*ID|Transaction\s*ID|Transaction\s*Reference)\s*[:#.-]?\s*([A-Z0-9/-]{6,40})/i)||[])[1]||'';
    const utr=spatialUTR||textUTR;
    const transactionId=spatialTxn||textTxn;
    const genericReference=(text.match(/\b(?:Ref(?:erence)?(?:\s*No)?)\s*[:#.-]?\s*([A-Z0-9/-]{6,40})/i)||[])[1]||'';
    const ref=utr||transactionId||genericReference;
    const referenceType=utr?'UTR':transactionId?'Transaction ID':genericReference?'Reference':'';
    const upi=String(spatial?.upi?.id||((text.match(/[A-Z0-9._-]+@[A-Z0-9.-]+/i)||[])[0]||''));
    const acct=(text.match(/(?:A\/c|account|acct)\s*[*xX-]*\s*([0-9]{3,6})/i)||[])[1]||'';
    const monthNumbers={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
    let date=''; const isoDate=text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if(isoDate){const year=Number(isoDate[1]),month=Number(isoDate[2]),day=Number(isoDate[3]),check=new Date(year,month-1,day);if(year>=2000&&year<=2100&&check.getFullYear()===year&&check.getMonth()===month-1&&check.getDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
    const numericDate=text.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
    if(!date&&numericDate){let day=Number(numericDate[1]),month=Number(numericDate[2]),year=Number(numericDate[3]);if(year<100)year+=2000;if(month>12&&day<=12)[day,month]=[month,day];const check=new Date(year,month-1,day);if(year>=2000&&year<=2100&&check.getFullYear()===year&&check.getMonth()===month-1&&check.getDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
    if(!date){const namedDate=text.match(/\b(\d{1,2})[- /]?([A-Z]{3,9})[- ,/]?(\d{2,4})\b/i);if(namedDate){let day=Number(namedDate[1]),month=monthNumbers[namedDate[2].slice(0,3).toLowerCase()],year=Number(namedDate[3]);if(year<100)year+=2000;const check=new Date(year,(month||1)-1,day);if(month&&year>=2000&&year<=2100&&check.getFullYear()===year&&check.getMonth()===month-1&&check.getDate()===day)date=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}}
    if(!date)date=today();
    const incoming=/\b(credited|received|deposited|refund received|money received)\b/i.test(text);
    const outgoing=/\b(debited|sent|paid|payment to|purchase|withdrawn|transferred to)\b/i.test(text);
    const transfer=/\b(?:self transfer|own account|between (?:my|own) accounts|transferred between accounts)\b/i.test(text);
    const failed=/\b(?:failed|declined|unsuccessful|reversed|reversal)\b/i.test(text);
    const pending=/\b(?:pending|processing|initiated|awaiting confirmation)\b/i.test(text);
    const status=failed?'failed':pending?'pending':/\b(?:successful|success|completed|paid successfully|transaction successful)\b/i.test(text)?'successful':'unknown';
    /* Merchant/payee extraction is a C++/Wasm domain rule. JS only supplies OCR
       text and chooses the stronger normalized field for the existing review UI. */
    const wasmParty=window.PocketWiseWasm&&typeof window.PocketWiseWasm.extractMerchant==='function'
      ?window.PocketWiseWasm.extractMerchant(text):null;
    const spatialIncoming=spatial?.direction==='incoming'&&!outgoing;
    const cxxIncoming=wasmParty?.direction==='incoming'&&!outgoing;
    const cxxOutgoing=wasmParty?.direction==='outgoing';
    const parsedIncoming=wasmParty?.direction==='incoming'?true:wasmParty?.direction==='outgoing'?false:(incoming||spatialIncoming)&&!outgoing;
    const type=transfer?'transfer':parsedIncoming?'income':'expense';
    const spatialParty=spatial?.party&&Number(spatial.party.confidence)>=.62?String(spatial.party.name||'').trim():'';
    const partyCandidate=wasmParty&&Number(wasmParty.confidence)>=.55?wasmParty.name:spatialParty;
    const party=String(partyCandidate||'')
      .replace(/[A-Z0-9._-]+@[A-Z0-9.-]+/ig,' ')
      .replace(/\s+/g,' ')
      .replace(/^\s*(?:UPI\s*ID|VPA)\s*[:：-]?\s*/i,'')
      .replace(/^[-|·,:;\s]+|[-|·,:;\s]+$/g,'')
      .replace(/\s*(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{1,2})?.*$/i,'')
      .trim().slice(0,100);
    const partyConfidence=wasmParty&&party===String(wasmParty.name||'').trim()?Number(wasmParty.confidence||0):Number(spatial?.party?.confidence||0);
    const sourceApp=String(spatial?.sourceApp?.name||'');
    const upiProvider=String(spatial?.upi?.provider||'');
    const amountConfidence=spatialAmount?Number(spatialAmount.confidence):(contextualAmount?.[1]?0.72:currencyAmount?.[1]?0.64:0);
    const fieldConfidence=spatial?.fieldConfidence||{};
    const confidence=(amountText?0.40:0)+(ref?0.16:0)+(party?0.14:0)+(date?0.08:0)+(status!=='unknown'?0.06:0)+Math.min(.08,amountConfidence*.08)+Math.min(.04,partyConfidence*.04)+Math.min(.04,Number(fieldConfidence.upi||0)*.04);
    const reviewReasons=Array.isArray(spatial?.warnings)?spatial.warnings.slice(0,8):[];
    const needsReview=status==='unknown'||!party||!ref||!amountText||!!spatial?.needsReview||!!spatialAmount&&spatialAmount.confidence<.78;
    return {amount,type,date,reference:ref,referenceType,utr,transactionId,upi,upiProvider,sourceApp,accountSuffix:acct,party,status,confidence:Math.min(0.99,confidence),needsReview,reviewReasons,raw:text};
  }
  function pwHasDuplicate(parsed){
    const refs=[parsed.reference,parsed.utr,parsed.transactionId].filter((v,i,a)=>v&&a.indexOf(v)===i);
    if(state.transactions.some(tx=>{const note=String(tx.note||'');return refs.some(ref=>{const escaped=String(ref).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:RRN|UTR|Ref(?:erence)?|Transaction\\s*ID|Txn\\s*ID):?\\s*${escaped}`,'i').test(note);});}))return true;
    const merchant=String(parsed.party||parsed.upiProvider||'').trim();
    if(!merchant||!Number.isFinite(Number(parsed.amount))||!parsed.date)return false;
    const candidates=state.transactions.filter(tx=>Number(tx.amount)===Number(parsed.amount)&&String(tx.date||'')===String(parsed.date||'')&&merchantFromRecord(tx)).map(tx=>({amountMinor:toMinorUnits(tx.amount),dateKey:dateKeyFromISO(tx.date),merchant:merchantFromRecord(tx)}));
    return window.PocketWiseWasm.findDuplicate(candidates,{amountMinor:toMinorUnits(parsed.amount),dateKey:dateKeyFromISO(parsed.date),merchant})>=0;
  }
  function pwFriendlyOcrError(error){
    const raw=String(error&&error.message||error||'').trim();
    if(/unsafe-eval|trusted-types-eval|content security policy|blocked by csp/i.test(raw))
      return 'The on-device OCR engine could not start. Close and reopen Aruvi, then try again.';
    if(/failed to fetch|networkerror|load failed|importing a module script failed|offline|download failed|could not download/i.test(raw))
      return 'Connect to the internet once to load the OCR engine and its models, then try again. The screenshot stays on this device.';
    if(/out of memory|memory access out of bounds|allocation failed|wasm memory/i.test(raw))
      return 'This screenshot is too large for the available memory. Try a smaller or cropped screenshot.';
    if(!raw)return 'Aruvi could not read this screenshot. Try a clearer image.';
    return raw.length>220?'Aruvi could not read this screenshot. Try a clearer image.':raw;
  }

  function pwOpenShareInbox(){
    return new Promise((resolve,reject)=>{
      let request;
      try{request=indexedDB.open('PocketWiseShareInbox',1);}catch(error){reject(error);return;}
      request.onupgradeneeded=()=>{const database=request.result;if(!database.objectStoreNames.contains('shares'))database.createObjectStore('shares',{keyPath:'id'});};
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('Could not open the shared-image inbox.'));
      request.onblocked=()=>reject(new Error('The shared-image inbox is busy. Close other Aruvi tabs and retry.'));
    });
  }
  async function pwConsumeSharedPayment(id){
    const database=await pwOpenShareInbox();
    try{
      return await new Promise((resolve,reject)=>{
        let tx,record=null;
        try{
          tx=database.transaction('shares','readwrite');
          const store=tx.objectStore('shares');
          const get=store.get(id);
          get.onsuccess=()=>{record=get.result||null;if(record)store.delete(id);};
        }catch(error){reject(error);return;}
        tx.oncomplete=()=>resolve(record);
        tx.onerror=()=>reject(tx.error||new Error('Could not retrieve the shared screenshot.'));
        tx.onabort=()=>reject(tx.error||new Error('Retrieving the shared screenshot was cancelled.'));
      });
    }finally{try{database.close();}catch(_){}}
  }
  async function handleIncomingPaymentShare(){
    const current=new URL(location.href);
    const id=current.searchParams.get('pwShare');
    const routeError=current.searchParams.get('pwShareError');
    if(!id&&!routeError)return false;
    if(id&&!/^[a-f0-9]{32}$/i.test(id)){try{history.replaceState(null,'',current.pathname+current.hash);}catch(_){}toast('This shared payment link is invalid. Share the screenshot again.','error');return true;}
    try{history.replaceState(null,'',current.pathname+current.hash);}catch(_){ }
    if(routeError){toast(routeError==='storage'?'Aruvi could not keep the shared image on this device. Open Import Payment and choose it from your gallery.':'Aruvi could not receive that share.','error');pwShowImport();return true;}
    let record=null;
    try{record=await pwConsumeSharedPayment(id);}catch(error){console.warn('Aruvi share inbox read failed.',error);}
    if(!record){toast('The shared image is no longer available. Choose it from your gallery instead.','error');pwShowImport();return true;}
    if(record.fileBlob&&record.fileBlob.size>0){
      let file;
      try{file=new File([record.fileBlob],record.fileName||'shared-payment-image',{type:record.fileType||record.fileBlob.type||'image/jpeg',lastModified:record.fileLastModified||Date.now()});}
      catch(_){file=record.fileBlob;try{Object.defineProperty(file,'name',{value:record.fileName||'shared-payment-image'});}catch(__){}}
      await pwProcessPaymentImage(file,{shared:true});
      return true;
    }
    const sharedText=[record.title,record.text,record.url].filter(Boolean).join('\n').trim();
    if(sharedText){
      window.PocketWiseLastReceiptOCR=null;
      const parsed=pwParsePaymentText(sharedText);
      if(parsed&&!parsed.error&&!parsed.ignored){pwReviewImport(parsed);return true;}
    }
    const message=record.error==='too-large'?'The shared image is larger than 15 MB. Choose a smaller screenshot.':record.error==='unsupported-file'?'Aruvi received a file that is not a supported image.':'Android opened Aruvi but did not attach the screenshot. Choose the image from your gallery instead.';
    toast(message,'amber');
    pwShowImport();
    return true;
  }

  async function pwPrepareOcrImage(file){
    if(typeof createImageBitmap!=='function')return file;
    const bitmap=await createImageBitmap(file);
    try{
      const shortest=Math.min(bitmap.width,bitmap.height),longest=Math.max(bitmap.width,bitmap.height);
      const scale=Math.min(1.6,shortest<1050?1400/Math.max(1,shortest):1,4200/Math.max(1,longest));
      const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Image preprocessing is unavailable in this browser.');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);
      const image=ctx.getImageData(0,0,width,height),data=image.data;
      for(let i=0;i<data.length;i+=4){const gray=data[i]*0.299+data[i+1]*0.587+data[i+2]*0.114;const adjusted=Math.max(0,Math.min(255,(gray-128)*1.16+128));data[i]=data[i+1]=data[i+2]=adjusted;}
      ctx.putImageData(image,0,0);return canvas;
    }finally{bitmap.close?.();}
  }

  async function pwProcessPaymentImage(file,{shared=false,statusElement=null}={}){
    const imageName=String(file?.name||'').toLowerCase();
    const looksLikeImage=String(file?.type||'').toLowerCase().startsWith('image/')||/\.(?:jpe?g|png|webp|heic|heif)$/.test(imageName);
    if(!file||!looksLikeImage){toast('Choose a payment screenshot image.','error');return false;}
    if(file.size>15*1024*1024){toast('Choose an image smaller than 15 MB.','error');return false;}
    let progressElement=statusElement;
    if(shared){
      openModal('Reading shared payment',`<div class="modal-body pw-share-progress"><div class="pw-share-progress-mark">${icon('receipt')}</div><p id="pw-share-ocr-progress" class="pw-ocr-status is-loading" role="status" aria-live="polite"><span class="pw-ocr-loader" aria-hidden="true"></span><span>Reading image…</span></p><p class="fine-print">The image stays on this device. Only the extracted transaction fields will be shown.</p></div>`,'IMAGE IMPORT');
      progressElement=$('#pw-share-ocr-progress');
    }
    const setStatus=(message,loading=true)=>{if(!progressElement?.isConnected)return;if(loading){if(progressElement.classList.contains('is-loading'))return;progressElement.classList.add('is-loading');progressElement.innerHTML='<span class="pw-ocr-loader" aria-hidden="true"></span><span>Reading image…</span>';return;}progressElement.classList.remove('is-loading');progressElement.textContent=String(message||'');};
    try{
      setStatus('Preparing the screenshot locally…');
      const prepared=await pwPrepareOcrImage(file);
      let recognized='',engine='PaddleOCR.js PP-OCRv6',ocrItems=[];
      window.PocketWiseLastReceiptOCR=null;
      if(window.PocketWisePaddleWebOCR&&typeof window.PocketWisePaddleWebOCR.recognize==='function'){
        setStatus('Reading the payment screenshot…');
        const paddleResult=await window.PocketWisePaddleWebOCR.recognize(prepared,message=>{if(typeof message==='string')setStatus(message);});
        recognized=String(paddleResult?.text||'').trim();
        ocrItems=Array.isArray(paddleResult?.items)?paddleResult.items:[];
        if(recognized)engine=paddleResult.engine||engine;
      }else throw new Error('The local OCR engine is unavailable.');
      if(!recognized)throw new Error('No readable text found. Try a clearer screenshot.');
      if(window.PocketWiseRupeeOCR&&ocrItems.length){
        const repaired=window.PocketWiseRupeeOCR.recover({image:prepared,text:recognized,items:ocrItems});
        if(repaired&&repaired.detected){recognized=repaired.text;engine+=' + rupee-symbol recovery';}
      }
      const correctedLines=recognized.split(/\r?\n/);
      const parserItems=ocrItems.map((item,index)=>Object.assign({},item,{text:correctedLines[index]||item.text}));
      const spatialFields=window.PocketWiseReceiptParser&&typeof window.PocketWiseReceiptParser.extract==='function'
        ?window.PocketWiseReceiptParser.extract({text:recognized,items:parserItems}):null;
      // OCR output remains internal. It is never copied into a visible text area or review panel.
      window.PocketWiseLastReceiptOCR={sourceText:recognized,fields:spatialFields,engine};
      let parsed=pwParsePaymentText(recognized);
      if(parsed?.ignored){toast(parsed.reason,'amber');if(shared)pwShowImport(file,'This screenshot looks like an OTP or promotional message, not a payment receipt.');return false;}
      if(parsed?.error){
        if(/No clear INR amount|amount could not be read safely/i.test(parsed.error)){
          const refs=spatialFields?.references||{};
          const utr=String(refs.utr||'').trim(),transactionId=String(refs.transactionId||'').trim();
          parsed={amount:'',type:spatialFields?.direction==='incoming'?'income':'expense',date:today(),party:String(spatialFields?.party?.name||''),reference:utr||transactionId,referenceType:utr?'UTR':transactionId?'Transaction ID':'',utr,transactionId,upi:String(spatialFields?.upi?.id||''),upiProvider:String(spatialFields?.upi?.provider||''),sourceApp:String(spatialFields?.sourceApp?.name||''),accountSuffix:'',status:'unknown',confidence:0,needsReview:true,reviewReasons:['Amount was not confidently identified. Enter it manually.']};
        }else throw new Error(parsed.error);
      }
      setStatus('Payment details extracted.',false);
      pwReviewImport(parsed);
      return true;
    }catch(error){
      console.warn('Aruvi payment screenshot OCR failed.',error);
      const message=pwFriendlyOcrError(error);
      if(shared){closeModal();pwShowImport(file,message);}else setStatus(message,false);
      return false;
    }
  }

  function pwShowImport(initialFile=null,initialStatus='Your image stays on this device. Choose a screenshot to begin.'){
    window.PocketWiseLastReceiptOCR=null;
    openModal('Import a payment',`<div class="modal-body pw-import"><header class="pw-import-intro"><span class="section-kicker">PAYMENT IMPORT</span><h3>Choose a source</h3><p>Import a screenshot or bank statement. Check every detail before saving.</p></header><button type="button" class="secondary-button pw-statement-entry" id="pw-open-statement-import">${icon('file')}<span>Import a bank statement <small>PDF or CSV · review before saving</small></span></button><div class="pw-upload-zone"><input id="pw-payment-gallery" type="file" accept="image/*" hidden><input id="pw-payment-camera" type="file" accept="image/*" capture="environment" hidden><div class="pw-upload-actions"><button type="button" class="pw-upload-button" id="pw-choose-gallery"><span class="pw-upload-symbol">▧</span><strong>Choose from gallery</strong><small>Select a payment screenshot</small></button><button type="button" class="pw-upload-button" id="pw-choose-camera"><span class="pw-upload-symbol">＋</span><strong>Take a photo</strong><small>Use your camera</small></button></div><img id="pw-image-preview" alt="Selected payment screenshot preview" hidden><div id="pw-ocr-status" class="pw-ocr-status" role="status" aria-live="polite">${escapeHTML(initialStatus)}</div><button class="primary-button" id="pw-run-ocr" type="button" disabled>Read screenshot</button></div><div class="pw-import-sms"><button type="button" class="text-button" id="pw-toggle-sms">Paste bank SMS instead</button><div id="pw-sms-panel" hidden><label class="form-field"><span>BANK SMS</span><textarea id="pw-import-sms" rows="4" placeholder="Paste the payment SMS here…"></textarea></label><button class="primary-button" type="button" id="pw-parse-payment">Extract payment details</button></div></div><p class="fine-print">OCR runs on this device. Review the extracted amount and recipient before saving.</p><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button></div></div>`,'IMPORT · REVIEW BEFORE SAVING');
    const gallery=$('#pw-payment-gallery'),camera=$('#pw-payment-camera'),run=$('#pw-run-ocr'),preview=$('#pw-image-preview'),status=$('#pw-ocr-status');
    let selectedFile=null;
    $('#pw-choose-gallery')?.addEventListener('click',()=>gallery?.click());
    $('#pw-choose-camera')?.addEventListener('click',()=>camera?.click());
    const selectFile=file=>{
      if(!file)return;
      const type=String(file.type||'').toLowerCase();
      const name=String(file.name||'').toLowerCase();
      if(!type.startsWith('image/')&&!/\.(?:jpe?g|png|webp|heic|heif)$/.test(name)){toast('Choose an image file.','error');return;}
      if(file.size>15*1024*1024){toast('Choose an image smaller than 15 MB.','error');return;}
      selectedFile=file;window.PocketWiseLastReceiptOCR=null;
      try{if(preview.dataset.objectUrl)URL.revokeObjectURL(preview.dataset.objectUrl);const objectUrl=URL.createObjectURL(file);preview.dataset.objectUrl=objectUrl;preview.src=objectUrl;}catch(_){preview.removeAttribute('src');}
      preview.hidden=false;run.disabled=false;
      if(!initialFile)status.textContent=`Selected ${file.name||'payment screenshot'}. Tap “Read screenshot with OCR” to continue.`;
    };
    gallery?.addEventListener('change',()=>selectFile(gallery.files?.[0]));
    camera?.addEventListener('change',()=>selectFile(camera.files?.[0]));
    $('#pw-toggle-sms')?.addEventListener('click',()=>{const panel=$('#pw-sms-panel');panel.hidden=!panel.hidden;if(!panel.hidden)$('#pw-import-sms')?.focus({preventScroll:true});});
    $('#pw-run-ocr')?.addEventListener('click',async()=>{
      if(!selectedFile)return;
      run.disabled=true;
      try{await pwProcessPaymentImage(selectedFile,{statusElement:status});}
      finally{if(run.isConnected)run.disabled=false;}
    });
    if(initialFile)selectFile(initialFile);
  }

  function pwReviewImport(d){
    if(d.ignored){toast(d.reason,'amber');return;}
    if(pwHasDuplicate(d)){toast('This looks like a duplicate transaction. Nothing was added.','amber');return;}
    const type=d.type==='income'?'income':'expense';
    const merchant=String(d.party||d.upiProvider||'').trim().slice(0,100);
    const suggestion=merchantCategorySuggestion(merchant,type);
    let activities=state.activities.filter(a=>!a.archived&&(a.kind==='both'||a.kind===type||(type==='expense'&&a.kind==='refund')));
    activities.sort((a,b)=>{const ca=state.transactions.filter(t=>t.activityId===a.id).length,cb=state.transactions.filter(t=>t.activityId===b.id).length;return cb-ca||a.name.localeCompare(b.name);});
    if(!activities.length)activities=state.activities.filter(a=>!a.archived);
    const preferred=type==='income'?activities.find(a=>a.id==='salary'):activities.find(a=>a.id==='food');
    const selectedActivity=(suggestion&&activities.some(a=>a.id===suggestion.activityId)?suggestion.activityId:null)||preferred?.id||activities[0]?.id||'other';
    const categoryMarkup=activities.map(activity=>`<label class="pw-review-category"><input type="radio" name="activityId" value="${escapeHTML(activity.id)}" ${activity.id===selectedActivity?'checked':''}><span>${escapeHTML(activity.name)}</span></label>`).join('');
    const reference=String(d.reference||'').trim().slice(0,100);
    const meta={referenceType:d.referenceType||'Reference ID',upi:d.upi||'',sourceApp:d.sourceApp||'',accountSuffix:d.accountSuffix||''};
    const rememberedAccount=state.settings.lastQuickAddAccountId;
    const importAccountId=state.accounts.some(account=>account.id===rememberedAccount)?rememberedAccount:(state.accounts[0]?.id||'cash');
    currentEditId=null;currentTxType=type;
    openModal('Review payment',`<form id="transaction-form" class="modal-body pw-payment-review" data-type="${type}" data-import-review="true" data-import-meta="${escapeHTML(JSON.stringify(meta))}"><div class="pw-payment-review-fields"><div class="form-field full"><label for="tx-amount">AMOUNT · INR</label><input id="tx-amount" class="amount-input" name="amount" inputmode="decimal" enterkeyhint="done" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="₹ 0" value="${escapeHTML(d.amount==null?'':String(d.amount))}" aria-describedby="tx-amount-error" required autofocus><p class="field-error" id="tx-amount-error" role="alert" hidden></p></div></div><details class="form-disclosure payment-review-more" ${merchant||reference?'open':''}><summary><span class="disclosure-title">${icon('more')} Payment details</span><span class="disclosure-hint">Merchant &amp; reference</span></summary><div class="disclosure-content"><div class="form-field full"><label for="pw-review-merchant">MERCHANT NAME</label><input id="pw-review-merchant" name="merchantName" type="text" autocomplete="off" maxlength="100" placeholder="Merchant or recipient" value="${escapeHTML(merchant)}"></div><div class="form-field full"><label for="pw-review-reference">REFERENCE ID</label><input id="pw-review-reference" name="referenceId" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="100" placeholder="UTR / transaction reference" value="${escapeHTML(reference)}"></div></div></details><section class="pw-review-category-column" aria-labelledby="pw-review-category-title"><div class="pw-review-category-heading" id="pw-review-category-title">CHOOSE CATEGORY</div><div class="pw-review-category-list" role="radiogroup" aria-labelledby="pw-review-category-title">${categoryMarkup||'<p class="muted">No categories are available. Add a category in Settings before saving.</p>'}</div></section><input type="hidden" name="accountId" value="${escapeHTML(importAccountId)}"><input type="hidden" name="paymentMethod" value="UPI"><input type="hidden" name="date" value="${escapeHTML(d.date||today())}"><input type="hidden" name="repeat" value="none"><div class="form-actions"><button class="secondary-button" type="button" data-cancel-modal>Cancel</button><button class="primary-button" type="submit" ${activities.length?'':'disabled'}>Save transaction</button></div><p class="form-note">Check the details. Aruvi will not save until you confirm.</p></form>`,'PAYMENT · REVIEW BEFORE SAVING');
    $('#tx-amount')?.focus({preventScroll:true});
  }

  // Mobile numeric keyboards should expose a Done action. Pressing it dismisses the keyboard
  // without implicitly submitting/saving the form; the visible Save/Continue buttons remain the
  // only commit actions. Delegation also covers dynamically-rendered budget/goal forms.
  const numericKeyboardSelector='input[type="number"],input[inputmode="decimal"],input[inputmode="numeric"]';
  // Do not change desktop Enter-to-submit behavior. Include iPadOS, which may advertise itself as a Mac.
  const isMobileKeyboardPlatform=isAndroid||/iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  document.addEventListener('focusin',event=>{
    const field=event.target;
    if(field instanceof HTMLInputElement&&field.matches(numericKeyboardSelector))field.setAttribute('enterkeyhint','done');
  },true);
  document.addEventListener('keydown',event=>{
    const field=event.target;
    if(event.key!=='Enter'&&event.key!=='NumpadEnter')return;
    if(!isMobileKeyboardPlatform)return;
    if(!(field instanceof HTMLInputElement)||!field.matches(numericKeyboardSelector)||event.isComposing)return;
    event.preventDefault();
    event.stopPropagation();
    field.blur();
  },true);

  function pwPlatformSetup(){const android=isAndroid;document.documentElement.classList.toggle('pw-is-iphone',/iPhone|iPad|iPod/i.test(navigator.userAgent));document.documentElement.classList.toggle('pw-is-android',android);}
  pwPlatformSetup();
  // A left swipe reveals a separate Delete action. No record changes until that button is tapped.
  let txSwipeStart=null,txSwipeSuppressClickUntil=0;
  function closeTransactionSwipeActions(except=null){document.querySelectorAll('.transaction-swipe-shell.is-open').forEach(shell=>{if(shell!==except){const row=shell.querySelector('.transaction-row'),action=shell.querySelector('[data-tx-swipe-delete]');if(action===document.activeElement)row?.focus({preventScroll:true});shell.classList.remove('is-open');row?.setAttribute('aria-expanded','false');}});}
  document.addEventListener('pointerdown',event=>{const row=event.target.closest('.transaction-row');if(!row||event.button!==0||event.target.closest('button,a,input,select,textarea'))return;txSwipeStart={row,id:row.dataset.txOpen,x:event.clientX,y:event.clientY};},{passive:true});
  document.addEventListener('pointerup',event=>{const start=txSwipeStart;txSwipeStart=null;if(!start||!start.row.isConnected||!start.id)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.25){txSwipeSuppressClickUntil=Date.now()+500;const shell=start.row.closest('.transaction-swipe-shell');if(!shell)return;if(dx<0){closeTransactionSwipeActions(shell);shell.classList.add('is-open');start.row.setAttribute('aria-expanded','true');}else if(shell.classList.contains('is-open')){closeTransactionSwipeActions();}}},{passive:true});
  document.addEventListener('pointercancel',()=>{txSwipeStart=null;},{passive:true});
  document.addEventListener('click',event=>{if(Date.now()<txSwipeSuppressClickUntil&&event.target.closest('.transaction-swipe-shell')){txSwipeSuppressClickUntil=0;event.preventDefault();event.stopPropagation();}},true);
  // Payment import is intentionally accessed from the central + menu, not a persistent home overlay.
  document.addEventListener('click',e=>{if(e.target.closest('#pw-parse-payment')){const parsed=pwParsePaymentText($('#pw-import-sms')?.value||'');if(!parsed||parsed.error){toast(parsed?.error||'Paste a bank SMS first.','error');return;}pwReviewImport(parsed);} });
  // Dedicated bank-statement flow is isolated from the established payment screenshot/SMS parser.
  document.addEventListener('click',event=>{if(event.target.closest('#pw-open-statement-import'))window.PocketwiseStatementImporter?.open();});
  window.addEventListener('pw-open-statement-import',()=>window.PocketwiseStatementImporter?.open());
  window.addEventListener('pw-return-to-payment-import',()=>pwShowImport());

  // Narrow bridge: imports commit through Aruvi persistence + rollback, never direct localStorage writes.
  window.PocketwiseStatementBridge={
    getContext(){return {accounts:state.accounts.map(a=>({id:String(a.id),name:String(a.name||a.id)}))};},
    async commit(rows,accountId){
      if(!Array.isArray(rows)||!rows.length)return {ok:false,message:'No transactions were selected.'};
      if(rows.length>20000)return {ok:false,message:'This import exceeds the 20,000-row safety limit.'};
      if(!state.accounts.some(a=>a.id===accountId))return {ok:false,message:'Choose an account that still exists in Aruvi.'};
      const seen=new Set(state.transactions.map(t=>typeof t.statementImportFingerprint==='string'?t.statementImportFingerprint:'').filter(Boolean));
      const newTransactions=[];let duplicates=0;
      const duplicateRows=state.transactions.filter(t=>merchantFromRecord(t)).map(t=>({amountMinor:toMinorUnits(t.amount),dateKey:dateKeyFromISO(t.date),merchant:merchantFromRecord(t)}));
      for(const row of rows){
        const type=String(row?.type||''),date=String(row?.date||''),amount=Number(row?.amount),description=String(row?.description||'').trim(),fingerprint=String(row?.fingerprint||'');
        if(!['expense','income','refund'].includes(type)||!validStoredDate(date)||!date||!Number.isFinite(amount)||amount<=0||amount>100000000000||!description||!fingerprint||fingerprint.length>200)continue;
        const candidate={amountMinor:toMinorUnits(amount),dateKey:dateKeyFromISO(date),merchant:description};
        if(seen.has(fingerprint)||window.PocketWiseWasm.findDuplicate(duplicateRows,candidate)>=0){duplicates++;continue;}seen.add(fingerprint);duplicateRows.push(candidate);
        const reference=String(row.reference||'').trim().slice(0,100),suggestion=merchantCategorySuggestion(description,type);
        const activityId=type==='refund'?'refunds':suggestion?.activityId||'other';
        newTransactions.push({id:uid('tx'),type,amount:fromMinorUnits(toMinorUnits(amount)),activityId,accountId,date,merchantName:description,note:(`Bank statement · ${description}${reference?` · Ref ${reference}`:''}`).slice(0,500),paymentMethod:'Bank transfer',createdAt:new Date().toISOString(),statementImportFingerprint:fingerprint,importSource:'bank-statement',tags:[]});
      }
      if(!newTransactions.length)return {ok:true,imported:0,duplicates,message:duplicates?'Those statement rows were already imported.':'No valid transactions remained after validation.'};
      const snapshot=JSON.stringify(state);state.transactions.push(...newTransactions);
      if(!(await persistMutation(snapshot,'Could not save the statement import. Your previous records were restored.')))return {ok:false,message:'Aruvi could not save the import. Your previous records were restored.'};
      renderAll();closeModal();toast(`Imported ${newTransactions.length} statement transaction${newTransactions.length===1?'':'s'}${duplicates?`; ${duplicates} duplicate${duplicates===1?'':'s'} skipped`:''}.`);
      return {ok:true,imported:newTransactions.length,duplicates};
    }
  };
  // iOS may strip query parameters when launching an installed PWA. Clipboard paste remains the reliable fallback.
  (function(){try{const q=new URLSearchParams(location.search);const payload=q.get('transaction')||q.get('payload')||q.get('text');if(payload){history.replaceState({},'',location.pathname);setTimeout(()=>{pwShowImport();const panel=$('#pw-sms-panel'),el=$('#pw-import-sms');if(panel)panel.hidden=false;if(el){el.value=payload;el.focus({preventScroll:true});}},350);}}catch{}})();

})();
