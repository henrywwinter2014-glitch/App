/*
 * First-run setup: appearance, starting money and whether to take the tour.
 * Shown once per browser. Uses window.App (from app.js) and window.Tour (from tour.js).
 */
(function () {
  'use strict';

  const DONE_KEY = 'bullpen-setup-done';
  const $ = (id) => document.getElementById(id);
  const PRESETS = [1000, 10000, 100000, 1000000];

  const choice = { theme: 'system', cash: 100000, keep: false, tour: true };
  let freshAtOpen = true;

  function fmt(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

  function isDone() {
    try { return localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return true; }
  }

  function render() {
    const fresh = window.App.isFresh();
    document.querySelectorAll('[data-setup-theme]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setupTheme === choice.theme)));
    const custom = !choice.keep && !PRESETS.includes(choice.cash);
    let cashHtml = fresh ? '' : `<button type="button" class="opt" data-setup-cash="keep" aria-pressed="${choice.keep}"><b>Keep my game</b><span>${fmt(window.App.netWorth())} now</span></button>`;
    cashHtml += PRESETS.map((v) => `<button type="button" class="opt" data-setup-cash="${v}" aria-pressed="${!choice.keep && choice.cash === v}"><b>${fmt(v)}</b><span>${{ 1000: 'Start small', 10000: 'A real-life amount', 100000: 'Recommended', 1000000: 'Go big' }[v]}</span></button>`).join('');
    $('setupCash').innerHTML = cashHtml;
    $('setupCustom').value = custom ? choice.cash : $('setupCustom').value;
    $('setupCustomWrap').classList.toggle('on', custom);
    document.querySelectorAll('[data-setup-tour]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.setupTour === 'yes') === choice.tour)));
    $('setupNote').textContent = choice.keep ? 'Your current game carries on as it is.'
      : !fresh ? `This starts a new game with ${fmt(choice.cash)} and replaces your current one.` : '';
    $('setupGo').textContent = choice.tour ? 'Start and show me around' : 'Start';
  }

  function open() {
    choice.theme = window.App.getTheme();
    freshAtOpen = window.App.isFresh();
    choice.keep = !freshAtOpen;
    choice.cash = 100000;
    $('setup').hidden = false;
    document.body.style.overflow = 'hidden';
    render();
    setTimeout(() => $('setupGo').focus({ preventScroll: true }), 50);
  }

  function finish() {
    // A saved game arrived from the player's account while this screen was open: don't wipe it unasked.
    if (freshAtOpen && !window.App.isFresh()) {
      freshAtOpen = false; choice.keep = true; render();
      $('setupNote').textContent = 'We found your saved game on your account. Keep it, or pick an amount to start over.';
      return;
    }
    const custom = parseFloat($('setupCustom').value);
    if (!choice.keep && $('setupCustomWrap').classList.contains('on')) {
      if (!(custom >= 100 && custom <= 1e9)) { $('setupNote').textContent = 'Enter an amount between $100 and $1,000,000,000.'; $('setupCustom').focus(); return; }
      choice.cash = custom;
    }
    if (!choice.keep) window.App.newGame(choice.cash);
    try {
      localStorage.setItem(DONE_KEY, '1');
      if (!choice.tour) localStorage.setItem('bullpen-tour-done', '1');
    } catch (e) { /* storage blocked */ }
    $('setup').hidden = true;
    document.body.style.overflow = '';
    if (choice.tour && window.Tour) setTimeout(() => window.Tour.start(), 150);
  }

  function bind() {
    $('setup').addEventListener('click', (e) => {
      const th = e.target.closest('[data-setup-theme]');
      if (th) { choice.theme = th.dataset.setupTheme; window.App.setTheme(choice.theme); render(); return; }
      const c = e.target.closest('[data-setup-cash]');
      if (c) {
        if (c.dataset.setupCash === 'keep') choice.keep = true;
        else { choice.keep = false; choice.cash = +c.dataset.setupCash; $('setupCustom').value = ''; }
        render(); return;
      }
      const t = e.target.closest('[data-setup-tour]');
      if (t) { choice.tour = t.dataset.setupTour === 'yes'; render(); }
    });
    $('setupCustom').addEventListener('input', () => {
      const v = parseFloat($('setupCustom').value);
      choice.keep = false;
      if (v > 0) choice.cash = v;
      $('setupCustomWrap').classList.add('on');
      document.querySelectorAll('[data-setup-cash]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      $('setupNote').textContent = window.App.isFresh() ? '' : 'This starts a new game and replaces your current one.';
    });
    $('setupForm').addEventListener('submit', (e) => { e.preventDefault(); finish(); });
  }

  bind();
  if (!isDone()) setTimeout(open, 300);
  window.Setup = { open, isOpen: () => !$('setup').hidden };
})();
