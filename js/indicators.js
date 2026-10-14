/*
 * Technical indicators, shared by the charts and the backtester so both read a market the same way.
 *
 * Every function returns an array the same length as its input, with null in the leading positions
 * where there is not yet enough history to compute a value. Nothing ever looks at a later bar than
 * the one it is reporting on, which is what lets the backtester claim it cannot see the future.
 */
(function () {
  'use strict';

  function sma(v, n) {
    const out = new Array(v.length).fill(null);
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
      sum += v[i];
      if (i >= n) sum -= v[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function ema(v, n) {
    const out = new Array(v.length).fill(null);
    const k = 2 / (n + 1);
    let prev = null, sum = 0;
    for (let i = 0; i < v.length; i++) {
      sum += v[i];
      if (i === n - 1) { prev = sum / n; out[i] = prev; }
      else if (i >= n) { prev = v[i] * k + prev * (1 - k); out[i] = prev; }
    }
    return out;
  }

  /*
   * Relative strength index: where the last n bars sat between all-up and all-down. Wilder's
   * smoothing, as everyone plots it. Above 70 is usually called overbought, below 30 oversold —
   * descriptions of what has happened, not forecasts of what comes next.
   */
  function rsi(v, n = 14) {
    const out = new Array(v.length).fill(null);
    if (v.length <= n) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) {
      const d = v[i] - v[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    gain /= n; loss /= n;
    out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    for (let i = n + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      gain = (gain * (n - 1) + Math.max(0, d)) / n;
      loss = (loss * (n - 1) + Math.max(0, -d)) / n;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
    return out;
  }

  /*
   * Moving average convergence divergence: a fast average minus a slow one, with its own average
   * on top as the signal line. The histogram is the gap between them.
   */
  function macd(v, fast = 12, slow = 26, sig = 9) {
    const f = ema(v, fast), s = ema(v, slow);
    const line = v.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
    const vals = line.filter((x) => x != null);
    const sg = ema(vals, sig);
    const signal = new Array(v.length).fill(null);
    let k = 0;
    for (let i = 0; i < v.length; i++) if (line[i] != null) signal[i] = sg[k++];
    const hist = v.map((_, i) => (line[i] == null || signal[i] == null ? null : line[i] - signal[i]));
    return { line, signal, hist };
  }

  // Highest and lowest close over a trailing window, the bar itself included.
  function highest(v, n) {
    return v.map((_, i) => (i < n - 1 ? null : Math.max(...v.slice(i - n + 1, i + 1))));
  }
  function lowest(v, n) {
    return v.map((_, i) => (i < n - 1 ? null : Math.min(...v.slice(i - n + 1, i + 1))));
  }

  // True when a crossed above b on this bar and was at or below it on the one before.
  function crossedAbove(a, b, i) {
    return i > 0 && a[i] != null && b[i] != null && a[i - 1] != null && b[i - 1] != null && a[i - 1] <= b[i - 1] && a[i] > b[i];
  }
  const crossedBelow = (a, b, i) => crossedAbove(b, a, i);

  window.Indicators = { sma, ema, rsi, macd, highest, lowest, crossedAbove, crossedBelow };
})();
