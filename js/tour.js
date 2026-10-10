/*
 * Beginner tour: a step-by-step spotlight over the real interface, shown on first visit,
 * plus a Help panel with a plain-English glossary. Uses window.App (exposed by app.js).
 */
(function () {
  'use strict';

  const DONE_KEY = 'bullpen-tour-done';
  const $ = (id) => document.getElementById(id);

  const STEPS = [
    {
      title: 'Welcome to Bullpen',
      text: 'This is a practice stock market. You start with <b>$100,000 of pretend money</b> to buy shares in real companies and funds. Nothing here costs real money, so it is a safe place to learn. This tour takes about a minute.',
    },
    {
      target: '.worth',
      title: 'Your net worth',
      text: 'This is everything you have: your spare cash plus what your shares are worth today. Green means you are up, red means you are down.',
    },
    {
      target: '#playBtn',
      title: 'Time is paused',
      text: 'Prices only move when time passes. Press <b>Play</b> to let the days go by, pick a speed like 2&times;, or jump ahead with <b>+1W</b> (one week) or <b>+1M</b> (one month). Markets are shut at weekends, just like real life.',
      spot: '.clock',
    },
    {
      tab: 'markets',
      target: '.filters',
      title: 'Find something to buy',
      text: 'Search for a company by name, like <i>Coca-Cola</i>, or by its <b>ticker</b>, the short code it trades under (KO). Use <b>Category</b> to browse types, such as dividend stocks or ETFs (funds that hold many companies at once).',
    },
    {
      tab: 'markets',
      target: '#marketTable thead',
      title: 'Reading the list',
      text: '<b>Price</b> is the cost of one share. <b>Day</b> is how much it moved today. <b>Yield</b> is how much the company pays you each year in dividends, as a % of the price. Click any row to open it.',
    },
    {
      open: 'KO',
      target: '#shChart',
      title: 'A stock up close',
      text: 'This is Coca-Cola (KO). The chart shows its price over the past year. Use 1M, 3M, 6M and 1Y to change the time range.',
    },
    {
      open: 'KO',
      target: '#shStats',
      title: 'Dividends explained',
      text: 'A <b>dividend</b> is cash a company pays you for owning its shares. Here you can see how much per share, how often, and the <b>next ex-dividend date</b>: you must own the shares <i>before</i> that day to be paid.',
    },
    {
      open: 'KO',
      target: '#tradeForm',
      title: 'Buying shares',
      text: 'Choose <b>Buy</b>, type how many shares (or switch to USD to spend a set amount), and press the button. Your first trade could be 10 shares. To sell later, open the stock again and choose <b>Sell</b>.',
    },
    {
      tab: 'portfolio',
      target: '[data-tab="portfolio"]',
      title: 'Your stocks live here',
      text: 'The <b>Portfolio</b> tab lists everything you own, what you paid, what it is worth now and how much you have made or lost. It also charts your progress against simply buying the whole market.',
    },
    {
      tab: 'dividends',
      target: '[data-tab="dividends"]',
      title: 'Your dividend income',
      text: 'See the dividends you have been paid and what is coming next. You can turn on <b>reinvesting</b> (DRIP) so dividends automatically buy more shares, which grows your income over time.',
    },
    {
      tab: 'calendar',
      target: '[data-tab="calendar"]',
      title: 'The dividend calendar',
      text: 'Paydays and ex-dividend days for your stocks, month by month. Click a day and press <b>Skip to this day</b> to jump straight to a payday.',
    },
    {
      tab: 'calculator',
      target: '[data-tab="calculator"]',
      title: 'Plan ahead',
      text: 'The <b>Calculator</b> shows what an investment could grow into over the years, including dividends, tax and fees.',
    },
    {
      tab: 'markets',
      target: '#helpBtn',
      title: 'Help is always here',
      text: 'Not sure what a word means? Open <b>Help</b> for plain-English explanations, or to take this tour again. Your game saves automatically.',
    },
    {
      tab: 'markets',
      title: 'You are ready',
      text: 'A good first step: search <b>KO</b> or <b>SCHD</b> (a fund of dividend-paying companies), buy a few shares, then press <b>Play</b> and watch what happens. Have fun!',
      last: true,
    },
  ];

  const GLOSSARY = [
    ['Stock / share', 'A small piece of ownership in a company. If the company does well, its shares usually become worth more.'],
    ['Ticker', 'The short code a stock trades under, like AAPL for Apple or KO for Coca-Cola.'],
    ['Price', 'What one share costs right now.'],
    ['Portfolio', 'All the investments you own.'],
    ['Net worth', 'Your cash plus the current value of everything you own.'],
    ['Dividend', 'Cash a company pays shareholders, usually every 3 months. Not every company pays one.'],
    ['Yield', 'A year of dividends as a percentage of the price. A $100 share paying $3 a year yields 3%.'],
    ['Ex-dividend date', 'The cut-off day. Own the shares before it and you get the next dividend; buy on or after it and you don’t.'],
    ['DRIP (reinvesting)', 'Using your dividends to buy more shares automatically, so your income grows over time.'],
    ['ETF / fund', 'One investment that holds many companies at once. An easy way to spread your money out.'],
    ['Index fund', 'A fund that copies a whole market, like the S&P 500 (the 500 biggest US companies). SPY and VOO are examples.'],
    ['REIT', 'A company that owns property, like offices or warehouses, and pays out most of its rent as dividends.'],
    ['Bond fund', 'A fund that lends money to governments or companies for interest. Usually steadier than stocks.'],
    ['Penny stock', 'A very cheap, very risky share whose price can swing wildly.'],
    ['Bid / ask', 'The ask is the price you pay to buy; the bid is the price you get when you sell. The small gap is a cost of trading.'],
    ['Market order', 'Buy or sell right now at the current price.'],
    ['Limit order', 'Buy or sell only if the price reaches a level you choose.'],
    ['Stop order', 'Automatically sell if the price falls to a level you choose, to limit a loss.'],
    ['Diversification', 'Spreading money across many investments so one bad one can’t sink you.'],
  ];

  let i = 0;
  let active = false;

  function el(sel) { return sel ? document.querySelector(sel) : null; }
  function visible(node) { return node && node.getClientRects().length > 0; }

  function start() {
    if (!window.App) return;
    i = 0;
    active = true;
    closeHelp();
    $('tour').hidden = false;
    show();
  }

  function finish() {
    active = false;
    $('tour').hidden = true;
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* storage blocked */ }
    if (window.App.sheetOpen()) window.App.closeSheet();
  }

  function show() {
    const step = STEPS[i];
    if (step.tab) window.App.showTab(step.tab);
    if (step.open) { if (window.App.sheetTicker() !== step.open) window.App.openSheet(step.open, true); }
    else if (window.App.sheetOpen()) window.App.closeSheet();

    $('tourTitle').innerHTML = step.title;
    $('tourText').innerHTML = step.text;
    $('tourCount').textContent = `${i + 1} of ${STEPS.length}`;
    $('tourBack').hidden = i === 0;
    $('tourNext').textContent = step.last ? 'Start playing' : i === 0 ? 'Show me around' : 'Next';
    $('tourSkip').hidden = !!step.last;
    $('tourDots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');

    const target = el(step.spot || step.target);
    if (visible(target)) {
      // On phones the card docks at the bottom, so bring the highlighted part to the top.
      target.scrollIntoView({ block: window.innerWidth <= 600 ? 'start' : 'center' });
    }
    requestAnimationFrame(place);
    $('tourNext').focus({ preventScroll: true });
  }

  function place() {
    if (!active) return;
    const step = STEPS[i];
    const target = el(step.spot || step.target);
    const hole = $('tourHole');
    const card = $('tourCard');
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!visible(target)) {
      hole.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
      card.classList.add('center');
      card.style.left = ''; card.style.top = '';
      return;
    }
    card.classList.remove('center');
    const r = target.getBoundingClientRect();
    const pad = 6;
    const top = Math.max(r.top - pad, 4), left = Math.max(r.left - pad, 4);
    const w = Math.min(r.width + pad * 2, vw - left - 4), h = Math.min(r.height + pad * 2, vh - top - 4);
    hole.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;`;

    if (vw <= 600) { card.style.left = ''; card.style.top = ''; card.classList.add('dock'); return; }
    card.classList.remove('dock');
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let cy = top + h + 12;
    if (cy + ch > vh - 12) cy = top - ch - 12;
    if (cy < 12) cy = Math.min(vh - ch - 12, Math.max(12, top + 12));
    let cx = Math.min(Math.max(12, left + w / 2 - cw / 2), vw - cw - 12);
    card.style.left = cx + 'px';
    card.style.top = cy + 'px';
  }

  function openHelp() {
    $('helpList').innerHTML = GLOSSARY.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('helpModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeHelp() {
    if ($('helpModal').hidden) return;
    $('helpModal').hidden = true;
    document.body.style.overflow = '';
  }

  function bind() {
    $('tourNext').addEventListener('click', () => { if (STEPS[i].last) finish(); else { i++; show(); } });
    $('tourBack').addEventListener('click', () => { if (i > 0) { i--; show(); } });
    $('tourSkip').addEventListener('click', finish);
    $('helpBtn').addEventListener('click', openHelp);
    $('helpClose').addEventListener('click', closeHelp);
    $('helpTour').addEventListener('click', start);
    $('helpModal').addEventListener('click', (e) => { if (e.target === $('helpModal')) closeHelp(); });
    document.addEventListener('keydown', (e) => {
      if (active) {
        if (e.key === 'Escape') { e.stopPropagation(); finish(); }
        if (e.key === 'ArrowRight') $('tourNext').click();
        if (e.key === 'ArrowLeft' && i > 0) $('tourBack').click();
      } else if (e.key === 'Escape') closeHelp();
    }, true);
    window.addEventListener('resize', () => { if (active) place(); });
    window.addEventListener('scroll', () => { if (active) place(); }, true);
  }

  function maybeAutoStart() {
    let done = false;
    try {
      done = localStorage.getItem(DONE_KEY) === '1'
        || localStorage.getItem('bullpen-setup-done') !== '1';   // the welcome screen offers the tour instead
    } catch (e) { done = true; }
    if (done) return;
    // Wait for any account prompt (e.g. choosing which saved game to keep) to close first.
    const tryStart = () => {
      if (!$('acctModal').hidden) { setTimeout(tryStart, 1000); return; }
      start();
    };
    setTimeout(tryStart, 700);
  }

  bind();
  maybeAutoStart();
  window.Tour = { start, help: openHelp };
})();
