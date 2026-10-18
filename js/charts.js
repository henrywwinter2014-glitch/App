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
    // Remember the CSS height from the markup once: setting canvas.height below rewrites the
    // attribute to the device-pixel size, and reading that back would grow the chart on every redraw.
    if (!canvas.dataset.h) canvas.dataset.h = +canvas.getAttribute('height') || 200;
    const h = +canvas.dataset.h;
    const cs = getComputedStyle(canvas);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const w = (canvas.clientWidth || canvas.parentNode.clientWidth) - padX;
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

  // Time axis: each bar is a 5-minute slot in a 9:30-16:00 session, the last bar closing at 16:00.
  const SESSION_OPEN = 9 * 60 + 30, SLOTS = 78;
  const barMinute = (i, n) => SESSION_OPEN + 5 * (SLOTS - 1 - ((n - 1 - i) % SLOTS));
  const hhmm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

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
   * opts: { o, h, l, c, v, labels, type: 'candles'|'line', fmt, timeAxis }
   * timeAxis: label the bottom axis in 5-minute steps instead of dates.
   * drawings: [{ type: 'pen'|'line'|'hline', color, pts: [{ x: bar index (may be fractional), p: price }] }]
   * trades: [{ x: bar index, p: price, side: 'buy'|'sell', tag: e.g. '+8.4%' (sells), text: hover detail }]
   */
  function candles(canvas, opts) {
    canvas._copts = opts;
    drawCandles(canvas, null);
    if (!canvas._cbound) {
      canvas._cbound = true;
      const move = (e) => {
        if (canvas._drawing) return;
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
    for (const ov of d.overlays || []) for (const v of ov.values) { if (v == null) continue; if (v < min) min = v; if (v > max) max = v; }
    /*
     * A penny of range is not a chart. Magnified to the full height it turns noise into a
     * mountain and prints the same rounded number at every tick, which is what a live tape of
     * two prices looks like. Keep a sensible slice of the price in view instead, so a flat
     * stretch looks flat -- the prices are unchanged, only the scale they are drawn on.
     */
    const mid = (max + min) / 2 || 1;
    const floor = Math.abs(mid) * 0.004;
    if (max - min < floor) { min = mid - floor / 2; max = mid + floor / 2; }
    const pad = (max - min) * 0.06; min -= pad; max += pad;

    ctx.font = `11px ${T.mono}`;
    let ticks = niceTicks(min, max, 5);
    // Whatever the span, the axis has to read as different numbers: if the labels still collide
    // once rounded for display, widen until they do not.
    for (let g = 0; g < 6 && new Set(ticks.map(d.fmt)).size < Math.min(3, ticks.length); g++) {
      const c = (min + max) / 2, half = (max - min) || Math.abs(c) * 0.01;
      min = c - half; max = c + half;
      ticks = niceTicks(min, max, 5);
    }
    const labelW = Math.max(...ticks.map((t) => ctx.measureText(d.fmt(t)).width), ctx.measureText(d.fmt(d.c[n - 1])).width) + 16;
    const L = 4, R = w - labelW, Top = 24, XB = h - 20;
    const volH = Math.max(36, Math.round(h * 0.18));
    const PB = XB - volH - 10;
    const slot = (R - L) / n;
    const xAt = (i) => L + slot * (i + 0.5);
    const yAt = (v) => PB - ((v - min) / (max - min)) * (PB - Top);
    // Body width follows the slot, so a chart with few bars gets chunky candles. The cap only
    // stops a near-empty chart drawing slabs; a full chart is still limited by its slot.
    const bw = Math.max(1, Math.min(32, slot * 0.62));

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
        ctx.strokeStyle = col; ctx.lineWidth = bw >= 16 ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(x, yAt(d.h[i])); ctx.lineTo(x, yAt(d.l[i])); ctx.stroke();
        const y1 = yAt(Math.max(d.o[i], d.c[i])), y2 = yAt(Math.min(d.o[i], d.c[i]));
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x - bw / 2), Math.round(y1), Math.max(1, Math.round(bw)), Math.max(1, Math.round(y2 - y1)));
      }
    }

    // moving-average overlays
    (d.overlays || []).forEach((ov) => {
      ctx.strokeStyle = T[ov.color] || ov.color; ctx.lineWidth = 1.6; ctx.beginPath();
      let started = false;
      ov.values.forEach((v, i) => { if (v == null) return; if (!started) { ctx.moveTo(xAt(i), yAt(v)); started = true; } else ctx.lineTo(xAt(i), yAt(v)); });
      ctx.stroke();
    });
    if (d.overlays && d.overlays.length) {
      ctx.font = `11px ${T.mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      let lx = L + 2;
      d.overlays.forEach((ov) => { ctx.fillStyle = T[ov.color] || ov.color; ctx.fillRect(lx, 22, 12, 2); ctx.fillStyle = T.muted; ctx.fillText(ov.label, lx + 16, 23); lx += ctx.measureText(ov.label).width + 30; });
    }

    // volume
    const vmax = Math.max(...d.v) || 1;
    for (let i = 0; i < n; i++) {
      const up = d.c[i] >= (i ? d.c[i - 1] : d.o[i]);
      const vh = (d.v[i] / vmax) * volH;
      ctx.fillStyle = hexA(up ? T.buy : T.sell, 0.85);
      ctx.fillRect(Math.round(xAt(i) - bw / 2), XB - vh, Math.max(1, Math.round(bw)), vh);
    }

    // bottom axis
    const lab = d.labelFmt || shortDate;
    ctx.fillStyle = T.muted; ctx.textBaseline = 'alphabetic';
    if (d.timeAxis) {
      // A tick for every 5-minute bar, and a time label at the roundest step that fits.
      ctx.strokeStyle = T.line; ctx.lineWidth = 1;
      const tickEvery = Math.max(1, Math.ceil(3 / slot));
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if ((n - 1 - i) % tickEvery) continue;
        const x = Math.round(xAt(i)) + 0.5, open = barMinute(i, n) === SESSION_OPEN;
        ctx.moveTo(x, XB + 1); ctx.lineTo(x, XB + (open ? 6 : 3));
      }
      ctx.stroke();
      const step = [5, 10, 15, 30, 60, 120, 180].find((m) => (m / 5) * slot >= 46) || 390;
      ctx.textAlign = 'center';
      // Session opens (9:30) first, then round clock times that don't crowd them.
      const placed = [];
      const tryLabel = (i, open) => {
        const x = Math.min(Math.max(xAt(i), L + 14), R - 14);
        if (placed.some((px) => Math.abs(px - x) < 40)) return;
        placed.push(x);
        ctx.fillStyle = open ? T.fg : T.muted;
        ctx.fillText(hhmm(barMinute(i, n)), x, h - 5);
      };
      for (let i = 0; i < n; i++) if (barMinute(i, n) === SESSION_OPEN) tryLabel(i, true);
      for (let i = 0; i < n; i++) { const min = barMinute(i, n); if (min !== SESSION_OPEN && min % step === 0) tryLabel(i, false); }
    } else {
      const count = Math.min(5, n);
      for (let k = 0; k < count; k++) {
        const i = Math.round((k / (count - 1 || 1)) * (n - 1));
        ctx.textAlign = k === 0 ? 'left' : k === count - 1 ? 'right' : 'center';
        ctx.fillText(lab(d.labels[i]), Math.min(Math.max(xAt(i), L), R), h - 5);
      }
    }

    // the reader's drawings, clipped to the price area
    canvas._map = { L, R, Top, PB, slot, n, min, max };
    if (d.drawings && d.drawings.length) {
      const px = (pt) => [L + slot * (pt.x + 0.5), yAt(pt.p)];
      ctx.save();
      ctx.beginPath(); ctx.rect(L, Top - 6, R - L, PB - Top + 12); ctx.clip();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
      for (const dr of d.drawings) {
        ctx.strokeStyle = dr.color; ctx.lineWidth = dr.type === 'pen' ? 2.2 : 2;
        ctx.beginPath();
        if (dr.type === 'hline') { const y = Math.round(yAt(dr.pts[0].p)) + 0.5; ctx.moveTo(L, y); ctx.lineTo(R, y); }
        else dr.pts.forEach((pt, k) => { const [x, y] = px(pt); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.stroke();
        if (dr.type === 'line') for (const pt of dr.pts) { const [x, y] = px(pt); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = dr.color; ctx.fill(); }
      }
      ctx.restore();
      // price tags for level lines
      ctx.font = `600 11px ${T.mono}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      for (const dr of d.drawings) {
        if (dr.type !== 'hline') continue;
        const p = dr.pts[0].p;
        if (p > max || p < min) continue;
        const y = Math.round(yAt(p)) + 0.5;
        ctx.fillStyle = dr.color; ctx.fillRect(R + 2, y - 9, labelW - 4, 18);
        ctx.fillStyle = '#ffffff'; ctx.fillText(d.fmt(p), R + 7, y);
      }
    }

    // your buys and sells: B under the bar at the price paid, S above it with the profit
    if (d.trades && d.trades.length) {
      ctx.save();
      ctx.font = `700 10px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const boxes = [];   // profit labels already placed, so neighbours stack instead of overlapping
      const hits = (a) => boxes.some((b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1);
      for (const tr of d.trades) {
        if (tr.x < 0 || tr.x > n - 1) continue;
        const x = Math.round(xAt(tr.x)) + 0.5;
        const buy = tr.side === 'buy';
        const col = buy ? T.gain : T.sell;
        const py = Math.max(Top, Math.min(PB, yAt(tr.p)));
        // dot at the exact trade price
        ctx.fillStyle = col; ctx.strokeStyle = T.surface; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, py, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // arrow flag: below the bar's low for buys, above its high for sells
        const bar = line ? d.c[tr.x] : buy ? d.l[tr.x] : d.h[tr.x];
        const by = Math.max(Top + 10, Math.min(PB - 10, yAt(bar) + (buy ? 16 : -16)));
        ctx.beginPath();
        if (buy) { ctx.moveTo(x, by - 9); ctx.lineTo(x - 8, by + 4); ctx.lineTo(x + 8, by + 4); }
        else { ctx.moveTo(x, by + 9); ctx.lineTo(x - 8, by - 4); ctx.lineTo(x + 8, by - 4); }
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.fillText(buy ? 'B' : 'S', x, by + (buy ? 0 : -1));
        if (tr.tag) {
          ctx.font = `700 11px ${T.mono}`;
          const tw = ctx.measureText(tr.tag).width + 8;
          const tx = Math.min(Math.max(x, L + tw / 2), R - tw / 2);
          const spots = [by - 17, by - 34, by - 51, by + 18, by + 35, by + 52].filter((y) => y - 8 >= Top && y + 8 <= PB);
          let ty = spots.find((y) => !hits({ x1: tx - tw / 2, x2: tx + tw / 2, y1: y - 8, y2: y + 8 }));
          if (ty == null) ty = spots[0] ?? by - 17;
          boxes.push({ x1: tx - tw / 2, x2: tx + tw / 2, y1: ty - 8, y2: ty + 8 });
          ctx.fillStyle = T.surface; ctx.globalAlpha = 0.92; ctx.fillRect(tx - tw / 2, ty - 8, tw, 16); ctx.globalAlpha = 1;
          ctx.fillStyle = tr.up ? T.gain : T.loss; ctx.fillText(tr.tag, tx, ty);
          ctx.font = `700 10px ${T.mono}`;
        }
      }
      ctx.restore();
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
    const when = d.timeAxis ? hhmm(barMinute(idx, n)) : (d.labelFmt || shortDate)(d.labels[idx]);
    const parts = line
      ? [when, 'Close ' + d.fmt(d.c[idx])]
      : [when, 'O ' + d.fmt(d.o[idx]), 'H ' + d.fmt(d.h[idx]), 'L ' + d.fmt(d.l[idx]), 'C ' + d.fmt(d.c[idx])];
    const chg = idx ? d.c[idx] / d.c[idx - 1] - 1 : 0;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    let x = L + 2;
    parts.forEach((p, k) => { ctx.fillStyle = k ? T.fg : T.muted; ctx.fillText(p, x, 5); x += ctx.measureText(p).width + 12; });
    ctx.fillStyle = chg >= 0 ? T.gain : T.loss;
    ctx.fillText((chg >= 0 ? '+' : '') + (chg * 100).toFixed(2) + '%', x, 5);
    x += ctx.measureText('+0.00%').width + 14;
    // your trades on the hovered bar
    if (hoverX != null && d.trades) {
      for (const tr of d.trades) {
        if (tr.x !== idx || !tr.text) continue;
        ctx.font = `600 11px ${T.mono}`;
        ctx.fillStyle = tr.side === 'buy' ? T.gain : tr.up ? T.gain : T.loss;
        if (x + ctx.measureText(tr.text).width > R) break;
        ctx.fillText(tr.text, x, 5); x += ctx.measureText(tr.text).width + 12;
      }
    }
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

  /*
   * A month of prices, small enough to sit in a table row.
   *
   * The obvious way to draw one -- stretch the lowest price to the bottom and the highest to the
   * top -- makes every line the same size whatever happened. A share that drifted half a per
   * cent and one that swung forty draw the same squiggle, so the picture says nothing except
   * "prices wobbled", and a column of them is a column of identical scribbles.
   *
   * Here the height is the size of the move instead. The line starts at the middle and rises or
   * falls with the distance from where it began, measured against a full-scale move, so a quiet
   * month is nearly flat and a violent one fills the row. The scale is compressive rather than
   * clipped: a huge move still fits in the box, and still looks bigger than a large one.
   */
  /*
   * A swing of about 14% over a month uses most of the height. Over longer stretches prices
   * naturally travel further -- a year's move is roughly five times a month's -- so the scale
   * grows with the span. Without that every yearly line would be pinned to the top or bottom
   * of its row and they would all look the same again, which is the fault this drawing was
   * changed to fix.
   */
  const SPARK_FULL = 0.14;
  const SPARK_DAYS = 30;
  function sparkSVG(vals, up, days) {
    const span = days || vals.length || SPARK_DAYS;
    const full = SPARK_FULL * Math.sqrt(Math.max(span, 5) / SPARK_DAYS);
    const w = 84, h = 24, mid = h / 2, room = h / 2 - 2;
    const base = vals.find((v) => v > 0) || 1;
    const pts = vals.map((v, i) => {
      const rel = v / base - 1;
      const y = mid - Math.tanh(rel / full) * room;
      return `${((i / (vals.length - 1)) * w).toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">`
      + `<line x1="0" y1="${mid}" x2="${w}" y2="${mid}" stroke="currentColor" stroke-width="0.5" opacity="0.18"/>`
      + `<polyline points="${pts}" fill="none" stroke="var(${up ? '--gain' : '--loss'})" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  }

  // Convert between canvas pixels and chart data ({ x: bar index, p: price }) for the last-drawn candles chart.
  function toData(canvas, px, py) {
    const m = canvas._map; if (!m) return null;
    const y = Math.max(m.Top, Math.min(m.PB, py));
    return { x: (px - m.L) / m.slot - 0.5, p: m.max - ((y - m.Top) / (m.PB - m.Top)) * (m.max - m.min) };
  }
  function toPx(canvas, pt) {
    const m = canvas._map; if (!m) return null;
    return [m.L + m.slot * (pt.x + 0.5), m.PB - ((pt.p - m.min) / (m.max - m.min)) * (m.PB - m.Top)];
  }
  const redraw = (canvas) => drawCandles(canvas, null);

  window.Charts = { line, bars, candles, sparkSVG, shortDate, toData, toPx, redraw };
})();
