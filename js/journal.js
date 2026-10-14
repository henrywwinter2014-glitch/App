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
  // What the market was doing when you entered, so a pattern can be read against the weather.
  const CONDITIONS = ['Rising market', 'Falling market', 'Choppy, going nowhere', 'Very volatile', 'Quiet', 'Around the results', 'Not sure'];
  // Whether you did what you said you would. The honest middle option matters more than either end.
  const FOLLOWED = ['Yes, stuck to the plan', 'Partly', 'No, I broke my own rules'];

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
    if (!FIELDS.some((f) => (e[f] || '').toString().trim()) && !NUM_FIELDS.some((f) => isFinite(e[f]) && e[f] > 0) && !e.img) delete j[k];
    return j[k] || null;
  }
  /*
   * The written fields. The numbers below them (planned entry, stop, target) are kept separately
   * because they are the half of a plan that can be checked afterwards: a free-text "I'll get out
   * if it turns" cannot be compared with what you actually did, and a number can.
   */
  const FIELDS = ['why', 'plan', 'risk', 'strategy', 'emotion', 'review', 'notes', 'conditions', 'followed'];
  const NUM_FIELDS = ['pEntry', 'pStop', 'pTarget'];
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
    /*
     * Rules broken. Counted from the stop you wrote down rather than from what you say about
     * yourself afterwards, because the two disagree more often than anyone would like.
     */
    const d = discipline();
    if (d && d.n >= 3 && d.broken >= 2) {
      out.push({
        title: 'Selling below your own stop',
        detail: `On ${d.broken} of the ${d.n} trades where you wrote a stop down, you sold below it. Holding past the stop on those cost ${Math.abs(d.costOfBreaking).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} more than the stop would have.`,
      });
    }
    if (d && d.said >= 3 && d.admitted >= 2) {
      out.push({ title: 'You keep saying you broke your rules', detail: `You marked ${d.admitted} of ${d.said} reviewed trades as breaking your own rules. Noticing it is the first half; the second half is writing the exit down before you buy, not after.` });
    }
    for (const c of CONDITIONS) {
      const g = rows.filter((p) => p.entry.conditions === c);
      if (g.length < 3) continue;
      const lost = g.filter((p) => p.pl < 0).length;
      if (lost / g.length >= 0.6) out.push({ title: `Trading in a ${c.toLowerCase()}`, detail: `${lost} of your ${g.length} trades entered in that market lost money.` });
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

  /*
   * Did the plan survive contact with the market?
   *
   * This compares the stop you wrote down before buying with the price you actually sold at. It is
   * the single most useful thing a journal can tell you, because the gap between the two is not a
   * market outcome, it is a decision -- and it is nearly always the same decision, made again:
   * holding past the stop and hoping. The numbers are only reported where you wrote a stop down,
   * and a sale above the stop is never counted against you.
   */
  function discipline() {
    const rows = positions().filter((p) => !p.open && p.entry && isFinite(p.entry.pStop) && p.entry.pStop > 0);
    if (!rows.length) return null;
    const broken = rows.filter((p) => isFinite(p.px) && p.px < p.entry.pStop * 0.995);
    const kept = rows.length - broken.length;
    const extraLoss = broken.reduce((a, p) => a + (p.entry.pStop - p.px) * p.qty, 0);
    const targets = rows.filter((p) => isFinite(p.entry.pTarget) && p.entry.pTarget > 0);
    const hitTarget = targets.filter((p) => isFinite(p.px) && p.px >= p.entry.pTarget * 0.995).length;
    return {
      n: rows.length, kept, broken: broken.length,
      // What holding past your own stop has cost, in money, across those trades.
      costOfBreaking: extraLoss,
      targets: targets.length, hitTarget,
      said: rows.filter((p) => p.entry.followed).length,
      admitted: rows.filter((p) => p.entry.followed === FOLLOWED[2]).length,
    };
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

  window.Journal = { STRATEGIES, EMOTIONS, RISKS, CONDITIONS, FOLLOWED, FIELDS, NUM_FIELDS, key, get, set, remove, positions, patterns, discipline, shrinkImage, all };
})();
