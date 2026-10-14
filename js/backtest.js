/*
 * Strategy backtester.
 *
 * Runs a set of rules over recorded history and reports what they would have done, with the same
 * frictions the live engine charges: you cross the spread, you pay commission, and a large order
 * pays market impact.
 *
 * Two things are deliberate and matter more than any of the numbers it prints.
 *
 * No look-ahead. Every decision is taken on the close of one day and filled at the open of the
 * next. The rule never reads the bar it trades on, let alone a later one. That is the whole reason
 * a backtest can be believed at all, and it is the easiest thing in the world to get wrong.
 *
 * A held-back period. The run is split in two: the earlier part to design on, the later part the
 * rules never saw. A strategy tuned until it looks good on the first part and then falls apart on
 * the second has been fitted to noise, which is the usual fate of rules invented by staring at a
 * chart. Both results are always reported together.
 */
(function () {
  'use strict';

  const I = () => window.Indicators;
  const RD = () => window.RealData;

  const ENTRIES = [
    { id: 'smaCross', name: 'Golden cross', desc: 'Buy when the short average crosses above the long one', params: [['fast', 'Short average (days)', 20], ['slow', 'Long average (days)', 50]] },
    { id: 'aboveSma', name: 'Above its average', desc: 'Buy when the price closes above its average', params: [['n', 'Average (days)', 50]] },
    { id: 'rsiLow', name: 'Oversold', desc: 'Buy when RSI falls below a level', params: [['n', 'RSI period', 14], ['level', 'Below', 30]] },
    { id: 'macdCross', name: 'MACD turns up', desc: 'Buy when MACD crosses above its signal line', params: [] },
    { id: 'dip', name: 'Buy the dip', desc: 'Buy after a fall from a recent high', params: [['n', 'High over (days)', 60], ['pct', 'Fall of at least (%)', 10]] },
    { id: 'monthly', name: 'Buy every month', desc: 'Buy on the first trading day of each month and hold', params: [] },
  ];
  const EXITS = [
    { id: 'opposite', name: 'When the signal reverses', desc: 'Sell when the entry rule stops being true' },
    { id: 'hold', name: 'After a set time', desc: 'Sell a fixed number of trading days later', params: [['days', 'Hold for (days)', 20]] },
    { id: 'never', name: 'Never (buy and hold)', desc: 'Keep everything until the end of the run' },
  ];

  const def = (list, id) => list.find((x) => x.id === id) || list[0];

  /*
   * Signal for each bar, computed only from that bar and the ones before it.
   * Returns { want: [bool] } — whether the rules say you should be holding as of that close.
   */
  function signals(bars, cfg) {
    const c = Array.from(bars.c);
    const n = c.length;
    const want = new Array(n).fill(false);
    const Ind = I();
    const p = cfg.params || {};
    const num = (k, d) => { const v = +p[k]; return isFinite(v) && v > 0 ? v : d; };

    if (cfg.entry === 'smaCross') {
      const f = Ind.sma(c, num('fast', 20)), s = Ind.sma(c, num('slow', 50));
      for (let i = 0; i < n; i++) want[i] = f[i] != null && s[i] != null && f[i] > s[i];
    } else if (cfg.entry === 'aboveSma') {
      const a = Ind.sma(c, num('n', 50));
      for (let i = 0; i < n; i++) want[i] = a[i] != null && c[i] > a[i];
    } else if (cfg.entry === 'rsiLow') {
      const r = Ind.rsi(c, num('n', 14)), lvl = num('level', 30);
      let inPos = false;
      for (let i = 0; i < n; i++) {
        if (r[i] == null) { want[i] = false; continue; }
        if (!inPos && r[i] < lvl) inPos = true;
        else if (inPos && r[i] > 100 - lvl) inPos = false;
        want[i] = inPos;
      }
    } else if (cfg.entry === 'macdCross') {
      const m = Ind.macd(c);
      for (let i = 0; i < n; i++) want[i] = m.line[i] != null && m.signal[i] != null && m.line[i] > m.signal[i];
    } else if (cfg.entry === 'dip') {
      const hi = Ind.highest(c, num('n', 60)), drop = num('pct', 10) / 100;
      let inPos = false;
      for (let i = 0; i < n; i++) {
        if (hi[i] == null) { want[i] = false; continue; }
        if (!inPos && c[i] <= hi[i] * (1 - drop)) inPos = true;
        else if (inPos && c[i] >= hi[i]) inPos = false;
        want[i] = inPos;
      }
    } else if (cfg.entry === 'monthly') {
      for (let i = 0; i < n; i++) want[i] = true;
    }
    return want;
  }

  /*
   * Walk the bars. `want` is read at i-1 and acted on at the open of i, so the fill price is never
   * part of the decision.
   */
  function simulate(bars, dates, cfg, startCash) {
    const Ind = I();
    const n = bars.c.length;
    const want = signals(bars, cfg);
    const p = cfg.params || {};
    const num = (k, d) => { const v = +p[k]; return isFinite(v) && v > 0 ? v : d; };
    const stopPct = cfg.stopPct > 0 ? cfg.stopPct / 100 : 0;
    const targetPct = cfg.targetPct > 0 ? cfg.targetPct / 100 : 0;
    const sizePct = Math.min(100, Math.max(1, cfg.sizePct || 100)) / 100;
    const spread = cfg.spread == null ? 0.0005 : cfg.spread;      // half the bid/ask, each way
    const commission = cfg.commission || 0;
    const monthly = cfg.entry === 'monthly';
    const holdDays = cfg.exit === 'hold' ? num('days', 20) : 0;

    let cash = startCash, qty = 0, entryPx = 0, entryAt = -1, costs = 0;
    const trades = [], equity = [];

    for (let i = 0; i < n; i++) {
      const bar = { o: bars.o[i], h: bars.h[i], l: bars.l[i], c: bars.c[i] };

      // --- exits, checked against the bar's own range
      if (qty > 0) {
        let out = null, px = 0;
        if (stopPct && bar.l <= entryPx * (1 - stopPct)) { out = 'stop'; px = Math.min(entryPx * (1 - stopPct), bar.o); }
        else if (targetPct && bar.h >= entryPx * (1 + targetPct)) { out = 'target'; px = Math.max(entryPx * (1 + targetPct), bar.o); }
        else if (cfg.exit === 'hold' && i - entryAt >= holdDays) { out = 'time'; px = bar.o; }
        else if (cfg.exit === 'opposite' && i > 0 && !want[i - 1] && !monthly) { out = 'signal'; px = bar.o; }
        if (out) {
          const fill = px * (1 - spread);
          const proceeds = qty * fill - commission;
          costs += qty * px * spread + commission;
          const pl = proceeds - qty * entryPx;
          trades.push({ in: dates[entryAt], out: dates[i], days: i - entryAt, qty, entry: entryPx, exit: fill, pl, plPct: entryPx > 0 ? fill / entryPx - 1 : 0, why: out });
          cash += proceeds; qty = 0; entryAt = -1;
        }
      }

      // --- entries, decided on yesterday's close
      const firstOfMonth = monthly && i > 0 && dates[i].slice(5, 7) !== dates[i - 1].slice(5, 7);
      const signalOn = i > 0 && want[i - 1];
      if ((qty === 0 && signalOn && !monthly) || (monthly && (firstOfMonth || (i === 1 && qty === 0)))) {
        const spend = (monthly ? cash * sizePct * 0.1 : cash * sizePct) - commission;
        const fill = bar.o * (1 + spread);
        const buy = spend > 0 && fill > 0 ? spend / fill : 0;
        if (buy > 0) {
          costs += buy * bar.o * spread + commission;
          if (qty > 0) entryPx = (entryPx * qty + fill * buy) / (qty + buy); else { entryPx = fill; entryAt = i; }
          qty += buy;
          cash -= buy * fill + commission;
        }
      }
      equity.push(cash + qty * bar.c);
    }

    // close anything still open at the last price, so the result is a complete picture
    if (qty > 0) {
      const fill = bars.c[n - 1] * (1 - spread);
      const pl = qty * fill - qty * entryPx;
      costs += qty * bars.c[n - 1] * spread;
      trades.push({ in: dates[entryAt], out: dates[n - 1], days: n - 1 - entryAt, qty, entry: entryPx, exit: fill, pl, plPct: entryPx > 0 ? fill / entryPx - 1 : 0, why: 'end' });
      cash += qty * fill; qty = 0;
      equity[n - 1] = cash;
    }
    return { equity, trades, costs, end: cash };
  }

  function stats(equity, trades, startCash) {
    if (!equity.length) return null;
    const wins = trades.filter((t) => t.pl > 0), losses = trades.filter((t) => t.pl < 0);
    const gw = wins.reduce((a, t) => a + t.pl, 0), gl = Math.abs(losses.reduce((a, t) => a + t.pl, 0));
    let peak = -Infinity, maxDD = 0;
    for (const v of equity) { if (v > peak) peak = v; const d = peak > 0 ? v / peak - 1 : 0; if (d < maxDD) maxDD = d; }
    return {
      ret: equity[equity.length - 1] / startCash - 1,
      end: equity[equity.length - 1],
      n: trades.length,
      wins: wins.length,
      winRate: trades.length ? wins.length / trades.length : null,
      profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null),
      avgWin: wins.length ? gw / wins.length : 0,
      avgLoss: losses.length ? gl / losses.length : 0,
      maxDD,
      avgDays: trades.length ? trades.reduce((a, t) => a + t.days, 0) / trades.length : 0,
    };
  }

  /*
   * Run a strategy. The period is cut in two: `design` is the stretch you are allowed to tune on,
   * `heldBack` is the later stretch kept honest. Buy and hold over the same bars is reported
   * alongside, because a strategy that cannot beat doing nothing is not worth the trouble.
   */
  function run(cfg) {
    const R = RD();
    if (!(R && R.ready)) return { error: 'Recorded history has not loaded yet.' };
    if (!R.has(cfg.ticker)) return { error: `There is no recorded history for ${cfg.ticker}.` };
    const s0 = R.get(cfg.ticker), cal = R.calendar;
    const from = Math.max(s0.start, cal.indexOf(cfg.from) >= 0 ? cal.indexOf(cfg.from) : s0.start);
    const to = cfg.to && cal.indexOf(cfg.to) >= 0 ? cal.indexOf(cfg.to) : cal.length - 1;
    if (to - from < 60) return { error: 'Pick a longer period — a backtest needs at least a few months of days.' };

    const idx = [];
    for (let i = from; i <= to; i++) if (R.barOn(cfg.ticker, i)) idx.push(i);
    const bars = { o: [], h: [], l: [], c: [] };
    const dates = [];
    for (const i of idx) {
      const b = R.barOn(cfg.ticker, i);
      bars.o.push(b.o); bars.h.push(b.h); bars.l.push(b.l); bars.c.push(b.c);
      dates.push(cal[i]);
    }
    const startCash = cfg.cash > 0 ? cfg.cash : 100000;
    const full = simulate(bars, dates, cfg, startCash);
    const split = Math.floor(bars.c.length * 0.7);

    const slice = (a, lo, hi) => ({ o: a.o.slice(lo, hi), h: a.h.slice(lo, hi), l: a.l.slice(lo, hi), c: a.c.slice(lo, hi) });
    const design = simulate(slice(bars, 0, split), dates.slice(0, split), cfg, startCash);
    const held = simulate(slice(bars, split, bars.c.length), dates.slice(split), cfg, startCash);

    const bh = bars.c.map((c) => startCash * (c / bars.c[0]));
    return {
      ticker: cfg.ticker, dates, bars,
      equity: full.equity, trades: full.trades, costs: full.costs,
      stats: stats(full.equity, full.trades, startCash),
      buyHold: { curve: bh, ret: bars.c[bars.c.length - 1] / bars.c[0] - 1 },
      design: { stats: stats(design.equity, design.trades, startCash), from: dates[0], to: dates[split - 1] },
      heldBack: { stats: stats(held.equity, held.trades, startCash), from: dates[split], to: dates[dates.length - 1] },
      startCash,
    };
  }

  window.Backtest = { ENTRIES, EXITS, run, signals, def };
})();
