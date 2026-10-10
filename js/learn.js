/*
 * Learn tab: illustrated lessons on reading charts (trends, support and resistance,
 * moving averages, volume) with a quiz each, plus a "spot the trend" practice game
 * that uses the simulator's own price history.
 */
(function () {
  'use strict';

  const E = window.Engine;

  /* ---------- trend detection (shared with the main chart) ---------- */
  function sma(values, n) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= n) sum -= values[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  /*
   * Classify a run of closing prices as an uptrend, downtrend or sideways market from
   * the size of the move relative to its noise, where price sits against its 50-day
   * average, and whether highs and lows have been stepping up or down.
   */
  function trendOf(closes) {
    const n = closes.length;
    if (n < 30) return null;
    const first = closes[0], last = closes[n - 1];
    let s = 0, s2 = 0;
    for (let i = 1; i < n; i++) { const r = Math.log(closes[i] / closes[i - 1]); s += r; s2 += r * r; }
    const sd = Math.sqrt(Math.max(s2 / (n - 1) - Math.pow(s / (n - 1), 2), 1e-10)) * Math.sqrt(n - 1);
    const z = Math.log(last / first) / sd;
    const ma = sma(closes, Math.min(50, n));
    const ma50 = ma[n - 1];
    const third = Math.floor(n / 3);
    const seg = [closes.slice(0, third), closes.slice(third, 2 * third), closes.slice(2 * third)];
    const hi = seg.map((a) => Math.max(...a)), lo = seg.map((a) => Math.min(...a));
    const hh = hi[2] > hi[1] && hi[1] > hi[0], hl = lo[2] > lo[1] && lo[1] > lo[0];
    const lh = hi[2] < hi[1] && hi[1] < hi[0], ll = lo[2] < lo[1] && lo[1] < lo[0];
    let kind = 'sideways';
    // A trend needs a move that is large for this security (z) and large in absolute terms.
    if (z > 0.8 && last > ma50 && last / first - 1 > 0.03) kind = 'up';
    else if (z < -0.8 && last < ma50 && last / first - 1 < -0.03) kind = 'down';
    return { kind, z, ret: last / first - 1, aboveMA: last > ma50, hh, hl, lh, ll };
  }

  function trendText(t) {
    const pct = Math.abs(t.ret * 100).toFixed(1);
    const ma = `it is ${t.aboveMA ? 'above' : 'below'} its 50-day average`;
    if (t.kind === 'up') {
      return `The price rose ${pct}% over six months${t.hh && t.hl ? ', made higher highs and higher lows,' : t.hl ? ', with each dip stopping higher than the last,' : ''} and ${ma}.`;
    }
    if (t.kind === 'down') {
      return `The price fell ${pct}% over six months${t.lh && t.ll ? ', made lower highs and lower lows,' : t.lh ? ', with each bounce failing lower than the last,' : ''} and ${ma}.`;
    }
    return `The price only ${t.ret >= 0 ? 'rose' : 'fell'} ${pct}% over six months, which is small next to its normal ups and downs, so there is no clear staircase up or down. Right now ${ma}.`;
  }
  const TREND_LABEL = { up: 'Uptrend', down: 'Downtrend', sideways: 'Sideways' };

  /* ---------- synthetic example charts ---------- */
  function rng(seed) { let r = seed; return () => { r = (r * 16807) % 2147483647; return r / 2147483647; }; }

  // A price path through the given swing points, with a little noise between them.
  function zig(pivots, noise, seed) {
    const r = rng(seed || 7);
    const n = pivots[pivots.length - 1][0] + 1;
    const out = new Array(n);
    for (let k = 0; k < pivots.length - 1; k++) {
      const [i1, p1] = pivots[k], [i2, p2] = pivots[k + 1];
      for (let i = i1; i < i2; i++) out[i] = p1 + (p2 - p1) * ((i - i1) / (i2 - i1));
    }
    out[n - 1] = pivots[pivots.length - 1][1];
    const fixed = new Set(pivots.map((p) => p[0]));
    return out.map((v, i) => (fixed.has(i) ? v : v * (1 + (r() - 0.5) * 2 * (noise || 0.006))));
  }
  function ohlc(c, seed) {
    const r = rng(seed || 11);
    const o = c.map((v, i) => (i ? c[i - 1] * (1 + (r() - 0.5) * 0.004) : v * 0.995));
    return {
      o, c,
      h: c.map((v, i) => Math.max(v, o[i]) * (1 + r() * 0.007)),
      l: c.map((v, i) => Math.min(v, o[i]) * (1 - r() * 0.007)),
    };
  }

  /* ---------- lessons ---------- */
  const UP_PIV = [[0, 100], [8, 112], [13, 105], [22, 122], [27, 114], [36, 134], [41, 125], [52, 148]];
  const DOWN_PIV = [[0, 148], [8, 134], [13, 141], [22, 122], [27, 130], [36, 112], [41, 119], [52, 100]];
  const SIDE_PIV = [[0, 104], [6, 114.5], [13, 101], [20, 114.8], [27, 100.6], [34, 114.4], [41, 101.2], [48, 114.2], [53, 108]];
  const BREAK_PIV = [[0, 101], [8, 110], [16, 101.5], [24, 110], [32, 102], [40, 109.5], [44, 104], [50, 121], [54, 111.5], [62, 130]];
  const MA_PIV = [[0, 130], [45, 100], [100, 150], [115, 142], [125, 147], [159, 112]];
  const PULL_PIV = [[0, 100], [14, 116], [20, 109], [36, 128], [43, 120], [60, 142], [67, 134], [80, 152]];
  const LONG_PIV = [[0, 100], [60, 140], [75, 132], [95, 158], [110, 110], [125, 118], [150, 150], [199, 190]];

  const LESSONS = [
    {
      id: 'candles', title: 'Reading a candlestick', mins: 2,
      figure: { custom: 'anatomy' },
      body: `<p>Each <b>candle</b> on a chart shows one trading day. It packs in four prices:</p>
        <ul><li><b>Open</b>: the first trade of the day</li><li><b>Close</b>: the last trade of the day</li><li><b>High</b> and <b>Low</b>: the most and least anyone paid</li></ul>
        <p>The thick part, the <b>body</b>, runs from the open to the close. The thin lines, the <b>wicks</b>, stretch to the high and low.</p>
        <p>A <b class="up">green</b> candle closed <i>higher</i> than it opened, so buyers won the day. A <b class="down">red</b> candle closed <i>lower</i>, so sellers won. A long body means a strong move; long wicks mean the price swung around a lot before settling.</p>`,
      points: ['One candle = one day', 'Green: closed above the open. Red: closed below it', 'Wicks show the day’s high and low'],
      quiz: { q: 'A green candle means the price…', options: ['closed higher than it opened that day', 'will go up tomorrow', 'paid a dividend that day'], answer: 0, why: 'Green only describes what already happened that day: the close was above the open. It says nothing certain about tomorrow.' },
    },
    {
      id: 'uptrend', title: 'Uptrends', mins: 2,
      figure: {
        make: () => ({ ...ohlc(zig(UP_PIV, 0.004, 3), 5) }), type: 'candles',
        lines: [{ a: [13, 105], b: [41, 125], color: 'gain', label: 'Trend line', extend: 11 }],
        marks: [[8, 'HH', 'up'], [22, 'HH', 'up'], [36, 'HH', 'up'], [52, 'HH', 'up'], [13, 'HL', 'down'], [27, 'HL', 'down'], [41, 'HL', 'down']],
        markColor: 'gain',
      },
      body: `<p>An <b>uptrend</b> is a market that keeps climbing, but never in a straight line. Prices rise, dip a little, then rise again.</p>
        <p>The tell-tale sign is a staircase of <b>higher highs (HH)</b> and <b>higher lows (HL)</b>: every peak beats the last peak, and every dip stops above the last dip.</p>
        <p>Join two or more of the lows and you get a <b>trend line</b>. While the price stays above it, the uptrend is intact. Many traders wait for a dip towards that line to buy, rather than chasing the price after a big jump.</p>`,
      points: ['Higher highs and higher lows', 'Dips are normal; they just stay above the last dip', 'A trend line under the lows shows where buyers keep stepping in'],
      quiz: { q: 'Which pattern defines an uptrend?', options: ['Lower highs and lower lows', 'Higher highs and higher lows', 'The same high and low every time'], answer: 1, why: 'In an uptrend each peak and each dip is higher than the one before.' },
    },
    {
      id: 'downtrend', title: 'Downtrends', mins: 2,
      figure: {
        make: () => ({ ...ohlc(zig(DOWN_PIV, 0.004, 9), 4) }), type: 'candles',
        lines: [{ a: [13, 141], b: [41, 119], color: 'loss', label: 'Trend line', extend: 11 }],
        marks: [[13, 'LH', 'up'], [27, 'LH', 'up'], [41, 'LH', 'up'], [8, 'LL', 'down'], [22, 'LL', 'down'], [36, 'LL', 'down'], [52, 'LL', 'down']],
        markColor: 'loss',
      },
      body: `<p>A <b>downtrend</b> is the mirror image: <b>lower highs (LH)</b> and <b>lower lows (LL)</b>. Each bounce runs out of steam below the last peak, and each drop goes further than the one before.</p>
        <p>A trend line drawn across the highs acts like a ceiling. Until the price breaks above it, rallies tend to fade.</p>
        <p>Beginners often buy because something “looks cheap” after a fall. Traders call that <b>catching a falling knife</b>. A stock that has halved can still halve again. It is safer to wait for signs the downtrend is over, such as a higher low.</p>`,
      points: ['Lower highs and lower lows', 'Bounces fail below the last peak', '“Cheap” can get cheaper: wait for the trend to turn'],
      quiz: { q: 'In a downtrend, each bounce usually…', options: ['fails below the previous high', 'goes higher than the previous high', 'turns into a dividend'], answer: 0, why: 'Lower highs are the signature of a downtrend: rallies give up before reaching the last peak.' },
    },
    {
      id: 'sideways', title: 'Sideways markets', mins: 2,
      figure: {
        make: () => ({ ...ohlc(zig(SIDE_PIV, 0.004, 21), 8) }), type: 'candles',
        hlines: [{ p: 114.6, color: 'loss', label: 'Resistance' }, { p: 100.8, color: 'gain', label: 'Support', below: true }],
      },
      body: `<p>Not every market is trending. Often the price bounces between a <b>floor</b> and a <b>ceiling</b> for weeks or months. That is a <b>sideways market</b>, also called a <b>range</b>.</p>
        <p>Near the bottom of the range, buyers think it is good value and step in. Near the top, sellers take profits. Neither side wins, so the price goes nowhere overall.</p>
        <p>Trend-following ideas don’t work well here. A range ends with a <b>breakout</b>: a clear move above the ceiling or below the floor.</p>`,
      points: ['No higher highs, no lower lows: just bouncing', 'Buyers defend the floor, sellers defend the ceiling', 'Ranges end with a breakout'],
      quiz: { q: 'In a sideways market, buyers usually step in near…', options: ['the ceiling (resistance)', 'the floor (support)', 'the exact middle'], answer: 1, why: 'The floor is where the price has repeatedly stopped falling, because buyers see value there.' },
    },
    {
      id: 'levels', title: 'Support and resistance', mins: 3,
      figure: {
        make: () => ({ ...ohlc(zig(BREAK_PIV, 0.004, 33), 6) }), type: 'candles',
        hlines: [{ p: 110, color: 'loss', label: 'Resistance', to: 49 }, { p: 101.2, color: 'gain', label: 'Support', to: 49, below: true }, { p: 110, color: 'gain', label: 'New support', from: 48, dash: true, below: true }],
        marks: [[50, 'Breakout', 'up'], [54, 'Retest', 'down']], markColor: 'accent',
      },
      body: `<p><b>Support</b> is a price where falls keep stopping. <b>Resistance</b> is a price where rises keep stopping. The more times a level holds, the more people notice it, and the more it matters.</p>
        <p>When the price finally pushes through resistance, that is a <b>breakout</b>. Something interesting often happens next: the price dips back to the old ceiling, finds buyers there, and bounces. <b>Old resistance becomes new support.</b> Traders call that dip a <b>retest</b>.</p>
        <p>Round numbers like $100 or $50 often act as support or resistance too, simply because so many people place orders at them. A stop order a little below support is a common way to limit losses if the level breaks.</p>`,
      points: ['Support = floor, resistance = ceiling', 'The more a level holds, the more it matters', 'Broken resistance often turns into support'],
      quiz: { q: 'After price breaks above resistance, that level often becomes…', options: ['new support', 'meaningless', 'stronger resistance'], answer: 0, why: 'Buyers who missed the breakout often buy on a dip back to the old ceiling, turning it into a floor.' },
    },
    {
      id: 'averages', title: 'Moving averages', mins: 3,
      figure: {
        make: () => { const c = zig(MA_PIV, 0.01, 41); return { c, overlays: [{ v: sma(c, 20), color: 'buy', label: '20-day average' }, { v: sma(c, 50), color: 'sell', label: '50-day average' }] }; },
        type: 'line', crosses: true,
      },
      body: `<p>A <b>moving average</b> smooths out the daily noise. The 20-day average is simply the average closing price of the last 20 days, recalculated every day.</p>
        <p>Quick rules of thumb:</p>
        <ul><li>Price <b>above</b> a rising average: the trend is up.</li><li>Price <b>below</b> a falling average: the trend is down.</li></ul>
        <p>Comparing a short average with a long one shows when the trend changes. When the short average crosses <i>above</i> the long one, that is a <b class="up">golden cross</b>, an early sign of a new uptrend. Crossing <i>below</i> is a <b class="down">death cross</b>. Big investors watch the 50-day and 200-day averages.</p>
        <p>Averages lag behind the price, so they confirm a trend rather than predict it. Turn them on in the Markets chart with the <b>Averages</b> button.</p>`,
      points: ['An average smooths out daily noise', 'Price above a rising average = uptrend', 'Golden cross: short average crosses above long. Death cross: below'],
      quiz: { q: 'When a 20-day average crosses above the 50-day average, traders call it a…', options: ['death cross', 'golden cross', 'stock split'], answer: 1, why: 'A golden cross means recent prices are now higher than the longer-term average: momentum has turned up.' },
    },
    {
      id: 'volume', title: 'Volume', mins: 2,
      figure: {
        make: () => {
          const d = ohlc(zig(BREAK_PIV, 0.004, 33), 6);
          const r = rng(99);
          d.v = d.c.map((_, i) => (i >= 45 && i <= 50 ? 150 + r() * 60 : 35 + r() * 30));
          return d;
        },
        type: 'candles', hlines: [{ p: 110, color: 'loss', label: 'Resistance', to: 49 }], marks: [[48, 'Big volume', 'up']], markColor: 'accent',
      },
      body: `<p><b>Volume</b> is how many shares changed hands. On the charts it is the bars along the bottom.</p>
        <p>Volume shows conviction. A breakout on <b>heavy</b> volume means lots of buyers agree, so it is more likely to last. A breakout on <b>light</b> volume can easily fizzle and fall back into the range.</p>
        <p>The same goes for falls. A drop on huge volume after bad news shows real selling. A drift lower on quiet volume is often just a lack of buyers for a while.</p>`,
      points: ['Volume = how much was traded', 'Big moves on big volume are more convincing', 'Quiet breakouts often fail'],
      quiz: { q: 'A breakout on very low volume is…', options: ['more convincing', 'less convincing', 'guaranteed to keep going'], answer: 1, why: 'Low volume means few traders took part, so the move has less support behind it.' },
    },
    {
      id: 'pullbacks', title: 'Pullbacks', mins: 2,
      figure: {
        make: () => { const d = ohlc(zig(PULL_PIV, 0.005, 51), 12); d.overlays = [{ v: sma(d.c, 20), color: 'buy', label: '20-day average' }]; return d; },
        type: 'candles', marks: [[20, 'Pullback', 'down'], [43, 'Pullback', 'down'], [67, 'Pullback', 'down']], markColor: 'accent',
      },
      body: `<p>A <b>pullback</b> is a short dip inside a bigger uptrend. Prices never rise every day: traders take profits, news wobbles, and the price eases back before the next leg up.</p>
        <p>In a healthy uptrend, pullbacks often stop near the last higher low, a support level, or a moving average like the 20-day.</p>
        <p>How to tell a pullback from a real reversal? A pullback holds above the last higher low. If the price breaks <i>below</i> that low, the staircase is broken and the uptrend may be over.</p>`,
      points: ['A pullback is a pause, not the end of the trend', 'They often stop at support or a moving average', 'Breaking the last higher low is the warning sign'],
      quiz: { q: 'A pullback in an uptrend is…', options: ['always the start of a crash', 'a short dip that doesn’t break the trend', 'when a company buys back shares'], answer: 1, why: 'Pullbacks are normal pauses. The trend is only in doubt if the dip breaks below the last higher low.' },
    },
    {
      id: 'investing', title: 'Trends and long-term investing', mins: 3,
      figure: {
        make: () => ({ c: zig(LONG_PIV, 0.012, 61) }), type: 'line',
        marks: [[95, 'Peak', 'up'], [110, 'Crash', 'down'], [150, 'Recovered', 'up']], markColor: 'accent',
      },
      body: `<p>Trends describe what <i>has</i> happened. They help you understand a chart, but nobody can reliably predict what comes next. Even the best uptrend ends one day.</p>
        <p>For long-term investors, a few ideas matter more than any single chart pattern:</p>
        <ul><li><b>Time in the market</b> beats timing the market. Over decades, broad markets have trended up despite crashes along the way.</li>
        <li><b>Diversify.</b> A fund like VOO or SCHD spreads your money across hundreds of companies.</li>
        <li><b>Dividends keep paying</b> through ups and downs, and reinvesting them buys more shares when prices are low.</li>
        <li><b>Don’t panic sell.</b> Selling after a crash locks in the loss and can mean missing the recovery.</li></ul>
        <p>Try it in the simulator: buy a broad fund, turn on reinvesting, skip ahead a few years, and see what happens through the bumps.</p>`,
      points: ['Trends describe the past, not the future', 'Diversify and think in years, not days', 'Selling in a panic often locks in losses'],
      quiz: { q: 'A chart trend tells you…', options: ['exactly what will happen next', 'what has been happening so far', 'nothing useful at all'], answer: 1, why: 'Trends are a description of past prices. They are useful context, not a guarantee.' },
    },
  ];

  /* ---------- drawing ---------- */
  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return { fg: g('--fg'), muted: g('--muted'), line: g('--line'), surface: g('--surface'), gain: g('--gain'), loss: g('--loss'), accent: g('--accent'), buy: g('--buy'), sell: g('--sell'), font: g('--f-body') };
  }
  function prep(canvas) {
    const dpr = window.devicePixelRatio || 1;
    if (!canvas.dataset.h) canvas.dataset.h = +canvas.getAttribute('height') || 260;
    const h = +canvas.dataset.h, w = canvas.clientWidth || 600;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }
  function pill(ctx, T, x, y, text, color) {
    ctx.font = `600 11px ${T.font}`;
    const tw = ctx.measureText(text).width + 10;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - tw / 2, y - 9, tw, 18, 4); else ctx.rect(x - tw / 2, y - 9, tw, 18);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  function drawAnatomy(canvas) {
    const T = tokens();
    const { ctx, w, h } = prep(canvas);
    const candle = (cx, up) => {
      const col = up ? T.gain : T.loss;
      const top = h * 0.12, bot = h * 0.88, b1 = h * (up ? 0.32 : 0.3), b2 = h * (up ? 0.7 : 0.72);
      const bw = Math.min(70, w * 0.1);
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx, bot); ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(cx - bw / 2, b1, bw, b2 - b1);
      const lab = (y, text) => {
        ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(cx + bw / 2 + 6, y); ctx.lineTo(cx + bw / 2 + 40, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = T.fg; ctx.font = `500 13px ${T.font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, cx + bw / 2 + 46, y);
      };
      lab(top, 'High');
      lab(b1, up ? 'Close' : 'Open');
      lab(b2, up ? 'Open' : 'Close');
      lab(bot, 'Low');
      ctx.fillStyle = col; ctx.font = `600 14px ${T.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(up ? 'Green: price went up' : 'Red: price went down', cx + 30, h - 4);
    };
    candle(w * 0.22, true);
    candle(w * 0.64, false);
  }

  function drawFigure(canvas, fig, opts) {
    const plain = opts && opts.plain;
    if (fig.custom === 'anatomy') return drawAnatomy(canvas);
    const T = tokens();
    const d = fig.make();
    const { ctx, w, h } = prep(canvas);
    const n = d.c.length;
    const hasVol = !!d.v;
    let min = Infinity, max = -Infinity;
    const take = (v) => { if (v != null) { if (v < min) min = v; if (v > max) max = v; } };
    (fig.type === 'candles' ? d.l.concat(d.h) : d.c).forEach(take);
    (d.overlays || []).forEach((o) => o.v.forEach(take));
    (fig.hlines || []).forEach((l) => take(l.p));
    const pad = (max - min) * 0.12; min -= pad; max += pad;
    const L = 10, R = w - 12, T0 = 22, B = h - (hasVol ? 64 : 14);
    const slot = (R - L) / n;
    const x = (i) => L + slot * (i + 0.5);
    const y = (p) => B - ((p - min) / (max - min)) * (B - T0);
    const C = (name) => T[name] || name;

    ctx.strokeStyle = T.line; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const yy = Math.round(T0 + (B - T0) * k / 4) + 0.5; ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(R, yy); ctx.stroke(); }

    if (fig.type === 'candles') {
      const bw = Math.max(2, Math.min(10, slot * 0.6));
      for (let i = 0; i < n; i++) {
        const col = d.c[i] >= d.o[i] ? T.gain : T.loss;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
        const xx = Math.round(x(i)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, y(d.h[i])); ctx.lineTo(xx, y(d.l[i])); ctx.stroke();
        const y1 = y(Math.max(d.o[i], d.c[i])), y2 = y(Math.min(d.o[i], d.c[i]));
        ctx.fillRect(xx - bw / 2, y1, bw, Math.max(1, y2 - y1));
      }
    } else {
      ctx.strokeStyle = T.fg; ctx.lineWidth = 1.8; ctx.beginPath();
      d.c.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.stroke();
    }

    // moving averages and their crossings
    (d.overlays || []).forEach((o) => {
      ctx.strokeStyle = C(o.color); ctx.lineWidth = 2; ctx.beginPath();
      let started = false;
      o.v.forEach((v, i) => { if (v == null) return; if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v)); });
      ctx.stroke();
    });
    if (fig.crosses && d.overlays && d.overlays.length > 1) {
      const a = d.overlays[0].v, b = d.overlays[1].v;
      for (let i = 1; i < n; i++) {
        if (a[i] == null || b[i] == null || a[i - 1] == null || b[i - 1] == null) continue;
        const was = a[i - 1] - b[i - 1], now = a[i] - b[i];
        if (was <= 0 && now > 0) { ctx.fillStyle = T.gain; ctx.beginPath(); ctx.arc(x(i), y(a[i]), 5, 0, 7); ctx.fill(); pill(ctx, T, x(i), y(a[i]) + 22, 'Golden cross', T.gain); }
        if (was >= 0 && now < 0) { ctx.fillStyle = T.loss; ctx.beginPath(); ctx.arc(x(i), y(a[i]), 5, 0, 7); ctx.fill(); pill(ctx, T, x(i), y(a[i]) - 22, 'Death cross', T.loss); }
      }
    }

    // horizontal levels
    (plain ? [] : fig.hlines || []).forEach((l) => {
      const x1 = l.from != null ? x(l.from) : L, x2 = l.to != null ? x(l.to) : R;
      const yy = Math.round(y(l.p)) + 0.5;
      ctx.strokeStyle = C(l.color); ctx.lineWidth = 2; ctx.setLineDash(l.dash ? [6, 4] : []);
      ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x2, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C(l.color); ctx.font = `600 12px ${T.font}`; ctx.textBaseline = l.below ? 'top' : 'bottom';
      ctx.textAlign = l.from != null ? 'right' : 'left';
      ctx.fillText(l.label, l.from != null ? x2 : x1 + 4, l.below ? yy + 5 : yy - 4);
    });

    // trend lines
    (plain ? [] : fig.lines || []).forEach((l) => {
      const slope = (l.b[1] - l.a[1]) / (l.b[0] - l.a[0]);
      const endI = l.b[0] + (l.extend || 0);
      ctx.strokeStyle = C(l.color); ctx.lineWidth = 2; ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(x(l.a[0]), y(l.a[1])); ctx.lineTo(x(endI), y(l.b[1] + slope * (endI - l.b[0]))); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C(l.color); ctx.font = `600 12px ${T.font}`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(l.label, x(endI), y(l.b[1] + slope * (endI - l.b[0])) + 6);
    });

    // swing labels
    (plain ? [] : fig.marks || []).forEach(([i, label, pos]) => {
      const above = pos === 'up';
      const p = fig.type === 'candles' ? (above ? d.h[i] : d.l[i]) : d.c[i];
      pill(ctx, T, x(i), y(p) + (above ? -16 : 16), label, C(fig.markColor || 'accent'));
    });

    // overlay legend
    if (d.overlays) {
      let lx = L + 4;
      ctx.font = `500 12px ${T.font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      d.overlays.forEach((o) => { ctx.fillStyle = C(o.color); ctx.fillRect(lx, 9, 14, 3); ctx.fillStyle = T.muted; ctx.fillText(o.label, lx + 19, 11); lx += ctx.measureText(o.label).width + 40; });
    }

    // volume bars
    if (hasVol) {
      const vmax = Math.max(...d.v), vb = h - 8, vh = 46;
      const bw = Math.max(2, Math.min(10, slot * 0.6));
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = d.c[i] >= d.o[i] ? T.buy : T.sell;
        const bh = (d.v[i] / vmax) * vh;
        ctx.fillRect(x(i) - bw / 2, vb - bh, bw, bh);
      }
      ctx.fillStyle = T.muted; ctx.font = `500 11px ${T.font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('Volume', L + 2, vb - vh - 2);
    }
  }

  /* ---------- chart questions for Quant Academy ---------- */
  const FIGS = Object.fromEntries(LESSONS.map((l) => [l.id, l.figure]));

  // A "what is the trend?" question built from a real product's last six months in the simulator.
  function trendQuestion(r) {
    const s = E.S;
    const rand = r || Math.random;
    const pool = E.U.filter((m) => ['Stock', 'ETF', 'REIT', 'International', 'UK Share'].includes(m.type) && !m.track && m.vol >= 0.1);
    const want = ['up', 'down', 'sideways'][Math.floor(rand() * 3)];
    let found = null;
    for (let tries = 0; tries < 400 && !found; tries++) {
      const m = pool[Math.floor(rand() * pool.length)];
      const h = s.sec[m.t].h.slice(-126);
      const t = trendOf(h);
      if (!t) continue;
      const clear = t.kind === 'sideways' ? Math.abs(t.z) < 0.35 : Math.abs(t.z) > 1.4 && Math.abs(t.ret) > 0.08;
      if (clear && (t.kind === want || tries > 250)) found = { m, h, t };
    }
    if (!found) { const h = s.sec.SPY.h.slice(-126); found = { m: E.BY.SPY, h, t: trendOf(h) }; }
    const order = ['up', 'sideways', 'down'];
    return {
      q: 'Six months of a real product from the simulator. What is its trend?',
      chart: found.h,
      opts: ['Uptrend', 'Sideways', 'Downtrend'], a: order.indexOf(found.t.kind),
      why: `This is ${found.m.t} (${found.m.n}). ${trendText(found.t)}`,
    };
  }

  window.Learn = { trendOf, sma, TREND_LABEL, FIGS, LESSONS, drawFigure, trendQuestion, trendText };
})();
