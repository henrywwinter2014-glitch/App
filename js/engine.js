/*
 * Market engine: builds the security universe, simulates daily prices with a
 * factor model, and handles dividends, splits, earnings, macro news and orders.
 * No DOM access here; app.js owns the UI.
 */
(function () {
  'use strict';

  const D = window.MARKET_DATA;
  const HIST = 261;            // ~1 trading year of closes kept per security
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
      date: START_DATE,
      day: 0,
      startCash, cash: startCash,
      fx: 1.34,               // GBP -> USD
      sec: {},
      dates: [],
      holdings: {},
      orders: [],
      pending: [],             // declared dividends awaiting payment
      tx: [],
      divLog: [],
      news: [],
      nw: [],                  // net worth history {d, v, b}
      watch: ['AAPL', 'KO', 'O', 'SCHD', 'VOO', 'JEPI'],
      custom: [],
      settings: { commission: 0, stamp: true, fractional: true, drip: false },
      nextId: 1,
      realized: 0,
      feesPaid: 0,
    };
  }

  // Generate a year of deterministic back history so charts and 52-week stats exist on day one.
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
    S._bfRets[m.t] = rets;
    prices[0] = 1;
    for (let k = 1; k < n; k++) prices[k] = Math.max(prices[k - 1] * (1 + rets[k]), 1e-6);
    const scale = m.base / prices[n - 1];
    return prices.map((p) => round(p * scale));
  }

  function makeBackfillFactors() {
    const rng = mulberry(424242);
    const out = [];
    for (let k = 0; k < HIST; k++) out.push(drawFactors(rng));
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
    const d = parseISO(S.date);
    if (m.exMonths.includes(d.getUTCMonth()) && d.getUTCDate() >= m.exDom) st.lx = S.date.slice(0, 7);
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
    S.settings = Object.assign({ commission: 0, stamp: true, fractional: true, drip: false }, S.settings);
    build(S.custom);
    ensureAllSecStates();
    return S;
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
  function annualDps(t) { const m = BY[t]; return S.sec[t].dps * m.q; }
  function fwdYield(t) { const p = price(t); return p > 0 ? annualDps(t) / p : 0; }

  function nextExDate(t) {
    const m = BY[t];
    if (!m.q || !S.sec[t].dps) return null;
    const d = parseISO(S.date);
    for (let k = 0; k < 14; k++) {
      const y = d.getUTCFullYear(), mo = d.getUTCMonth() + k;
      const cand = new Date(Date.UTC(y, mo, m.exDom));
      while (cand.getUTCDay() === 0 || cand.getUTCDay() === 6) cand.setUTCDate(cand.getUTCDate() + 1);
      const ci = iso(cand);
      if (!m.exMonths.includes(cand.getUTCMonth())) continue;
      if (ci <= S.date) continue;
      if (S.sec[t].lx === ci.slice(0, 7)) continue;
      return ci;
    }
    return null;
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
    const d = parseISO(S.date);
    const mo = d.getUTCMonth(), dom = d.getUTCDate(), key = S.date.slice(0, 7);

    for (const m of U) {
      const st = S.sec[m.t];
      // Annual dividend review: raise, hold, cut, or start paying.
      if (S.day > 0 && S.day % TD === m.divOff) reviewDividend(m, st);
      if (!m.q || st.dps <= 0) continue;
      if (!m.exMonths.includes(mo) || dom < m.exDom || st.lx === key) continue;
      st.lx = key;
      // Ex-dividend: price drops by the dividend; holders today get paid later.
      const last = st.h.length - 1;
      st.h[last] = Math.max(round(st.h[last] - st.dps), round(st.h[last] * 0.5));
      const h = S.holdings[m.t];
      if (h && h.qty > 0) {
        S.pending.push({ id: S.nextId++, t: m.t, qty: h.qty, dps: st.dps, ex: S.date, pay: addTradingDays(S.date, m.payLag) });
      }
    }

    const due = S.pending.filter((p) => p.pay <= S.date);
    if (!due.length) return;
    S.pending = S.pending.filter((p) => p.pay > S.date);
    for (const p of due) {
      const m = BY[p.t];
      if (!m) continue;
      const amt = p.qty * p.dps * fxOf(m);
      const h = S.holdings[p.t];
      const drip = h ? (h.drip ?? S.settings.drip) : false;
      const entry = { id: S.nextId++, d: S.date, t: p.t, qty: p.qty, dps: p.dps, cur: m.cur, amt, drip: false };
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
      S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'DIV', t: p.t, qty: p.qty, px: p.dps, cur: m.cur, amt, fee: 0 });
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
    st.dps /= r;
    const h = S.holdings[m.t];
    if (h) {
      h.qty *= r;
      S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'SPLIT', t: m.t, qty: h.qty, px: price(m.t), cur: m.cur, amt: 0, fee: 0, note: r >= 1 ? `${r}-for-1` : `1-for-${Math.round(1 / r)}` });
    }
    for (const o of S.orders) if (o.t === m.t) { o.qty *= r; o.px /= r; }
    for (const p of S.pending) if (p.t === m.t) { p.qty *= r; p.dps /= r; }
  }

  /* ---------- trading ---------- */
  function fees(m, side, gross) {
    let commission = +S.settings.commission || 0;
    let stamp = 0;
    if (side === 'buy' && m.cur === 'GBP' && S.settings.stamp && !['ETF'].includes(m.type)) stamp = gross * 0.005;
    return { commission, stamp, total: commission + stamp };
  }

  function quote(t, side, qty) {
    const m = BY[t];
    const px = price(t);
    const gross = qty * px * fxOf(m);
    const f = fees(m, side, gross);
    const total = side === 'buy' ? gross + f.total : gross - f.total;
    return { px, gross, fee: f, total };
  }

  function validateQty(qty) {
    if (!(qty > 0) || !isFinite(qty)) return 'Enter a quantity above zero.';
    if (!S.settings.fractional && !Number.isInteger(qty)) return 'Fractional shares are off. Enter a whole number, or turn them on in Settings.';
    return null;
  }

  function execute(t, side, qty, source) {
    const m = BY[t];
    const err = validateQty(qty);
    if (err) return { ok: false, msg: err };
    const q = quote(t, side, qty);
    if (side === 'buy') {
      if (q.total > S.cash + 1e-9) return { ok: false, msg: `Not enough cash. This order needs ${fmtMoney(q.total)} and you have ${fmtMoney(S.cash)}.` };
      S.cash -= q.total;
      const h = S.holdings[t] || (S.holdings[t] = { qty: 0, cost: 0, costN: 0, drip: null, opened: S.date });
      h.qty += qty;
      h.cost += q.total;
      h.costN = (h.costN ?? 0) + q.total / fxOf(m);
    } else {
      const h = S.holdings[t];
      if (!h || h.qty < qty - 1e-9) return { ok: false, msg: `You only own ${h ? +h.qty.toFixed(4) : 0} shares of ${t}.` };
      const basis = h.cost * (qty / h.qty);
      S.cash += q.total;
      if (h.costN != null) h.costN -= h.costN * (qty / h.qty);
      h.qty -= qty;
      h.cost -= basis;
      S.realized += q.total - basis;
      if (h.qty < 1e-9) delete S.holdings[t];
      q.pl = q.total - basis;
    }
    S.feesPaid += q.fee.total;
    S.tx.unshift({ id: S.nextId++, d: S.date, kind: side === 'buy' ? 'BUY' : 'SELL', t, qty, px: q.px, cur: m.cur, amt: side === 'buy' ? -q.total : q.total, fee: q.fee.total, pl: q.pl ?? null, note: source || null });
    return { ok: true, q };
  }

  function fmtMoney(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function placeOrder(t, side, kind, qty, px) {
    const err = validateQty(qty);
    if (err) return { ok: false, msg: err };
    if (!(px > 0)) return { ok: false, msg: 'Enter a trigger price above zero.' };
    if (side === 'sell') {
      const h = S.holdings[t];
      if (!h || h.qty < qty - 1e-9) return { ok: false, msg: `You only own ${h ? +h.qty.toFixed(4) : 0} shares of ${t}.` };
    }
    const o = { id: S.nextId++, t, side, kind, qty, px, placed: S.date };
    S.orders.push(o);
    return { ok: true, order: o };
  }

  function cancelOrder(id) { S.orders = S.orders.filter((o) => o.id !== id); }

  function processOrders(events) {
    const keep = [];
    for (const o of S.orders) {
      if (!BY[o.t]) continue;
      const p = price(o.t);
      let hit = false;
      if (o.kind === 'limit') hit = o.side === 'buy' ? p <= o.px : p >= o.px;
      else if (o.kind === 'stop') hit = o.side === 'sell' ? p <= o.px : p >= o.px;
      if (!hit) { keep.push(o); continue; }
      const res = execute(o.t, o.side, o.qty, o.kind === 'limit' ? 'Limit order' : 'Stop order');
      events.push({ kind: 'fill', order: o, res });
      if (!res.ok) addNews('order', `Order to ${o.side} ${o.qty} ${o.t} was cancelled: ${res.msg}`, o.t);
    }
    S.orders = keep;
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
    addTradingDays, parseISO, addNews,
  };
})();
