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
  }
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
    calMonth: null, calSel: null, calFollow: true, calWatch: false,
  };

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
    $('simDay').textContent = `Day ${s.day + 1}${ds !== 'normal' ? ` · dividends ${ds}` : ''}`;
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
      if (!E.BY[t]) continue;
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
      for (const m of E.U) if (fn(m)) n++;
      if (!n && !['watch', 'owned', 'all'].includes(key)) continue;
      html += `<button type="button" class="chip${ui.filter === key ? ' on' : ''}" data-filter="${key}">${label}<span class="n">${n}</span></button>`;
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
      if (ui.sector && m.sector !== ui.sector) continue;
      if (ui.exch && m.exch !== ui.exch) continue;
      if (q && !(m.t.toLowerCase().startsWith(q) || m.n.toLowerCase().includes(q) || m.type.toLowerCase().includes(q) || (m.cat || '').toLowerCase().includes(q))) continue;
      if (!fn(m)) continue;
      const h = S().sec[m.t].h;
      const p = h[h.length - 1];
      rows.push({ m, p, chg: p / h[h.length - 2] - 1, y1: p / h[0] - 1, yld: E.fwdYield(m.t), exact: q && m.t.toLowerCase() === q });
    }
    const dir = ui.asc ? 1 : -1;
    const key = {
      t: (r) => r.m.t, type: (r) => r.m.type, sector: (r) => r.m.sector, price: (r) => r.p * E.fxOf(r.m),
      chg: (r) => r.chg, y1: (r) => r.y1, yield: (r) => r.yld, q: (r) => (S().sec[r.m.t].dps > 0 ? r.m.q : 0),
    }[ui.sort];
    if (key) rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    if (q) rows.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));
    return rows;
  }

  function renderMarkets() {
    const rows = marketRows();
    $('resultCount').textContent = `${rows.length.toLocaleString()} ${rows.length === 1 ? 'security' : 'securities'}`;
    const shown = rows.slice(0, ui.limit);
    const s = S();
    let html = '';
    for (const r of shown) {
      const m = r.m;
      const h = s.sec[m.t].h;
      const spark = C.sparkSVG(h.slice(-30), h[h.length - 1] >= h[h.length - 30]);
      const w = s.watch.includes(m.t);
      const pays = s.sec[m.t].dps > 0 ? FREQ_SHORT[m.q] : '';
      html += `<tr data-open="${m.t}">
        <td class="star-col"><button type="button" class="star${w ? ' on' : ''}" data-watch="${m.t}" aria-label="${w ? 'Remove from' : 'Add to'} watchlist">${w ? '★' : '☆'}</button></td>
        <td><div class="sec-cell"><b>${esc(m.t)}${s.holdings[m.t] ? '<span class="held-dot" title="You own this"></span>' : ''}</b><span>${esc(m.n)}</span></div></td>
        <td class="hide-sm"><span class="type-pill">${esc(m.cat || m.type)}</span></td>
        <td class="hide-md muted">${esc(m.sector)}</td>
        <td class="hide-sm">${spark}</td>
        <td class="r">${money(r.p, m.cur)}</td>
        <td class="r"><span class="chg-pill ${cls(r.chg)}">${pct(r.chg)}</span></td>
        <td class="r hide-sm ${cls(r.y1)}">${pct(r.y1, 1)}</td>
        <td class="r">${r.yld > 0 ? (r.yld * 100).toFixed(2) + '%' : '<span class="muted">-</span>'}</td>
        <td class="r hide-md muted">${pays}</td>
      </tr>`;
    }
    if (!shown.length) {
      html = `<tr><td colspan="10" class="empty">${ui.filter === 'watch' ? 'Your watchlist is empty. Tap the star next to any security to add it.' : ui.filter === 'owned' ? 'You do not own anything yet. Open a security and buy some shares.' : 'Nothing matches. Try a different search or filter, or list it yourself in Settings.'}</td></tr>`;
    }
    $('marketBody').innerHTML = html;
    $('moreBtn').hidden = rows.length <= ui.limit;
    $('moreBtn').textContent = `Show more (${(rows.length - ui.limit).toLocaleString()} left)`;
    document.querySelectorAll('#marketTable th[data-sort]').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === ui.sort);
      th.classList.toggle('asc', th.dataset.sort === ui.sort && ui.asc);
    });
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
    $('divTiles').innerHTML =
      tile('Forward income', money(income) + '/yr', `${money(income / 12)} a month on average`) +
      tile('Portfolio yield', mv ? ((income / mv) * 100).toFixed(2) + '%' : '-', `${payers} paying holding${payers === 1 ? '' : 's'}`) +
      tile('Yield on cost', cost ? ((income / cost) * 100).toFixed(2) + '%' : '-', 'income vs what you paid') +
      tile('Last 12 months', money(last12), 'received') +
      tile('All time', money(total), `${s.divLog.length} payment${s.divLog.length === 1 ? '' : 's'}`) +
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
    $('divHistBody').innerHTML = hist.length ? hist.map((e) => `<tr data-open="${e.t}"><td class="num">${C.shortDate(e.d)}</td><td><b class="num">${esc(e.t)}</b></td><td class="r">${money(e.dps, e.cur, 4)}</td><td class="r up">${money(e.amt)}</td><td class="r">${e.drip ? qtyFmt(+e.shares.toFixed(4)) + ' sh' : '<span class="muted">Cash</span>'}</td></tr>`).join('')
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
    $('newsList').innerHTML = items.length ? items.map((n) => `<li${mine(n.t) ? ' class="mine"' : ''}><span class="d">${C.shortDate(n.d)}</span><span><span class="k">${label[n.kind] || n.kind}</span>${esc(n.text)}${n.t ? ` <a data-open="${n.t}">${esc(n.t)}</a>` : ''}</span><span class="num small ${n.chg != null ? cls(n.chg) : ''}">${n.chg != null && n.kind === 'earnings' ? pct(n.chg) : ''}</span></li>`).join('')
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
  }

  /* ---------- security sheet ---------- */
  function openSheet(t) {
    if (!E.BY[t]) return;
    ui.sheet = t;
    ui.side = S().holdings[t] && ui.side === 'sell' ? 'sell' : 'buy';
    $('ordQty').value = '';
    $('ordPx').value = '';
    $('ordKind').value = 'market';
    $('tradeMsg').textContent = '';
    $('tradeMsg').className = 'msg';
    $('sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    renderSheet(true);
    setTimeout(() => $('ordQty').focus({ preventScroll: true }), 30);
  }
  function closeSheet() {
    ui.sheet = null;
    $('sheet').hidden = true;
    document.body.style.overflow = '';
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
    const h = st.h;
    const p = h[h.length - 1];
    const chg = p / h[h.length - 2] - 1;

    if (full) {
      $('shTicker').textContent = t;
      $('shName').textContent = m.n;
      const badges = [m.cat || m.type, m.exch, m.sector, m.cur === 'GBP' ? 'Priced in GBP' : null, ...m.tags.filter((x) => x !== 'Dividend'), m.custom ? 'Listed by you' : null].filter(Boolean);
      $('shBadges').innerHTML = badges.map((b, i) => `<span class="badge${i === 0 ? ' accent' : ''}">${esc(b)}</span>`).join('');
      document.querySelectorAll('#shRange button').forEach((b) => b.classList.toggle('on', +b.dataset.r === ui.range));
    }
    $('shWatch').textContent = s.watch.includes(t) ? '★ Watching' : '☆ Watch';
    $('shPrice').textContent = money(p, m.cur);
    const usdNote = m.cur === 'GBP' ? ` <span class="muted small">≈ ${money(p * s.fx)}</span>` : '';
    $('shChg').innerHTML = `<span class="${cls(chg)}">${signedMoney(p - h[h.length - 2], m.cur)} (${pct(chg)})</span> <span class="muted small">today</span>${usdNote}`;

    const range = Math.min(ui.range, h.length);
    const vals = h.slice(-range);
    const css = getComputedStyle(document.documentElement);
    const up = vals[vals.length - 1] >= vals[0];
    C.line($('shChart'), {
      labels: s.dates.slice(-range),
      series: [{ values: vals, color: css.getPropertyValue(up ? '--gain' : '--loss').trim(), fill: true }],
      fmt: (v) => money(v, m.cur, v >= 1000 ? 0 : undefined),
    });

    const lo = Math.min(...h), hi = Math.max(...h);
    const ann = E.annualDps(t);
    const ex = E.nextExDate(t);
    const stats = [
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
          <div><dt>Today</dt><dd class="${cls(chg)}">${signedMoney(pos.qty * (p - h[h.length - 2]) * fx)}</dd></div>
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
    const unit = E.price(t) * E.fxOf(m) * (m.cur === 'GBP' && s.settings.stamp && m.type !== 'ETF' ? 1.005 : 1);
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

    const quick = ui.side === 'buy'
      ? [['$100', 'usd', 100], ['$1,000', 'usd', 1000], ['$10,000', 'usd', 10000], ['Max', 'shares', maxBuyShares()]]
      : pos ? [['25%', 'shares', pos.qty * 0.25], ['50%', 'shares', pos.qty * 0.5], ['All', 'shares', pos.qty]] : [];
    $('quickAmt').innerHTML = quick.filter((x) => x[2] > 0).map(([l, u, v]) => `<button type="button" data-q="${v}" data-u="${u}">${l}</button>`).join('');

    const qty = sharesFromInput();
    const trig = parseFloat($('ordPx').value);
    const px = kind !== 'market' && trig > 0 ? trig : E.price(t);
    const fx = E.fxOf(m);
    const gross = qty * px * fx;
    const commission = +s.settings.commission || 0;
    const stamp = ui.side === 'buy' && m.cur === 'GBP' && s.settings.stamp && m.type !== 'ETF' ? gross * 0.005 : 0;
    const total = ui.side === 'buy' ? gross + commission + stamp : gross - commission;
    const lines = [
      [kind === 'market' ? 'Price' : 'Trigger price', money(px, m.cur)],
      ['Shares', qty ? qtyFmt(qty) : '-'],
    ];
    if (m.cur === 'GBP') lines.push(['GBP/USD', s.fx.toFixed(4)]);
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
      msg.textContent = `${ui.side === 'buy' ? 'Bought' : 'Sold'} ${qtyFmt(qty)} ${t} for ${money(Math.abs(res.q.total))}.`;
    } else {
      msg.textContent = `Order placed. It will ${ui.side} ${qtyFmt(qty)} ${t} when the price ${(kind === 'limit') === (ui.side === 'buy') ? 'falls to' : 'reaches'} ${money(parseFloat($('ordPx').value), E.BY[t].cur)}.`;
    }
    $('ordQty').value = '';
    save();
    refresh();
  }

  /* ---------- toasts ---------- */
  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
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
        if (ev.res.ok) toast(`${o.kind === 'limit' ? 'Limit' : 'Stop'} order filled: ${o.side === 'buy' ? 'bought' : 'sold'} ${qtyFmt(o.qty)} ${o.t} at ${money(E.price(o.t), E.BY[o.t].cur)}`);
        else toast(`Order for ${o.t} cancelled: ${ev.res.msg}`);
      }
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
      const fills = all.filter((e) => e.kind === 'fill' || e.kind === 'split');
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
        for (const e of ev) if (e.kind === 'fill' || e.kind === 'split' || e.kind === 'div') job.events.push(e);
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

  /* ---------- calendar ---------- */
  function calEvents(fromISO, toISO) {
    const s = S();
    const held = Object.keys(s.holdings);
    const tickers = ui.calWatch ? [...new Set([...held, ...s.watch])] : held;
    const ev = [];
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
      const shown = list.slice(0, 3).map((e) => `<span class="ev ev-${e.kind}${e.est ? ' est' : ''}">${esc(e.t)}${e.kind === 'ex' ? ' ex' : e.kind === 'earn' ? ' earns' : ''}</span>`).join('');
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
    }
    return '';
  }
  const EV_LABEL = { paid: 'Paid', pay: 'Payday', ex: 'Ex-dividend', earn: 'Earnings' };

  function renderCalDay(list) {
    const s = S();
    const ds = ui.calSel;
    const wd = E.parseISO(ds).getUTCDay();
    let body = list.length
      ? `<ul class="cal-list">${list.map((e) => `<li data-open="${e.t}"><span class="ev ev-${e.kind}${e.est ? ' est' : ''}">${EV_LABEL[e.kind]}${e.est ? ' (est.)' : ''}</span><span><b class="num">${esc(e.t)}</b> <span class="muted">${esc(E.BY[e.t] ? E.BY[e.t].n : '')}</span><br>${evText(e)}</span></li>`).join('')}</ul>`
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

  /* ---------- refresh ---------- */
  function refresh() {
    renderHeader();
    renderTape();
    if (ui.tab === 'markets') { renderMarkets(); if (ui.filter === 'owned' || ui.filter === 'watch') renderChips(); }
    if (ui.tab === 'portfolio') renderPortfolio();
    if (ui.tab === 'dividends') renderDividends();
    if (ui.tab === 'orders') renderOrders();
    if (ui.tab === 'calendar') { if (ui.calFollow) ui.calMonth = S().date.slice(0, 7); renderCalendar(); }
    if (ui.tab === 'activity') renderActivity();
    if (ui.sheet) renderSheet(false);
  }

  function showTab(tab) {
    ui.tab = tab;
    uiPref('tab', tab);
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.querySelectorAll('main .panel').forEach((p) => { p.hidden = p.id !== 'tab-' + tab; });
    if (tab === 'markets') renderChips();
    if (tab === 'settings') renderSettings();
    if (tab === 'dividends' || tab === 'calendar' || tab === 'settings') renderDivSpeed();
    refresh();
  }

  function toggleWatch(t) {
    const w = S().watch;
    const i = w.indexOf(t);
    if (i >= 0) w.splice(i, 1); else w.push(t);
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
    $('typeChips').addEventListener('click', (e) => {
      const c = e.target.closest('[data-filter]');
      if (!c) return;
      ui.filter = c.dataset.filter; ui.limit = 120;
      renderChips(); renderMarkets();
    });
    document.querySelectorAll('#marketTable th[data-sort]').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.sort;
      if (ui.sort === k) ui.asc = !ui.asc; else { ui.sort = k; ui.asc = ['t', 'type', 'sector'].includes(k); }
      renderMarkets();
    }));
    $('moreBtn').addEventListener('click', () => { ui.limit += 200; renderMarkets(); });

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
      ui.unit = b.dataset.u;
      const v = +b.dataset.q;
      $('ordQty').value = ui.unit === 'shares' ? +v.toFixed(4) : v;
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
      setPlaying(false);
      E.newGame(+$('setStart').value);
      b.classList.remove('armed');
      b.textContent = 'Start a new game';
      $('resetNote').textContent = 'New game started.';
      save();
      renderSelects();
      showTab('markets');
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
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      if (ui.playing) setPlaying(false);
      if (saveTimer) saveNow();
    });
    window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  }

  /* ---------- boot ---------- */
  function boot() {
    const saved = loadSaved();
    let restored = false;
    if (saved) {
      try { E.load(saved); restored = true; } catch (e) { restored = false; }
    }
    if (!restored) {
      E.newGame(100000);
    }
    const sp = +uiPref('speedx');
    setSpeed(sp > 0 ? sp : 1);
    $('search').placeholder = `Search ${E.U.length} securities by ticker or name`;
    renderSelects();
    bind();
    const tab = uiPref('tab');
    showTab(tab && document.getElementById('tab-' + tab) ? tab : 'markets');
    if (!restored) save();
  }

  boot();
})();
