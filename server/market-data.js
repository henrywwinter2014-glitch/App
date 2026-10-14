/*
 * The market-data proxy.
 *
 * Bullpen Trader is a static page, and a static page cannot keep a secret. Any API key written
 * into the JavaScript it serves is readable by everyone who loads it, and free-tier keys get
 * scraped and burned quickly. So the key lives here instead, in an environment variable on a
 * server the user controls, and the browser never sees it.
 *
 * This is the whole backend. It takes a request with no credentials, decides whether it is one of
 * the three things the app is allowed to ask for, adds the key, forwards it, and passes the answer
 * back. It deliberately does nothing else: it does not interpret the data, so it does not need
 * updating when a provider changes a field name, and it cannot leak anything it does not hold.
 *
 * ---------------------------------------------------------------------------
 * Deploying it on Cloudflare Workers (free tier is ample)
 *
 *   1. npm install -g wrangler && wrangler login
 *   2. From this directory:  wrangler deploy
 *   3. Set the provider and the key as secrets, so they are never in the source:
 *        wrangler secret put PROVIDER          # yahoo, alphavantage or twelvedata
 *        wrangler secret put API_KEY           # not needed for yahoo
 *   4. Optional but worth doing — restrict who may call it:
 *        wrangler secret put ALLOW_ORIGIN      # e.g. https://yourname.github.io
 *   5. Paste the worker's URL into Bullpen Trader under Settings -> Real market data.
 *
 * For Vercel or Netlify, use server/api/market-data.js instead; it is the same logic with their
 * handler signature. Both answer the same contract, so the app does not care which you run.
 *
 * ---------------------------------------------------------------------------
 * The contract
 *
 *   GET ?fn=meta                                      -> { provider, intraday, intervals }
 *   GET ?fn=quote&symbol=AAPL                          -> { provider, data: <provider JSON> }
 *   GET ?fn=series&symbol=AAPL&interval=5min&outputsize=500
 *   GET ?fn=search&q=apple
 *
 * Anything else is refused. The app sends no key, no provider path and no arbitrary URL, which is
 * what stops this from being an open proxy that anyone can point at anything.
 */

const PROVIDERS = {
  /*
   * Yahoo Finance. No key, so PROVIDER=yahoo needs no API_KEY secret at all.
   *
   * One endpoint serves both the quote and the history: /v8/finance/chart returns the latest
   * price in `meta` and the bars in `indicators`, so a chart costs one request rather than two.
   *
   * These endpoints are not documented or supported by Yahoo. They change without notice and
   * have at times required a session cookie and crumb. They also must be called from here rather
   * than the browser -- Yahoo sends no CORS headers, so a page calling them directly is blocked.
   * Yahoo's terms permit personal use and forbid redistribution.
   */
  yahoo: {
    base: 'https://query1.finance.yahoo.com',
    intraday: true,
    intervals: ['1min', '5min', '15min', '30min', '60min'],
    needsKey: false,
    // Our interval names to Yahoo's, and how much history each can sensibly carry.
    ivMap: { '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m', '45min': '30m', '60min': '60m', '1h': '60m', '1day': '1d', '1week': '1wk', '1month': '1mo' },
    rangeFor(iv, n) {
      // Yahoo caps intraday history: one-minute bars only go back about a week.
      if (iv === '1m') return '5d';
      if (iv === '5m' || iv === '15m') return '1mo';
      if (iv === '30m' || iv === '60m') return '3mo';
      if (iv === '1wk') return '5y';
      if (iv === '1mo') return 'max';
      return n > 400 ? '5y' : n > 200 ? '2y' : '1y';
    },
    build(fn, p) {
      if (fn === 'search') {
        const q = new URLSearchParams({ q: p.q, quotesCount: '10', newsCount: '0' });
        return `${this.base}/v1/finance/search?${q}`;
      }
      // quote and series are the same call; the adapter reads whichever part it needs.
      const iv = this.ivMap[p.interval] || '1d';
      const q = new URLSearchParams({
        interval: fn === 'quote' ? '1d' : iv,
        range: fn === 'quote' ? '5d' : this.rangeFor(iv, Number(p.outputsize) || 500),
      });
      return `${this.base}/v8/finance/chart/${encodeURIComponent(p.symbol)}?${q}`;
    },
    headers: {
      // Yahoo refuses a request with no user agent.
      'user-agent': 'Mozilla/5.0 (compatible; BullpenTrader/1.0)',
      accept: 'application/json',
    },
  },
  alphavantage: {
    base: 'https://www.alphavantage.co/query',
    intraday: true,
    intervals: ['1min', '5min', '15min', '30min', '60min'],
    build(fn, p, key) {
      const q = new URLSearchParams({ apikey: key });
      if (fn === 'quote') {
        q.set('function', 'GLOBAL_QUOTE');
        q.set('symbol', p.symbol);
      } else if (fn === 'series') {
        const iv = p.interval || '1day';
        if (iv === '1day') { q.set('function', 'TIME_SERIES_DAILY'); }
        else if (iv === '1week') { q.set('function', 'TIME_SERIES_WEEKLY'); }
        else if (iv === '1month') { q.set('function', 'TIME_SERIES_MONTHLY'); }
        else { q.set('function', 'TIME_SERIES_INTRADAY'); q.set('interval', iv); }
        q.set('symbol', p.symbol);
        q.set('outputsize', Number(p.outputsize) > 100 ? 'full' : 'compact');
      } else {
        q.set('function', 'SYMBOL_SEARCH');
        q.set('keywords', p.q);
      }
      return `${this.base}?${q}`;
    },
  },
  twelvedata: {
    base: 'https://api.twelvedata.com',
    intraday: true,
    intervals: ['1min', '5min', '15min', '30min', '45min', '1h'],
    build(fn, p, key) {
      const q = new URLSearchParams({ apikey: key });
      if (fn === 'quote') {
        q.set('symbol', p.symbol);
        return `${this.base}/quote?${q}`;
      }
      if (fn === 'series') {
        q.set('symbol', p.symbol);
        q.set('interval', p.interval === '1day' ? '1day' : p.interval || '1day');
        q.set('outputsize', String(Math.min(5000, Math.max(10, Number(p.outputsize) || 500))));
        return `${this.base}/time_series?${q}`;
      }
      q.set('symbol', p.q);
      return `${this.base}/symbol_search?${q}`;
    },
  },
};

