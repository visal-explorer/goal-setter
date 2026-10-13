/* =========================================================
   ui.js — reusable UI pieces: icons, modals, confirm dialog,
   toast (with Undo), tooltip, theme + accent, confetti, chime
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Inline SVG icons ---------- */
const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const ICONS = {
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  more: svg('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  play: svg('<path d="M7 4v16l13-8z"/>'),
  grip: svg('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>')
};

/* ---------- Modals ---------- */
function openModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('hidden');
  const first = m.querySelector('input:not([type=hidden]), textarea, select, .btn-danger, .btn-primary');
  if (first) setTimeout(() => first.focus(), 30);
}
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
const anyModalOpen = () => $$('.modal-backdrop').some(m => !m.classList.contains('hidden'));

let confirmAction = null;
/** Custom confirmation dialog — runs onConfirm only if the user clicks OK. */
function confirmDialog(title, text, onConfirm, okLabel = 'Delete') {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  $('#confirmOk').textContent = okLabel;
  confirmAction = onConfirm;
  openModal('confirmModal');
}

/* ---------- Toast (optionally with an action button such as Undo) ---------- */
let toastTimer;
function showToast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  t.classList.toggle('has-action', !!action);
  t.classList.remove('hidden');
  if (action) t.querySelector('button').onclick = () => { t.classList.add('hidden'); action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), action ? 6000 : 2400);
}

/* ---------- Tooltip (any element with data-tip) ---------- */
function initTooltips() {
  const tip = $('#tooltip');
  const show = e => {
    const el = e.target.closest('[data-tip]');
    if (!el) return tip.classList.add('hidden');
    tip.textContent = el.dataset.tip;
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(8, Math.min(x, innerWidth - w - 8));
    let y = r.top - h - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  };
  document.addEventListener('pointerover', show);
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') show(e); });
  document.addEventListener('scroll', () => tip.classList.add('hidden'), true);
}

/* ---------- Theme & accent ---------- */
function getThemePref() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
}
function resolvedTheme(pref = getThemePref()) {
  if (pref !== 'system') return pref;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.setAttribute('data-theme', theme);
  $('#themeIcon').textContent = theme === 'dark' ? '☀️' : '🌙';
}
function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch (e) {}
  applyTheme();
}
function toggleTheme() {
  setThemePref(resolvedTheme() === 'dark' ? 'light' : 'dark');
}
function applyAccent() {
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  $('meta[name="theme-color"]').setAttribute('content', state.settings.accent);
}

/* ---------- Confetti 🎉 (tiny canvas particle burst) ---------- */
function celebrate() {
  if (!state.settings.confetti || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  canvas.width = innerWidth; canvas.height = innerHeight;
  canvas.classList.remove('hidden');
  const colors = [state.settings.accent, '#f2b14a', '#3ccf8e', '#ff6b70', '#7c4dff', '#0e8fb0'];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 120,
    y: innerHeight * .35,
    vx: (Math.random() - .5) * 14,
    vy: Math.random() * -14 - 4,
    size: 5 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - .5) * .3,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));
  const start = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (now - start < 2800) requestAnimationFrame(frame);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.classList.add('hidden'); }
  })(start);
}

/* ---------- Soft chime (Web Audio, no sound files needed) ---------- */
function chime() {
  if (!state.settings.sound) return;
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1320].forEach((freq, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      const t0 = ac.currentTime + i * .18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(.18, t0 + .02);
      g.gain.exponentialRampToValueAtTime(.001, t0 + .6);
      o.connect(g).connect(ac.destination);
      o.start(t0); o.stop(t0 + .65);
    });
    setTimeout(() => ac.close(), 1500);
  } catch (e) { /* audio not available */ }
}

/** Fill a <select> with options (values array or {value: label} object). */
function fillSelect(el, values, allLabel) {
  const entries = Array.isArray(values) ? values.map(v => [v, v]) : Object.entries(values);
  el.innerHTML = (allLabel ? `<option value="">${esc(allLabel)}</option>` : '') +
    entries.map(([v, label]) => `<option value="${esc(v)}">${esc(label)}</option>`).join('');
}
