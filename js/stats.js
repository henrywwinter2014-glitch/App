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
      const p = open[x.t] || (open[x.t] = { qty: 0, opened: null, fee: 0, slip: 0, cost: 0 });
      if (x.kind === 'BUY' || x.kind === 'DRIP') {
        if (p.qty < 1e-9) { p.opened = x.d; p.fee = 0; p.slip = 0; p.cost = 0; }
        p.qty += x.qty;
        p.fee += x.fee || 0;
        p.slip += x.slip || 0;
        // Running cost in the security's own currency, so the average price you paid can be
        // reported in the same units as the price you sold at. Fees are counted separately --
        // mixing them in would make "bought at" a number that never appeared on any screen.
        p.cost += (x.px || 0) * (x.qty || 0);
      } else if (x.kind === 'SPLIT') {
        // A split changes the share count without changing what the position cost, so the
        // average price per share has to move with it or the next sale reports a fictional gain.
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
          // What you paid per share, on average, in the same currency as px above.
          entry: p.qty > 1e-9 ? p.cost / p.qty : null,
          cur: x.cur || 'USD',
          pl: x.pl || 0,
          plPct: x.plPct == null ? null : x.plPct,
          fee: (x.fee || 0) + p.fee * part,
          slip: (x.slip || 0) + p.slip * part,
          note: x.note || null,
        });
        p.qty -= x.qty;
        p.fee *= 1 - part;
        p.slip *= 1 - part;
        p.cost *= 1 - part;
        if (p.qty < 1e-9) { p.qty = 0; p.opened = null; p.cost = 0; }
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
      streaks: streaks(tr),
      // Which market these numbers came out of. Results from the three are never pooled: a run on
      // invented prices and a run on real ones are not comparable, and averaging them would
      // produce a number that describes neither.
      mode: s.mode || 'sim',
      // Money paid in or taken out since the start, so a return can be stated net of it.
      contributed: (s.tx || []).reduce((a, x) => a + (x.kind === 'DEPOSIT' || x.kind === 'WITHDRAW' ? x.amt : 0), 0),
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
      portfolioRisk: portfolioRisk(),
      drawdown: drawdown(),
      coolOff: coolOff(),
    };
  }

  /*
   * Risk across the whole portfolio, not one trade at a time.
   *
   * Five positions each risking "only 1%" are not five separate 1% risks if they are the same
   * bet in five costumes -- five tech stocks fall together, and the account finds out it was
   * risking 5% all along. There is no correlation matrix here and inventing one would be worse
   * than useless, so this reports the plain arithmetic instead: what is at risk to the stops you
   * have actually placed, and how much of the account sits in its largest sector.
   */
  function portfolioRisk() {
    const s = S(), eq = E().netWorth();
    let atRisk = 0, covered = 0, uncovered = 0;
    for (const t in s.holdings || {}) {
      const h = s.holdings[t];
      if (!h || !(h.qty > 0)) continue;
      // The highest resting sell-stop for this holding is the floor you have actually set.
      const stops = (s.orders || []).filter((o) => o.t === t && o.side === 'sell' && (o.kind === 'stop' || o.kind === 'stopLimit'));
      const px = E().price(t);
      if (!stops.length || !isFinite(px)) { uncovered += E().holdingValue(t); continue; }
      const best = Math.max(...stops.map((o) => o.px));
      const qty = Math.min(h.qty, stops.reduce((a, o) => a + (o.qty - o.filled), 0));
      atRisk += Math.max(0, (px - best) * qty) * E().fxOf(E().BY[t] || {});
      covered += E().holdingValue(t);
    }
    return {
      atRisk, covered, uncovered,
      atRiskPct: eq > 0 ? atRisk / eq : 0,
      uncoveredPct: eq > 0 ? uncovered / eq : 0,
      // What a 10% fall across everything you hold would take out. Not a forecast: a yardstick.
      shockPct: eq > 0 ? (covered + uncovered) * 0.1 / eq : 0,
    };
  }

  // The worst fall from a peak, and where the account stands against its own high-water mark.
  function drawdown() {
    const s = S();
    const nw = (s.nw || []).map((x) => x.v);
    if (nw.length < 2) return { max: 0, current: 0, peak: s.startCash };
    let peak = -Infinity, max = 0;
    for (const v of nw) { if (v > peak) peak = v; const d = peak > 0 ? v / peak - 1 : 0; if (d < max) max = d; }
    const now = E().netWorth();
    let high = -Infinity;
    for (const v of nw) if (v > high) high = v;
    high = Math.max(high, now);
    return { max, current: high > 0 ? now / high - 1 : 0, peak: high };
  }

  /*
   * A cooling-off prompt after a run of losses.
   *
   * Not a block -- nothing here stops anyone trading, and a simulator that pretended it could
   * would be lying about what self-control is. It is a note, shown when the recent record says
   * something the person in the middle of it usually cannot see: that the last few have all gone
   * the same way, and that the urge to win it straight back is the expensive part.
   */
  function coolOff(given) {
    const tr = given || trades();
    if (tr.length < 3) return null;
    let run = 0;
    for (let i = tr.length - 1; i >= 0; i--) { if (tr[i].pl < 0) run++; else break; }
    if (run < 3) return null;
    const lost = tr.slice(-run).reduce((a, x) => a + x.pl, 0);
    // Did the size go up as the losses mounted? That is the tell for chasing.
    const sizes = tr.slice(-run).map((x) => Math.abs(x.qty * x.px));
    const rising = sizes.length >= 2 && sizes[sizes.length - 1] > sizes[0] * 1.25;
    return {
      run, lost,
      rising,
      note: `Your last ${run} closed trades all lost, ${Math.abs(lost).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in total.` +
        (rising ? ' Your position sizes have gone up over that run, which is what trying to win it back looks like from the outside.' : '') +
        ' A losing run is normal and proves nothing about the next trade — but it is the moment people trade biggest and worst.',
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

  /*
   * Winning and losing runs.
   *
   * Worth reporting because a run of losses is the thing that actually ends people: the account
   * survives the arithmetic and the trader does not. Seeing that your worst run was six in a row,
   * and that it happened, is more use than any average.
   */
  function streaks(tr) {
    let win = 0, loss = 0, bestWin = 0, worstLoss = 0, cur = 0;
    for (const x of tr) {
      if (x.pl > 0) { win = win > 0 ? win + 1 : 1; loss = 0; if (win > bestWin) bestWin = win; cur = win; }
      else if (x.pl < 0) { loss = loss > 0 ? loss + 1 : 1; win = 0; if (loss > worstLoss) worstLoss = loss; cur = -loss; }
    }
    return { longestWin: bestWin, longestLoss: worstLoss, current: cur };
  }

  /* ---------- export ----------
   * Comma-separated, one row per thing, with the header naming every column. Values are quoted
   * and internal quotes doubled, which is the whole of RFC 4180 that matters here; without it a
   * company name with a comma in it silently shifts every later column by one.
   */
  function csvCell(v) {
    if (v == null) return '';
    const s0 = String(v);
    return /[",\n]/.test(s0) ? '"' + s0.replace(/"/g, '""') + '"' : s0;
  }
  const csvRows = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

  function csvTrades() {
    const rows = [['ticker', 'opened', 'closed', 'days_held', 'quantity', 'exit_price', 'profit_usd', 'profit_pct', 'fees_usd', 'slippage_usd']];
    for (const x of trades()) {
      rows.push([x.t, x.opened, x.closed, x.held, round(x.qty, 6), round(x.px, 6), round(x.pl, 2), x.plPct == null ? '' : round(x.plPct * 100, 4), round(x.fee, 2), round(x.slip, 2)]);
    }
    return csvRows(rows);
  }

  function csvTransactions() {
    const s0 = S();
    const rows = [['date', 'kind', 'ticker', 'quantity', 'price', 'currency', 'amount_usd', 'fee_usd', 'slippage_usd', 'profit_usd', 'note']];
    // The log is newest first; a file reads better oldest first.
    for (const x of (s0.tx || []).slice().reverse()) {
      rows.push([x.d, x.kind, x.t || '', round(x.qty, 6), round(x.px, 6), x.cur || 'USD', round(x.amt, 2), round(x.fee, 2), round(x.slip, 2), x.pl == null ? '' : round(x.pl, 2), x.note || '']);
    }
    return csvRows(rows);
  }

  function csvPortfolio() {
    const E = window.Engine, s0 = S();
    const rows = [['ticker', 'name', 'quantity', 'avg_cost_usd', 'price', 'currency', 'value_usd', 'unrealised_usd', 'unrealised_pct', 'weight_pct', 'priced']];
    const nw = E.netWorth();
    for (const t of Object.keys(s0.holdings || {})) {
      const h = s0.holdings[t];
      if (!h || !(h.qty > 0)) continue;
      const m = E.BY[t] || {};
      const px = E.price(t);
      const val = E.holdingValue(t);
      const known = isFinite(val);
      rows.push([
        t, m.n || '', round(h.qty, 6), h.qty > 0 ? round(h.cost / h.qty, 6) : '', isFinite(px) ? round(px, 6) : '',
        m.cur || 'USD', known ? round(val, 2) : '', known ? round(val - h.cost, 2) : '',
        known && h.cost > 0 ? round((val / h.cost - 1) * 100, 4) : '',
        known && nw > 0 ? round((val / nw) * 100, 4) : '',
        known ? 'yes' : 'no',
      ]);
    }
    rows.push(['CASH', 'Uninvested cash', '', '', '', 'USD', round(s0.cash, 2), '', '', nw > 0 ? round((s0.cash / nw) * 100, 4) : '', 'yes']);
    return csvRows(rows);
  }

  const round = (v, d) => (v == null || !isFinite(v) ? '' : +(+v).toFixed(d));

  window.Stats = {
    csvTrades, csvTransactions, csvPortfolio, streaks,
    trades, summary, equity, byTicker, byMonth, concentration, positionSize, exposure, dayPL,
    portfolioRisk, drawdown, coolOff };
})();
