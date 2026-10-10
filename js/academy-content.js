/*
 * Learn course content: Fundamental Stock Analysis.
 *
 * Question shapes:
 *   { q, opts: [...], a: index, why }                 multiple choice
 *   { q, num: answer, tol?, pct?, unit?, why }         number answer (pct: answer is a fraction, "25%" or "0.25" both accepted)
 *   { q, fig, plain?, opts, a, why }                   multiple choice under a chart figure from learn.js
 * Optional: show (how to display the answer).
 * Lessons may have m: [[term, meaning], ...] for a match-the-pairs round.
 * Generators (GEN) build fresh questions from a seeded random function.
 */
(function () {
  'use strict';

  const r2 = (v) => Math.round(v * 100) / 100;
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const usd = (v) => '$' + (+v.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const bn = (v) => `$${(+v.toFixed(2)).toLocaleString('en-US')} billion`;
  const pc = (v) => `${+(v * 100).toFixed(2)}%`;

  // A dividend payer from the live simulator, for questions on real tickers.
  function liveStock(r) {
    const E = window.Engine;
    if (!E || !E.S || !E.S.sec) return null;
    const list = E.U.filter((m) => m.type === 'Stock' && m.q && E.S.sec[m.t] && E.fwdYield(m.t) > 0.008 && E.fwdYield(m.t) < 0.09);
    if (!list.length) return null;
    const m = list[Math.floor(r() * list.length)];
    return { m, p: r2(E.price(m.t)), d: r2(E.annualDps(m.t)) };
  }

  const GEN = {
    /* the basics */
    mcap: (r) => { const p = pick(r, [20, 25, 40, 50, 80, 120, 150, 200]), s = pick(r, [0.5, 1, 2, 4, 5, 10]); return { q: `A company has ${s} billion shares outstanding, each trading at $${p}. What is its market cap, in $ billions?`, num: p * s, why: `Market cap = share price × shares outstanding = $${p} × ${s} billion = ${bn(p * s)}.` }; },
    dilution: (r) => { const s = pick(r, [100, 200, 400, 500]), n = pick(r, [10, 20, 25, 50, 100]); const own = 1 - s / (s + n); return { q: `A company with ${s} million shares issues ${n} million new ones. By what % does each existing shareholder’s stake shrink?`, num: own, pct: true, tol: 0.003, show: pc(own), why: `You now own ${s}/${s + n} of what you owned before: a ${pc(own)} smaller slice. That is dilution.` }; },
    /* income statement */
    grossProfit: (r) => { const rev = pick(r, [80, 120, 200, 250, 400, 500]), gm = pick(r, [0.25, 0.4, 0.5, 0.6, 0.7]); const cogs = r2(rev * (1 - gm)); return { q: `Revenue is $${rev} million and the cost of goods sold is $${cogs} million. What is gross profit, in $ millions?`, num: r2(rev - cogs), why: `Gross profit = revenue − cost of goods sold = ${rev} − ${cogs} = $${r2(rev - cogs)} million.` }; },
    margin: (r) => {
      const kind = pick(r, ['gross', 'operating', 'net']), rev = pick(r, [50, 80, 200, 250, 400, 500]), m = pick(r, kind === 'gross' ? [0.3, 0.45, 0.6, 0.75] : kind === 'operating' ? [0.08, 0.12, 0.2, 0.3] : [0.05, 0.1, 0.15, 0.25]);
      const label = kind === 'gross' ? 'gross profit' : kind === 'operating' ? 'operating income' : 'net income';
      return { q: `Revenue is $${rev} million and ${label} is $${r2(rev * m)} million. What is the ${kind} margin?`, num: m, pct: true, why: `${kind[0].toUpperCase() + kind.slice(1)} margin = ${label} ÷ revenue = ${r2(rev * m)} ÷ ${rev} = ${pc(m)}.` };
    },
    eps: (r) => { const s = pick(r, [50, 100, 200, 250, 400, 500]), e = pick(r, [0.5, 1.2, 2, 2.5, 3, 4.5, 6]); return { q: `Net income is $${r2(s * e)} million and there are ${s} million shares. What are the earnings per share (EPS), in $?`, num: e, why: `EPS = net income ÷ shares = ${r2(s * e)} ÷ ${s} = ${usd(e)}.` }; },
    /* balance sheet */
    equity: (r) => { const a = pick(r, [100, 250, 400, 600, 900]), l = Math.round(a * pick(r, [0.3, 0.45, 0.6, 0.75])); return { q: `Total assets are $${a} million and total liabilities are $${l} million. What is shareholders’ equity, in $ millions?`, num: a - l, why: `Assets = liabilities + equity, so equity = ${a} − ${l} = $${a - l} million.` }; },
    currentRatio: (r) => { const cl = pick(r, [40, 50, 80, 100, 120]), cr = pick(r, [0.8, 1.2, 1.5, 2, 2.5]); return { q: `Current assets are $${r2(cl * cr)} million and current liabilities are $${cl} million. What is the current ratio?`, num: cr, tol: 0.02, why: `Current ratio = current assets ÷ current liabilities = ${r2(cl * cr)} ÷ ${cl} = ${cr}. ${cr < 1 ? 'Below 1: short-term bills exceed short-term assets.' : 'Above 1: short-term assets cover short-term bills.'}` }; },
    de: (r) => { const eq = pick(r, [100, 200, 250, 400, 500]), x = pick(r, [0.25, 0.5, 0.8, 1.2, 2]); return { q: `A company has $${r2(eq * x)} million of debt and $${eq} million of shareholders’ equity. What is its debt-to-equity ratio?`, num: x, tol: 0.02, why: `Debt ÷ equity = ${r2(eq * x)} ÷ ${eq} = ${x}.` }; },
    bvps: (r) => { const s = pick(r, [10, 20, 40, 50, 100]), b = pick(r, [5, 8, 12, 15, 20, 30]); return { q: `Shareholders’ equity is $${s * b} million and there are ${s} million shares. What is book value per share, in $?`, num: b, why: `Book value per share = equity ÷ shares = ${s * b} ÷ ${s} = ${usd(b)}.` }; },
    /* cash flow */
    fcf: (r) => { const ocf = pick(r, [120, 200, 350, 500, 800]), capex = Math.round(ocf * pick(r, [0.2, 0.3, 0.4, 0.5])); return { q: `Cash from operations is $${ocf} million and capital expenditure is $${capex} million. What is free cash flow, in $ millions?`, num: ocf - capex, why: `FCF = operating cash flow − capex = ${ocf} − ${capex} = $${ocf - capex} million.` }; },
    fcfYield: (r) => { const mc = pick(r, [10, 20, 40, 50, 80]), y = pick(r, [0.02, 0.04, 0.05, 0.06, 0.08]); return { q: `A company produces $${r2(mc * y * 1000).toLocaleString('en-US')} million of free cash flow a year and has a market cap of $${mc} billion. What is its FCF yield?`, num: y, pct: true, why: `FCF yield = FCF ÷ market cap = ${r2(mc * y)} billion ÷ ${mc} billion = ${pc(y)}. Like an earnings yield, but in cash.` }; },
    /* valuation */
    pe: (r) => { const e = pick(r, [1, 2, 2.5, 4, 5, 8]), pe = pick(r, [8, 10, 12, 15, 20, 25, 30, 40]); return { q: `A share costs $${r2(e * pe)} and EPS is $${e}. What is the P/E ratio?`, num: pe, tol: 0.05, why: `P/E = price ÷ EPS = ${r2(e * pe)} ÷ ${e} = ${pe}. You pay $${pe} for each $1 of yearly profit.` }; },
    peImplied: (r) => { const e = pick(r, [1.5, 2, 3, 4, 5]), pe = pick(r, [10, 12, 15, 18, 20, 25]); return { q: `Similar companies trade on a P/E of ${pe}. This one earns $${e} a share. What price does that imply, in $?`, num: e * pe, why: `Price = P/E × EPS = ${pe} × ${e} = ${usd(e * pe)}.` }; },
    earnYield: (r) => { const pe = pick(r, [8, 10, 12.5, 16, 20, 25, 40, 50]); return { q: `A stock trades on a P/E of ${pe}. What is its earnings yield?`, num: 1 / pe, pct: true, why: `Earnings yield = 1 ÷ P/E = 1 ÷ ${pe} = ${pc(1 / pe)}. Handy for comparing with bond yields.` }; },
    peg: (r) => { const pe = pick(r, [10, 15, 20, 24, 30, 40]), g = pick(r, [5, 8, 10, 12, 15, 20]); const v = pe / g; return { q: `A stock has a P/E of ${pe} and earnings are expected to grow ${g}% a year. What is its PEG ratio?`, num: v, tol: 0.02, show: String(r2(v)), why: `PEG = P/E ÷ growth % = ${pe} ÷ ${g} = ${r2(v)}. ${v < 1 ? 'Below 1 can mean cheap for its growth.' : v > 2 ? 'Well above 1: you pay a lot for that growth.' : 'Around 1 to 2 is common.'}` }; },
    pb: (r) => { const b = pick(r, [10, 20, 25, 40, 50]), x = pick(r, [0.5, 0.8, 1, 1.5, 2, 3]); return { q: `A share costs $${r2(b * x)} and book value per share is $${b}. What is the price-to-book ratio?`, num: x, tol: 0.02, why: `P/B = ${r2(b * x)} ÷ ${b} = ${x}.${x < 1 ? ' Below 1: priced under the accounting value of its net assets.' : ''}` }; },
    ps: (r) => { const rev = pick(r, [2, 4, 5, 10, 20]), x = pick(r, [0.5, 1, 2, 4, 8, 12]); return { q: `A company has a market cap of $${r2(rev * x)} billion and revenue of $${rev} billion. What is its price-to-sales ratio?`, num: x, tol: 0.02, why: `P/S = market cap ÷ revenue = ${r2(rev * x)} ÷ ${rev} = ${x}.` }; },
    ev: (r) => { const mc = pick(r, [20, 40, 50, 80, 100]), d = pick(r, [5, 10, 15, 20]), c = pick(r, [2, 4, 5, 8]); return { q: `Market cap is $${mc} billion, debt is $${d} billion and cash is $${c} billion. What is enterprise value, in $ billions?`, num: mc + d - c, why: `EV = market cap + debt − cash = ${mc} + ${d} − ${c} = ${bn(mc + d - c)}. It is roughly the price to buy the whole business, debts and all.` }; },
    evEbitda: (r) => { const eb = pick(r, [2, 4, 5, 8, 10]), x = pick(r, [6, 8, 10, 12, 15, 20]); return { q: `Enterprise value is $${eb * x} billion and EBITDA is $${eb} billion. What is EV/EBITDA?`, num: x, tol: 0.05, why: `EV/EBITDA = ${eb * x} ÷ ${eb} = ${x}.` }; },
    /* quality */
    roe: (r) => { const eq = pick(r, [100, 200, 250, 400, 500]), x = pick(r, [0.05, 0.08, 0.12, 0.15, 0.2, 0.3]); return { q: `Net income is $${r2(eq * x)} million and shareholders’ equity is $${eq} million. What is return on equity (ROE)?`, num: x, pct: true, why: `ROE = net income ÷ equity = ${r2(eq * x)} ÷ ${eq} = ${pc(x)}.` }; },
    roa: (r) => { const a = pick(r, [200, 400, 500, 800, 1000]), x = pick(r, [0.02, 0.04, 0.05, 0.08, 0.1]); return { q: `Net income is $${r2(a * x)} million and total assets are $${a} million. What is return on assets (ROA)?`, num: x, pct: true, why: `ROA = net income ÷ total assets = ${r2(a * x)} ÷ ${a} = ${pc(x)}.` }; },
    /* growth */
    growth: (r) => { const a = pick(r, [40, 50, 80, 100, 120, 200, 250]), g = pick(r, [-0.1, -0.05, 0.05, 0.1, 0.15, 0.2, 0.25, 0.4]); return { q: `Revenue went from $${a} million last year to $${r2(a * (1 + g))} million this year. What is the year-on-year growth?`, num: g, pct: true, why: `Growth = (new − old) ÷ old = (${r2(a * (1 + g))} − ${a}) ÷ ${a} = ${pc(g)}.` }; },
    cagr: (r) => { const t = pick(r, [2, 3, 5]), g = pick(r, [0.05, 0.08, 0.1, 0.12, 0.15, 0.2]), a = pick(r, [100, 200, 500]); const b = a * Math.pow(1 + g, t); return { q: `Earnings grew from $${a} million to $${r2(b)} million over ${t} years. What is the compound annual growth rate (CAGR)?`, num: g, pct: true, tol: 0.003, why: `CAGR = (end ÷ start)^(1/${t}) − 1 = (${r2(b)} ÷ ${a})^(1/${t}) − 1 = ${pc(g)}.` }; },
    /* dividends */
    divYield: (r) => { const p = pick(r, [20, 25, 40, 50, 80, 100, 120]), y = pick(r, [0.01, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06]); return { q: `A share costs $${p} and pays $${r2(p * y)} a year in dividends. What is the dividend yield?`, num: y, pct: true, why: `Yield = annual dividend ÷ price = ${r2(p * y)} ÷ ${p} = ${pc(y)}.` }; },
    liveYield: (r) => {
      const s = liveStock(r);
      if (!s || !(s.d > 0)) return GEN.divYield(r);
      const y = s.d / s.p;
      return { q: `In your simulator, ${s.m.n} (${s.m.t}) trades at ${usd(s.p)} and pays ${usd(s.d)} a share a year. What is its dividend yield?`, num: y, pct: true, tol: 0.0015, show: pc(y), why: `${usd(s.d)} ÷ ${usd(s.p)} = ${pc(y)}. Check it against the yield shown on the Markets tab.` };
    },
    liveIncome: (r) => {
      const s = liveStock(r);
      const n = pick(r, [10, 20, 40, 50, 100, 200]);
      if (!s || !(s.d > 0)) { const d = pick(r, [0.8, 1.2, 2, 2.5, 3.6]); return { q: `You own ${n} shares that pay $${d} a share a year. What is your yearly dividend income, in $, before tax?`, num: r2(n * d), why: `${n} × $${d} = ${usd(n * d)} a year.` }; }
      return { q: `You own ${n} shares of ${s.m.n} (${s.m.t}), which pays ${usd(s.d)} a share a year. What is your yearly dividend income, in $, before tax?`, num: n * s.d, tol: Math.max(0.05, n * 0.01), show: usd(n * s.d), why: `${n} × ${usd(s.d)} = ${usd(n * s.d)} a year.` };
    },
    payout: (r) => { const e = pick(r, [2, 2.5, 4, 5, 8]), x = pick(r, [0.3, 0.4, 0.5, 0.6, 0.75, 0.9, 1.2]); return { q: `A company earns $${e} a share and pays $${r2(e * x)} a share in dividends. What is its payout ratio?`, num: x, pct: true, why: `Payout ratio = dividend ÷ EPS = ${r2(e * x)} ÷ ${e} = ${pc(x)}. ${x > 1 ? 'Over 100%: it pays out more than it earns, which cannot last.' : x > 0.8 ? 'High: little room if profits dip.' : 'Comfortable, with room to keep raising it.'}` }; },
    cover: (r) => { const d = pick(r, [1, 1.5, 2, 2.5]), c = pick(r, [0.8, 1.5, 2, 2.5, 3]); return { q: `EPS is $${r2(d * c)} and the dividend is $${d} a share. What is dividend cover?`, num: c, tol: 0.02, why: `Cover = EPS ÷ dividend = ${r2(d * c)} ÷ ${d} = ${c}. ${c < 1 ? 'Below 1: the dividend is not covered by earnings.' : c >= 2 ? 'Twice covered or more is generally safe.' : 'Covered, but not by much.'}` }; },
    yoc: (r) => { const p = pick(r, [20, 25, 40, 50]), d0 = pick(r, [0.8, 1, 1.5, 2]), g = pick(r, [0.06, 0.08, 0.1]), t = pick(r, [5, 7, 10]); const d = r2(d0 * Math.pow(1 + g, t)); return { q: `You bought at $${p} when the dividend was $${d0} a year. It has since grown to $${d}. What is your yield on cost?`, num: d / p, pct: true, tol: 0.003, show: pc(d / p), why: `Yield on cost = today’s dividend ÷ what you paid = ${d} ÷ ${p} = ${pc(d / p)}.` }; },
    /* health */
    intCover: (r) => { const i = pick(r, [5, 10, 20, 25, 40]), x = pick(r, [1.5, 2, 4, 6, 10]); return { q: `Operating profit (EBIT) is $${i * x} million and interest costs are $${i} million. What is interest cover?`, num: x, tol: 0.02, why: `Interest cover = EBIT ÷ interest = ${i * x} ÷ ${i} = ${x}. ${x < 2.5 ? 'Thin: a small profit drop could leave interest unpaid.' : 'Comfortable.'}` }; },
    netDebt: (r) => { const d = pick(r, [10, 20, 30, 50]), c = pick(r, [2, 5, 8, 12, 60]); return { q: `Total debt is $${d} billion and cash is $${c} billion. What is net debt, in $ billions?`, num: d - c, why: `Net debt = debt − cash = ${d} − ${c} = ${d - c}.${d - c < 0 ? ' Negative means net cash: more cash than debt.' : ''}` }; },
    /* intrinsic value */
    pv: (r) => { const F = pick(r, [100, 500, 1000]), rt = pick(r, [5, 8, 10]), t = pick(r, [1, 2, 3]); const v = F / Math.pow(1 + rt / 100, t); return { q: `What is $${F} received in ${t} year${t > 1 ? 's' : ''} worth today, at a ${rt}% discount rate?`, num: v, tol: Math.max(0.5, v * 0.003), show: usd(v), why: `Present value = ${F} ÷ ${1 + rt / 100}^${t} = ${usd(v)}.` }; },
    gordon: (r) => { const d = pick(r, [1, 2, 2.5, 3, 4]), k = pick(r, [0.08, 0.09, 0.1]), g = pick(r, [0.02, 0.03, 0.04, 0.05]); const v = d / (k - g); return { q: `Next year’s dividend will be $${d} and will grow ${pc(g)} a year forever. With a ${pc(k)} required return, what is the share worth (Gordon growth model), in $?`, num: v, tol: Math.max(0.05, v * 0.005), show: usd(v), why: `Value = D ÷ (r − g) = ${d} ÷ (${k} − ${g}) = ${usd(v)}.` }; },
    mos: (r) => { const v = pick(r, [40, 50, 80, 100, 120]), m = pick(r, [0.1, 0.2, 0.25, 0.3, 0.4]); return { q: `You estimate a share is worth $${v}. It trades at $${r2(v * (1 - m))}. What is your margin of safety?`, num: m, pct: true, why: `Margin of safety = (value − price) ÷ value = (${v} − ${r2(v * (1 - m))}) ÷ ${v} = ${pc(m)}.` }; },
    graham: (r) => { const e = pick(r, [2, 4, 5, 8]), b = pick(r, [10, 20, 40, 45, 50]); const v = Math.sqrt(22.5 * e * b); return { q: `EPS is $${e} and book value per share is $${b}. What is the Graham number, √(22.5 × EPS × BVPS), in $?`, num: v, tol: Math.max(0.1, v * 0.005), show: usd(v), why: `√(22.5 × ${e} × ${b}) = √${r2(22.5 * e * b)} = ${usd(v)}. Graham’s rough ceiling on what a defensive investor should pay.` }; },
    /* charts */
    trendSpot: (r) => (window.Learn ? window.Learn.trendQuestion(r) : { q: 'Higher highs and higher lows describe…', opts: ['an uptrend', 'a downtrend', 'a sideways market'], a: 0, why: 'A staircase going up.' }),
  };

  const UNITS = [
    {
      id: 'basics', title: 'What a share really is', blurb: 'Shares are slices of real businesses. Learn to see the company behind the ticker.',
      lessons: [
        { t: 'Owning part of a business', gen: ['mcap'], m: [['Share', 'A slice of ownership in a company'], ['Shareholder', 'An owner of the company'], ['Dividend', 'Profit paid out in cash'], ['Buyback', 'The company buys its own shares'], ['Fundamental analysis', 'Valuing a business from its results']],
          tip: `<p>A share is a small piece of ownership in a real business. If the business earns more over time, each share is worth more.</p><p><b>Fundamental analysis</b> means studying the business itself (its sales, profits, debts and cash) to decide what a share is really worth.</p><p>Warren Buffett: “Price is what you pay. <b>Value</b> is what you get.” The job is to find businesses whose value is above their price.</p>`,
          q: [{ q: 'Fundamental analysis tries to work out…', opts: ['what a business is really worth', 'where the price will go tomorrow', 'which stocks are most popular', 'the best time of day to trade'], a: 0, why: 'It estimates the intrinsic value of the business from its results, then compares that with the price.' },
            { q: 'Over the long run, what mainly drives a share price?', opts: ['The company’s profits and cash flow', 'News headlines', 'How many people talk about it online', 'The day of the week'], a: 0, why: 'In the short run the market is a voting machine; in the long run it is a weighing machine that weighs profits.' },
            { q: 'Shareholders get a return in which two ways?', opts: ['Dividends and a rising share price', 'Interest and coupons', 'Rent and fees', 'Salary and bonus'], a: 0, why: 'Cash paid out as dividends, plus a higher price as the business grows.' }] },
        { t: 'Market cap and shares', gen: ['mcap', 'dilution'],
          tip: `<p><b>Market capitalisation</b> = share price × shares outstanding. It is what the market says the whole company is worth.</p><ul><li><b>Large cap</b>: over $10 billion</li><li><b>Mid cap</b>: $2 to 10 billion</li><li><b>Small cap</b>: under $2 billion</li></ul><p>A $500 share is not “more expensive” than a $20 one. Compare the price with what each share earns.</p><p>Issuing new shares <b>dilutes</b> existing owners: same pie, smaller slices.</p>`,
          q: [{ q: 'Company A’s shares cost $500, company B’s cost $20. Which is more expensive?', opts: ['You can’t tell from the price alone', 'A', 'B', 'They are the same'], a: 0, why: 'Price per share means nothing without knowing earnings or assets per share.' },
            { q: 'A company with a $4 billion market cap is usually called…', opts: ['mid cap', 'large cap', 'small cap', 'mega cap'], a: 0, why: '$2 to 10 billion is mid cap.' },
            { q: 'A company buys back 10% of its shares. Each remaining share now owns…', opts: ['a bigger slice of the business', 'a smaller slice', 'the same slice', 'nothing'], a: 0, why: 'Fewer shares split the same business, so each owns more. Buybacks are the opposite of dilution.' }] },
        { t: 'Where the numbers come from', m: [['10-K', 'Annual report (US)'], ['10-Q', 'Quarterly report (US)'], ['Income statement', 'Sales, costs and profit'], ['Balance sheet', 'What it owns and owes'], ['Cash flow statement', 'Cash in and out']],
          tip: `<p>Listed companies publish their results. In the US the <b>10-K</b> is the audited annual report and the <b>10-Q</b> the quarterly one. UK companies publish an annual report and half-year results.</p><p>Every report has three core statements:</p><ul><li><b>Income statement</b>: sales, costs and profit over a period</li><li><b>Balance sheet</b>: what it owns and owes on one day</li><li><b>Cash flow statement</b>: real cash in and out</li></ul>`,
          q: [{ q: 'Which statement shows what a company owns and owes on a single date?', opts: ['Balance sheet', 'Income statement', 'Cash flow statement', 'Press release'], a: 0, why: 'The balance sheet is a snapshot. The other two cover a period.' },
            { q: 'Which statement would you check to see if profits turned into real cash?', opts: ['Cash flow statement', 'Balance sheet', 'Income statement', 'Share register'], a: 0, why: 'Profit includes accounting estimates; the cash flow statement shows the actual cash.' },
            { q: 'In the US, the audited annual report is called the…', opts: ['10-K', '10-Q', '8-K', 'S-1'], a: 0, why: '10-K is annual, 10-Q quarterly, 8-K is for one-off events and S-1 is for an IPO.' }] },
      ],
    },
    {
      id: 'income', title: 'The income statement', blurb: 'From revenue at the top to profit at the bottom.',
      lessons: [
        { t: 'From revenue to profit', gen: ['grossProfit'], m: [['Revenue', 'Total sales (the top line)'], ['Cost of goods sold', 'Direct cost of what was sold'], ['Gross profit', 'Revenue minus direct costs'], ['Operating income', 'Profit from the core business'], ['Net income', 'Profit after everything (the bottom line)']],
          tip: `<p>The income statement runs top to bottom:</p><ul><li><b>Revenue</b> (sales, the “top line”)</li><li>− <b>Cost of goods sold</b> = <b>gross profit</b></li><li>− operating expenses (wages, rent, R&amp;D, marketing) = <b>operating income</b> (EBIT)</li><li>− interest and tax = <b>net income</b> (the “bottom line”)</li></ul>`,
          q: [{ q: 'Revenue $100m, cost of goods sold $60m, operating expenses $25m. What is operating income, in $ millions?', num: 15, why: '100 − 60 = 40 gross profit; 40 − 25 = 15 operating income.' },
            { q: 'The “bottom line” is…', opts: ['net income', 'revenue', 'gross profit', 'cash'], a: 0, why: 'It sits at the bottom of the income statement, after every cost, interest and tax.' },
            { q: 'EBIT stands for…', opts: ['Earnings before interest and tax', 'Earnings before income totals', 'Equity before interest and tax', 'Expenses before income tax'], a: 0, why: 'It is roughly the same as operating income.' }] },
        { t: 'Margins', gen: ['margin'],
          tip: `<p>A <b>margin</b> is a profit as a % of revenue:</p><ul><li><b>Gross margin</b> = gross profit ÷ revenue: pricing power</li><li><b>Operating margin</b> = operating income ÷ revenue: how efficiently it is run</li><li><b>Net margin</b> = net income ÷ revenue: what is left for owners</li></ul><p>Software firms often have gross margins over 70%; supermarkets around 25%. Compare with similar companies, and watch the trend.</p>`,
          q: [{ q: 'Which business usually has the higher gross margin?', opts: ['A software company', 'A supermarket', 'A car maker', 'An airline'], a: 0, why: 'Selling another copy of software costs almost nothing, so most of the price is gross profit.' },
            { q: 'Revenue rose 10% but operating margin fell from 20% to 12%. That suggests…', opts: ['costs are growing faster than sales', 'the company is more efficient', 'the share price will rise', 'nothing at all'], a: 0, why: 'Shrinking margins mean each dollar of sales makes less profit.' },
            { q: 'Net margin of 8% means…', opts: ['8 cents of profit per $1 of sales', '$8 of profit per share', 'sales grew 8%', 'the P/E is 8'], a: 0, why: 'Net income ÷ revenue = 0.08.' }] },
        { t: 'Earnings per share', gen: ['eps'],
          tip: `<p><b>Earnings per share (EPS)</b> = net income ÷ shares outstanding. It is each share’s slice of the profit.</p><p><b>Diluted EPS</b> also counts shares that options and convertibles could create: use it.</p><p>Watch for <b>one-offs</b>: a big asset sale can inflate one year’s EPS. Many companies also report “adjusted” EPS that strips out costs they would rather you ignore. Be sceptical.</p>`,
          q: [{ q: 'Net income is flat, but the company bought back lots of shares. EPS will…', opts: ['rise', 'fall', 'stay the same', 'become negative'], a: 0, why: 'The same profit is split across fewer shares.' },
            { q: 'Which EPS figure is more conservative?', opts: ['Diluted EPS', 'Basic EPS', 'Adjusted EPS', 'Pro-forma EPS'], a: 0, why: 'Diluted EPS counts every share that could exist, so it is lower or equal.' },
            { q: 'EPS jumped 80% because the company sold a factory. This growth is…', opts: ['a one-off that won’t repeat', 'a sign of a great business', 'recurring', 'always ignored by markets'], a: 0, why: 'Strip out one-off gains to see the underlying trend.' }] },
      ],
    },
    {
      id: 'balance', title: 'The balance sheet', blurb: 'What a company owns, what it owes, and what is left for shareholders.',
      lessons: [
        { t: 'Assets = liabilities + equity', gen: ['equity'], m: [['Assets', 'What the company owns'], ['Liabilities', 'What the company owes'], ['Equity', 'Assets minus liabilities'], ['Goodwill', 'Price paid above an acquisition’s book value'], ['Inventory', 'Goods waiting to be sold']],
          tip: `<p>The balance sheet always balances:</p><p><b>Assets = liabilities + shareholders’ equity</b></p><ul><li><b>Assets</b>: cash, inventory, money owed by customers (receivables), factories, brands</li><li><b>Liabilities</b>: loans, bonds, money owed to suppliers</li><li><b>Equity</b>: what would be left for owners if everything were sold and every debt paid</li></ul>`,
          q: [{ q: 'Assets $500m, equity $200m. What are liabilities, in $ millions?', num: 300, why: 'Liabilities = assets − equity = 500 − 200 = 300.' },
            { q: 'Money customers owe the company appears as…', opts: ['accounts receivable (an asset)', 'accounts payable (a liability)', 'equity', 'revenue'], a: 0, why: 'Receivables are cash the company expects to collect.' },
            { q: 'Goodwill appears when a company…', opts: ['buys another company for more than its book value', 'gives to charity', 'pays a dividend', 'issues new shares'], a: 0, why: 'The premium paid is booked as goodwill. Large write-downs of it mean an acquisition went badly.' }] },
        { t: 'Can it pay its bills?', gen: ['currentRatio'],
          tip: `<p><b>Liquidity</b> is the ability to pay bills due within a year.</p><ul><li><b>Current ratio</b> = current assets ÷ current liabilities. Above 1 is usually fine.</li><li><b>Quick ratio</b> leaves out inventory, which may be hard to sell fast.</li><li><b>Working capital</b> = current assets − current liabilities.</li></ul>`,
          q: [{ q: 'Current assets $150m, current liabilities $100m. Current ratio?', num: 1.5, tol: 0.01, why: '150 ÷ 100 = 1.5.' },
            { q: 'Why does the quick ratio leave out inventory?', opts: ['It may be hard to turn into cash quickly', 'It is not an asset', 'It is always worthless', 'Regulators forbid it'], a: 0, why: 'Unsold stock might need big discounts to sell in a hurry.' },
            { q: 'A current ratio of 0.6 means…', opts: ['short-term debts exceed short-term assets', 'the company is very safe', 'it has no debt', 'its P/E is 0.6'], a: 0, why: 'It has 60 cents of short-term assets per $1 of short-term bills.' }] },
        { t: 'Debt and book value', gen: ['de', 'bvps'], m: [['Debt-to-equity', 'Debt ÷ equity'], ['Net debt', 'Debt minus cash'], ['Book value', 'Equity on the balance sheet'], ['Leverage', 'Using borrowed money'], ['Current ratio', 'Current assets ÷ current liabilities']],
          tip: `<p>Debt boosts returns in good times and can sink a company in bad times.</p><ul><li><b>Debt-to-equity</b> = total debt ÷ equity</li><li><b>Net debt</b> = debt − cash</li><li><b>Book value per share</b> = equity ÷ shares</li></ul><p>Utilities can carry lots of debt because their income is steady. A cyclical company with heavy debt is a warning sign.</p>`,
          q: [{ q: 'Which company can most safely carry high debt?', opts: ['A regulated water utility', 'A start-up airline', 'A fashion retailer', 'A mining explorer'], a: 0, why: 'Steady, predictable income makes it easier to keep paying interest.' },
            { q: 'Debt $50m, equity $100m. Debt-to-equity?', num: 0.5, tol: 0.01, why: '50 ÷ 100 = 0.5.' },
            { q: 'In a recession, high debt…', opts: ['magnifies losses and raises the risk of failure', 'protects the company', 'does not matter', 'lowers interest costs'], a: 0, why: 'Interest still has to be paid when profits fall.' }] },
      ],
    },
    {
      id: 'cash', title: 'Cash flow', blurb: 'Profit is an opinion, cash is a fact.',
      lessons: [
        { t: 'Profit is not cash', tip: `<p>Accounting profit includes estimates and timing. A company books a sale when it is made, even if the customer pays months later.</p><p><b>Depreciation</b> spreads the cost of equipment over years, so it lowers profit without using cash that year.</p><p>Companies go bust when they run out of <b>cash</b>, not profit. Check that operating cash flow roughly tracks net income over time.</p>`,
          q: [{ q: 'Net income keeps rising, but operating cash flow keeps falling. This is…', opts: ['a warning sign worth investigating', 'great news', 'normal for every company', 'impossible'], a: 0, why: 'Profits that don’t turn into cash can mean customers aren’t paying, or aggressive accounting.' },
            { q: 'Depreciation reduces profit but…', opts: ['uses no cash in that year', 'doubles the cash used', 'is paid to shareholders', 'is a tax'], a: 0, why: 'The cash went out when the equipment was bought; depreciation just spreads the cost.' },
            { q: 'Receivables growing much faster than sales may mean…', opts: ['customers are slow to pay, or sales are being stuffed', 'the business is booming', 'cash is piling up', 'debt is falling'], a: 0, why: 'The sales are booked, but the cash isn’t arriving.' }] },
        { t: 'The three cash flows', m: [['Operating cash flow', 'Cash from day-to-day business'], ['Investing cash flow', 'Spending on assets and acquisitions'], ['Financing cash flow', 'Borrowing, dividends and buybacks'], ['Capex', 'Spending on equipment and buildings'], ['Depreciation', 'Spreading an asset’s cost over years']],
          tip: `<p>The cash flow statement has three parts:</p><ul><li><b>Operating</b>: cash from running the business</li><li><b>Investing</b>: buying equipment (capex), acquisitions</li><li><b>Financing</b>: borrowing, repaying debt, issuing shares, dividends, buybacks</li></ul><p>A healthy mature company: positive operating cash, negative investing (it reinvests) and negative financing (it returns cash to owners).</p>`,
          q: [{ q: 'Paying a dividend appears under…', opts: ['financing cash flow', 'operating cash flow', 'investing cash flow', 'revenue'], a: 0, why: 'Dividends, buybacks and borrowing are financing.' },
            { q: 'Buying a new factory appears under…', opts: ['investing cash flow', 'financing cash flow', 'operating cash flow', 'equity'], a: 0, why: 'Capital expenditure is investing.' },
            { q: 'A company funds its dividend by borrowing every year. This is…', opts: ['unsustainable', 'a sign of strength', 'normal for all companies', 'tax efficient'], a: 0, why: 'A dividend should come from operating cash flow, not new debt.' }] },
        { t: 'Free cash flow', gen: ['fcf', 'fcfYield'],
          tip: `<p><b>Free cash flow (FCF)</b> = operating cash flow − capital expenditure.</p><p>It is the cash left after keeping the business running and growing, available for dividends, buybacks, paying debt or acquisitions.</p><p><b>FCF yield</b> = FCF ÷ market cap. Many investors trust it more than the P/E because cash is harder to fudge.</p>`,
          q: [{ q: 'Operating cash flow $300m, capex $120m. FCF in $ millions?', num: 180, why: '300 − 120 = 180.' },
            { q: 'Why do many investors prefer FCF to net income?', opts: ['Cash is harder to manipulate than accounting profit', 'It is always bigger', 'It ignores costs', 'It includes debt'], a: 0, why: 'Accounting choices move profit around; cash either arrived or it didn’t.' },
            { q: 'A company has negative FCF every year but a rising share price. It is funding itself with…', opts: ['debt or new shares', 'its profits', 'dividends', 'nothing'], a: 0, why: 'If the business burns cash, the money must come from lenders or new shareholders.' }] },
      ],
    },
    {
      id: 'value', title: 'Valuation ratios', blurb: 'Is the price cheap or expensive for what you get?',
      lessons: [
        { t: 'The P/E ratio', gen: ['pe', 'peImplied', 'earnYield'],
          tip: `<p><b>P/E</b> = share price ÷ EPS. A P/E of 20 means you pay $20 for every $1 of yearly profit.</p><ul><li><b>Trailing P/E</b> uses the last 12 months of earnings.</li><li><b>Forward P/E</b> uses next year’s forecast.</li><li><b>Earnings yield</b> = 1 ÷ P/E (P/E 20 = 5%).</li></ul><p>A low P/E is not automatically cheap: profits may be about to fall. A high P/E can be fair if profits will grow fast.</p>`,
          q: [{ q: 'Price $60, EPS $3. P/E?', num: 20, tol: 0.01, why: '60 ÷ 3 = 20.' },
            { q: 'A company makes a loss. Its P/E is…', opts: ['not meaningful', 'zero', 'very low, so cheap', 'infinite and great'], a: 0, why: 'With negative earnings the ratio has no useful meaning. Use sales or cash flow instead.' },
            { q: 'A stock on a P/E of 6 while peers trade at 18 might be…', opts: ['cheap, or a value trap with falling profits', 'certainly a bargain', 'certainly overpriced', 'about to split'], a: 0, why: 'Always ask why it is cheap. The market may expect profits to fall.' }] },
        { t: 'PEG, P/B and P/S', gen: ['peg', 'pb', 'ps'], m: [['P/E', 'Price ÷ earnings per share'], ['PEG', 'P/E ÷ growth rate'], ['P/B', 'Price ÷ book value per share'], ['P/S', 'Market cap ÷ revenue'], ['Earnings yield', '1 ÷ P/E']],
          tip: `<ul><li><b>PEG</b> = P/E ÷ expected growth %. Around 1 is often called fair for a growing company.</li><li><b>P/B</b> = price ÷ book value per share. Useful for banks and insurers, whose assets are mostly financial.</li><li><b>P/S</b> = market cap ÷ revenue. Used for young companies with no profits yet.</li></ul>`,
          q: [{ q: 'Which ratio is most useful for valuing a bank?', opts: ['Price-to-book', 'Price-to-sales', 'PEG', 'EV/EBITDA'], a: 0, why: 'Banks’ assets and liabilities are mostly financial, so book value is meaningful.' },
            { q: 'A fast-growing company with no profits yet is often valued on…', opts: ['price-to-sales', 'P/E', 'dividend yield', 'payout ratio'], a: 0, why: 'With no earnings, sales are the best available measure.' },
            { q: 'P/E 30, earnings growth 30% a year. PEG?', num: 1, tol: 0.01, why: '30 ÷ 30 = 1.' }] },
        { t: 'Enterprise value', gen: ['ev', 'evEbitda'],
          tip: `<p><b>Enterprise value (EV)</b> = market cap + debt − cash. It is roughly what it would cost to buy the whole business, including its debts.</p><p><b>EV/EBITDA</b> compares that with earnings before interest, tax, depreciation and amortisation. Because it includes debt, it lets you compare companies with different amounts of borrowing fairly.</p>`,
          q: [{ q: 'Two companies have the same market cap. One has lots of debt, the other lots of cash. Which has the higher EV?', opts: ['The one with debt', 'The one with cash', 'They are equal', 'You can’t say'], a: 0, why: 'EV adds debt and subtracts cash.' },
            { q: 'Why might EV/EBITDA be better than P/E for comparing companies?', opts: ['It is not distorted by different debt levels', 'It is always lower', 'It ignores all costs', 'It uses the share price only'], a: 0, why: 'P/E is affected by how much interest a company pays; EV/EBITDA looks at the whole business.' },
            { q: 'Market cap $30bn, debt $10bn, cash $5bn. EV in $ billions?', num: 35, why: '30 + 10 − 5 = 35.' }] },
      ],
    },
    {
      id: 'quality', title: 'Quality and moats', blurb: 'Great businesses earn high returns and keep competitors out.',
      lessons: [
        { t: 'Return on equity', gen: ['roe'],
          tip: `<p><b>ROE</b> = net income ÷ shareholders’ equity. It shows how much profit the company makes with owners’ money. Over 15% year after year is strong.</p><p>The <b>DuPont</b> breakdown: ROE = net margin × asset turnover × leverage. A high ROE built on heavy debt is less impressive than one built on high margins.</p>`,
          q: [{ q: 'Net income $30m, equity $200m. ROE?', num: 0.15, pct: true, why: '30 ÷ 200 = 15%.' },
            { q: 'Two companies both have 20% ROE. A has no debt; B is heavily indebted. Which is higher quality?', opts: ['A', 'B', 'They are the same', 'Can’t tell from ROE'], a: 0, why: 'B’s ROE is boosted by leverage, which adds risk.' },
            { q: 'A company with consistently high ROE probably…', opts: ['has a competitive advantage', 'is about to go bust', 'has no profits', 'pays no tax'], a: 0, why: 'Competition usually drives returns down; lasting high returns suggest something protects them.' }] },
        { t: 'ROA and ROIC', gen: ['roa'],
          tip: `<ul><li><b>ROA</b> = net income ÷ total assets. Good for banks and asset-heavy firms.</li><li><b>ROIC</b> = after-tax operating profit ÷ (debt + equity invested). Many professionals see it as the best single quality measure.</li></ul><p>If ROIC is above the company’s cost of capital (often 8 to 10%), growth <b>creates</b> value. If it is below, growth <b>destroys</b> value.</p>`,
          q: [{ q: 'ROIC is 6% and the cost of capital is 9%. Growing the business…', opts: ['destroys value', 'creates value', 'makes no difference', 'doubles the share price'], a: 0, why: 'Each new dollar invested earns less than it costs to fund.' },
            { q: 'Which measure includes both debt and equity in the capital base?', opts: ['ROIC', 'ROE', 'Gross margin', 'EPS'], a: 0, why: 'ROIC looks at all the capital invested, however it was funded.' },
            { q: 'Net income $40m, total assets $1,000m. ROA?', num: 0.04, pct: true, why: '40 ÷ 1000 = 4%.' }] },
        { t: 'Economic moats', m: [['Brand', 'Customers pay more for the name'], ['Network effect', 'More users make it more useful'], ['Switching costs', 'Painful to move to a rival'], ['Cost advantage', 'Can sell cheaper and still profit'], ['Patents and licences', 'Legal protection from copying']],
          tip: `<p>A <b>moat</b> is a lasting advantage that protects profits from competitors. The main types:</p><ul><li><b>Brand</b>: Coca-Cola, Apple</li><li><b>Network effects</b>: Visa, marketplaces</li><li><b>Switching costs</b>: Microsoft, bank software</li><li><b>Cost advantage</b>: Costco, scale manufacturers</li><li><b>Intangibles</b>: patents, licences</li></ul><p>Evidence of a moat: high and stable margins and ROIC for many years.</p>`,
          q: [{ q: 'Visa becomes more useful as more shops and cardholders join. This moat is…', opts: ['a network effect', 'a cost advantage', 'a patent', 'switching costs'], a: 0, why: 'Each new user adds value for every other user.' },
            { q: 'Moving a company’s accounting system to a rival takes months and retraining. This moat is…', opts: ['switching costs', 'a brand', 'a network effect', 'a licence'], a: 0, why: 'Customers stay because leaving is costly and risky.' },
            { q: 'Which is the best evidence of a moat?', opts: ['High returns on capital sustained for a decade', 'One great quarter', 'A famous CEO', 'A rising share price'], a: 0, why: 'Without a moat, competitors would have eroded those returns.' }] },
      ],
    },
    {
      id: 'growth', title: 'Growth', blurb: 'How fast a business grows, and whether that growth is any good.',
      lessons: [
        { t: 'Measuring growth', gen: ['growth', 'cagr'],
          tip: `<p><b>Year-on-year growth</b> = (this year − last year) ÷ last year.</p><p>Over several years use <b>CAGR</b>, the compound annual growth rate: (end ÷ start)^(1/years) − 1. It smooths out bumpy years.</p><p>Rule of 72: something growing at 12% a year doubles in about 72 ÷ 12 = 6 years.</p>`,
          q: [{ q: 'Sales went from $200m to $250m. Growth?', num: 0.25, pct: true, why: '(250 − 200) ÷ 200 = 25%.' },
            { q: 'Earnings grow 12% a year. Roughly how many years to double?', num: 6, tol: 0.2, why: 'Rule of 72: 72 ÷ 12 = 6.' },
            { q: 'Revenue grew 50%, then fell 50%. Overall it is…', opts: ['down 25%', 'flat', 'up 25%', 'down 50%'], a: 0, why: '1.5 × 0.5 = 0.75.' }] },
        { t: 'Quality of growth', m: [['Organic growth', 'Growth from the existing business'], ['Acquisition growth', 'Growth from buying companies'], ['Same-store sales', 'Sales at shops open over a year'], ['Operating leverage', 'Profit grows faster than sales'], ['Guidance', 'Management’s forecast']],
          tip: `<p>Not all growth is equal. Better growth is:</p><ul><li><b>Organic</b>: from selling more, not from buying other companies</li><li><b>Profitable</b>: margins hold or rise as it grows</li><li><b>Per share</b>: EPS grows, not just total profit diluted by new shares</li></ul><p>For retailers, <b>same-store sales</b> strip out growth from simply opening new shops.</p>`,
          q: [{ q: 'Profit grew 20%, but share count grew 25%. EPS…', opts: ['fell', 'rose 20%', 'rose 45%', 'stayed the same'], a: 0, why: '1.20 ÷ 1.25 = 0.96: EPS is down 4%. Owners are worse off.' },
            { q: 'A retailer grows sales 15% by opening shops, but same-store sales fall 3%. Existing shops are…', opts: ['getting weaker', 'getting stronger', 'unchanged', 'closing'], a: 0, why: 'Strip out new shops and the core business is shrinking.' },
            { q: 'Which growth is usually most valuable?', opts: ['Organic growth with rising margins', 'Growth from expensive acquisitions', 'Growth funded by issuing shares', 'Growth from price cuts that shrink margins'], a: 0, why: 'It shows customers want more of the product, and each sale is getting more profitable.' }] },
        { t: 'Growth vs value', tip: `<p>Two classic styles:</p><ul><li><b>Value investing</b>: buy solid businesses on a low P/E or P/B, or a high yield, below what they are worth. Think Benjamin Graham.</li><li><b>Growth investing</b>: pay higher multiples for companies growing fast for many years. Think Philip Fisher.</li></ul><p>Buffett blended them: “a wonderful company at a fair price” beats “a fair company at a wonderful price”.</p>`,
          q: [{ q: 'A value investor is most attracted to…', opts: ['a low price relative to assets and earnings', 'the fastest-growing sales', 'the most famous brand', 'recent price momentum'], a: 0, why: 'Value investors look for a gap between price and value.' },
            { q: '“A wonderful company at a fair price” is a quote from…', opts: ['Warren Buffett', 'Isaac Newton', 'Karl Marx', 'Elon Musk'], a: 0, why: 'Buffett moved from pure Graham-style value towards quality.' },
            { q: 'The biggest risk in paying a P/E of 80 for a growth stock is…', opts: ['growth slowing, and the multiple collapsing', 'too many dividends', 'low volatility', 'the company being too profitable'], a: 0, why: 'High expectations are priced in. If growth disappoints, both earnings and the P/E can fall.' }] },
      ],
    },
    {
      id: 'divs', title: 'Dividend analysis', blurb: 'Is the dividend attractive, and is it safe?',
      lessons: [
        { t: 'Dividend yield', gen: ['divYield', 'liveYield', 'liveIncome'],
          tip: `<p><b>Dividend yield</b> = annual dividend per share ÷ share price.</p><p>A $50 share paying $2 a year yields 4%. When the price falls, the yield rises, even though nothing about the dividend changed.</p><p>Some questions here use the real stocks in your simulator: the Markets tab shows each yield.</p>`,
          q: [{ q: 'Price $40, dividend $1.60 a year. Yield?', num: 0.04, pct: true, why: '1.60 ÷ 40 = 4%.' },
            { q: 'A share falls from $50 to $25 while the dividend stays $2. The yield…', opts: ['doubles from 4% to 8%', 'halves', 'stays at 4%', 'becomes zero'], a: 0, why: 'Same dividend, half the price.' },
            { q: 'You invest $10,000 at a 3.5% yield. Yearly income before tax, in $?', num: 350, why: '10,000 × 0.035 = $350.' }] },
        { t: 'Is the dividend safe?', gen: ['payout', 'cover'], m: [['Payout ratio', 'Dividends ÷ earnings'], ['Dividend cover', 'Earnings ÷ dividends'], ['Yield trap', 'A high yield about to be cut'], ['FCF payout', 'Dividends ÷ free cash flow'], ['Dividend cut', 'Paying less than before']],
          tip: `<ul><li><b>Payout ratio</b> = dividends ÷ earnings. Under 60% leaves room; over 100% is unsustainable.</li><li><b>Dividend cover</b> = earnings ÷ dividend (the UK way). 2× or more is comfortable.</li><li>Also check dividends against <b>free cash flow</b>.</li></ul><p>A very high yield is often a <b>yield trap</b>: the price has fallen because the market expects a cut.</p>`,
          q: [{ q: 'A stock yields 11% while its sector averages 4%. The most likely reason is…', opts: ['the market expects the dividend to be cut', 'it is a hidden bargain for sure', 'it has no debt', 'it just split its shares'], a: 0, why: 'Extreme yields usually mean the price has fallen on bad news.' },
            { q: 'Payout ratio 130% means the company…', opts: ['pays out more than it earns', 'keeps 30% of profit', 'has 130% growth', 'is very safe'], a: 0, why: 'It must use cash reserves or borrowing to pay the gap.' },
            { q: 'Which dividend looks safest?', opts: ['Payout 45%, steady earnings, low debt', 'Payout 110%, high debt', 'Payout 95%, falling earnings', 'Payout 80%, a cyclical business'], a: 0, why: 'Plenty of room if profits dip, and a strong balance sheet.' }] },
        { t: 'Dividend growth', gen: ['yoc'],
          tip: `<p>A growing dividend can beat a high one. <b>Dividend aristocrats</b> have raised their dividend for 25+ years in a row.</p><p><b>Yield on cost</b> = today’s dividend ÷ the price you paid. Buy at a 3% yield, let the dividend grow 10% a year, and after 7 years you earn about 6% on your original money.</p>`,
          q: [{ q: 'A “dividend aristocrat” has…', opts: ['raised its dividend for 25+ years in a row', 'the highest yield', 'paid a dividend once', 'a royal shareholder'], a: 0, why: 'It is about a long record of increases, not the size of the yield.' },
            { q: 'You bought at $40. The dividend is now $3. Yield on cost?', num: 0.075, pct: true, why: '3 ÷ 40 = 7.5%.' },
            { q: 'Stock A yields 6% with no growth. Stock B yields 3% growing 12% a year. After about 7 years, B pays…', opts: ['about the same as A, and keeps growing', 'half of A', 'nothing', 'a fixed 3% forever'], a: 0, why: 'At 12% growth the dividend doubles in about 6 years, so B’s yield on cost passes 6% around year 7.' }] },
      ],
    },
    {
      id: 'health', title: 'Financial health and red flags', blurb: 'Spot the warning signs before the market does.',
      lessons: [
        { t: 'Interest cover and net debt', gen: ['intCover', 'netDebt'],
          tip: `<p><b>Interest cover</b> = operating profit (EBIT) ÷ interest expense. Below 2 is a danger zone; above 5 is comfortable.</p><p><b>Net debt ÷ EBITDA</b> says how many years of earnings it would take to pay off debt. Above 3 to 4 is high for most industries.</p>`,
          q: [{ q: 'EBIT $40m, interest $20m. Interest cover?', num: 2, tol: 0.01, why: '40 ÷ 20 = 2: thin protection.' },
            { q: 'Net debt is $12bn and EBITDA is $3bn. Net debt ÷ EBITDA?', num: 4, tol: 0.01, why: '12 ÷ 3 = 4: high for most industries.' },
            { q: 'A company has more cash than debt. Its net debt is…', opts: ['negative (net cash)', 'very high', 'exactly zero', 'unknowable'], a: 0, why: 'Net debt = debt − cash, which is below zero.' }] },
        { t: 'Red flags', m: [['Auditor resigns', 'Possible accounting problems'], ['Rising receivables', 'Customers not paying'], ['Constant “adjusted” profit', 'Hiding real costs'], ['Insider selling', 'Bosses cashing out'], ['Goodwill write-down', 'An acquisition went badly']],
          tip: `<p>Warning signs that deserve a closer look:</p><ul><li>Profits rising but <b>cash flow falling</b></li><li><b>Receivables</b> or <b>inventory</b> growing much faster than sales</li><li>Ever-larger <b>“adjusted”</b> profits versus reported ones</li><li>Frequent <b>share issuance</b>, rising debt</li><li>The <b>auditor</b> or finance chief leaving suddenly</li><li>Heavy <b>insider selling</b></li></ul>`,
          q: [{ q: 'Which is the biggest red flag?', opts: ['The auditor resigns and the CFO leaves the same month', 'The company raises its dividend', 'Revenue grows 8%', 'The CEO buys shares'], a: 0, why: 'Sudden exits by the people who check the numbers can signal accounting trouble.' },
            { q: 'Inventory up 60%, sales up 5%. This may mean…', opts: ['products aren’t selling', 'demand is booming', 'costs are falling', 'nothing at all'], a: 0, why: 'Unsold stock is piling up and may need writing down.' },
            { q: 'Directors buying shares with their own money is usually seen as…', opts: ['a positive sign', 'a red flag', 'illegal', 'irrelevant'], a: 0, why: 'Insiders buy for one reason: they think the price will rise. They sell for many reasons.' }] },
        { t: 'Compare like with like', tip: `<p>Ratios only mean something next to the right peers.</p><ul><li>A P/E of 12 is normal for a bank but cheap for software.</li><li><b>Cyclical</b> companies (cars, steel, oil) look cheapest at the peak, when profits are highest and about to fall.</li><li><b>REITs</b> are valued on FFO (funds from operations) and dividends; <b>banks</b> on P/B.</li><li><b>Defensive</b> sectors (food, utilities, healthcare) hold up better in recessions.</li></ul>`,
          q: [{ q: 'A steelmaker’s P/E is at a ten-year low after record profits. This could mean…', opts: ['profits are at a cyclical peak', 'it is definitely cheap', 'it never goes down', 'it has no debt'], a: 0, why: 'For cyclicals, the market prices in the coming fall in profits.' },
            { q: 'Which sector is usually most defensive in a recession?', opts: ['Consumer staples (food, household goods)', 'Luxury goods', 'Airlines', 'House builders'], a: 0, why: 'People still buy toothpaste and groceries in bad times.' },
            { q: 'REITs are usually analysed on…', opts: ['funds from operations (FFO)', 'price-to-sales', 'PEG', 'gross margin'], a: 0, why: 'Depreciation on buildings distorts net income, so FFO adds it back.' }] },
      ],
    },
    {
      id: 'intrinsic', title: 'Intrinsic value', blurb: 'Work out what a business is worth, then demand a discount.',
      lessons: [
        { t: 'Money now vs money later', gen: ['pv'],
          tip: `<p>$100 today is worth more than $100 next year, because today’s money can be invested.</p><p><b>Present value</b> = future cash ÷ (1 + r)^years, where r is your required return (the <b>discount rate</b>).</p><p>A share is worth the present value of all the cash it will ever return to owners.</p>`,
          q: [{ q: '$110 next year, discount rate 10%. Present value in $?', num: 100, tol: 0.05, why: '110 ÷ 1.1 = 100.' },
            { q: 'If the discount rate rises, present values…', opts: ['fall', 'rise', 'stay the same', 'double'], a: 0, why: 'You divide by a bigger number. This is why higher interest rates hurt share prices, especially growth stocks.' },
            { q: 'A share’s intrinsic value is…', opts: ['the present value of its future cash flows', 'yesterday’s price', 'its book value', 'the average analyst target'], a: 0, why: 'That is the definition behind every DCF model.' }] },
        { t: 'Discounted cash flow', gen: ['gordon'], m: [['DCF', 'Value from discounted future cash'], ['Discount rate', 'Your required return'], ['Terminal value', 'Value of all cash beyond the forecast'], ['Gordon growth model', 'D ÷ (r − g)'], ['Intrinsic value', 'What the business is really worth']],
          tip: `<p>A <b>DCF</b> (discounted cash flow) model:</p><ul><li>Forecast free cash flow for 5 to 10 years</li><li>Add a <b>terminal value</b> for everything after</li><li>Discount it all back to today</li></ul><p>The simple <b>Gordon growth model</b> values a steady dividend payer: <b>value = next dividend ÷ (r − g)</b>.</p><p>DCFs are very sensitive to the growth and discount rates you pick. Small changes, big swings.</p>`,
          q: [{ q: 'Next dividend $2, required return 9%, growth 4%. Gordon value in $?', num: 40, tol: 0.05, why: '2 ÷ (0.09 − 0.04) = 2 ÷ 0.05 = $40.' },
            { q: 'In a DCF, the terminal value often makes up…', opts: ['most of the total value', 'almost nothing', 'exactly 10%', 'only the debt'], a: 0, why: 'Cash flows beyond year 10 usually dominate, which is why assumptions matter so much.' },
            { q: 'Why can’t growth (g) be above the discount rate (r) in the Gordon model?', opts: ['The formula breaks: value would be negative or infinite', 'It is illegal', 'Dividends can’t grow', 'Rates are always zero'], a: 0, why: 'Nothing grows faster than the economy forever, and r − g must be positive.' }] },
        { t: 'Margin of safety', gen: ['mos', 'graham'],
          tip: `<p>Your value estimate will be wrong, so buy well below it. Benjamin Graham called this the <b>margin of safety</b>:</p><p>(intrinsic value − price) ÷ intrinsic value</p><p>Many value investors want 25 to 50%. Graham also gave a rough check, the <b>Graham number</b> = √(22.5 × EPS × book value per share).</p>`,
          q: [{ q: 'You value a share at $100. It trades at $70. Margin of safety?', num: 0.3, pct: true, why: '(100 − 70) ÷ 100 = 30%.' },
            { q: 'The margin of safety protects you against…', opts: ['errors in your own estimate and bad luck', 'all losses forever', 'taxes', 'dividends being paid'], a: 0, why: 'It leaves room for being wrong.' },
            { q: 'Benjamin Graham wrote…', opts: ['The Intelligent Investor', 'The Wealth of Nations', 'Rich Dad Poor Dad', 'The Big Short'], a: 0, why: 'Buffett calls it the best book about investing ever written.' }] },
      ],
    },
    {
      id: 'process', title: 'Building an investment case', blurb: 'Pull it all together like a professional analyst.',
      lessons: [
        { t: 'The investment thesis', m: [['Thesis', 'Why you own it, in a few sentences'], ['Catalyst', 'An event that could unlock value'], ['Bull case', 'What happens if things go well'], ['Bear case', 'What happens if things go badly'], ['Circle of competence', 'Businesses you truly understand']],
          tip: `<p>Before buying, write a short <b>thesis</b>:</p><ul><li>What does the business do, and how does it make money?</li><li>What is its moat?</li><li>Are the financials healthy (margins, debt, cash flow)?</li><li>What is it worth, and is the price below that?</li><li>What could go wrong (the <b>bear case</b>)?</li></ul><p>Stay in your <b>circle of competence</b>: invest in businesses you understand.</p>`,
          q: [{ q: 'Which should come first in your research?', opts: ['Understanding how the business makes money', 'Checking yesterday’s price move', 'Reading social media', 'Setting a stop loss'], a: 0, why: 'If you can’t explain the business model, you can’t value it.' },
            { q: 'Why write down a bear case?', opts: ['To know in advance what would prove you wrong', 'To scare yourself', 'Regulators require it', 'To lower your taxes'], a: 0, why: 'It helps you sell for the right reasons, not from panic or hope.' },
            { q: 'Your thesis was “margins will rise”, but they have fallen for three years. You should…', opts: ['re-examine the thesis honestly', 'buy more without checking', 'ignore it', 'only look at the share price'], a: 0, why: 'When the facts change, the thesis must be tested again.' }] },
        { t: 'Reading an earnings report', tip: `<p>Each quarter companies report results. The share price reacts to results <b>versus expectations</b>, not versus last year.</p><ul><li><b>Consensus</b>: the average analyst forecast</li><li>A <b>beat</b> or <b>miss</b>: results above or below consensus</li><li><b>Guidance</b>: management’s outlook, often more important than the quarter itself</li></ul>`,
          q: [{ q: 'Profits rise 20%, analysts expected 30%, and the share falls. Why?', opts: ['Results missed expectations', 'Profits fell', 'The market is broken', 'Dividends were raised'], a: 0, why: 'Prices already reflect expectations; the surprise is what moves them.' },
            { q: 'A company beats this quarter but cuts its full-year guidance. The share often…', opts: ['falls', 'soars', 'is unchanged', 'is delisted'], a: 0, why: 'Investors care more about the future than the quarter just gone.' },
            { q: '“Consensus” means…', opts: ['the average analyst forecast', 'the CEO’s opinion', 'last year’s result', 'the dividend'], a: 0, why: 'It is the benchmark results are judged against.' }] },
        { t: 'Thinking traps', m: [['Anchoring', 'Fixating on the price you paid'], ['Confirmation bias', 'Seeking only agreeing evidence'], ['Value trap', 'Cheap for a reason, stays cheap'], ['Overconfidence', 'Trusting your estimate too much'], ['Herding', 'Buying because everyone else is']],
          tip: `<p>Good analysis can be undone by bad psychology:</p><ul><li><b>Anchoring</b>: “I’ll sell when it gets back to what I paid.” The market doesn’t care what you paid.</li><li><b>Confirmation bias</b>: only reading the bull case.</li><li><b>Value trap</b>: cheap because the business is shrinking.</li><li><b>Herding</b>: buying a story because everyone else is.</li></ul>`,
          q: [{ q: '“I’ll hold until it gets back to my buying price.” This is…', opts: ['anchoring', 'diversification', 'a margin of safety', 'dividend investing'], a: 0, why: 'Your purchase price has no bearing on the business’s value.' },
            { q: 'A stock looks cheap on P/E every year, but profits keep shrinking. It is probably…', opts: ['a value trap', 'a hidden gem', 'a growth stock', 'risk-free'], a: 0, why: 'Cheap and getting cheaper because the business is in decline.' },
            { q: 'The best defence against confirmation bias is to…', opts: ['seek out the strongest argument against your idea', 'only read bullish reports', 'trade more often', 'check the price hourly'], a: 0, why: 'Charlie Munger: know the other side’s argument better than they do.' }] },
      ],
    },
    {
      id: 'charts', title: 'Price charts and timing', blurb: 'Fundamentals tell you what to buy. Charts show how the market feels about it.', guideFromLearn: true,
      lessons: [
        { t: 'Candles and trends', gen: ['trendSpot'], tip: `<p>Fundamental analysts focus on value, but the chart shows the market’s mood. Each <b>candle</b> is one day: the body runs from open to close, the wicks reach the high and low. <b class="up">Green</b> closed higher than it opened; <b class="down">red</b> closed lower.</p><p>An <b>uptrend</b> is a staircase of <b>higher highs and higher lows</b>. A <b>downtrend</b> makes lower highs and lower lows. A <b>sideways</b> market bounces between a floor and a ceiling.</p>`,
          m: [['Uptrend', 'Higher highs and higher lows'], ['Downtrend', 'Lower highs and lower lows'], ['Sideways', 'Bouncing in a range'], ['Green candle', 'Closed above its open'], ['Wick', 'Shows the day’s high or low']],
          q: [{ q: 'What kind of market is this?', fig: 'uptrend', plain: true, opts: ['Uptrend', 'Downtrend', 'Sideways'], a: 0, why: 'Each peak and each dip is higher than the last: a staircase going up.' },
            { q: 'What kind of market is this?', fig: 'downtrend', plain: true, opts: ['Uptrend', 'Downtrend', 'Sideways'], a: 1, why: 'Lower highs and lower lows: each bounce fails below the last peak.' },
            { q: 'What kind of market is this?', fig: 'sideways', plain: true, opts: ['Uptrend', 'Downtrend', 'Sideways'], a: 2, why: 'The price keeps bouncing between the same floor and ceiling.' },
            { q: 'A great business whose shares are in a steep downtrend is…', opts: ['worth researching: is the market wrong, or seeing a problem?', 'always a buy', 'always a sell', 'unrelated to its business'], a: 0, why: 'Falling prices can create value opportunities, or warn of trouble the numbers don’t show yet.' }] },
        { t: 'Support, resistance and volume', tip: `<p><b>Support</b> is a floor where falls keep stopping; <b>resistance</b> is a ceiling where rises keep stopping.</p><p>A <b>breakout</b> through resistance often turns the old ceiling into new support. Breakouts on <b>heavy volume</b> are more convincing than quiet ones.</p>`,
          m: [['Support', 'A floor where falls stop'], ['Resistance', 'A ceiling where rises stop'], ['Breakout', 'A clear move through a level'], ['Retest', 'A dip back to the old ceiling'], ['Volume', 'How many shares traded']],
          q: [{ q: 'After the breakout in this chart, the old resistance line acted as…', fig: 'levels', opts: ['new support', 'stronger resistance', 'nothing at all', 'a moving average'], a: 0, why: 'The price dipped back to the old ceiling, found buyers there and bounced: old resistance became new support.' },
            { q: 'What makes the breakout in this chart convincing?', fig: 'volume', opts: ['It happened on very heavy volume', 'The candles were red', 'It happened on a Monday', 'The price was below $100'], a: 0, why: 'Volume spiked as the price broke out, showing lots of traders agreed.' },
            { q: 'A breakout on very low volume is…', opts: ['less convincing', 'more convincing', 'guaranteed to continue', 'impossible'], a: 0, why: 'Few traders took part, so it can easily fizzle.' }] },
        { t: 'Moving averages and pullbacks', gen: ['trendSpot'], tip: `<p>A <b>moving average</b> smooths out daily noise. Price above a rising average suggests an uptrend. A short average crossing <i>above</i> a long one is a <b>golden cross</b>; crossing below is a <b>death cross</b>.</p><p>A <b>pullback</b> is a short dip inside an uptrend. For a long-term investor it can be a chance to buy a good business a little cheaper.</p>`,
          m: [['Golden cross', 'Short average crosses above long'], ['Death cross', 'Short average crosses below long'], ['Pullback', 'A short dip inside an uptrend'], ['Moving average', 'Average price over recent days'], ['Lagging', 'Confirms rather than predicts']],
          q: [{ q: 'What does the green dot in this chart mark?', fig: 'averages', opts: ['A golden cross', 'A death cross', 'A dividend', 'A stock split'], a: 0, why: 'The short (20-day) average crossed above the long (50-day) average: an early sign of a new uptrend.' },
            { q: 'The dips marked in this chart are…', fig: 'pullbacks', opts: ['pullbacks within an uptrend', 'the start of a crash', 'dividend payments', 'stock splits'], a: 0, why: 'Each dip stops above the last low and the uptrend carries on.' },
            { q: 'For a long-term fundamental investor, charts are best used to…', opts: ['help time entries, not decide what a business is worth', 'replace reading the accounts', 'predict earnings exactly', 'calculate the P/E'], a: 0, why: 'Value comes from the business; the chart only shows sentiment.' }] },
      ],
    },
  ];

  const RANKS = [
    [0, 'Trainee'], [100, 'Junior Analyst'], [300, 'Equity Analyst'], [600, 'Senior Analyst'],
    [1000, 'Sector Specialist'], [1600, 'Research Director'], [2500, 'Portfolio Manager'], [4000, 'Chief Investment Officer'],
  ];

  window.AcademyContent = { UNITS, GEN, RANKS, SPRINT_GENS: ['pe', 'divYield', 'payout', 'margin', 'eps', 'mcap', 'growth', 'ev', 'roe'], COURSE: 'fundamentals-1' };
})();
