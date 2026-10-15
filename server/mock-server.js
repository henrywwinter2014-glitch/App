/*
 * A local stand-in for a data provider.
 *
 * Real-market mode needs an endpoint, a key and a working network, and none of those are available
 * when you are developing offline or running the test suite. This serves the same contract as the
 * real proxy and answers with deterministic made-up numbers.
 *
 * It identifies itself as the `mock` provider in every response, and the app labels mock data as
 * "not market data" wherever it appears. That is deliberate: the one thing this must never do is
 * let invented numbers pass for real ones, which is exactly the failure the requirements single
 * out. If you want real prices, run the real proxy with a real key.
 *
 *   node server/mock-server.js            # http://127.0.0.1:8788
 *   node server/mock-server.js 9000 av    # pretend to be Alpha Vantage, for adapter testing
 *
 * The second argument makes it reply in a provider's own wire format instead of the mock one,
 * which is how the adapters are tested without calling anybody's API.
 */
const http = require('http');

const port = +process.argv[2] || 8788;
const dialect = (process.argv[3] || 'mock').toLowerCase();   // mock | av | td | yh | fh

// Deterministic per symbol, so a test sees the same numbers every run.
function seed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }
function priceFor(sym) { return Math.round((8 + seed(sym) * 400) * 100) / 100; }

/*
 * One generator for both the quote and the series, so the latest bar and the latest quote agree.
 * A stand-in whose two endpoints contradict each other would hide exactly the kind of bug the
 * suite is meant to catch.
 */
function bars(sym, n, stepMin) {
  const out = [];
  const end = Date.UTC(2026, 9, 9, 20, 0, 0);
  // Walk backwards from a fixed anchor so bar i counts from the END of the series. The last two
  // bars are then the same whether you ask for 2 of them or 500, which is what makes the quote
  // and the chart agree.
  let p = priceFor(sym);
  const walk = [];
  for (let i = 0; i < n; i++) { walk.unshift(p); p = Math.max(0.5, p / (1 + (seed(sym + i) - 0.48) * 0.03)); }
  for (let i = n - 1; i >= 0; i--) {
    p = walk[n - 1 - i];
    const o = Math.round(p * 100) / 100;
    const c = Math.round(p * (1 + (seed(sym + 'c' + i) - 0.5) * 0.02) * 100) / 100;
    const h = Math.round(Math.max(o, c) * 1.006 * 100) / 100;
    const l = Math.round(Math.min(o, c) * 0.994 * 100) / 100;
    const t = new Date(end - i * stepMin * 60000).toISOString().slice(0, stepMin >= 1440 ? 10 : 19).replace('T', ' ');
    out.push({ t, o, h, l, c, v: Math.round(1e6 * (0.3 + seed(sym + 'v' + i))) });
  }
  return out;
}

/*
 * A few genuinely international listings as well as the US ones, so the search path can be tested
 * against the symbology it will actually meet: suffixed tickers, non-dollar currencies and
 * exchanges the built-in universe does not carry.
 */
const NAMES = {
  AAPL: 'Apple Inc', MSFT: 'Microsoft Corporation', NVDA: 'NVIDIA Corporation',
  KO: 'The Coca-Cola Company', SPY: 'SPDR S&P 500 ETF Trust',
  'IUKD.L': 'iShares UK Dividend UCITS ETF', '7203.T': 'Toyota Motor Corporation',
  'NESN.SW': 'Nestle S.A.', 'MC.PA': 'LVMH Moet Hennessy Louis Vuitton',
  '0700.HK': 'Tencent Holdings Limited', 'BHP.AX': 'BHP Group Limited',
  'SAP.DE': 'SAP SE', 'RELIANCE.NS': 'Reliance Industries Limited',
};
const CUR = { '.L': 'GBP', '.T': 'JPY', '.SW': 'CHF', '.PA': 'EUR', '.HK': 'HKD', '.AX': 'AUD', '.DE': 'EUR', '.NS': 'INR' };
const EXCH = { '.L': 'LSE', '.T': 'Tokyo', '.SW': 'Swiss', '.PA': 'Paris', '.HK': 'HKSE', '.AX': 'ASX', '.DE': 'XETRA', '.NS': 'NSE' };
const suffix = (s0) => Object.keys(CUR).find((k) => s0.endsWith(k)) || '';
const curOf = (s0) => CUR[suffix(s0)] || 'USD';
const exchOf = (s0) => EXCH[suffix(s0)] || 'NASDAQ';
const match = (q) => Object.keys(NAMES).filter((k) => (k + ' ' + NAMES[k]).toLowerCase().includes(String(q || '').toLowerCase()));

