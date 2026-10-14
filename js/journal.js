/*
 * Trading journal.
 *
 * Every position opens an entry automatically, keyed by the product and the day you opened it, so
 * the same entry follows a position from the plan you wrote before buying through to the review you
 * write after selling. The numbers on an entry always come from the recorded trade; only the
 * thinking is yours to type.
 *
 * Entries live in the saved game (Engine.S.journal), so they survive a reload and sync with it.
 */
(function () {
  'use strict';

  const E = () => window.Engine;
  const S = () => window.Engine.S;

  const STRATEGIES = ['Dividend income', 'Long-term hold', 'Value', 'Growth', 'Momentum', 'Breakout', 'Mean reversion', 'Earnings', 'Index tracking', 'Speculation'];
  const EMOTIONS = ['Calm', 'Confident', 'Unsure', 'Rushed', 'Greedy', 'Fearful', 'Bored', 'Getting even'];
  const RISKS = ['Low', 'Medium', 'High'];

  const key = (t, opened) => `${t}@${opened}`;
  function all() {
    const s = S();
    if (!s.journal) s.journal = {};
    return s.journal;
  }
  function get(k) { return all()[k] || null; }
  function set(k, patch) {
    const j = all();
    const e = j[k] || (j[k] = { k, created: S().date });
    Object.assign(e, patch, { edited: S().date });
    // An entry with nothing written in it is not worth keeping.
    if (!FIELDS.some((f) => (e[f] || '').toString().trim()) && !e.img) delete j[k];
    return j[k] || null;
  }
  const FIELDS = ['why', 'plan', 'risk', 'strategy', 'emotion', 'review', 'notes'];
  function remove(k) { delete all()[k]; }

  /*
   * Every position you have held, open or closed, newest first. Open ones carry their live
   * profit; closed ones carry the realised figure from the trade log.
   */
  function positions() {
    const s = S();
    const out = [];
    for (const tr of window.Stats.trades()) {
      out.push({
        k: key(tr.t, tr.opened), t: tr.t, opened: tr.opened, closed: tr.closed,
        open: false, qty: tr.qty, px: tr.px, held: tr.held,
        pl: tr.pl, plPct: tr.plPct, entry: get(key(tr.t, tr.opened)),
      });
    }
    for (const t in s.holdings || {}) {
      const h = s.holdings[t];
      const v = E().holdingValue(t);
      out.push({
        k: key(t, h.opened), t, opened: h.opened, closed: null,
        open: true, qty: h.qty, px: E().price(t),
        held: Math.max(0, Math.round((new Date(s.date) - new Date(h.opened)) / 86400000)),
        pl: v - h.cost, plPct: h.cost > 0 ? v / h.cost - 1 : null, entry: get(key(t, h.opened)),
      });
    }
    return out.sort((a, b) => (a.closed || a.opened) < (b.closed || b.opened) ? 1 : -1);
  }

  /*
   * Mistakes you keep making. Only patterns with enough entries behind them to mean anything are
   * reported, and each one says what it is counting so you can judge it yourself.
   */
  function patterns() {
    const rows = positions().filter((p) => !p.open && p.entry);
    const out = [];
    if (rows.length < 3) return out;

    const noPlan = rows.filter((p) => !(p.entry.plan || '').trim());
    if (noPlan.length >= 3) {
      const lost = noPlan.filter((p) => p.pl < 0).length;
      out.push({
        title: 'Trades you entered without an exit plan',
        detail: `${noPlan.length} of your ${rows.length} reviewed trades had no planned exit. ${lost} of those ${lost === 1 ? 'lost' : 'lost'} money.`,
      });
    }
    for (const em of EMOTIONS) {
      const g = rows.filter((p) => p.entry.emotion === em);
      if (g.length < 3) continue;
      const lost = g.filter((p) => p.pl < 0).length;
      if (lost / g.length >= 0.6) {
        out.push({ title: `Trading while ${em.toLowerCase()}`, detail: `${lost} of your ${g.length} trades entered feeling ${em.toLowerCase()} lost money.` });
      }
    }
    const byStrat = {};
    for (const p of rows) {
      const k = (p.entry.strategy || '').trim();
      if (!k) continue;
      (byStrat[k] = byStrat[k] || []).push(p);
    }
    for (const k in byStrat) {
      const g = byStrat[k];
      if (g.length < 3) continue;
      const pl = g.reduce((a, p) => a + p.pl, 0);
      const won = g.filter((p) => p.pl > 0).length;
      out.push({
        title: `${k}: ${pl >= 0 ? 'working' : 'not working so far'}`,
        detail: `${g.length} trades, ${won} profitable, ${pl >= 0 ? 'up' : 'down'} ${Math.abs(pl).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in total.`,
        good: pl >= 0,
      });
    }
    return out;
  }

  // Shrink an attached picture so a journal full of them cannot fill the browser's storage.
  function shrinkImage(file, cb) {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 480;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => cb(null);
      img.src = fr.result;
    };
    fr.onerror = () => cb(null);
    fr.readAsDataURL(file);
  }

  window.Journal = { STRATEGIES, EMOTIONS, RISKS, FIELDS, key, get, set, remove, positions, patterns, shrinkImage, all };
})();
