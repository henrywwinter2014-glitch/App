/*
 * Real market data.
 *
 * This module is the only place in the app that talks to a market-data provider, and it is built
 * around one rule that everything else here exists to protect:
 *
 *     If we do not know the price, we say so. We never make one up.
 *
 * Everywhere else in Bullpen Trader a missing price can be invented, because the simulated market
 * is invented by design. Here it cannot. A fabricated real price is worse than no price at all: it
 * teaches the wrong lesson, it corrupts the trade record, and the user has no way of telling it
 * from the genuine article. So every failure path in this file ends in `null` plus a recorded
 * reason, and `quote()` has no branch that returns a number it did not receive from the provider.
 *
 * The second rule is about the key. A free API key is still a credential, and a credential in a
 * static page is a credential published to the world. So this module never holds one. It knows a
 * single URL — a proxy the user runs themselves, which holds the key in an environment variable
 * and injects it server-side. `server/` in this repo has that proxy, in about fifty lines, for
 * Cloudflare Workers and for Vercel/Netlify. Without it, real-market mode simply reports that it
 * is not configured.
 *
 * Providers differ in wire format but not in substance, so each one gets a small adapter that
 * normalises its response into the shape the rest of the app reads. Alpha Vantage and Twelve Data
 * are implemented; a third would be another twenty lines. The adapter is chosen from the config,
 * or sniffed from the response shape when a proxy does not announce itself, which means a proxy
 * someone already has lying around tends to work without being told anything.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
   * Providers
   *
   * `delay` is what the free tier actually gives you, which is not always what the marketing page
   * implies. `perMin` and `perDay` are the free-tier request limits we hold ourselves to; going
   * over them does not get you more data, it gets you an error and, eventually, a blocked key.
   * ------------------------------------------------------------------------- */
  const PROVIDERS = {
    alphavantage: {
      id: 'alphavantage',
      name: 'Alpha Vantage',
      site: 'https://www.alphavantage.co/support/#api-key',
      // The free tier serves end-of-day data for most symbols; real-time needs a paid plan.
      kind: 'eod',
      delayNote: 'End of day on the free plan. Real-time and 15-minute-delayed quotes need a paid plan.',
      perMin: 5,
      perDay: 25,
      intraday: true,
      intervals: ['1min', '5min', '15min', '30min', '60min'],
      search: true,
      direct: true,
      directUrl(fn, p, key) {
        const b = 'https://www.alphavantage.co/query';
        const q = new URLSearchParams({ apikey: key });
        if (fn === 'quote') { q.set('function', 'GLOBAL_QUOTE'); q.set('symbol', p.symbol); }
        else if (fn === 'series') {
          const iv = p.interval || '1day';
          q.set('function', iv === '1day' ? 'TIME_SERIES_DAILY' : iv === '1week' ? 'TIME_SERIES_WEEKLY' : iv === '1month' ? 'TIME_SERIES_MONTHLY' : 'TIME_SERIES_INTRADAY');
          if (!['1day', '1week', '1month'].includes(iv)) q.set('interval', iv);
          q.set('symbol', p.symbol);
          q.set('outputsize', +p.outputsize > 100 ? 'full' : 'compact');
        } else { q.set('function', 'SYMBOL_SEARCH'); q.set('keywords', p.q); }
        return `${b}?${q}`;
      },
    },
    twelvedata: {
      id: 'twelvedata',
      name: 'Twelve Data',
      site: 'https://twelvedata.com/pricing',
      kind: 'delayed',
      delayNote: 'Delayed on the free plan, typically by about 15 minutes for US equities. Real-time needs a paid plan.',
      perMin: 8,
      perDay: 800,
      intraday: true,
      intervals: ['1min', '5min', '15min', '30min', '45min', '1h'],
      search: true,
      direct: true,
      directUrl(fn, p, key) {
        const b = 'https://api.twelvedata.com';
        const q = new URLSearchParams({ apikey: key });
        if (fn === 'quote') { q.set('symbol', p.symbol); return `${b}/quote?${q}`; }
        if (fn === 'series') {
          q.set('symbol', p.symbol);
          q.set('interval', p.interval || '1day');
          q.set('outputsize', String(Math.min(5000, Math.max(10, +p.outputsize || 500))));
          return `${b}/time_series?${q}`;
        }
        q.set('symbol', p.q);
        return `${b}/symbol_search?${q}`;
      },
    },
    /*
     * Finnhub. A free key, 60 calls a minute, and real-time quotes for US shares -- the most
     * generous free quote allowance of the four.
     *
     * The catch is history: the candle endpoint moved off the free plan, so a free key gets live
     * prices but no chart. The app handles that the way it handles any refusal -- the chart says
     * why it is empty instead of drawing something -- and the note below says so up front rather
     * than letting you discover it.
     */
    finnhub: {
      id: 'finnhub',
      name: 'Finnhub',
      site: 'https://finnhub.io/dashboard',
      kind: 'realtime',
      delayNote: 'Real-time for US shares on the free plan, 60 calls a minute. Other exchanges and historical candles need a paid plan, so on a free key the chart is built from the prices you are sent as you watch, rather than fetched as history.',
      perMin: 60,
      perDay: 100000,          // no published daily cap on the free plan
      intraday: true,
      intervals: ['1min', '5min', '15min', '30min', '60min'],
      search: true,
      // Finnhub answers browser requests with CORS headers, so it can be called without a proxy.
      direct: true,
      directUrl(fn, p, key) {
        const b = 'https://finnhub.io/api/v1';
        if (fn === 'search') return `${b}/search?q=${encodeURIComponent(p.q)}&token=${encodeURIComponent(key)}`;
        if (fn === 'quote') return `${b}/quote?symbol=${encodeURIComponent(p.symbol)}&token=${encodeURIComponent(key)}`;
        const map = { '1min': '1', '5min': '5', '15min': '15', '30min': '30', '45min': '30', '60min': '60', '1h': '60', '1day': 'D', '1week': 'W', '1month': 'M' };
        const res = map[p.interval] || 'D';
        const per = { 1: 60, 5: 300, 15: 900, 30: 1800, 60: 3600, D: 86400, W: 604800, M: 2592000 }[res] || 86400;
        const slack = /[DWM]/.test(res) ? 1.5 : 4;
        const to = Math.floor(Date.now() / 1000);
        const from = to - Math.ceil(per * Math.min(5000, Math.max(10, +p.outputsize || 500)) * slack);
        return `${b}/stock/candle?symbol=${encodeURIComponent(p.symbol)}&resolution=${res}&from=${from}&to=${to}&token=${encodeURIComponent(key)}`;
      },
    },
    /*
     * Yahoo Finance. No account and no key: the endpoints behind finance.yahoo.com are open, and
     * one of them returns the quote and the history together, which also halves the requests.
     *
     * The catch, and it is worth knowing before you rely on it: this is not a published API.
     * Yahoo documents none of it and promises nothing. The shape can change, and it has;
     * endpoints have started demanding a session cookie and a "crumb" before now. It must be
     * called from the proxy rather than the browser, and Yahoo's terms allow personal use while
     * forbidding redistribution. Treat it as convenient rather than dependable.
     */
    yahoo: {
      id: 'yahoo',
      name: 'Yahoo Finance',
      site: 'https://uk.finance.yahoo.com/',
      kind: 'delayed',
      delayNote: 'No key needed. Delay varies by exchange and Yahoo does not state it — commonly real-time for US shares and about 15 minutes elsewhere. Undocumented endpoints that can change without notice.',
      // No published rate limit. These are deliberately conservative: enough for a watchlist,
      // modest enough not to get an IP blocked.
      perMin: 60,
      perDay: 20000,
      intraday: true,
      intervals: ['1min', '5min', '15min', '30min', '60min'],
      search: true,
      noKey: true,
      // Yahoo sends no CORS headers, so a browser calling it directly is blocked. Proxy only.
      direct: false,
    },
    // Used by the test suite and by the demo endpoint. Never reports itself as real data.
    mock: {
      id: 'mock',
      name: 'Mock provider (testing)',
      site: '',
      kind: 'eod',
      delayNote: 'A stand-in used for testing. Not market data.',
      perMin: 600,
      perDay: 100000,
      intraday: true,
      intervals: ['1min', '5min', '15min', '30min', '60min'],
      search: true,
      direct: true,
      directUrl(fn, p, key) {
        const q = new URLSearchParams({ fn, symbol: p.symbol || '', interval: p.interval || '1day', outputsize: String(p.outputsize || 500), q: p.q || '' });
        return `${key}${key.indexOf('?') >= 0 ? '&' : '?'}${q}`;
      },
    },
  };

  const DEFAULTS = {
    /*
     * Two ways to reach a provider.
     *
     * 'proxy' is the one to use for anything other people can open: the key lives on a server you
     * run and the page never sees it.
     *
     * 'direct' is for a copy only you run -- opened from your own disk, or served on your own
     * machine. The browser calls the provider itself, so there is no proxy to deploy, and the key
     * is held in this browser's storage. That is a real exposure and a deliberate one: on your own
     * machine the key is already yours, but on a page anyone else can load it would be theirs too.
     * The app says so plainly and keeps the key out of the saved game, so it never syncs anywhere.
     *
     * Not every provider allows it. A browser can only call one that returns CORS headers;
     * Yahoo does not, so Yahoo needs the proxy.
     */
    mode: 'proxy',
    key: '',               // direct mode only, never persisted into the save file
    provider: '',          // '' means "work it out from what the proxy sends back"
    endpoint: '',          // the user's own proxy; empty means real-market mode is unconfigured
    quoteTtlOpen: 60000,   // don't re-ask for the same quote more than once a minute
    quoteTtlClosed: 900000, // ...or more than once every fifteen minutes with the market shut
    seriesTtl: 900000,
    staleAfter: 3600000,   // an hour-old quote is labelled stale rather than shown as current
    maxRetries: 2,
    timeout: 12000,
  };

  let cfg = Object.assign({}, DEFAULTS);

  /* ---------------------------------------------------------------------------
   * Caches and bookkeeping
   * ------------------------------------------------------------------------- */
  const quoteCache = new Map();   // symbol -> normalised quote
  const seriesCache = new Map();  // `${symbol}|${interval}` -> { at, series }
  const searchCache = new Map();
  const inflight = new Map();     // de-duplicates concurrent requests for the same thing
  const listeners = [];

  let lastOk = 0;                 // when we last heard anything true from the provider
  let lastError = null;           // { at, message, kind }

  /*
   * Request budgets belong to the key, not to the session, so they are tracked per provider and
   * survive a cache clear: letting a user wipe the counter by pressing "refresh" is how a free-tier
   * key gets throttled and then blocked. Pointing at a different endpoint does start a fresh
   * budget, because that is a different key.
   */
  const budgets = new Map();
  const budget = () => {
    const k = cfg.provider || 'unknown';
    if (!budgets.has(k)) budgets.set(k, { min: [], day: [], total: 0, failed: 0 });
    return budgets.get(k);
  };

  // A circuit breaker. After a run of failures we stop asking for a while: hammering a provider
  // that is down or rate-limiting us makes both problems worse, and the retry guidance in the
  // requirements is explicit that failed requests must not turn into a storm of calls.
  const breaker = { fails: 0, openUntil: 0 };
  const BREAK_AFTER = 3;
  const BREAK_FOR = 60000;

  const now = () => Date.now();

  /*
   * Detecting a page that is not allowed to fetch at all.
   *
   * Published in a sandboxed frame -- a claude.ai artifact, say -- the page runs under a content
   * security policy that permits no outbound request. The fetch rejects with the same
   * "Failed to fetch" a dead connection gives, so without this the app sends people off to check
   * a proxy, or their wifi, over something neither can fix.
   *
   * The browser does say so, through a securitypolicyviolation event. Catching that turns an
   * unexplainable failure into a plain statement of what is wrong and what to do instead.
   */
  let cspBlock = null;
  try {
    document.addEventListener('securitypolicyviolation', (e) => {
      if (/connect-src|default-src/.test(e.violatedDirective || '')) {
        cspBlock = { at: now(), uri: String(e.blockedURI || ''), directive: e.violatedDirective };
      }
    });
  } catch (e) { /* no document: running under test in node */ }
  const recentlyBlocked = () => !!(cspBlock && now() - cspBlock.at < 4000);
  // A page inside someone else's frame is the usual home of such a policy.
  const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const emit = () => { for (const fn of listeners.slice()) { try { fn(); } catch (e) { /* a listener must not break a fetch */ } } };

  function limits() {
    const p = PROVIDERS[cfg.provider] || null;
    const t = now();
    const calls = budget();
    calls.min = calls.min.filter((x) => t - x < 60000);
    calls.day = calls.day.filter((x) => t - x < 86400000);
    return {
      perMin: p ? p.perMin : null,
      perDay: p ? p.perDay : null,
      usedMin: calls.min.length,
      usedDay: calls.day.length,
      // Unknown provider means unknown limits, so we don't claim to know how much room is left.
      roomMin: p ? Math.max(0, p.perMin - calls.min.length) : null,
      roomDay: p ? Math.max(0, p.perDay - calls.day.length) : null,
    };
  }

  /* ---------------------------------------------------------------------------
   * Freshness
   *
   * The requirements are strict here, and rightly so: a price has to carry how old it is and where
   * it came from, and an old price must never be presented as a current one. This turns a quote
   * into one of five honest labels.
   * ------------------------------------------------------------------------- */
  const FRESHNESS = {
    live: { level: 'live', label: 'Real-time', tone: 'ok' },
    delayed: { level: 'delayed', label: 'Delayed', tone: 'ok' },
    eod: { level: 'eod', label: 'End of day', tone: 'ok' },
    stale: { level: 'stale', label: 'Stale', tone: 'warn' },
    unavailable: { level: 'unavailable', label: 'Unavailable', tone: 'bad' },
  };

  /*
   * An adapter naturally says "realtime"; the label below is keyed "live". Without this they do
   * not meet, and a genuinely real-time quote gets shown as Delayed -- which went unnoticed only
   * because the first three providers never claimed real time.
   */
  const KIND = { realtime: 'live', live: 'live', delayed: 'delayed', eod: 'eod' };

  function freshness(q) {
    if (!q || !isFinite(q.price)) return Object.assign({}, FRESHNESS.unavailable, { age: null, note: 'No price has been received for this symbol.' });
    const age = now() - (q.fetchedAt || 0);
    if (age > cfg.staleAfter) {
      return Object.assign({}, FRESHNESS.stale, {
        age,
        note: `Last updated ${agoText(age)}. The provider has not answered since, so this is the last price we were given, not the current one.`,
      });
    }
    const base = FRESHNESS[KIND[q.kind] || q.kind] || FRESHNESS.delayed;
    return Object.assign({}, base, { age, note: noteFor(q) });
  }

  function noteFor(q) {
    const p = PROVIDERS[q.provider];
    const src = p ? p.name : (q.provider || 'the data provider');
    const when = q.asOfText || (q.asOf ? new Date(q.asOf).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'an unstated time');
    const k = KIND[q.kind] || q.kind;
    if (k === 'eod') return `End-of-day close for ${when}, from ${src}. Not an intraday price.`;
    if (k === 'delayed') return `Delayed quote from ${src}, as of ${when}.`;
    return `Real-time quote from ${src}, as of ${when}.`;
  }

  function agoText(ms) {
    const s = Math.round(ms / 1000);
    if (s < 90) return `${s} seconds ago`;
    const m = Math.round(s / 60);
    if (m < 90) return `${m} minutes ago`;
    const h = Math.round(m / 60);
    if (h < 36) return `${h} hours ago`;
    return `${Math.round(h / 24)} days ago`;
  }

  /* ---------------------------------------------------------------------------
   * Transport
   *
   * One function does every call, so the rate limit, the breaker, the timeout, the retry policy
   * and the error bookkeeping are applied once and cannot be bypassed by a new call site.
   * ------------------------------------------------------------------------- */
  /*
   * Scrub the key out of anything that might be shown or logged. In direct mode it is in the URL,
   * and a fetch failure happily puts the URL in its message -- which would then be rendered on
   * screen and, worse, copied into a bug report.
   */
  function scrub(text) {
    let t = String(text == null ? '' : text);
    // The URL param goes first: replacing the key itself first would leave the
    // placeholder sitting where a value belongs, and the pattern would then eat
    // half of it, printing "<your key> key>".
    t = t.replace(/([?&](?:token|apikey|api_key)=)[^&\s"']+/gi, '$1<your key>');
    return cfg.key ? t.split(cfg.key).join('<your key>') : t;
  }

  function fail(kind, message, extra) {
    lastError = Object.assign({ at: now(), kind, message: scrub(message) }, extra || {});
    budget().failed++;
    if (kind !== 'unconfigured' && kind !== 'ratelimit-local') {
      breaker.fails++;
      if (breaker.fails >= BREAK_AFTER) breaker.openUntil = now() + BREAK_FOR;
    }
    emit();
    return null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function call(fn, params) {
    const direct = cfg.mode === 'direct';
    if (direct) {
      const p0 = PROVIDERS[cfg.provider];
      if (!p0) return fail('unconfigured', 'Pick which data provider your key is for before fetching directly.');
      if (!p0.direct) return fail('unconfigured', `${p0.name} cannot be called straight from a browser — it sends no CORS headers — so it needs the proxy. Pick another provider, or switch back to proxy mode.`);
      if (!cfg.key) return fail('unconfigured', `No ${p0.name} key set. Paste it in Settings, or switch to proxy mode.`);
    } else if (!cfg.endpoint) {
      return fail('unconfigured', 'No market-data endpoint is set. Real-market mode needs the address of your own data proxy — see Settings.');
    }
    if (now() < breaker.openUntil) {
      const left = Math.ceil((breaker.openUntil - now()) / 1000);
      return fail('paused', `Paused after ${breaker.fails} failed requests. Trying again in ${left} seconds.`);
    }
    const lim = limits();
    if (lim.roomDay === 0) return fail('ratelimit-local', `The daily limit for ${PROVIDERS[cfg.provider].name} on the free plan (${lim.perDay} requests) has been used up. It resets tomorrow.`);
    if (lim.roomMin === 0) return fail('ratelimit-local', `Holding off: ${PROVIDERS[cfg.provider].name} allows ${lim.perMin} requests a minute and that is used up. Try again shortly.`);

    const url = direct ? PROVIDERS[cfg.provider].directUrl(fn, params, cfg.key) : buildUrl(fn, params);
    let wait = 700;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
      const b = budget();
      b.min.push(now()); b.day.push(now()); b.total++;
      let res, body;
      try {
        res = await withTimeout(fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' }), cfg.timeout);
      } catch (e) {
        // A network error, a CORS refusal or a timeout. All transient as far as we can tell.
        if (attempt < cfg.maxRetries) { await sleep(jitter(wait)); wait *= 2; continue; }
        /*
         * If the browser says there is no connection at all, say that instead of blaming the
         * proxy. Telling someone on a train to check their worker is deployed sends them to fix
         * something that is not broken.
         */
        // The violation event can land a moment after the rejection; give it that moment.
        await sleep(60);
        if (recentlyBlocked()) {
          return fail('blocked', `This copy of the app is not allowed to fetch outside data. It is running in a sandboxed page${framed ? ' inside another site' : ''}, whose security policy blocks every outbound request, so no provider and no proxy can be reached from here — nothing you change in Settings will help. The simulated market and replay mode need no connection and work normally. For live prices, run your own copy: download the project and open index.html, or host it yourself.`);
        }
        const off = typeof navigator !== 'undefined' && navigator.onLine === false;
        return fail(off ? 'offline' : 'network', off
          ? 'You are offline, so no live prices can be fetched. The simulated market and replay mode need no connection and carry on as normal.'
          : `Could not reach the data endpoint (${String(e && e.message || e)}). Check the address in Settings and that your proxy is running.`);
      }
      if (res.status === 429 || res.status === 503) {
        const ra = +res.headers.get('retry-after');
        if (attempt < cfg.maxRetries) { await sleep(isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 20000) : jitter(wait)); wait *= 2; continue; }
        return fail('ratelimit', 'The data provider is rate-limiting these requests. Wait a little and try again.');
      }
      if (res.status >= 500) {
        if (attempt < cfg.maxRetries) { await sleep(jitter(wait)); wait *= 2; continue; }
        return fail('server', `The data provider returned an error (HTTP ${res.status}).`);
      }
      if (!res.ok) {
        // 4xx other than 429 will not fix itself by being asked again.
        const authFail = res.status === 401 || res.status === 403;
        return fail('request', `${direct ? PROVIDERS[cfg.provider].name : 'The data endpoint'} refused the request (HTTP ${res.status}).${authFail
          ? (direct
            ? ' That usually means the key is wrong, or your plan does not cover this.'
            : ' That usually means the API key on your proxy is missing or wrong.')
          : ''}`);
      }
      try {
        body = await res.json();
      } catch (e) {
        return fail('parse', 'The data endpoint did not return JSON. If you are pointing at a web page rather than an API, that would explain it.');
      }

      // Unwrap the envelope our own proxy uses, if that is what answered.
      let provider = cfg.provider, data = body;
      if (!direct && body && typeof body === 'object' && body.data && typeof body.provider === 'string') {
        provider = PROVIDERS[body.provider] ? body.provider : provider;
        data = body.data;
      }
      if (!provider) provider = sniff(data);
      if (!provider) return fail('unknown-provider', 'The response did not look like Alpha Vantage or Twelve Data. Set the provider explicitly in Settings.');

      // Providers signal trouble inside a 200 response, so this has to be checked after parsing.
      const provErr = adapters[provider].error(data);
      if (provErr) {
        const rate = /limit|frequency|quota|too many/i.test(provErr);
        if (rate && attempt < cfg.maxRetries) { await sleep(jitter(Math.max(wait, 3000))); wait *= 2; continue; }
        return fail(rate ? 'ratelimit' : 'provider', provErr);
      }

      breaker.fails = 0;
      lastOk = now();
      lastError = null;
      /*
       * "Work it out from the proxy" should only have to work it out once. Remembering the answer
       * is also what lets the UI name the provider, state its delay and show the right request
       * budget -- all of which read cfg.provider rather than re-sniffing.
       */
      if (!cfg.provider && PROVIDERS[provider]) {
        // Carry the calls already made across to the newly identified provider's budget, or the
        // first few requests of a session would not be counted against the key that served them.
        const prior = budgets.get('unknown');
        cfg.provider = provider;
        if (prior) {
          const b2 = budget();
          b2.min = prior.min.concat(b2.min);
          b2.day = prior.day.concat(b2.day);
          b2.total += prior.total; b2.failed += prior.failed;
          budgets.delete('unknown');
        }
      }
      emit();
      return { provider, data };
    }
    return fail('network', 'Gave up after several attempts.');
  }

  const jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5));

  function withTimeout(p, ms) {
    return new Promise((resolve, reject) => {
      const id = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
      p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
    });
  }

  /*
   * The request the client sends is deliberately generic — fn plus arguments — so that the proxy,
   * not the browser, decides which provider path and which key to use.
   */
  function buildUrl(fn, params) {
    const u = cfg.endpoint + (cfg.endpoint.indexOf('?') >= 0 ? '&' : '?') + 'fn=' + encodeURIComponent(fn);
    const qs = Object.keys(params || {})
      .filter((k) => params[k] != null && params[k] !== '')
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
      .join('&');
    return qs ? u + '&' + qs : u;
  }

  // Work out who answered from the shape of what came back.
  function sniff(d) {
    if (!d || typeof d !== 'object') return '';
    if (d['Global Quote'] || d['Meta Data'] || d.bestMatches || d['Error Message'] || d.Note) return 'alphavantage';
    if (d.values || d.percent_change != null || d.previous_close != null || (d.meta && d.meta.interval)) return 'twelvedata';
    if (d.chart || (d.quotes && Array.isArray(d.quotes))) return 'yahoo';
    // Finnhub's quote is a flat object of one-letter keys; its candle carries s/t/c arrays.
    if (d.pc !== undefined && d.c !== undefined && d.h !== undefined) return 'finnhub';
    if (d.s === 'ok' || d.s === 'no_data') return 'finnhub';
    if (Array.isArray(d.result) && d.count !== undefined) return 'finnhub';
    if (d.bullpenMock) return 'mock';
    return '';
  }

  /* ---------------------------------------------------------------------------
   * Adapters
   *
   * Each one turns a provider's own JSON into the single shape the app reads. They are pure
   * functions of the response: no fetching, no caching, no fallbacks. A field the provider did not
   * send comes out as null, never as a guess.
   * ------------------------------------------------------------------------- */
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[%,\s]/g, '')); return isFinite(n) ? n : null; };

  const adapters = {
    alphavantage: {
      error(d) {
        if (d['Error Message']) return String(d['Error Message']);
        // Alpha Vantage reports both rate limits and plan restrictions in these two fields.
        if (d.Note) return String(d.Note);
        if (d.Information) return String(d.Information);
        return '';
      },
      quote(d, symbol) {
        const g = d['Global Quote'] || d['Realtime Global Quote'];
        if (!g || !Object.keys(g).length) return null;
        const price = num(g['05. price']);
        if (price == null) return null;
        const day = g['07. latest trading day'] || '';
        return {
          symbol: g['01. symbol'] || symbol,
          price,
          open: num(g['02. open']),
          high: num(g['03. high']),
          low: num(g['04. low']),
          volume: num(g['06. volume']),
          prevClose: num(g['08. previous close']),
          change: num(g['09. change']),
          changePct: num(g['10. change percent']),
          currency: null,                       // GLOBAL_QUOTE does not say
          asOf: day ? Date.parse(day + 'T21:00:00Z') : null,
          asOfText: day || '',
          kind: 'eod',
          marketStatus: 'unknown',
        };
      },
      series(d, interval) {
        const key = Object.keys(d).find((k) => /^Time Series|^Weekly|^Monthly/.test(k));
        if (!key) return null;
        const rows = d[key];
        const out = [];
        for (const t of Object.keys(rows).sort()) {
          const r = rows[t];
          const o = num(r['1. open']), h = num(r['2. high']), l = num(r['3. low']), c = num(r['4. close']);
          if (o == null || h == null || l == null || c == null) continue;
          out.push({ t, o, h, l, c, v: num(r['5. volume']) || 0 });
        }
        if (!out.length) return null;
        const meta = d['Meta Data'] || {};
        return { interval, tz: meta['6. Time Zone'] || meta['7. Time Zone'] || 'US/Eastern', bars: out };
      },
      search(d) {
        const m = d.bestMatches || [];
        return m.map((x) => ({
          symbol: x['1. symbol'] || '', name: x['2. name'] || '', type: x['3. type'] || '',
          region: x['4. region'] || '', currency: x['8. currency'] || '',
        })).filter((x) => x.symbol);
      },
    },

    twelvedata: {
      error(d) {
        if (d && d.status === 'error') return String(d.message || 'The data provider reported an error.');
        if (d && d.code && d.code >= 400) return String(d.message || `The data provider returned code ${d.code}.`);
        return '';
      },
      quote(d, symbol) {
        const price = num(d.close) != null ? num(d.close) : num(d.price);
        if (price == null) return null;
        const ts = d.timestamp ? +d.timestamp * 1000 : (d.datetime ? Date.parse(String(d.datetime).replace(' ', 'T') + 'Z') : null);
        return {
          symbol: d.symbol || symbol,
          price,
          open: num(d.open),
          high: num(d.high),
          low: num(d.low),
          volume: num(d.volume),
          prevClose: num(d.previous_close),
          change: num(d.change),
          changePct: num(d.percent_change),
          currency: d.currency || null,
          asOf: isFinite(ts) ? ts : null,
          asOfText: d.datetime ? String(d.datetime) : '',
          // Twelve Data's free plan is delayed; a paid plan returns the same shape but current.
          kind: 'delayed',
          marketStatus: d.is_market_open === true ? 'open' : d.is_market_open === false ? 'closed' : 'unknown',
          name: d.name || null,
          exchange: d.exchange || null,
        };
      },
      series(d, interval) {
        const vals = d.values;
        if (!Array.isArray(vals) || !vals.length) return null;
        const out = [];
        // Twelve Data sends newest first.
        for (const r of vals.slice().reverse()) {
          const o = num(r.open), h = num(r.high), l = num(r.low), c = num(r.close);
          if (o == null || h == null || l == null || c == null) continue;
          out.push({ t: String(r.datetime), o, h, l, c, v: num(r.volume) || 0 });
        }
        if (!out.length) return null;
        return { interval: (d.meta && d.meta.interval) || interval, tz: (d.meta && d.meta.exchange_timezone) || 'UTC', bars: out };
      },
      search(d) {
        return (d.data || []).map((x) => ({
          symbol: x.symbol || '', name: x.instrument_name || '', type: x.instrument_type || '',
          region: x.country || '', currency: x.currency || '',
        })).filter((x) => x.symbol);
      },
    },

    finnhub: {
      error(d) {
        if (d && d.error) return String(d.error);
        if (d && d.s === 'no_data') return 'Finnhub has no candles for that symbol and period.';
        return '';
      },
      quote(d, symbol) {
        /*
         * An unknown symbol, or one your plan does not cover, comes back as a complete quote of
         * zeros rather than as an error. Treating that as a price of zero would put a worthless
         * share in the portfolio, so a zero current price is read as "no data" -- which it is.
         */
        const price = num(d.c);
        if (price == null || price === 0) return null;
        const ts = d.t ? +d.t * 1000 : null;
        return {
          symbol,
          price,
          open: num(d.o) || null,
          high: num(d.h) || null,
          low: num(d.l) || null,
          volume: null,                       // the quote endpoint does not carry volume
          prevClose: num(d.pc) || null,
          change: num(d.d),
          changePct: num(d.dp),
          currency: null,                     // nor the currency; US shares on the free plan
          asOf: isFinite(ts) && ts > 0 ? ts : null,
          asOfText: isFinite(ts) && ts > 0 ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '',
          kind: 'realtime',
          marketStatus: 'unknown',
        };
      },
      series(d, interval) {
        if (!d || d.s !== 'ok' || !Array.isArray(d.t) || !d.t.length) return null;
        const daily = interval === '1day' || interval === '1week' || interval === '1month';
        const out = [];
        for (let i = 0; i < d.t.length; i++) {
          const o = num(d.o && d.o[i]), h = num(d.h && d.h[i]);
          const l = num(d.l && d.l[i]), c = num(d.c && d.c[i]);
          if (o == null || h == null || l == null || c == null) continue;
          const iso = new Date(d.t[i] * 1000).toISOString();
          out.push({ t: daily ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' '), o, h, l, c, v: num(d.v && d.v[i]) || 0 });
        }
        return out.length ? { interval, tz: 'UTC', bars: out } : null;
      },
      search(d) {
        return ((d && d.result) || []).filter((x) => x.symbol).map((x) => ({
          symbol: x.symbol, name: x.description || x.displaySymbol || '',
          type: x.type || '', region: '', currency: '',
        }));
      },
    },

    yahoo: {
      error(d) {
        const e = d && d.chart && d.chart.error;
        if (e) return String(e.description || e.code || 'Yahoo reported an error.');
        if (d && d.finance && d.finance.error) return String(d.finance.error.description || d.finance.error.code);
        // An unknown symbol comes back as a null result rather than an error.
        if (d && d.chart && Array.isArray(d.chart.result) && !d.chart.result.length) return 'Yahoo has no data for that symbol.';
        return '';
      },
      quote(d, symbol) {
        const r = d && d.chart && d.chart.result && d.chart.result[0];
        const m = r && r.meta;
        if (!m) return null;
        const price = num(m.regularMarketPrice);
        if (price == null) return null;
        // chartPreviousClose is the previous session's close; previousClose appears on some.
        const prev = num(m.chartPreviousClose) != null ? num(m.chartPreviousClose) : num(m.previousClose);
        const ts = m.regularMarketTime ? +m.regularMarketTime * 1000 : null;
        return {
          symbol: m.symbol || symbol,
          price,
          open: num(m.regularMarketOpen),
          high: num(m.regularMarketDayHigh),
          low: num(m.regularMarketDayLow),
          volume: num(m.regularMarketVolume),
          prevClose: prev,
          change: prev != null ? price - prev : null,
          changePct: prev ? (price / prev - 1) * 100 : null,
          currency: m.currency || null,
          asOf: isFinite(ts) ? ts : null,
          asOfText: isFinite(ts) ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '',
          kind: 'delayed',
          marketStatus: m.marketState === 'REGULAR' ? 'open'
            : m.marketState === 'PRE' ? 'pre'
              : m.marketState === 'POST' ? 'post'
                : m.marketState ? 'closed' : 'unknown',
          name: m.shortName || m.longName || null,
          exchange: m.fullExchangeName || m.exchangeName || null,
        };
      },
      series(d, interval) {
        const r = d && d.chart && d.chart.result && d.chart.result[0];
        const q = r && r.indicators && r.indicators.quote && r.indicators.quote[0];
        if (!r || !q || !Array.isArray(r.timestamp)) return null;
        const out = [];
        for (let i = 0; i < r.timestamp.length; i++) {
          const o = num(q.open && q.open[i]), h = num(q.high && q.high[i]);
          const l = num(q.low && q.low[i]), c = num(q.close && q.close[i]);
          // Yahoo leaves nulls in these arrays for halted or untraded periods. Skip them rather
          // than carrying the previous bar forward, which would invent a trade that never was.
          if (o == null || h == null || l == null || c == null) continue;
          const t = new Date(r.timestamp[i] * 1000);
          const iso = t.toISOString();
          out.push({ t: interval === '1day' || interval === '1week' || interval === '1month' ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' '), o, h, l, c, v: num(q.volume && q.volume[i]) || 0 });
        }
        if (!out.length) return null;
        return { interval, tz: (r.meta && r.meta.exchangeTimezoneName) || 'UTC', bars: out };
      },
      search(d) {
        return ((d && d.quotes) || []).filter((x) => x.symbol).map((x) => ({
          symbol: x.symbol, name: x.shortname || x.longname || '', type: x.typeDisp || x.quoteType || '',
          region: x.exchDisp || '', currency: '',
        }));
      },
    },

    mock: {
      error(d) { return d && d.error ? String(d.error) : ''; },
      quote(d, symbol) {
        if (d.price == null) return null;
        return {
          symbol: d.symbol || symbol, price: num(d.price), open: num(d.open), high: num(d.high),
          low: num(d.low), volume: num(d.volume), prevClose: num(d.prevClose),
          change: num(d.change), changePct: num(d.changePct), currency: d.currency || 'USD',
          asOf: d.asOf || null, asOfText: d.asOfText || '', kind: d.kind || 'eod',
          marketStatus: d.marketStatus || 'unknown', name: d.name || null,
        };
      },
      series(d, interval) { return d.bars ? { interval, tz: d.tz || 'UTC', bars: d.bars } : null; },
      search(d) { return d.results || []; },
    },
  };

  /* ---------------------------------------------------------------------------
   * Public calls
   * ------------------------------------------------------------------------- */
  function ttl() {
    // With the market shut there is nothing new to learn, so we ask far less often.
    const anyOpen = [...quoteCache.values()].some((q) => q.marketStatus === 'open');
    return anyOpen ? cfg.quoteTtlOpen : cfg.quoteTtlClosed;
  }

  async function quote(symbol, opts) {
    const sym = String(symbol || '').toUpperCase();
    if (!sym) return null;
    const force = !!(opts && opts.force);
    const have = quoteCache.get(sym);
    if (have && !force && now() - have.fetchedAt < ttl()) return have;
    if (inflight.has('q:' + sym)) return inflight.get('q:' + sym);

    const p = (async () => {
      const r = await call('quote', { symbol: sym });
      // Nothing came back. The previous quote, if any, stays in the cache so the UI can show it
      // explicitly as stale; what we must not do is hand back a fresh-looking price.
      if (!r) return null;
      const q = adapters[r.provider].quote(r.data, sym);
      if (!q) { fail('empty', `${PROVIDERS[r.provider].name} returned no price for ${sym}. The symbol may not be covered by your plan.`); return null; }
      q.provider = r.provider;
      q.fetchedAt = now();
      // A provider's own freshness claim beats our assumption about its plan.
      if (opts && opts.kind) q.kind = opts.kind;
      if (q.change == null && q.prevClose != null) q.change = q.price - q.prevClose;
      if (q.changePct == null && q.prevClose) q.changePct = (q.price / q.prevClose - 1) * 100;
      quoteCache.set(sym, q);
      emit();
      return q;
    })().finally(() => inflight.delete('q:' + sym));

    inflight.set('q:' + sym, p);
    return p;
  }

  /*
   * Several symbols at once. Deliberately sequential with a small gap: a watchlist of twenty names
   * fired off in parallel is exactly how a free-tier key gets throttled or banned. The callback
   * fires per symbol so the UI can fill in as they land.
   */
  async function quotes(symbols, onEach) {
    const out = {};
    for (const s of symbols) {
      const lim = limits();
      if (lim.roomMin === 0 || lim.roomDay === 0) {
        // Stop rather than queue up failures -- but say so, so the UI can show which symbols went
        // unpriced instead of quietly leaving them blank.
        fail('ratelimit-local', `Stopped after ${Object.keys(out).length} of ${symbols.length} symbols: the ${lim.roomDay === 0 ? 'daily' : 'per-minute'} request limit is used up. The rest are not priced yet.`);
        break;
      }
      const q = await quote(s);
      out[String(s).toUpperCase()] = q;
      if (onEach) { try { onEach(String(s).toUpperCase(), q); } catch (e) { /* ignore */ } }
      await sleep(120);
    }
    return out;
  }

  async function series(symbol, opts) {
    const sym = String(symbol || '').toUpperCase();
    const interval = (opts && opts.interval) || '1day';
    const key = sym + '|' + interval;
    const have = seriesCache.get(key);
    if (have && now() - have.at < cfg.seriesTtl && !(opts && opts.force)) return have.series;
    if (inflight.has('s:' + key)) return inflight.get('s:' + key);

    const p = (async () => {
      const r = await call('series', { symbol: sym, interval, outputsize: (opts && opts.outputsize) || 500 });
      if (!r) return null;
      const s = adapters[r.provider].series(r.data, interval);
      if (!s) { fail('empty', `${PROVIDERS[r.provider].name} returned no history for ${sym} at ${interval}.`); return null; }
      s.symbol = sym;
      s.provider = r.provider;
      s.fetchedAt = now();
      seriesCache.set(key, { at: now(), series: s });
      emit();
      return s;
    })().finally(() => inflight.delete('s:' + key));

    inflight.set('s:' + key, p);
    return p;
  }

  async function search(q) {
    const term = String(q || '').trim();
    if (term.length < 1) return [];
    const k = term.toLowerCase();
    if (searchCache.has(k)) return searchCache.get(k);
    const r = await call('search', { q: term });
    if (!r) return null;                       // null means "we could not ask", not "no matches"
    const list = adapters[r.provider].search(r.data) || [];
    searchCache.set(k, list);
    return list;
  }

  /*
   * Which intervals are actually available. The requirements are firm that intraday candles should
   * appear only where the provider supports them, so this is the single source of that answer and
   * the UI asks rather than assuming.
   */
  function intervals() {
    const p = PROVIDERS[cfg.provider];
    if (!p) return ['1day'];
    return (p.intraday ? p.intervals : []).concat(['1day', '1week', '1month']);
  }

  function configure(next) {
    const before = cfg.endpoint + '|' + cfg.provider + '|' + cfg.mode + '|' + (cfg.key ? 'k' : '');
    cfg = Object.assign({}, cfg, next || {});
    if (cfg.provider && !PROVIDERS[cfg.provider]) cfg.provider = '';
    cfg.endpoint = String(cfg.endpoint || '').trim();
    if (before !== cfg.endpoint + '|' + cfg.provider + '|' + cfg.mode + '|' + (cfg.key ? 'k' : '')) {
      // A different endpoint is a different world: nothing cached about the old one is valid, and
      // a different key gets its own request budget.
      clear();
      budgets.clear();
    }
    emit();
    return cfg;
  }

  function clear() {
    quoteCache.clear(); seriesCache.clear(); searchCache.clear();
    breaker.fails = 0; breaker.openUntil = 0;
    lastError = null;
  }

  function state() {
    const p = PROVIDERS[cfg.provider] || null;
    return {
      configured: cfg.mode === 'direct' ? !!(cfg.key && p && p.direct) : !!cfg.endpoint,
      mode: cfg.mode,
      direct: cfg.mode === 'direct',
      // Never the key itself, only whether there is one.
      hasKey: !!cfg.key,
      endpoint: cfg.endpoint,
      provider: cfg.provider,
      providerName: p ? p.name : (cfg.provider || 'not identified yet'),
      delayNote: p ? p.delayNote : '',
      kind: p ? p.kind : 'unknown',
      lastOk,
      lastOkText: lastOk ? agoText(now() - lastOk) : '',
      lastError,
      // True once the browser has told us a request was refused by policy rather than by network.
      blocked: recentlyBlocked(),
      framed,
      paused: now() < breaker.openUntil,
      pausedFor: Math.max(0, Math.ceil((breaker.openUntil - now()) / 1000)),
      limits: limits(),
      symbols: quoteCache.size,
      // Shown verbatim in the UI's data-source notice.
      attribution: p && p.id !== 'mock' ? `Market data by ${p.name}.` : '',
    };
  }

  window.Quotes = {
    PROVIDERS, FRESHNESS,
    configure,
    // The key is deliberately not included: nothing outside this module needs to read it back.
    config: () => { const c = Object.assign({}, cfg); delete c.key; return c; },
    quote, quotes, series, search,
    cached: (s) => quoteCache.get(String(s || '').toUpperCase()) || null,
    cachedSeries: (s, i) => { const r = seriesCache.get(String(s || '').toUpperCase() + '|' + (i || '1day')); return r ? r.series : null; },
    freshness, intervals, state, clear,
    // Anything about to be shown to the player goes through this first, so a key
    // typed into this browser never reaches the screen, a log or a copied message.
    redact: scrub,
    onUpdate: (fn) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    // exposed for the test suite
    _adapters: adapters, _sniff: sniff, _resetLimits: () => budgets.clear(),
  };
})();