function body(fn, q) {
  const sym = (q.symbol || '').toUpperCase();
  const iv = q.interval || '1day';
  const stepMin = iv === '1day' ? 1440 : iv === '1week' ? 10080 : iv === '1month' ? 43200 : parseInt(iv, 10) || 5;
  const n = Math.min(500, +q.outputsize || 300);

  if (fn === 'meta') return { provider: dialect === 'av' ? 'alphavantage' : dialect === 'td' ? 'twelvedata' : 'mock', intraday: true, intervals: ['1min', '5min', '15min', '30min', '60min'] };

  if (dialect === 'av') {
    if (fn === 'quote') {
      const b = bars(sym, 2, 1440), last = b[1], prev = b[0];
      return {
        provider: 'alphavantage',
        data: {
          'Global Quote': {
            '01. symbol': sym, '02. open': last.o.toFixed(4), '03. high': last.h.toFixed(4),
            '04. low': last.l.toFixed(4), '05. price': last.c.toFixed(4), '06. volume': String(last.v),
            '07. latest trading day': '2026-10-09', '08. previous close': prev.c.toFixed(4),
            '09. change': (last.c - prev.c).toFixed(4),
            '10. change percent': ((last.c / prev.c - 1) * 100).toFixed(4) + '%',
          },
        },
      };
    }
    if (fn === 'series') {
      const key = stepMin >= 1440 ? 'Time Series (Daily)' : `Time Series (${iv})`;
      const rows = {};
      for (const b of bars(sym, n, stepMin)) {
        rows[b.t] = { '1. open': b.o.toFixed(4), '2. high': b.h.toFixed(4), '3. low': b.l.toFixed(4), '4. close': b.c.toFixed(4), '5. volume': String(b.v) };
      }
      return { provider: 'alphavantage', data: { 'Meta Data': { '2. Symbol': sym, '6. Time Zone': 'US/Eastern' }, [key]: rows } };
    }
    return { provider: 'alphavantage', data: { bestMatches: match(q.q).map((k) => ({ '1. symbol': k, '2. name': NAMES[k], '3. type': 'Equity', '4. region': exchOf(k), '8. currency': curOf(k) })) } };
  }

  if (dialect === 'td') {
    if (fn === 'quote') {
      const b = bars(sym, 2, 1440), last = b[1], prev = b[0];
      return {
        provider: 'twelvedata',
        data: {
          symbol: sym, name: NAMES[sym] || sym, exchange: exchOf(sym), currency: curOf(sym),
          datetime: '2026-10-09', timestamp: Math.floor(Date.UTC(2026, 9, 9, 20, 0, 0) / 1000),
          open: String(last.o), high: String(last.h), low: String(last.l), close: String(last.c),
          volume: String(last.v), previous_close: String(prev.c),
          change: (last.c - prev.c).toFixed(4), percent_change: ((last.c / prev.c - 1) * 100).toFixed(4),
          is_market_open: false,
        },
      };
    }
    if (fn === 'series') {
      return {
        provider: 'twelvedata',
        data: {
          meta: { symbol: sym, interval: iv, exchange_timezone: 'America/New_York' },
          values: bars(sym, n, stepMin).reverse().map((b) => ({ datetime: b.t, open: String(b.o), high: String(b.h), low: String(b.l), close: String(b.c), volume: String(b.v) })),
          status: 'ok',
        },
      };
    }
    return { provider: 'twelvedata', data: { data: match(q.q).map((k) => ({ symbol: k, instrument_name: NAMES[k], exchange: exchOf(k), currency: curOf(k), instrument_type: 'Common Stock', country: exchOf(k) })) } };
  }

  if (dialect === 'fh') {
    const n2 = fn === 'quote' ? 2 : n;
    const step = fn === 'quote' ? 1440 : stepMin;
    const bb = bars(sym, n2, step);
    const last = bb[bb.length - 1], prev = bb[bb.length - 2] || last;
    const base = Date.UTC(2026, 9, 9, 20, 0, 0);
    if (fn === 'quote') {
      // An unknown symbol comes back as a quote of zeros, which is how Finnhub really answers.
      if (!NAMES[sym]) return { provider: 'finnhub', data: { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 } };
      return { provider: 'finnhub', data: {
        c: last.c, d: +(last.c - prev.c).toFixed(4), dp: +((last.c / prev.c - 1) * 100).toFixed(4),
        h: last.h, l: last.l, o: last.o, pc: prev.c, t: Math.floor(base / 1000),
      } };
    }
    if (fn === 'series') {
      if (q.plan === 'free') return { provider: 'finnhub', data: { error: "You don't have access to this resource." } };
      return { provider: 'finnhub', data: {
        s: 'ok',
        t: bb.map((_, i) => Math.floor((base - (bb.length - 1 - i) * step * 60000) / 1000)),
        o: bb.map((x) => x.o), h: bb.map((x) => x.h), l: bb.map((x) => x.l),
        c: bb.map((x) => x.c), v: bb.map((x) => x.v),
      } };
    }
    const hits = match(q.q);
    return { provider: 'finnhub', data: { count: hits.length, result: hits.map((k) => ({ symbol: k, displaySymbol: k, description: NAMES[k], type: /ETF/.test(NAMES[k]) ? 'ETP' : 'Common Stock' })) } };
  }

  if (dialect === 'yh') {
    // Yahoo answers quote and series from the same chart endpoint.
    const n2 = fn === 'quote' ? 2 : n;
    const step = fn === 'quote' ? 1440 : stepMin;
    const bb = bars(sym, n2, step);
    const last = bb[bb.length - 1], prev = bb[bb.length - 2] || last;
    const base = Date.UTC(2026, 9, 9, 20, 0, 0);
    const result = {
      meta: {
        symbol: sym, currency: curOf(sym), shortName: NAMES[sym] || sym, fullExchangeName: exchOf(sym),
        regularMarketPrice: last.c, chartPreviousClose: prev.c, regularMarketOpen: last.o,
        regularMarketDayHigh: last.h, regularMarketDayLow: last.l, regularMarketVolume: last.v,
        regularMarketTime: Math.floor(base / 1000), exchangeTimezoneName: 'America/New_York',
        marketState: 'CLOSED',
      },
      timestamp: bb.map((_, i) => Math.floor((base - (bb.length - 1 - i) * step * 60000) / 1000)),
      indicators: { quote: [{
        open: bb.map((x) => x.o), high: bb.map((x) => x.h), low: bb.map((x) => x.l),
        close: bb.map((x) => x.c), volume: bb.map((x) => x.v),
      }] },
    };
    // A null in the middle, as Yahoo really does send for a halted period.
    if (fn === 'series' && result.indicators.quote[0].close.length > 5) {
      for (const k of ['open', 'high', 'low', 'close']) result.indicators.quote[0][k][3] = null;
    }
    if (fn === 'search') {
      return { provider: 'yahoo', data: { quotes: match(q.q).map((k) => ({ symbol: k, shortname: NAMES[k], exchDisp: exchOf(k), typeDisp: /ETF/.test(NAMES[k]) ? 'ETF' : 'Equity' })) } };
    }
    return { provider: 'yahoo', data: { chart: { result: [result], error: null } } };
  }

  // Native mock dialect.
  if (fn === 'quote') {
    const b = bars(sym, 2, 1440), last = b[1], prev = b[0];
    return {
      provider: 'mock',
      data: {
        bullpenMock: true, symbol: sym, name: NAMES[sym] || sym, price: last.c, open: last.o,
        high: last.h, low: last.l, volume: last.v, prevClose: prev.c,
        change: +(last.c - prev.c).toFixed(4), changePct: +((last.c / prev.c - 1) * 100).toFixed(4),
        currency: curOf(sym), asOf: Date.UTC(2026, 9, 9, 20, 0, 0), asOfText: '2026-10-09', kind: 'eod',
        marketStatus: 'closed',
      },
    };
  }
  if (fn === 'series') return { provider: 'mock', data: { bullpenMock: true, bars: bars(sym, n, stepMin), tz: 'UTC' } };
  return { provider: 'mock', data: { bullpenMock: true, results: match(q.q).map((k) => ({ symbol: k, name: NAMES[k], type: 'Equity', region: exchOf(k), currency: curOf(k) })) } };
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  const fn = q.fn || '';
  const head = {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'accept, content-type',
    'cache-control': 'no-store',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, head); return res.end(); }

  // Switches for testing the failure paths, which matter as much as the happy one.
  if (q.fail === 'network') { res.destroy(); return; }
  if (q.fail === 'rate') { res.writeHead(429, Object.assign({ 'retry-after': '1' }, head)); return res.end(JSON.stringify({ error: 'rate limited' })); }
  if (q.fail === 'server') { res.writeHead(500, head); return res.end(JSON.stringify({ error: 'upstream exploded' })); }
  if (q.fail === 'note') { res.writeHead(200, head); return res.end(JSON.stringify({ provider: 'alphavantage', data: { Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute and 25 calls per day.' } })); }
  if (q.fail === 'empty') { res.writeHead(200, head); return res.end(JSON.stringify({ provider: 'alphavantage', data: { 'Global Quote': {} } })); }
  if (q.fail === 'html') { res.writeHead(200, Object.assign({}, head, { 'content-type': 'text/html' })); return res.end('<html>not json</html>'); }

  if (!['meta', 'quote', 'series', 'search'].includes(fn)) {
    res.writeHead(400, head);
    return res.end(JSON.stringify({ error: 'Unknown fn.' }));
  }
  res.writeHead(200, head);
  res.end(JSON.stringify(body(fn, q)));
}).listen(port, '127.0.0.1', () => {
  console.log(`mock market-data proxy on http://127.0.0.1:${port}  (dialect: ${dialect})`);
});
