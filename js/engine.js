/*
 * Market engine: builds the security universe, simulates daily prices with a
 * factor model, and handles dividends, splits, earnings, macro news and orders.
 * No DOM access here; app.js owns the UI.
 */
(function () {
  'use strict';

  const D = window.MARKET_DATA;
  const HIST = 261;            // ~1 trading year of closes kept per security
  const HIST_V = 2;            // version of the back-history model, so saved games can be refreshed
  const TD = 252;              // trading days per year
  const START_DATE = '2026-10-09';
  const SECTORS = Object.keys(D.stocks);

  const SECTOR_VOL = {
    'Technology': 0.34, 'Communication Services': 0.30, 'Consumer Discretionary': 0.32,
    'Consumer Staples': 0.18, 'Health Care': 0.25, 'Financials': 0.25, 'Industrials': 0.25,
    'Energy': 0.30, 'Materials': 0.28, 'Utilities': 0.18, 'Real Estate': 0.23,
  };
  const SECTOR_BETA = {
    'Technology': 1.2, 'Communication Services': 1.05, 'Consumer Discretionary': 1.15,
    'Consumer Staples': 0.55, 'Health Care': 0.75, 'Financials': 1.1, 'Industrials': 1.05,
    'Energy': 0.85, 'Materials': 1.0, 'Utilities': 0.5, 'Real Estate': 0.85,
  };
  // Daily standard deviation of each shared factor.
  const FACTOR_SD = { mkt: 0.0095, rate: 0.0035, uk: 0.006, intl: 0.006, gold: 0.009, crypto: 0.025 };
  const SECTOR_SD = 0.0065;
  const MKT_MU = 0.0003;       // ~7.5% a year

  /* ---------- random helpers ---------- */
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const rnd = Math.random;
  const pick = (arr, r = rnd) => arr[Math.floor(r() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (p) => Number(p >= 100 ? p.toFixed(2) : p >= 1 ? p.toFixed(3) : p.toFixed(5));

  /* ---------- dates ---------- */
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function nextTradingDay(s) {
    const d = parseISO(s);
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return iso(d);
  }
  function prevTradingDay(s) {
    const d = parseISO(s);
    do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
    return iso(d);
  }
  function addTradingDays(s, n) { let d = s; for (let i = 0; i < n; i++) d = nextTradingDay(d); return d; }

  /* ---------- universe ---------- */
  const U = [];
  const BY = {};

  function parseBlock(block) {
    return block.trim().split('\n').filter(Boolean).map((line) => {
      const [t, n, p, y, f = ''] = line.split('|');
      return { t: t.trim(), n: n.trim(), p: +p, y: +y, f: f.trim() };
    });
  }
  function freqFrom(f, def) {
    if (f.includes('M')) return 12;
    if (f.includes('S')) return 2;
    if (f.includes('A')) return 1;
    return def;
  }

  function finish(m) {
    m.h = hash(m.t);
    m.q = m.y > 0 ? m.q : 0;
    m.rate = m.rate || 0;
    m.carry = (m.y / 100) / TD;
    if (!m.track) {
      const d = m.vol / Math.sqrt(TD);
      let sys = Math.pow(m.beta * FACTOR_SD.mkt, 2) + Math.pow(m.rate * FACTOR_SD.rate, 2);
      if (m.sec && SECTOR_BETA[m.sec] != null) sys += SECTOR_SD * SECTOR_SD;
      if (m.fac) sys += Math.pow(FACTOR_SD[m.fac], 2);
      m.idio = Math.sqrt(Math.max(d * d - sys, Math.pow(0.15 * d, 2)));
    }
    // Dividend schedule, derived from the ticker so it is stable between sessions.
    const hh = m.h;
    m.exDom = 1 + (hh % 20);
    if (m.q === 12) m.exMonths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    else if (m.q === 4) { const o = hh % 3; m.exMonths = [o, o + 3, o + 6, o + 9]; }
    else if (m.q === 2) { const o = hh % 6; m.exMonths = [o, o + 6]; }
    else if (m.q === 1) m.exMonths = [hh % 12];
    else m.exMonths = [];
    m.payLag = m.cur === 'GBP' ? 20 : 10;
    m.exWd = 1 + ((hh >>> 5) % 5);   // weekday used when dividends are paid weekly
    m.earnOff = hh % 63;
    m.divOff = (hh >>> 3) % TD;
    m.hasEarnings = ['Stock', 'REIT', 'BDC', 'MLP', 'International', 'UK Share', 'Penny Stock'].includes(m.type);
    m.tags = buildTags(m);
    U.push(m);
    BY[m.t] = m;
    return m;
  }

  function buildTags(m) {
    const t = [];
    if (m.blue) t.push('Blue Chip');
    if (m.arist) t.push('Dividend Aristocrat');
    if (m.y > 0) t.push('Dividend');
    if (m.y >= 5) t.push('High Yield');
    if (m.q === 12) t.push('Monthly Payer');
    const growthSector = ['Technology', 'Communication Services', 'Consumer Discretionary'].includes(m.sec);
    if (['Stock', 'International'].includes(m.type) && m.y < 0.8 && (growthSector || m.vol > 0.45)) t.push('Growth');
    if (['Stock', 'International', 'UK Share'].includes(m.type) && m.y >= 2.5) t.push('Value');
    return t;
  }

  function build(custom) {
    U.length = 0;
    for (const k in BY) delete BY[k];

    for (const sector of SECTORS) {
      for (const r of parseBlock(D.stocks[sector])) {
        let type = 'Stock';
        if (sector === 'Real Estate') type = 'REIT';
        if (/\(BDC\)/.test(r.n)) type = 'BDC';
        if (/ LP$/.test(r.n)) type = 'MLP';
        const hi = r.f.includes('h');
        finish({
          t: r.t, n: r.n.replace(' (BDC)', ''), sector, sec: sector, type,
          exch: r.f.includes('n') ? 'NASDAQ' : 'NYSE', cur: 'USD', base: r.p, y: r.y,
          q: freqFrom(r.f, 4), beta: SECTOR_BETA[sector] * (hi ? 1.35 : 1),
          vol: SECTOR_VOL[sector] * (hi ? 1.9 : 1),
          rate: type === 'REIT' ? 0.6 : sector === 'Utilities' ? 0.4 : 0,
          blue: r.f.includes('b'), arist: r.f.includes('r'),
        });
      }
    }

    const fundSector = (f) => f.sec || ({
      'Bond ETF': 'Fixed Income', 'Preferred ETF': 'Fixed Income', 'Commodity ETF': 'Commodities',
      'Crypto ETF': 'Crypto', 'International ETF': 'International',
    }[f.cat]) || (f.rate > 0.5 ? 'Fixed Income' : 'Broad Market');
    const nasdaqFunds = ['QQQ', 'TQQQ', 'SQQQ', 'IBIT', 'ETHA', 'SOXX', 'VXUS', 'BND', 'BNDX', 'VCIT', 'JEPQ', 'QYLD', 'SCHG', 'SHY', 'TLT', 'IEF', 'EMB'];
    const funds = D.funds.slice().sort((a, b) => (a.track ? 1 : 0) - (b.track ? 1 : 0));
    for (const f of funds) {
      const parent = f.track ? BY[f.track] : null;
      finish({
        t: f.t, n: f.n, cat: f.cat, sector: parent ? parent.sector : fundSector(f), sec: f.sec || (parent && parent.sec),
        type: f.cat === 'Mutual Fund' ? 'Mutual Fund' : 'ETF',
        exch: f.cat === 'Mutual Fund' ? 'Mutual Fund' : nasdaqFunds.includes(f.t) ? 'NASDAQ' : 'NYSE Arca',
        cur: 'USD', base: f.p, y: f.y, q: f.q, beta: f.beta != null ? f.beta : 1, vol: f.vol || (parent ? parent.vol * Math.abs(f.lev) : 0.2),
        rate: f.rate || 0, fac: f.fac || null, track: f.track || null, lev: f.lev || 0,
      });
    }

    for (const r of parseBlock(D.preferred)) {
      finish({ t: r.t, n: r.n, sector: 'Fixed Income', type: 'Preferred', exch: 'NYSE', cur: 'USD', base: r.p, y: r.y, q: 4, beta: 0.2, vol: 0.08, rate: 0.6 });
    }
    for (const r of parseBlock(D.international)) {
      const hi = r.f.includes('h');
      finish({
        t: r.t, n: r.n, sector: 'International', type: 'International', exch: r.f.includes('n') ? 'NASDAQ' : 'NYSE',
        cur: 'USD', base: r.p, y: r.y, q: freqFrom(r.f, 4), beta: 0.9 * (hi ? 1.3 : 1), vol: 0.28 * (hi ? 1.7 : 1), fac: 'intl', blue: r.f.includes('b'),
      });
    }
    for (const r of parseBlock(D.uk)) {
      const isFund = /ETF/.test(r.n);
      const trust = /Investment Trust/.test(r.n);
      const hi = r.f.includes('h');
      finish({
        t: r.t, n: r.n.replace(' (REIT)', ''), sector: 'UK', cat: isFund ? 'UK ETF' : trust ? 'Investment Trust' : undefined,
        type: isFund ? 'ETF' : trust ? 'Investment Trust' : /\(REIT\)/.test(r.n) ? 'REIT' : 'UK Share',
        exch: 'LSE', cur: 'GBP', base: r.p, y: r.y, q: freqFrom(r.f, 4),
        beta: isFund && /S&P|All-World/.test(r.n) ? 0.95 : 0.55, vol: isFund ? 0.14 : 0.26 * (hi ? 1.6 : 1),
        fac: /S&P/.test(r.n) ? null : 'uk', rate: /REIT/.test(r.n) ? 0.6 : 0,
      });
    }
    for (const r of parseBlock(D.penny)) {
      finish({ t: r.t, n: r.n, sector: 'Small Cap', type: 'Penny Stock', exch: r.f.includes('n') ? 'NASDAQ' : 'NYSE', cur: 'USD', base: r.p, y: r.y, q: 4, beta: 1.4, vol: 0.85 });
    }
    for (const c of custom || []) {
      finish(Object.assign({}, c, { custom: true }));
    }
  }

  function customMeta(input) {
    const volMap = { low: 0.15, medium: 0.3, high: 0.55, extreme: 0.9 };
    const t = input.t.toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 10);
    const type = input.type || 'Stock';
    return {
      t, n: input.n || t, sector: SECTORS.includes(input.sector) ? input.sector : (input.sector || 'Other'),
      sec: SECTORS.includes(input.sector) ? input.sector : null,
      type, exch: 'OTC', cur: 'USD', base: +input.p, y: +input.y || 0, q: +input.q || 0,
      beta: type === 'Preferred' ? 0.2 : type === 'Penny Stock' ? 1.4 : 1, vol: volMap[input.vol] || 0.3,
      rate: type === 'REIT' || type === 'Preferred' ? 0.6 : 0,
    };
  }

  /* ---------- simulation state ---------- */
  let S = null;

  function freshState(startCash) {
    return {
      v: 1,
      histV: HIST_V,
      date: START_DATE,
      day: 0,
      startCash, cash: startCash,
      fx: 1.34,               // GBP -> USD
      sec: {},
      dates: [],
      holdings: {},
      orders: [],
      drawings: {},           // per ticker: chart drawings, points as { d: game day, p: price }
      pending: [],             // declared dividends awaiting payment
      tx: [],
      divLog: [],
      news: [],
      nw: [],                  // net worth history {d, v, b}
      watch: ['AAPL', 'KO', 'O', 'SCHD', 'VOO', 'JEPI'],
      custom: [],
      settings: { commission: 0, stamp: true, fractional: true, drip: false, divSpeed: 'normal', account: 'us' },
      nextId: 1,
      realized: 0,
      feesPaid: 0,
    };
  }

  // Real-world anchors for the back history: [months before day 1, level then].
  const REAL = D.history || { market: [], stocks: {} };
  const anchorIdx = (months) => Math.max(0, HIST - 1 - Math.round(months * 21));

  // Bend a log-price path so it passes through the anchors (relative to its last value). The
  // correction is spread linearly between anchors, so the day-to-day noise stays realistic.
  function bendLogPath(lp, anchors, endLevel) {
    const n = lp.length;
    const pts = anchors.map(([mo, lvl]) => [anchorIdx(mo), Math.log(lvl / endLevel)])
      .filter(([i]) => i < n - 1).sort((a, b) => a[0] - b[0]);
    if (!pts.length) return lp;
    pts.push([n - 1, 0]);
    const delta = pts.map(([i, want]) => want - (lp[i] - lp[n - 1]));
    delta[delta.length - 1] = 0;
    const out = lp.slice();
    for (let k = 0; k < n; k++) {
      let d;
      if (k <= pts[0][0]) d = delta[0];
      else {
        let j = 1; while (pts[j][0] < k) j++;
        const [i0] = pts[j - 1], [i1] = pts[j];
        d = delta[j - 1] + (delta[j] - delta[j - 1]) * (k - i0) / (i1 - i0);
      }
      out[k] = lp[k] + d;
    }
    return out;
  }

  // Generate a year of deterministic back history so charts and 52-week stats exist on day one.
  // It follows the shape of the real market year, and real price points for well-known names.
  function backfill(m, bfFactors) {
    const rng = mulberry(m.h ^ 0x9e3779b9);
    const n = HIST;
    const prices = new Array(n);
    let rets;
    if (m.track) {
      const pr = S._bfRets[m.track];
      rets = pr.map((r) => m.lev * r - 0.0095 / TD);
    } else {
      rets = [0];
      // No dividend drops are simulated in back history, so leave out the yield carry too.
      for (let k = 1; k < n; k++) rets.push(factorReturn(m, bfFactors[k], gauss(rng)) - m.carry);
    }
    prices[0] = 1;
    for (let k = 1; k < n; k++) prices[k] = Math.max(prices[k - 1] * (1 + rets[k]), 1e-6);
    // S&P 500 trackers follow the index itself.
    const tracksIndex = !REAL.stocks[m.t] && ['SPY', 'VOO', 'IVV', 'VTI'].includes(m.t) && REAL.market.length;
    const anchors = tracksIndex ? REAL.market : REAL.stocks[m.t];
    if (anchors) {
      const lp = bendLogPath(prices.map(Math.log), anchors, tracksIndex ? REAL.market[REAL.market.length - 1][1] : m.base);
      for (let k = 0; k < n; k++) prices[k] = Math.exp(lp[k]);
      rets = prices.map((p, k) => (k ? p / prices[k - 1] - 1 : 0));
    }
    S._bfRets[m.t] = rets;
    const scale = m.base / prices[n - 1];
    return prices.map((p) => round(p * scale));
  }

  function makeBackfillFactors() {
    const rng = mulberry(424242);
    const out = [];
    for (let k = 0; k < HIST; k++) out.push(drawFactors(rng));
    // Anchor the back history to the real market year; every other factor ends flat.
    const mkt = REAL.market && REAL.market.length ? REAL.market : [[12, 1 / 1.095], [0, 1]];
    for (const key of Object.keys(out[0])) {
      const target = key === 'mkt' ? Math.log(mkt[mkt.length - 1][1] / mkt[0][1]) * (HIST - 1) / Math.max(1, HIST - 1 - anchorIdx(mkt[0][0])) : 0;
      const shift = (out.reduce((a, F) => a + F[key], 0) - target) / (HIST - 1);
      for (let k = 1; k < HIST; k++) out[k][key] -= shift;
    }
    // Then bend the market's path through the real highs and lows.
    const cum = [0];
    for (let k = 1; k < HIST; k++) cum.push(cum[k - 1] + out[k].mkt);
    const bent = bendLogPath(cum, mkt, mkt[mkt.length - 1][1]);
    for (let k = 1; k < HIST; k++) out[k].mkt += (bent[k] - bent[k - 1]) - (cum[k] - cum[k - 1]);
    return out;
  }

  function drawFactors(r) {
    const F = { mkt: MKT_MU + FACTOR_SD.mkt * gauss(r) };
    for (const k of ['rate', 'uk', 'intl', 'gold', 'crypto']) F[k] = FACTOR_SD[k] * gauss(r);
    for (const s of SECTORS) F[s] = SECTOR_SD * gauss(r);
    return F;
  }

  function factorReturn(m, F, z) {
    let r = m.carry + m.beta * F.mkt + m.rate * F.rate + m.idio * z;
    if (m.sec && F[m.sec] != null) r += F[m.sec];
    if (m.fac) r += F[m.fac];
    return clamp(r, -0.6, 1.5);
  }

  function initSecState(m, bf) {
    const hist = backfill(m, bf);
    const st = { h: hist, dps: m.q ? (m.base * m.y / 100) / m.q : 0, lx: '' };
    st.lx = exKeyOn(m, S.date) || '';
    S.sec[m.t] = st;
  }

  function ensureAllSecStates() {
    let bf = null;
    S._bfRets = {};
    for (const m of U) {
      if (!S.sec[m.t]) {
        bf = bf || makeBackfillFactors();
        if (m.track && !S._bfRets[m.track]) {
          // Parent already existed in a saved game; derive a back history from its saved closes.
          const ph = S.sec[m.track].h;
          S._bfRets[m.track] = ph.map((p, i) => (i ? p / ph[i - 1] - 1 : 0));
        }
        initSecState(m, bf);
      }
    }
    delete S._bfRets;
    if (!S.dates.length) {
      const dates = [S.date];
      while (dates.length < HIST) dates.unshift(prevTradingDay(dates[0]));
      S.dates = dates;
    }
    if (!S.nw.length) S.nw.push({ d: S.date, v: S.cash, b: price('SPY') });
  }

  function newGame(startCash) {
    S = freshState(startCash);
    build(S.custom);
    ensureAllSecStates();
    addNews('macro', `Market open. You have ${fmtUSD(startCash)} to invest. Prices move once per simulated trading day.`);
    return S;
  }

  function load(saved) {
    S = saved;
    S.settings = Object.assign({ commission: 0, stamp: true, fractional: true, drip: false, divSpeed: 'normal', account: 'us' }, S.settings);
    build(S.custom);
    ensureAllSecStates();
    if (!S.drawings) S.drawings = {};
    if (S.histV !== HIST_V) refreshBackHistory();
    return S;
  }

  // Redraw the part of each chart from before day 1 with the current back-history model,
  // joined onto the saved prices so nothing that happened in the game changes.
  function refreshBackHistory() {
    const keep = HIST - S.day;
    if (keep > 1) {
      const bf = makeBackfillFactors();
      S._bfRets = {};
      for (const m of U) {
        const st = S.sec[m.t];
        if (m.track && !S._bfRets[m.track]) continue;
        const fresh = backfill(m, bf);
        if (!st || st.h.length !== HIST) continue;
        const join = st.h[keep - 1];
        const k = join / fresh[HIST - 1];
        for (let i = 0; i < keep - 1; i++) st.h[i] = round(fresh[HIST - keep + i] * k);
      }
      delete S._bfRets;
    }
    S.histV = HIST_V;
  }

  /* ---------- queries ---------- */
  const price = (t) => { const h = S.sec[t].h; return h[h.length - 1]; };
  const prevClose = (t) => { const h = S.sec[t].h; return h[h.length - 2] ?? h[h.length - 1]; };
  const fxOf = (m) => (m.cur === 'GBP' ? S.fx : 1);
  const priceUSD = (t) => price(t) * fxOf(BY[t]);
  function fmtUSD(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

  function holdingValue(t) { const h = S.holdings[t]; return h ? h.qty * priceUSD(t) : 0; }
  function marketValue() { let v = 0; for (const t in S.holdings) v += holdingValue(t); return v; }
  function netWorth() { return S.cash + marketValue(); }
  // st.dps is the per-payment amount on the security's real schedule (m.q payments a year).
  function annualDps(t) { const m = BY[t]; return S.sec[t].dps * m.q; }
  function fwdYield(t) { const p = price(t); return p > 0 ? annualDps(t) / p : 0; }

  /* ---------- dividend speed ----------
   * 'normal' keeps each security's real schedule. 'monthly' and 'weekly' pay the same
   * yearly dividend in smaller, more frequent instalments with a shorter wait to be paid. */
  const DIV_SPEEDS = { normal: { per: 0, lag: 0 }, monthly: { per: 12, lag: 5 }, weekly: { per: 52, lag: 1 } };
  function divSpeed() { return DIV_SPEEDS[S.settings.divSpeed] ? S.settings.divSpeed : 'normal'; }
  function payoutsPerYear(m) { return DIV_SPEEDS[divSpeed()].per || m.q; }
  function perPayment(t) { const m = BY[t]; return m.q ? annualDps(t) / payoutsPerYear(m) : 0; }
  function payLagOf(m) { return DIV_SPEEDS[divSpeed()].lag || m.payLag; }

  // Returns the schedule key (month or week) if `ds` falls on or after this period's ex-date.
  function exKeyOn(m, ds) {
    if (!m.q) return null;
    const d = parseISO(ds);
    const mode = divSpeed();
    if (mode === 'weekly') {
      const wd = d.getUTCDay();
      if (wd < m.exWd) return null;
      const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - (wd - 1));
      return 'W' + iso(mon);
    }
    if (mode === 'normal' && !m.exMonths.includes(d.getUTCMonth())) return null;
    if (d.getUTCDate() < m.exDom) return null;
    return ds.slice(0, 7);
  }

  /*
   * Projected ex-dividend dates, pay dates and earnings days for the given tickers,
   * from the day after today up to and including `toISO`.
   */
  function futureEvents(tickers, toISO, opts = {}) {
    const ms = tickers.map((t) => BY[t]).filter(Boolean);
    const lx = {};
    for (const m of ms) lx[m.t] = S.sec[m.t].lx;
    const out = [];
    let d = S.date, di = S.day;
    for (;;) {
      d = nextTradingDay(d); di++;
      if (d > toISO) break;
      for (const m of ms) {
        if (opts.earnings !== false && m.hasEarnings && di % 63 === m.earnOff) out.push({ d, t: m.t, kind: 'earn' });
        if (!m.q || S.sec[m.t].dps <= 0) continue;
        const key = exKeyOn(m, d);
        if (!key || key === lx[m.t]) continue;
        lx[m.t] = key;
        const dps = perPayment(m.t);
        out.push({ d, t: m.t, kind: 'ex', dps });
        out.push({ d: addTradingDays(d, payLagOf(m)), t: m.t, kind: 'pay', dps, ex: d, est: true });
      }
      if (opts.first && out.some((e) => e.kind === 'ex')) break;
    }
    return out;
  }

  function nextExDate(t) {
    const m = BY[t];
    if (!m.q || !S.sec[t].dps) return null;
    const limit = iso(new Date(parseISO(S.date).getTime() + 400 * 864e5));
    const ev = futureEvents([t], limit, { earnings: false, first: true }).find((e) => e.kind === 'ex');
    return ev ? ev.d : null;
  }

  // Number of trading-day steps needed to reach the last trading day on or before `target`.
  function tradingDaysUntil(target) {
    let d = S.date, n = 0;
    for (;;) { const nx = nextTradingDay(d); if (nx > target) return n; d = nx; n++; if (n > 30000) return n; }
  }

  /* ---------- news ---------- */
  function addNews(kind, text, t, chg) {
    S.news.unshift({ id: S.nextId++, d: S.date, kind, text, t: t || null, chg: chg ?? null });
    if (S.news.length > 400) S.news.length = 400;
  }

  const MACRO = [
    { p: 1, text: 'Federal Reserve cuts rates by 25 basis points', s: { mkt: 0.008, rate: 0.006, 'Real Estate': 0.006, 'Utilities': 0.004, 'Financials': -0.003 } },
    { p: 1, text: 'Federal Reserve signals rates will stay higher for longer', s: { mkt: -0.009, rate: -0.007, 'Real Estate': -0.008, 'Utilities': -0.005 } },
    { p: 1, text: 'Inflation report comes in hotter than expected', s: { mkt: -0.012, rate: -0.006, gold: 0.012 } },
    { p: 1, text: 'Inflation cools more than forecast', s: { mkt: 0.011, rate: 0.006 } },
    { p: 1, text: 'Strong jobs report beats forecasts', s: { mkt: 0.006, 'Consumer Discretionary': 0.006 } },
    { p: 1, text: 'Weak jobs report sparks recession worries', s: { mkt: -0.01, rate: 0.005, 'Consumer Staples': 0.004, gold: 0.008 } },
    { p: 1, text: 'Oil prices spike on supply disruption', s: { 'Energy': 0.035, mkt: -0.003, 'Consumer Discretionary': -0.006, 'Industrials': -0.004 } },
    { p: 1, text: 'Oil prices slump as OPEC+ raises output', s: { 'Energy': -0.03, 'Consumer Discretionary': 0.004 } },
    { p: 1, text: 'AI chip demand surge lifts semiconductor stocks', s: { 'Technology': 0.025, mkt: 0.004 } },
    { p: 1, text: 'Tech stocks sell off on valuation fears', s: { 'Technology': -0.03, 'Communication Services': -0.015, mkt: -0.006 } },
    { p: 1, text: 'Big banks post strong quarterly results', s: { 'Financials': 0.018 } },
    { p: 1, text: 'Drug pricing reform weighs on pharma stocks', s: { 'Health Care': -0.025 } },
    { p: 1, text: 'Consumer confidence falls to a multi-year low', s: { 'Consumer Discretionary': -0.02, 'Consumer Staples': 0.006 } },
    { p: 1, text: 'Retail sales jump; shoppers keep spending', s: { 'Consumer Discretionary': 0.018 } },
    { p: 1, text: 'Bitcoin rallies to a new record high', s: { crypto: 0.09 } },
    { p: 1, text: 'Crypto markets tumble after exchange hack', s: { crypto: -0.11 } },
    { p: 1, text: 'Gold hits a record as investors seek safety', s: { gold: 0.025 } },
    { p: 1, text: 'Bank of England cuts interest rates', s: { uk: 0.012, fx: -0.006 } },
    { p: 1, text: 'Pound slides against the dollar', s: { fx: -0.015, uk: 0.004 } },
    { p: 1, text: 'Pound jumps after strong UK growth data', s: { fx: 0.012, uk: 0.006 } },
    { p: 1, text: 'China stimulus package lifts global markets', s: { intl: 0.02, 'Materials': 0.015, mkt: 0.004 } },
    { p: 1, text: 'Housing starts rise; homebuilders rally', s: { 'Consumer Discretionary': 0.008, 'Materials': 0.006, 'Real Estate': 0.006 } },
    { p: 0.12, text: 'Market crash: stocks plunge in a broad sell-off', s: { mkt: -0.07, crypto: -0.15, gold: 0.03, rate: 0.01, intl: -0.02, uk: -0.02 } },
    { p: 0.25, text: 'Relief rally: stocks post their best day in months', s: { mkt: 0.03, crypto: 0.05 } },
  ];
  const MACRO_TOTAL = MACRO.reduce((a, e) => a + e.p, 0);
  function pickMacro() {
    let x = rnd() * MACRO_TOTAL;
    for (const e of MACRO) { x -= e.p; if (x <= 0) return e; }
    return MACRO[0];
  }

  /* ---------- one simulated trading day ---------- */
  function step() {
    const events = [];
    S.date = nextTradingDay(S.date);
    S.day++;
    const F = drawFactors(rnd);
    let fxShock = 0.0045 * gauss(rnd);

    if (rnd() < 0.045) {
      const e = pickMacro();
      for (const k in e.s) { if (k === 'fx') fxShock += e.s[k]; else F[k] += e.s[k]; }
      addNews('macro', e.text);
      events.push({ kind: 'macro', text: e.text });
    }
    S.fxPrev = S.fx;
    S.fx = clamp(S.fx * (1 + fxShock), 0.9, 2.0);

    const dayRets = {};
    const qtr = 'Q' + (Math.floor(parseISO(S.date).getUTCMonth() / 3) + 1);
    for (const m of U) {
      if (m.track) continue;
      let r = factorReturn(m, F, gauss(rnd));
      if (m.hasEarnings && (S.day % 63) === m.earnOff) {
        const jump = 0.004 + gauss(rnd) * (m.vol / Math.sqrt(TD)) * 3.2;
        r = clamp(r + jump, -0.6, 1.5);
        const mine = S.holdings[m.t] || S.watch.includes(m.t);
        if (Math.abs(jump) > 0.05 || mine) {
          const beat = jump >= 0;
          addNews('earnings', `${m.n} ${qtr} earnings ${beat ? 'beat' : 'miss'} estimates`, m.t, r);
        }
      }
      dayRets[m.t] = r;
    }
    for (const m of U) {
      if (!m.track) continue;
      dayRets[m.t] = clamp(m.lev * (dayRets[m.track] || 0) - 0.0095 / TD, -0.95, 3);
    }

    for (const m of U) {
      const st = S.sec[m.t];
      const p = Math.max(round(price(m.t) * (1 + dayRets[m.t])), 0.0001);
      st.h.push(p);
      if (st.h.length > HIST) st.h.shift();
    }
    S.dates.push(S.date);
    if (S.dates.length > HIST) S.dates.shift();

    processDividends(events);
    processSplits(events);
    processOrders(events);

    S.nw.push({ d: S.date, v: netWorth(), b: price('SPY') });
    if (S.nw.length > 5000) S.nw.splice(0, S.nw.length - 5000);
    return events;
  }

  function processDividends(events) {
    for (const m of U) {
      const st = S.sec[m.t];
      // Annual dividend review: raise, hold, cut, or start paying.
      if (S.day > 0 && S.day % TD === m.divOff) reviewDividend(m, st);
      if (!m.q || st.dps <= 0) continue;
      const key = exKeyOn(m, S.date);
      if (!key || st.lx === key) continue;
      st.lx = key;
      // Ex-dividend: price drops by the dividend; holders today get paid later.
      const dps = perPayment(m.t);
      const last = st.h.length - 1;
      st.h[last] = Math.max(round(st.h[last] - dps), round(st.h[last] * 0.5));
      const h = S.holdings[m.t];
      if (h && h.qty > 0) {
        S.pending.push({ id: S.nextId++, t: m.t, qty: h.qty, dps, ex: S.date, pay: addTradingDays(S.date, payLagOf(m)) });
      }
    }

    const due = S.pending.filter((p) => p.pay <= S.date);
    if (!due.length) return;
    S.pending = S.pending.filter((p) => p.pay > S.date);
    for (const p of due) {
      const m = BY[p.t];
      if (!m) continue;
      const gross = p.qty * p.dps * fxOf(m);
      const tax = dividendTax(m, gross, true);
      const amt = gross - tax;
      S.taxPaid = (S.taxPaid || 0) + tax;
      const h = S.holdings[p.t];
      const drip = h ? (h.drip ?? S.settings.drip) : false;
      const entry = { id: S.nextId++, d: S.date, ex: p.ex, t: p.t, qty: p.qty, dps: p.dps, cur: m.cur, gross, tax, amt, drip: false };
      if (drip) {
        const px = priceUSD(p.t);
        const sh = amt / px;
        h.qty += sh;
        h.cost += amt;
        h.costN = (h.costN ?? 0) + amt / fxOf(m);
        entry.drip = true;
        entry.shares = sh;
        S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'DRIP', t: p.t, qty: sh, px: price(p.t), cur: m.cur, amt: -amt, fee: 0 });
      } else {
        S.cash += amt;
      }
      S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'DIV', t: p.t, qty: p.qty, px: p.dps, cur: m.cur, amt, fee: 0, note: tax > 0.005 ? `${fmtMoney(tax)} tax withheld` : null });
      S.divLog.unshift(entry);
      events.push({ kind: 'div', t: p.t, amt, drip: entry.drip });
    }
    if (S.tx.length > 3000) S.tx.length = 3000;
  }

  function reviewDividend(m, st) {
    if (['Preferred'].includes(m.type)) return;
    const mine = S.holdings[m.t] || S.watch.includes(m.t);
    if (!m.q) return;
    const y = fwdYield(m.t);
    if (st.dps <= 0) {
      if (rnd() < 0.08) {
        st.dps = price(m.t) * 0.015 / m.q;
        if (mine) addNews('dividend', `${m.n} reinstates its dividend`, m.t);
      }
      return;
    }
    if (m.type === 'ETF' || m.type === 'Mutual Fund') { st.dps *= 1 + 0.03 * gauss(rnd) + 0.02; return; }
    let cutP = y > 0.09 ? 0.25 : y > 0.06 ? 0.07 : 0.015;
    if (m.arist) cutP = 0.003;
    if (m.type === 'Penny Stock') cutP = 0.2;
    if (rnd() < cutP) {
      const cut = rnd() < 0.2 ? 1 : 0.3 + rnd() * 0.4;
      st.dps = cut === 1 ? 0 : st.dps * (1 - cut);
      const text = cut === 1 ? `${m.n} suspends its dividend` : `${m.n} cuts its dividend by ${Math.round(cut * 100)}%`;
      addNews('dividend', text, m.t, -cut);
      if (m.arist) { m.arist = false; m.tags = buildTags(m); }
      return;
    }
    const g = m.arist ? clamp(0.06 + 0.02 * gauss(rnd), 0.01, 0.15) : clamp(0.045 + 0.04 * gauss(rnd), 0, 0.2);
    st.dps *= 1 + g;
    if (mine && g > 0) addNews('dividend', `${m.n} raises its dividend ${Math.round(g * 1000) / 10}%`, m.t, g);
  }

  function processSplits(events) {
    for (const m of U) {
      if (!['Stock', 'International', 'UK Share', 'REIT', 'Penny Stock'].includes(m.type) || m.t === 'BRK.A') continue;
      const p = price(m.t);
      if (p > 1000 && rnd() < 0.0015) {
        const ideal = p / 200;
        const ratios = [2, 3, 4, 5, 10, 15, 20, 25, 50];
        const r = ratios.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a));
        applySplit(m, r);
        addNews('split', `${m.n} completes a ${r}-for-1 stock split`, m.t);
        events.push({ kind: 'split', t: m.t, r });
      } else if (m.cur === 'USD' && p < 0.5 && rnd() < 0.01) {
        applySplit(m, 1 / 10);
        addNews('split', `${m.n} completes a 1-for-10 reverse split to stay listed`, m.t);
        events.push({ kind: 'split', t: m.t, r: 0.1 });
      }
    }
  }

  function applySplit(m, r) {
    const st = S.sec[m.t];
    st.h = st.h.map((p) => round(p / r));
    for (const dr of (S.drawings || {})[m.t] || []) for (const pt of dr.pts) pt.p /= r;
    st.dps /= r;
    const h = S.holdings[m.t];
    if (h) {
      h.qty *= r;
      S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'SPLIT', t: m.t, qty: h.qty, px: price(m.t), cur: m.cur, amt: 0, fee: 0, note: r >= 1 ? `${r}-for-1` : `1-for-${Math.round(1 / r)}` });
    }
    for (const o of S.orders) if (o.t === m.t) { o.qty *= r; o.px /= r; }
    for (const p of S.pending) if (p.t === m.t) { p.qty *= r; p.dps /= r; }
  }

  /* ---------- daily bars ---------- */
  // The open, high, low and volume behind each close. Deterministic, so the bar a reader sees on
  // the chart is the same bar the order book trades against: an order can only fill at a price
  // the day actually reached.
  function rand4(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    const out = [];
    for (let k = 0; k < 4; k++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out.push(((h >>> 0) % 10000) / 10000); }
    return out;
  }
  function barAt(t, i) {
    const m = BY[t], h = S.sec[t].h;
    if (i < 1 || i >= h.length) return null;
    const c = h[i], pc = h[i - 1];
    const sd = Math.min(0.08, Math.max(0.002, (m.vol || 0.3) / Math.sqrt(TD)));
    const [r1, r2, r3, r4] = rand4(t + (S.dates[i] || i));
    const o = pc * (1 + (r1 - 0.5) * sd * 0.7);
    const baseVol = 1e6 * (1 + (rand4(t)[0] * 9));
    return {
      o, c,
      h: Math.max(o, c) * (1 + r2 * sd * 0.9),
      l: Math.min(o, c) * (1 - r3 * sd * 0.9),
      v: baseVol * (0.5 + r4) * (1 + Math.abs(c / pc - 1) / sd * 0.6),
      d: S.dates[i] || '',
    };
  }
  const lastBar = (t) => barAt(t, S.sec[t].h.length - 1);
  function bars(t, n) {
    const h = S.sec[t].h, len = h.length, start = Math.max(1, len - n);
    const out = { o: [], h: [], l: [], c: [], v: [], labels: [] };
    for (let i = start; i < len; i++) {
      const b = barAt(t, i);
      out.o.push(b.o); out.h.push(b.h); out.l.push(b.l); out.c.push(b.c); out.v.push(b.v); out.labels.push(b.d);
    }
    return out;
  }
  // A typical day's volume, used to size market impact and the most you can fill in one day.
  function typicalVolume(t) { const b = lastBar(t); return b ? b.v : 1e6; }

  /* ---------- trading ---------- */
  /* ---------- real-world frictions ---------- */
  // Half of the typical bid/ask spread. Big liquid names trade a cent wide; penny stocks much wider.
  function halfSpread(m) {
    if (m.type === 'Mutual Fund') return 0;                 // funds trade at the end-of-day NAV
    if (m.type === 'Penny Stock') return 0.006;
    if (m.type === 'Preferred') return 0.0012;
    if (m.track) return 0.0002;
    if (m.type === 'ETF') return m.exch === 'LSE' ? 0.0006 : 0.0001;
    if (m.custom) return 0.002;
    if (m.exch === 'LSE') return m.base < 2 ? 0.0012 : 0.0006;
    if (m.type === 'International') return 0.0004;
    if (m.blue) return 0.00005;
    return m.base < 20 ? 0.0006 : 0.0002;
  }

  const ACCOUNTS = {
    us: 'US taxable brokerage account',
    ira: 'US retirement account (IRA, 401k, Roth)',
    isa: 'UK Stocks & Shares ISA',
    gia: 'UK general account, basic-rate taxpayer',
    giah: 'UK general account, higher-rate taxpayer',
  };
  // Dividends that the IRS taxes as ordinary income rather than at the qualified rate.
  function isOrdinaryIncome(m) {
    return ['REIT', 'BDC', 'MLP'].includes(m.type) || ['Bond ETF', 'Income ETF'].includes(m.cat) || (m.type === 'Mutual Fund' && m.rate >= 0.5);
  }
  function ukTaxYear(ds) { const y = +ds.slice(0, 4); return ds.slice(5) >= '04-06' ? y : y - 1; }

  /*
   * Tax due on a dividend of `gross` USD. US accounts: 15% qualified / 24% ordinary.
   * UK accounts: 15% US withholding on US-listed holdings (not reclaimable in an ISA);
   * outside an ISA, UK dividend tax applies above the £500 yearly allowance.
   * With commit=true the UK allowance is used up.
   */
  function dividendTax(m, gross, commit) {
    const a = ACCOUNTS[S.settings.account] ? S.settings.account : 'us';
    if (a === 'ira') return 0;
    if (a === 'us') return gross * (isOrdinaryIncome(m) ? 0.24 : 0.15);
    const wht = m.cur === 'USD' ? 0.15 : 0;
    if (a === 'isa') return gross * wht;
    const rate = a === 'giah' ? 0.3375 : 0.0875;
    const ty = ukTaxYear(S.date);
    if (!S.allow || S.allow.y !== ty) S.allow = { y: ty, left: 500 };
    const allowUSD = S.allow.left * S.fx;
    const used = Math.min(gross, allowUSD);
    if (commit) S.allow.left = Math.max(0, S.allow.left - used / S.fx);
    return Math.max(gross * wht, (gross - used) * rate);
  }
  function taxRateEstimate(m) {
    const a = ACCOUNTS[S.settings.account] ? S.settings.account : 'us';
    if (a === 'ira') return 0;
    if (a === 'us') return isOrdinaryIncome(m) ? 0.24 : 0.15;
    const wht = m.cur === 'USD' ? 0.15 : 0;
    if (a === 'isa') return wht;
    return Math.max(wht, a === 'giah' ? 0.3375 : 0.0875);
  }

  function fees(m, side, gross) {
    let commission = +S.settings.commission || 0;
    let stamp = 0;
    if (side === 'buy' && m.cur === 'GBP' && S.settings.stamp && !['ETF'].includes(m.type)) stamp = gross * 0.005;
    return { commission, stamp, total: commission + stamp };
  }

  /*
   * Market impact: a big order has to walk the book, so it pays more than the quoted spread.
   * Impact grows with the square root of the order's share of a normal day's volume, the usual
   * rule of thumb on a trading desk. At ordinary retail sizes this rounds to nothing.
   */
  function impact(t, qty) {
    const v = typicalVolume(t);
    if (!(v > 0) || !(qty > 0)) return 0;
    return Math.min(0.10, 0.02 * Math.sqrt(qty / v));
  }

  // Buys fill at the ask and sells at the bid, around the mid (last) price, plus market impact.
  function quote(t, side, qty, atPrice) {
    const m = BY[t];
    const mid = atPrice || price(t);
    const hs = halfSpread(m) + impact(t, qty);
    const px = mid * (side === 'buy' ? 1 + hs : 1 - hs);
    const gross = qty * px * fxOf(m);
    const f = fees(m, side, gross);
    const total = side === 'buy' ? gross + f.total : gross - f.total;
    const q = halfSpread(m);
    return { px, mid, bid: mid * (1 - q), ask: mid * (1 + q), slip: mid * impact(t, qty) * qty * fxOf(m), spreadCost: qty * mid * q * fxOf(m), gross, fee: f, total };
  }

  function validateQty(qty) {
    if (!(qty > 0) || !isFinite(qty)) return 'Enter a quantity above zero.';
    if (!S.settings.fractional && !Number.isInteger(qty)) return 'Fractional shares are off. Enter a whole number, or turn them on in Settings.';
    return null;
  }

  function execute(t, side, qty, source, atPrice, ignoreReserved) {
    const m = BY[t];
    const err = validateQty(qty);
    if (err) return { ok: false, msg: err };
    const q = quote(t, side, qty, atPrice);
    if (side === 'buy') {
      const free = ignoreReserved ? S.cash : availableCash();
      if (q.total > free + 1e-9) {
        const held = S.cash - free;
        return { ok: false, msg: held > 0.005
          ? `Not enough free cash. This order needs ${fmtMoney(q.total)} and you have ${fmtMoney(free)} available (${fmtMoney(held)} is set aside for your open buy orders).`
          : `Not enough cash. This order needs ${fmtMoney(q.total)} and you have ${fmtMoney(S.cash)}.` };
      }
      S.cash -= q.total;
      const h = S.holdings[t] || (S.holdings[t] = { qty: 0, cost: 0, costN: 0, drip: null, opened: S.date });
      h.qty += qty;
      h.cost += q.total;
      h.costN = (h.costN ?? 0) + q.total / fxOf(m);
    } else {
      const h = S.holdings[t];
      if (!h || h.qty < qty - 1e-9) return { ok: false, msg: `You only own ${h ? +h.qty.toFixed(4) : 0} shares of ${t}.` };
      const freeQty = ignoreReserved ? h.qty : availableQty(t);
      if (qty > freeQty + 1e-9) return { ok: false, msg: `Only ${+freeQty.toFixed(4)} of your ${+h.qty.toFixed(4)} ${t} shares are free to sell. The rest are committed to an open sell order, which you can cancel on the Orders tab.` };
      const basis = h.cost * (qty / h.qty);
      S.cash += q.total;
      if (h.costN != null) h.costN -= h.costN * (qty / h.qty);
      h.qty -= qty;
      h.cost -= basis;
      S.realized += q.total - basis;
      if (h.qty < 1e-9) delete S.holdings[t];
      q.pl = q.total - basis;
      q.plPct = basis > 0 ? q.pl / basis : null;
    }
    S.feesPaid += q.fee.total;
    S.tx.unshift({ id: S.nextId++, d: S.date, kind: side === 'buy' ? 'BUY' : 'SELL', t, qty, px: q.px, cur: m.cur, amt: side === 'buy' ? -q.total : q.total, fee: q.fee.total, pl: q.pl ?? null, plPct: q.plPct ?? null, note: source || null });
    return { ok: true, q };
  }

  function fmtMoney(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Cash and shares already promised to open orders, so they cannot be spent or sold twice.
  function orderCost(o) {
    const m = BY[o.t];
    if (!m) return 0;
    const gross = o.qty * o.px * fxOf(m);
    return gross + fees(m, 'buy', gross).total;
  }
  function reservedCash() {
    let c = 0;
    for (const o of S.orders) if (o.side === 'buy') c += orderCost(o);
    return c;
  }
  function reservedQty(t) {
    let q = 0;
    for (const o of S.orders) if (o.t === t && o.side === 'sell') q += o.qty;
    return q;
  }
  const availableCash = () => Math.max(0, S.cash - reservedCash());
  const availableQty = (t) => Math.max(0, (S.holdings[t] ? S.holdings[t].qty : 0) - reservedQty(t));

  const GTC_DAYS = 90;   // brokers expire a "good till cancelled" order after about 90 days

  function placeOrder(t, side, kind, qty, px, tif) {
    const err = validateQty(qty);
    if (err) return { ok: false, msg: err };
    if (!BY[t]) return { ok: false, msg: 'Unknown product.' };
    if (!(px > 0)) return { ok: false, msg: 'Enter a trigger price above zero.' };
    const p = price(t);
    // A limit or stop on the wrong side of the market would fill instantly; that is a market order.
    if (kind === 'limit' && side === 'buy' && px > p * 1.5) return { ok: false, msg: `That limit is far above the ${t} price of ${fmtMoney(p)}. A buy limit sits below the price and waits for a dip.` };
    if (kind === 'limit' && side === 'sell' && px < p * 0.5) return { ok: false, msg: `That limit is far below the ${t} price of ${fmtMoney(p)}. A sell limit sits above the price and waits for a rise.` };
    if (kind === 'stop' && side === 'sell' && px > p) return { ok: false, msg: `A stop loss protects you on the way down, so it sits below the ${t} price of ${fmtMoney(p)}.` };
    if (kind === 'stop' && side === 'buy' && px < p) return { ok: false, msg: `A buy stop sits above the ${t} price of ${fmtMoney(p)}.` };
    if (side === 'sell') {
      const h = S.holdings[t];
      if (!h || h.qty < qty - 1e-9) return { ok: false, msg: `You only own ${h ? +h.qty.toFixed(4) : 0} shares of ${t}.` };
      const free = availableQty(t);
      if (qty > free + 1e-9) return { ok: false, msg: `Only ${+free.toFixed(4)} of your ${+h.qty.toFixed(4)} ${t} shares are free. The rest are already committed to an open sell order.` };
    } else {
      const o = { t, qty, px };
      const need = orderCost(o), free = availableCash();
      if (need > free + 1e-9) return { ok: false, msg: `This order could cost ${fmtMoney(need)} and only ${fmtMoney(free)} of your ${fmtMoney(S.cash)} is uncommitted. Cancel an open buy order or reduce the size.` };
    }
    const o = { id: S.nextId++, t, side, kind, qty, px, placed: S.date, tif: tif === 'day' ? 'day' : 'gtc', filled: 0, status: 'open' };
    S.orders.push(o);
    return { ok: true, order: o };
  }

  function cancelOrder(id) { S.orders = S.orders.filter((o) => o.id !== id); }

  /*
   * Work the open orders against the day's range.
   *
   * An order only fills if the day actually traded at its price, and it fills at a price the day
   * really reached: if the market gapped past the order at the open you get the open, which is
   * better than you asked for on a limit and worse on a stop. That gap is why a stop loss cannot
   * promise the price written on it.
   */
  function processOrders(events) {
    const keep = [];
    for (const o of S.orders) {
      if (!BY[o.t]) continue;
      const bar = lastBar(o.t);
      if (!bar) { keep.push(o); continue; }

      const buy = o.side === 'buy';
      const triggered = o.kind === 'limit'
        ? (buy ? bar.l <= o.px : bar.h >= o.px)
        : (buy ? bar.h >= o.px : bar.l <= o.px);

      if (!triggered) {
        if (expired(o, events)) continue;
        keep.push(o); continue;
      }

      // Price the fill from the day's open, capped by what the order asked for.
      const fillPx = buy
        ? (o.kind === 'limit' ? Math.min(o.px, bar.o) : Math.max(o.px, bar.o))
        : (o.kind === 'limit' ? Math.max(o.px, bar.o) : Math.min(o.px, bar.o));

      // You cannot take more than a slice of a day's volume; the rest keeps working.
      const want = o.qty - o.filled;
      const canFill = Math.max(0, Math.min(want, bar.v * 0.25));
      const qty = S.settings.fractional ? canFill : Math.floor(canFill);
      if (qty < 1e-9) { keep.push(o); continue; }

      const res = execute(o.t, o.side, qty, o.kind === 'limit' ? 'Limit order' : 'Stop order', fillPx, true);
      if (!res.ok) {
        o.status = 'cancelled';
        events.push({ kind: 'fill', order: o, res });
        addNews('order', `Order to ${o.side} ${+(o.qty - o.filled).toFixed(4)} ${o.t} was cancelled: ${res.msg}`, o.t);
        continue;
      }
      o.filled += qty;
      const done = o.filled >= o.qty - 1e-9;
      o.status = done ? 'filled' : 'partial';
      events.push({ kind: 'fill', order: o, res, qty, partial: !done });
      if (!done) { addNews('order', `Part of your order filled: ${+qty.toFixed(4)} of ${+o.qty.toFixed(4)} ${o.t}. The rest is still working.`, o.t); keep.push(o); }
    }
    S.orders = keep;
  }

  // Day orders die at the end of their day; GTC orders after about 90 days.
  function expired(o, events) {
    const age = o.placed ? tradingDaysBetween(o.placed, S.date) : 0;
    if (o.tif === 'day' ? age >= 1 : age >= GTC_DAYS) {
      o.status = 'expired';
      events.push({ kind: 'expired', order: o });
      addNews('order', `Your ${o.tif === 'day' ? 'day' : 'good-till-cancelled'} order to ${o.side} ${+(o.qty - o.filled).toFixed(4)} ${o.t} expired without filling.`, o.t);
      return true;
    }
    return false;
  }
  function tradingDaysBetween(a, b) {
    const i = S.dates.indexOf(a), j = S.dates.indexOf(b);
    if (i >= 0 && j >= 0) return j - i;
    return Math.round((parseISO(b) - parseISO(a)) / 86400000 * (TD / 365));
  }

  function setDrip(t, on) { if (S.holdings[t]) S.holdings[t].drip = on; }

  function addCustom(input) {
    const meta = customMeta(input);
    if (!meta.t) return { ok: false, msg: 'Enter a ticker symbol.' };
    if (BY[meta.t]) return { ok: false, msg: `${meta.t} is already in the market list.` };
    if (!(meta.base > 0)) return { ok: false, msg: 'Enter a starting price above zero.' };
    if (meta.y > 0 && !meta.q) meta.q = 4;
    S.custom.push(meta);
    const m = finish(Object.assign({}, meta, { custom: true }));
    S._bfRets = {};
    initSecState(m, makeBackfillFactors());
    delete S._bfRets;
    // Align the new back history with the shared date axis length.
    const st = S.sec[m.t];
    while (st.h.length > S.dates.length) st.h.shift();
    addNews('listing', `${m.n} (${m.t}) is now listed in your market`, m.t);
    return { ok: true, m };
  }

  function serialize() {
    return JSON.stringify(S);
  }

  window.Engine = {
    U, BY, SECTORS, TD,
    get S() { return S; },
    newGame, load, step, execute, quote, placeOrder, cancelOrder, setDrip, addCustom, serialize,
    price, prevClose, priceUSD, fxOf, netWorth, marketValue, holdingValue, annualDps, fwdYield, nextExDate,
    addTradingDays, nextTradingDay, parseISO, addNews,
    perPayment, payoutsPerYear, payLagOf, divSpeed, futureEvents, tradingDaysUntil,
    halfSpread, dividendTax, taxRateEstimate, isOrdinaryIncome, ACCOUNTS,
    bars, barAt, lastBar, typicalVolume, impact,
    availableCash, availableQty, reservedCash, reservedQty,
  };
})();
