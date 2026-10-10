/* Small canvas chart helpers: a line/area chart with hover readout, and a bar chart. */
(function () {
  'use strict';

  function tokens() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return { fg: g('--fg'), muted: g('--muted'), line: g('--line'), accent: g('--accent'), gain: g('--gain'), loss: g('--loss'), b: g('--chart-b'), surface: g('--surface'), mono: g('--f-mono'), buy: g('--buy') || g('--accent'), sell: g('--sell') || g('--loss') };
  }

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentNode.clientWidth;
    const h = +canvas.getAttribute('height') || 200;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function niceTicks(min, max, count) {
    const span = max - min || Math.abs(max) || 1;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
    const lo = Math.ceil(min / step) * step;
    const out = [];
    for (let v = lo; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }

  function shortDate(s) {
    const [y, m, d] = s.split('-');
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1];
    return `${+d} ${mon} ${y.slice(2)}`;
  }

  /*
   * opts: { labels: [date strings], series: [{ values, color, fill }], fmt: v => string, hover: bool }
   */
  function line(canvas, opts) {
    canvas._opts = opts;
    draw(canvas, null);
    if (!canvas._bound) {
      canvas._bound = true;
      const move = (e) => {
        const r = canvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        draw(canvas, x);
      };
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('touchmove', move, { passive: true });
      canvas.addEventListener('mouseleave', () => draw(canvas, null));
      canvas.addEventListener('touchend', () => draw(canvas, null));
    }
  }

  function draw(canvas, hoverX) {
    const opts = canvas._opts;
    if (!opts) return;
    const T = tokens();
    const { ctx, w, h } = setup(canvas);
    const series = opts.series.filter((s) => s.values && s.values.length);
    if (!series.length) return;
    const n = series[0].values.length;
    let min = Infinity, max = -Infinity;
    for (const s of series) for (const v of s.values) { if (v < min) min = v; if (v > max) max = v; }
    if (min === max) { min -= Math.abs(min) * 0.01 || 1; max += Math.abs(max) * 0.01 || 1; }
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;

    ctx.font = `11px ${T.mono}`;
    const ticks = niceTicks(min, max, 4);
    const labelW = Math.max(...ticks.map((t) => ctx.measureText(opts.fmt(t)).width)) + 10;
    const L = 4, R = w - labelW, Top = 22, B = h - 22;
    const xAt = (i) => L + (n <= 1 ? 0 : (i / (n - 1)) * (R - L));
    const yAt = (v) => B - ((v - min) / (max - min)) * (B - Top);

    // grid + y labels
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.fillStyle = T.muted;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const t of ticks) {
      const y = Math.round(yAt(t)) + 0.5;
      if (y < Top - 4 || y > B + 4) continue;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.fillText(opts.fmt(t), R + 6, y);
    }
    // x labels
    const lab = opts.labelFmt || shortDate;
    if (opts.labels && n > 1) {
      ctx.textBaseline = 'alphabetic';
      const count = Math.min(4, n);
      for (let k = 0; k < count; k++) {
        const i = Math.round((k / (count - 1 || 1)) * (n - 1));
        ctx.textAlign = k === 0 ? 'left' : k === count - 1 ? 'right' : 'center';
        ctx.fillText(lab(opts.labels[i]), Math.min(Math.max(xAt(i), L), R), h - 5);
      }
    }

    // series (last drawn on top, so draw in reverse)
    for (let si = series.length - 1; si >= 0; si--) {
      const s = series[si];
      const col = s.color || T.accent;
      ctx.beginPath();
      s.values.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v))));
      if (s.fill) {
        ctx.save();
        ctx.lineTo(xAt(s.values.length - 1), B);
        ctx.lineTo(xAt(0), B);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, Top, 0, B);
        grad.addColorStop(0, hexA(col, 0.22));
        grad.addColorStop(1, hexA(col, 0));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        s.values.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v))));
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = s.width || 1.8;
      ctx.lineJoin = 'round';
      ctx.setLineDash(s.dash || []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // endpoint
    const main = series[0];
    const lx = xAt(n - 1), ly = yAt(main.values[n - 1]);
    ctx.fillStyle = main.color || T.accent;
    ctx.beginPath(); ctx.arc(lx, ly, 3.2, 0, Math.PI * 2); ctx.fill();

    // hover readout
    if (hoverX != null && n > 1) {
      const i = Math.max(0, Math.min(n - 1, Math.round(((hoverX - L) / (R - L)) * (n - 1))));
      const x = xAt(i);
      ctx.strokeStyle = T.muted;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x + 0.5, Top - 6); ctx.lineTo(x + 0.5, B); ctx.stroke();
      ctx.setLineDash([]);
      let text = opts.labels ? lab(opts.labels[i]) + '   ' : '';
      series.forEach((s, k) => {
        const v = s.values[i];
        ctx.fillStyle = s.color || T.accent;
        ctx.beginPath(); ctx.arc(x, yAt(v), 3.5, 0, Math.PI * 2); ctx.fill();
        text += (k ? '   ' + (s.name || '') + ' ' : (s.name ? s.name + ' ' : '')) + opts.fmt(v);
      });
      ctx.font = `12px ${T.mono}`;
      ctx.fillStyle = T.fg;
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(text).width;
      ctx.textAlign = 'left';
      ctx.fillText(text, Math.max(L, Math.min(x - tw / 2, R - tw)), 2);
    }
  }

  function bars(canvas, opts) {
    const T = tokens();
    const { ctx, w, h } = setup(canvas);
    const vals = opts.values;
    const n = vals.length;
    const max = Math.max(...vals, 0);
    ctx.font = `11px ${T.mono}`;
    const ticks = niceTicks(0, max || 1, 3);
    const tickStep = ticks.length > 1 ? ticks[1] - ticks[0] : ticks[0] || 1;
    while (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + tickStep).toFixed(10)));
    const labelW = Math.max(...ticks.map((t) => ctx.measureText(opts.fmt(t)).width)) + 10;
    const L = 4, R = w - labelW, Top = 12, B = h - 22;
    const top = ticks[ticks.length - 1] || 1;
    const yAt = (v) => B - (v / Math.max(top, max)) * (B - Top);
    ctx.strokeStyle = T.line; ctx.fillStyle = T.muted; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const t of ticks) {
      const y = Math.round(yAt(t)) + 0.5;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.fillText(opts.fmt(t), R + 6, y);
    }
    const slot = (R - L) / n;
    const bw = Math.max(2, Math.min(36, slot * 0.62));
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    vals.forEach((v, i) => {
      const x = L + slot * i + (slot - bw) / 2;
      const y = yAt(v);
      ctx.fillStyle = i === n - 1 ? T.accent : hexA(T.accent, 0.55);
      if (v > 0) { roundRect(ctx, x, y, bw, B - y, 3); ctx.fill(); }
      ctx.fillStyle = T.muted;
      const every = Math.ceil(n / 12);
      if ((n - 1 - i) % every === 0) ctx.fillText(opts.labels[i], x + bw / 2, h - 5);
    });
  }

  /*
   * Candlestick (or line) price chart with a volume histogram underneath.
   * opts: { o, h, l, c, v, labels, type: 'candles'|'line', fmt }
   */
  function candles(canvas, opts) {
    canvas._copts = opts;
    drawCandles(canvas, null);
    if (!canvas._cbound) {
      canvas._cbound = true;
      const move = (e) => {
        const r = canvas.getBoundingClientRect();
        drawCandles(canvas, (e.touches ? e.touches[0].clientX : e.clientX) - r.left);
      };
      canvas.addEventListener('mousemove', move);
      canvas.addEventListener('touchmove', move, { passive: true });
      canvas.addEventListener('mouseleave', () => drawCandles(canvas, null));
      canvas.addEventListener('touchend', () => drawCandles(canvas, null));
    }
  }

  function drawCandles(canvas, hoverX) {
    const d = canvas._copts;
    if (!d || !d.c.length) return;
    const T = tokens();
    const { ctx, w, h } = setup(canvas);
    const n = d.c.length;
    const line = d.type === 'line';
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      const lo = line ? d.c[i] : d.l[i], hi = line ? d.c[i] : d.h[i];
      if (lo < min) min = lo; if (hi > max) max = hi;
    }
    if (min === max) { min *= 0.99; max *= 1.01; }
    const pad = (max - min) * 0.06; min -= pad; max += pad;

    ctx.font = `11px ${T.mono}`;
    const ticks = niceTicks(min, max, 5);
    const labelW = Math.max(...ticks.map((t) => ctx.measureText(d.fmt(t)).width), ctx.measureText(d.fmt(d.c[n - 1])).width) + 16;
    const L = 4, R = w - labelW, Top = 24, XB = h - 20;
    const volH = Math.max(36, Math.round(h * 0.18));
    const PB = XB - volH - 10;
    const slot = (R - L) / n;
    const xAt = (i) => L + slot * (i + 0.5);
    const yAt = (v) => PB - ((v - min) / (max - min)) * (PB - Top);
    const bw = Math.max(1, Math.min(9, slot * 0.62));

    // grid and price axis
    ctx.lineWidth = 1; ctx.strokeStyle = T.line; ctx.fillStyle = T.muted; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const t of ticks) {
      const y = Math.round(yAt(t)) + 0.5;
      if (y < Top - 4 || y > PB + 4) continue;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke();
      ctx.fillText(d.fmt(t), R + 8, y);
    }
    ctx.beginPath(); ctx.moveTo(L, XB - volH - 4.5); ctx.lineTo(R, XB - volH - 4.5); ctx.stroke();

    // price
    if (line) {
      ctx.beginPath();
      d.c.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v))));
      ctx.save();
      ctx.lineTo(xAt(n - 1), PB); ctx.lineTo(xAt(0), PB); ctx.closePath();
      const grad = ctx.createLinearGradient(0, Top, 0, PB);
      grad.addColorStop(0, hexA(T.accent, 0.25)); grad.addColorStop(1, hexA(T.accent, 0));
      ctx.fillStyle = grad; ctx.fill(); ctx.restore();
      ctx.beginPath();
      d.c.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v))));
      ctx.strokeStyle = T.accent; ctx.lineWidth = 1.6; ctx.stroke();
    } else {
      for (let i = 0; i < n; i++) {
        const up = d.c[i] >= d.o[i];
        const col = up ? T.gain : T.loss;
        const x = Math.round(xAt(i)) + 0.5;
        ctx.strokeStyle = col; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, yAt(d.h[i])); ctx.lineTo(x, yAt(d.l[i])); ctx.stroke();
        const y1 = yAt(Math.max(d.o[i], d.c[i])), y2 = yAt(Math.min(d.o[i], d.c[i]));
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x - bw / 2), Math.round(y1), Math.max(1, Math.round(bw)), Math.max(1, Math.round(y2 - y1)));
      }
    }

    // volume
    const vmax = Math.max(...d.v) || 1;
    for (let i = 0; i < n; i++) {
      const up = d.c[i] >= (i ? d.c[i - 1] : d.o[i]);
      const vh = (d.v[i] / vmax) * volH;
      ctx.fillStyle = hexA(up ? T.buy : T.sell, 0.85);
      ctx.fillRect(Math.round(xAt(i) - bw / 2), XB - vh, Math.max(1, Math.round(bw)), vh);
    }

    // dates
    ctx.fillStyle = T.muted; ctx.textBaseline = 'alphabetic';
    const count = Math.min(5, n);
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / (count - 1 || 1)) * (n - 1));
      ctx.textAlign = k === 0 ? 'left' : k === count - 1 ? 'right' : 'center';
      ctx.fillText(shortDate(d.labels[i]), Math.min(Math.max(xAt(i), L), R), h - 5);
    }

    // last price marker on the axis
    const last = d.c[n - 1];
    const ly = Math.round(yAt(last)) + 0.5;
    const lastUp = n < 2 || last >= d.c[n - 2];
    const lc = lastUp ? T.gain : T.loss;
    ctx.setLineDash([2, 3]); ctx.strokeStyle = lc;
    ctx.beginPath(); ctx.moveTo(L, ly); ctx.lineTo(R, ly); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = lc;
    ctx.fillRect(R + 2, ly - 9, labelW - 4, 18);
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `600 11px ${T.mono}`;
    ctx.fillText(d.fmt(last), R + 7, ly);

    // hover readout
    ctx.font = `11px ${T.mono}`;
    const idx = hoverX == null ? n - 1 : Math.max(0, Math.min(n - 1, Math.floor((hoverX - L) / slot)));
    if (hoverX != null) {
      const x = Math.round(xAt(idx)) + 0.5;
      ctx.strokeStyle = T.muted; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, Top - 4); ctx.lineTo(x, XB); ctx.stroke(); ctx.setLineDash([]);
    }
    const parts = line
      ? [shortDate(d.labels[idx]), 'Close ' + d.fmt(d.c[idx])]
      : [shortDate(d.labels[idx]), 'O ' + d.fmt(d.o[idx]), 'H ' + d.fmt(d.h[idx]), 'L ' + d.fmt(d.l[idx]), 'C ' + d.fmt(d.c[idx])];
    const chg = idx ? d.c[idx] / d.c[idx - 1] - 1 : 0;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    let x = L + 2;
    parts.forEach((p, k) => { ctx.fillStyle = k ? T.fg : T.muted; ctx.fillText(p, x, 5); x += ctx.measureText(p).width + 12; });
    ctx.fillStyle = chg >= 0 ? T.gain : T.loss;
    ctx.fillText((chg >= 0 ? '+' : '') + (chg * 100).toFixed(2) + '%', x, 5);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function hexA(col, a) {
    const m = /^#([0-9a-f]{6})$/i.exec(col.trim());
    if (!m) return col;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function sparkSVG(vals, up) {
    const w = 84, h = 24;
    let min = Infinity, max = -Infinity;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; }
    const span = max - min || 1;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(' ');
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(${up ? '--gain' : '--loss'})" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  }

  window.Charts = { line, bars, candles, sparkSVG, shortDate };
})();
