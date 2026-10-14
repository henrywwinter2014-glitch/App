/*
 * Performance analytics.
 *
 * Everything here is derived from what actually happened: the transaction log, the dividend log
 * and the net-worth series. Nothing is estimated or stubbed. If you have made no trades, the
 * numbers are empty rather than invented.
 *
 * A "trade" is one closed round trip. Positions are tracked from flat to flat, so buying twice
 * and selling once is a part-close of a single position, and the engine's realised figure for
 * that sale is the trade's profit. Dividends are reported separately rather than folded into
 * trade profit, because they are income from holding rather than a result of the round trip.
 */
(function () {
  'use strict';

  const E = () => window.Engine;
  const S = () => window.Engine.S;
  const days = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));

  /* ---------- closed round trips ---------- */
  function trades() {
    const s = S();
    if (!s || !s.tx) return [];
    const log = s.tx.slice().reverse();              // the log is newest first
    const open = {};
    const out = [];
    for (const x of log) {
      if (!x.t) continue;
      const p = open[x.t] || (open[x.t] = { qty: 0, opened: null, fee: 0, slip: 0 });
      if (x.kind === 'BUY' || x.kind === 'DRIP') {
        if (p.qty < 1e-9) { p.opened = x.d; p.fee = 0; p.slip = 0; }
        p.qty += x.qty;
        p.fee += x.fee || 0;
        p.slip += x.slip || 0;
      } else if (x.kind === 'SPLIT') {
        p.qty = x.qty;                               // the log records the post-split total
      } else if (x.kind === 'SELL') {
        const part = p.qty > 1e-9 ? Math.min(1, x.qty / p.qty) : 1;
        out.push({
          t: x.t,
          opened: p.opened || x.d,
          closed: x.d,
          held: days(p.opened || x.d, x.d),
          qty: x.qty,
          px: x.px,
          pl: x.pl || 0,
          plPct: x.plPct == null ? null : x.plPct,
          fee: (x.fee || 0) + p.fee * part,
          slip: (x.slip || 0) + p.slip * part,
          note: x.note || null,
        });
        p.qty -= x.qty;
        p.fee *= 1 - part;
        p.slip *= 1 - part;
        if (p.qty < 1e-9) { p.qty = 0; p.opened = null; }
      }
    }
    return out;
  }

  /* ---------- headline numbers ---------- */
  function summary() {
    const s = S();
    const tr = trades();
    const wins = tr.filter((x) => x.pl > 0);
    const losses = tr.filter((x) => x.pl < 0);
    const grossWin = wins.reduce((a, x) => a + x.pl, 0);
    const grossLoss = Math.abs(losses.reduce((a, x) => a + x.pl, 0));
    const pl = tr.reduce((a, x) => a + x.pl, 0);
    const divs = (s.divLog || []).reduce((a, d) => a + d.amt, 0);
    const slip = (s.tx || []).reduce((a, x) => a + (x.slip || 0), 0);
    const pcts = tr.map((x) => x.plPct).filter((v) => v != null);
    return {
      n: tr.length,
      open: Object.keys(s.holdings || {}).length,
      wins: wins.length,
      losses: losses.length,
      winRate: tr.length ? wins.length / tr.length : null,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      avgWinPct: wins.length ? wins.reduce((a, x) => a + (x.plPct || 0), 0) / wins.length : 0,
      avgLossPct: losses.length ? losses.reduce((a, x) => a + (x.plPct || 0), 0) / losses.length : 0,
      // How many pounds of profit for each pound of loss. Above 1 means the wins outweigh.
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
      expectancy: tr.length ? pl / tr.length : 0,
      avgPct: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      best: tr.length ? tr.reduce((a, x) => (x.pl > a.pl ? x : a)) : null,
      worst: tr.length ? tr.reduce((a, x) => (x.pl < a.pl ? x : a)) : null,
      avgHeld: tr.length ? tr.reduce((a, x) => a + x.held, 0) / tr.length : 0,
      realised: pl,
      dividends: divs,
      fees: s.feesPaid || 0,
      slippage: slip,
      tax: s.taxPaid || 0,
      unrealised: unrealised(),
    };
  }

  function unrealised() {
    const s = S();
    let v = 0;
    for (const t in s.holdings || {}) v += E().holdingValue(t) - s.holdings[t].cost;
    return v;
  }

  /* ---------- equity curve, drawdown and the benchmark ---------- */
  // Both lines are indexed to 0% at the start so one axis carries them honestly.
  function equity() {
    const s = S();
    const nw = s.nw || [];
    if (nw.length < 2) return null;
    const v0 = nw[0].v || 1, b0 = nw[0].b || 1;
    const you = nw.map((p) => p.v / v0 - 1);
    const bench = nw.map((p) => (p.b ? p.b / b0 - 1 : 0));
    let peak = -Infinity, maxDD = 0, ddAt = null, peakAt = null, curPeak = null;
    const dd = nw.map((p) => {
      if (p.v > peak) { peak = p.v; curPeak = p.d; }
      const d = peak > 0 ? p.v / peak - 1 : 0;
      if (d < maxDD) { maxDD = d; ddAt = p.d; peakAt = curPeak; }
      return d;
    });
    return {
      dates: nw.map((p) => p.d), you, bench, dd,
      maxDD, ddAt, peakAt,
      ret: you[you.length - 1],
      benchRet: bench[bench.length - 1],
      current: dd[dd.length - 1],
    };
  }

  /* ---------- breakdowns ---------- */
  function group(key) {
    const by = {};
    for (const x of trades()) {
      const k = key(x);
      const g = by[k] || (by[k] = { k, n: 0, pl: 0, wins: 0 });
      g.n++; g.pl += x.pl; if (x.pl > 0) g.wins++;
    }
    return Object.values(by).sort((a, b) => b.pl - a.pl);
  }
  const byTicker = () => group((x) => x.t);
  const byMonth = () => group((x) => x.closed.slice(0, 7)).sort((a, b) => (a.k < b.k ? -1 : 1));

  /*
   * Is the result broad or down to one or two lucky trades? Reports what share of the gross
   * profit the single best trade and the best three account for.
   */
  function concentration() {
    const tr = trades().filter((x) => x.pl > 0).sort((a, b) => b.pl - a.pl);
    const gross = tr.reduce((a, x) => a + x.pl, 0);
    if (!gross || tr.length < 2) return null;
    const share = (n) => tr.slice(0, n).reduce((a, x) => a + x.pl, 0) / gross;
    return { n: tr.length, top1: share(1), top3: share(3), gross };
  }

  /* ---------- risk ---------- */
  /*
   * Position sizing from the loss you are willing to take. Risking `riskPct` of the account
   * with a stop `entry - stop` away gives the share count; the warnings cover the cases where
   * that size breaks another limit. A stop is not a guarantee: a gap can fill you well below it.
   */
  function positionSize(opts) {
    const s = S();
    const equityNow = E().netWorth();
    const entry = +opts.entry, stop = +opts.stop, target = +opts.target;
    const riskPct = +opts.riskPct;
    const risk = equityNow * (riskPct / 100);
    const perShare = entry - stop;
    const out = { equity: equityNow, risk, perShare, entry, stop, target, warnings: [] };
    if (!(entry > 0)) { out.error = 'Enter the price you would buy at.'; return out; }
    if (!(stop > 0)) { out.error = 'Enter the price you would sell at if you were wrong.'; return out; }
    if (perShare <= 0) { out.error = 'Your stop must be below your entry for a buy.'; return out; }
    out.shares = risk / perShare;
    out.cost = out.shares * entry;
    out.stopLossPct = perShare / entry;
    if (target > 0) {
      out.reward = (target - entry) * out.shares;
      out.rr = (target - entry) / perShare;
    }
    const posPct = equityNow > 0 ? out.cost / equityNow : 0;
    out.posPct = posPct;
    const maxPos = (s.settings.maxPosPct || 20) / 100;
    if (out.cost > E().availableCash()) out.warnings.push(`That position costs more than your free cash.`);
    if (posPct > maxPos) out.warnings.push(`That is ${(posPct * 100).toFixed(0)}% of your account, above your ${(maxPos * 100).toFixed(0)}% limit for one position.`);
    if (out.rr != null && out.rr < 1) out.warnings.push(`You are risking more than you stand to make (${out.rr.toFixed(2)} to 1).`);
    return out;
  }

  // How much of the account sits in one place, and how today has gone against the limits set.
  function exposure() {
    const s = S();
    const eq = E().netWorth();
    const rows = [];
    for (const t in s.holdings || {}) {
      const v = E().holdingValue(t);
      rows.push({ t, v, pct: eq > 0 ? v / eq : 0, sector: (E().BY[t] || {}).sector || '—' });
    }
    rows.sort((a, b) => b.v - a.v);
    const maxPos = (s.settings.maxPosPct || 20) / 100;
    const invested = rows.reduce((a, r) => a + r.v, 0);
    const bySector = {};
    for (const r of rows) bySector[r.sector] = (bySector[r.sector] || 0) + r.pct;
    const topSector = Object.entries(bySector).sort((a, b) => b[1] - a[1])[0] || null;
    return {
      rows, invested, equity: eq,
      cashPct: eq > 0 ? s.cash / eq : 1,
      investedPct: eq > 0 ? invested / eq : 0,
      over: rows.filter((r) => r.pct > maxPos),
      maxPos,
      topSector: topSector ? { sector: topSector[0], pct: topSector[1] } : null,
      dayPL: dayPL(),
      dayLimit: (s.settings.dayLossPct || 3) / 100,
    };
  }

  // Change in net worth so far today, against the daily loss limit.
  function dayPL() {
    const s = S();
    const nw = s.nw || [];
    if (nw.length < 2) return { abs: 0, pct: 0 };
    const now = E().netWorth(), prev = nw[nw.length - 2].v;
    return { abs: now - prev, pct: prev > 0 ? now / prev - 1 : 0 };
  }

  window.Stats = { trades, summary, equity, byTicker, byMonth, concentration, positionSize, exposure, dayPL };
})();
