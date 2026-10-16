/* UI layer: renders the engine state and wires up controls. */
(function () {
  'use strict';

  const E = window.Engine;
  const C = window.Charts;
  const SAVE_KEY = 'bullpen-trader-v1';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- formatting ---------- */
  function money(v, cur = 'USD', dec) {
    const sym = cur === 'GBP' ? '£' : '$';
    const a = Math.abs(v);
    if (dec == null) dec = a > 0 && a < 1 ? 4 : 2;
    return (v < 0 ? '-' : '') + sym + a.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function signedMoney(v, cur) { return (v > 0 ? '+' : v < 0 ? '-' : '') + money(Math.abs(v), cur); }
  function compact(v) {
    const a = Math.abs(v);
    const s = a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (a / 1e3).toFixed(1) + 'K' : a.toFixed(a < 10 ? 2 : 0);
    return (v < 0 ? '-$' : '$') + s;
  }
  function pct(v, dec = 2) { return (v > 0 ? '+' : '') + (v * 100).toFixed(dec) + '%'; }
  function cls(v) { return v > 1e-12 ? 'up' : v < -1e-12 ? 'down' : ''; }
  function qtyFmt(q) { return Number.isInteger(q) ? q.toLocaleString('en-US') : q.toLocaleString('en-US', { maximumFractionDigits: 4 }); }
  const FREQ = { 12: 'Monthly', 4: 'Quarterly', 2: 'Twice a year', 1: 'Yearly', 0: '-' };
  const FREQ_SHORT = { 12: 'Monthly', 4: 'Quarterly', 2: 'Semi-annual', 1: 'Annual', 0: '' };
  const longDate = (s) => { const d = E.parseISO(s); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };

  /* ---------- persistence ---------- */
  let saveTimer = null;
  let saveWarned = false;
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    try { localStorage.setItem(SAVE_KEY, E.serialize()); }
    catch (e) { if (!saveWarned) { saveWarned = true; toast('Could not save the game in this browser. Progress will be lost when you close the page.'); } }
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
    if (window.Cloud) window.Cloud.markDirty();
  }
  /*
   * Saving is debounced so that a fast sequence of changes writes once rather than fifty times.
   * The cost is a window of up to 400ms in which a change exists only in memory, and closing the
   * tab inside it loses the change silently. So anything pending is flushed when the page goes
   * away. `pagehide` and the hidden `visibilitychange` are the two that actually fire reliably on
   * mobile, where a tab is often discarded rather than closed; `beforeunload` is there for
   * desktop. Flushing when there is nothing pending costs nothing.
   */
  function flushSave() { if (saveTimer) saveNow(); }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.v === 1 && s.sec ? s : null;
    } catch (e) { return null; }
  }
  function uiPref(key, val) {
    try {
      if (val === undefined) return localStorage.getItem('bullpen-ui-' + key);
      localStorage.setItem('bullpen-ui-' + key, val);
    } catch (e) { return null; }
  }

  /* ---------- UI state ---------- */
  const ui = {
    tab: 'markets', filter: 'all', sector: '', exch: '', q: '', sort: 'default', asc: false, limit: 120,
    nwRange: 0, newsFilter: 'all',
    sheet: null, side: 'buy', unit: 'shares', range: 260,
    playing: false, timer: null, speed: 1, skip: null,
    chartT: null, auto: false, autoTimer: null, autoFails: 0, chartRange: 126, chartType: 'candles', lastPx: null, chartMA: false,
    calMonth: null, calSel: null, calFollow: true, calWatch: false,
    newMarket: 'sim', liveBusy: false, liveInterval: '1day',
  };
  // State for the search-the-world panel.
  const wsUI = { busy: false, results: null, error: '', forQuery: null };

  const S = () => E.S;
  const isEquity = (m) => ['Stock', 'International', 'UK Share', 'REIT', 'BDC', 'MLP', 'Penny Stock', 'Investment Trust'].includes(m.type);

  const FILTERS = [
    ['all', 'All', () => true],
    ['watch', 'Watchlist', (m) => S().watch.includes(m.t)],
    ['owned', 'Owned', (m) => !!S().holdings[m.t]],
    ['stock', 'Stocks', (m) => m.type === 'Stock'],
    ['dividend', 'Dividend stocks', (m) => isEquity(m) && E.fwdYield(m.t) > 0],
    ['highyield', 'High yield 5%+', (m) => E.fwdYield(m.t) >= 0.05],
    ['monthly', 'Monthly payers', (m) => m.q === 12 && S().sec[m.t].dps > 0],
    ['arist', 'Dividend aristocrats', (m) => m.arist],
    ['blue', 'Blue chips', (m) => m.blue],
    ['growth', 'Growth', (m) => m.tags.includes('Growth')],
    ['etf', 'ETFs', (m) => m.type === 'ETF'],
    ['index', 'Index funds', (m) => m.cat === 'Index ETF' || m.cat === 'International ETF' || (m.type === 'Mutual Fund' && m.rate < 0.5) || /FTSE|S&P 500|All-World/.test(m.n) && m.exch === 'LSE'],
    ['bond', 'Bond funds', (m) => m.cat === 'Bond ETF' || (m.type === 'Mutual Fund' && m.rate >= 0.5)],
    ['income', 'Income ETFs', (m) => m.cat === 'Income ETF' || m.cat === 'Dividend ETF'],
    ['lev', 'Leveraged & inverse', (m) => !!m.track],
    ['commod', 'Gold, oil & crypto', (m) => m.cat === 'Commodity ETF' || m.cat === 'Crypto ETF'],
    ['reit', 'REITs', (m) => m.type === 'REIT'],
    ['pref', 'Preferred shares', (m) => m.type === 'Preferred' || m.cat === 'Preferred ETF'],
    ['bdc', 'BDCs & MLPs', (m) => m.type === 'BDC' || m.type === 'MLP'],
    ['intl', 'International & ADRs', (m) => m.type === 'International'],
    ['uk', 'UK shares (LSE)', (m) => m.exch === 'LSE'],
    ['penny', 'Penny stocks', (m) => m.type === 'Penny Stock' || (isEquity(m) && m.cur === 'USD' && E.price(m.t) < 5)],
    ['mutual', 'Mutual funds', (m) => m.type === 'Mutual Fund'],
    ['custom', 'Listed by you', (m) => !!m.custom],
  ];

  /* ---------- header & tape ---------- */
  function renderHeader() {
    const s = S();
    $('simDate').textContent = longDate(s.date);
    const ds = E.divSpeed();
    // There is no day counter in live mode: the clock is the real one and no day has "passed".
    $('simDay').textContent = E.liveOn() ? '' : `Day ${s.day + 1}${ds !== 'normal' ? ` · dividends ${ds}` : ''}`;
    const ms = E.marketStatus();
    const mk = $('mktStatus');
    if (mk) {
      mk.hidden = false;
      mk.className = 'mkt-status ' + (ms.open ? 'open' : 'shut');
      const now = window.Holidays.exchangeTime(E.region());
      mk.textContent = ms.open ? `${ms.market.split(' and ')[0].split(',')[0]} open` : `Closed · ${ms.why}`;
      mk.title = ms.open
        ? `${ms.market}, ${ms.hours} local time${now ? ` (it is ${now} there now)` : ''}. Bullpen moves one whole trading day at a time.${ms.national ? ` Today is ${ms.national} where you are, but the market trades as usual.` : ''}`
        : `No trading on this day: ${ms.why}.`;
      if (ms.open && ms.national) { mk.classList.add('note-day'); mk.textContent += ' · ' + ms.national; }
    }
    const badge = $('modeBadge');
    if (badge) {
      const real = E.realOn(), live = E.liveOn();
      badge.hidden = false;
      badge.className = 'mode-badge ' + (live ? 'live' : real ? 'replay' : 'sim');
      /*
       * The badge is the one thing on screen that must never be ambiguous. Whatever else is
       * confusing about a chart, the user has to be able to tell at a glance whether they are
       * looking at a real price or an invented one.
       */
      if (live) {
        const st = window.Quotes.state();
        const mock = st.provider === 'mock';
        badge.textContent = mock ? 'TEST DATA · not real' : 'REAL MARKET · paper trading';
        badge.title = mock
          ? 'This is connected to the mock provider, which makes its numbers up. It is for testing only and these are not market prices.'
          : `Real prices from ${st.providerName}${st.delayNote ? ` — ${st.delayNote}` : ''}. The money is virtual: nothing here places an order with a broker, and these are not actual exchange executions.`;
      } else {
        badge.className = 'mode-badge ' + (real ? 'replay' : 'sim');
        badge.textContent = real ? 'REPLAY · real history' : 'SIMULATED';
        badge.title = real
          ? `Replaying recorded history from ${s.realFrom || s.date}. These are the prices, dividends and splits that really happened. Not live data, and nothing after ${longDate(s.date)} is visible.`
          : 'An invented market. These prices are not real and never were.';
      }
    }
    // The time machine belongs to the two modes that own a clock. Live mode follows the real one.
    const live = E.liveOn();
    if ($('liveControls')) $('liveControls').hidden = !live;
    if ($('simControls')) $('simControls').hidden = live;
    if ($('skipControls')) $('skipControls').hidden = live;
    if (live) renderLiveAt();
    // Leaving real-market mode must stop the timer: there is nothing to fetch, and a simulated
    // market moving on its own clock has no use for one.
    else if (ui.auto) setAuto(false);
    const nw = E.netWorth();
    $('hdrWorth').textContent = money(nw);
    const prev = s.nw.length > 1 ? s.nw[s.nw.length - 2].v : s.startCash;
    const d = nw - prev;
    const tot = nw / s.startCash - 1;
    $('hdrChange').innerHTML = `<span class="${cls(d)}">${signedMoney(d)} today</span> · <span class="${cls(tot)}">${pct(tot)} all time</span>`;
    const oc = $('orderCount');
    oc.hidden = !s.orders.length;
    oc.textContent = s.orders.length;
  }

  const TAPE = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['DIA', 'Dow Jones'], ['IWM', 'Russell 2000'], ['ISF.L', 'FTSE 100'], ['VWO', 'Emerging mkts'], ['TLT', 'Long Treasuries'], ['GLD', 'Gold'], ['USO', 'Oil'], ['IBIT', 'Bitcoin']];
  function renderTape() {
    const s = S();
    let html = '';
    for (const [t, lbl] of TAPE) {
      if (!E.BY[t] || !E.listed(t)) continue;
      const p = E.price(t), c = p / E.prevClose(t) - 1;
      html += `<button class="tape-item" type="button" data-open="${t}"><span class="lbl">${lbl}</span><b>${t}</b><span class="num ${cls(c)}">${pct(c)}</span></button>`;
    }
    const fc = s.fxPrev ? s.fx / s.fxPrev - 1 : 0;
    html += `<div class="tape-item"><span class="lbl">Pound / dollar</span><b>GBP/USD ${s.fx.toFixed(4)}</b><span class="num ${cls(fc)}">${pct(fc)}</span></div>`;
    $('tape').innerHTML = html;
  }

  /* ---------- markets ---------- */
  function renderChips() {
    let html = '';
    for (const [key, label, fn] of FILTERS) {
      let n = 0;
      for (const m of E.U) if (E.listed(m.t) && fn(m)) n++;
      if (!n && !['watch', 'owned', 'all'].includes(key)) continue;
      html += `<option value="${key}"${ui.filter === key ? ' selected' : ''}>${key === 'all' ? 'All categories' : label} (${n})</option>`;
    }
    $('typeChips').innerHTML = html;
  }

  function fillSelect(sel, values, allLabel, current) {
    sel.innerHTML = `<option value="">${allLabel}</option>` + values.map((v) => `<option${v === current ? ' selected' : ''}>${esc(v)}</option>`).join('');
  }
  function renderSelects() {
    const sectors = [...new Set(E.U.map((m) => m.sector))].sort();
    fillSelect($('sectorSel'), sectors, 'All sectors', ui.sector);
    const ex = [...new Set(E.U.map((m) => m.exch))].sort();
    fillSelect($('exchSel'), ex, 'All exchanges', ui.exch);
    fillSelect($('cSector'), sectors.filter((x) => !['Fixed Income', 'International', 'UK', 'Broad Market', 'Commodities', 'Crypto'].includes(x)), 'Other', '');
  }

  function marketRows() {
    const fn = (FILTERS.find((f) => f[0] === ui.filter) || FILTERS[0])[2];
    const q = ui.q.trim().toLowerCase();
    const rows = [];
    for (const m of E.U) {
      if (!E.listed(m.t)) continue;                   // not listed on this day of the replay
      if (ui.sector && m.sector !== ui.sector) continue;
      if (ui.exch && m.exch !== ui.exch) continue;
      if (q && !(m.t.toLowerCase().startsWith(q) || m.n.toLowerCase().includes(q) || m.type.toLowerCase().includes(q) || (m.cat || '').toLowerCase().includes(q))) continue;
      if (!fn(m)) continue;
      if (E.liveOn()) {
        const l = E.liveOf(m.t);
        const p0 = l ? l.price : NaN;
        rows.push({
          m, p: p0,
          chg: l && l.changePct != null ? l.changePct / 100 : (l && isFinite(l.prevClose) && l.prevClose > 0 ? p0 / l.prevClose - 1 : null),
          y1: null,                       // no year behind us in this mode, so nothing to compare to
          yld: null,                      // dividends are not tracked here, so a yield would be invented
          sent: null,                     // nor is there a simulated client book to report
          exact: q && m.t.toLowerCase() === q,
        });
        continue;
      }
      const h = S().sec[m.t].h;
      const p = h[h.length - 1];
      rows.push({ m, p, chg: p / h[h.length - 2] - 1, y1: p / h[0] - 1, yld: E.fwdYield(m.t), sent: sentiment(m.t), exact: q && m.t.toLowerCase() === q });
    }
    const dir = ui.asc ? 1 : -1;
    const key = {
      t: (r) => r.m.t, type: (r) => r.m.type, sector: (r) => r.m.sector, price: (r) => r.p * E.fxOf(r.m),
      chg: (r) => r.chg, y1: (r) => r.y1, yield: (r) => r.yld, sent: (r) => r.sent, q: (r) => (S().sec[r.m.t].dps > 0 ? r.m.q : 0),
    }[ui.sort];
    if (key) rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    if (q) rows.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
    return rows;
  }

  /* ---------- trading workspace helpers ---------- */
  // Deterministic pseudo-random numbers for a ticker on a date, so synthetic intraday
  // detail (open, high, low, volume) stays the same every time it is drawn.
  function rand4(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out = [];
    for (let k = 0; k < 4; k++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out.push(((h >>> 0) % 10000) / 10000); }
    return out;
  }

  // The engine owns the bars, so the candles drawn here are the ones orders trade against.
  function ohlcFor(t, n) { return E.bars(t, n, E.liveOn() ? ui.liveInterval : undefined); }

  /*
   * The day's range. In live mode this is whatever the quote itself reported, which may be
   * nothing: a provider that sends only a price has not told us the range, and the chart's last
   * fetched bar is a different thing on a different day. Returning nulls lets the tile print a
   * dash instead of a number that is not the answer to the question being asked.
   */
  function dayRange(t) {
    if (E.liveOn()) {
      const l = E.liveOf(t);
      return { lo: l && isFinite(l.low) ? l.low : null, hi: l && isFinite(l.high) ? l.high : null };
    }
    const d = ohlcFor(t, 1);
    return { lo: d.l[0], hi: d.h[0] };
  }

  // Share of simulated clients buying: tends to lean against the recent move, like real retail flow.
  function sentiment(t) {
    const h = S().sec[t].h, n = h.length;
    const r5 = h[n - 1] / h[Math.max(0, n - 6)] - 1;
    const noise = (rand4(t + 'sent')[0] - 0.5) * 30;
    return Math.round(Math.min(92, Math.max(8, 55 - r5 * 600 + noise)));
  }

  // A price with its last two digits set small, as dealing screens show them.
  function priceHTML(v, cur) {
    const sym = cur === 'GBP' ? '£' : '';
    const dec = v >= 1 ? 2 : 4;
    const txt = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return `<span class="px">${sym}${txt.slice(0, -2)}<sup>${txt.slice(-2)}</sup></span>`;
  }
  const ARROW_UP = '<svg class="arr" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 L9 3 M4.5 3 H9 V7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const ARROW_DN = '<svg class="arr" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3 L9 9 M9 4.5 V9 H4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

  function chartTicker() {
    // Never leave the chart on something that had not listed yet in a replay.
    if (!ui.chartT || !E.BY[ui.chartT] || !E.listed(ui.chartT)) {
      ui.chartT = S().watch.find((t) => E.BY[t] && E.listed(t))
        || (E.listed('SPY') ? 'SPY' : (E.U.find((m) => E.listed(m.t)) || { t: 'SPY' }).t);
    }
    return ui.chartT;
  }

  function renderWorkspace() {
    renderWatchTiles();
    renderMainChart();
  }

  function renderWatchTiles() {
    const s = S();
    const list = s.watch.filter((t) => E.BY[t] && E.listed(t));
    $('watchCount').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
    ui.lastPx = ui.lastPx || {};
    if (!list.length) {
      $('watchTiles').innerHTML = '<p class="pane-empty">Star any product in the list below to watch it here.</p>';
      return;
    }
    $('watchTiles').innerHTML = list.map((t) => {
      const m = E.BY[t];
      const p = E.price(t), pc = E.prevClose(t), chg = p / pc - 1;
      const q = E.quote(t, 'buy', 1);
      const { lo, hi } = dayRange(t);
      const prev = ui.lastPx[t];
      const flash = prev == null || prev === p ? '' : p > prev ? ' flash-up' : ' flash-down';
      ui.lastPx[t] = p;
      const spread = q.ask - q.bid;
      return `<div class="ptile${t === chartTicker() ? ' sel' : ''}${flash}" data-pick="${t}">
        <div class="pt-head"><span class="pt-name" title="${esc(m.n)}">${esc(t)} <span>${esc(m.n)}</span></span>
          <span class="pt-chg ${cls(chg)}">${pct(chg)}<small>${(p - pc >= 0 ? '+' : '') + (p - pc).toFixed(p >= 1 ? 2 : 4)}</small></span></div>
        <div class="pt-q">
          <button type="button" class="pq sell" data-trade="${t}:sell"><span class="pq-l">SELL</span><span class="pq-p">${priceHTML(q.bid, m.cur)}</span>${ARROW_DN}</button>
          <button type="button" class="pq buy" data-trade="${t}:buy"><span class="pq-l">BUY</span><span class="pq-p">${priceHTML(q.ask, m.cur)}</span>${ARROW_UP}</button>
        </div>
        <div class="pt-foot"><span>L: ${money(lo, m.cur)}</span><span class="pt-spread">${spread >= 0.01 ? spread.toFixed(2) : spread.toFixed(4)}</span><span>H: ${money(hi, m.cur)}</span></div>
      </div>`;
    }).join('');
  }

  /* ---------- drawing on the chart ---------- */
  // Points are stored as { d: game day, p: price }, so drawings stay put as days pass and the range changes.
  const draw = { tool: null, color: '#f0a020', draft: null, last: null, undo: [] };
  // Remember a stock's drawings before each change, so Undo can reverse adding, erasing or clearing.
  function snapshot(t) {
    draw.undo.push({ t, list: JSON.stringify((S().drawings || {})[t] || []) });
    if (draw.undo.length > 40) draw.undo.shift();
  }
  const DRAW_HINTS = {
    pen: 'Hold and drag to draw freehand.',
    line: 'Drag from one point to another for a straight line.',
    hline: 'Click a price to mark it, e.g. the highest price you’d sell at. Drag to adjust.',
    erase: 'Click or tap a drawing to delete it.',
  };
  function drawingsFor(t, n) {
    const off = S().day - (n - 1);
    const list = ((S().drawings || {})[t] || []).concat(draw.draft && draw.draft.t === t ? [draw.draft] : []);
    return list.map((dr) => ({ type: dr.type, color: dr.color, pts: dr.pts.map((pt) => ({ x: pt.d - off, p: pt.p })) }));
  }
  function chartPoint(e) {
    const c = $('mainChart'), r = c.getBoundingClientRect();
    const v = C.toData(c, e.clientX - r.left, e.clientY - r.top);
    if (!v) return null;
    return { d: +(v.x + S().day - (c._map.n - 1)).toFixed(2), p: +v.p.toPrecision(6) };
  }
  function redrawDrawings() {
    const c = $('mainChart');
    if (!c._copts) return;
    c._copts.drawings = drawingsFor(chartTicker(), c._copts.c.length);
    C.redraw(c);
  }
  function setDrawTool(tool) {
    draw.tool = tool;
    draw.draft = null;
    const c = $('mainChart');
    c.classList.toggle('drawing', !!tool);
    c.classList.toggle('erasing', tool === 'erase');
    c._drawing = !!tool;
    document.querySelectorAll('#drawTools [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
    if (tool) $('drawHint').textContent = DRAW_HINTS[tool];
  }
  function openDraw() {
    $('drawBar').hidden = false;
    $('chDraw').setAttribute('aria-pressed', 'true');
    setDrawTool(draw.lastTool || 'pen');
    renderMainChart();
  }
  function closeDraw() {
    $('drawBar').hidden = true;
    $('chDraw').setAttribute('aria-pressed', 'false');
    if (draw.tool) draw.lastTool = draw.tool;
    setDrawTool(null);
    renderMainChart();
  }
  function commitDraft() {
    const dr = draw.draft;
    draw.draft = null;
    if (!dr) return;
    const c = $('mainChart');
    const n = c._map.n, off = S().day - (n - 1);
    const px = (pt) => C.toPx(c, { x: pt.d - off, p: pt.p });
    if (dr.type === 'pen' && dr.pts.length < 2) dr.pts.push({ d: dr.pts[0].d + 0.01, p: dr.pts[0].p });
    if (dr.type === 'line') { const [a, b] = dr.pts.map(px); if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 6) return redrawDrawings(); }
    const t = dr.t;
    delete dr.t;
    snapshot(t);
    const st = S();
    if (!st.drawings) st.drawings = {};
    (st.drawings[t] = st.drawings[t] || []).push(dr);
    if (st.drawings[t].length > 60) st.drawings[t].shift();
    save();
    renderMainChart();
  }
  // Delete the drawing nearest a click, if one is close enough.
  function eraseAt(e) {
    const t = chartTicker(), list = (S().drawings || {})[t] || [];
    if (!list.length) return;
    const c = $('mainChart'), r = c.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const n = c._map.n, off = S().day - (n - 1);
    const segDist = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
      const k = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
      return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
    };
    let best = -1, bestD = e.pointerType === 'touch' ? 16 : 9;
    list.forEach((dr, i) => {
      let dist;
      if (dr.type === 'hline') dist = Math.abs(my - C.toPx(c, { x: 0, p: dr.pts[0].p })[1]);
      else {
        const pts = dr.pts.map((pt) => C.toPx(c, { x: pt.d - off, p: pt.p }));
        dist = pts.length === 1 ? Math.hypot(mx - pts[0][0], my - pts[0][1]) : Math.min(...pts.slice(1).map((b, k) => segDist([mx, my], pts[k], b)));
      }
      if (dist < bestD) { bestD = dist; best = i; }
    });
    if (best < 0) { $('drawHint').textContent = 'Nothing there to erase. Click right on a line.'; return; }
    snapshot(t);
    list.splice(best, 1);
    save();
    renderMainChart();
  }
  function bindDrawing() {
    const c = $('mainChart');
    c.addEventListener('pointerdown', (e) => {
      if (!draw.tool || e.button > 0) return;
      e.preventDefault();
      if (draw.tool === 'erase') return eraseAt(e);
      const pt = chartPoint(e);
      if (!pt) return;
      c.setPointerCapture(e.pointerId);
      const t = chartTicker();
      draw.draft = { t, type: draw.tool, color: draw.color, pts: draw.tool === 'line' ? [pt, Object.assign({}, pt)] : [pt] };
      draw.last = [e.clientX, e.clientY];
      redrawDrawings();
    });
    c.addEventListener('pointermove', (e) => {
      if (!draw.draft) return;
      const pt = chartPoint(e);
      if (!pt) return;
      const dr = draw.draft;
      if (dr.type === 'pen') {
        if (Math.hypot(e.clientX - draw.last[0], e.clientY - draw.last[1]) < 3 || dr.pts.length > 600) return;
        draw.last = [e.clientX, e.clientY];
        dr.pts.push(pt);
      } else if (dr.type === 'line') dr.pts[1] = pt;
      else dr.pts[0] = pt;
      redrawDrawings();
    });
    const end = () => { if (draw.draft) commitDraft(); };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    $('chDraw').addEventListener('click', () => ($('drawBar').hidden ? openDraw() : closeDraw()));
    $('drawDone').addEventListener('click', closeDraw);
    $('drawTools').addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) setDrawTool(b.dataset.tool); });
    $('drawColors').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]'); if (!b) return;
      draw.color = b.dataset.color;
      document.querySelectorAll('#drawColors [data-color]').forEach((x) => x.classList.toggle('on', x === b));
      if (draw.tool === 'erase') setDrawTool('pen');
    });
    $('drawUndo').addEventListener('click', () => {
      const t = chartTicker();
      let i = draw.undo.length - 1;
      while (i >= 0 && draw.undo[i].t !== t) i--;
      if (i < 0) { $('drawHint').textContent = 'Nothing to undo.'; return; }
      const list = JSON.parse(draw.undo.splice(i, 1)[0].list);
      if (list.length) S().drawings[t] = list; else delete S().drawings[t];
      save(); renderMainChart();
    });
    let clearTimer = null;
    $('drawClear').addEventListener('click', () => {
      const b = $('drawClear');
      if (!b.classList.contains('armed')) {
        b.classList.add('armed'); b.textContent = 'Tap again to clear';
        clearTimer = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Clear all'; }, 3000);
        return;
      }
      clearTimeout(clearTimer); b.classList.remove('armed'); b.textContent = 'Clear all';
      snapshot(chartTicker());
      delete S().drawings[chartTicker()];
      save(); renderMainChart();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && draw.tool && !$('drawBar').hidden && $('focus').hidden) closeDraw(); });
  }

  /* ---------- your trades on the chart ---------- */
  // "a profit of $195.10 (+8.4%)" for a sale result; '' for a buy.
  const pct1 = (r) => (Math.abs(r) < 0.0005 ? '0.0%' : pct(r, 1));
  const cash2 = (v) => money(v, 'USD', 2);
  function plNote(q) {
    if (!q || q.pl == null) return '';
    const up = q.pl >= 0;
    if (Math.abs(q.pl) < 0.005) return ' You broke even.';
    return ` That’s a ${up ? 'profit' : 'loss'} of ${cash2(Math.abs(q.pl))}${q.plPct != null ? ` (${pct1(q.plPct)})` : ''}.`;
  }
  // Buy and sell markers for the bars in view, one per side per day.
  function tradesFor(t, nView) {
    const s = S(), h = s.sec[t].h, start = h.length - nView, m = E.BY[t];
    const byKey = new Map();
    for (const tx of s.tx) {
      if (tx.t !== t || (tx.kind !== 'BUY' && tx.kind !== 'SELL')) continue;
      const i = s.dates.indexOf(tx.d);
      if (i < start) continue;
      const key = tx.d + tx.kind;
      const g = byKey.get(key) || { x: i - start, side: tx.kind === 'BUY' ? 'buy' : 'sell', qty: 0, val: 0, pl: 0, basis: 0, hasPl: false };
      g.qty += tx.qty; g.val += tx.qty * tx.px;
      if (tx.pl != null) { g.hasPl = true; g.pl += tx.pl; g.basis += tx.amt - tx.pl; }
      byKey.set(key, g);
    }
    return [...byKey.values()].map((g) => {
      const p = g.val / g.qty, f = (v) => money(v, m.cur);
      if (g.side === 'buy') return { x: g.x, p, side: 'buy', text: `Bought ${qtyFmt(+g.qty.toFixed(4))} @ ${f(p)}` };
      const r = g.hasPl && g.basis > 0 ? g.pl / g.basis : null, up = g.pl >= 0;
      return { x: g.x, p, side: 'sell', up, tag: r == null ? '' : pct1(r), text: `Sold ${qtyFmt(+g.qty.toFixed(4))} @ ${f(p)}${r == null ? '' : `, ${pct1(r)} (${up ? '+' : '−'}${cash2(Math.abs(g.pl))})`}` };
    });
  }

  /*
   * The chip that goes next to a real price. It says in a word how old the price is and spells the
   * detail out in its tooltip. Outside live mode there is nothing to label: a simulated price is
   * neither fresh nor stale, it is invented, and the mode badge already says so.
   */
  function freshChip(t) {
    if (!E.liveOn()) return '';
    const f = E.liveFresh(t);
    const mock = (window.Quotes.cached(E.liveSym(t)) || {}).provider === 'mock';
    const label = mock && f.level !== 'unavailable' ? 'Test data' : f.label;
    return `<span class="fresh-chip ${f.level}" title="${esc(f.note)}">${esc(label)}</span>`;
  }

  /*
   * Says where the bars on screen came from. Provider candles need no explaining; a tape chart
   * does, because it is not the market's history -- it is the prices this app was quoted while
   * the game was open, which is a narrower and more honest thing.
   */
  function renderChartSource(d, t) {
    const el = $('chartSource');
    if (!el) return;
    if (!d || !d.tape) { el.hidden = true; el.textContent = ''; return; }
    const span = (n) => (n < 90 ? `${Math.round(n)} seconds` : n < 5400 ? `${Math.round(n / 60)} minutes` : n < 172800 ? `${Math.round(n / 3600)} hours` : `${Math.round(n / 86400)} days`);
    const st = window.Quotes.state();
    const who = st.providerName || 'your provider';
    const one = d.step < 3600 ? `${d.step / 60}-minute` : d.step < 86400 ? `${d.step / 3600}-hour` : 'daily';
    el.hidden = false;
    el.innerHTML = `Drawn from the <b>${d.points}</b> price${d.points === 1 ? '' : 's'} ${esc(who)} has sent for ${esc(t)}, covering ${span(d.to - d.from)} — one ${one} bar each. `
      + `This is the tape this app has seen, not ${esc(t)}'s full history: your plan sends no candles, so nothing before you started watching can be drawn. Refresh prices to extend it.`;
  }

  // The empty state for a live chart whose history has not been fetched yet.
  function liveChartEmpty(t) {
    const st = window.Quotes.state();
    if (!st.configured) {
      return `<div class="data-empty"><b>No data endpoint</b><p class="note">Real-market mode needs the address of your own data proxy. Set one under Settings &rarr; Real market data.</p></div>`;
    }
    if (!E.liveSupported(t)) {
      return `<div class="data-empty"><b>${esc(t)} is not covered</b><p class="note">${esc(E.BY[t] ? E.BY[t].n : t)} has no symbol at ${esc(st.providerName)} that we can be sure of, so it has no real price. It is hidden rather than guessed at.</p></div>`;
    }
    /*
     * If a fetch has already been refused, keep the provider's own reason on screen. A toast
     * carries it away after a few seconds, and on a plan that will never serve candles -- a free
     * Finnhub key, say -- the button would otherwise invite the same refusal for ever.
     */
    const err = st.lastError && /series|candle|resource|plan|access|premium/i.test(st.lastError.message || '') ? st.lastError.message : '';
    // One price is not yet a chart, but it is the start of one: say so, so that refreshing looks
    // like progress rather than a button that does nothing.
    const got = E.tapeCount(t);
    const building = `<p class="note">${got
      ? `One price so far. Each refresh adds another, and the second one draws a chart of what ${esc(st.providerName)} has quoted since you started watching.`
      : `Refresh prices and the app charts what ${esc(st.providerName)} quotes from then on, even on a plan that sends no history.`}</p>`;
    return `<div class="data-empty"><b>${err ? 'No chart from this provider' : 'No history fetched yet'}</b>
      <p class="note">${err
        ? `${esc(st.providerName)} refused the request: “${esc(err)}” Live prices still work; some plans serve quotes but not history.`
        : `Nothing is drawn here until ${esc(st.providerName)} sends the bars, because a chart in this mode must not contain a price nobody traded.`}</p>
      ${building}
      <button class="btn ${err ? '' : 'btn-primary'}" id="loadHistBtn" type="button">${err ? 'Try again' : `Load ${esc(t)} history`}</button></div>`;
  }

  async function loadLiveHistory(t) {
    const btn = $('loadHistBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
    const s0 = await window.Quotes.series(E.liveSym(t), { interval: ui.liveInterval, outputsize: 500 });
    const st = window.Quotes.state();
    if (!s0) toast(st.lastError ? st.lastError.message : 'No history came back.', 'err');
    renderDataState();
    refresh();
  }

  function renderMainChart() {
    const t = chartTicker();
    const m = E.BY[t];
    const s = S();
    const p = E.price(t), chg = p / E.prevClose(t) - 1;
    const q = E.quote(t, 'buy', 1);
    $('chT').textContent = t;
    $('chName').textContent = `${m.n} · ${m.cat || m.type} · ${m.exch}`;
    /*
     * Live mode gets its own path because almost everything below assumes a price and a year of
     * bars, and in this mode either may legitimately not exist. Showing the reason is the feature;
     * falling back to something that looks like data would be the bug.
     */
    if (E.liveOn()) {
      const d0 = ohlcFor(t, ui.chartRange);
      const havePx = isFinite(p);
      const l = E.liveOf(t);
      $('chSell').innerHTML = havePx ? `<span>SELL</span>${priceHTML(q.bid, m.cur)}${ARROW_DN}` : '<span>SELL</span><b class="muted">—</b>';
      $('chBuy').innerHTML = havePx ? `<span>BUY</span>${priceHTML(q.ask, m.cur)}${ARROW_UP}` : '<span>BUY</span><b class="muted">—</b>';
      const bits = [freshChip(t)];
      if (havePx && l) {
        const dayChg = l.changePct != null ? l.changePct / 100 : (isFinite(chg) ? chg : null);
        if (dayChg != null) bits.push(`<span class="${cls(dayChg)}">${pct(dayChg)} ${l.kind === 'eod' ? 'on the day' : 'today'}</span>`);
        if (l.asOfText) bits.push(`<span class="muted">as of ${esc(l.asOfText)}</span>`);
        if (s.holdings[t]) bits.push(`You own ${qtyFmt(+s.holdings[t].qty.toFixed(4))}`);
      } else {
        bits.push('<span class="muted">no current price</span>');
      }
      $('chStats').innerHTML = bits.join(' · ');
      $('chWatch').textContent = s.watch.includes(t) ? '★ Watching' : '☆ Watch';
      $('chDraw').innerHTML = '&#x270E; Draw';
      const host = $('mainChart');
      const wrap = host.parentElement;
      let empty = wrap.querySelector('.data-empty');
      if (empty) empty.remove();
      if (!d0.c.length) {
        host.hidden = true;
        wrap.insertAdjacentHTML('beforeend', liveChartEmpty(t));
        const lb = $('loadHistBtn');
        if (lb) lb.addEventListener('click', () => loadLiveHistory(t));
      } else {
        host.hidden = false;
        C.candles(host, Object.assign(d0, {
          timeAxis: false,
          // Tape bars are clock times of our own making, not trading dates.
          labelFmt: d0.tape ? (x) => x : undefined,
          drawings: drawingsFor(t, d0.c.length),
          type: ui.chartType,
          fmt: (v) => money(v, m.cur, v >= 1000 ? 0 : undefined).replace('$', ''),
        }));
      }
      renderChartSource(d0, t);
      if ($('chTrend')) $('chTrend').hidden = true;
      return;
    }
    $('chSell').innerHTML = `<span>SELL</span>${priceHTML(q.bid, m.cur)}${ARROW_DN}`;
    $('chBuy').innerHTML = `<span>BUY</span>${priceHTML(q.ask, m.cur)}${ARROW_UP}`;
    const y = E.fwdYield(t);
    $('chStats').innerHTML = `<span class="${cls(chg)}">${pct(chg)} today</span>${y > 0 ? ` · Yield ${(y * 100).toFixed(2)}%` : ''}${s.holdings[t] ? ` · You own ${qtyFmt(+s.holdings[t].qty.toFixed(4))}${(() => { const hh = s.holdings[t], val = E.holdingValue(t), g = hh.cost > 0 ? val / hh.cost - 1 : 0; return hh.cost > 0 ? `, <span class="${cls(g)}">${pct1(g)} (${val - hh.cost >= 0 ? '+' : '−'}${cash2(Math.abs(val - hh.cost))})</span>` : ''; })()}` : ''}`;
    $('chWatch').textContent = s.watch.includes(t) ? '★ Watching' : '☆ Watch';
    const nd = ((s.drawings || {})[t] || []).length;
    $('chDraw').innerHTML = `&#x270E; Draw${nd ? ` <span class="muted">(${nd})</span>` : ''}`;
    const d = ohlcFor(t, ui.chartRange);
    renderChartSource(null, t);
    C.candles($('mainChart'), Object.assign(d, { timeAxis: true, drawings: drawingsFor(t, d.c.length), trades: tradesFor(t, d.c.length), type: ui.chartType, overlays: maOverlays(t, d.c.length), fmt: (v) => money(v, m.cur, v >= 1000 ? 0 : undefined).replace('$', '') }));
    const tr = window.Learn && window.Learn.trendOf(s.sec[t].h.slice(-126));
    const badge = $('chTrend');
    if (tr) {
      badge.hidden = false;
      badge.className = `trend-badge ${tr.kind}`;
      badge.innerHTML = `6-month trend: <b>${window.Learn.TREND_LABEL[tr.kind]} ${tr.kind === 'up' ? '↗' : tr.kind === 'down' ? '↘' : '→'}</b>`;
    } else badge.hidden = true;
  }

  // 20- and 50-day simple moving averages for the last n days, computed on the full history.
  function maOverlays(t, n) {
    if (!ui.chartMA || !window.Learn || E.liveOn()) return [];
    const h = S().sec[t].h;
    const out = [];
    for (const [len, color] of [[20, 'buy'], [50, 'sell']]) {
      out.push({ label: `${len}-day average`, color, values: window.Learn.sma(h, len).slice(-n) });
    }
    return out;
  }

  /* ---------- every exchange in the world ----------
   * The built-in list is a few hundred products with real reference prices. The rest of the
   * world's fifty-odd thousand listings are reached by asking the data provider, which knows
   * every exchange, rather than by shipping a file of invented fundamentals.
   *
   * It needs a data connection for the obvious reason: we cannot know what a share in Tokyo costs
   * without being told. Without one this says so instead of offering a search that cannot work.
   */
  function renderWorldSearch(localCount) {
    const el = $('worldSearch');
    if (!el) return;
    const q = ui.q.trim();
    // Results belong to the query that produced them. Changing the search throws them away rather
    // than leaving a Swiss listing sitting under a search for something else entirely.
    if (wsUI.forQuery != null && wsUI.forQuery !== q) { wsUI.results = null; wsUI.error = ''; wsUI.forQuery = null; }
    // Only worth offering once they have typed something a local filter did not satisfy.
    el.hidden = q.length < 2;
    if (el.hidden) { wsUI.results = null; wsUI.forQuery = null; return; }
    const st = window.Quotes.state();
    $('worldSub').textContent = localCount
      ? `${localCount} here match “${q}”`
      : `Nothing here matches “${q}”`;
    const btn = $('worldBtn');
    btn.disabled = !st.configured || wsUI.busy;
    btn.textContent = wsUI.busy ? 'Searching…' : `Search every exchange for “${q.slice(0, 20)}”`;
    $('worldNote').textContent = st.configured
      ? `via ${st.providerName}`
      : 'Needs a data connection — set one up under Settings → Real market data.';
    $('worldResults').innerHTML = wsUI.results == null ? '' : worldResultsHTML();
  }

  function worldResultsHTML() {
    const list = wsUI.results;
    if (!list || !list.length) return `<p class="world-empty">${esc(wsUI.error || 'No matches anywhere.')}</p>`;
    return list.map((r) => {
      const have = !!E.BY[r.symbol];
      return `<div class="world-row">
        <span class="wr-id"><b>${esc(r.symbol)}</b><span>${esc(r.name || '')}</span></span>
        <span class="wr-meta">${esc([r.type, r.region].filter(Boolean).join(' · '))}</span>
        ${have
          ? '<span class="muted small">Already listed</span>'
          : `<button class="btn btn-sm" type="button" data-world="${esc(r.symbol)}">List it</button>`}
      </div>`;
    }).join('');
  }

  async function doWorldSearch() {
    const q = ui.q.trim();
    if (q.length < 2 || wsUI.busy) return;
    wsUI.busy = true; wsUI.error = ''; wsUI.results = null; wsUI.forQuery = q;
    renderWorldSearch(marketRows().length);
    const list = await window.Quotes.search(q);
    wsUI.busy = false;
    // The box may have moved on while the request was in flight; if so, these are not its results.
    if (ui.q.trim() !== q) { renderWorldSearch(marketRows().length); return; }
    const st = window.Quotes.state();
    if (list == null) {
      wsUI.results = [];
      wsUI.error = st.lastError ? st.lastError.message : 'The search could not be run.';
    } else {
      wsUI.results = list.slice(0, 15);
      if (!list.length) wsUI.error = `Nothing on any exchange matched “${q}”.`;
    }
    renderWorldSearch(marketRows().length);
  }

  /*
   * List one. The price has to come from the provider: a share with no price is not tradeable,
   * and inventing one for a real company is the one thing this app will not do.
   */
  async function listWorldSymbol(sym, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
    const q = await window.Quotes.quote(sym, { force: true });
    const st = window.Quotes.state();
    if (!q) {
      if (btn) { btn.disabled = false; btn.textContent = 'List it'; }
      return toast(st.lastError ? st.lastError.message : `No price came back for ${sym}.`, 'err');
    }
    const hit = (wsUI.results || []).find((r) => r.symbol === sym) || {};
    const res = E.listWorld({
      symbol: sym,
      name: q.name || hit.name || sym,
      price: q.price,
      currency: q.currency || hit.currency || 'USD',
      exchange: q.exchange || hit.region || 'World',
      type: hit.type || '',
    });
    if (!res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = 'List it'; }
      return toast(res.msg, 'err');
    }
    save();
    renderSelects();
    refresh();
    renderWorldSearch(marketRows().length);
    toast(`${res.m.n} (${res.m.t}) is now listed, priced in ${res.m.cur} on ${res.m.exch}.`);
  }

  function renderMarkets() {
    const rows = marketRows();
    $('resultCount').textContent = `${rows.length.toLocaleString()} ${rows.length === 1 ? 'product' : 'products'}`;
    renderWorldSearch(rows.length);
    const shown = rows.slice(0, ui.limit);
    const s = S();
    const cur = chartTicker();
    let html = '';
    for (const r of shown) {
      const m = r.m;
      const h = s.sec[m.t].h;
      const spark = h.length > 2 ? C.sparkSVG(h.slice(-30), h[h.length - 1] >= h[h.length - 30]) : '';
      const w = s.watch.includes(m.t);
      const q = E.quote(m.t, 'buy', 1);
      const { lo, hi } = dayRange(m.t);
      const sent = r.sent;
      const sentTxt = sent == null ? '' : sent >= 50 ? `${sent}% Bought` : `${100 - sent}% Sold`;
      const abs = E.liveOn() ? (E.liveOf(m.t) || {}).change : r.p - h[h.length - 2];
      // A dash, not a zero: in live mode several of these columns have no answer rather than an
      // answer of nothing, and printing 0.00% would be a statement we cannot make.
      const dash = '<span class="muted">—</span>';
      html += `<tr data-pick="${m.t}"${m.t === cur ? ' class="sel"' : ''}>
        <td class="star-col"><button type="button" class="star${w ? ' on' : ''}" data-watch="${m.t}" aria-label="${w ? 'Remove from' : 'Add to'} watchlist">${w ? '★' : '☆'}</button></td>
        <td><div class="sec-cell"><b>${esc(m.t)}${s.holdings[m.t] ? '<span class="held-dot" title="You own this"></span>' : ''}</b><span>${esc(m.n)}</span></div></td>
        <td class="r ${cls(r.chg)}">${r.chg == null || !isFinite(r.chg) ? dash : `<span class="chg-cell">${r.chg >= 0 ? ARROW_UP : ARROW_DN}${pct(r.chg).replace('+', '')}</span>${isFinite(abs) ? `<small class="muted">${(abs >= 0 ? '' : '-') + Math.abs(abs).toFixed(r.p >= 1 ? 2 : 4)}</small>` : ''}`}</td>
        <td class="hide-sm">${spark}</td>
        <td class="hide-md range-cell">${lo == null || hi == null ? dash : `<span>L: ${money(lo, m.cur)}</span><span>H: ${money(hi, m.cur)}</span>`}</td>
        <td class="hide-md">${sent == null ? dash : `<div class="sent"><span class="sent-l">${sentTxt} ${sent >= 50 ? ARROW_UP : ARROW_DN}</span><div class="sent-bar"><i style="width:${sent}%"></i></div></div>`}</td>
        <td class="r hide-sm">${r.yld > 0 ? (r.yld * 100).toFixed(2) + '%' : dash}</td>
        <td class="r"><button type="button" class="qcell sell" data-trade="${m.t}:sell">${priceHTML(q.bid, m.cur)}${ARROW_DN}</button></td>
        <td class="r"><button type="button" class="qcell buy" data-trade="${m.t}:buy">${priceHTML(q.ask, m.cur)}${ARROW_UP}</button></td>
      </tr>`;
    }
    if (!shown.length) {
      html = `<tr><td colspan="9" class="empty">${ui.filter === 'watch' ? 'Your watchlist is empty. Tap the star next to any product to add it.' : ui.filter === 'owned' ? 'You do not own anything yet. Click Buy next to any product.' : 'Nothing matches. Try a different search or filter, or list it yourself in Settings.'}</td></tr>`;
    }
    $('marketBody').innerHTML = html;
    $('moreBtn').hidden = rows.length <= ui.limit;
    $('moreBtn').textContent = `Show more (${(rows.length - ui.limit).toLocaleString()} left)`;
    document.querySelectorAll('#marketTable th[data-sort]').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === ui.sort);
      th.classList.toggle('asc', th.dataset.sort === ui.sort && ui.asc);
    });
  }

  function pickChart(t) {
    if (!E.BY[t]) return;
    ui.chartT = t;
    uiPref('chartT', t);
    renderWorkspace();
    document.querySelectorAll('#marketBody tr[data-pick]').forEach((tr) => tr.classList.toggle('sel', tr.dataset.pick === t));
    if (window.innerWidth < 1000) document.querySelector('.pane-chart').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /* ---------- portfolio ---------- */
  function holdingsRows() {
    const s = S();
    return Object.keys(s.holdings).map((t) => {
      const m = E.BY[t], h = s.holdings[t];
      const p = E.price(t), fx = E.fxOf(m);
      const value = h.qty * p * fx;
      const day = h.qty * (p - E.prevClose(t)) * fx;
      const income = h.qty * E.annualDps(t) * fx;
      return { t, m, h, p, value, day, income, ret: value - h.cost, retPct: h.cost ? value / h.cost - 1 : 0 };
    }).sort((a, b) => b.value - a.value);
  }

  // Average cost per share in the security's own currency (pounds for London shares).
  function avgCostNative(t) {
    const h = S().holdings[t];
    const cn = h.costN ?? h.cost / E.fxOf(E.BY[t]);
    return cn / h.qty;
  }

  function tile(label, val, sub, subCls) {
    return `<div class="tile"><span class="eyebrow">${label}</span><span class="val">${val}</span><span class="sub ${subCls || ''}">${sub || '&nbsp;'}</span></div>`;
  }

  function renderPortfolio() {
    const s = S();
    const rows = holdingsRows();
    const mv = rows.reduce((a, r) => a + r.value, 0);
    const nw = s.cash + mv;
    const prev = s.nw.length > 1 ? s.nw[s.nw.length - 2].v : s.startCash;
    const income = rows.reduce((a, r) => a + r.income, 0);
    const divTotal = s.divLog.reduce((a, d) => a + d.amt, 0);
    $('pfTiles').innerHTML =
      tile('Net worth', money(nw), `${pct(nw / s.startCash - 1)} since start`, cls(nw - s.startCash)) +
      tile('Cash', money(s.cash), `${mv + s.cash > 0 ? ((s.cash / nw) * 100).toFixed(1) : 0}% of portfolio`) +
      tile('Invested', money(mv), `${rows.length} holding${rows.length === 1 ? '' : 's'}`) +
      tile('Today', signedMoney(nw - prev), pct(prev ? nw / prev - 1 : 0), cls(nw - prev)) +
      tile('Total return', signedMoney(nw - s.startCash), `from ${compact(s.startCash)} start`, cls(nw - s.startCash)) +
      tile('Dividend income', money(income) + '/yr', `${divTotal ? money(divTotal) + ' received so far' : 'forward estimate'}`) +
      tile('Realized gains', signedMoney(s.realized), `fees paid ${money(s.feesPaid)}`, cls(s.realized));

    renderNwChart();

    // allocation
    const by = (keyFn) => {
      const acc = {};
      for (const r of rows) { const k = keyFn(r.m); acc[k] = (acc[k] || 0) + r.value; }
      acc.Cash = (acc.Cash || 0) + s.cash;
      return Object.entries(acc).sort((a, b) => b[1] - a[1]);
    };
    const barsHtml = (entries) => entries.map(([k, v]) => {
      const w = nw > 0 ? (v / nw) * 100 : 0;
      return `<div class="bar-row"><span class="lbl">${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(2)}%"></div></div><span class="pct">${w.toFixed(1)}%</span></div>`;
    }).join('');
    $('allocType').innerHTML = barsHtml(by((m) => m.cat || m.type));
    $('allocSector').innerHTML = barsHtml(by((m) => m.sector));

    let html = '';
    for (const r of rows) {
      const { m, h } = r;
      const drip = h.drip ?? s.settings.drip;
      html += `<tr data-open="${r.t}">
        <td><div class="sec-cell"><b>${esc(r.t)}</b><span>${esc(m.n)}</span></div></td>
        <td class="r">${qtyFmt(h.qty)}</td>
        <td class="r hide-sm">${money(avgCostNative(r.t), m.cur)}</td>
        <td class="r">${money(r.p, m.cur)}</td>
        <td class="r">${money(r.value)}<div class="small muted">${nw ? ((r.value / nw) * 100).toFixed(1) : 0}%</div></td>
        <td class="r hide-sm ${cls(r.day)}">${signedMoney(r.day)}</td>
        <td class="r ${cls(r.ret)}">${signedMoney(r.ret)}<div class="small">${pct(r.retPct)}</div></td>
        <td class="r hide-md">${r.income ? money(r.income) : '<span class="muted">-</span>'}</td>
        <td class="r hide-md">${r.income && h.cost ? ((r.income / h.cost) * 100).toFixed(2) + '%' : '<span class="muted">-</span>'}</td>
        <td class="c hide-sm">${m.q ? `<button type="button" class="drip-toggle${drip ? ' on' : ''}" data-drip="${r.t}" aria-pressed="${drip}" aria-label="Reinvest ${esc(r.t)} dividends"></button>` : '<span class="muted">-</span>'}</td>
      </tr>`;
    }
    if (!rows.length) html = `<tr><td colspan="10" class="empty">No holdings yet. Go to Markets, pick a security and buy some shares. Try a dividend payer like KO or SCHD, or a monthly payer like O.</td></tr>`;
    $('holdBody').innerHTML = html;
  }

  function renderNwChart() {
    const s = S();
    let pts = s.nw;
    if (ui.nwRange) pts = pts.slice(-ui.nwRange - 1);
    if (pts.length < 2) pts = [pts[0], pts[0]];
    const v0 = pts[0].v, b0 = pts[0].b;
    const css = getComputedStyle(document.documentElement);
    C.line($('nwChart'), {
      labels: pts.map((p) => p.d),
      series: [
        { name: 'You', values: pts.map((p) => p.v), color: css.getPropertyValue('--accent').trim(), fill: true },
        { name: 'SPY', values: pts.map((p) => v0 * (p.b / b0)), color: css.getPropertyValue('--chart-b').trim(), width: 1.4, dash: [4, 3] },
      ],
      fmt: compact,
    });
  }

  /* ---------- dividends ---------- */
  function renderDividends() {
    const s = S();
    const rows = holdingsRows();
    const income = rows.reduce((a, r) => a + r.income, 0);
    const mv = rows.reduce((a, r) => a + r.value, 0);
    const cost = rows.reduce((a, r) => a + r.h.cost, 0);
    const total = s.divLog.reduce((a, d) => a + d.amt, 0);
    const yearAgo = E.parseISO(s.date); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const ya = yearAgo.toISOString().slice(0, 10);
    const last12 = s.divLog.filter((d) => d.d > ya).reduce((a, d) => a + d.amt, 0);
    const reinvested = s.divLog.filter((d) => d.drip).reduce((a, d) => a + d.amt, 0);
    const payers = rows.filter((r) => r.income > 0).length;
    const netIncome = rows.reduce((a, r) => a + r.income * (1 - E.taxRateEstimate(r.m)), 0);
    $('divTiles').innerHTML =
      tile('Forward income', money(income) + '/yr', `about ${money(netIncome)} after tax`) +
      tile('Portfolio yield', mv ? ((income / mv) * 100).toFixed(2) + '%' : '-', `${payers} paying holding${payers === 1 ? '' : 's'}`) +
      tile('Yield on cost', cost ? ((income / cost) * 100).toFixed(2) + '%' : '-', 'income vs what you paid') +
      tile('Last 12 months', money(last12), 'received') +
      tile('All time, after tax', money(total), `${money(s.taxPaid || 0)} tax withheld`) +
      tile('Reinvested (DRIP)', money(reinvested), total ? ((reinvested / total) * 100).toFixed(0) + '% of dividends' : 'turn on per holding');

    // monthly bars for the last 12 simulated months
    const d = E.parseISO(s.date);
    const keys = [], labels = [];
    for (let k = 11; k >= 0; k--) {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1));
      keys.push(x.toISOString().slice(0, 7));
      labels.push(x.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));
    }
    const sums = keys.map((k) => s.divLog.filter((e) => e.d.startsWith(k)).reduce((a, e) => a + e.amt, 0));
    C.bars($('divChart'), { values: sums, labels, fmt: compact });

    // upcoming
    const up = [];
    for (const p of s.pending) {
      const m = E.BY[p.t]; if (!m) continue;
      up.push({ t: p.t, status: 'Declared', date: p.pay, amt: p.qty * p.dps * E.fxOf(m), firm: true });
    }
    const horizon = E.addTradingDays(s.date, 63);
    for (const r of rows) {
      const ex = E.nextExDate(r.t);
      if (ex && ex <= horizon) up.push({ t: r.t, status: 'Ex-date (est.)', date: ex, amt: r.h.qty * E.perPayment(r.t) * E.fxOf(r.m) });
    }
    up.sort((a, b) => (a.date < b.date ? -1 : 1));
    $('upcomingBody').innerHTML = up.length ? up.map((u) => `<tr data-open="${u.t}"><td><b class="num">${esc(u.t)}</b></td><td class="${u.firm ? 'up' : 'muted'}">${u.status}</td><td class="r">${C.shortDate(u.date)}</td><td class="r">${money(u.amt)}</td></tr>`).join('')
      : `<tr><td colspan="4" class="empty">Nothing scheduled. Buy a dividend payer and its next payments show up here.</td></tr>`;

    const hist = s.divLog.slice(0, 150);
    $('divHistBody').innerHTML = hist.length ? hist.map((e) => `<tr data-open="${e.t}"><td class="num">${C.shortDate(e.d)}</td><td><b class="num">${esc(e.t)}</b></td><td class="r">${money(e.dps, e.cur, 4)}</td><td class="r up">${money(e.amt)}${e.tax > 0.005 ? `<div class="small muted">${money(e.tax)} tax</div>` : ''}</td><td class="r">${e.drip ? qtyFmt(+e.shares.toFixed(4)) + ' sh' : '<span class="muted">Cash</span>'}</td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">No dividends yet. Press Play or skip ahead to reach the next payment date.</td></tr>`;
  }

  /* ---------- orders ---------- */
  function renderOrders() {
    const s = S();
    $('ordersBody').innerHTML = s.orders.length ? s.orders.map((o) => {
      const m = E.BY[o.t];
      const kind = `${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.kind}`;
      return `<tr><td class="num">${C.shortDate(o.placed)}</td><td><b class="num" data-open="${o.t}" style="cursor:pointer">${esc(o.t)}</b></td><td class="${o.side === 'buy' ? 'up' : 'down'}">${kind}</td><td class="r">${qtyFmt(o.qty)}</td><td class="r">${money(o.px, m.cur)}</td><td class="r">${money(E.price(o.t), m.cur)}</td><td class="r"><button type="button" class="btn btn-ghost" data-cancel="${o.id}">Cancel</button></td></tr>`;
    }).join('') : `<tr><td colspan="7" class="empty">No open orders. Open any security and choose a Limit or Stop order to set one.</td></tr>`;
  }

  /* ---------- activity ---------- */
  function renderActivity() {
    const s = S();
    const mine = (t) => t && (s.holdings[t] || s.watch.includes(t));
    const items = s.news.filter((n) => ui.newsFilter === 'all' || mine(n.t)).slice(0, 200);
    const label = { macro: 'Markets', earnings: 'Earnings', dividend: 'Dividends', split: 'Split', order: 'Orders', listing: 'Listing' };
    $('newsList').innerHTML = items.length ? items.map((n) => `<li${mine(n.t) ? ' class="mine"' : ''}><span class="d">${C.shortDate(n.d)}${n.at ? `<small>${n.at}</small>` : ''}</span><span><span class="k">${label[n.kind] || n.kind}</span>${esc(n.text)}${n.t ? ` <a data-open="${n.t}">${esc(n.t)}</a>` : ''}<small class="news-src">${esc(n.src || 'Bullpen (simulated)')}</small></span><span class="num small ${n.chg != null ? cls(n.chg) : ''}">${n.chg != null && n.kind === 'earnings' ? pct(n.chg) : ''}</span></li>`).join('')
      : `<li><span></span><span class="muted">No news about your holdings or watchlist yet.</span><span></span></li>`;

    const tx = s.tx.slice(0, 200);
    const kindCls = { BUY: '', SELL: '', DIV: 'up', DRIP: 'up', SPLIT: 'muted' };
    $('txBody').innerHTML = tx.length ? tx.map((x) => `<tr data-open="${x.t}"><td class="num">${C.shortDate(x.d)}</td><td class="${kindCls[x.kind]}">${x.kind === 'DIV' ? 'Dividend' : x.kind === 'DRIP' ? 'Reinvest' : x.kind === 'SPLIT' ? 'Split ' + esc(x.note || '') : x.kind === 'BUY' ? 'Buy' : 'Sell'}${x.note && x.kind !== 'SPLIT' ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td><td><b class="num">${esc(x.t)}</b></td><td class="r">${qtyFmt(+x.qty.toFixed(4))}</td><td class="r">${x.kind === 'SPLIT' ? '' : money(x.px, x.cur)}</td><td class="r ${cls(x.amt)}">${x.amt ? signedMoney(x.amt) : ''}</td></tr>`).join('')
      : `<tr><td colspan="6" class="empty">Your trades and dividend payments will be listed here.</td></tr>`;
  }

  /* ---------- settings ---------- */
  function renderSettings() {
    const st = S().settings;
    $('setCommission').value = st.commission;
    $('setFractional').checked = st.fractional;
    $('setDrip').checked = st.drip;
    $('setStamp').checked = st.stamp;
    $('setAccount').innerHTML = Object.entries(E.ACCOUNTS).map(([k, v]) => `<option value="${k}"${k === st.account ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const H = window.Holidays;
    $('setRegion').innerHTML = Object.entries(H.EXCHANGES).map(([k, v]) => `<option value="${k}"${k === E.region() ? ' selected' : ''}>${esc(v.name)} — ${esc(v.market)}</option>`).join('');
    const ex = H.EXCHANGES[E.region()];
    $('regionNote').innerHTML = `The market follows <b>${esc(ex.market)}</b>: ${esc(ex.hours)}, ${esc(ex.tz.replace('_', ' '))}. ${st.regionHow ? `Picked from ${esc(st.regionHow)}, and nothing was sent anywhere.` : ''} A holiday where you live does not close an exchange abroad, so your own days off are marked on the calendar separately.`;
    $('setRiskPct').value = st.riskPct;
    $('setMaxPos').value = st.maxPosPct;
    $('setDayLoss').value = st.dayLossPct;

    const Q = window.Quotes;
    $('setProvider').innerHTML = ['<option value="">Work it out from the proxy</option>']
      .concat(Object.values(Q.PROVIDERS).map((pv) => `<option value="${pv.id}"${pv.id === st.provider ? ' selected' : ''}>${esc(pv.name)}</option>`)).join('');
    $('setEndpoint').value = st.endpoint || '';
    $('setMode').value = st.dataMode === 'direct' ? 'direct' : 'proxy';
    $('setKey').value = getKey();
    renderDataMode();
    renderProviderNote();
    $('setMarket').value = ui.newMarket || 'sim';
    renderMarketNote();
    renderDataState();
    renderRefState();
  }

  /* ---------- real market data ----------
   * The requirements are blunt about this and they are right: a price has to say where it came
   * from, how old it is and whether it is current, and a failure has to look like a failure. So
   * this panel reports the plain state of the connection -- including, when there is nothing to
   * report, that there is nothing to report -- rather than going quiet and leaving the last
   * number on screen looking authoritative.
   */
  /*
   * The key advice changes with the provider: Yahoo needs no key at all, the other two do. Saying
   * "set your API key as a secret" to someone using Yahoo would send them looking for one that
   * does not exist.
   */
  /*
   * Which fields matter depends on how you are reaching the provider, and the honest warning
   * belongs next to the field that causes it rather than buried in a paragraph above.
   */
  function renderDataMode() {
    const st = S().settings;
    const direct = st.dataMode === 'direct';
    const p = window.Quotes.PROVIDERS[$('setProvider') ? $('setProvider').value : ''] || null;
    $('endpointWrap').hidden = direct;
    $('keyWrap').hidden = !direct || (p && p.noKey);
    $('proxyWhy').hidden = direct;
    const warn = $('keyWarn');
    if (direct && p && !p.direct) {
      warn.hidden = false;
      warn.innerHTML = `<b>${esc(p.name)} cannot be called from a browser.</b> It sends no CORS headers, so the request is blocked before it leaves the page. Use the proxy for ${esc(p.name)}, or pick a provider that allows it.`;
    } else if (direct && p && p.noKey) {
      warn.hidden = false;
      warn.innerHTML = `<b>${esc(p.name)} needs no key</b>, but it does need the proxy, so this combination will not fetch anything.`;
    } else if (direct) {
      warn.hidden = false;
      warn.innerHTML = '<b>Your key stays in this browser.</b> It is saved here only &mdash; never in your game, so it is never synced to your account &mdash; and it is sent straight to the provider. That is fine on a copy only you open. Do not use this mode on a page other people can load: anyone who opens it can read the key out of it.';
    } else {
      warn.hidden = true;
    }
    $('modeNote').textContent = direct
      ? 'Nothing to deploy: this browser calls the provider itself.'
      : 'The proxy holds your key, so the page never sees it. Needed for Yahoo, and for any copy you share.';
  }

  function renderProviderNote() {
    const el = $('providerNote');
    if (!el) return;
    const id = $('setProvider') ? $('setProvider').value : '';
    const p = window.Quotes.PROVIDERS[id];
    if (!p) { el.hidden = true; return; }
    el.hidden = false;
    /*
     * Where the key lives depends entirely on the mode, so the note has to follow it. Saying
     * "it goes on your proxy and never into this page" while the page is holding the key, three
     * lines above the box that says it is holding the key, is worse than saying nothing.
     */
    const direct = ($('setMode') ? $('setMode').value : window.Quotes.state().mode) === 'direct';
    if (direct && !p.direct) {
      el.innerHTML = `<b>${esc(p.name)} cannot be called straight from a browser.</b> It sends none of the headers a browser needs to allow that, so it can only be reached through a proxy: choose <i>Through my own proxy</i> above, or pick a provider that allows direct calls. ${esc(p.delayNote)}`;
      return;
    }
    if (p.noKey) {
      el.innerHTML = direct
        ? `<b>${esc(p.name)} needs no key.</b> ${esc(p.delayNote)}`
        : `<b>${esc(p.name)} needs no key.</b> Set <code>PROVIDER=${esc(p.id)}</code> on your proxy and leave <code>API_KEY</code> unset. ${esc(p.delayNote)}`;
      return;
    }
    el.innerHTML = `<b>${esc(p.name)} needs a free API key</b>, ${direct
      ? 'which this browser keeps and sends straight to them — nothing to deploy.'
      : 'which goes on your proxy as a secret and never into this page.'} ${esc(p.delayNote)} <a href="${esc(p.site)}" target="_blank" rel="noopener">Get one</a>.`;
  }

  /*
   * Which build is on screen. A browser serving a cached copy of the code looks exactly like a
   * fix that did not work, and this is the quickest way to tell those apart.
   */
  function buildId() {
    const m = document.querySelector('meta[name="build"]');
    return (m && m.content) || 'dev';
  }

  function renderBuildLine() {
    const el = $('buildLine');
    if (!el) return;
    const b = buildId();
    el.innerHTML = b === 'dev'
      ? 'Running from files on this device, not a deployed build.'
      : `Build <code>${esc(b)}</code>. If something was just fixed and still looks wrong here, quote this — it says which code your browser is actually running.`;
  }

  function renderDataState() {
    const el = $('dataState');
    if (!el) return;
    renderBuildLine();
    const Q = window.Quotes, st = Q.state();
    const rows = [];
    if (!st.configured) {
      el.className = 'data-state off';
      el.innerHTML = `<p class="note"><b>Not connected.</b> Real-market mode has no data endpoint, so it has no prices. Simulated and replay modes do not need one and are unaffected.</p>`;
      return;
    }
    /*
     * A page that is forbidden to fetch at all cannot be fixed from this panel, so say that
     * instead of listing settings to check.
     */
    if (st.blocked || (st.lastError && st.lastError.kind === 'blocked')) {
      el.className = 'data-state bad';
      el.innerHTML = `<p class="note"><b>This copy cannot fetch live data.</b> It is running in a sandboxed page whose security policy blocks every outbound request, so no provider and no proxy can be reached — no setting here will change that. The simulated market and replay mode need no connection and work normally.</p>
        <p class="note">For live prices, run your own copy: download the project and open <code>index.html</code>, or host it yourself. Then <em>Straight from this browser</em> works with just your key.</p>`;
      return;
    }
    el.className = 'data-state ' + (st.lastError ? 'bad' : st.lastOk ? 'ok' : 'idle');
    rows.push(`<div><span>Provider</span><b>${esc(st.providerName)}</b></div>`);
    if (st.delayNote) rows.push(`<div><span>Freshness</span><b>${esc(st.delayNote)}</b></div>`);
    rows.push(`<div><span>Last good answer</span><b>${st.lastOk ? esc(st.lastOkText) : 'never'}</b></div>`);
    if (st.limits.perMin) rows.push(`<div><span>Requests used</span><b>${st.limits.usedMin} of ${st.limits.perMin} this minute &middot; ${st.limits.usedDay} of ${st.limits.perDay} today</b></div>`);
    rows.push(`<div><span>Prices held</span><b>${st.symbols} symbol${st.symbols === 1 ? '' : 's'}</b></div>`);
    if (st.paused) rows.push(`<div class="bad"><span>Paused</span><b>After repeated failures. Retrying in ${st.pausedFor}s.</b></div>`);
    if (st.lastError) rows.push(`<div class="bad"><span>Last error</span><b>${esc(st.lastError.message)}</b></div>`);
    el.innerHTML = `<dl class="kv">${rows.join('')}</dl>${st.attribution ? `<p class="note src-note">${esc(st.attribution)} Prices are shown under that provider's terms and are for personal use in this simulator.</p>` : ''}`;
  }

  /*
   * Push the saved endpoint and provider into the quote layer. Called on boot and whenever either
   * changes, so there is exactly one place where the two are connected.
   */
  /*
   * The API key is kept in this browser only, under its own storage key -- never in the saved
   * game. The save is serialised whole and synced to your account when you are signed in, and a
   * key has no business travelling there.
   */
  const KEY_PREF = 'apiKey';
  const getKey = () => uiPref(KEY_PREF) || '';
  const setKey = (v) => uiPref(KEY_PREF, v || '');

  function applyQuoteConfig() {
    const st = S() && S().settings;
    if (!st || !window.Quotes) return;
    window.Quotes.configure({
      mode: st.dataMode === 'direct' ? 'direct' : 'proxy',
      endpoint: st.endpoint || '',
      provider: st.provider || '',
      key: getKey(),
    });
  }

  function agoShort(ms) {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s ago`;
    const m = Math.round(sec / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  }

  function renderLiveAt() {
    const el = $('liveAt');
    if (!el) return;
    const s = S();
    if (ui.liveBusy) { el.textContent = 'Fetching…'; el.className = 'live-at busy'; return; }
    if (!s.liveAt) { el.textContent = 'No prices yet'; el.className = 'live-at bad'; return; }
    const age = Date.now() - s.liveAt;
    const stale = age > 15 * 60000;
    el.textContent = `Updated ${agoShort(age)}`;
    el.className = 'live-at ' + (stale ? 'warn' : 'ok');
    el.title = stale
      ? `These prices were fetched ${agoShort(age)} and are not current. Refresh to get new ones.`
      : `Prices last fetched ${agoShort(age)}. Each one also carries its own timestamp from the provider.`;
  }

  /*
   * Refresh the prices that are actually on screen: what you hold, what you are watching, and the
   * product whose chart is open. Not all 761 -- a free plan allows five requests a minute, and
   * fetching a universe would exhaust the day's budget in one click and price nothing.
   */
  // What a refresh asks for: whatever is on screen, held, resting, or watched.
  function liveWanted() {
    const s = S();
    const want = [];
    const add = (t) => { if (t && E.BY[t] && want.indexOf(t) < 0) want.push(t); };
    if (ui.sheet) add(ui.sheet);
    if (ui.chartT) add(ui.chartT);
    Object.keys(s.holdings).forEach((t) => { if (s.holdings[t] && s.holdings[t].qty > 0) add(t); });
    (s.orders || []).forEach((o) => add(o.t));
    (s.watch || []).forEach(add);
    if (!want.length) ['SPY', 'AAPL', 'MSFT'].forEach(add);
    return want;
  }

  async function refreshLive(explicit) {
    if (!E.liveOn() || ui.liveBusy) return null;
    const want = liveWanted();

    ui.liveBusy = true;
    renderLiveAt();
    const btn = $('liveRefresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
    let res = null;
    try {
      res = await E.syncLive(want);
    } catch (e) {
      res = null;
    } finally {
      ui.liveBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Refresh prices'; }
    }
    const st = window.Quotes.state();
    if (res && res.priced) {
      save();
      refresh();
      if (explicit) {
        const missed = res.unpriced.length;
        toast(missed
          ? `Priced ${res.priced}. ${missed} could not be priced: ${res.unpriced.slice(0, 4).join(', ')}${missed > 4 ? '…' : ''}.`
          : `Priced ${res.priced} product${res.priced === 1 ? '' : 's'} from ${st.providerName}.`);
      }
    } else if (explicit) {
      // A failure says what failed. It does not leave the old numbers looking fresh.
      toast(st.lastError ? st.lastError.message : 'No prices came back.', 'err');
      refresh();
    }
    renderDataState();
    return res;
  }

  /*
   * Auto-refresh. On a plan with no candle history the chart is built from the prices that
   * arrive, so leaving this on is how a chart appears at all. The interval grows with the number
   * of products asked for, to stay well inside a free key's calls a minute; it pauses when the
   * page is hidden rather than spending the quota on a tab nobody is looking at; and a run of
   * failures stops it instead of hammering a provider that is refusing.
   */
  const AUTO_FAIL_STOP = 3;
  function autoEvery() {
    // Never tick faster than a quote is cached for: those ticks would be served the same price
    // from the cache, which is not a new observation and would not add a point to the chart.
    const cache = (window.Quotes.ttlMs ? window.Quotes.ttlMs() : 60000) + 2000;
    return Math.max(30000, liveWanted().length * 3000, cache);
  }

  function setAuto(on, why) {
    ui.auto = !!on;
    ui.autoFails = 0;
    uiPref('liveAuto', ui.auto ? '1' : '');
    clearTimeout(ui.autoTimer);
    ui.autoTimer = null;
    const btn = $('liveAuto');
    if (btn) {
      btn.classList.toggle('on', ui.auto);
      btn.setAttribute('aria-pressed', ui.auto ? 'true' : 'false');
      btn.textContent = ui.auto ? 'Auto on' : 'Auto';
    }
    if (ui.auto) armAuto();
    if (why) toast(why, 'err');
    renderLiveAt();
  }

  function armAuto() {
    clearTimeout(ui.autoTimer);
    if (!ui.auto || !E.liveOn()) return;
    ui.autoTimer = setTimeout(autoTick, autoEvery());
  }

  async function autoTick() {
    if (!ui.auto || !E.liveOn()) return;
    // A hidden page spends nobody's attention, so it should not spend the quota either.
    if (document.hidden) { armAuto(); return; }
    const res = await refreshLive(false);
    if (res && res.priced) ui.autoFails = 0;
    else if (++ui.autoFails >= AUTO_FAIL_STOP) {
      const st = window.Quotes.state();
      setAuto(false, `Auto-refresh stopped after ${AUTO_FAIL_STOP} failed attempts. ${st.lastError ? st.lastError.message : ''}`.trim());
      return;
    }
    armAuto();
  }

  async function testQuoteConnection() {
    const msg = $('dataMsg'), btn = $('dataTestBtn');
    const direct = S().settings.dataMode === 'direct';
    if (direct) {
      setKey(String($('setKey').value || '').trim());
    } else {
      const ep = String($('setEndpoint').value || '').trim();
      if (!ep) { msg.textContent = 'Put your proxy address in first.'; msg.className = 'note msg err'; return; }
      S().settings.endpoint = ep;
    }
    applyQuoteConfig();
    btn.disabled = true; btn.textContent = 'Testing…';
    msg.textContent = 'Asking for a quote…'; msg.className = 'note msg';
    const q = await window.Quotes.quote('AAPL', { force: true });
    btn.disabled = false; btn.textContent = 'Test the connection';
    const st = window.Quotes.state();
    if (q) {
      const f = window.Quotes.freshness(q);
      if (st.provider) S().settings.provider = st.provider;
      save();
      msg.innerHTML = `Connected to <b>${esc(st.providerName)}</b>. AAPL came back at ${q.price} &mdash; ${esc(f.label.toLowerCase())}, ${esc(f.note)}`;
      msg.className = 'note msg ok';
    } else {
      msg.textContent = st.lastError ? st.lastError.message : 'Nothing came back, and no reason was given.';
      msg.className = 'note msg err';
    }
    renderSettings();
  }

  /* ---------- real starting prices ----------
   * Walks the whole built-in list through the provider, slowly enough to stay inside a free
   * plan's rate limit, and records what comes back as the seed for the next simulated game.
   *
   * It reports what it could NOT price as well as what it could: a free plan typically covers US
   * shares and nothing else, so London lines, mutual funds and preferreds come back refused. That
   * is worth saying plainly rather than leaving someone to wonder why Vodafone did not move.
   */
  const refUI = { busy: false, stop: false };

  function renderRefState() {
    const n = E.refPriceCount();
    const at = S().settings.refPricesAt;
    const el = $('refState');
    if (el) el.textContent = n ? `${n} product${n === 1 ? '' : 's'} refreshed${at ? ` ${agoShort(Date.now() - at)}` : ''}` : 'using the built-in levels';
    if ($('refClear')) $('refClear').hidden = !n;
    if ($('refBtn')) $('refBtn').textContent = refUI.busy ? 'Stop' : n ? 'Fetch again' : 'Fetch real starting prices';
  }

  async function fetchRefPrices() {
    if (refUI.busy) { refUI.stop = true; return; }
    const st = window.Quotes.state();
    const msg = $('refMsg');
    if (!st.configured) {
      msg.textContent = 'This needs a data connection. Set your proxy address above first.';
      msg.className = 'note msg err';
      return;
    }
    refUI.busy = true; refUI.stop = false;
    renderRefState();
    const list = E.U.filter((m) => E.liveSupported(m.t)).map((m) => m.t);
    const got = {};
    const failed = [];
    let done = 0;
    for (const t of list) {
      if (refUI.stop) break;
      const lim = window.Quotes.state().limits;
      if (lim.roomDay === 0) { failed.push(t); break; }
      const q = await window.Quotes.quote(E.liveSym(t), { force: true });
      done++;
      if (q && q.price > 0) got[t] = q.price; else failed.push(t);
      if (done % 5 === 0 || done === list.length) {
        msg.innerHTML = `Fetched <b>${Object.keys(got).length}</b> of ${done} tried${failed.length ? `, ${failed.length} not covered` : ''}… <span class="muted">${list.length - done} to go</span>`;
        msg.className = 'note msg';
        renderRefState();
      }
      // A beat between calls so a 60-a-minute key is never pushed over.
      await new Promise((r) => setTimeout(r, 1100));
    }
    refUI.busy = false;
    const res = E.setRefPrices(got);
    save();
    renderRefState();
    const stopped = refUI.stop ? ' Stopped early.' : '';
    if (!res.n) {
      msg.textContent = `Nothing could be priced.${stopped} ${failed.length ? `${st.providerName} does not cover these on your plan.` : ''}`;
      msg.className = 'note msg err';
    } else {
      msg.innerHTML = `Saved <b>${res.n}</b> real starting prices.${stopped} ${failed.length
        ? `${failed.length} could not be priced — ${esc(st.providerName)} does not cover them on your plan (typically London lines, mutual funds and preferreds). Those keep their built-in levels.`
        : ''} Your next simulated game starts from these.`;
      msg.className = 'note msg ok';
    }
    renderSettings();
  }

  function renderMarketNote() {
    const m = $('setMarket') ? $('setMarket').value : 'sim';
    const wrap = $('setMarketDateWrap');
    if (wrap) wrap.hidden = m !== 'real';
    const note = $('setMarketNote');
    if (!note) return;
    if (m === 'sim') note.textContent = 'An invented market. Every one of the 761 products trades, the clock is yours to run, and nothing here is a real price.';
    else if (m === 'real') {
      const b = E.realBounds();
      note.textContent = b ? `Recorded history, ${b.first} to ${b.last}. The prices, dividends and splits that really happened, one day at a time, with nothing after the current day visible.` : 'Recorded history has not loaded yet.';
    } else {
      const st = window.Quotes.state();
      note.innerHTML = st.configured
        ? `Live prices from <b>${esc(st.providerName)}</b> with virtual money. ${esc(st.delayNote || '')} There is no chart until history is fetched for a product, and dividends and splits are not tracked in this mode.`
        : 'This needs a data endpoint, which is not set yet. Set one above first, or the market will have no prices at all.';
    }
  }

  /* ---------- security sheet ---------- */
  function openSheet(t, noFocus, side) {
    if (!E.BY[t]) return;
    ui.sheet = t;
    ui.side = side || (S().holdings[t] && ui.side === 'sell' ? 'sell' : 'buy');
    $('ordQty').value = '';
    $('ordPx').value = '';
    $('ordKind').value = 'market';
    $('tradeMsg').textContent = '';
    $('tradeMsg').className = 'msg';
    $('sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    renderSheet(true);
    if (!noFocus) setTimeout(() => $('ordQty').focus({ preventScroll: true }), 30);
  }
  function closeSheet() {
    ui.sheet = null;
    $('sheet').hidden = true;
    document.body.style.overflow = '';
  }

  /*
   * The statistics panel in live mode. Only what the provider actually sent, plus what the app
   * itself knows. Anything it would take a year of closes to work out is simply absent, which is
   * more useful than a confident-looking figure derived from a single price.
   */
  function liveStats(t, l, m, dash) {
    const Q = window.Quotes, st = Q.state();
    const f = E.liveFresh(t);
    const fetched = l && l.fetchedAt ? new Date(l.fetchedAt).toLocaleTimeString() : null;
    return [
      ['Previous close', l && isFinite(l.prevClose) ? money(l.prevClose, m.cur) : dash],
      ['Day range', l && isFinite(l.low) && isFinite(l.high) ? `${money(l.low, m.cur)} – ${money(l.high, m.cur)}` : dash],
      ['Open', l && isFinite(l.open) ? money(l.open, m.cur) : dash],
      ['Volume', l && isFinite(l.volume) ? Math.round(l.volume).toLocaleString('en-US') : dash],
      ['Data', `${esc(f.label)}${st.providerName ? ` · ${esc(st.providerName)}` : ''}`],
      ['Price is for', l && l.asOfText ? esc(l.asOfText) : dash],
      ['Fetched at', fetched ? esc(fetched) : dash],
      ['Exchange', m.exch],
      ['Type', m.cat || m.type],
      ['Dividends', 'Not tracked in this mode'],
    ];
  }

  function realizedVol(h) {
    const n = Math.min(h.length - 1, 63);
    if (n < 5) return 0;
    let s = 0, s2 = 0;
    for (let i = h.length - n; i < h.length; i++) { const r = Math.log(h[i] / h[i - 1]); s += r; s2 += r * r; }
    const mean = s / n;
    return Math.sqrt(Math.max(s2 / n - mean * mean, 0) * 252);
  }

  function renderSheet(full) {
    const t = ui.sheet;
    if (!t) return;
    const s = S();
    const m = E.BY[t];
    const st = s.sec[t];
    /*
     * In live mode `h` holds the one live price and nothing else, so everything derived from a
     * year of closes -- the 52-week range, the one-year return, realised volatility -- has no
     * answer here. `live` below switches those to the quote's own figures where it has them and
     * to an em dash where it does not, rather than computing a number from a single data point
     * and presenting it as a range.
     */
    const live = E.liveOn();
    const h = st.h;
    const l0 = live ? E.liveOf(t) : null;
    const p = live ? E.price(t) : h[h.length - 1];
    const pc = live ? (l0 && isFinite(l0.prevClose) ? l0.prevClose : NaN) : h[h.length - 2];
    const chg = live
      ? (l0 && l0.changePct != null ? l0.changePct / 100 : (isFinite(pc) && pc > 0 ? p / pc - 1 : NaN))
      : p / h[h.length - 2] - 1;
    const dash = '<span class="muted">—</span>';

    if (full) {
      $('shTicker').textContent = t;
      $('shName').textContent = m.n;
      const badges = [m.cat || m.type, m.exch, m.sector, m.cur === 'GBP' ? 'Priced in GBP' : null, ...m.tags.filter((x) => x !== 'Dividend'), m.custom ? 'Listed by you' : null].filter(Boolean);
      $('shBadges').innerHTML = badges.map((b, i) => `<span class="badge${i === 0 ? ' accent' : ''}">${esc(b)}</span>`).join('');
      document.querySelectorAll('#shRange button').forEach((b) => b.classList.toggle('on', +b.dataset.r === ui.range));
    }
    $('shWatch').textContent = s.watch.includes(t) ? '★ Watching' : '☆ Watch';
    $('shPrice').innerHTML = isFinite(p) ? money(p, m.cur) + (live ? ' ' + freshChip(t) : '') : dash + (live ? ' ' + freshChip(t) : '');
    const usdNote = m.cur === 'GBP' && isFinite(p) ? ` <span class="muted small">≈ ${money(p * s.fx)}</span>` : '';
    $('shChg').innerHTML = isFinite(chg) && isFinite(pc)
      ? `<span class="${cls(chg)}">${signedMoney(p - pc, m.cur)} (${pct(chg)})</span> <span class="muted small">${live && l0 && l0.kind === 'eod' ? 'on the day' : 'today'}</span>${usdNote}${live && l0 && l0.asOfText ? ` <span class="muted small">as of ${esc(l0.asOfText)}</span>` : ''}`
      : live ? `<span class="muted small">${esc(E.liveFresh(t).note)}</span>` : dash;

    const range = Math.min(ui.range, h.length);
    const vals = h.slice(-range);
    const css = getComputedStyle(document.documentElement);
    const up = vals[vals.length - 1] >= vals[0];
    C.candles($('shChart'), Object.assign(ohlcFor(t, range), { type: ui.chartType, fmt: (v) => money(v, m.cur, v >= 1000 ? 0 : undefined).replace('$', '') }));

    const lo = h.length > 1 ? Math.min(...h) : null, hi = h.length > 1 ? Math.max(...h) : null;
    const ann = live ? 0 : E.annualDps(t);
    const ex = live ? null : E.nextExDate(t);
    const stats = live ? liveStats(t, l0, m, dash) : [
      ['Previous close', money(h[h.length - 2], m.cur)],
      ['52-week range', `${money(lo, m.cur)} – ${money(hi, m.cur)}`],
      ['1-year return', `<span class="${cls(p / h[0] - 1)}">${pct(p / h[0] - 1)}</span>`],
      ['Dividend / share', ann > 0 ? `${money(ann, m.cur, ann < 1 ? 4 : 2)} a year` : 'None'],
      ['Dividend yield', ann > 0 ? ((ann / p) * 100).toFixed(2) + '%' : '-'],
      ['Pays', ann > 0 ? (E.divSpeed() === 'normal' ? FREQ[m.q] : `${E.divSpeed() === 'weekly' ? 'Weekly' : 'Monthly'} (sped up)`) : '-'],
      ['Next ex-dividend', ex ? C.shortDate(ex) + ' (est.)' : '-'],
      ['Per payment', ann > 0 ? money(E.perPayment(t), m.cur, 4) : '-'],
      m.track ? ['Tracks', `${m.lev > 0 ? m.lev + 'x' : m.lev + 'x'} ${m.track} daily`] : ['Beta', m.beta.toFixed(2)],
      ['Volatility (3M)', (realizedVol(h) * 100).toFixed(1) + '%'],
      ['Exchange', m.exch],
      ['Type', m.cat || m.type],
    ];
    $('shStats').innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    const pos = s.holdings[t];
    if (pos) {
      const fx = E.fxOf(m);
      const value = pos.qty * p * fx;
      const ret = value - pos.cost;
      const drip = pos.drip ?? s.settings.drip;
      const pend = s.pending.filter((x) => x.t === t).reduce((a, x) => a + x.qty * x.dps * fx, 0);
      $('shPosition').innerHTML = `<div class="position">
        <div class="position-head"><h2 style="margin:0">Your position</h2>${m.q ? `<label class="check" style="font-size:13px"><button type="button" class="drip-toggle${drip ? ' on' : ''}" data-drip="${t}" aria-pressed="${drip}" aria-label="Reinvest dividends"></button> Reinvest dividends</label>` : ''}</div>
        <dl class="stats">
          <div><dt>Shares</dt><dd>${qtyFmt(pos.qty)}</dd></div>
          <div><dt>Market value</dt><dd>${money(value)}</dd></div>
          <div><dt>Average cost</dt><dd>${money(avgCostNative(t), m.cur)}</dd></div>
          <div><dt>Total return</dt><dd class="${cls(ret)}">${signedMoney(ret)} (${pct(pos.cost ? value / pos.cost - 1 : 0)})</dd></div>
          <div><dt>Today</dt><dd class="${cls(chg)}">${isFinite(chg) && isFinite(pc) ? signedMoney(pos.qty * (p - pc) * fx) : dash}</dd></div>
          <div><dt>Income / year</dt><dd>${ann ? money(pos.qty * ann * fx) : '-'}</dd></div>
          ${pend ? `<div><dt>Dividend on the way</dt><dd class="up">${money(pend)}</dd></div>` : ''}
          <div><dt>Held since</dt><dd>${C.shortDate(pos.opened)}</dd></div>
        </dl></div>`;
    } else {
      $('shPosition').innerHTML = '';
    }
    renderTradeForm();
  }

  function sharesFromInput() {
    const t = ui.sheet;
    const m = E.BY[t];
    const raw = parseFloat($('ordQty').value);
    if (!(raw > 0)) return 0;
    if (ui.unit === 'shares') return raw;
    const kind = $('ordKind').value;
    const trig = parseFloat($('ordPx').value);
    const px = kind !== 'market' && trig > 0 ? trig : E.price(t);
    let q = raw / (px * E.fxOf(m));
    q = S().settings.fractional ? Math.floor(q * 10000) / 10000 : Math.floor(q);
    return q;
  }

  function maxBuyShares() {
    const t = ui.sheet, m = E.BY[t], s = S();
    const unit = E.price(t) * (1 + E.halfSpread(m)) * E.fxOf(m) * (m.cur === 'GBP' && s.settings.stamp && m.type !== 'ETF' ? 1.005 : 1);
    const avail = Math.max(s.cash - (+s.settings.commission || 0), 0);
    const q = avail / unit;
    return s.settings.fractional ? Math.floor(q * 10000) / 10000 : Math.floor(q);
  }

  function renderTradeForm() {
    const t = ui.sheet;
    if (!t) return;
    const s = S();
    const m = E.BY[t];
    const pos = s.holdings[t];
    const kind = $('ordKind').value;
    document.querySelectorAll('#sideSeg button').forEach((b) => b.classList.toggle('on', b.dataset.side === ui.side));
    document.querySelectorAll('#unitSeg button').forEach((b) => b.classList.toggle('on', b.dataset.u === ui.unit));
    $('trigField').hidden = kind === 'market';
    $('trigLabel').textContent = `${kind === 'limit' ? 'Limit' : 'Stop'} price (${m.cur})`;

    /*
     * The shortcut buttons follow the unit you picked instead of carrying one of their own.
     *
     * They used to each declare a unit, so choosing USD and then pressing Max threw you back to
     * Shares, and choosing Shares and pressing $100 threw you the other way. The toggle never
     * stuck once you touched a shortcut, which made it look as though pressing USD did nothing.
     */
    const usd = ui.unit === 'usd';
    const shareInUsd = E.price(t) * E.fxOf(m);        // what one share costs in dollars
    const quick = ui.side === 'buy'
      ? (usd
        ? [['$100', 100], ['$1,000', 1000], ['$10,000', 10000], ['Max', E.availableCash()]]
        : [['1', 1], ['10', 10], ['100', 100], ['Max', maxBuyShares()]])
      : pos
        ? ['25%', '50%', 'All'].map((label, i) => {
          const f = [0.25, 0.5, 1][i];
          // Selling the lot in dollars: round up by a penny so converting back to shares cannot
          // land a hair short and strand dust. The engine trims anything over the holding.
          const v = usd
            ? (f === 1 ? Math.ceil(pos.qty * shareInUsd * 100 + 1) / 100 : pos.qty * f * shareInUsd)
            : pos.qty * f;
          return [label, v];
        })
        : [];
    $('quickAmt').innerHTML = quick.filter((x) => x[1] > 0)
      .map(([l, v]) => `<button type="button" data-q="${v}">${l}</button>`).join('');

    const qty = sharesFromInput();
    const trig = parseFloat($('ordPx').value);
    const q = E.quote(t, ui.side, qty, kind !== 'market' && trig > 0 ? trig : undefined);
    const commission = q.fee.commission;
    const stamp = q.fee.stamp;
    const total = q.total;
    const lines = kind === 'market'
      ? [['Bid / ask', `${money(q.bid, m.cur)} / ${money(q.ask, m.cur)}`], [ui.side === 'buy' ? 'You pay (ask)' : 'You get (bid)', money(q.px, m.cur)]]
      : [['Trigger price', money(trig > 0 ? trig : E.price(t), m.cur)], ['Fills near', money(q.px, m.cur)]];
    lines.push(['Shares', qty ? qtyFmt(qty) : '-']);
    if (m.cur === 'GBP') lines.push(['GBP/USD', s.fx.toFixed(4)]);
    if (qty && q.spreadCost >= 0.005) lines.push(['Spread cost', money(q.spreadCost)]);
    if (commission) lines.push(['Commission', money(commission)]);
    if (stamp) lines.push(['Stamp duty 0.5%', money(stamp)]);
    lines.push([ui.side === 'buy' ? 'Estimated cost' : 'Estimated proceeds', qty ? money(total) : '-', 'total']);
    lines.push(['Cash available', money(s.cash)]);
    if (ui.side === 'sell') lines.push(['You own', pos ? qtyFmt(pos.qty) + ' shares' : 'None']);
    $('estimate').innerHTML = lines.map(([k, v, c]) => `<dt class="${c || ''}">${k}</dt><dd class="${c || ''}">${v}</dd>`).join('');

    const btn = $('submitTrade');
    const verb = ui.side === 'buy' ? 'Buy' : 'Sell';
    btn.textContent = kind === 'market' ? `${verb} ${t}` : `Place ${kind} ${verb.toLowerCase()} order`;
    btn.classList.toggle('sell', ui.side === 'sell');
  }

  function submitTrade(e) {
    e.preventDefault();
    const t = ui.sheet;
    const kind = $('ordKind').value;
    const qty = sharesFromInput();
    let res;
    if (kind === 'market') res = E.execute(t, ui.side, qty);
    else res = E.placeOrder(t, ui.side, kind, qty, parseFloat($('ordPx').value));
    const msg = $('tradeMsg');
    if (!res.ok) { msg.textContent = res.msg; msg.className = 'msg err'; return; }
    msg.className = 'msg ok';
    if (kind === 'market') {
      msg.textContent = `${ui.side === 'buy' ? 'Bought' : 'Sold'} ${qtyFmt(qty)} ${t} for ${money(Math.abs(res.q.total))}.${plNote(res.q)}`;
      if (ui.side === 'sell' && res.q.pl != null) toast(`Sold ${qtyFmt(qty)} ${t}.${plNote(res.q)}`);
    } else {
      msg.textContent = `Order placed. It will ${ui.side} ${qtyFmt(qty)} ${t} when the price ${(kind === 'limit') === (ui.side === 'buy') ? 'falls to' : 'reaches'} ${money(parseFloat($('ordPx').value), E.BY[t].cur)}.`;
    }
    $('ordQty').value = '';
    save();
    refresh();
  }

  /* ---------- toasts ---------- */
  /* ---------- asking the user something ----------
   * Replaces window.confirm and window.prompt, which are inert in a sandboxed frame: confirm
   * returns false and prompt returns null, at once and without a word. Anything built on them
   * there is not degraded, it is simply dead. Returns a promise: a string for a prompt, true or
   * false for a confirm, null if cancelled.
   */
  let askResolve = null;
  function ask(opts) {
    const back = $('askBack');
    $('askTitle').textContent = opts.title || '';
    $('askBody').textContent = opts.body || '';
    $('askBody').hidden = !opts.body;
    const wantField = opts.field === true || typeof opts.value === 'string';
    $('askFieldWrap').hidden = !wantField;
    if (wantField) {
      $('askLabel').textContent = opts.label || 'Name';
      $('askField').value = opts.value || '';
      $('askField').placeholder = opts.placeholder || '';
    }
    const yes = $('askYes');
    yes.textContent = opts.yes || 'OK';
    yes.className = 'btn ' + (opts.danger ? 'btn-danger-solid' : 'btn-primary');
    $('askNo').textContent = opts.no || 'Cancel';
    back.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => (wantField ? $('askField') : yes).focus(), 20);
    return new Promise((res) => { askResolve = res; });
  }
  function closeAsk(value) {
    $('askBack').hidden = true;
    document.body.style.overflow = '';
    const r = askResolve;
    askResolve = null;
    if (r) r(value);
  }
  function bindAsk() {
    $('askYes').addEventListener('click', () => {
      const wantField = !$('askFieldWrap').hidden;
      closeAsk(wantField ? $('askField').value.trim() : true);
    });
    $('askNo').addEventListener('click', () => closeAsk(null));
    $('askBack').addEventListener('click', (e) => { if (e.target === $('askBack')) closeAsk(null); });
    $('askField').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('askYes').click(); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('askBack').hidden) { e.preventDefault(); closeAsk(null); }
    });
  }

  function toast(text, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = text;
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
    setTimeout(() => el.remove(), 4500);
  }

  function reportEvents(events) {
    let divAmt = 0; const divT = new Set();
    for (const ev of events) {
      if (ev.kind === 'div') { divAmt += ev.amt; divT.add(ev.t); }
      if (ev.kind === 'fill') {
        const o = ev.order;
        if (ev.res.ok) toast(`${o.kind === 'limit' ? 'Limit' : 'Stop'} order ${ev.partial ? 'partly filled' : 'filled'}: ${o.side === 'buy' ? 'bought' : 'sold'} ${qtyFmt(ev.qty ?? o.qty)} ${o.t} at ${money(ev.res.q.px, E.BY[o.t].cur)}.${ev.partial ? ` ${qtyFmt(o.qty - o.filled)} still working.` : ''}${plNote(ev.res.q)}`);
        else toast(`Order for ${o.t} cancelled: ${ev.res.msg}`);
      }
      if (ev.kind === 'alert') toast(`${ev.t} ${E.alertText(ev.alert)}${ev.alert.note ? ` — ${ev.alert.note}` : ''}.`);
      if (ev.kind === 'expired') toast(`Your order to ${ev.order.side} ${qtyFmt(ev.order.qty - ev.order.filled)} ${ev.order.t} expired without filling.`);
      if (ev.kind === 'split' && S().holdings[ev.t]) toast(`${ev.t} split ${ev.r >= 1 ? ev.r + '-for-1' : '1-for-10'}. Your share count was adjusted.`);
      if (ev.kind === 'macro' && ui.playing && ui.speed <= 1) toast(ev.text);
    }
    if (divAmt > 0 && ui.playing && ui.speed > 2) {
      // At high speed, collect dividend payments into one toast every few seconds.
      const acc = ui.divAcc || (ui.divAcc = { amt: 0, t: new Set(), at: Date.now() });
      acc.amt += divAmt;
      divT.forEach((t) => acc.t.add(t));
      if (Date.now() - acc.at < 3000) return;
      divAmt = acc.amt; divT.clear(); acc.t.forEach((t) => divT.add(t));
      ui.divAcc = null;
    }
    if (divAmt > 0) {
      const list = [...divT];
      toast(`Dividends paid: ${money(divAmt)} from ${list.slice(0, 4).join(', ')}${list.length > 4 ? ` and ${list.length - 4} more` : ''}`);
    }
  }

  /* ---------- clock ---------- */
  function advance(days) {
    const all = [];
    for (let i = 0; i < days; i++) all.push(...E.step());
    if (days > 1) {
      // Collapse a long skip into one summary instead of a toast per event.
      const fills = all.filter((e) => e.kind === 'fill' || e.kind === 'split' || e.kind === 'expired' || e.kind === 'alert');
      const divs = all.filter((e) => e.kind === 'div');
      reportEvents([...fills.slice(-3), ...divs]);
    } else {
      reportEvents(all);
    }
    save();
    refresh();
  }

  // ui.speed is trading days per second. Fast speeds run several days per tick so the page keeps up.
  function setPlaying(on) {
    if (on && ui.skip) return;
    ui.playing = on;
    clearInterval(ui.timer);
    $('playBtn').textContent = on ? 'Pause' : 'Play';
    $('playBtn').setAttribute('aria-pressed', String(on));
    $('fcPlay').textContent = on ? 'Pause' : 'Play';
    $('fcPlay').setAttribute('aria-pressed', String(on));
    if (!on) return;
    const interval = Math.max(1000 / ui.speed, 60);
    const perTick = (ui.speed * interval) / 1000;
    let acc = 0;
    ui.timer = setInterval(() => {
      acc += perTick;
      const n = Math.floor(acc + 1e-9);
      if (n > 0) { acc -= n; advance(n); }
    }, interval);
  }

  function setSpeed(x) {
    ui.speed = x;
    uiPref('speedx', x);
    document.querySelectorAll('#speedSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === x));
    if (ui.playing) setPlaying(true);
  }

  function addCalendar(isoDate, unit, n) {
    const d = E.parseISO(isoDate);
    if (unit === 'w') { d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10); }
    // Months and years land on the same day of the month, or the month's last day (31 Jan + 1M = 28 Feb).
    const months = unit === 'y' ? 12 * n : n;
    const y = d.getUTCFullYear(), mo = d.getUTCMonth() + months, day = d.getUTCDate();
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, mo, Math.min(day, last))).toISOString().slice(0, 10);
  }

  const MAX_SKIP = 252 * 25;
  function skipBy(n, unit) {
    const steps = unit === 'd' ? n : E.tradingDaysUntil(addCalendar(S().date, unit, n));
    runSkip(steps);
  }

  // Runs many trading days in small chunks so the page stays responsive and shows progress.
  function runSkip(steps, opts = {}) {
    if (ui.skip) return;
    steps = Math.min(steps, MAX_SKIP);
    if (steps <= 0) { toast('That date is not after the current market day.'); return; }
    setPlaying(false);
    const s = S();
    const job = ui.skip = { done: 0, total: steps, stop: false, found: false, events: [], from: s.date, nw: E.netWorth(), divs: s.divLog.length };
    const showBar = steps > 25;
    $('skipProgress').hidden = !showBar;
    const tick = () => {
      const t0 = performance.now();
      while (job.done < job.total && !job.stop && performance.now() - t0 < 40) {
        const ev = E.step();
        job.done++;
        for (const e of ev) if (e.kind === 'fill' || e.kind === 'split' || e.kind === 'div' || e.kind === 'expired' || e.kind === 'alert') job.events.push(e);
        if (opts.untilPay && ev.some((e) => e.kind === 'div')) { job.found = true; job.stop = true; }
      }
      if (showBar) {
        $('skipBar').style.width = ((job.done / job.total) * 100).toFixed(1) + '%';
        $('skipText').textContent = `${C.shortDate(S().date)} · ${job.done}/${job.total} days`;
        renderHeader();
      }
      if (job.done < job.total && !job.stop) setTimeout(tick, 0);
      else finishSkip(job, opts);
    };
    tick();
  }

  function finishSkip(job, opts) {
    ui.skip = null;
    $('skipProgress').hidden = true;
    const s = S();
    if (job.done === 1 && !opts.untilPay) {
      reportEvents(job.events);
    } else {
      reportEvents(job.events.filter((e) => e.kind !== 'div').slice(-3));
      const newDivs = s.divLog.slice(0, s.divLog.length - job.divs);
      const divAmt = newDivs.reduce((a, d) => a + d.amt, 0);
      const change = E.netWorth() - job.nw;
      let text = `Skipped ${job.done} trading day${job.done === 1 ? '' : 's'} to ${longDate(s.date)}. Net worth ${signedMoney(change)}.`;
      if (newDivs.length) text += ` ${newDivs.length} dividend payment${newDivs.length === 1 ? '' : 's'}: ${money(divAmt)}.`;
      if (opts.untilPay && !job.found) text += ' No dividend was paid in that time.';
      toast(text);
    }
    if (ui.calFollow) { ui.calMonth = s.date.slice(0, 7); ui.calSel = s.date; }
    $('skipDate').min = E.nextTradingDay(s.date);
    if ($('skipDate').value <= s.date) $('skipDate').value = addCalendar(s.date, 'm', 1);
    save();
    refresh();
  }

  function skipToNextPayout() {
    const s = S();
    const payers = Object.keys(s.holdings).some((t) => E.annualDps(t) > 0);
    if (!payers && !s.pending.length) { toast('You do not own any dividend payers yet. Buy one first, for example KO, O or SCHD.'); return; }
    runSkip(400, { untilPay: true });
  }

  function setDivSpeed(mode) {
    S().settings.divSpeed = mode;
    save();
    renderDivSpeed();
    refresh();
  }

  const DIVSPEED_NOTE = {
    normal: 'Every security pays on its real schedule: monthly, quarterly, twice a year or yearly. US payments arrive about 2 weeks after the ex-date, UK about 4 weeks.',
    monthly: 'Sped up: every dividend payer pays once a month, 5 trading days after the ex-date. The yearly amount is the same, split into 12 payments.',
    weekly: 'Sped up: every dividend payer pays once a week, the trading day after the ex-date. The yearly amount is the same, split into 52 payments.',
  };
  function renderDivSpeed() {
    const mode = E.divSpeed();
    document.querySelectorAll('[data-divspeed]').forEach((b) => b.classList.toggle('on', b.dataset.divspeed === mode));
    document.querySelectorAll('.divspeed-note').forEach((n) => { n.textContent = DIVSPEED_NOTE[mode]; });
    $('setDivSpeed').value = mode;
  }


  /* ---------- dividend calculator ---------- */
  const CALC_TAX = {
    ira: [0, 0], us: [15, 0], usord: [24, 0], isa_us: [15, 0], isa_uk: [0, 0],
    gia: [8.75, 500], giah: [33.75, 500],
  };
  const FUND_FEE = {
    'Index ETF': 0.03, 'Dividend ETF': 0.06, 'Income ETF': 0.35, 'Sector ETF': 0.09, 'Bond ETF': 0.04, 'Leveraged ETF': 0.95,
    'Inverse ETF': 0.95, 'Commodity ETF': 0.3, 'Crypto ETF': 0.25, 'International ETF': 0.07, 'Preferred ETF': 0.45,
    'Thematic ETF': 0.75, 'UK ETF': 0.07, 'Mutual Fund': 0.04, 'Investment Trust': 0.35,
  };
  const r1 = (v) => Math.round(v * 10) / 10;

  // Long-run assumptions for a security: dividend growth, price growth and yearly fee.
  function calcAssumptions(m, yieldPct) {
    const bondLike = m.type === 'Preferred' || m.cat === 'Bond ETF' || m.cat === 'Preferred ETF' || (m.type === 'Mutual Fund' && m.rate >= 0.5);
    // Equities: a long-run total return of about 8.5% a year (yield + growth). Dividends and the
    // share price grow at the same rate, so the yield stays steady instead of drifting.
    const TOTAL = 8.5;
    let dg, pg;
    if (bondLike) { dg = 0; pg = 0; }
    else if (m.cat === 'Income ETF') { dg = 0; pg = 1; }           // covered-call funds give up most growth
    else if (m.cat === 'Commodity ETF' || m.cat === 'Crypto ETF' || m.track) { dg = 0; pg = 5; }
    else if (yieldPct <= 0) { dg = 0; pg = 7; }
    else {
      let cap = m.arist ? 6 : ['REIT', 'BDC', 'MLP'].includes(m.type) ? 3.5 : 7;
      const g = r1(Math.min(cap, Math.max(0, TOTAL - yieldPct)));
      dg = g; pg = g;
    }
    const fee = FUND_FEE[m.cat] ?? FUND_FEE[m.type] ?? 0;
    return { dg, pg, fee };
  }

  function calcAccountFor(m) {
    const a = S().settings.account;
    if (a === 'ira') return 'ira';
    if (a === 'isa') return m && m.cur === 'GBP' ? 'isa_uk' : 'isa_us';
    if (a === 'gia' || a === 'giah') return a;
    return m && E.isOrdinaryIncome(m) ? 'usord' : 'us';
  }

  function setCalcAccount(key) {
    $('calcAccount').value = key;
    const [rate, allowGBP] = CALC_TAX[key] || [15, 0];
    $('calcTax').value = rate;
    $('calcAllow').value = Math.round(allowGBP * S().fx);
  }

  function calcFromTicker(t) {
    const m = E.BY[(t || '').toUpperCase().trim()];
    if (!m) { $('calcSrcNote').textContent = 'No security with that ticker. Pick one from the list.'; return; }
    const y = E.fwdYield(m.t) * 100;
    const a = calcAssumptions(m, y);
    $('calcTicker').value = m.t;
    $('calcYield').value = r1(y * 10) / 10 || 0;
    $('calcDivGrowth').value = a.dg;
    $('calcPriceGrowth').value = a.pg;
    $('calcFee').value = a.fee;
    $('calcFreq').value = String([12, 4, 2, 1].includes(m.q) ? m.q : 4);
    setCalcAccount(calcAccountFor(m));
    $('calcSrcNote').textContent = `${m.n} at ${money(E.price(m.t), m.cur)}, yielding ${y.toFixed(2)}%. Growth rates are long-run assumptions you can change.`;
    renderCalc();
  }

  function calcFromPortfolio() {
    const rows = holdingsRows();
    const mv = rows.reduce((a, r) => a + r.value, 0);
    if (!mv) { $('calcSrcNote').textContent = 'You do not own anything yet. Buy some shares first, or start from a ticker.'; return; }
    let inc = 0, dg = 0, pg = 0, fee = 0;
    for (const r of rows) {
      const y = E.fwdYield(r.t) * 100;
      const a = calcAssumptions(r.m, y);
      const w = r.value / mv;
      inc += r.income; dg += a.dg * w; pg += a.pg * w; fee += a.fee * w;
    }
    $('calcStart').value = Math.round(mv);
    $('calcYield').value = r1((inc / mv) * 1000) / 10;
    $('calcDivGrowth').value = r1(dg);
    $('calcPriceGrowth').value = r1(pg);
    $('calcFee').value = Math.round(fee * 100) / 100;
    $('calcFreq').value = '4';
    $('calcTicker').value = '';
    setCalcAccount(calcAccountFor(null));
    $('calcSrcNote').textContent = `Your ${rows.length} holdings: ${money(mv)} invested, ${money(inc)} a year in dividends before tax.`;
    renderCalc();
  }

  function calcInputs() {
    const num = (id, lo, hi, def) => { const v = parseFloat($(id).value); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
    return {
      start: num('calcStart', 0, 1e10, 0), monthly: num('calcMonthly', 0, 1e8, 0), years: Math.round(num('calcYears', 1, 60, 20)),
      yield: num('calcYield', 0, 30, 0), divGrowth: num('calcDivGrowth', -20, 30, 0), priceGrowth: num('calcPriceGrowth', -20, 30, 0),
      freq: +$('calcFreq').value, drip: $('calcDrip').checked, taxRate: num('calcTax', 0, 60, 0), allowance: num('calcAllow', 0, 1e7, 0),
      inflation: num('calcInfl', 0, 15, 0), fee: num('calcFee', 0, 3, 0),
    };
  }

  function renderCalc() {
    const p = calcInputs();
    if (!p.start && !p.monthly) {
      $('calcHeadline').textContent = 'Enter an initial investment or a monthly contribution to see a projection.';
      return;
    }
    const r = window.DivCalc.project(p);
    const alt = window.DivCalc.project(Object.assign({}, p, { drip: !p.drip }));
    const first = r.rows[0], last = r.rows[r.rows.length - 1];
    const irrTxt = r.irr == null ? '-' : pct(r.irr).replace('+', '');
    $('calcHeadline').innerHTML =
      `Investing <strong>${money(p.start, 'USD', 0)}</strong>${p.monthly ? ` plus <strong>${money(p.monthly, 'USD', 0)} a month</strong>` : ''} for <strong>${p.years} year${p.years === 1 ? '' : 's'}</strong> grows to about <strong>${money(r.final, 'USD', 0)}</strong>, ` +
      `paying <strong>${money(last.net, 'USD', 0)} a year</strong> (${money(last.net / 12, 'USD', 0)} a month) in dividends after tax by the final year. ` +
      `That is a yearly return of <strong>${irrTxt}</strong> after tax and fees. ` +
      `${p.drip ? 'Without reinvesting' : 'Reinvesting'} the dividends, you would end with ${money(alt.final, 'USD', 0)} and ${money(alt.rows[alt.rows.length - 1].net, 'USD', 0)} a year of income.`;

    $('calcTiles').innerHTML =
      tile('Yearly return', irrTxt, 'after tax and fees, per year') +
      tile('Year 1 income', money(first.net), `${money(first.net / 12)} a month`) +
      tile(`Year ${p.years} income`, money(last.net), `yield on cost ${(last.yoc * 100).toFixed(1)}%`) +
      tile('Final value', money(r.final, 'USD', 0), `${money(last.real, 'USD', 0)} in today's money`) +
      tile('Total put in', money(r.contributed, 'USD', 0), `${signedMoney(r.final - r.contributed).replace(/\.\d+$/, '')} growth`) +
      tile('Dividends received', money(r.totals.net, 'USD', 0), `${money(r.totals.tax, 'USD', 0)} tax paid`);

    const css = getComputedStyle(document.documentElement);
    const tok = (n) => css.getPropertyValue(n).trim();
    const labels = ['Now', ...r.rows.map((x) => `Year ${x.year}`)];
    C.line($('calcChart'), {
      labels, labelFmt: (x) => x,
      series: [
        { name: 'Value', values: [p.start, ...r.rows.map((x) => x.value)], color: tok('--accent'), fill: true },
        { name: 'Put in', values: [p.start, ...r.rows.map((x) => x.contributed)], color: tok('--chart-b'), width: 1.4, dash: [4, 3] },
        { name: "Today's money", values: [p.start, ...r.rows.map((x) => x.real)], color: tok('--chart-c'), width: 1.4 },
      ],
      fmt: compact,
    });
    C.bars($('calcBars'), { values: r.rows.map((x) => x.net), labels: r.rows.map((x) => String(x.year)), fmt: compact });

    $('calcBody').innerHTML = r.rows.map((x) => `<tr>
      <td>${x.year}</td><td class="r">${money(x.contributed, 'USD', 0)}</td><td class="r">${money(x.net)}</td>
      <td class="r hide-sm muted">${money(x.tax)}</td><td class="r">${money(x.net / 12)}</td><td class="r hide-sm">${(x.yoc * 100).toFixed(2)}%</td>
      <td class="r">${money(x.value, 'USD', 0)}</td><td class="r hide-md muted">${money(x.real, 'USD', 0)}</td></tr>`).join('');

    const freqTxt = { 12: 'monthly', 4: 'quarterly', 2: 'twice a year', 1: 'once a year' }[p.freq];
    $('calcAssume').textContent =
      `Assumes dividends are paid ${freqTxt} and raised once a year, the share price grows smoothly at ${p.priceGrowth}% a year, ` +
      `contributions go in at the end of each month, and ${p.fee ? `a ${p.fee}% yearly fund fee comes out of the value` : 'there are no fund fees'}. ` +
      `${p.taxRate ? `Dividends are taxed at ${p.taxRate}%${p.allowance ? ` above ${money(p.allowance, 'USD', 0)} a year` : ''}; ` : 'Dividends are not taxed; '}` +
      `capital gains tax on selling is not included. Real markets move unevenly and companies can cut dividends, so treat this as an estimate, not a promise.`;
  }

  function bindCalc() {
    $('calcList').innerHTML = E.U.filter((m) => m.y > 0 || m.type === 'ETF').map((m) => `<option value="${esc(m.t)}">${esc(m.n)}</option>`).join('');
    let t;
    $('calcForm').addEventListener('input', (e) => {
      if (e.target.id === 'calcTicker') return;
      if (e.target.id === 'calcTax' || e.target.id === 'calcAllow') $('calcAccount').value = 'custom';
      clearTimeout(t); t = setTimeout(renderCalc, 120);
    });
    $('calcAccount').addEventListener('change', (e) => { if (e.target.value !== 'custom') setCalcAccount(e.target.value); renderCalc(); });
    $('calcForm').addEventListener('submit', (e) => { e.preventDefault(); calcFromTicker($('calcTicker').value); });
    $('calcTicker').addEventListener('change', () => { if (E.BY[$('calcTicker').value.toUpperCase().trim()]) calcFromTicker($('calcTicker').value); });
    $('calcUseTicker').addEventListener('click', () => calcFromTicker($('calcTicker').value));
    $('calcUsePf').addEventListener('click', calcFromPortfolio);
    setCalcAccount(calcAccountFor(null));
  }

  /* ---------- calendar ---------- */
  function calEvents(fromISO, toISO) {
    const s = S();
    const extra = E.econEvents(fromISO, toISO).map((e) => ({ d: e.d, kind: e.kind, name: e.name, note: e.note }));
    const held = Object.keys(s.holdings);
    const tickers = ui.calWatch ? [...new Set([...held, ...s.watch])] : held;
    const ev = extra.slice();
    const within = (d) => d && d >= fromISO && d <= toISO;
    for (const d of s.divLog) {
      if (d.d < fromISO && (!d.ex || d.ex < fromISO)) break;   // divLog is newest first
      if (within(d.d)) ev.push({ d: d.d, t: d.t, kind: 'paid', amt: d.amt, dps: d.dps, cur: d.cur, qty: d.qty, drip: d.drip });
      if (within(d.ex)) ev.push({ d: d.ex, t: d.t, kind: 'ex', past: true, dps: d.dps, cur: d.cur, qty: d.qty });
    }
    for (const p of s.pending) {
      const m = E.BY[p.t]; if (!m) continue;
      const amt = p.qty * p.dps * E.fxOf(m);
      if (within(p.pay)) ev.push({ d: p.pay, t: p.t, kind: 'pay', firm: true, amt, dps: p.dps, cur: m.cur, qty: p.qty });
      if (within(p.ex)) ev.push({ d: p.ex, t: p.t, kind: 'ex', past: true, dps: p.dps, cur: m.cur, qty: p.qty });
    }
    if (toISO > s.date && tickers.length) {
      for (const e of E.futureEvents(tickers, toISO)) {
        if (!within(e.d)) continue;
        const m = E.BY[e.t], h = s.holdings[e.t];
        const qty = h ? h.qty : 0;
        ev.push(Object.assign({}, e, { cur: m.cur, qty, amt: e.dps != null ? qty * e.dps * E.fxOf(m) : 0 }));
      }
    }
    const order = { paid: 0, pay: 1, ex: 2, earn: 3 };
    ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : order[a.kind] - order[b.kind] || b.amt - a.amt));
    return ev;
  }

  function calMove(delta) {
    const [y, m] = ui.calMonth.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = d.toISOString().slice(0, 7);
    const limit = addCalendar(S().date, 'y', 3).slice(0, 7);
    if (next > limit) { toast('The calendar looks ahead up to 3 years.'); return; }
    ui.calMonth = next;
    ui.calFollow = false;
    ui.calSel = null;
    renderCalendar();
  }

  function renderCalendar() {
    const s = S();
    if (!ui.calMonth) ui.calMonth = s.date.slice(0, 7);
    const [y, mo] = ui.calMonth.split('-').map(Number);
    const first = new Date(Date.UTC(y, mo - 1, 1));
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;
    const from = `${ui.calMonth}-01`, to = `${ui.calMonth}-${String(days).padStart(2, '0')}`;
    $('calTitle').textContent = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const ev = calEvents(from, to);
    const byDay = {};
    for (const e of ev) (byDay[e.d] = byDay[e.d] || []).push(e);
    if (!ui.calSel || !ui.calSel.startsWith(ui.calMonth)) {
      ui.calSel = s.date.startsWith(ui.calMonth) ? s.date : (ev.find((e) => e.kind === 'pay' || e.kind === 'paid') || {}).d || from;
    }

    let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<div class="cal-h${i > 4 ? ' wk' : ''}">${d}</div>`).join('');
    for (let i = 0; i < lead; i++) html += '<div class="cal-cell blank"></div>';
    for (let dnum = 1; dnum <= days; dnum++) {
      const ds = `${ui.calMonth}-${String(dnum).padStart(2, '0')}`;
      const wd = (lead + dnum - 1) % 7;
      const list = byDay[ds] || [];
      const cash = list.filter((e) => e.kind === 'pay' || e.kind === 'paid').reduce((a, e) => a + e.amt, 0);
      const cls2 = ['cal-cell', wd > 4 ? 'wk' : '', ds === s.date ? 'today' : '', ds < s.date ? 'past' : '', ds === ui.calSel ? 'sel' : ''].filter(Boolean).join(' ');
      const shown = list.slice(0, 3).map((e) => `<span class="ev ev-${e.kind}${e.est ? ' est' : ''}">${e.t ? `${esc(e.t)}${e.kind === 'ex' ? ' ex' : e.kind === 'earn' ? ' earns' : ''}` : esc(e.kind === 'holiday' ? 'Closed' : e.kind === 'national' ? e.name : e.name)}</span>`).join('');
      const dots = [...new Set(list.map((e) => e.kind))].map((k) => `<i class="ev-dot ev-${k}"></i>`).join('');
      html += `<button type="button" class="${cls2}" data-day="${ds}" aria-label="${longDate(ds)}${list.length ? `, ${list.length} events` : ''}">
        <span class="cal-num">${dnum}${ds === s.date ? '<em>today</em>' : ''}</span>
        ${cash > 0 ? `<span class="cal-cash">${compact(cash)}</span>` : ''}
        <span class="cal-evs">${shown}${list.length > 3 ? `<span class="ev more">+${list.length - 3} more</span>` : ''}</span>
        <span class="cal-dots">${dots}</span>
      </button>`;
    }
    $('calGrid').innerHTML = html;
    renderCalDay(byDay[ui.calSel] || []);
    renderCalMonth(ev, from, to);
  }

  function evText(e) {
    const m = E.BY[e.t];
    const per = e.dps != null ? money(e.dps, e.cur, 4) + ' a share' : '';
    switch (e.kind) {
      case 'paid': return `<b>${money(e.amt)}</b> paid (${per} on ${qtyFmt(+e.qty.toFixed(4))} shares)${e.drip ? ', reinvested' : ''}`;
      case 'pay': return e.firm
        ? `<b>${money(e.amt)}</b> on the way. Declared and locked in (${qtyFmt(+e.qty.toFixed(4))} shares).`
        : e.qty ? `About <b>${money(e.amt)}</b> if you still own ${qtyFmt(+e.qty.toFixed(4))} shares on ${C.shortDate(e.ex)}` : `Pays ${per}. Own shares on ${C.shortDate(e.ex)} to get it.`;
      case 'ex': return e.past ? `Went ex-dividend: ${per}` : `Ex-dividend day: ${per}. You must own the shares <b>before</b> this day.`;
      case 'earn': return `Quarterly earnings. ${m && m.vol > 0.45 ? 'Expect a big move either way.' : 'The price can jump either way.'}`;
      case 'econ': return `${esc(e.note)}. Figures like this move the whole market, not one company.`;
      case 'holiday': return `${E.marketStatus().market || 'The exchange'} is shut. No prices move and nothing trades.`;
      case 'national': return `${esc(e.note)}. You may be off work, but the exchange trades as usual.`;
    }
    return '';
  }
  const EV_LABEL = { paid: 'Paid', pay: 'Payday', ex: 'Ex-dividend', earn: 'Earnings', econ: 'Economy', holiday: 'Closed', national: 'Your holiday' };

  function renderCalDay(list) {
    const s = S();
    const ds = ui.calSel;
    const wd = E.parseISO(ds).getUTCDay();
    let body = list.length
      ? `<ul class="cal-list">${list.map((e) => `<li${e.t ? ` data-open="${e.t}"` : ''}><span class="ev ev-${e.kind}${e.est ? ' est' : ''}">${EV_LABEL[e.kind]}${e.est ? ' (est.)' : ''}</span><span>${e.t ? `<b class="num">${esc(e.t)}</b> <span class="muted">${esc(E.BY[e.t] ? E.BY[e.t].n : '')}</span>` : `<b>${esc(e.name || '')}</b>`}<br>${evText(e)}</span></li>`).join('')}</ul>`
      : `<p class="muted">${ds < s.date ? 'Nothing happened for your holdings on this day.' : 'Nothing scheduled for your holdings on this day.'}</p>`;
    let action = '';
    if (ds > s.date) {
      const n = E.tradingDaysUntil(ds);
      action = n > 0
        ? `<button class="btn btn-primary" type="button" data-skipto="${ds}">Skip to this day</button> <span class="muted small">${n} trading day${n === 1 ? '' : 's'} ahead${wd === 0 || wd === 6 ? '. Markets are shut at weekends, so time stops on the Friday before.' : ''}</span>`
        : `<span class="muted small">Markets are shut at weekends. The next trading day is ${C.shortDate(E.nextTradingDay(s.date))}.</span>`;
    } else if (ds === s.date) action = '<span class="muted small">This is today in the simulation.</span>';
    $('calDay').innerHTML = `<h2>${longDate(ds)}</h2>${body}<div class="cal-action">${action}</div>`;
  }

  function renderCalMonth(ev, from, to) {
    const s = S();
    const exp = ev.filter((e) => e.kind === 'pay').reduce((a, e) => a + e.amt, 0);
    const got = ev.filter((e) => e.kind === 'paid').reduce((a, e) => a + e.amt, 0);
    const paydays = {};
    for (const e of ev) if ((e.kind === 'pay' || e.kind === 'paid') && e.amt > 0) paydays[e.d] = (paydays[e.d] || 0) + e.amt;
    const rows = Object.entries(paydays);
    const title = E.parseISO(from).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
    let html = `<h2>${title} at a glance</h2>
      <div class="cal-sum">
        <div><span class="eyebrow">Received</span><b class="num up">${money(got)}</b></div>
        <div><span class="eyebrow">Still to come</span><b class="num">${money(exp)}</b></div>
        <div><span class="eyebrow">Ex-dividend days</span><b class="num">${ev.filter((e) => e.kind === 'ex').length}</b></div>
      </div>`;
    if (rows.length) {
      html += `<div class="table-wrap"><table class="grid"><thead><tr><th>Payday</th><th class="r">Amount</th><th></th></tr></thead><tbody>${rows.map(([d, a]) => `<tr><td class="num">${longDate(d)}</td><td class="r ${d <= s.date ? 'up' : ''}">${money(a)}</td><td class="r">${d > s.date ? `<button class="btn btn-ghost" type="button" data-skipto="${d}">Skip here</button>` : '<span class="muted small">Paid</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (!Object.keys(s.holdings).length) {
      html += '<p class="muted">Your calendar fills up once you own dividend payers. Try a monthly payer like O or JEPI, or a quarterly one like KO or SCHD.</p>';
    } else {
      html += `<p class="muted">No dividend paydays for your holdings this month.${E.divSpeed() === 'normal' ? ' Switch dividend speed to Every month or Every week to get paid more often.' : ''}</p>`;
    }
    $('calMonth').innerHTML = html;
  }


  /* ---------- full-screen chart ---------- */
  function openFocus() {
    ui.focus = true;
    $('focus').hidden = false;
    document.body.style.overflow = 'hidden';
    const el = $('focus');
    // Real full screen where the browser allows it; the overlay already fills the window otherwise.
    try { const r = el.requestFullscreen && el.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed */ }
    renderFocus();
    $('fcPlay').focus({ preventScroll: true });
  }

  function closeFocus() {
    if (!ui.focus) return;
    ui.focus = false;
    hideQuick();
    $('focus').hidden = true;
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    renderWorkspace();
  }

  function renderFocus() {
    if (!ui.focus) return;
    const t = chartTicker(), m = E.BY[t], s = S();
    const p = E.price(t), pc = E.prevClose(t), chg = p / pc - 1;
    const q = E.quote(t, 'buy', 1);
    $('fcT').textContent = t;
    $('fcName').textContent = m.n;
    $('fcPrice').textContent = money(p, m.cur);
    $('fcChg').innerHTML = `<span class="${cls(chg)}">${signedMoney(p - pc, m.cur)} (${pct(chg)})</span>`;
    const own = s.holdings[t];
    $('fcMeta').textContent = `${longDate(s.date)}${own ? ` · You own ${qtyFmt(+own.qty.toFixed(4))}` : ''} · Cash ${money(s.cash, 'USD', 0)}`;
    $('fcSellPx').innerHTML = priceHTML(q.bid, m.cur);
    $('fcBuyPx').innerHTML = priceHTML(q.ask, m.cur);
    const canvas = $('focusChart');
    const avail = $('focus').clientHeight - document.querySelector('.focus-bar').offsetHeight - 16;
    canvas.dataset.h = Math.max(220, Math.round(avail));
    const fd = ohlcFor(t, ui.chartRange);
    C.candles(canvas, Object.assign(fd, { timeAxis: true, drawings: drawingsFor(t, fd.c.length), trades: tradesFor(t, fd.c.length), type: ui.chartType, overlays: maOverlays(t, fd.c.length), fmt: (v) => money(v, m.cur, v >= 1000 ? 0 : undefined).replace('$', '') }));
    if (!$('quickTicket').hidden) renderQuick();
  }

  function showQuick(side) {
    ui.qside = side;
    const t = chartTicker(), s = S();
    const own = s.holdings[t];
    let def;
    if (side === 'buy') {
      const unit = E.quote(t, 'buy', 1).total;
      def = Math.max(0, Math.min(10, Math.floor((s.cash - (+s.settings.commission || 0)) / unit)));
    } else {
      def = own ? +own.qty.toFixed(4) : 0;
    }
    $('qtQty').value = def || '';
    $('qtMsg').textContent = ''; $('qtMsg').className = 'msg';
    $('quickTicket').hidden = false;
    renderQuick();
    setTimeout(() => $('qtQty').select(), 30);
  }

  function hideQuick() { $('quickTicket').hidden = true; }

  /*
   * A quantity for a form field: enough places to be exact, with trailing zeros removed so the
   * box reads "0.0001" rather than "0.00010000000000000001".
   */
  function trimQty(v) {
    if (!(v > 0)) return '';
    const n = +(+v).toFixed(8);
    return String(n);
  }

  function renderQuick() {
    const t = chartTicker(), m = E.BY[t], s = S(), side = ui.qside;
    const own = s.holdings[t];
    const qty = parseFloat($('qtQty').value) || 0;
    const q = E.quote(t, side, qty || 0);
    $('qtTitle').textContent = `${side === 'buy' ? 'Buy' : 'Sell'} ${t}`;
    $('qtLabel').textContent = side === 'buy' ? `Shares to buy at ${money(q.px, m.cur)}` : `Shares to sell at ${money(q.px, m.cur)}`;
    const opts = side === 'buy' ? [1, 10, 100] : own ? [['Half', own.qty / 2], ['All', own.qty]] : [];
    $('qtQuick').innerHTML = opts.map((o) => Array.isArray(o)
      ? `<button type="button" data-qq="${trimQty(o[1])}">${o[0]}</button>`
      : `<button type="button" data-qq="${o}">${o}</button>`).join('');
    $('qtEst').innerHTML = side === 'buy'
      ? `Cost <b>${qty ? money(q.total) : '-'}</b> · Cash ${money(s.cash)}`
      : own ? `You get <b>${qty ? money(q.total) : '-'}</b> · You own ${E.fmtQtyExact(own.qty)}` : 'You do not own any of this yet.';
    const go = $('qtGo');
    go.textContent = `${side === 'buy' ? 'Buy' : 'Sell'} ${qty ? qtyFmt(qty) + ' ' : ''}${t}`;
    go.className = `btn btn-block ${side}`;
    go.disabled = side === 'sell' && !own;
  }

  function submitQuick(e) {
    e.preventDefault();
    const t = chartTicker();
    const qty = parseFloat($('qtQty').value);
    const res = E.execute(t, ui.qside, qty);
    if (!res.ok) { $('qtMsg').textContent = res.msg; $('qtMsg').className = 'msg err'; return; }
    toast(`${ui.qside === 'buy' ? 'Bought' : 'Sold'} ${qtyFmt(qty)} ${t} for ${money(Math.abs(res.q.total))}.${plNote(res.q)}`);
    hideQuick();
    save();
    refresh();
  }

  /* ---------- refresh ---------- */
  function refresh() {
    renderHeader();
    renderTape();
    if (ui.tab === 'markets') { renderWorkspace(); renderMarkets(); if (ui.filter === 'owned' || ui.filter === 'watch') renderChips(); }
    if (ui.tab === 'portfolio') renderPortfolio();
    if (ui.tab === 'dividends') renderDividends();
    if (ui.tab === 'orders') renderOrders();
    if (ui.tab === 'performance') renderPerformance();
    if (ui.tab === 'watchlists') renderWatchlists();
    if (ui.tab === 'calculator' && !$('riskCalc').hidden) renderRisk();
    if (ui.tab === 'calendar') { if (ui.calFollow) ui.calMonth = S().date.slice(0, 7); renderCalendar(); }
    if (ui.tab === 'activity') renderActivity();
    if (ui.sheet) renderSheet(false);
    if (ui.focus) renderFocus();
  }

  function showTab(tab) {
    ui.tab = tab;
    uiPref('tab', tab);
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('main .panel').forEach((p) => { p.hidden = p.id !== 'tab-' + tab; });
    if (tab === 'markets') renderChips();
    if (tab === 'settings') renderSettings();
    if (tab === 'calculator') renderCalc();
    if (tab === 'academy' && window.Academy) window.Academy.render();
    if (tab === 'watchlists') renderWatchlists();
    if (tab === 'performance') { const v = ui.perfView || 'overview'; if (v === 'journal') renderJournal(); else if (v === 'backtest') renderBacktest(); else renderPerformance(); }
    if (tab === 'calculator' && !$('riskCalc').hidden) resetRisk();
    if (tab === 'dividends' || tab === 'calendar' || tab === 'settings') renderDivSpeed();
    refresh();
  }

  function toggleWatch(t) {
    // The star adds to whichever list you last looked at, so there is one obvious destination.
    E.toggleInList(activeList().id, t);
    save();
    if (ui.tab === 'markets') renderChips();
    refresh();
  }

  /* ---------- events ---------- */
  function bind() {
    document.querySelector('.tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]');
      if (b) showTab(b.dataset.tab);
    });
    /*
     * Arrow keys across the tab bar. role="tab" is a promise that this works -- a screen reader
     * tells the user to use the arrows -- and until now the markup made the promise and the code
     * did not keep it. Home and End jump to the ends, and the move takes focus with it so the
     * keyboard user ends up where a mouse user would.
     */
    document.querySelector('.tabs').addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      const tabs = [...document.querySelectorAll('.tabs button[data-tab]')].filter((b) => b.offsetParent !== null);
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const next = e.key === 'Home' ? 0
        : e.key === 'End' ? tabs.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus();
      showTab(tabs[next].dataset.tab);
    });

    // Any element with data-open opens the security sheet; stars and toggles take precedence.
    document.addEventListener('click', (e) => {
      const star = e.target.closest('[data-watch]');
      if (star) { e.stopPropagation(); toggleWatch(star.dataset.watch); return; }
      const drip = e.target.closest('[data-drip]');
      if (drip) {
        e.stopPropagation();
        const t = drip.dataset.drip, h = S().holdings[t];
        if (h) { E.setDrip(t, !(h.drip ?? S().settings.drip)); save(); refresh(); }
        return;
      }
      const cancel = e.target.closest('[data-cancel]');
      if (cancel) { E.cancelOrder(+cancel.dataset.cancel); save(); refresh(); toast('Order cancelled'); return; }
      const w = e.target.closest('[data-world]');
      if (w) { e.stopPropagation(); listWorldSymbol(w.dataset.world, w); return; }
      const exp = e.target.closest('[data-export]');
      if (exp) {
        e.stopPropagation();
        const k = exp.dataset.export;
        const St = window.Stats;
        if (k === 'trades') exportCSV(exportName('trades'), St.csvTrades());
        else if (k === 'tx') exportCSV(exportName('history'), St.csvTransactions());
        else exportCSV(exportName('portfolio'), St.csvPortfolio());
        return;
      }
      const trade = e.target.closest('[data-trade]');
      if (trade) { const [t, side] = trade.dataset.trade.split(':'); openSheet(t, false, side); return; }
      const pick = e.target.closest('[data-pick]');
      if (pick) { pickChart(pick.dataset.pick); return; }
      const open = e.target.closest('[data-open]');
      if (open && !e.target.closest('.sheet')) openSheet(open.dataset.open);
    });

    $('playBtn').addEventListener('click', () => setPlaying(!ui.playing));
    $('speedSeg').addEventListener('click', (e) => { const b = e.target.closest('[data-speed]'); if (b) setSpeed(+b.dataset.speed); });
    const SKIPS = { '1d': [1, 'd'], '1w': [1, 'w'], '1m': [1, 'm'], '3m': [3, 'm'], '1y': [1, 'y'] };
    document.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => skipBy(...SKIPS[b.dataset.skip])));
    $('nextPayBtn').addEventListener('click', skipToNextPayout);
    $('skipMoreBtn').addEventListener('click', () => {
      const open = $('skipPanel').hidden;
      $('skipPanel').hidden = !open;
      $('skipMoreBtn').setAttribute('aria-expanded', String(open));
      if (open) {
        const nx = E.nextTradingDay(S().date);
        $('skipDate').min = nx;
        if (!$('skipDate').value || $('skipDate').value <= S().date) $('skipDate').value = addCalendar(S().date, 'm', 1);
      }
    });
    $('skipNForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Math.max(1, Math.floor(+$('skipN').value || 1));
      skipBy(n, $('skipUnit').value);
    });
    $('skipDateForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const d = $('skipDate').value;
      if (!d || d <= S().date) { $('skipNote').textContent = `Pick a date after ${longDate(S().date)}. Time only moves forward.`; return; }
      runSkip(E.tradingDaysUntil(d));
    });
    $('skipStop').addEventListener('click', () => { if (ui.skip) ui.skip.stop = true; });
    document.addEventListener('click', (e) => {
      const ds = e.target.closest('[data-divspeed]');
      if (ds) { setDivSpeed(ds.dataset.divspeed); return; }
      const sk = e.target.closest('[data-skipto]');
      if (sk) { ui.calFollow = true; runSkip(E.tradingDaysUntil(sk.dataset.skipto)); return; }
      const day = e.target.closest('[data-day]');
      if (day) { ui.calSel = day.dataset.day; renderCalendar(); }
    });
    $('calPrev').addEventListener('click', () => calMove(-1));
    $('calNext').addEventListener('click', () => calMove(1));
    $('calToday').addEventListener('click', () => { ui.calFollow = true; ui.calMonth = S().date.slice(0, 7); ui.calSel = S().date; renderCalendar(); });
    $('calWatch').addEventListener('change', (e) => { ui.calWatch = e.target.checked; renderCalendar(); });
    $('setDivSpeed').addEventListener('change', (e) => setDivSpeed(e.target.value));
    $('setTheme').value = getTheme();
    $('setTheme').addEventListener('change', (e) => setTheme(e.target.value));
    $('setAccount').addEventListener('change', (e) => { S().settings.account = e.target.value; save(); toast(`Account set to ${E.ACCOUNTS[e.target.value]}. New dividends are taxed accordingly.`); });
    bindCalc();

    let qTimer;
    $('search').addEventListener('input', (e) => {
      clearTimeout(qTimer);
      qTimer = setTimeout(() => { ui.q = e.target.value; ui.limit = 120; renderMarkets(); }, 120);
    });
    $('search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const r = marketRows(); if (r.length) openSheet(r[0].m.t); }
    });
    $('sectorSel').addEventListener('change', (e) => { ui.sector = e.target.value; ui.limit = 120; renderMarkets(); });
    $('exchSel').addEventListener('change', (e) => { ui.exch = e.target.value; ui.limit = 120; renderMarkets(); });
    $('typeChips').addEventListener('change', (e) => {
      ui.filter = e.target.value; ui.limit = 120;
      renderMarkets();
    });
    document.querySelectorAll('#marketTable th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (ui.sort === k) ui.asc = !ui.asc; else { ui.sort = k; ui.asc = ['t', 'type', 'sector'].includes(k); }
      renderMarkets();
    }));
    $('moreBtn').addEventListener('click', () => { ui.limit += 200; renderMarkets(); });

    $('chRange').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.chartRange = +b.dataset.r; uiPref('chartRange', ui.chartRange);
      $('chRange').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderMainChart();
    });
    $('chType').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.chartType = b.dataset.ct; uiPref('chartType', ui.chartType);
      $('chType').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderMainChart();
    });
    $('chTrade').addEventListener('click', () => openSheet(chartTicker(), false, 'buy'));
    $('chMA').addEventListener('click', () => {
      ui.chartMA = !ui.chartMA; uiPref('chartMA', ui.chartMA ? '1' : '');
      $('chMA').setAttribute('aria-pressed', String(ui.chartMA));
      renderMainChart();
    });
    $('chTrend').addEventListener('click', () => {
      showTab('academy');
      window.Academy.openGuideById('charts');
    });
    $('chFull').addEventListener('click', openFocus);
    $('mainChart').addEventListener('dblclick', () => { if (!draw.tool) openFocus(); });
    bindDrawing();
    bindRisk();
    bindJournal();
    bindBacktest();
    bindWatchlists();
    bindAsk();
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
    $('fcClose').addEventListener('click', closeFocus);
    $('fcPlay').addEventListener('click', () => setPlaying(!ui.playing));
    $('fcSell').addEventListener('click', () => showQuick('sell'));
    $('fcBuy').addEventListener('click', () => showQuick('buy'));
    $('qtClose').addEventListener('click', hideQuick);
    $('qtQty').addEventListener('input', renderQuick);
    $('qtQuick').addEventListener('click', (e) => { const b = e.target.closest('[data-qq]'); if (b) { $('qtQty').value = b.dataset.qq; renderQuick(); } });
    $('quickTicket').addEventListener('submit', submitQuick);
    document.addEventListener('fullscreenchange', () => {
      // Leaving the browser's full screen (e.g. with Esc) also leaves the full-screen chart.
      if (!document.fullscreenElement && ui.focus) closeFocus(); else if (ui.focus) setTimeout(renderFocus, 50);
    });
    document.addEventListener('keydown', (e) => {
      if (!ui.focus) return;
      if (e.key === 'Escape') { e.preventDefault(); if (!$('quickTicket').hidden) hideQuick(); else closeFocus(); }
    });
    $('chSell').addEventListener('click', () => openSheet(chartTicker(), false, 'sell'));
    $('chBuy').addEventListener('click', () => openSheet(chartTicker(), false, 'buy'));
    $('chWatch').addEventListener('click', () => toggleWatch(chartTicker()));
    $('nwRange').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.nwRange = +b.dataset.r;
      $('nwRange').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderNwChart();
    });
    $('newsFilter').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.newsFilter = b.dataset.f;
      $('newsFilter').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderActivity();
    });

    // sheet
    $('shClose').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closeSheet(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.sheet) closeSheet();
      if (e.key === ' ' && !ui.sheet && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); setPlaying(!ui.playing); }
    });
    $('shWatch').addEventListener('click', () => toggleWatch(ui.sheet));
    $('shRange').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.range = +b.dataset.r;
      $('shRange').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      renderSheet(false);
    });
    $('sideSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.side = b.dataset.side; $('tradeMsg').textContent = '';
      renderTradeForm();
    });
    $('unitSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      ui.unit = b.dataset.u; renderTradeForm();
    });
    $('quickAmt').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const v = +b.dataset.q;
      /*
       * The shortcut fills the box in whichever unit is selected; it no longer changes the unit
       * under you. The exact figure, not a rounded one -- rounding "All" to four places on a
       * holding of 0.00009999 asks to sell more than you have, and the order is refused.
       * A cash amount only ever needs its two decimal places.
       */
      $('ordQty').value = ui.unit === 'shares' ? trimQty(v) : +v.toFixed(2);
      renderTradeForm();
    });
    $('ordKind').addEventListener('change', () => {
      if ($('ordKind').value !== 'market' && !$('ordPx').value) {
        const p = E.price(ui.sheet);
        const k = $('ordKind').value;
        const f = (k === 'limit') === (ui.side === 'buy') ? 0.95 : 1.05;
        $('ordPx').value = +(p * f).toPrecision(5);
      }
      renderTradeForm();
    });
    $('ordQty').addEventListener('input', renderTradeForm);
    $('ordPx').addEventListener('input', renderTradeForm);
    $('tradeForm').addEventListener('submit', submitTrade);

    // settings
    $('setCommission').addEventListener('change', (e) => { S().settings.commission = Math.max(0, +e.target.value || 0); save(); });
    const limit = (id, key, lo, hi, dflt) => $(id).addEventListener('change', (e) => {
      const v = +e.target.value;
      S().settings[key] = isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : dflt;
      e.target.value = S().settings[key];
      save();
      if (ui.tab === 'performance') renderPerformance();
    });
    $('setRegion').addEventListener('change', (e) => {
      S().settings.region = e.target.value;
      S().settings.regionHow = 'your choice';
      save();
      renderSettings();
      refresh();
      toast(`Holidays now follow ${window.Holidays.EXCHANGES[e.target.value].market}.`);
    });
    limit('setRiskPct', 'riskPct', 0.1, 100, 1);
    limit('setMaxPos', 'maxPosPct', 1, 100, 20);
    limit('setDayLoss', 'dayLossPct', 0.5, 100, 3);
    /*
     * The endpoint and the provider are saved as settings, never a key -- there is no field for a
     * key anywhere in this app, by design. Changing either throws away every cached price, since
     * prices from a different source are a different set of facts.
     */
    $('setEndpoint').addEventListener('change', (e) => {
      const v = String(e.target.value || '').trim();
      if (v && !/^https?:\/\//i.test(v)) {
        $('dataMsg').textContent = 'That needs to be a full address starting with https:// (or http:// for a proxy you are running locally).';
        $('dataMsg').className = 'note msg err';
        return;
      }
      S().settings.endpoint = v;
      applyQuoteConfig();
      save();
      $('dataMsg').textContent = v ? 'Saved. Test the connection to check it answers.' : 'Cleared. Real-market mode has no prices until an endpoint is set.';
      $('dataMsg').className = 'note msg';
      renderDataState(); renderMarketNote();
    });
    $('setProvider').addEventListener('change', (e) => {
      S().settings.provider = e.target.value;
      applyQuoteConfig();
      save();
      renderDataMode(); renderProviderNote(); renderDataState(); renderMarketNote();
    });
    $('setMode').addEventListener('change', (e) => {
      S().settings.dataMode = e.target.value === 'direct' ? 'direct' : 'proxy';
      applyQuoteConfig();
      save();
      renderDataMode(); renderProviderNote(); renderDataState(); renderMarketNote();
      $('dataMsg').textContent = '';
    });
    $('setKey').addEventListener('change', (e) => {
      setKey(e.target.value.trim());
      applyQuoteConfig();
      renderDataState();
      $('dataMsg').textContent = getKey() ? 'Key saved in this browser. Test the connection to check it works.' : 'Key cleared.';
      $('dataMsg').className = 'note msg';
    });
    $('dataTestBtn').addEventListener('click', testQuoteConnection);
    $('dataClearBtn').addEventListener('click', () => {
      window.Quotes.clear();
      $('dataMsg').textContent = 'Cached prices cleared. The request budget is not reset, because that belongs to your key rather than to this page.';
      $('dataMsg').className = 'note msg';
      renderDataState();
      if (E.liveOn()) refresh();
    });
    $('setMarket').addEventListener('change', (e) => { ui.newMarket = e.target.value; renderMarketNote(); });
    $('liveRefresh').addEventListener('click', () => refreshLive(true));
    $('liveAuto').addEventListener('click', () => setAuto(!ui.auto));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && ui.auto) armAuto(); });
    $('worldBtn').addEventListener('click', doWorldSearch);
    $('refBtn').addEventListener('click', fetchRefPrices);
    $('refClear').addEventListener('click', () => {
      E.clearRefPrices(); save(); renderRefState();
      $('refMsg').textContent = 'Forgotten. New games go back to the built-in reference levels.';
      $('refMsg').className = 'note msg';
    });
    $('setFractional').addEventListener('change', (e) => { S().settings.fractional = e.target.checked; save(); });
    $('setDrip').addEventListener('change', (e) => { S().settings.drip = e.target.checked; save(); });
    $('setStamp').addEventListener('change', (e) => { S().settings.stamp = e.target.checked; save(); });
    let armTimer;
    $('resetBtn').addEventListener('click', () => {
      const b = $('resetBtn');
      if (!b.classList.contains('armed')) {
        b.classList.add('armed');
        b.textContent = 'Click again to confirm';
        $('resetNote').textContent = 'This cannot be undone.';
        armTimer = setTimeout(() => { b.classList.remove('armed'); b.textContent = 'Start a new game'; $('resetNote').textContent = 'This clears your holdings, orders and history.'; }, 4000);
        return;
      }
      clearTimeout(armTimer);
      const mk = $('setMarket').value;
      const opts = mk === 'real' ? { mode: 'real', startDate: $('setMarketDate').value || undefined }
        : mk === 'live' ? { mode: 'live' } : null;
      startNewGame(+$('setStart').value, opts);
      b.classList.remove('armed');
      b.textContent = 'Start a new game';
      $('resetNote').textContent = 'New game started.';
      toast(`New game started with ${money(+$('setStart').value, 'USD', 0)}`);
    });
    $('customForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const res = E.addCustom({
        t: $('cTicker').value, n: $('cName').value.trim(), p: $('cPrice').value, y: $('cYield').value,
        q: $('cFreq').value, type: $('cType').value, sector: $('cSector').value || 'Other', vol: $('cVol').value,
      });
      const msg = $('customMsg');
      if (!res.ok) { msg.textContent = res.msg; msg.className = 'note msg err'; return; }
      msg.textContent = `${res.m.t} is now listed. Find it under Markets.`;
      msg.className = 'note msg ok';
      e.target.reset();
      renderSelects();
      save();
    });

    window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(refresh, 150); });
    window.addEventListener('resize', () => { if (ui.focus) renderFocus(); });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (ui.playing) setPlaying(false);
      if (saveTimer) saveNow();
    });
    window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
    window.addEventListener('beforeunload', () => { if (saveTimer) saveNow(); });
  }

  /* ---------- boot ---------- */
  /* ---------- theme ---------- */
  function getTheme() { const t = uiPref('theme'); return t === 'light' || t === 'dark' ? t : 'system'; }
  function setTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    uiPref('theme', t);
    if ($('setTheme')) $('setTheme').value = t;
    if (E.S) refresh();
  }

  function startNewGame(cash, opts) {
    setPlaying(false);
    if (ui.sheet) closeSheet();
    /*
     * A new trading game replaces the trading, not everything you have set up. Course progress
     * already survived it; so now do your settings -- your data endpoint, your region, your risk
     * limits, your account type. Making someone re-enter their proxy address every time they
     * start a fresh run would be a small cruelty, and none of it is part of the game state.
     */
    const academy = S() && S().academy;
    const settings = S() && Object.assign({}, S().settings);
    // Settings go in through newGame so they are in place before the market is built: the
    // refreshed starting prices are read while it is being seeded.
    E.newGame(cash, settings ? Object.assign({}, opts, { settings }) : opts);
    if (academy) S().academy = academy;
    applyQuoteConfig();
    ui.calMonth = null; ui.calSel = null; ui.calFollow = true;
    save();
    saveNow();   // a new game is a big change: write it straight away
    renderSelects();
    showTab('markets');
  }

  // An unsigned percentage, for shares and rates rather than changes.
  const pctAbs = (v) => (v == null ? '—' : (v * 100).toFixed(1) + '%');

  /* ---------- performance dashboard ---------- */
  // A row in a diverging bar chart: the zero line carries the sign, the label repeats it, so the
  // red/green is never the only thing telling you whether a number is a profit.
  function divergeRow(label, sub, value, max) {
    const w = max > 0 ? Math.min(50, (Math.abs(value) / max) * 50) : 0;
    const up = value >= 0;
    return `<div class="dv-row">
      <span class="dv-lbl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <span class="dv-track"><i class="dv-bar ${up ? 'up' : 'dn'}" style="${up ? 'left:50%' : `right:50%`};width:${w}%"></i></span>
      <b class="dv-val ${cls(value)}">${signedMoney(value)}</b>
    </div>`;
  }

  /*
   * Exporting a CSV.
   *
   * A download is the obvious way to do this and it does not always work: inside a sandboxed
   * frame -- which is where this app often runs -- a download link is inert and, worse, fails
   * silently, so the user clicks and nothing happens and they have no idea why. So this tries the
   * download, and whether or not it appears to work it also puts the text on the clipboard and
   * says so. One of the two always gets the data out.
   */
  async function exportCSV(name, text) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (e) { copied = false; }
    let downloaded = false;
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = name; a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      downloaded = true;
    } catch (e) { downloaded = false; }
    const lines = text.trim().split('\n').length - 1;
    if (copied && downloaded) toast(`${name}: ${lines} rows copied to the clipboard, and downloaded if your browser allows it.`);
    else if (copied) toast(`${name}: ${lines} rows copied to the clipboard. Paste into a spreadsheet.`);
    else if (downloaded) toast(`${name} downloaded (${lines} rows).`);
    else toast('Could not export: this browser blocked both the download and the clipboard.', 'err');
  }

  function exportName(kind) {
    const s = S();
    return `bullpen-${kind}-${s.mode}-${(s.date || '').replace(/-/g, '')}.csv`;
  }

  function renderPerformance() {
    const St = window.Stats;
    const s = S();
    const sum = St.summary();
    const eq = St.equity();
    const ex = St.exposure();
    const conc = St.concentration();
    const nf = (v, d = 2) => (v == null ? '—' : v.toFixed(d));

    // headline
    const totalRet = eq ? eq.ret : 0;
    const vsBench = eq ? eq.ret - eq.benchRet : 0;
    let html = `<div class="card perf-hero">
      <div>
        <span class="ac-eyebrow">Total return${E.realOn() ? ' · replay' : ''}</span>
        <div class="perf-big ${cls(totalRet)}">${pct(totalRet)}</div>
        <p class="muted small">${money(E.netWorth())} from ${money(s.startCash)} over ${s.day + 1} trading day${s.day ? 's' : ''}</p>
      </div>
      <div class="perf-vs">
        <span class="ac-eyebrow">Against the S&amp;P 500</span>
        <div class="perf-mid ${cls(vsBench)}">${pct(vsBench)}</div>
        <p class="muted small">You ${pct(totalRet)} · index ${eq ? pct(eq.benchRet) : '—'}</p>
      </div>
      <div class="perf-vs">
        <span class="ac-eyebrow">Worst fall from a peak</span>
        <div class="perf-mid loss">${eq ? pct(eq.maxDD) : '—'}</div>
        <p class="muted small">${eq && eq.ddAt ? `peak ${shortD(eq.peakAt)} to ${shortD(eq.ddAt)}` : 'No drawdown yet'}</p>
      </div>
    </div>`;

    // equity curve, both lines indexed to zero so one axis is honest
    html += `<div class="card">
      <div class="ac-row"><b>Your account against the market</b>
        <span class="chart-key"><span class="key you">You</span><span class="key bench">S&amp;P 500</span></span></div>
      <canvas id="perfEquity" class="chart" height="240"></canvas>
      <p class="muted small">Both lines start at 0% on your first day, so they share one scale. The index line is buying and holding SPY over the same period.</p>
    </div>`;

    // A losing run, said out loud. Placed before the statistics because it is the thing most
    // worth reading, and the moment it matters is the moment nobody goes looking for it.
    if (ex.coolOff) {
      html += `<div class="card cool-off">
        <div class="ac-row"><b>Take a breath</b><span class="muted small">${ex.coolOff.run} losses in a row</span></div>
        <p>${esc(ex.coolOff.note)}</p>
        <p class="muted small">Nothing here stops you trading, and this is not a prediction. It is the note your own record would leave you if it could.</p>
      </div>`;
    }

    // Risk across the whole account rather than one trade at a time.
    {
      const pr = ex.portfolioRisk, dd = ex.drawdown;
      const tiles = [
        ['At risk to your stops', pr.atRisk > 0 ? money(pr.atRisk) : '—', pr.atRisk > 0 ? `${pctAbs(pr.atRiskPct)} of the account` : 'No sell stops are resting'],
        ['Held with no stop', pr.uncovered > 0 ? money(pr.uncovered) : '—', pr.uncovered > 0 ? `${pctAbs(pr.uncoveredPct)} of the account` : 'Everything you hold has a stop'],
        ['If everything fell 10%', pctAbs(pr.shockPct), 'A yardstick, not a forecast'],
        ['Worst fall from a peak', pct(dd.max), dd.current < -0.0001 ? `${pct(dd.current)} below the high now` : 'At a new high'],
      ];
      const warn = [];
      if (pr.uncoveredPct > 0.5 && pr.uncovered > 0) warn.push(`More than half your account is in positions with no resting stop. That is a choice, not a mistake — but it means the exit is a decision you will have to make while it is happening.`);
      if (pr.atRiskPct > (s.settings.riskPct || 1) / 100 * 4) warn.push(`Your stops together give up ${pctAbs(pr.atRiskPct)} of the account, well beyond the ${pctAbs((s.settings.riskPct || 1) / 100)} you set for a single trade. Positions that fall together are one bet wearing several hats.`);
      if (ex.topSector && ex.topSector.pct > 0.4) warn.push(`${pctAbs(ex.topSector.pct)} of the account is in ${esc(ex.topSector.sector)}.`);
      html += `<div class="card"><div class="ac-row"><b>Risk across the account</b><span class="muted small">not one trade at a time</span></div>
        <div class="perf-tiles">${tiles.map(([k, v, sub]) => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('')}</div>
        ${warn.length ? `<ul class="perf-warn">${warn.map((w) => `<li>${w}</li>`).join('')}</ul>` : ''}</div>`;
    }

    // trade statistics
    if (!sum.n) {
      html += `<div class="card perf-empty"><b>No closed trades yet</b><p class="muted">Buy something and sell it, and every number on this page fills in from what you actually did. Nothing here is an example.</p></div>`;
    } else {
      const tiles = [
        ['Closed trades', sum.n, `${sum.wins} won · ${sum.losses} lost`],
        ['Win rate', pctAbs(sum.winRate), `${sum.wins} of ${sum.n}`],
        ['Average win', signedMoney(sum.avgWin), sum.avgWinPct ? pctAbs(sum.avgWinPct) : ''],
        ['Average loss', signedMoney(-sum.avgLoss), sum.avgLossPct ? pctAbs(sum.avgLossPct) : ''],
        ['Profit factor', sum.profitFactor === Infinity ? '∞' : nf(sum.profitFactor), 'Won per £1 lost'],
        ['Per trade', signedMoney(sum.expectancy), 'Average outcome'],
        ['Typical hold', Math.round(sum.avgHeld) + ' days', ''],
        ['Realised', signedMoney(sum.realised), 'Booked profit'],
        ['Biggest win', sum.best ? signedMoney(sum.best.pl) : '—', sum.best ? `${sum.best.t} · ${shortD(sum.best.closed)}` : ''],
        ['Biggest loss', sum.worst ? signedMoney(sum.worst.pl) : '—', sum.worst ? `${sum.worst.t} · ${shortD(sum.worst.closed)}` : ''],
        ['Longest winning run', `${sum.streaks.longestWin} in a row`, ''],
        ['Longest losing run', `${sum.streaks.longestLoss} in a row`, 'The run is what ends people'],
      ];
      html += `<div class="card"><div class="ac-row"><b>Every closed trade</b><span class="muted small">${sum.open} position${sum.open === 1 ? '' : 's'} still open</span></div>
        <div class="perf-tiles">${tiles.map(([k, v, sub]) => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('')}</div></div>`;

      // is this skill or one lucky trade?
      if (conc) {
        const heavy = conc.top1 > 0.5;
        html += `<div class="card perf-note ${heavy ? 'warn' : ''}">
          <b>${heavy ? 'Your result leans on one trade' : 'Your profit is spread across trades'}</b>
          <p class="muted">Your single best trade is ${pctAbs(conc.top1)} of everything you made, and your best three are ${pctAbs(conc.top3)} of it, across ${conc.n} winning trade${conc.n === 1 ? '' : 's'}.
          ${heavy ? 'A record resting on one trade tells you much less than it looks like it does — it may not repeat.' : 'Results spread over many trades are more likely to reflect how you decide rather than luck.'}</p>
        </div>`;
      }
    }

    // what it cost to trade
    html += `<div class="card"><div class="ac-row"><b>What trading cost you</b></div>
      <div class="perf-tiles small">
        <div><span>Spread and impact</span><b class="loss">${money(sum.slippage)}</b><small>Paid on every fill</small></div>
        <div><span>Commission and stamp duty</span><b class="loss">${money(sum.fees)}</b></div>
        <div><span>Dividend tax</span><b class="loss">${money(sum.tax)}</b></div>
        <div><span>Dividends received</span><b class="gain">${money(sum.dividends)}</b><small>Not counted in trade profit</small></div>
      </div></div>`;

    // risk right now
    const warn = [];
    for (const r of ex.over) warn.push(`${r.t} is ${pctAbs(r.pct)} of your account, over your ${pctAbs(ex.maxPos)} limit for one position.`);
    if (ex.topSector && ex.topSector.pct > 0.4) warn.push(`${pctAbs(ex.topSector.pct)} of your account is in ${ex.topSector.sector}. One piece of bad news could move all of it at once.`);
    if (ex.dayPL.pct < -ex.dayLimit) warn.push(`You are down ${pctAbs(Math.abs(ex.dayPL.pct))} today, past the ${pctAbs(ex.dayLimit)} daily limit you set. This is the point to stop for the day.`);
    html += `<div class="card"><div class="ac-row"><b>Risk right now</b><span class="muted small">limits in Settings</span></div>
      <div class="perf-tiles small">
        <div><span>Invested</span><b>${pctAbs(ex.investedPct)}</b><small>${money(ex.invested)}</small></div>
        <div><span>Cash</span><b>${pctAbs(ex.cashPct)}</b><small>${money(s.cash)}</small></div>
        <div><span>Biggest position</span><b class="${ex.rows[0] && ex.rows[0].pct > ex.maxPos ? 'loss' : ''}">${ex.rows[0] ? pctAbs(ex.rows[0].pct) : '—'}</b><small>${ex.rows[0] ? ex.rows[0].t : 'Nothing held'}</small></div>
        <div><span>Today</span><b class="${cls(ex.dayPL.abs)}">${pct(ex.dayPL.pct)}</b><small>${signedMoney(ex.dayPL.abs)}</small></div>
      </div>
      ${warn.length ? `<ul class="perf-warn">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : `<p class="muted small">Nothing is over the limits you set.</p>`}
    </div>`;

    // breakdowns
    if (sum.n) {
      const byT = St.byTicker(), byM = St.byMonth();
      const maxT = Math.max(...byT.map((r) => Math.abs(r.pl)), 1);
      const maxM = Math.max(...byM.map((r) => Math.abs(r.pl)), 1);
      html += `<div class="perf-two">
        <div class="card"><div class="ac-row"><b>Profit by product</b></div><div class="dv">${byT.slice(0, 12).map((r) => divergeRow(r.k, `${r.n} trade${r.n === 1 ? '' : 's'} · ${pctAbs(r.wins / r.n)} won`, r.pl, maxT)).join('')}</div></div>
        <div class="card"><div class="ac-row"><b>Profit by month</b></div><div class="dv">${byM.map((r) => divergeRow(monthName(r.k), `${r.n} trade${r.n === 1 ? '' : 's'}`, r.pl, maxM)).join('')}</div></div>
      </div>`;

      // the trades themselves
      const tr = St.trades().slice().reverse().slice(0, 25);
      html += `<div class="card"><div class="ac-row"><b>Closed trades</b><span class="muted small">most recent first</span></div>
        <div class="export-row"><span class="muted small">Export</span><button class="btn btn-sm" type="button" data-export="trades">Closed trades</button><button class="btn btn-sm" type="button" data-export="tx">Full account history</button><button class="btn btn-sm" type="button" data-export="portfolio">Portfolio now</button></div>
        <div class="table-wrap"><table class="grid perf-tbl"><thead><tr><th>Closed</th><th>Product</th><th class="r">Qty</th><th class="r">Exit</th><th class="r">Held</th><th class="r">Result</th><th class="r">%</th></tr></thead><tbody>
        ${tr.map((x) => `<tr><td>${shortD(x.closed)}</td><td><b>${x.t}</b></td><td class="r">${qtyFmt(+x.qty.toFixed(4))}</td><td class="r">${money(x.px, (E.BY[x.t] || {}).cur)}</td><td class="r">${x.held}d</td><td class="r ${cls(x.pl)}">${signedMoney(x.pl)}</td><td class="r ${cls(x.pl)}">${x.plPct == null ? '—' : pct(x.plPct)}</td></tr>`).join('')}
        </tbody></table></div></div>`;
    }

    $('perf').innerHTML = html;

    if (eq) {
      C.line($('perfEquity'), {
        labels: eq.dates,
        series: [
          { values: eq.bench, color: getComputedStyle(document.documentElement).getPropertyValue('--chart-b').trim() || '#9aa3ad' },
          { values: eq.you, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), fill: true },
        ],
        fmt: (v) => (v * 100).toFixed(0) + '%',
        hover: true,
      });
    }
  }
  const shortD = (d) => (d ? C.shortDate(d) : '—');
  function monthName(k) {
    const [y, m] = k.split('-');
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1] + ' ' + y;
  }

  /* ---------- position size and risk calculator ---------- */
  function renderRisk() {
    const s = S();
    const r = window.Stats.positionSize({
      equity: +$('rkEquity').value,
      riskPct: +$('rkRisk').value,
      entry: +$('rkEntry').value,
      stop: +$('rkStop').value,
      target: +$('rkTarget').value,
    });
    if (r.error) {
      $('riskOut').innerHTML = `<div class="calc-empty"><b>Fill in a price and a stop</b><p class="muted">${esc(r.error)}</p>
        <p class="muted small">The idea: decide what losing looks like before you buy. If you will sell at a 10% fall and you accept losing 1% of your account, you can buy ten times more than that 1% — the stop, not your cash, sets the size.</p></div>`;
      return;
    }
    const whole = Math.floor(r.shares);
    $('riskOut').innerHTML = `
      <span class="ac-eyebrow">Buy about</span>
      <div class="risk-big">${qtyFmt(+r.shares.toFixed(4))} <small>shares</small></div>
      <p class="muted">${whole !== 0 ? `${whole} whole share${whole === 1 ? '' : 's'} · ` : ''}costing ${money(r.cost)}, which is ${pctAbs(r.posPct)} of your account</p>
      <div class="perf-tiles small">
        <div><span>You risk</span><b class="loss">${money(r.risk)}</b><small>${nf2(r.risk / r.equity * 100)}% of ${money(r.equity)}</small></div>
        <div><span>Per share</span><b>${money(r.perShare)}</b><small>${pctAbs(r.stopLossPct)} below entry</small></div>
        ${r.rr != null ? `<div><span>Reward to risk</span><b class="${r.rr >= 2 ? 'gain' : r.rr < 1 ? 'loss' : ''}">${nf2(r.rr)} : 1</b><small>${r.rr >= 2 ? 'Two or more is a good shape' : r.rr >= 1 ? 'Modest' : 'Risking more than you gain'}</small></div>` : ''}
        ${r.reward != null ? `<div><span>If it works</span><b class="gain">${signedMoney(r.reward)}</b><small>at ${money(r.target)}</small></div>` : ''}
      </div>
      ${r.warnings.length ? `<ul class="perf-warn">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <p class="note">A stop is an instruction, not a promise. If the price gaps straight past it overnight you are filled at whatever opens, which can be well below ${money(r.stop)} — Bullpen fills stops that way on purpose, so you can see it happen.</p>`;
  }
  const nf2 = (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(2));

  function bindRisk() {
    const sync = () => { renderRisk(); };
    ['rkEquity', 'rkRisk', 'rkEntry', 'rkStop', 'rkTarget'].forEach((id) => $(id).addEventListener('input', sync));
    $('rkTicker').addEventListener('input', () => {
      const t = $('rkTicker').value.trim().toUpperCase();
      if (!E.BY[t] || !E.listed(t)) return;
      const p = E.price(t);
      $('rkEntry').value = +p.toFixed(2);
      if (!+$('rkStop').value) $('rkStop').value = +(p * 0.92).toFixed(2);
      sync();
    });
    document.querySelector('.calc-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-calc]');
      if (!b) return;
      const risk = b.dataset.calc === 'risk';
      document.querySelectorAll('.calc-tabs [data-calc]').forEach((x) => x.classList.toggle('on', x === b));
      $('riskCalc').hidden = !risk;
      $('divCalc').hidden = risk;
      if (risk) resetRisk();
    });
  }
  // Seed from the live account so the numbers mean something straight away.
  function resetRisk() {
    const s = S();
    if (!$('rkEquity').value) $('rkEquity').value = Math.round(E.netWorth());
    if (!$('rkRisk').value) $('rkRisk').value = s.settings.riskPct || 1;
    renderRisk();
  }

  /* ---------- trading journal ---------- */
  const jrUI = { open: null, q: '', strat: '', outcome: 'all' };

  function renderJournal() {
    const J = window.Journal;
    const rows = J.positions().filter((p) => {
      if (jrUI.q && !p.t.toLowerCase().startsWith(jrUI.q.toLowerCase())) return false;
      if (jrUI.strat && (!p.entry || p.entry.strategy !== jrUI.strat)) return false;
      if (jrUI.outcome === 'open' && !p.open) return false;
      if (jrUI.outcome === 'won' && !(p.pl > 0)) return false;
      if (jrUI.outcome === 'lost' && !(p.pl < 0)) return false;
      if (jrUI.outcome === 'todo' && (p.open ? (p.entry && p.entry.plan) : (p.entry && p.entry.review))) return false;
      return true;
    });
    const used = [...new Set(J.positions().map((p) => p.entry && p.entry.strategy).filter(Boolean))];
    const pats = J.patterns();
    const todo = J.positions().filter((p) => (p.open ? !(p.entry && p.entry.plan) : !(p.entry && p.entry.review))).length;

    let html = `<div class="card jr-head">
      <div class="ac-row"><b>Your trading journal</b><span class="muted small">${todo ? `${todo} still to write up` : 'All written up'}</span></div>
      <p class="muted small">Every position opens an entry by itself. Write the plan before you buy and the review after you sell; the numbers come from what you actually did.</p>
      <div class="jr-filters">
        <input id="jrQ" type="search" placeholder="Filter by ticker" value="${esc(jrUI.q)}" aria-label="Filter by ticker">
        <select id="jrStrat" aria-label="Filter by strategy"><option value="">Any strategy</option>${used.map((x) => `<option value="${esc(x)}"${jrUI.strat === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select id="jrOutcome" aria-label="Filter by outcome">${[['all', 'All trades'], ['open', 'Still open'], ['won', 'Made money'], ['lost', 'Lost money'], ['todo', 'Not written up']].map(([v, l]) => `<option value="${v}"${jrUI.outcome === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </div>
    </div>`;

    if (pats.length) {
      html += `<div class="card"><div class="ac-row"><b>What your journal shows</b><span class="muted small">from entries you wrote</span></div>
        <div class="jr-pats">${pats.map((p) => `<div class="jr-pat ${p.good ? 'good' : ''}"><b>${esc(p.title)}</b><span class="muted">${esc(p.detail)}</span></div>`).join('')}</div></div>`;
    }

    if (!rows.length) {
      html += `<div class="card perf-empty"><b>Nothing to show yet</b><p class="muted">${J.positions().length ? 'No position matches those filters.' : 'Buy something and an entry appears here for you to fill in.'}</p></div>`;
    }

    for (const p of rows) {
      const e = p.entry || {};
      const isOpen = jrUI.open === p.k;
      const need = p.open ? !e.plan : !e.review;
      html += `<div class="card jr-card ${isOpen ? 'on' : ''}">
        <button type="button" class="jr-top" data-jr="${esc(p.k)}" aria-expanded="${isOpen}">
          <span class="jr-id"><b>${p.t}</b><small>${p.open ? 'Open since' : 'Closed'} ${C.shortDate(p.open ? p.opened : p.closed)} · ${p.held}d${isFinite(p.paid) && isFinite(p.px) ? ` · ${money(p.paid, p.cur)} → ${money(p.px, p.cur)}` : ''}</small></span>
          <span class="jr-tags">${e.strategy ? `<span class="jr-tag">${esc(e.strategy)}</span>` : ''}${e.emotion ? `<span class="jr-tag soft">${esc(e.emotion)}</span>` : ''}${need ? '<span class="jr-tag todo">To write up</span>' : ''}</span>
          <span class="jr-pl ${cls(p.pl)}">${signedMoney(p.pl)}<small>${p.plPct == null ? '' : pct(p.plPct)}</small></span>
        </button>
        ${isOpen ? jrEditor(p, e) : ''}
      </div>`;
    }
    $('journal').innerHTML = html;
    const inp = $('jrQ');
    if (inp && document.activeElement !== inp && jrUI.focusQ) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    jrUI.focusQ = false;
  }

  /*
   * What the trade actually did.
   *
   * The journal already held what you intended; this is the other half, taken from the recorded
   * trade rather than typed, so it cannot be remembered generously. Two different percentages are
   * shown on purpose: the price move from what you paid to what you sold at, and the return on
   * the money after the spread, the fees and the tax. The gap between them is what trading cost
   * you, and it is the number people are most surprised by.
   */
  function jrOutcome(p) {
    const m = E.BY[p.t] || {};
    const cur = p.cur || m.cur || 'USD';
    const px = (v) => (isFinite(v) ? money(v, cur) : '—');
    const costs = (p.fee || 0) + (p.slip || 0);
    const move = isFinite(p.paid) && p.paid > 0 && isFinite(p.px) ? p.px / p.paid - 1 : null;
    const rows = [
      ['Bought at', px(p.paid), 'average price paid'],
      [p.open ? 'Worth now' : 'Sold at', px(p.px), p.open ? 'at the current price' : `on ${C.shortDate(p.closed)}`],
      ['Shares', qtyFmt(+(+p.qty).toFixed(4)), p.open ? 'still held' : 'sold'],
      ['Held for', `${p.held} day${p.held === 1 ? '' : 's'}`, `from ${C.shortDate(p.opened)}`],
      ['Price move', move == null ? '—' : `<span class="${cls(move)}">${pct(move)}</span>`, 'before costs'],
      [p.open ? 'Profit so far' : 'Profit', `<span class="${cls(p.pl)}">${signedMoney(p.pl)}</span>`, p.open ? 'if you sold now' : 'booked'],
      ['Return', p.plPct == null ? '—' : `<span class="${cls(p.plPct)}">${pct(p.plPct)}</span>`, 'after all costs'],
    ];
    if (costs > 0.005) rows.push(['Costs', money(costs), 'spread, impact and commission']);
    return `<div class="jr-outcome">
      <div class="ac-row"><b>${p.open ? 'Where it stands' : 'What happened'}</b><span class="muted small">${p.open ? 'open position' : 'from your trade record, not typed'}</span></div>
      <dl class="stats">${rows.map(([k, v, sub]) => `<div><dt>${esc(k)}</dt><dd>${v}${sub ? `<small class="muted"> ${esc(sub)}</small>` : ''}</dd></div>`).join('')}</dl>
    </div>`;
  }

  function jrEditor(p, e) {
    const J = window.Journal;
    const opts = (list, val) => list.map((x) => `<option value="${esc(x)}"${val === x ? ' selected' : ''}>${esc(x)}</option>`).join('');
    return `<div class="jr-body">
      ${jrOutcome(p)}
      <div class="jr-grid">
        <label class="field"><span>Why did you buy?</span><textarea data-jf="why" rows="3" placeholder="What made this worth owning?">${esc(e.why || '')}</textarea></label>
        <label class="field"><span>What was your plan to get out?</span><textarea data-jf="plan" rows="3" placeholder="Where would you sell if right, and if wrong?">${esc(e.plan || '')}</textarea></label>
      </div>
      <div class="jr-grid three">
        <label class="field"><span>Planned entry</span><input data-jn="pEntry" type="number" step="any" min="0" inputmode="decimal" value="${e.pEntry > 0 ? e.pEntry : ''}" placeholder="price you meant to pay"></label>
        <label class="field"><span>Planned stop</span><input data-jn="pStop" type="number" step="any" min="0" inputmode="decimal" value="${e.pStop > 0 ? e.pStop : ''}" placeholder="where you'd admit you were wrong"></label>
        <label class="field"><span>Planned target</span><input data-jn="pTarget" type="number" step="any" min="0" inputmode="decimal" value="${e.pTarget > 0 ? e.pTarget : ''}" placeholder="where you'd take the profit"></label>
      </div>
      ${planNote(p, e)}
      <div class="jr-grid three">
        <label class="field"><span>Strategy</span><input data-jf="strategy" list="jrStrats" value="${esc(e.strategy || '')}" placeholder="e.g. Dividend income"></label>
        <label class="field"><span>How risky did it feel?</span><select data-jf="risk"><option value="">—</option>${opts(J.RISKS, e.risk)}</select></label>
        <label class="field"><span>How did you feel?</span><select data-jf="emotion"><option value="">—</option>${opts(J.EMOTIONS, e.emotion)}</select></label>
      </div>
      <div class="jr-grid">
        <label class="field"><span>What was the market doing?</span><select data-jf="conditions"><option value="">—</option>${opts(J.CONDITIONS, e.conditions)}</select></label>
        <label class="field"><span>Did you follow your own rules?</span><select data-jf="followed"><option value="">—</option>${opts(J.FOLLOWED, e.followed)}</select></label>
      </div>
      ${p.open ? `<p class="note">Still open. Come back and review it once you have sold.</p>` : `
      <label class="field"><span>Looking back, what happened?</span><textarea data-jf="review" rows="3" placeholder="Did it go to plan? What would you do differently?">${esc(e.review || '')}</textarea></label>`}
      <label class="field"><span>Notes</span><textarea data-jf="notes" rows="2" placeholder="Anything else worth remembering">${esc(e.notes || '')}</textarea></label>
      <div class="jr-img">
        ${e.img ? `<img src="${e.img}" alt="Screenshot attached to this entry"><button type="button" class="btn btn-ghost" data-jrimg="clear">Remove picture</button>` : `<label class="btn btn-ghost jr-pick">Attach a picture<input type="file" accept="image/*" data-jrimg="pick" hidden></label><span class="muted small">Shrunk before saving so your journal stays small.</span>`}
      </div>
      <div class="jr-actions"><button type="button" class="btn btn-ghost" data-jrdel="${esc(p.k)}">Delete entry</button><span class="muted small" id="jrSaved">Saved as you type</span></div>
    </div>`;
  }

  /*
   * What the plan was worth, once the trade is closed.
   *
   * Reward-to-risk before the event, and after it the one comparison that stings: did you sell
   * below the stop you set yourself? It is stated without scolding, because the number does the
   * work, and it is only ever shown where you wrote a stop down.
   */
  function planNote(p, e) {
    const entry = +e.pEntry, stop = +e.pStop, target = +e.pTarget;
    const bits = [];
    if (entry > 0 && stop > 0 && stop < entry) {
      const risk = entry - stop;
      if (target > entry) bits.push(`Reward to risk <b>${((target - entry) / risk).toFixed(2)} to 1</b> — risking ${money(risk, 'USD')} a share to make ${money(target - entry, 'USD')}.`);
      else bits.push(`Risking <b>${money(risk, 'USD')}</b> a share to the stop.`);
      if (p.qty > 0) {
        const total = risk * p.qty;
        const acct = E.netWorth();
        bits.push(`On ${qtyFmt(+p.qty.toFixed(4))} shares that is ${money(total, 'USD')}${acct > 0 ? `, or ${pctAbs(total / acct)} of the account` : ''}.`);
      }
    }
    if (!p.open && stop > 0 && isFinite(p.px)) {
      if (p.px < stop * 0.995) bits.push(`<b class="dn">You sold at ${money(p.px, 'USD')}, below your ${money(stop, 'USD')} stop.</b> Selling at the stop would have left ${money((stop - p.px) * p.qty, 'USD')} more in the account.`);
      else if (target > 0 && p.px >= target * 0.995) bits.push(`<b class="up">You held to your ${money(target, 'USD')} target.</b>`);
      else bits.push(`You sold at ${money(p.px, 'USD')}, above your ${money(stop, 'USD')} stop.`);
    }
    if (!bits.length) return '<p class="note">Writing the stop down before you buy is what makes the rest of this journal worth reading: it is the only part of the plan that can be checked afterwards.</p>';
    return `<p class="note plan-note">${bits.join(' ')}</p>`;
  }

  function fillStrategies() {
    const d = $('jrStrats');
    if (d && !d.children.length) d.innerHTML = window.Journal.STRATEGIES.map((x) => `<option value="${esc(x)}">`).join('');
  }

  function bindJournal() {
    fillStrategies();
    $('journal').addEventListener('click', (e) => {
      const top = e.target.closest('[data-jr]');
      if (top) { jrUI.open = jrUI.open === top.dataset.jr ? null : top.dataset.jr; renderJournal(); return; }
      const del = e.target.closest('[data-jrdel]');
      if (del) {
        const k = del.dataset.jrdel;
        ask({
          title: 'Delete this journal entry?',
          body: 'Everything you wrote about this trade goes with it, and it cannot be undone. The trade itself stays in your history.',
          yes: 'Delete entry', danger: true,
        }).then((go) => {
          if (!go) return;
          window.Journal.remove(k); save(); renderJournal(); toast('Journal entry deleted.');
        });
        return;
      }
      const clear = e.target.closest('[data-jrimg="clear"]');
      if (clear && jrUI.open) { window.Journal.set(jrUI.open, { img: '' }); save(); renderJournal(); }
    });
    $('journal').addEventListener('change', (e) => {
      if (e.target.id === 'jrStrat') { jrUI.strat = e.target.value; return renderJournal(); }
      if (e.target.id === 'jrOutcome') { jrUI.outcome = e.target.value; return renderJournal(); }
      const sel = e.target.closest('select[data-jf]');
      if (sel && jrUI.open) { window.Journal.set(jrUI.open, { [sel.dataset.jf]: sel.value }); save(); renderJournal(); return; }
      const pick = e.target.closest('[data-jrimg="pick"]');
      if (pick && pick.files && pick.files[0] && jrUI.open) {
        window.Journal.shrinkImage(pick.files[0], (url) => {
          if (!url) return toast('That picture could not be read.');
          window.Journal.set(jrUI.open, { img: url });
          save(); renderJournal();
        });
      }
    });
    $('journal').addEventListener('input', (e) => {
      if (e.target.id === 'jrQ') { jrUI.q = e.target.value; jrUI.focusQ = true; return renderJournal(); }
      const n = e.target.closest('[data-jn]');
      if (n && jrUI.open) {
        const v = parseFloat(n.value);
        window.Journal.set(jrUI.open, { [n.dataset.jn]: isFinite(v) && v > 0 ? v : null });
        save();
        const tg = $('jrSaved');
        if (tg) { tg.textContent = 'Saved'; clearTimeout(jrUI.t); jrUI.t = setTimeout(() => { if ($('jrSaved')) $('jrSaved').textContent = 'Saved as you type'; }, 1200); }
        return;
      }
      const f = e.target.closest('[data-jf]');
      if (!f || !jrUI.open) return;
      window.Journal.set(jrUI.open, { [f.dataset.jf]: f.value });
      save();
      const tag = $('jrSaved');
      if (tag) { tag.textContent = 'Saved'; clearTimeout(jrUI.t); jrUI.t = setTimeout(() => { if ($('jrSaved')) $('jrSaved').textContent = 'Saved as you type'; }, 1200); }
    });
    $('perfViews').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      const v = b.dataset.view;
      document.querySelectorAll('#perfViews [data-view]').forEach((x) => x.classList.toggle('on', x === b));
      $('perf').hidden = v !== 'overview';
      $('journal').hidden = v !== 'journal';
      $('backtest').hidden = v !== 'backtest';
      ui.perfView = v;
      if (v === 'overview') renderPerformance();
      if (v === 'journal') renderJournal();
      if (v === 'backtest') renderBacktest();
    });
  }

  /* ---------- strategy backtester ---------- */
  const btUI = { cfg: null, result: null };

  function btDefaults() {
    const b = E.realBounds();
    return {
      ticker: 'SPY', from: b ? b.first : '', to: b ? b.last : '',
      entry: 'smaCross', exit: 'opposite', params: {},
      stopPct: '', targetPct: '', sizePct: 100, cash: 100000,
      commission: S().settings.commission || 0,
    };
  }

  function renderBacktest() {
    const B = window.Backtest;
    if (!E.realBounds()) { $('backtest').innerHTML = `<div class="card perf-empty"><b>Recorded history has not loaded</b><p class="muted">The backtester needs the real price data.</p></div>`; return; }
    const cfg = btUI.cfg || (btUI.cfg = btDefaults());
    const ent = B.def(B.ENTRIES, cfg.entry), ext = B.def(B.EXITS, cfg.exit);
    const b = E.realBounds();
    const pfield = (p) => p.map(([k, label, dflt]) => `<label class="field"><span>${esc(label)}</span><input data-bp="${k}" type="number" step="any" value="${cfg.params[k] ?? dflt}"></label>`).join('');

    let html = `<form class="card bt-form" id="btForm" autocomplete="off">
      <div class="ac-row"><b>Test a set of rules on recorded history</b></div>
      <p class="muted small">Rules are decided on one day's close and filled at the next day's open, so a rule can never see the bar it trades on. The run is split: the earlier part to tune on, a later part the rules never saw.</p>
      <div class="bt-grid">
        <label class="field"><span>Product</span><input data-bf="ticker" list="calcList" value="${esc(cfg.ticker)}"></label>
        <label class="field"><span>From</span><input data-bf="from" type="date" min="${b.first}" max="${b.last}" value="${cfg.from}"></label>
        <label class="field"><span>To</span><input data-bf="to" type="date" min="${b.first}" max="${b.last}" value="${cfg.to}"></label>
        <label class="field"><span>Starting cash</span><input data-bf="cash" type="number" min="100" step="100" value="${cfg.cash}"></label>
      </div>
      <div class="bt-grid">
        <label class="field"><span>Buy when</span><select data-bf="entry">${B.ENTRIES.map((x) => `<option value="${x.id}"${x.id === cfg.entry ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select><small class="muted">${esc(ent.desc)}</small></label>
        ${pfield(ent.params || [])}
      </div>
      <div class="bt-grid">
        <label class="field"><span>Sell</span><select data-bf="exit">${B.EXITS.map((x) => `<option value="${x.id}"${x.id === cfg.exit ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select><small class="muted">${esc(ext.desc)}</small></label>
        ${pfield(ext.params || [])}
        <label class="field"><span>Stop loss (%)<small class="muted"> optional</small></span><input data-bf="stopPct" type="number" min="0" step="any" value="${cfg.stopPct}" placeholder="none"></label>
        <label class="field"><span>Take profit (%)<small class="muted"> optional</small></span><input data-bf="targetPct" type="number" min="0" step="any" value="${cfg.targetPct}" placeholder="none"></label>
      </div>
      <button class="btn btn-primary" type="submit" id="btRun">Run the test</button>
    </form>`;

    const r = btUI.result;
    if (r && r.error) html += `<div class="card perf-empty"><b>Cannot run that</b><p class="muted">${esc(r.error)}</p></div>`;
    else if (r) {
      const st = r.stats, d = r.design.stats, hb = r.heldBack.stats;
      const beat = st.ret - r.buyHold.ret;
      // The honest headline: did it survive the period it was never tuned on?
      const held = hb && hb.n ? hb.ret : null;
      const fell = d && hb && d.ret > 0 && hb.ret < 0;
      html += `<div class="card perf-hero">
        <div><span class="ac-eyebrow">The rules returned</span><div class="perf-big ${cls(st.ret)}">${pct(st.ret)}</div><p class="muted small">${money(r.startCash)} became ${money(st.end)} over ${r.dates.length} trading days</p></div>
        <div class="perf-vs"><span class="ac-eyebrow">Against buying and holding</span><div class="perf-mid ${cls(beat)}">${pct(beat)}</div><p class="muted small">Holding ${r.ticker} returned ${pct(r.buyHold.ret)}</p></div>
        <div class="perf-vs"><span class="ac-eyebrow">Worst fall from a peak</span><div class="perf-mid loss">${pct(st.maxDD)}</div><p class="muted small">${st.n} trade${st.n === 1 ? '' : 's'} · ${Math.round(st.avgDays)} days each</p></div>
      </div>`;

      html += `<div class="card bt-split ${fell ? 'warn' : ''}">
        <div class="ac-row"><b>The part it was tuned on, against the part it was not</b></div>
        <div class="bt-two">
          <div><span class="ac-eyebrow">Design period</span><div class="perf-mid ${cls(d ? d.ret : 0)}">${d ? pct(d.ret) : '—'}</div><p class="muted small">${C.shortDate(r.design.from)} to ${C.shortDate(r.design.to)} · ${d ? d.n : 0} trades</p></div>
          <div><span class="ac-eyebrow">Held back</span><div class="perf-mid ${cls(held || 0)}">${held == null ? '—' : pct(held)}</div><p class="muted small">${C.shortDate(r.heldBack.from)} to ${C.shortDate(r.heldBack.to)} · ${hb ? hb.n : 0} trades</p></div>
        </div>
        <p class="note">${fell
          ? 'These rules made money on the stretch they were built against and lost it on the stretch they had never seen. That is what fitting to noise looks like, and it is the usual result of adjusting a rule until the chart looks right.'
          : held == null ? 'The held-back period produced no trades, so it tells you nothing yet. Try a longer run.'
          : 'A strategy worth anything should hold up on days it was never tuned against. Compare the two numbers, not just the headline.'}</p>
      </div>`;

      const tiles = [
        ['Trades', st.n, `${st.wins} won`],
        ['Win rate', pctAbs(st.winRate), ''],
        ['Profit factor', st.profitFactor === Infinity ? '∞' : nf2(st.profitFactor), 'Won per £1 lost'],
        ['Average win', signedMoney(st.avgWin), ''],
        ['Average loss', signedMoney(-st.avgLoss), ''],
        ['Trading costs', money(r.costs), 'Spread and commission'],
      ];
      html += `<div class="card"><div class="ac-row"><b>How the rules behaved</b></div>
        <div class="perf-tiles">${tiles.map(([k, v, sub]) => `<div><span>${k}</span><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('')}</div></div>`;

      html += `<div class="card"><div class="ac-row"><b>The strategy against buying and holding</b>
        <span class="chart-key"><span class="key you">Rules</span><span class="key bench">Buy and hold</span></span></div>
        <canvas id="btChart" class="chart" height="240"></canvas></div>`;

      if (r.trades.length) {
        html += `<div class="card"><div class="ac-row"><b>Every trade the rules made</b><span class="muted small">${r.trades.length} in total</span></div>
          <div class="table-wrap"><table class="grid perf-tbl"><thead><tr><th>In</th><th>Out</th><th class="r">Held</th><th class="r">Entry</th><th class="r">Exit</th><th class="r">Result</th><th class="r">%</th><th>Why</th></tr></thead><tbody>
          ${r.trades.slice(-40).reverse().map((t) => `<tr><td>${C.shortDate(t.in)}</td><td>${C.shortDate(t.out)}</td><td class="r">${t.days}d</td><td class="r">${money(t.entry)}</td><td class="r">${money(t.exit)}</td><td class="r ${cls(t.pl)}">${signedMoney(t.pl)}</td><td class="r ${cls(t.pl)}">${pct(t.plPct)}</td><td>${({ stop: 'Stop hit', target: 'Target hit', time: 'Time up', signal: 'Signal ended', end: 'Run ended' })[t.why]}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      }
    }
    $('backtest').innerHTML = html;

    if (r && !r.error) {
      C.line($('btChart'), {
        labels: r.dates,
        series: [
          { values: r.buyHold.curve, color: getComputedStyle(document.documentElement).getPropertyValue('--chart-b').trim() || '#9aa3ad' },
          { values: r.equity, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), fill: true },
        ],
        fmt: (v) => money(v, 'USD', 0),
        hover: true,
      });
    }
  }

  function bindBacktest() {
    $('backtest').addEventListener('input', (e) => {
      const f = e.target.closest('[data-bf]'), p = e.target.closest('[data-bp]');
      if (f) btUI.cfg[f.dataset.bf] = f.type === 'number' ? e.target.value : e.target.value;
      else if (p) btUI.cfg.params[p.dataset.bp] = e.target.value;
    });
    $('backtest').addEventListener('change', (e) => {
      const f = e.target.closest('[data-bf]');
      if (f && (f.dataset.bf === 'entry' || f.dataset.bf === 'exit')) { btUI.cfg.params = {}; renderBacktest(); }
    });
    $('backtest').addEventListener('submit', (e) => {
      e.preventDefault();
      const c = btUI.cfg;
      btUI.result = window.Backtest.run({
        ticker: (c.ticker || '').trim().toUpperCase(), from: c.from, to: c.to,
        entry: c.entry, exit: c.exit, params: c.params,
        stopPct: +c.stopPct || 0, targetPct: +c.targetPct || 0,
        sizePct: +c.sizePct || 100, cash: +c.cash || 100000,
        commission: +S().settings.commission || 0,
      });
      renderBacktest();
    });
  }

  /* ---------- watchlists and alerts ---------- */
  const wlUI = { list: null, addTo: null, alertFor: '', alertKind: 'above', alertVal: '', alertNote: '' };

  function activeList() {
    const s = S();
    const l = E.listById(wlUI.list);
    wlUI.list = l ? l.id : null;
    return l;
  }

  function renderWatchlists() {
    const s = S();
    const cur = activeList();
    if (!cur) { $('watchlists').innerHTML = ''; return; }

    let html = `<div class="card wl-head">
      <div class="wl-tabs" role="tablist" aria-label="Your watchlists">
        ${s.lists.map((l) => `<button type="button" role="tab" class="wl-tab${l.id === cur.id ? ' on' : ''}" data-wl="${l.id}" aria-selected="${l.id === cur.id}">${esc(l.name)} <span class="muted">${l.t.length}</span></button>`).join('')}
        <button type="button" class="wl-tab add" id="wlNew" title="New list">+ New list</button>
      </div>
      <div class="wl-bar">
        <input id="wlAdd" list="calcList" placeholder="Add a product to ${esc(cur.name)} — type a ticker" aria-label="Add a product">
        <button type="button" class="btn" id="wlRename">Rename</button>
        <button type="button" class="btn btn-ghost" id="wlDelete"${s.lists.length <= 1 ? ' disabled title="You need at least one list"' : ''}>Delete list</button>
      </div>
    </div>`;

    const rows = cur.t.filter((t) => E.BY[t] && E.listed(t));
    if (!rows.length) {
      html += `<div class="card perf-empty"><b>${esc(cur.name)} is empty</b><p class="muted">Type a ticker above to add it, or press the star on any product.</p></div>`;
    } else {
      html += `<div class="card"><div class="table-wrap"><table class="grid wl-tbl"><thead><tr><th>Product</th><th class="r">Price</th><th class="r">Today</th><th class="r">Yield</th><th>Alerts</th><th></th></tr></thead><tbody>
        ${rows.map((t) => {
          const m = E.BY[t], p = E.price(t), ch = p / E.prevClose(t) - 1, y = E.fwdYield(t);
          const mine = (s.alerts || []).filter((a) => a.t === t && !a.firedOn);
          return `<tr><td><b>${t}</b> <span class="muted">${esc(m.n)}</span></td>
            <td class="r num">${money(p, m.cur)}</td>
            <td class="r ${cls(ch)}">${pct(ch)}</td>
            <td class="r">${y > 0 ? (y * 100).toFixed(2) + '%' : '—'}</td>
            <td>${mine.length ? mine.map((a) => `<span class="wl-al">${esc(E.ALERT_KINDS[a.kind])}${a.value ? ' ' + a.value : ''}<button type="button" data-alrm="${a.id}" aria-label="Remove alert">&times;</button></span>`).join('') : '<span class="muted small">none</span>'}</td>
            <td class="r"><button type="button" class="btn btn-ghost" data-alnew="${t}">Alert</button><button type="button" class="btn btn-ghost" data-wlrm="${t}" aria-label="Remove from list">&times;</button></td></tr>`;
        }).join('')}
      </tbody></table></div></div>`;
    }

    // the alert composer, opened from a row
    if (wlUI.alertFor) {
      const m = E.BY[wlUI.alertFor];
      const needsVal = ['above', 'below', 'pctUp', 'pctDown'].includes(wlUI.alertKind);
      html += `<form class="card wl-new" id="wlAlertForm">
        <div class="ac-row"><b>Alert me about ${esc(m.n)}</b><button type="button" class="focus-x small" id="wlAlertClose" aria-label="Cancel">&times;</button></div>
        <div class="bt-grid">
          <label class="field"><span>When it</span><select id="wlKind">${Object.entries(E.ALERT_KINDS).map(([k, v]) => `<option value="${k}"${k === wlUI.alertKind ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          ${needsVal ? `<label class="field"><span>${wlUI.alertKind === 'above' || wlUI.alertKind === 'below' ? `Price (now ${money(E.price(wlUI.alertFor), m.cur)})` : 'Percent'}</span><input id="wlVal" type="number" step="any" min="0" value="${esc(wlUI.alertVal)}"></label>` : ''}
          <label class="field"><span>Note <small class="muted">optional</small></span><input id="wlNote" value="${esc(wlUI.alertNote)}" placeholder="Why does this matter?"></label>
        </div>
        <p class="note">Alerts follow the simulation clock, not real time, and trigger on a price the day actually reached. They are simulated, like everything else here.</p>
        <button class="btn btn-primary" type="submit">Set the alert</button>
        <p class="msg" id="wlMsg" role="status"></p>
      </form>`;
    }

    const fired = (s.alerts || []).filter((a) => a.firedOn).sort((a, b) => (a.firedOn < b.firedOn ? 1 : -1));
    const live = (s.alerts || []).filter((a) => !a.firedOn);
    html += `<div class="card"><div class="ac-row"><b>Alerts</b><span class="muted small">${live.length} waiting · ${fired.length} triggered</span></div>
      ${live.length || fired.length ? `<div class="wl-alerts">
        ${live.map((a) => `<div class="wl-alert"><span><b>${a.t}</b> ${esc(E.ALERT_KINDS[a.kind]).toLowerCase()}${a.value ? ` ${a.value}` : ''}${a.note ? ` — ${esc(a.note)}` : ''}</span><button type="button" class="btn btn-ghost" data-alrm="${a.id}">Cancel</button></div>`).join('')}
        ${fired.map((a) => `<div class="wl-alert done"><span><b>${a.t}</b> ${esc(E.alertText(a))} on ${C.shortDate(a.firedOn)}${a.note ? ` — ${esc(a.note)}` : ''}</span><button type="button" class="btn btn-ghost" data-alrm="${a.id}">Clear</button></div>`).join('')}
      </div>` : '<p class="muted small">No alerts yet. Press Alert on any row above.</p>'}</div>`;

    $('watchlists').innerHTML = html;
  }

  function bindWatchlists() {
    $('watchlists').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-wl]');
      if (tab) { wlUI.list = tab.dataset.wl; wlUI.alertFor = ''; return renderWatchlists(); }
      if (e.target.closest('#wlNew')) {
        ask({ title: 'New watchlist', label: 'Name', field: true, placeholder: 'e.g. Dividend ideas', yes: 'Create' }).then((name) => {
          if (!name) return;
          wlUI.list = E.createList(name);
          save(); refresh(); renderWatchlists();
        });
        return;
      }
      if (e.target.closest('#wlRename')) {
        const l = activeList();
        ask({ title: 'Rename list', label: 'Name', value: l.name, yes: 'Rename' }).then((name) => {
          if (!name) return;
          E.renameList(l.id, name); save(); renderWatchlists();
        });
        return;
      }
      if (e.target.closest('#wlDelete')) {
        const l = activeList();
        ask({
          title: `Delete "${l.name}"?`,
          body: 'The products stay in the market and anything you hold is untouched. Only the list goes, and that cannot be undone.',
          yes: 'Delete list', danger: true,
        }).then((go) => {
          if (!go) return;
          E.deleteList(l.id); wlUI.list = null; save(); refresh(); renderWatchlists();
        });
        return;
      }
      const rm = e.target.closest('[data-wlrm]');
      if (rm) { E.toggleInList(activeList().id, rm.dataset.wlrm); save(); refresh(); return renderWatchlists(); }
      const an = e.target.closest('[data-alnew]');
      if (an) { wlUI.alertFor = an.dataset.alnew; wlUI.alertVal = ''; wlUI.alertNote = ''; return renderWatchlists(); }
      if (e.target.closest('#wlAlertClose')) { wlUI.alertFor = ''; return renderWatchlists(); }
      const arm = e.target.closest('[data-alrm]');
      if (arm) { E.removeAlert(+arm.dataset.alrm); save(); return renderWatchlists(); }
    });
    $('watchlists').addEventListener('change', (e) => {
      if (e.target.id === 'wlAdd') {
        const t = e.target.value.trim().toUpperCase();
        if (!E.BY[t]) { toast(`No product called ${t}.`); e.target.value = ''; return; }
        const l = activeList();
        if (!l.t.includes(t)) E.toggleInList(l.id, t);
        e.target.value = ''; save(); refresh(); renderWatchlists();
      }
      if (e.target.id === 'wlKind') { wlUI.alertKind = e.target.value; renderWatchlists(); }
    });
    $('watchlists').addEventListener('input', (e) => {
      if (e.target.id === 'wlVal') wlUI.alertVal = e.target.value;
      if (e.target.id === 'wlNote') wlUI.alertNote = e.target.value;
    });
    $('watchlists').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = E.addAlert(wlUI.alertFor, wlUI.alertKind, wlUI.alertVal, wlUI.alertNote);
      if (!r.ok) { $('wlMsg').textContent = r.msg; return; }
      wlUI.alertFor = ''; save(); renderWatchlists();
      toast(`Alert set for ${r.alert.t}.`);
    });
  }

  function boot() {
    const th = getTheme();
    if (th !== 'system') document.documentElement.setAttribute('data-theme', th);
    const saved = loadSaved();
    let restored = false;
    if (saved) {
      try { E.load(saved); restored = true; } catch (e) { restored = false; }
    }
    if (!restored) {
      E.newGame(100000);
    }
    applyQuoteConfig();
    ui.newMarket = S().mode || 'sim';
    ui.chartT = uiPref('chartT') || null;
    const cr = +uiPref('chartRange'); if ([21, 63, 126, 260].includes(cr)) ui.chartRange = cr;
    // Auto-refresh is remembered per browser, and only starts if this game is a live one.
    if (uiPref('liveAuto') && E.liveOn()) setTimeout(() => setAuto(true), 0);
    if (uiPref('chartType') === 'line') ui.chartType = 'line';
    ui.chartMA = uiPref('chartMA') === '1';
    $('chMA').setAttribute('aria-pressed', String(ui.chartMA));
    document.querySelectorAll('#chRange button').forEach((b) => b.classList.toggle('on', +b.dataset.r === ui.chartRange));
    document.querySelectorAll('#chType button').forEach((b) => b.classList.toggle('on', b.dataset.ct === ui.chartType));
    const sp = +uiPref('speedx');
    setSpeed(sp > 0 ? sp : 1);
    $('search').placeholder = `Search ${E.U.length} securities by ticker or name`;
    renderSelects();
    bind();
    const tab = uiPref('tab');
    showTab(tab && document.getElementById('tab-' + tab) ? tab : 'markets');
    if (!restored) save();
    if (window.Cloud) {
      window.Cloud.init({
        serialize: () => E.serialize(),
        summary: () => ({ day: S().day, date: S().date, nw: E.netWorth() }),
        isFresh: () => S().day === 0 && !S().tx.length,
        isSkipping: () => !!ui.skip,
        apply: applyLoadedGame,
        toast, money, longDate,
      });
    }
  }

  // Replace the running game with one loaded from the player's account.
  function applyLoadedGame(state) {
    setPlaying(false);
    if (ui.sheet) closeSheet();
    E.load(state);
    saveNow();
    ui.calMonth = null; ui.calSel = null; ui.calFollow = true;
    renderSelects();
    showTab(ui.tab);
  }

  boot();

  // Small surface for the guided tour.
  window.App = {
    showTab,
    // Pass the side through: the wrapper used to drop it silently, so App.openSheet(t, true,
    // 'sell') opened the buy form.
    openSheet: (t, quiet, side) => openSheet(t, quiet, side),
    closeSheet,
    sheetOpen: () => !!ui.sheet,
    sheetTicker: () => ui.sheet,
    save, toast,
    saveNow: () => { save(); saveNow(); },
    pickChart,
    isFresh: () => S().day === 0 && !S().tx.length,
    netWorth: () => E.netWorth(),
    newGame: startNewGame,
    getTheme, setTheme,
    // exposed for the test suite: one tick of the auto-refresh timer, without waiting it out
    _autoTick: autoTick,
  };
})();
