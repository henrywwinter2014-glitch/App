/*
 * Dividend calculator: a month-by-month projection of a dividend investment.
 * Pure functions only; app.js renders the inputs and results.
 */
(function () {
  'use strict';

  /*
   * p: {
   *   start, monthly,            dollars invested up front and each month
   *   years,                     length of the projection
   *   yield, divGrowth, priceGrowth, inflation, fee,   all yearly percentages
   *   freq,                      dividend payments a year (12, 4, 2, 1)
   *   drip,                      reinvest dividends after tax
   *   taxRate, allowance,        dividend tax % and tax-free dividends a year ($)
   * }
   */
  function project(p) {
    const months = Math.round(p.years * 12);
    const payEvery = 12 / p.freq;
    const pg = Math.pow(1 + p.priceGrowth / 100, 1 / 12);
    const feeKeep = Math.pow(1 - p.fee / 100, 1 / 12);
    const tax = p.taxRate / 100;

    let price = 100;                                 // notional share price
    let shares = p.start / price;
    let dps = price * (p.yield / 100);               // yearly dividend per share, raised once a year
    let cash = 0;                                    // dividends kept as cash when not reinvesting
    let contributed = p.start;
    const flows = [-p.start];                        // monthly cash flows for the money-weighted return
    const rows = [];
    let yr = { gross: 0, tax: 0, net: 0 };
    let allowLeft = p.allowance;
    let totals = { gross: 0, tax: 0, net: 0 };

    for (let m = 1; m <= months; m++) {
      price *= pg;
      shares *= feeKeep;
      if (m % payEvery === 0) {
        const gross = shares * dps / p.freq;
        const free = Math.min(gross, allowLeft);
        allowLeft -= free;
        const t = (gross - free) * tax;
        const net = gross - t;
        yr.gross += gross; yr.tax += t; yr.net += net;
        if (p.drip) shares += net / price; else cash += net;
      }
      // Contributions go in at the end of each month (after any payment that month).
      shares += p.monthly / price;
      contributed += p.monthly;
      flows.push(-p.monthly);

      if (m % 12 === 0) {
        const y = m / 12;
        const value = shares * price + cash;
        rows.push({
          year: y, contributed, value, cash,
          gross: yr.gross, tax: yr.tax, net: yr.net,
          yoc: contributed ? yr.net / contributed : 0,
          real: value / Math.pow(1 + p.inflation / 100, y),
          realIncome: yr.net / Math.pow(1 + p.inflation / 100, y),
        });
        totals.gross += yr.gross; totals.tax += yr.tax; totals.net += yr.net;
        yr = { gross: 0, tax: 0, net: 0 };
        allowLeft = p.allowance;
        dps *= 1 + p.divGrowth / 100;
      }
    }
    const final = shares * price + cash;
    flows[flows.length - 1] += final;
    // Next year's income at the final share count and the raised dividend.
    const nextIncomeGross = shares * dps;
    const nextIncome = nextIncomeGross - Math.max(0, nextIncomeGross - p.allowance) * tax;
    return { rows, final, contributed, totals, nextIncome, irr: irr(flows) };
  }

  // Annualised money-weighted return from monthly cash flows (bisection on the monthly rate).
  function irr(flows) {
    const npv = (r) => { let v = 0, d = 1; for (const f of flows) { v += f / d; d *= 1 + r; } return v; };
    let lo = -0.5, hi = 0.5;
    if (npv(lo) * npv(hi) > 0) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
    }
    return Math.pow(1 + (lo + hi) / 2, 12) - 1;
  }

  window.DivCalc = { project };
})();
