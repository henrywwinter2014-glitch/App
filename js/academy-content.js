/*
 * Quant Academy course content.
 *
 * Question shapes:
 *   { q, opts: [...], a: index, why }                 multiple choice
 *   { q, num: answer, tol?, pct?, unit?, why }         number answer (pct: answer is a fraction, "25%" or "0.25" both accepted)
 * Optional: code (shown as a code block), show (how to display the answer).
 * Generators (GEN) build fresh questions from a seeded random function.
 */
(function () {
  'use strict';

  const r2 = (v) => Math.round(v * 100) / 100;
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
  const nCr = (n, k) => fact(n) / (fact(k) * fact(n - k));

  // Wrong-but-plausible choices around a numeric answer, for multiple choice.
  function near(r, ans, fmt, spread) {
    const set = new Set([fmt(ans)]);
    const opts = [ans];
    let guard = 0;
    while (opts.length < 4 && guard++ < 50) {
      const v = ans * (1 + (r() < 0.5 ? -1 : 1) * (spread || 0.2) * (0.4 + r()));
      const f = fmt(v);
      if (!set.has(f)) { set.add(f); opts.push(v); }
    }
    const shuffled = opts.map((v) => [r(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    return { opts: shuffled.map(fmt), a: shuffled.indexOf(ans) };
  }

  const GEN = {
    mul: (r) => { let a = int(r, 12, 99); if (a % 10 === 0) a += int(r, 1, 9); const b = int(r, 3, 9); return { q: `${a} × ${b} = ?`, num: a * b, why: `${a} × ${b} = ${a * b}. Split it: ${Math.floor(a / 10) * 10} × ${b} + ${a % 10} × ${b}.` }; },
    mulTrick: (r) => {
      const k = pick(r, [5, 25, 11]);
      if (k === 5) { const n = int(r, 14, 98); return { q: `${n} × 5 = ?`, num: n * 5, why: `Times 5 is times 10, then halve: ${n * 10} ÷ 2 = ${n * 5}.` }; }
      if (k === 25) { const n = int(r, 4, 48); return { q: `${n} × 25 = ?`, num: n * 25, why: `Times 25 is times 100, then divide by 4: ${n * 100} ÷ 4 = ${n * 25}.` }; }
      const n = int(r, 12, 89); return { q: `${n} × 11 = ?`, num: n * 11, why: `Times 11 is times 10 plus the number: ${n * 10} + ${n} = ${n * 11}.` };
    },
    sq: (r) => { const n = int(r, 11, 30); return { q: `${n}² = ?`, num: n * n, why: `${n} × ${n} = ${n * n}. Quants memorise squares up to at least 25.` }; },
    diffSq: (r) => { const m = int(r, 2, 9) * 10, d = int(r, 1, 4); return { q: `${m - d} × ${m + d} = ?`, num: m * m - d * d, why: `(${m} − ${d})(${m} + ${d}) = ${m}² − ${d}² = ${m * m} − ${d * d} = ${m * m - d * d}.` }; },
    add: (r) => { const a = int(r, 120, 999), b = int(r, 100, 899), plus = r() < 0.5; return { q: `${a} ${plus ? '+' : '−'} ${b} = ?`, num: plus ? a + b : a - b, why: `${a} ${plus ? '+' : '−'} ${b} = ${plus ? a + b : a - b}.` }; },
    pctOf: (r) => { const p = pick(r, [5, 10, 12.5, 15, 20, 25, 30, 40, 60, 75]), x = pick(r, [40, 60, 80, 120, 160, 200, 240, 320, 480]); return { q: `What is ${p}% of ${x}?`, num: p / 100 * x, why: `${p}% of ${x} = ${p / 100} × ${x} = ${r2(p / 100 * x)}. Tip: x% of y equals y% of x.` }; },
    pctChange: (r) => { const a = pick(r, [40, 50, 80, 100, 125, 200]), c = pick(r, [-0.5, -0.25, -0.2, -0.1, 0.1, 0.2, 0.25, 0.5]); const b = a * (1 + c); return { q: `A price moves from ${a} to ${r2(b)}. What is the % change?`, num: c, pct: true, why: `(${r2(b)} − ${a}) ÷ ${a} = ${Math.round(c * 100)}%.` }; },
    fracDec: (r) => {
      const f = pick(r, [[1, 8], [3, 8], [1, 6], [5, 6], [1, 7], [2, 3], [3, 4], [1, 9], [7, 8], [5, 16]]);
      const v = f[0] / f[1];
      const m = near(r, v, (x) => x.toFixed(4), 0.25);
      return { q: `${f[0]}/${f[1]} as a decimal is about…`, opts: m.opts, a: m.a, why: `${f[0]} ÷ ${f[1]} = ${v.toFixed(4)}. Knowing eighths, sixths and sevenths by heart saves time in interviews.` };
    },
    pow2: (r) => { const n = int(r, 5, 12); return { q: `2^${n} = ?`, num: Math.pow(2, n), why: `2^${n} = ${Math.pow(2, n)}. Remember 2^10 = 1024 ≈ 1,000.` }; },
    diceSum: (r) => { const k = int(r, 2, 12), c = 6 - Math.abs(k - 7); return { q: `Two fair dice are rolled. What is the probability their sum is ${k}?`, num: c / 36, tol: 0.002, show: `${c}/36 ≈ ${(c / 36).toFixed(3)}`, why: `There are 36 equally likely outcomes and ${c} of them sum to ${k}, so ${c}/36.` }; },
    atLeastOne: (r) => { const n = int(r, 2, 4), p = 1 - Math.pow(5 / 6, n); return { q: `Roll a fair die ${n} times. What is the probability of at least one 6?`, num: p, tol: 0.005, show: p.toFixed(3), why: `Use the complement: 1 − P(no sixes) = 1 − (5/6)^${n} = ${p.toFixed(3)}.` }; },
    evGame: (r) => { const p = int(r, 1, 6) / 10, w = int(r, 4, 20), l = int(r, 2, 10); const ev = p * w - (1 - p) * l; return { q: `A game pays $${w} with probability ${p} and costs you $${l} otherwise. What is its expected value in $?`, num: ev, tol: 0.01, why: `EV = ${p} × ${w} − ${r2(1 - p)} × ${l} = ${r2(ev)}. ${ev > 0 ? 'Positive: worth playing many times.' : 'Negative: you lose on average.'}` }; },
    nCr: (r) => { const n = int(r, 5, 12), k = int(r, 2, 4); return { q: `How many ways can you choose ${k} items from ${n} (order does not matter)?`, num: nCr(n, k), why: `C(${n}, ${k}) = ${n}! / (${k}! × ${n - k}!) = ${nCr(n, k)}.` }; },
    nPr: (r) => { const n = int(r, 5, 9), k = int(r, 2, 3); const v = fact(n) / fact(n - k); return { q: `How many ways can ${k} different prizes go to ${n} people (one prize each, order matters)?`, num: v, why: `${n} choices for the first, ${n - 1} for the next${k === 3 ? `, ${n - 2} for the third` : ''}: ${v}.` }; },
    mean: (r) => { const xs = [0, 0, 0, 0, 0].map(() => int(r, 1, 20)); const m = xs.reduce((a, b) => a + b, 0) / 5; return { q: `What is the mean of ${xs.join(', ')}?`, num: m, why: `Sum ${xs.reduce((a, b) => a + b, 0)} ÷ 5 = ${m}.` }; },
    compound: (r) => { const P = pick(r, [1000, 5000, 10000]), rt = pick(r, [3, 5, 7, 8]), t = pick(r, [2, 3, 5, 10]); const v = P * Math.pow(1 + rt / 100, t); return { q: `$${P.toLocaleString()} grows at ${rt}% a year, compounded yearly, for ${t} years. What is it worth, to the nearest dollar?`, num: v, tol: Math.max(2, v * 0.003), why: `${P.toLocaleString()} \u00d7 ${1 + rt / 100}^${t} = ${Math.round(v).toLocaleString()}.` }; },
    pv: (r) => { const F = pick(r, [100, 500, 1000]), rt = pick(r, [4, 5, 8, 10]), t = pick(r, [1, 2, 3]); const v = F / Math.pow(1 + rt / 100, t); return { q: `What is $${F} received in ${t} year${t > 1 ? 's' : ''} worth today, at a ${rt}% discount rate?`, num: v, tol: Math.max(0.5, v * 0.003), why: `PV = ${F} ÷ ${(1 + rt / 100)}^${t} = ${r2(v)}.` }; },
    payoff: (r) => { const K = pick(r, [90, 95, 100, 105, 110]), S = K + pick(r, [-20, -12, -5, 0, 6, 15, 25]), call = r() < 0.5; const v = call ? Math.max(S - K, 0) : Math.max(K - S, 0); return { q: `A ${call ? 'call' : 'put'} with strike ${K} expires with the stock at ${S}. What is its payoff per share?`, num: v, why: `${call ? 'Call' : 'Put'} payoff = max(${call ? `S − K` : `K − S`}, 0) = max(${call ? S - K : K - S}, 0) = ${v}.` }; },
    trendSpot: (r) => (window.Learn ? window.Learn.trendQuestion(r) : { q: 'Higher highs and higher lows describe…', opts: ['an uptrend', 'a downtrend', 'a sideways market'], a: 0, why: 'A staircase going up.' }),
    spread: (r) => { const n = pick(r, [100, 500, 1000, 2000]), sp = pick(r, [0.01, 0.02, 0.05, 0.1]); return { q: `You buy ${n.toLocaleString()} shares at the ask and immediately sell them at the bid. The spread is $${sp.toFixed(2)}. How much do you lose in $?`, num: n * sp, tol: 0.01, why: `You lose the spread on every share: ${n} × ${sp.toFixed(2)} = $${r2(n * sp)}.` }; },
  };

  const UNITS = [
    {
      id: 'math', title: 'Mental maths', blurb: 'Fast, accurate arithmetic: the first filter in every trading interview.',
      lessons: [
        { t: 'Multiplication tricks', gen: ['mul', 'mulTrick', 'diffSq'], tip: `<p>Trading firms test arithmetic under time pressure. A few tricks make it far easier:</p><ul><li><b>×5</b>: multiply by 10, then halve. 46 × 5 = 460 ÷ 2 = 230.</li><li><b>×25</b>: multiply by 100, then divide by 4.</li><li><b>×11</b>: multiply by 10 and add the number.</li><li><b>Near a round number</b>: 49 × 51 = 50² − 1² = 2,499.</li></ul>`,
          q: [{ q: '19 × 21 = ?', num: 399, why: '(20 − 1)(20 + 1) = 400 − 1 = 399.' }, { q: '98 × 7 = ?', num: 686, why: '100 × 7 − 2 × 7 = 700 − 14 = 686.' }] },
        { t: 'Percentages and fractions', m: [['1/8', '0.125'], ['1/6', '0.1667'], ['1/7', '0.1429'], ['3/4', '0.75'], ['2/3', '0.6667']], gen: ['pctOf', 'pctChange', 'fracDec'], tip: `<p>Percentages are everywhere in finance. Two habits help:</p><ul><li><b>x% of y = y% of x</b>. 8% of 50 is the same as 50% of 8 = 4.</li><li>Know common fractions as decimals: 1/8 = 0.125, 1/6 ≈ 0.1667, 1/7 ≈ 0.1429, 1/9 ≈ 0.111.</li></ul><p>A % change is (new − old) ÷ old.</p>`,
          q: [{ q: 'What is 8% of 50?', num: 4, why: '8% of 50 = 50% of 8 = 4.' }, { q: 'A stock falls 20% then rises 20%. Overall it is…', opts: ['back where it started', 'down 4%', 'up 4%', 'down 2%'], a: 1, why: '0.8 × 1.2 = 0.96, so it is down 4%. Percentage moves don’t cancel out.' }] },
        { t: 'Numbers to know by heart', m: [['e', '2.718'], ['ln 2', '0.693'], ['√2', '1.414'], ['2^10', '1,024'], ['√252', '≈ 15.9']], gen: ['sq', 'pow2'], tip: `<p>Quants carry a few constants in their heads:</p><ul><li>2^10 = 1,024 ≈ one thousand</li><li>√2 ≈ 1.414, √3 ≈ 1.732</li><li>e ≈ 2.718, ln 2 ≈ 0.693</li><li><b>Rule of 72</b>: money doubles in about 72 ÷ (rate %) years.</li><li>√252 ≈ 15.9 (trading days in a year), used to annualise volatility.</li></ul>`,
          q: [{ q: 'Rule of 72: at 8% a year, roughly how many years until your money doubles?', num: 9, tol: 0.01, why: '72 ÷ 8 = 9 years. (The exact answer is 9.0.)' }, { q: 'ln(2) is approximately…', opts: ['0.301', '0.5', '0.693', '1.414'], a: 2, why: 'ln 2 ≈ 0.693. 0.301 is log10(2).' }, { q: '√2 to two decimal places?', num: 1.41, tol: 0.006, why: '√2 ≈ 1.4142.' }, { q: 'e is approximately…', opts: ['2.718', '3.142', '1.618', '2.303'], a: 0, why: 'e ≈ 2.71828. 3.142 is π and 1.618 is the golden ratio.' }] },
      ],
    },
    {
      id: 'prob', title: 'Probability', blurb: 'The language of uncertainty, and the core of every quant interview.',
      lessons: [
        { t: 'The basics', gen: ['diceSum'], m: [['P(heads)', '1/2'], ['P(two dice sum to 7)', '1/6'], ['P(drawing an ace)', '1/13'], ['P(two sixes)', '1/36'], ['P(not a 6)', '5/6']], tip: `<p><b>Probability</b> = favourable outcomes ÷ all equally likely outcomes. It is always between 0 and 1.</p><p>The <b>complement</b> trick: P(something happens) = 1 − P(it doesn’t). “At least one” questions are almost always easier this way.</p>`,
          q: [{ q: 'A fair die is rolled. Probability of an even number?', num: 0.5, why: '3 of the 6 faces are even: 3/6 = 0.5.' }, { q: 'Toss a fair coin 3 times. Probability of at least one head?', num: 0.875, tol: 0.002, show: '7/8 = 0.875', why: '1 − P(all tails) = 1 − 1/8 = 7/8.' }, { q: 'Probability of drawing an ace from a shuffled 52-card deck?', num: 1 / 13, tol: 0.002, show: '1/13 ≈ 0.077', why: '4 aces out of 52 cards = 1/13.' }, { q: 'Probability of NOT rolling a 6 on a fair die?', num: 5 / 6, tol: 0.003, show: '5/6 ≈ 0.833', why: '1 − 1/6 = 5/6.' }] },
        { t: 'Independence and conditioning', gen: ['atLeastOne'], tip: `<p>Events are <b>independent</b> if one tells you nothing about the other. Then P(A and B) = P(A) × P(B).</p><p><b>Conditional probability</b>: P(A | B) = P(A and B) ÷ P(B). Ask: “given what I now know, which outcomes are still possible?”</p>`,
          q: [{ q: 'Two fair dice. Probability both show a 6?', num: 1 / 36, tol: 0.001, show: '1/36 ≈ 0.028', why: 'Independent: 1/6 × 1/6 = 1/36.' }, { q: 'Draw two cards without replacement. Probability both are aces?', num: 1 / 221, tol: 0.0005, show: '1/221 ≈ 0.0045', why: '4/52 × 3/51 = 12/2652 = 1/221.' }, { q: 'A family has two children and at least one is a boy. Probability both are boys?', num: 1 / 3, tol: 0.003, show: '1/3', why: 'Possible families: BB, BG, GB (GG is ruled out). Only 1 of these 3 is BB.' }, { q: 'A fair coin has landed heads 5 times in a row. Probability the next toss is heads?', num: 0.5, why: 'Tosses are independent: still 0.5. Believing otherwise is the gambler’s fallacy.' }] },
        { t: 'Bayes’ theorem', m: [['Prior', 'Belief before the evidence'], ['Likelihood', 'P(evidence | hypothesis)'], ['Posterior', 'Belief after the evidence'], ['Independent', 'One tells you nothing about the other'], ['Complement', '1 − P(event)']], tip: `<p><b>Bayes</b> updates a belief with evidence:</p><p>P(A | B) = P(B | A) × P(A) ÷ P(B)</p><p>The trap is <b>base-rate neglect</b>: forgetting how rare something was to begin with. A good test for a rare disease still gives mostly false alarms.</p>`,
          q: [{ q: '1% of people have a disease. A test catches 99% of cases but also flags 5% of healthy people. You test positive. Probability you have the disease?', num: 0.0099 / 0.0594, tol: 0.01, show: '≈ 0.167', why: 'P(+) = 0.99×0.01 + 0.05×0.99 = 0.0594. P(disease | +) = 0.0099 / 0.0594 ≈ 16.7%.' }, { q: 'Bag A has 3 red and 1 blue ball. Bag B has 1 red and 3 blue. You pick a bag at random and draw a red ball. Probability it came from bag A?', num: 0.75, tol: 0.005, why: '(½ × ¾) ÷ (½ × ¾ + ½ × ¼) = 0.375 / 0.5 = 0.75.' }, { q: '“Base-rate neglect” means…', opts: ['ignoring how common something was before the evidence', 'using too many decimal places', 'assuming events are independent', 'rounding probabilities to 0 or 1'], a: 0, why: 'People overweight the new evidence and forget the prior probability.' }] },
      ],
    },
    {
      id: 'ev', title: 'Expected value', blurb: 'Pricing bets, games and trades by what they are worth on average.',
      lessons: [
        { t: 'What is expected value?', gen: ['evGame'], tip: `<p><b>Expected value</b> (EV) is the probability-weighted average outcome: EV = Σ p × payoff.</p><p>It is the <b>fair price</b> of a bet: pay less than the EV and you profit on average over many tries.</p>`,
          q: [{ q: 'Expected value of one roll of a fair die?', num: 3.5, why: '(1+2+3+4+5+6) ÷ 6 = 3.5.' }, { q: 'Expected value of the sum of two fair dice?', num: 7, why: 'Linearity of expectation: 3.5 + 3.5 = 7.' }, { q: 'A $2 lottery ticket gives a 1 in 1,000,000 chance of winning $1,000,000. Expected profit in $?', num: -1, why: 'EV of winnings = $1, minus the $2 cost = −$1.' }] },
        { t: 'Waiting times', m: [['EV of one die roll', '3.5'], ['Rolls until a 6', '6'], ['Tosses until a head', '2'], ['EV of two dice', '7']], tip: `<p>If something happens with probability p each try, the expected number of tries until it first happens is <b>1 ÷ p</b>.</p><p>Expected value is <b>linear</b>: E[X + Y] = E[X] + E[Y], even when X and Y are not independent. Interviewers love this.</p>`,
          q: [{ q: 'Expected number of fair coin tosses until the first head?', num: 2, why: 'p = ½, so 1 ÷ ½ = 2.' }, { q: 'Expected number of die rolls until you see a 6?', num: 6, why: 'p = 1/6, so 6 rolls on average.' }, { q: 'You roll a die and are paid the number in $. You may re-roll once, but must keep the second roll. With the best strategy, what is the game worth?', num: 4.25, tol: 0.01, why: 'Keep 4, 5 or 6; re-roll 1-3 (worth 3.5). EV = (4+5+6)/6 + (3/6)(3.5) = 2.5 + 1.75 = 4.25.' }] },
        { t: 'Sizing bets', tip: `<p>Positive EV isn’t enough: you must survive the losses. The <b>Kelly criterion</b> sizes a bet to grow wealth fastest:</p><p>f = p − q ÷ b</p><p>where p is the win probability, q = 1 − p, and b is the net odds (win b per 1 staked). Many traders bet a fraction of Kelly to reduce swings.</p>`,
          q: [{ q: 'A coin wins 60% of the time at even money (b = 1). What fraction of your bankroll does Kelly bet?', num: 0.2, pct: true, why: 'f = 0.6 − 0.4 / 1 = 0.2, i.e. 20%.' }, { q: 'If a bet has negative expected value, Kelly says to bet…', opts: ['nothing', 'a small amount', 'everything', 'double'], a: 0, why: 'f comes out at or below zero: don’t take the bet.' }, { q: 'Why do many professionals bet “half Kelly”?', opts: ['To reduce volatility, at a small cost to growth', 'Because Kelly is illegal', 'To maximise expected value', 'Because it always earns more'], a: 0, why: 'Half Kelly gives about three quarters of the growth with far smaller drawdowns, and protects against overestimating your edge.' }] },
      ],
    },
    {
      id: 'comb', title: 'Combinatorics', blurb: 'Counting the ways things can happen.',
      lessons: [
        { t: 'Arrangements', gen: ['nPr'], tip: `<p>The <b>multiplication rule</b>: if one choice has m options and the next has n, together they have m × n.</p><p>Arranging n different items: <b>n!</b> = n × (n−1) × … × 1. Arranging k of n in order: n! ÷ (n−k)!</p>`,
          q: [{ q: '5! = ?', num: 120, why: '5 × 4 × 3 × 2 × 1 = 120.' }, { q: 'How many ways to arrange the letters of QUANT?', num: 120, why: '5 different letters: 5! = 120.' }, { q: 'How many ways to arrange the letters of BOOK?', num: 12, why: '4! ÷ 2! = 12, dividing out the two identical Os.' }] },
        { t: 'Choosing groups', m: [['3!', '6'], ['4!', '24'], ['C(5,2)', '10'], ['C(6,3)', '20'], ['C(8,2)', '28']], gen: ['nCr'], tip: `<p>When order doesn’t matter, use <b>combinations</b>:</p><p>C(n, k) = n! ÷ (k! (n−k)!)</p><p>Shortcut: C(n, 2) = n(n−1)/2, e.g. the number of handshakes in a room.</p>`,
          q: [{ q: 'How many ways to choose 3 people from 10?', num: 120, why: 'C(10,3) = 10×9×8 / 6 = 120.' }, { q: '8 people each shake hands once with everyone else. How many handshakes?', num: 28, why: 'C(8,2) = 8 × 7 / 2 = 28.' }, { q: 'On a grid you move only right or up. How many shortest paths go 3 right and 3 up?', num: 20, why: 'Choose which 3 of the 6 moves are “right”: C(6,3) = 20.' }] },
        { t: 'Counting probabilities', tip: `<p>Many probability questions are counting questions in disguise: count the favourable outcomes, count all outcomes, divide.</p><p>The <b>pigeonhole principle</b>: put n+1 items into n boxes and some box holds at least two.</p>`,
          q: [{ q: 'A 5-card poker hand is dealt. How many possible hands are there?', opts: ['2,598,960', '311,875,200', '52', '120'], a: 0, why: 'C(52,5) = 2,598,960. 311,875,200 counts ordered hands.' }, { q: 'How many people must be in a room to guarantee two share a birth month?', num: 13, why: 'Pigeonhole: 12 months, so 13 people guarantees a match.' }, { q: 'Flip 4 fair coins. Probability of exactly 2 heads?', num: 0.375, tol: 0.002, show: '6/16 = 0.375', why: 'C(4,2) = 6 of the 16 outcomes: 6/16 = 0.375.' }] },
      ],
    },
    {
      id: 'stats', title: 'Statistics', blurb: 'Describing data, spread and relationships.',
      lessons: [
        { t: 'Centre and spread', m: [['Mean', 'The average'], ['Median', 'The middle value'], ['Variance', 'Average squared distance from the mean'], ['Standard deviation', 'Square root of the variance'], ['z-score', 'Distance from the mean in sds']], gen: ['mean'], tip: `<p><b>Mean</b>: the average. <b>Median</b>: the middle value, less affected by outliers.</p><p><b>Variance</b>: the average squared distance from the mean. <b>Standard deviation</b> (sd) is its square root, in the same units as the data.</p><p>Scaling: sd(aX) = |a| × sd(X).</p>`,
          q: [{ q: 'Median of 3, 9, 1, 7, 100?', num: 7, why: 'Sorted: 1, 3, 7, 9, 100. The middle value is 7. The 100 barely matters.' }, { q: 'Population variance of 1 and 3?', num: 1, why: 'Mean 2; squared distances 1 and 1; average 1.' }, { q: 'X has a standard deviation of 2. What is the sd of 3X?', num: 6, why: 'sd(3X) = 3 × 2 = 6. (The variance scales by 9.)' }] },
        { t: 'The normal distribution', tip: `<p>Many things are roughly <b>normal</b> (bell-shaped). The <b>68–95–99.7 rule</b>: about 68% of values fall within 1 sd of the mean, 95% within 2, 99.7% within 3.</p><p>A <b>z-score</b> says how many sds a value is from the mean: z = (x − mean) ÷ sd.</p><p>Warning: market returns have <b>fat tails</b>; big moves happen more often than the normal curve predicts.</p>`,
          q: [{ q: 'About what % of normal data lies within 2 standard deviations of the mean?', num: 0.95, pct: true, tol: 0.01, why: 'The 68–95–99.7 rule: about 95%.' }, { q: 'IQ has mean 100 and sd 15. What is the z-score of 130?', num: 2, why: '(130 − 100) ÷ 15 = 2.' }, { q: '“Fat tails” in returns means extreme moves are…', opts: ['more common than a normal curve predicts', 'impossible', 'always positive', 'exactly as the normal curve predicts'], a: 0, why: 'Crashes and spikes happen far more often than a bell curve suggests, which is why risk models add stress tests.' }] },
        { t: 'Correlation and sampling', tip: `<p><b>Correlation</b> runs from −1 to +1 and measures how closely two things move together in a straight line. <b>Correlation is not causation.</b></p><p>For independent X and Y: Var(X + Y) = Var(X) + Var(Y).</p><p>The <b>standard error</b> of a sample mean is sd ÷ √n: more data, more precision.</p>`,
          q: [{ q: 'X and Y are independent with variances 4 and 9. What is the sd of X + Y?', num: Math.sqrt(13), tol: 0.01, show: '√13 ≈ 3.606', why: 'Variances add: 13. sd = √13 ≈ 3.61, not 2 + 3 = 5.' }, { q: 'Sample of 100 with sd 20. Standard error of the mean?', num: 2, why: '20 ÷ √100 = 2.' }, { q: 'A correlation of 0 means…', opts: ['no linear relationship', 'the variables are independent', 'one causes the other', 'they always move in opposite directions'], a: 0, why: 'Zero correlation rules out a straight-line link, but variables can still be related in a curved way.' }] },
      ],
    },
    {
      id: 'risk', title: 'Returns and risk', blurb: 'Measuring performance the way a quant desk does.',
      lessons: [
        { t: 'Returns', gen: ['pctChange'], tip: `<p><b>Simple return</b> = (end − start) ÷ start.</p><p><b>Log return</b> = ln(end ÷ start). Log returns add up over time, which makes them handy for modelling. For small moves the two are almost equal.</p><p>Losses need bigger gains to recover: −50% needs +100%.</p>`,
          q: [{ q: 'A stock goes from 100 to 110. Simple return?', num: 0.1, pct: true, why: '10 ÷ 100 = 10%.' }, { q: 'Log return from 100 to 110 (to 3 decimals)?', num: Math.log(1.1), tol: 0.002, show: '0.095', why: 'ln(1.1) ≈ 0.0953.' }, { q: 'Up 50%, then down 50%. Total return?', num: -0.25, pct: true, why: '1.5 × 0.5 = 0.75, a 25% loss.' }] },
        { t: 'Compounding', gen: ['compound'], tip: `<p>Compounding: value = start × (1 + r)^t. Returns earn returns.</p><p>A monthly return of 1% is <b>not</b> 12% a year: it is 1.01^12 − 1 ≈ 12.68%.</p>`,
          q: [{ q: '1% a month, compounded. Annual return?', num: Math.pow(1.01, 12) - 1, pct: true, tol: 0.002, show: '≈ 12.68%', why: '1.01^12 − 1 ≈ 0.1268.' }, { q: '$1,000 at 5% a year for 3 years, compounded yearly. Final value to the nearest dollar?', num: 1157.63, tol: 1, why: '1000 × 1.05³ = 1,157.63.' }] },
        { t: 'Volatility and Sharpe', m: [['Simple return', '(end − start) ÷ start'], ['Log return', 'ln(end ÷ start)'], ['Sharpe ratio', 'Excess return ÷ volatility'], ['Max drawdown', 'Biggest peak-to-trough fall'], ['Annual volatility', 'Daily vol × √252']], tip: `<p><b>Volatility</b> is the standard deviation of returns. Volatility grows with the <b>square root of time</b>: annual vol ≈ daily vol × √252.</p><p>The <b>Sharpe ratio</b> = (return − risk-free rate) ÷ volatility. It measures return per unit of risk. Above 1 is very good for a strategy.</p><p><b>Maximum drawdown</b>: the biggest peak-to-trough fall.</p>`,
          q: [{ q: 'Daily volatility is 1%. Approximate annual volatility?', num: 0.01 * Math.sqrt(252), pct: true, tol: 0.004, show: '≈ 15.9%', why: '1% × √252 ≈ 1% × 15.87 ≈ 15.9%.' }, { q: 'A strategy returns 10% with 16% volatility. The risk-free rate is 2%. Sharpe ratio?', num: 0.5, tol: 0.01, why: '(10 − 2) ÷ 16 = 0.5.' }, { q: 'Maximum drawdown measures…', opts: ['the largest peak-to-trough fall', 'the average daily loss', 'the lowest price ever', 'the volatility of losses'], a: 0, why: 'It is the worst loss from a high point before a new high is reached.' }] },
      ],
    },
    {
      id: 'tvm', title: 'Time value of money', blurb: 'A dollar today is worth more than a dollar tomorrow.',
      lessons: [
        { t: 'Present value', gen: ['pv'], tip: `<p><b>Present value</b>: PV = future cash ÷ (1 + r)^t. Discounting is compounding in reverse.</p><p>The <b>discount rate</b> r reflects what you could earn elsewhere, plus risk.</p>`,
          q: [{ q: 'PV of $110 received in one year at 10%?', num: 100, why: '110 ÷ 1.1 = 100.' }, { q: 'PV of $100 in two years at 5%, to the cent?', num: 90.70, tol: 0.02, why: '100 ÷ 1.05² = 90.70.' }] },
        { t: 'Bonds', tip: `<p>A bond’s price is the PV of its payments. When interest rates <b>rise</b>, bond prices <b>fall</b>, and long bonds fall the most.</p><p>A <b>zero-coupon</b> bond pays only its face value at maturity: price = face ÷ (1 + y)^t.</p><p>A <b>perpetuity</b> paying C forever is worth C ÷ r.</p>`,
          q: [{ q: 'Interest rates rise. Existing bond prices…', opts: ['fall', 'rise', 'stay the same', 'double'], a: 0, why: 'Their fixed payments are now less attractive, so their price drops until the yield matches the market.' }, { q: 'Zero-coupon bond, $1,000 face, 1 year, 4% yield. Price to the cent?', num: 961.54, tol: 0.05, why: '1000 ÷ 1.04 = 961.54.' }, { q: 'A perpetuity pays $5 a year forever at a 5% discount rate. Value?', num: 100, why: '5 ÷ 0.05 = 100.' }] },
        { t: 'Valuing investments', m: [['Present value', 'Future cash ÷ (1 + r)^t'], ['Perpetuity', 'C ÷ r'], ['Gordon growth', 'D ÷ (r − g)'], ['NPV', 'PV of cash in − cost'], ['Zero-coupon bond', 'Pays only its face value']], tip: `<p><b>Net present value</b> (NPV) = PV of all cash in − cost. Positive NPV creates value.</p><p>The <b>Gordon growth model</b> values a stock from its dividends: price = next dividend ÷ (r − g), where g is the dividend growth rate.</p>`,
          q: [{ q: 'Invest $100 now; receive $60 in one year and $60 in two years. Discount rate 10%. NPV to the cent?', num: 60 / 1.1 + 60 / 1.21 - 100, tol: 0.02, show: '≈ $4.13', why: '54.55 + 49.59 − 100 = 4.13.' }, { q: 'Next year’s dividend is $2, required return 8%, dividend growth 4%. Gordon growth price?', num: 50, why: '2 ÷ (0.08 − 0.04) = 50.' }, { q: 'A $50 stock yields 4%. Annual dividend per share in $?', num: 2, why: '4% of 50 = 2.' }] },
      ],
    },
    {
      id: 'port', title: 'Portfolio theory', blurb: 'Combining assets to get more return for the risk.',
      lessons: [
        { t: 'Diversification', tip: `<p>Portfolio return is the weighted average of the assets’ returns. Portfolio <b>risk</b> is lower than the weighted average when assets are less than perfectly correlated. That is the only “free lunch” in finance.</p><p>Diversification removes <b>company-specific</b> (idiosyncratic) risk, not <b>market</b> risk.</p>`,
          q: [{ q: '60% in an asset returning 10%, 40% in one returning 5%. Portfolio return?', num: 0.08, pct: true, why: '0.6 × 10% + 0.4 × 5% = 8%.' }, { q: 'Diversification mainly reduces…', opts: ['company-specific risk', 'market risk', 'interest-rate risk', 'inflation'], a: 0, why: 'Holding many stocks averages out individual surprises; a market crash still hits everything.' }] },
        { t: 'Correlation and risk', tip: `<p>Two assets with vols σ₁, σ₂, weights w₁, w₂ and correlation ρ:</p><p>σ² = w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂</p><p>Lower correlation, lower portfolio risk.</p>`,
          q: [{ q: '50/50 in two assets, each with 20% vol and correlation 0. Portfolio vol?', num: Math.sqrt(0.02), pct: true, tol: 0.003, show: '≈ 14.1%', why: '√(0.25×0.04 + 0.25×0.04) = √0.02 ≈ 14.1%.' }, { q: 'Same assets but correlation +1. Portfolio vol?', num: 0.2, pct: true, why: 'Perfectly correlated: no diversification, still 20%.' }, { q: 'Which pairing reduces risk the most?', opts: ['Assets with negative correlation', 'Assets with correlation +1', 'Two copies of the same stock', 'Assets with the highest volatility'], a: 0, why: 'When one falls the other tends to rise, so swings cancel out.' }] },
        { t: 'Beta and CAPM', m: [['Beta', 'Sensitivity to the market'], ['CAPM', 'rf + β × (market − rf)'], ['Diversification', 'Removes company-specific risk'], ['Correlation', 'Co-movement from −1 to +1'], ['Market risk', 'Risk you can’t diversify away']], tip: `<p><b>Beta</b> measures how much a stock moves with the market. Beta 1.5 means about 1.5% for every 1% market move.</p><p><b>CAPM</b>: expected return = risk-free + beta × (market return − risk-free).</p>`,
          q: [{ q: 'A stock has beta 1.5. The market rises 10%. Expected move?', num: 0.15, pct: true, why: '1.5 × 10% = 15%.' }, { q: 'Risk-free 3%, market return 8%, beta 1.2. CAPM expected return?', num: 0.09, pct: true, why: '3% + 1.2 × (8% − 3%) = 9%.' }, { q: 'A beta of 0 means the stock’s returns are…', opts: ['unrelated to market moves', 'zero', 'risk-free', 'the opposite of the market'], a: 0, why: 'It doesn’t move with the market on average, though it can still be very volatile on its own.' }] },
      ],
    },
    {
      id: 'opt', title: 'Options', blurb: 'Contracts that give the right, not the obligation, to trade.',
      lessons: [
        { t: 'Calls and puts', m: [['Call', 'Right to buy'], ['Put', 'Right to sell'], ['Strike', 'The agreed price'], ['Premium', 'The price of the option'], ['Delta', 'Option move per $1 stock move']], gen: ['payoff'], tip: `<p>A <b>call</b> gives the right to <b>buy</b> at the strike price K. Payoff at expiry = max(S − K, 0).</p><p>A <b>put</b> gives the right to <b>sell</b> at K. Payoff = max(K − S, 0).</p><p>Profit = payoff − the premium you paid.</p>`,
          q: [{ q: 'You paid $5 for a call with strike 100. The stock ends at 108. Profit per share?', num: 3, why: 'Payoff 8 − premium 5 = 3.' }, { q: 'Most you can lose buying a call?', opts: ['The premium you paid', 'The strike price', 'Unlimited', 'Nothing'], a: 0, why: 'If it expires worthless you lose only what you paid.' }, { q: 'Most you can lose selling a call without owning the stock?', opts: ['Unlimited', 'The premium', 'The strike price', 'Zero'], a: 0, why: 'The stock can rise without limit, and you must deliver it at K.' }] },
        { t: 'What drives option prices', tip: `<p>Option values rise with <b>volatility</b>: more chance of a big move, while losses are capped at the premium.</p><p>More <b>time</b> to expiry usually means more value.</p><p><b>Delta</b> is how much the option price moves for a $1 move in the stock: near 0 for far out-of-the-money options, near 1 for deep in-the-money calls.</p>`,
          q: [{ q: 'Volatility increases. Call and put prices…', opts: ['both rise', 'both fall', 'calls rise, puts fall', 'stay the same'], a: 0, why: 'Higher volatility raises the chance of big payoffs for both, with the downside still capped.' }, { q: 'Approximate delta of a deep in-the-money call?', num: 1, tol: 0.05, why: 'It moves almost one-for-one with the stock.' }] },
        { t: 'Put-call parity', tip: `<p>For European options with the same strike and expiry:</p><p><b>C − P = S − K × e^(−rT)</b></p><p>A call minus a put behaves exactly like owning the stock and borrowing the strike. If the prices don’t match, there is an arbitrage.</p>`,
          q: [{ q: 'Interest rates are 0. Stock 100, strike 100, call price 6. What must the put cost?', num: 6, why: 'C − P = S − K = 0, so P = C = 6.' }, { q: 'Rates 0, stock 105, strike 100, call 8. Put price?', num: 3, why: 'C − P = 105 − 100 = 5, so P = 8 − 5 = 3.' }, { q: 'Buying a call and selling a put (same strike, expiry) is like…', opts: ['owning the stock, financed by borrowing', 'holding cash', 'shorting the stock', 'owning a bond'], a: 0, why: 'That is put-call parity: C − P = S − PV(K).' }] },
      ],
    },
    {
      id: 'mkt', title: 'Markets and trading', blurb: 'How orders, spreads and liquidity really work.',
      lessons: [
        { t: 'Bid, ask and spread', gen: ['spread'], tip: `<p>The <b>bid</b> is the best price someone will buy at; the <b>ask</b> is the best price someone will sell at. The gap is the <b>spread</b>, and the <b>mid</b> is halfway.</p><p>Market makers quote both sides and earn the spread for providing liquidity.</p>`,
          q: [{ q: 'Bid 99.98, ask 100.02. What is the spread?', num: 0.04, tol: 0.001, why: '100.02 − 99.98 = 0.04.' }, { q: 'Same quote. What is the mid price?', num: 100, tol: 0.001, why: '(99.98 + 100.02) ÷ 2 = 100.00.' }, { q: 'A market maker earns mainly…', opts: ['the bid-ask spread', 'dividends', 'commission from the exchange', 'interest'], a: 0, why: 'Buying at the bid and selling at the ask, many times a day.' }] },
        { t: 'Orders and liquidity', m: [['Bid', 'Highest price a buyer will pay'], ['Ask', 'Lowest price a seller will take'], ['Spread', 'Ask minus bid'], ['Market order', 'Fill now at the best price'], ['Limit order', 'Fill at your price or better']], tip: `<p>A <b>market order</b> fills now at the best available price. A <b>limit order</b> fills only at your price or better, and might never fill.</p><p><b>Slippage</b> is getting a worse price than expected, common in big orders or thin markets. <b>Liquid</b> markets have tight spreads and lots of size.</p>`,
          q: [{ q: 'You need to trade immediately, whatever the price. Use a…', opts: ['market order', 'limit order', 'stop order', 'no order'], a: 0, why: 'Market orders prioritise speed over price.' }, { q: '“Slippage” means…', opts: ['filling at a worse price than expected', 'a stock split', 'a dividend cut', 'a fat-finger error'], a: 0, why: 'Large or fast orders eat through the order book.' }, { q: 'Which has the tightest spread, usually?', opts: ['A large-cap stock like AAPL', 'A penny stock', 'A small UK share', 'A rarely traded preferred share'], a: 0, why: 'Heavily traded stocks have many competing buyers and sellers.' }] },
        { t: 'Leverage and shorting', tip: `<p><b>Short selling</b>: borrow shares, sell them, buy back later. You profit if the price falls; losses are unlimited if it rises.</p><p><b>Leverage</b> multiplies both gains and losses. 2× leverage turns a 10% move into 20%.</p>`,
          q: [{ q: 'You short at $50 and buy back at $40. Profit per share?', num: 10, why: 'Sold at 50, bought at 40: +$10.' }, { q: 'With 2× leverage, the asset falls 10%. Your return?', num: -0.2, pct: true, why: '2 × −10% = −20% (before costs).' }, { q: 'Why can a short seller’s loss be unlimited?', opts: ['A price can rise without limit', 'Brokers charge unlimited fees', 'Shares can go below zero', 'Dividends are unlimited'], a: 0, why: 'A price can only fall to zero, but it can rise forever.' }] },
      ],
    },
    {
      id: 'charts', title: 'Reading price charts', blurb: 'Trends, support, resistance, averages and volume on real charts.', guideFromLearn: true,
      lessons: [
        { t: 'Candles and trends', gen: ['trendSpot'], tip: `<p>Each <b>candle</b> is one day: the body runs from open to close, the wicks reach the high and low. <b class="up">Green</b> closed higher than it opened; <b class="down">red</b> closed lower.</p><p>An <b>uptrend</b> is a staircase of <b>higher highs and higher lows</b>. A <b>downtrend</b> makes lower highs and lower lows. A <b>sideways</b> market bounces between a floor and a ceiling.</p>`,
          m: [['Uptrend', 'Higher highs and higher lows'], ['Downtrend', 'Lower highs and lower lows'], ['Sideways', 'Bouncing in a range'], ['Green candle', 'Closed above its open'], ['Wick', 'Shows the day’s high or low']],
          q: [{ q: 'What kind of market is this?', fig: 'uptrend', plain: true, opts: ['Uptrend', 'Downtrend', 'Sideways'], a: 0, why: 'Each peak and each dip is higher than the last: a staircase going up.' },
            { q: 'What kind of market is this?', fig: 'downtrend', plain: true, opts: ['Uptrend', 'Downtrend', 'Sideways'], a: 1, why: 'Lower highs and lower lows: each bounce fails below the last peak.' },
            { q: 'What kind of market is this?', fig: 'sideways', plain: true, opts: ['Uptrend', 'Downtrend', 'Sideways'], a: 2, why: 'The price keeps bouncing between the same floor and ceiling.' },
            { q: 'The thin lines above and below a candle’s body show…', opts: ['the day’s high and low', 'the open and close', 'the trading volume', 'the moving average'], a: 0, why: 'They are the wicks: the most and least anyone paid that day.' }] },
        { t: 'Support, resistance and volume', tip: `<p><b>Support</b> is a floor where falls keep stopping; <b>resistance</b> is a ceiling where rises keep stopping.</p><p>A <b>breakout</b> through resistance often turns the old ceiling into new support. Breakouts on <b>heavy volume</b> are more convincing than quiet ones.</p>`,
          m: [['Support', 'A floor where falls stop'], ['Resistance', 'A ceiling where rises stop'], ['Breakout', 'A clear move through a level'], ['Retest', 'A dip back to the old ceiling'], ['Volume', 'How many shares traded']],
          q: [{ q: 'After the breakout in this chart, the old resistance line acted as…', fig: 'levels', opts: ['new support', 'stronger resistance', 'nothing at all', 'a moving average'], a: 0, why: 'The price dipped back to the old ceiling, found buyers there and bounced: old resistance became new support.' },
            { q: 'What makes the breakout in this chart convincing?', fig: 'volume', opts: ['It happened on very heavy volume', 'The candles were red', 'It happened on a Monday', 'The price was below $100'], a: 0, why: 'Volume spiked as the price broke out, showing lots of traders agreed.' },
            { q: 'In a sideways market, buyers usually step in near…', opts: ['support', 'resistance', 'the middle', 'the moving average'], a: 0, why: 'Support is where the price has repeatedly stopped falling.' },
            { q: 'A breakout on very low volume is…', opts: ['less convincing', 'more convincing', 'guaranteed to continue', 'impossible'], a: 0, why: 'Few traders took part, so it can easily fizzle.' }] },
        { t: 'Moving averages and pullbacks', gen: ['trendSpot'], tip: `<p>A <b>moving average</b> smooths out daily noise. Price above a rising average suggests an uptrend. When a short average crosses <i>above</i> a long one it is a <b>golden cross</b>; crossing below is a <b>death cross</b>.</p><p>A <b>pullback</b> is a short dip inside an uptrend. It is only a warning sign if it breaks below the last higher low.</p>`,
          m: [['Golden cross', 'Short average crosses above long'], ['Death cross', 'Short average crosses below long'], ['Pullback', 'A short dip inside an uptrend'], ['Moving average', 'Average price over recent days'], ['Lagging', 'Confirms rather than predicts']],
          q: [{ q: 'What does the green dot in this chart mark?', fig: 'averages', opts: ['A golden cross', 'A death cross', 'A dividend', 'A stock split'], a: 0, why: 'The short (20-day) average crossed above the long (50-day) average: an early sign of a new uptrend.' },
            { q: 'The dips marked in this chart are…', fig: 'pullbacks', opts: ['pullbacks within an uptrend', 'the start of a crash', 'dividend payments', 'stock splits'], a: 0, why: 'Each dip stops above the last low and the uptrend carries on.' },
            { q: 'Moving averages are “lagging” indicators. That means they…', opts: ['confirm a trend after it starts', 'predict the next day exactly', 'only work on Mondays', 'ignore the price'], a: 0, why: 'They are built from past prices, so they react after the move.' }] },
      ],
    },
    {
      id: 'brain', title: 'Interview brainteasers', blurb: 'Classic puzzles from quant and trading interviews.',
      lessons: [
        { t: 'Think before you answer', tip: `<p>Interviewers want to see clear thinking, not instant answers. Slow down, write the equation, and sanity-check.</p><p>Many puzzles have an obvious wrong answer. Spot the trap.</p>`,
          q: [{ q: 'A bat and ball cost $1.10. The bat costs $1 more than the ball. Ball price in $?', num: 0.05, tol: 0.001, why: 'Ball b, bat b + 1: 2b + 1 = 1.10, so b = 0.05. The tempting 0.10 is wrong.' }, { q: 'A lily patch doubles daily and covers the lake on day 48. On which day was it half covered?', num: 47, why: 'One doubling before full: day 47.' }, { q: 'Sum of the whole numbers 1 to 100?', num: 5050, why: '100 × 101 ÷ 2 = 5050 (Gauss’s trick).' }] },
        { t: 'Probability puzzles', m: [['Monty Hall, switching', '2/3'], ['Bat and ball', '$0.05'], ['1 + 2 + … + 100', '5050'], ['Trailing zeros in 25!', '6'], ['Birthday problem', '23 people']], tip: `<p>Write out the sample space when intuition fails. Two famous examples are <b>Monty Hall</b> and the <b>birthday problem</b>.</p>`,
          q: [{ q: 'Monty Hall: you pick 1 of 3 doors, the host opens a goat door and offers a switch. Probability of winning if you switch?', num: 2 / 3, tol: 0.005, show: '2/3', why: 'Your first pick is right 1/3 of the time; switching wins the other 2/3.' }, { q: 'Roughly how many people are needed for a 50% chance that two share a birthday?', opts: ['23', '183', '50', '366'], a: 0, why: 'With 23 people there are 253 pairs, enough for about a 50.7% chance.' }, { q: 'Clock angle between the hands at 3:15, in degrees?', num: 7.5, tol: 0.01, why: 'Minute hand at 90°; hour hand at 90 + 7.5 = 97.5°. Difference 7.5°.' }] },
        { t: 'Logic puzzles', tip: `<p>For logic puzzles, look for structure: symmetry, invariants, or what happens in the smallest case.</p>`,
          q: [{ q: '100 lockers start closed. Person k toggles every k-th locker, for k = 1 to 100. How many end open?', num: 10, why: 'A locker ends open if it has an odd number of divisors, which only perfect squares do: 1, 4, …, 100. That is 10.' }, { q: '8 balls, one slightly heavier. Fewest weighings on a balance scale to be sure which?', num: 2, why: 'Weigh 3 v 3. If balanced, weigh the other two. If not, weigh 1 v 1 from the heavy three.' }, { q: 'How many trailing zeros does 25! have?', num: 6, why: 'Count factors of 5: 25/5 = 5, plus 25/25 = 1, so 6.' }] },
      ],
    },
    {
      id: 'code', title: 'Python for quants', blurb: 'Reading code is part of the job.',
      lessons: [
        { t: 'Python basics', tip: `<p>Most quant research is done in <b>Python</b>. Watch for:</p><ul><li><code>//</code> is floor division; <code>**</code> is power, and it groups right-to-left.</li><li>Assigning a list doesn’t copy it: both names point to the same list.</li></ul>`,
          q: [{ q: 'What does this print?', code: 'print(7 // 2)', num: 3, why: 'Floor division drops the remainder.' }, { q: 'What does this print?', code: 'print(2 ** 3 ** 2)', num: 512, why: '** groups right to left: 2 ** 9 = 512, not 8 ** 2 = 64.' }, { q: 'What does this print?', code: 'x = [1, 2, 3]\ny = x\ny.append(4)\nprint(len(x))', num: 4, why: 'y is the same list as x, so x has 4 items too.' }] },
        { t: 'Lists and loops', m: [['7 // 2', '3'], ['7 % 3', '1'], ['2 ** 3', '8'], ['sum(range(4))', '6'], ['len("quant")', '5']], tip: `<p>List comprehensions build lists in one line: <code>[f(i) for i in range(n)]</code>.</p><p><code>range(n)</code> goes from 0 to n−1.</p>`,
          q: [{ q: 'What does this print?', code: 'print(sum(range(5)))', num: 10, why: '0 + 1 + 2 + 3 + 4 = 10.' }, { q: 'What does this print?', code: 'print([i * i for i in range(4)])', opts: ['[0, 1, 4, 9]', '[1, 4, 9, 16]', '[0, 1, 2, 3]', '[0, 2, 4, 6]'], a: 0, why: 'range(4) is 0..3, squared.' }, { q: 'What does this print?', code: 'print(0.1 + 0.2 == 0.3)', opts: ['False', 'True', 'Error', '0.3'], a: 0, why: 'Floating-point rounding: 0.1 + 0.2 is 0.30000000000000004. Compare floats with a tolerance.' }] },
        { t: 'Data and algorithms', tip: `<p><b>NumPy</b> and <b>pandas</b> are the core data tools. <code>np.std</code> uses the population formula by default.</p><p>Know the speed of common algorithms: binary search is <b>O(log n)</b>, sorting is <b>O(n log n)</b>.</p>`,
          q: [{ q: 'What does this print?', code: 'import numpy as np\nprint(np.std([2, 4, 4, 4, 5, 5, 7, 9]))', num: 2, why: 'Mean 5, average squared deviation 4, sd 2.0.' }, { q: 'Time complexity of binary search on a sorted list?', opts: ['O(log n)', 'O(n)', 'O(n log n)', 'O(1)'], a: 0, why: 'It halves the search space each step.' }, { q: 'Which pandas call gives daily returns from a price Series p?', opts: ['p.pct_change()', 'p.diff()', 'p.cumsum()', 'p.mean()'], a: 0, why: 'pct_change() computes (p_t − p_{t−1}) / p_{t−1}.' }] },
      ],
    },
  ];

  const RANKS = [
    [0, 'Intern'], [100, 'Junior Analyst'], [300, 'Analyst'], [600, 'Associate'],
    [1000, 'Quant Researcher'], [1600, 'Senior Quant'], [2500, 'Portfolio Manager'], [4000, 'Head of Quant'],
  ];

  window.AcademyContent = { UNITS, GEN, RANKS, SPRINT_GENS: ['mul', 'mulTrick', 'sq', 'add', 'pctOf', 'diffSq'] };
})();
