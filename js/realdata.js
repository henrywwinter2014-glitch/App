/*
 * Real market history.
 *
 * data/real-*.js hold daily bars for the Bullpen universe, reconstructed to the prices that
 * actually traded: the source is back-adjusted for splits and dividends, and both adjustments
 * have been reversed (verified to the cent against known closes such as Apple's $499.23 on
 * 28 August 2020 and its $125.06 the day after the 4-for-1 split).
 *
 * Bars are packed as base-64 varints, five per day: the change in close since the previous day,
 * then open, high and low as offsets from that close, then the change in volume. Prices are whole
 * units of 1/k (cents for most names, 1/10000 for sub-$5 ones) so nothing is stored as a float.
 */
(function () {
  'use strict';

  const A = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';
  const VAL = new Int16Array(128).fill(-1);
  for (let i = 0; i < A.length; i++) VAL[A.charCodeAt(i)] = i;

  // Reads the packed stream into five parallel arrays of whole numbers.
  function unpack(s, n) {
    const o = new Float64Array(n), h = new Float64Array(n), l = new Float64Array(n),
      c = new Float64Array(n), v = new Float64Array(n);
    let i = 0, k = 0, pc = 0, pv = 0;
    const next = () => {
      let acc = 0, mul = 1;
      for (;;) {
        const d = VAL[s.charCodeAt(i++)];
        acc += (d & 31) * mul;
        if (!(d & 32)) break;
        mul *= 32;
      }
      return acc % 2 ? -(acc + 1) / 2 : acc / 2;   // zigzag back to a signed value
    };
    while (k < n) {
      const C = pc + next();
      o[k] = C + next(); h[k] = C + next(); l[k] = C + next();
      c[k] = C;
      v[k] = pv + next();
      pc = C; pv = v[k];
      k++;
    }
    return { o, h, l, c, v };
  }

  const cache = {};
  let series = null, actions = null, cal = null;

  function init() {
    if (series) return true;
    const chunks = window.REAL_CHUNKS;
    if (!chunks || !window.REAL_INDEX) return false;
    series = {}; actions = {};
    for (const ch of chunks) {
      Object.assign(series, ch.series);
      Object.assign(actions, ch.actions || {});
    }
    cal = window.REAL_INDEX.cal;
    return true;
  }

  // Decoded bars for one ticker, in real units, with the calendar index its history starts at.
  function get(t) {
    if (!init() || !series[t]) return null;
    if (cache[t]) return cache[t];
    const m = series[t], raw = unpack(m.s, m.n), k = m.k;
    const out = { start: m.i, n: m.n, o: new Float64Array(m.n), h: new Float64Array(m.n), l: new Float64Array(m.n), c: new Float64Array(m.n), v: new Float64Array(m.n) };
    for (let j = 0; j < m.n; j++) {
      out.o[j] = raw.o[j] / k; out.h[j] = raw.h[j] / k;
      out.l[j] = raw.l[j] / k; out.c[j] = raw.c[j] / k;
      out.v[j] = raw.v[j] * 100;
    }
    cache[t] = out;
    return out;
  }

  // The bar for a calendar index, or null when the ticker was not trading that day.
  function barOn(t, ci) {
    const s = get(t);
    if (!s) return null;
    const j = ci - s.start;
    if (j < 0 || j >= s.n) return null;
    return { o: s.o[j], h: s.h[j], l: s.l[j], c: s.c[j], v: s.v[j] };
  }

  // Dividend per share and split ratio falling on a calendar index.
  function actionOn(t, ci) {
    if (!init()) return null;
    const ev = actions[t];
    if (!ev) return null;
    for (const e of ev) if (e[0] === ci) return { div: e[1] || 0, split: e[2] || 0 };
    return null;
  }

  window.RealData = {
    get ready() { return init(); },
    get calendar() { return init() ? cal : null; },
    get tickers() { return init() ? Object.keys(series) : []; },
    has: (t) => init() && !!series[t],
    indexOf: (d) => (init() ? cal.indexOf(d) : -1),
    dateAt: (i) => (init() ? cal[i] : null),
    get, barOn, actionOn,
  };
})();