// A symbol is letters, digits and the handful of punctuation marks real tickers use. Validating
// here means nothing a caller sends can be smuggled into the upstream URL as a parameter.
const SYMBOL = /^[A-Za-z0-9.\-^:=]{1,20}$/;
const INTERVAL = /^(1min|5min|15min|30min|45min|60min|1h|1day|1week|1month)$/;

function json(body, status, origin, cacheSeconds) {
  // A 204 must not carry a body. Constructing one with a body throws, which would have taken out
  // the CORS preflight -- and so every cross-origin request, which is the only kind this gets.
  const code = status || 200;
  return new Response(code === 204 || code === 304 ? null : JSON.stringify(body), {
    status: code,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin || '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'accept, content-type',
      // Caching at the edge is not a nicety: it is what keeps a shared free-tier key inside its
      // rate limit when several people have the page open.
      'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
  });
}

export async function handle(request, env) {
  const origin = env.ALLOW_ORIGIN || '*';
  if (request.method === 'OPTIONS') return json({}, 204, origin);
  if (request.method !== 'GET') return json({ error: 'Only GET is supported.' }, 405, origin);

  const providerId = String(env.PROVIDER || 'alphavantage').toLowerCase();
  const provider = PROVIDERS[providerId];
  if (!provider) {
    return json({ error: `PROVIDER is set to "${providerId}", which this proxy does not know. Use alphavantage or twelvedata.` }, 500, origin);
  }

  const url = new URL(request.url);
  const fn = url.searchParams.get('fn') || '';

  if (fn === 'meta') {
    // Lets the app label the data correctly without being told the provider by hand.
    return json({ provider: providerId, intraday: provider.intraday, intervals: provider.intervals, needsKey: provider.needsKey !== false }, 200, origin, 3600);
  }

  // Yahoo takes no key, so only ask for one where the provider actually needs it.
  const key = env.API_KEY;
  if (provider.needsKey !== false && !key) {
    return json({ error: 'This proxy has no API_KEY set, so it cannot fetch anything. Set it as a secret rather than editing it into the source.' }, 500, origin);
  }

  const p = {
    symbol: url.searchParams.get('symbol') || '',
    interval: url.searchParams.get('interval') || '1day',
    outputsize: url.searchParams.get('outputsize') || '500',
    q: url.searchParams.get('q') || '',
  };

  if (fn === 'quote' || fn === 'series') {
    if (!SYMBOL.test(p.symbol)) return json({ error: 'Bad or missing symbol.' }, 400, origin);
    if (fn === 'series' && !INTERVAL.test(p.interval)) return json({ error: 'Unsupported interval.' }, 400, origin);
  } else if (fn === 'search') {
    if (!p.q || p.q.length > 64) return json({ error: 'Bad or missing search term.' }, 400, origin);
  } else {
    return json({ error: 'Unknown fn. This proxy serves meta, quote, series and search only.' }, 400, origin);
  }

  let upstream;
  try {
    upstream = await fetch(provider.build(fn, p, key), { headers: provider.headers || { accept: 'application/json' } });
  } catch (e) {
    return json({ error: `Could not reach ${providerId}: ${e && e.message ? e.message : e}` }, 502, origin);
  }

  let data;
  try {
    data = await upstream.json();
  } catch (e) {
    return json({ error: `${providerId} did not return JSON (HTTP ${upstream.status}).` }, 502, origin);
  }

  // The provider's own status is passed through, because the app distinguishes a rate limit from a
  // bad symbol from an outage and needs the real one. The envelope names the provider so the app
  // knows which adapter to parse with.
  const cacheFor = fn === 'series' ? 300 : fn === 'search' ? 3600 : 45;
  return json({ provider: providerId, data }, upstream.ok ? 200 : upstream.status, origin, upstream.ok ? cacheFor : 0);
}

// Cloudflare Workers entry point.
export default { fetch: (request, env) => handle(request, env) };
