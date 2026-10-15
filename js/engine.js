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
  /* ---------- the trading calendar ---------- */
  /*
   * Which exchange's holidays close the market. This follows where you are only because that is
   * usually the market you trade: the closure itself belongs to the exchange, not to you.
   */
  const HD = () => window.Holidays;
  function region() {
    const r = S && S.settings && S.settings.region;
    return r && HD() && HD().EXCHANGES[r] ? r : 'us';
  }
  const holidays = (y) => (HD() ? HD().exchange(region(), y) : {});
  const holidayOn = (ds) => holidays(+ds.slice(0, 4))[ds] || null;
  // A day off where you live that the market pays no attention to.
  const nationalOn = (ds) => (HD() ? HD().national(region(), +ds.slice(0, 4))[ds] || null : null);
  const isWeekend = (ds) => { const w = parseISO(ds).getUTCDay(); return w === 0 || w === 6; };
  // In a replay the recorded calendar already knows which days traded.
  function isTradingDay(ds) {
    if (S && S.mode === 'real' && RD() && RD().ready) return RD().indexOf(ds) >= 0;
    return !isWeekend(ds) && !holidayOn(ds);
  }
  function marketStatus(ds) {
    const d = ds || (S ? S.date : '');
    const ex = HD() ? HD().EXCHANGES[region()] : null;
    const base = { market: ex ? ex.market : '', hours: ex ? ex.hours : '', tz: ex ? ex.tz : '' };
    if (S && S.mode === 'real') return Object.assign(base, { open: true, why: 'Recorded trading day', holiday: null });
    /*
     * Live mode is the only mode where the time of day matters. The others move a whole day at a
     * time, so "is the market open" is a question about the date; here it is a question about this
     * minute, and a quote fetched at 3am is last night's close however fresh the fetch was.
     */
    if (liveOn() && HD()) {
      const o = HD().openNow(region());
      return Object.assign(base, {
        open: o.open, why: o.why, phase: o.phase, localTime: o.localTime,
        holiday: o.phase === 'closed-day' && o.why !== 'Weekend' ? o.why : null,
        national: nationalOn(d),
      });
    }
    const h = holidayOn(d);
    if (h) return Object.assign(base, { open: false, why: h, holiday: h });
    if (isWeekend(d)) return Object.assign(base, { open: false, why: 'Weekend', holiday: null });
    return Object.assign(base, { open: true, why: 'Trading day', holiday: null, national: nationalOn(d) });
  }

  function nextTradingDay(s) {
    const d = parseISO(s);
    do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || holidayOn(iso(d)));
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
    /*
     * Real starting levels, if the user has fetched them.
     *
     * The reference prices shipped in data.js are approximate levels written by hand, and they
     * age: a list put together when Apple was $230 is simply wrong once it is $343. Refreshing
     * them from the data provider makes a new simulated game start where the market actually is.
     *
     * This only moves the seed. It cannot disturb a game in progress, because an existing save
     * already has its own price history and initSecState is never re-run for a product that has
     * one.
     */
    const ref = S && S.settings && S.settings.refPrices;
    if (ref && ref[m.t] > 0) { m.base = ref[m.t]; m.refreshed = true; }
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
    // World tickers are longer and busier than US ones: 7203.T, NESN.SW, 0700.HK, BRK-B, MC.PA.
    const t = String(input.t || '').toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '').slice(0, 16);
    const type = input.type || 'Stock';
    const cur = /^[A-Za-z]{3}$/.test(input.cur || '') ? String(input.cur).toUpperCase() : 'USD';
    return {
      t, n: input.n || t, sector: SECTORS.includes(input.sector) ? input.sector : (input.sector || 'Other'),
      sec: SECTORS.includes(input.sector) ? input.sector : null,
      type,
      exch: String(input.exch || 'OTC').slice(0, 24),
      cat: input.cat || undefined,
      cur,
      base: +input.p, y: +input.y || 0, q: +input.q || 0,
      beta: isFinite(input.beta) ? +input.beta : (type === 'Preferred' ? 0.2 : type === 'Penny Stock' ? 1.4 : 1),
      vol: isFinite(input.volNum) ? +input.volNum : (volMap[input.vol] || 0.3),
      rate: type === 'REIT' || type === 'Preferred' ? 0.6 : 0,
      world: !!input.world,
    };
  }

  /* ---------- simulation state ---------- */
  let S = null;

  /* ---------- replay mode ----------
   * 'sim' invents a market. 'real' replays recorded history one trading day at a time: prices,
   * dividends and splits are the ones that happened, and nothing past the current day is readable.
   */
  const RD = () => window.RealData;
  const realOn = () => S && S.mode === 'real' && RD() && RD().ready;
  const hasReal = (t) => !!(RD() && RD().ready && RD().has(t));
  /*
   * Had this product listed yet? A replay of February 2020 must not show a fund that floated in
   * May, so anything whose history starts after the current day is hidden until it arrives.
   */
  function listed(t) {
    /*
     * In live mode "listed" means "we have a price from the provider". Anything the provider does
     * not cover -- mutual funds, preferred lines whose symbology differs, a delisted ticker --
     * is hidden and untradeable rather than being shown at an invented price.
     */
    if (liveOn()) return liveSupported(t) && livePx(t) != null;
    if (!realOn()) return true;
    if (!hasReal(t)) return false;
    const s0 = RD().get(t);
    return !!s0 && s0.start <= S.rIdx;
  }
  // In a replay you can only trade what was listed and has real history.
  const tradeable = (t) => (liveOn() || realOn()) ? listed(t) : true;

  // Clamp a requested replay start to a day with a full year of history behind it.
  function realStartIndex(dateStr) {
    const R = RD(), cal = R.calendar;
    let i = R.indexOf(dateStr);
    if (i < 0) { i = cal.findIndex((d) => d >= dateStr); if (i < 0) i = cal.length - 1; }
    return Math.max(HIST - 1, Math.min(cal.length - 1, i));
  }
  function realBounds() {
    if (!(RD() && RD().ready)) return null;
    const cal = RD().calendar;
    return { first: cal[HIST - 1], last: cal[cal.length - 1] };
  }

  /* ---------- real-market paper trading ----------
   * The third market mode. Prices come from a data provider through js/quotes.js; the money,
   * the orders and the portfolio are as virtual as they are everywhere else in this app.
   *
   * Three things make this mode different from the other two, and all three are honesty
   * constraints rather than technical ones.
   *
   * There is no back history. In the simulated market the year before day one is invented, which
   * is fine, because the whole market is invented. Here it would be a forgery: a chart labelled
   * "real market data" must not contain a single bar that nobody traded. So a product has no
   * chart at all until its history is fetched for it, and the fetch happens for the one product
   * you are looking at rather than for all 761, which is also the only way to stay inside a free
   * plan's request budget.
   *
   * There is no clock to drive. Simulated and replay modes step forward a day at a time on a
   * clock the app owns. Here the clock is the real one. Play, pause and skip do not apply, and
   * the engine refuses them rather than quietly doing nothing.
   *
   * A price we do not have is not a price. If the provider has not answered for a product, it is
   * untradeable and its holding is excluded from net worth with a note saying so — rather than
   * being valued at a stale number, or worse, an invented one.
   *
   * Dividends and splits are not modelled here. The free tiers of both supported providers do
   * not supply a reliable corporate-actions feed, and guessing them would quietly falsify the
   * account. The app says so in the mode's own banner instead of pretending.
   */
  const QT = () => window.Quotes;
  const liveOn = () => !!(S && S.mode === 'live');
  const liveOf = (t) => (S && S.sec[t] && S.sec[t].live) || null;

  /*
   * Our ticker is not always the provider's symbol. London lines are "AZN.L" here and at Alpha
   * Vantage but "AZN:LON" at some others; preferred shares are "JPM-PC" here and "JPM-C" or
   * "JPM.PRC" elsewhere. Rather than guess, the mapping is explicit where it is known, the
   * ticker is used as-is otherwise, and anything the provider does not recognise simply comes
   * back unpriced and is marked untradeable. A wrong guess that silently prices the wrong
   * company would be far worse than a gap.
   */
  function liveSym(t) {
    const m = BY[t];
    if (!m) return t;
    if (S.liveMap && S.liveMap[t]) return S.liveMap[t];
    if (m.type === 'Mutual Fund') return '';          // not covered by either provider's equity feed
    if (/-P[A-Z]$/.test(t)) return '';                // preferred lines: symbology differs per provider
    return t;
  }
  const liveSupported = (t) => !!liveSym(t);

  function livePx(t) { const l = liveOf(t); return l && isFinite(l.price) ? l.price : null; }

  // The freshness label for one product, straight from the quote layer so there is one definition.
  function liveFresh(t) {
    const l = liveOf(t);
    if (!QT()) return { level: 'unavailable', label: 'Unavailable', tone: 'bad', note: 'The market-data layer is not loaded.' };
    return QT().freshness(l);
  }

  /*
   * Fold a normalised quote into the product's state. The quote object is stored whole, so the
   * UI can show its provider, its own timestamp and when we fetched it without re-deriving any
   * of that. `h` is kept as a one-element array holding the live price, because that is what
   * price() reads and it keeps every downstream calculation — valuation, fees, order sizing —
   * working exactly as it does in the other two modes.
   */
  function applyLiveQuote(t, q) {
    const st = S.sec[t];
    if (!st) return false;
    if (!q || !isFinite(q.price)) return false;
    st.live = {
      price: q.price, prevClose: isFinite(q.prevClose) ? q.prevClose : null,
      open: isFinite(q.open) ? q.open : null, high: isFinite(q.high) ? q.high : null,
      low: isFinite(q.low) ? q.low : null, volume: isFinite(q.volume) ? q.volume : null,
      change: isFinite(q.change) ? q.change : null, changePct: isFinite(q.changePct) ? q.changePct : null,
      asOf: q.asOf || null, asOfText: q.asOfText || '', fetchedAt: q.fetchedAt || Date.now(),
      kind: q.kind || 'delayed', provider: q.provider || '', marketStatus: q.marketStatus || 'unknown',
      currency: q.currency || null,
    };
    st.h = [q.price];
    return true;
  }

  /*
   * Refresh a set of products. Sequential and rate-limited inside the quote layer, so a watchlist
   * of twenty names cannot turn into twenty simultaneous requests against a five-a-minute key.
   * Resting orders are checked after each quote lands, and the events that produced are returned
   * for the UI to show.
   */
  async function syncLive(tickers, onEach) {
    if (!liveOn()) return { events: [], priced: 0, unpriced: [] };
    const want = (tickers && tickers.length ? tickers : Object.keys(S.holdings)).filter(liveSupported);
    const events = [], unpriced = [];
    let priced = 0;
    for (const t of want) {
      const q = await QT().quote(liveSym(t));
      if (q && applyLiveQuote(t, q)) {
        priced++;
        processOrdersLive(t, events);
      } else {
        unpriced.push(t);
      }
      if (onEach) { try { onEach(t, q); } catch (e) { /* a listener must not stop the sync */ } }
    }
    S.liveAt = Date.now();
    S.date = HD() ? HD().dayISO(region()) : new Date().toISOString().slice(0, 10);
    if (events.length) S.news = (S.news || []).concat(events).slice(-200);
    return { events, priced, unpriced };
  }

  /*
   * Resting orders in live mode.
   *
   * With only snapshots to go on we cannot claim to know the path the price took between two
   * polls, so this does not pretend to. A trigger is tested against the day's range as the
   * provider reports it, which is real information; the fill then happens at the price we can
   * actually see, which is the latest quote. Where that is worse than the order's own price
   * because the market moved through it between polls, the order records that it was filled on a
   * gap between observations — the same honesty the replay engine applies to an overnight gap,
   * for the same reason.
   */
  function processOrdersLive(t, events) {
    const l = liveOf(t);
    if (!l) return;
    const px = l.price;
    const hi = isFinite(l.high) ? Math.max(l.high, px) : px;
    const lo = isFinite(l.low) ? Math.min(l.low, px) : px;
    const keep = [];
    for (const o of S.orders) {
      if (o.t !== t) { keep.push(o); continue; }
      const buy = o.side === 'buy';

      let triggered = false;
      if (o.kind === 'limit') triggered = buy ? lo <= o.px : hi >= o.px;
      else if (o.kind === 'stop') triggered = buy ? hi >= o.px : lo <= o.px;
      else if (o.kind === 'stopLimit') {
        if (!o.armed && (buy ? hi >= o.px : lo <= o.px)) o.armed = true;
        triggered = o.armed && (buy ? lo <= o.limitPx : hi >= o.limitPx);
      }
      if (!triggered) { if (expired(o, events)) continue; keep.push(o); continue; }

      /*
       * The fill price. We have snapshots, not a tape, so we cannot say what the price did
       * between two polls and we do not try: the fill happens at the price we can actually see.
       * When that is worse than the order asked for, the market moved through it while we were
       * not looking, and the order says so rather than quietly reporting the nicer number.
       */
      const want = buy ? (o.kind === 'stopLimit' ? o.limitPx : o.px) : (o.kind === 'stopLimit' ? o.limitPx : o.px);
      const fillPx = px;
      const gapped = o.kind !== 'market' && (buy ? fillPx > want : fillPx < want);

      // The same volume cap as everywhere else, from the day's volume so far where we have it.
      const left = o.qty - o.filled;
      const cap = isFinite(l.volume) && l.volume > 0 ? l.volume * 0.25 : left;
      const canFill = Math.max(0, Math.min(left, cap));
      const qty = S.settings.fractional || o.side === 'sell' ? canFill : Math.floor(canFill);
      if (qty < 1e-9) { keep.push(o); continue; }

      const res = execute(o.t, o.side, qty, ORDER_SOURCE[o.kind] || 'Order', fillPx, true);
      if (!res.ok) {
        o.status = 'cancelled';
        events.push({ kind: 'fill', order: o, res });
        addNews('order', `Order to ${o.side} ${+left.toFixed(4)} ${o.t} was cancelled: ${res.msg}`, o.t);
        continue;
      }
      o.filled += qty;
      const done = o.filled >= o.qty - 1e-9;
      o.status = done ? 'filled' : 'partial';
      events.push({ kind: 'fill', order: o, res, qty, partial: !done, gapped, liveFill: true });
      if (gapped) addNews('order', `${o.t} had already moved past your ${o.kind === 'stopLimit' ? 'limit' : 'order'} price between quotes, so it filled at ${fillPx.toFixed(2)} instead. A resting order is not a promise about the price.`, o.t);
      if (!done) { addNews('order', `Part of your order filled: ${+qty.toFixed(4)} of ${+o.qty.toFixed(4)} ${o.t}. The rest is still working.`, o.t); keep.push(o); }
    }
    S.orders = keep;
  }

  // Holdings we cannot currently price. Net worth leaves them out rather than guessing.
  function unpricedHoldings() {
    if (!liveOn()) return [];
    return Object.keys(S.holdings).filter((t) => S.holdings[t] && S.holdings[t].qty > 0 && livePx(t) == null);
  }

  /*
   * The chart in live mode, read straight out of the quote layer's own cache so that nothing
   * fetched is ever written into the save file. That is on purpose: a persisted bar would come
   * back after a reload with no way to tell how old it was, which is the one thing the
   * requirements say must never happen to a real price.
   */
  function liveBars(t, interval) {
    if (!QT()) return null;
    const s0 = QT().cachedSeries(liveSym(t), interval || '1day');
    return s0 && s0.bars && s0.bars.length ? s0 : null;
  }

  function freshState(startCash) {
    return {
      v: 1,
      histV: HIST_V,
      mode: 'sim',
      rIdx: 0,
      date: START_DATE,
      day: 0,
      startCash, cash: startCash,
      fx: 1.34,               // GBP -> USD, the one the news engine moves
      fx2: {},                // other currencies -> USD, seeded or fetched
      sec: {},
      dates: [],
      holdings: {},
      orders: [],
      journal: {},          // trading journal, keyed by product and the day the position opened
      lists: [],            // named watchlists; S.watch stays as the union of them all
      alerts: [],           // simulated price and event alerts, checked on the simulation clock
      drawings: {},           // per ticker: chart drawings, points as { d: game day, p: price }
      pending: [],             // declared dividends awaiting payment
      tx: [],
      divLog: [],
      news: [],
      nw: [],                  // net worth history {d, v, b}
      watch: ['AAPL', 'KO', 'O', 'SCHD', 'VOO', 'JEPI'],
      custom: [],
      settings: (() => { const d = window.Holidays ? window.Holidays.detect() : null; return { commission: 0, stamp: true, fractional: true, drip: false, divSpeed: 'normal', account: 'us', riskPct: 1, maxPosPct: 20, dayLossPct: 3, provider: '', endpoint: '', region: d ? d.code : 'us', regionHow: d ? d.how : '' }; })(),
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

  // A replay's opening history is the real year of closes ending on the start day.
  function initSecStateReal(m) {
    const R = RD(), end = S.rIdx, s0 = R.get(m.t);
    const h = [];
    let last = s0 ? s0.c[0] : m.base;        // before it listed, its first recorded close
    for (let i = end - HIST + 1; i <= end; i++) {
      const b = R.barOn(m.t, i);
      if (b) last = b.c;
      h.push(round(last));
    }
    const st = { h, dps: 0, lx: '' };
    S.sec[m.t] = st;
    st.dps = trailingDps(m, end);
    return st;
  }
  // Dividend per payment, from what the company actually paid over the past year.
  function trailingDps(m, end) {
    if (!m.q || !hasReal(m.t)) return 0;
    const R = RD();
    let sum = 0, n = 0;
    for (let i = Math.max(0, end - TD); i <= end; i++) {
      const a = R.actionOn(m.t, i);
      if (a && a.div > 0) { sum += a.div; n++; }
    }
    return n ? sum / n : 0;
  }

  function initSecState(m, bf) {
    const hist = backfill(m, bf);
    const st = { h: hist, dps: m.q ? (m.base * m.y / 100) / m.q : 0, lx: '' };
    st.lx = exKeyOn(m, S.date) || '';
    S.sec[m.t] = st;
  }

  function ensureAllSecStates() {
    if (!S.journal) S.journal = {};
    if (!S.alerts) S.alerts = [];
    if (!S.lists || !S.lists.length) S.lists = [{ id: 'main', name: 'My watchlist', t: (S.watch || []).slice() }];
    syncWatch();
    if (S.mode === 'real') {
      if (!(RD() && RD().ready)) return;              // data not loaded yet; caller retries
      for (const m of U) if (!S.sec[m.t]) {
        if (hasReal(m.t)) initSecStateReal(m);
        else S.sec[m.t] = { h: new Array(HIST).fill(round(m.base)), dps: 0, lx: '', noReal: true };
      }
      if (!S.dates.length) {
        const R = RD();
        for (let i = S.rIdx - HIST + 1; i <= S.rIdx; i++) S.dates.push(R.dateAt(i));
      }
      if (!S.nw.length) S.nw.push({ d: S.date, v: S.cash, b: price('SPY') });
      return;
    }
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
    if (liveOn()) {
      /*
       * Live mode owns no history. Whatever the simulator built while initialising the product
       * list is discarded here, because a chart in a mode labelled "real market data" must not
       * contain one bar that nobody traded. Prices arrive only from the provider, and until they
       * do a product simply has none.
       */
      for (const m of U) { const st = S.sec[m.t]; if (st && !st.live) st.h = []; }
      if (!S.dates.length) S.dates = [S.date];
      if (!S.nw.length) S.nw.push({ d: S.date, v: S.cash, b: null });
      return;
    }
    if (!S.dates.length) {
      const dates = [S.date];
      while (dates.length < HIST) dates.unshift(prevTradingDay(dates[0]));
      S.dates = dates;
    }
    if (!S.nw.length) S.nw.push({ d: S.date, v: S.cash, b: price('SPY') });
  }

  function newGame(startCash, opts) {
    S = freshState(startCash);
    /*
     * Settings first, because the market is seeded from them -- refreshed starting prices in
     * particular. The caller used to restore them after newGame returned, by which time the
     * prices had already been chosen from the built-in levels.
     */
    if (opts && opts.settings) S.settings = Object.assign(S.settings, opts.settings);
    const wantReal = opts && opts.mode === 'real' && RD() && RD().ready;
    const wantLive = opts && opts.mode === 'live';
    if (wantReal) {
      S.mode = 'real';
      S.rIdx = realStartIndex(opts.startDate || RD().calendar[HIST - 1]);
      S.date = RD().dateAt(S.rIdx);
      S.realFrom = S.date;
    } else if (wantLive) {
      S.mode = 'live';
      S.date = HD() ? HD().dayISO(region()) : new Date().toISOString().slice(0, 10);
      S.liveFrom = S.date;
      S.liveAt = 0;
      S.liveMap = (opts && opts.liveMap) || {};
    }
    build(S.custom);
    ensureAllSecStates();
    addNews('macro', wantReal
      ? `Replay started on ${S.date} with ${fmtUSD(startCash)}. Prices, dividends and splits from here are the ones that really happened. Nothing after today is visible.`
      : wantLive
        ? `Real-market paper trading started with ${fmtUSD(startCash)} of virtual money. Prices come from your data provider and are labelled with how fresh they are. No real orders are placed, and dividends and splits are not tracked in this mode.`
        : `Market open. You have ${fmtUSD(startCash)} to invest. Prices move once per simulated trading day.`);
    return S;
  }

  function load(saved) {
    S = saved;
    S.settings = Object.assign({ commission: 0, stamp: true, fractional: true, drip: false, divSpeed: 'normal', account: 'us', riskPct: 1, maxPosPct: 20, dayLossPct: 3, provider: '', endpoint: '' }, S.settings);
    if (!S.settings.region) { const d = HD() ? HD().detect() : null; S.settings.region = d ? d.code : 'us'; S.settings.regionHow = d ? d.how : ''; }
    build(S.custom);
    ensureAllSecStates();
    if (!S.drawings) S.drawings = {};
    if (S.histV !== HIST_V && S.mode !== 'real') refreshBackHistory();
    else S.histV = HIST_V;
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
  /*
   * The current price. In live mode this is whatever the provider last told us and NaN if it has
   * told us nothing -- deliberately not zero and not a stale guess, so that any arithmetic built
   * on a price we do not have comes out visibly wrong rather than quietly wrong.
   */
  const price = (t) => {
    if (liveOn()) { const l = liveOf(t); return l && isFinite(l.price) ? l.price : NaN; }
    const h = S.sec[t].h; return h[h.length - 1];
  };
  const prevClose = (t) => {
    if (liveOn()) { const l = liveOf(t); return l && isFinite(l.prevClose) ? l.prevClose : price(t); }
    const h = S.sec[t].h; return h[h.length - 2] ?? h[h.length - 1];
  };
  /*
   * Currencies.
   *
   * The simulated market only ever needed dollars and pounds, and the pound has its own drifting
   * rate driven by the news engine. Listing a share from anywhere in the world brings in other
   * currencies, so there is a rate table as well. The seeded rates are approximate levels, which
   * is honest enough for a simulated market; in real-market mode they are refreshed from the data
   * provider, because there a wrong rate would quietly misstate your net worth.
   */
  const FX_SEED = {
    USD: 1, GBP: 1.34, EUR: 1.09, JPY: 0.0067, CHF: 1.12, CAD: 0.73, AUD: 0.66, NZD: 0.60,
    HKD: 0.128, SGD: 0.75, CNY: 0.14, INR: 0.0119, KRW: 0.00072, TWD: 0.031, JPYX: 0.0067,
    SEK: 0.094, NOK: 0.092, DKK: 0.146, PLN: 0.25, ZAR: 0.055, BRL: 0.18, MXN: 0.050,
    ILS: 0.27, TRY: 0.029, THB: 0.029, IDR: 0.000062, MYR: 0.22, PHP: 0.017, AED: 0.272,
    SAR: 0.267, GBp: 0.0134,
  };
  function fxRate(cur) {
    if (!cur || cur === 'USD') return 1;
    if (cur === 'GBP') return S.fx;                       // the simulated, drifting one
    if (S.fx2 && isFinite(S.fx2[cur]) && S.fx2[cur] > 0) return S.fx2[cur];
    return FX_SEED[cur] || 1;
  }
  const fxOf = (m) => fxRate(m && m.cur);
  // Every currency in the current universe, so live mode knows which rates to fetch.
  function currenciesInUse() {
    const out = new Set();
    for (const m of U) if (m.cur && m.cur !== 'USD') out.add(m.cur);
    return [...out];
  }
  const priceUSD = (t) => price(t) * fxOf(BY[t]);
  function fmtUSD(v) { return '$' + Math.round(v).toLocaleString('en-US'); }

  function holdingValue(t) { const h = S.holdings[t]; return h ? h.qty * priceUSD(t) : 0; }
  /*
   * A holding we cannot price is left out of the total rather than valued at a guess or at a
   * stale number. net worth would otherwise read as authoritative while quietly containing a
   * figure nobody stands behind; unpricedHoldings() tells the UI what was excluded so it can say.
   */
  function marketValue() {
    let v = 0;
    for (const t in S.holdings) { const hv = holdingValue(t); if (isFinite(hv)) v += hv; }
    return v;
  }
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
  /*
   * The recurring economic dates a trader plans around. Simulated, but on a realistic rhythm:
   * inflation mid-month, jobs on the first Friday, the central bank roughly every six weeks.
   */
  function econEvents(fromISO, toISO) {
    const out = [];
    if (!HD()) return out;
    const nthWd = HD().nth;
    const observed = (d) => { const x = new Date(d); if (x.getUTCDay() === 6) x.setUTCDate(x.getUTCDate() - 1); if (x.getUTCDay() === 0) x.setUTCDate(x.getUTCDate() + 1); return x; };
    const y0 = +fromISO.slice(0, 4), y1 = +toISO.slice(0, 4);
    for (let y = y0; y <= y1; y++) {
      for (let m = 0; m < 12; m++) {
        const cpi = observed(new Date(Date.UTC(y, m, 13)));
        const jobs = nthWd(y, m, 5, 1);
        if (iso(cpi) >= fromISO && iso(cpi) <= toISO) out.push({ d: iso(cpi), kind: 'econ', name: 'Inflation figures', note: 'Monthly consumer price index' });
        if (iso(jobs) >= fromISO && iso(jobs) <= toISO) out.push({ d: iso(jobs), kind: 'econ', name: 'Jobs report', note: 'Monthly employment figures' });
        if (m % 2 === 1) {
          const fed = nthWd(y, m, 3, 3);
          if (iso(fed) >= fromISO && iso(fed) <= toISO) out.push({ d: iso(fed), kind: 'econ', name: 'Interest rate decision', note: 'The central bank sets rates' });
        }
      }
      const hs = holidays(y);
      for (const d in hs) if (d >= fromISO && d <= toISO) out.push({ d, kind: 'holiday', name: hs[d], note: 'Market closed' });
      const nat = HD().national(region(), y);
      for (const d in nat) if (d >= fromISO && d <= toISO && !hs[d]) out.push({ d, kind: 'national', name: nat[d], note: 'A holiday where you are, but the market is open' });
    }
    return out.sort((a, b) => (a.d < b.d ? -1 : 1));
  }

  function futureEvents(tickers, toISO, opts = {}) {
    if (S.mode === 'real') return futureEventsReal(tickers, toISO);
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

  /*
   * Upcoming real dividends. Companies announce a quarter or so ahead, so the replay looks no
   * further than 100 days: enough to plan around, not a window onto the rest of the history.
   */
  function futureEventsReal(tickers, toISO) {
    const R = RD();
    if (!(R && R.ready)) return [];
    const cal = R.calendar, out = [];
    const cap = iso(new Date(parseISO(S.date).getTime() + 100 * 86400000));
    const limit = toISO < cap ? toISO : cap;
    for (const t of tickers) {
      const m = BY[t];
      if (!m || !hasReal(t)) continue;
      for (let i = S.rIdx + 1; i < cal.length && cal[i] <= limit; i++) {
        const a = R.actionOn(t, i);
        if (a && a.div > 0) {
          out.push({ d: cal[i], t, kind: 'ex', dps: a.div });
          out.push({ d: addTradingDays(cal[i], payLagOf(m)), t, kind: 'pay', dps: a.div });
        }
      }
    }
    return out.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
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
  // Where a headline came from, so nothing reads as though a real newsroom filed it.
  const NEWS_SOURCE = {
    macro: 'Bullpen macro desk (simulated)',
    earnings: 'Company results (simulated)',
    dividend: 'Company announcement (simulated)',
    split: 'Company announcement (simulated)',
    order: 'Your account',
    econ: 'Economic calendar (simulated)',
    cash: 'Your account',
    data: 'Market data',
  };
  // A plausible publication time of day, stable for a given headline.
  function newsTime(id, kind) {
    const slot = kind === 'earnings' ? 16 : kind === 'macro' || kind === 'econ' ? 8 : 9;
    const mins = (id * 37) % 60;
    return `${String(slot + ((id * 7) % 3)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
  function addNews(kind, text, t, chg) {
    const id = S.nextId++;
    S.news.unshift({ id, d: S.date, kind, text, t: t || null, chg: chg ?? null, src: NEWS_SOURCE[kind] || 'Bullpen (simulated)', at: newsTime(id, kind) });
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
    /*
     * There is no clock to advance in live mode: the market's clock is the real one. Refusing is
     * better than returning an empty result, which would let a caller believe a day had passed.
     */
    if (liveOn()) return { ok: false, live: true, msg: 'Real-market mode follows the real clock, so there is no day to step forward. Refresh the prices instead.' };
    if (S.mode === 'real') return stepReal();
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
    checkAlerts(events);

    S.nw.push({ d: S.date, v: netWorth(), b: price('SPY') });
    if (S.nw.length > 5000) S.nw.splice(0, S.nw.length - 5000);
    return events;
  }

  /*
   * One real trading day. The recorded close becomes today's price; a ticker with no bar that
   * day did not trade, so its last price carries forward.
   */
  function stepReal() {
    const events = [];
    const R = RD(), cal = R.calendar;
    if (S.rIdx >= cal.length - 1) {
      if (!S.replayEnded) { S.replayEnded = true; addNews('macro', `The replay has reached ${S.date}, the last day there is data for.`); events.push({ kind: 'replayEnd' }); }
      return events;
    }
    S.rIdx++;
    S.date = cal[S.rIdx];
    S.day++;
    for (const m of U) {
      const st = S.sec[m.t];
      const b = R.barOn(m.t, S.rIdx);
      st.h.push(b ? round(b.c) : st.h[st.h.length - 1]);
      if (st.h.length > HIST) st.h.shift();
    }
    S.dates.push(S.date);
    if (S.dates.length > HIST) S.dates.shift();

    realSplits(events);
    realDividends(events);
    processOrders(events);
    checkAlerts(events);
    S.nw.push({ d: S.date, v: netWorth(), b: price('SPY') });
    if (S.nw.length > 5000) S.nw.splice(0, S.nw.length - 5000);
    return events;
  }

  /*
   * Real splits. The replayed prices are the ones that printed, so the series already shows the
   * drop; only the share count changes. Your position is worth the same either side.
   */
  function realSplits(events) {
    const R = RD();
    for (const m of U) {
      const a = R.actionOn(m.t, S.rIdx);
      if (!a || !a.split || a.split <= 0) continue;
      const r = a.split;
      const h = S.holdings[m.t];
      if (h) {
        h.qty *= r;
        S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'SPLIT', t: m.t, qty: h.qty, px: price(m.t), cur: m.cur, amt: 0, fee: 0, note: r >= 1 ? `${+r.toFixed(4)}-for-1` : `1-for-${Math.round(1 / r)}` });
      }
      for (const o of S.orders) if (o.t === m.t) { o.qty *= r; o.px /= r; }
      for (const p of S.pending) if (p.t === m.t) { p.qty *= r; p.dps /= r; }
      for (const dr of (S.drawings || {})[m.t] || []) for (const pt of dr.pts) pt.p /= r;
      addNews('split', `${m.n} completes a ${r >= 1 ? +r.toFixed(4) + '-for-1' : '1-for-' + Math.round(1 / r)} stock split`, m.t);
      events.push({ kind: 'split', t: m.t, r });
    }
  }

  /*
   * Real dividends. The ex-day fall is already in the recorded price, so nothing is deducted
   * here; holders on the ex-date are simply queued to be paid, as in the simulated market.
   */
  function realDividends(events) {
    const R = RD();
    for (const m of U) {
      const a = R.actionOn(m.t, S.rIdx);
      if (!a || !(a.div > 0)) continue;
      const st = S.sec[m.t];
      st.dps = a.div;
      st.lx = S.date;
      const h = S.holdings[m.t];
      if (h && h.qty > 0) S.pending.push({ id: S.nextId++, t: m.t, qty: h.qty, dps: a.div, ex: S.date, pay: addTradingDays(S.date, payLagOf(m)) });
    }
    payDue(events);
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

    payDue(events);
  }

  function payDue(events) {
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
    // Live mode never synthesises a bar. Its chart comes from fetched history via bars() below.
    if (liveOn()) return null;
    if (i < 1 || i >= h.length) return null;
    if (S.mode === 'real' && hasReal(t)) {
      // The recorded bar for that calendar day.
      const ci = S.rIdx - (h.length - 1 - i);
      const b = RD().barOn(t, ci);
      if (b) return { o: b.o, c: b.c, h: b.h, l: b.l, v: b.v, d: S.dates[i] || '' };
      const c = h[i];
      return { o: c, c, h: c, l: c, v: 0, d: S.dates[i] || '' };
    }
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
  function bars(t, n, interval) {
    /*
     * In live mode the only bars that exist are the ones the provider sent. If none have been
     * fetched for this product yet, the answer is an empty series and the chart says so --
     * rather than a plausible-looking curve that nobody traded.
     */
    if (liveOn()) {
      const s0 = liveBars(t, interval);
      const out = { o: [], h: [], l: [], c: [], v: [], labels: [], live: true, interval: s0 ? s0.interval : (interval || '1day'), provider: s0 ? s0.provider : '', fetchedAt: s0 ? s0.fetchedAt : 0 };
      if (!s0) return out;
      for (const b of s0.bars.slice(-n)) {
        out.o.push(b.o); out.h.push(b.h); out.l.push(b.l); out.c.push(b.c); out.v.push(b.v); out.labels.push(b.t);
      }
      return out;
    }
    const h = S.sec[t].h, len = h.length, start = Math.max(1, len - n);
    const out = { o: [], h: [], l: [], c: [], v: [], labels: [] };
    for (let i = start; i < len; i++) {
      const b = barAt(t, i);
      out.o.push(b.o); out.h.push(b.h); out.l.push(b.l); out.c.push(b.c); out.v.push(b.v); out.labels.push(b.d);
    }
    return out;
  }
  // A typical day's volume, used to size market impact and the most you can fill in one day.
  function typicalVolume(t) {
    if (liveOn()) { const l = liveOf(t); return l && isFinite(l.volume) && l.volume > 0 ? l.volume : 1e6; }
    const b = lastBar(t); return b ? b.v : 1e6;
  }

  /*
   * Quantities are shown to four decimal places, so anything asking to sell within half a unit of
   * that last place is asking to sell the lot. Without this, a holding of 0.00009999 displays as
   * "0.0001", the Sell all button offers 0.0001, and the engine refuses it with the message "you
   * only own 0.0001" -- which is both maddening and, as far as the screen is concerned, untrue.
   */
  const QTY_EPS = 5e-5;
  const round4 = (v) => Math.round(v * 1e4) / 1e4;
  /*
   * A share count for an error message. Rounds DOWN, and shows more places when four would round
   * the holding up to the very number being refused.
   */
  function fmtQtyExact(v) {
    if (!(v > 0)) return '0';
    const d4 = Math.floor(v * 1e4) / 1e4;
    if (d4 > 0) return String(+d4.toFixed(4));
    // Smaller than the fourth decimal place. Truncate rather than round -- rounding here would
    // print the very number we are refusing, which is how this whole bug read to the user.
    const d8 = Math.floor(v * 1e8) / 1e8;
    return d8 > 0 ? String(+d8.toFixed(8)) : 'less than 0.00000001';
  }
  // Asking to sell marginally more than you hold means "sell all of it".
  function clampSell(t, side, qty) {
    if (side !== 'sell') return qty;
    const h = S.holdings[t];
    return h && qty > h.qty && qty - h.qty < QTY_EPS ? h.qty : qty;
  }

  // What a filled order is called in the activity log and on the chart.
  const ORDER_SOURCE = { market: 'Market order', limit: 'Limit order', stop: 'Stop order', stopLimit: 'Stop-limit order' };

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

  function unlistedMsg(t) {
    if (liveOn()) {
      if (!liveSupported(t)) return `${t} is not covered by the market-data provider, so it has no real price and cannot be traded in real-market mode.`;
      const st = QT() ? QT().state() : null;
      if (st && !st.configured) return `Real-market mode has no data endpoint set, so there is no price for ${t}. Set one in Settings.`;
      return `No current price has been received for ${t}, so it cannot be traded. ${st && st.lastError ? st.lastError.message : 'Try refreshing.'}`;
    }
    if (!hasReal(t)) return `There is no recorded history for ${t}, so it cannot be traded in a replay.`;
    const s0 = RD().get(t);
    return `${t} had not listed yet on ${S.date}. It starts trading on ${RD().dateAt(s0.start)}.`;
  }

  /*
   * The "fractional shares" setting is about what you may open, not about what you may close.
   *
   * You can end up holding a fraction whatever the setting says: a dividend reinvestment buys
   * 0.37 of a share, and a 3-for-2 split turns 5 shares into 7.5. Refusing to sell those because
   * the setting is off leaves the position stranded with no way out, which is the one thing a
   * setting about order sizes should never do. So the whole-number rule applies to buys, and to
   * sells only where the sale would itself make a fraction out of a whole holding.
   */
  function validateQty(qty, side, held) {
    if (!(qty > 0) || !isFinite(qty)) return 'Enter a quantity above zero.';
    if (S.settings.fractional || Number.isInteger(qty)) return null;
    if (side === 'sell') {
      const h = held == null ? 0 : held;
      // Selling the lot, or trimming a holding that is already fractional, is always allowed.
      if (Math.abs(qty - h) < QTY_EPS || !Number.isInteger(round4(h))) return null;
      return 'Fractional shares are off, so you can sell a whole number or the whole holding. Turn them on in Settings to sell part of a share.';
    }
    return 'Fractional shares are off. Enter a whole number, or turn them on in Settings.';
  }

  function execute(t, side, qty, source, atPrice, ignoreReserved) {
    const m = BY[t];
    qty = clampSell(t, side, qty);
    const err = validateQty(qty, side, S.holdings[t] ? S.holdings[t].qty : null);
    if (err) return { ok: false, msg: err };
    if (!tradeable(t)) return { ok: false, msg: unlistedMsg(t) };
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
      if (!h || h.qty < qty - 1e-9) return { ok: false, msg: `You only own ${h ? fmtQtyExact(h.qty) : 0} shares of ${t}.` };
      const freeQty = ignoreReserved ? h.qty : availableQty(t);
      if (qty > freeQty + 1e-9) return { ok: false, msg: `Only ${fmtQtyExact(freeQty)} of your ${fmtQtyExact(h.qty)} ${t} shares are free to sell. The rest are committed to an open sell order, which you can cancel on the Orders tab.` };
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
    S.tx.unshift({ id: S.nextId++, d: S.date, kind: side === 'buy' ? 'BUY' : 'SELL', t, qty, px: q.px, cur: m.cur, amt: side === 'buy' ? -q.total : q.total, fee: q.fee.total, slip: (q.spreadCost || 0) + (q.slip || 0), pl: q.pl ?? null, plPct: q.plPct ?? null, note: source || null });
    return { ok: true, q };
  }

  function fmtMoney(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Cash and shares already promised to open orders, so they cannot be spent or sold twice.
  function orderCost(o) {
    const m = BY[o.t];
    if (!m) return 0;
    // Reserve against the highest price the order could pay: for a stop-limit that is the limit.
    const worst = o.kind === 'stopLimit' && o.limitPx > 0 ? Math.max(o.px, o.limitPx) : o.px;
    const gross = o.qty * worst * fxOf(m);
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

  function placeOrder(t, side, kind, qty, px, tif, limitPx) {
    qty = clampSell(t, side, qty);
    const err = validateQty(qty, side, S.holdings[t] ? S.holdings[t].qty : null);
    if (err) return { ok: false, msg: err };
    if (!BY[t]) return { ok: false, msg: 'Unknown product.' };
    if (!tradeable(t)) return { ok: false, msg: unlistedMsg(t) };
    if (!(px > 0)) return { ok: false, msg: 'Enter a trigger price above zero.' };
    const p = price(t);
    if (!isFinite(p)) return { ok: false, msg: unlistedMsg(t) };
    // A limit or stop on the wrong side of the market would fill instantly; that is a market order.
    if (kind === 'limit' && side === 'buy' && px > p * 1.5) return { ok: false, msg: `That limit is far above the ${t} price of ${fmtMoney(p)}. A buy limit sits below the price and waits for a dip.` };
    if (kind === 'limit' && side === 'sell' && px < p * 0.5) return { ok: false, msg: `That limit is far below the ${t} price of ${fmtMoney(p)}. A sell limit sits above the price and waits for a rise.` };
    if (kind === 'stop' && side === 'sell' && px > p) return { ok: false, msg: `A stop loss protects you on the way down, so it sits below the ${t} price of ${fmtMoney(p)}.` };
    if (kind === 'stop' && side === 'buy' && px < p) return { ok: false, msg: `A buy stop sits above the ${t} price of ${fmtMoney(p)}.` };
    /*
     * A stop-limit carries two prices: the stop that wakes it and the limit it will not trade
     * past. Getting them the wrong way round is the classic mistake -- a sell stop-limit whose
     * limit sits above its stop can never fill, because by the time the stop triggers the price
     * is already below the limit -- so it is refused with an explanation rather than accepted
     * and left to rest forever.
     */
    if (kind === 'stopLimit') {
      if (!(limitPx > 0)) return { ok: false, msg: 'A stop-limit order needs a limit price as well as a stop price.' };
      if (side === 'sell') {
        if (px > p) return { ok: false, msg: `A sell stop-limit protects you on the way down, so its stop sits below the ${t} price of ${fmtMoney(p)}.` };
        if (limitPx > px) return { ok: false, msg: `Your limit of ${fmtMoney(limitPx)} is above your stop of ${fmtMoney(px)}, so this order could never fill: once the stop triggers, the price is already below the limit. Put the limit at or below the stop.` };
      } else {
        if (px < p) return { ok: false, msg: `A buy stop-limit waits for a breakout, so its stop sits above the ${t} price of ${fmtMoney(p)}.` };
        if (limitPx < px) return { ok: false, msg: `Your limit of ${fmtMoney(limitPx)} is below your stop of ${fmtMoney(px)}, so this order could never fill. Put the limit at or above the stop.` };
      }
    }
    if (side === 'sell') {
      const h = S.holdings[t];
      if (!h || h.qty < qty - 1e-9) return { ok: false, msg: `You only own ${fmtQtyExact(h ? h.qty : 0)} shares of ${t}.` };
      const free = availableQty(t);
      if (qty > free + 1e-9) return { ok: false, msg: `Only ${fmtQtyExact(free)} of your ${fmtQtyExact(h.qty)} ${t} shares are free. The rest are already committed to an open sell order.` };
    } else {
      const o = { t, qty, px };
      const need = orderCost(o), free = availableCash();
      if (need > free + 1e-9) return { ok: false, msg: `This order could cost ${fmtMoney(need)} and only ${fmtMoney(free)} of your ${fmtMoney(S.cash)} is uncommitted. Cancel an open buy order or reduce the size.` };
    }
    const o = { id: S.nextId++, t, side, kind, qty, px, placed: S.date, tif: tif === 'day' ? 'day' : 'gtc', filled: 0, status: 'open' };
    if (kind === 'stopLimit') { o.limitPx = limitPx; o.armed = false; }
    S.orders.push(o);
    return { ok: true, order: o };
  }

  function cancelOrder(id) { S.orders = S.orders.filter((o) => o.id !== id); }

  /*
   * Paying virtual money in and out.
   *
   * Recorded as transactions rather than quietly adjusting the balance, because every performance
   * figure in the app is rebuilt from the transaction log and an untracked cash injection would
   * silently flatter the return: £10,000 added to a £10,000 account looks like a 100% gain to
   * anything that only watches net worth. stats.js subtracts these from the return for exactly
   * that reason.
   */
  function deposit(amount, note) {
    const amt = +amount;
    if (!(amt > 0) || !isFinite(amt)) return { ok: false, msg: 'Enter an amount above zero.' };
    S.cash += amt;
    S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'DEPOSIT', t: '', qty: 0, px: 0, cur: 'USD', amt, fee: 0, note: note || null });
    addNews('cash', `Paid in ${fmtMoney(amt)} of virtual money.${note ? ` (${note})` : ''}`);
    return { ok: true, cash: S.cash };
  }
  function withdraw(amount, note) {
    const amt = +amount;
    if (!(amt > 0) || !isFinite(amt)) return { ok: false, msg: 'Enter an amount above zero.' };
    const free = availableCash();
    if (amt > free + 1e-9) {
      return { ok: false, msg: free < S.cash - 1e-9
        ? `Only ${fmtMoney(free)} is free to take out: the rest of your ${fmtMoney(S.cash)} is committed to open buy orders.`
        : `You have ${fmtMoney(S.cash)} in cash, so you cannot take out ${fmtMoney(amt)}.` };
    }
    S.cash -= amt;
    S.tx.unshift({ id: S.nextId++, d: S.date, kind: 'WITHDRAW', t: '', qty: 0, px: 0, cur: 'USD', amt: -amt, fee: 0, note: note || null });
    addNews('cash', `Took out ${fmtMoney(amt)} of virtual money.${note ? ` (${note})` : ''}`);
    return { ok: true, cash: S.cash };
  }
  // What has been paid in beyond the starting balance, less what has been taken out.
  function netContributions() {
    let v = 0;
    for (const x of S.tx || []) { if (x.kind === 'DEPOSIT' || x.kind === 'WITHDRAW') v += x.amt; }
    return v;
  }

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
      /*
       * A stop-limit is two orders in sequence: the stop arms it, and from then on it is an
       * ordinary limit. Arming and filling can happen on the same day, but not in a known order
       * -- we have one bar, not the path through it -- so an order armed today fills today only
       * if the limit was inside the day's range, and otherwise rests armed for tomorrow. That is
       * the honest reading of a daily bar, and it is also the one that cannot flatter the fill.
       */
      let triggered;
      if (o.kind === 'stopLimit') {
        if (!o.armed && (buy ? bar.h >= o.px : bar.l <= o.px)) o.armed = true;
        triggered = o.armed && (buy ? bar.l <= o.limitPx : bar.h >= o.limitPx);
      } else {
        triggered = o.kind === 'limit'
          ? (buy ? bar.l <= o.px : bar.h >= o.px)
          : (buy ? bar.h >= o.px : bar.l <= o.px);
      }

      if (!triggered) {
        if (expired(o, events)) continue;
        keep.push(o); continue;
      }

      // Price the fill from the day's open, capped by what the order asked for.
      const want = o.kind === 'stopLimit' ? o.limitPx : o.px;
      const fillPx = buy
        ? (o.kind === 'stop' ? Math.max(want, bar.o) : Math.min(want, bar.o))
        : (o.kind === 'stop' ? Math.min(want, bar.o) : Math.max(want, bar.o));

      // You cannot take more than a slice of a day's volume; the rest keeps working.
      const left = o.qty - o.filled;
      const canFill = Math.max(0, Math.min(left, bar.v * 0.25));
      // Only a buy is rounded down to whole shares. Flooring a sell would strand a fractional
      // holding forever: 0.37 shares floors to 0, so the order never fills and never clears.
      const qty = S.settings.fractional || o.side === 'sell' ? canFill : Math.floor(canFill);
      if (qty < 1e-9) { keep.push(o); continue; }

      const res = execute(o.t, o.side, qty, ORDER_SOURCE[o.kind] || 'Order', fillPx, true);
      if (!res.ok) {
        o.status = 'cancelled';
        events.push({ kind: 'fill', order: o, res });
        addNews('order', `Order to ${o.side} ${+left.toFixed(4)} ${o.t} was cancelled: ${res.msg}`, o.t);
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

  /* ---------- watchlists ---------- */
  // S.watch is kept as the union of every list, so anything that only asks "am I watching this?"
  // carries on working while the lists themselves are named and separate.
  function syncWatch() {
    const seen = new Set();
    for (const l of S.lists || []) for (const t of l.t) if (BY[t]) seen.add(t);
    S.watch = [...seen];
  }
  const listById = (id) => (S.lists || []).find((l) => l.id === id) || (S.lists || [])[0];
  function createList(name) {
    const id = 'l' + S.nextId++;
    S.lists.push({ id, name: String(name || '').trim().slice(0, 40) || 'New list', t: [] });
    return id;
  }
  function renameList(id, name) { const l = listById(id); if (l) l.name = String(name || '').trim().slice(0, 40) || l.name; }
  function deleteList(id) {
    if (S.lists.length <= 1) return false;
    S.lists = S.lists.filter((l) => l.id !== id);
    syncWatch();
    return true;
  }
  function toggleInList(id, t) {
    const l = listById(id);
    if (!l || !BY[t]) return false;
    const i = l.t.indexOf(t);
    if (i >= 0) l.t.splice(i, 1); else l.t.push(t);
    syncWatch();
    return i < 0;
  }

  /* ---------- alerts ---------- */
  const ALERT_KINDS = {
    above: 'Price rises to',
    below: 'Price falls to',
    pctUp: 'Rises in a day by (%)',
    pctDown: 'Falls in a day by (%)',
    exDiv: 'Goes ex-dividend',
    earnings: 'Reports earnings',
  };
  function addAlert(t, kind, value, note) {
    if (!BY[t] || !ALERT_KINDS[kind]) return { ok: false, msg: 'That alert does not make sense.' };
    const needsValue = ['above', 'below', 'pctUp', 'pctDown'].includes(kind);
    const v = +value;
    if (needsValue && !(v > 0)) return { ok: false, msg: 'Enter a number above zero.' };
    const a = { id: S.nextId++, t, kind, value: needsValue ? v : 0, note: String(note || '').slice(0, 120), set: S.date, firedOn: '' };
    S.alerts.push(a);
    return { ok: true, alert: a };
  }
  function removeAlert(id) { S.alerts = S.alerts.filter((a) => a.id !== id); }

  /*
   * Alerts run on the simulation clock, not the wall clock, and read the day's range rather than
   * its close, so one triggers on a price the day actually touched.
   */
  function checkAlerts(events) {
    for (const a of S.alerts || []) {
      if (a.firedOn || !BY[a.t] || !S.sec[a.t]) continue;
      const bar = lastBar(a.t);
      if (!bar) continue;
      let hit = false, at = bar.c;
      if (a.kind === 'above') { hit = bar.h >= a.value; at = Math.max(a.value, bar.o); }
      else if (a.kind === 'below') { hit = bar.l <= a.value; at = Math.min(a.value, bar.o); }
      else if (a.kind === 'pctUp' || a.kind === 'pctDown') {
        const pc = prevClose(a.t);
        const ch = pc > 0 ? bar.c / pc - 1 : 0;
        hit = a.kind === 'pctUp' ? ch * 100 >= a.value : -ch * 100 >= a.value;
      } else if (a.kind === 'exDiv') {
        hit = S.mode === 'real' ? !!((RD().actionOn(a.t, S.rIdx) || {}).div) : S.sec[a.t].lx === exKeyOn(BY[a.t], S.date);
      } else if (a.kind === 'earnings') {
        hit = BY[a.t].hasEarnings && S.mode !== 'real' && (S.day % 63) === BY[a.t].earnOff;
      }
      if (!hit) continue;
      a.firedOn = S.date;
      a.at = at;
      events.push({ kind: 'alert', alert: a, t: a.t, at });
      addNews('order', `Alert: ${BY[a.t].n} ${alertText(a)}.`, a.t);
    }
  }
  function alertText(a) {
    const cur = BY[a.t].cur === 'GBP' ? '£' : '$';
    if (a.kind === 'above') return `rose to ${cur}${a.value}`;
    if (a.kind === 'below') return `fell to ${cur}${a.value}`;
    if (a.kind === 'pctUp') return `rose more than ${a.value}% in a day`;
    if (a.kind === 'pctDown') return `fell more than ${a.value}% in a day`;
    if (a.kind === 'exDiv') return 'went ex-dividend';
    return 'reported earnings';
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

  /*
   * List a security that is not in the built-in universe.
   *
   * This is what makes "every stock in the world" possible without shipping a file with fifty
   * thousand rows of invented fundamentals in it. The data provider knows every exchange; this
   * takes what it returns -- the symbol, the name, the currency, the exchange and a real current
   * price -- and lists it alongside everything else.
   *
   * What it will not do is guess the parts the provider did not send. A dividend yield it does
   * not know is zero and says so, rather than a plausible-looking number attached to a real
   * company. In the simulated market the share then moves like any other; in real-market mode its
   * price only ever comes from the provider.
   */
  function listWorld(info) {
    if (!info || !info.symbol) return { ok: false, msg: 'No symbol given.' };
    const sym = String(info.symbol).toUpperCase();
    if (BY[sym]) return { ok: false, msg: `${sym} is already listed in your market.` };
    const px = +info.price;
    if (!(px > 0)) return { ok: false, msg: `No price came back for ${sym}, so it cannot be listed. A share with no price is not tradeable.` };

    // Yahoo and the rest describe instruments in their own words; map the common ones.
    const kind = String(info.type || '').toLowerCase();
    const type = /etf|fund/.test(kind) ? 'ETF'
      : /trust/.test(kind) ? 'Investment Trust'
        : /reit/.test(kind) ? 'REIT'
          : /bond/.test(kind) ? 'Bond Fund'
            : 'Stock';
    const res = addCustom({
      t: sym,
      n: info.name || sym,
      p: px,
      y: +info.yield || 0,
      q: +info.yield > 0 ? (info.q || 4) : 0,
      type,
      sector: info.sector || 'World',
      exch: info.exchange || 'World',
      cur: info.currency || 'USD',
      cat: type === 'ETF' ? 'World ETF' : undefined,
      // No fundamentals to go on, so a middling beta and a volatility by instrument type.
      beta: type === 'ETF' ? 0.95 : 1,
      volNum: type === 'ETF' ? 0.17 : px < 1 ? 0.8 : 0.32,
      world: true,
    });
    if (res.ok && info.currency && info.currency !== 'USD' && info.currency !== 'GBP') {
      if (!S.fx2) S.fx2 = {};
      if (!isFinite(S.fx2[info.currency])) S.fx2[info.currency] = FX_SEED[info.currency] || 1;
    }
    return res;
  }

  // Record a fetched exchange rate. Live mode calls this; nothing else should.
  function setFxRate(cur, rate) {
    if (!cur || !(rate > 0)) return false;
    if (cur === 'GBP') { S.fxPrev = S.fx; S.fx = rate; return true; }
    if (!S.fx2) S.fx2 = {};
    S.fx2[cur] = rate;
    return true;
  }

  /*
   * Store refreshed starting prices. Kept in settings rather than in the market data so they
   * survive a new game -- the whole point is that the next game starts from today's levels.
   */
  function setRefPrices(map, when) {
    if (!S.settings) return { ok: false, msg: 'No game loaded.' };
    const out = Object.assign({}, S.settings.refPrices || {});
    let n = 0;
    for (const t in map || {}) {
      const v = +map[t];
      if (BY[t] && v > 0 && isFinite(v)) { out[t] = v; n++; }
    }
    S.settings.refPrices = out;
    S.settings.refPricesAt = when || Date.now();
    return { ok: true, n, total: Object.keys(out).length };
  }
  function clearRefPrices() {
    if (!S.settings) return;
    delete S.settings.refPrices;
    delete S.settings.refPricesAt;
  }
  const refPriceCount = () => Object.keys((S && S.settings && S.settings.refPrices) || {}).length;

  function serialize() {
    return JSON.stringify(S);
  }

  window.Engine = {
    U, BY, SECTORS, TD,
    get S() { return S; },
    newGame, load, step, execute, quote, placeOrder, cancelOrder, setDrip, addCustom, listWorld, setFxRate, serialize,
    price, prevClose, priceUSD, fxOf, fxRate, currenciesInUse, FX_SEED, netWorth, marketValue, holdingValue, annualDps, fwdYield, nextExDate,
    addTradingDays, nextTradingDay, parseISO, addNews,
    perPayment, payoutsPerYear, payLagOf, divSpeed, futureEvents, tradingDaysUntil,
    halfSpread, dividendTax, taxRateEstimate, isOrdinaryIncome, ACCOUNTS,
    holidays, holidayOn, nationalOn, isTradingDay, marketStatus, econEvents, region,
    bars, barAt, lastBar, typicalVolume, impact,
    realOn, hasReal, listed, tradeable, realBounds, realStartIndex,
    liveOn, liveOf, livePx, liveSym, liveSupported, liveFresh, liveBars, syncLive, unpricedHoldings,
    deposit, withdraw, netContributions,
    setRefPrices, clearRefPrices, refPriceCount,
    ORDER_SOURCE,
    availableCash, availableQty, reservedCash, reservedQty, fmtQtyExact,
    ALERT_KINDS, addAlert, removeAlert, alertText,
    listById, createList, renameList, deleteList, toggleInList, syncWatch,
  };
})();
