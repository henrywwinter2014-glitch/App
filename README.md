# Bullpen Trader

A stock and shares simulator that runs entirely in the browser. Start with virtual cash, buy and sell 760+ securities, collect dividends, and fast-forward through simulated market years.

## Run it

Open `index.html` in a browser. No build step or server is needed. (To serve it locally instead: `python3 -m http.server` and visit http://localhost:8000.)

## What you can trade

| Kind | Examples |
| --- | --- |
| US stocks, all 11 sectors (most of the S&P 500) | AAPL, MSFT, NVDA, JPM, XOM, BRK.B |
| Dividend stocks, aristocrats, high yield | KO, PG, JNJ, MO, VZ, ABBV |
| Monthly dividend payers | O, MAIN, STAG, JEPI, AGNC |
| Index, sector, dividend and income ETFs | SPY, VOO, QQQ, SCHD, VYM, XLK |
| Bond funds | BND, AGG, TLT, SGOV, HYG |
| Leveraged and inverse ETFs | TQQQ, SQQQ, UPRO, SH |
| Gold, oil and crypto ETFs | GLD, SLV, USO, IBIT |
| REITs, BDCs and MLPs | PLD, AMT, ARCC, ET, EPD |
| Preferred shares | JPM-PC, BAC-PL, PFF |
| International and ADRs | TSM, ASML, NVO, TM, SHOP |
| UK shares on the LSE (priced in GBP) | AZN.L, SHEL.L, LLOY.L, VUSA.L |
| Penny stocks | SNDL, PLUG, TLRY |
| Mutual funds | VFIAX, FXAIX, VTSAX |

Anything missing can be added under **Settings → List a new security**.

## Features

- Trading-terminal layout: watchlist price tiles with Sell/Buy (bid/ask) prices and day range, a candlestick chart with volume, and a product list with change, trend, range, client sentiment and one-click Sell/Buy.
- The price chart's bottom axis is labelled in 5-minute steps (a 9:30 to 16:00 session per bar block), with a tick for every 5-minute bar and the hover readout showing the bar's time.
- The year of history before day 1 follows the real market year behind the reference prices (roughly autumn 2024 to autumn 2025): the S&P 500's actual path, including the April 2025 sell-off and rebound, and approximate real price points for about 25 well-known stocks and ETFs (Apple, Microsoft, NVIDIA, Tesla, UnitedHealth, QQQ, gold, bitcoin and others). The anchors in `js/data.js` are approximate levels, not exact closes.
- Trading journal: an entry opens for every position by itself, carrying it from the plan written before buying to the review written after selling. Filter by ticker, strategy or outcome, attach a picture, and read back the patterns across entries -- trades entered with no exit plan, feelings that keep preceding losses, which strategies are actually working.
- Strategy backtester: test rules over recorded history with the same spread, commission and market impact the live engine charges. Rules are decided on one day's close and filled at the next day's open, so a rule can never read the bar it trades on. Every run is split into the stretch you tune on and a later stretch the rules never saw, and both are reported, because a strategy that only works on the first has been fitted to noise.
- Watchlists and alerts: several named lists, and alerts for a price reaching a level, a move of a given percent in a day, going ex-dividend or reporting earnings. Alerts run on the simulation clock and trigger on a price the day actually reached, including part-way through a skip.
- Performance tab: every figure is derived from your own recorded trades and account history, never a stubbed example. An equity curve against a buy-and-hold S&P 500, both indexed to 0% on your first day so they share one scale; win rate, average win and loss, profit factor, expectancy, typical holding period and worst fall from a peak; what trading cost you in spread, market impact, commission and dividend tax; profit broken down by product and by month; and the closed-trade log behind all of it. It also tells you how much of your profit came from your single best trade, because a record resting on one trade says much less than it appears to.
- Risk management: a position-size calculator that sizes a trade from the loss you are prepared to take rather than the cash you happen to hold, with reward-to-risk, warnings when a position breaks your limits, and a reminder that a stop is an instruction rather than a promise. Set your risk per trade, biggest single position and daily loss limit in Settings; the Performance tab flags concentration, sector exposure and a day that has gone past the limit.
- Two markets. The **simulated** one invents prices from today and every product is tradeable. **Replay** runs recorded history instead: pick a date from 14 January 2020 onwards and trade forward through the prices, dividends and splits that really happened, one day at a time, never seeing past the current day. Four periods are offered to start from (the Covid crash, the 2022 bear market, the AI rally, the 2025 tariff shock). 602 of the 761 products have real history; the rest are hidden while replaying, as are any that had not listed yet on the day you are on, so a fund that floated in May 2020 only appears once the replay reaches it.
- Realistic order execution: orders fill only at prices the day actually traded. A limit or stop triggers on the day's high/low, not just its close, and fills at the day's open when the market gaps past it — so a stop loss can fill worse than the price written on it, as in real life. Cash and shares committed to open orders are reserved so they cannot be spent twice, large orders pay market impact on top of the spread, oversized orders fill partially over several days, and day/GTC orders expire.
- Draw on the chart: Pen (freehand), Line (trendline), Level (a horizontal price line with its price tag, e.g. the most you'd sell at) and Eraser, in five colours, with Undo and Clear all. Drawings are pinned to the day and price they were drawn at, so they stay in place as days pass and the range changes; they save with the game and show in full-screen mode too.
- Your trades on the chart: a green B where you bought (at the price paid) and an orange S where you sold, labelled with the profit or loss in percent; hovering a marker shows the details. Sale confirmations (including filled limit and stop orders) say how much you made or lost, and the chart header shows how much you're up or down on shares you still hold.
- Full-screen chart mode (button or double-click) with only Play/Pause, Sell and Buy, and a quick order box on the chart.
- Market, limit and stop orders; buy by share count or dollar amount; optional fractional shares and commission.
- Dividends on real-style schedules (monthly, quarterly, semi-annual, annual) with ex-dates, pay dates, and the price drop on the ex-date.
- Per-holding DRIP (dividend reinvestment), forward income, yield on cost and a monthly income chart.
- Annual dividend raises and cuts, quarterly earnings surprises, stock splits and reverse splits, and macro news (rate decisions, oil shocks, crashes).
- GBP/USD exchange rate and 0.5% UK stamp duty for London shares.
- Portfolio net worth chart against an S&P 500 benchmark, allocation by type and sector.
- Play at ½× to 100× speed (trading days per second), skip ahead 1 day, 1 week, 1 month, 3 months or 1 year, skip any number of days/weeks/months/years, jump to a date, or skip straight to your next dividend payout.
- Dividend speed: keep real schedules, or pay every dividend monthly or weekly (same yearly amount, more often).
- Your part of the world: the app works out your region from your device's time zone and language -- nothing is transmitted and no location permission is asked for -- and uses the right exchange calendar. Six are built in (NYSE/Nasdaq, London, Toronto, Sydney, Xetra and Euronext Paris), each with its own holidays, trading hours and timezone, including the substitution rules that differ between them: a US holiday falling at a weekend moves to the nearest weekday, a UK one moves forward and skips days already taken, so Christmas on a Saturday gives Monday the 27th and pushes Boxing Day to Tuesday the 28th. The market status badge names the exchange and shows its local time. Holidays where you live that the exchange ignores (Columbus Day, German Unity Day, Truth and Reconciliation Day) appear in the Calendar as your own day off with a note that the market is open anyway. Change the exchange any time under Settings.
- Calendar of ex-dividend days, paydays, dividends received and earnings for your holdings (and watchlist), with one-click "skip to this day".
- Dividend calculator: projects yearly income, final value and annualised return (after tax and fees) from a ticker, your portfolio, or your own numbers, with dividend growth, DRIP, account-specific tax, fund fees and inflation.
- Real-world costs: bid/ask spreads by liquidity (no spread on mutual funds), commission, UK stamp duty, and dividend tax by account type (US taxable 15%/24%, IRA, UK ISA with 15% US withholding, UK general account with the £500 allowance).
- A welcome screen on first visit: choose light or dark mode, starting money ($1,000 to $1,000,000 or any amount), and whether to take the tutorial.
- Learn tab: a Duolingo-style course, guided by Bullseye the mascot. 16 units and 48 lessons: fundamental analysis (what a share is, the three financial statements, valuation ratios, quality and moats, growth, dividends, red flags, intrinsic value, building a case), then order types and what trading really costs, indicators and their limits, managing risk, the mind of a trader, and reading price charts. Teaching cards, instant feedback, match-the-pairs rounds, chart questions and dividend questions on the simulator's own live stocks. It is candid about the odds: losing runs are normal, most active funds trail their index, the most frequent traders do worst, and past performance guarantees nothing. XP with combos, streaks, daily goals, three daily quests, analyst ranks and 17 achievements -- four of which reward discipline rather than profit: keeping a journal, planning an exit before a trade closes, staying inside your position limit, and taking a loss you had planned for. Spaced-repetition revision, unit guidebooks, unit tests, a timed final certification exam, chart practice and a 2-minute ratio sprint. Every number question says whether a calculator is allowed.
- The Markets chart shows its 6-month trend (click it for the chart guidebook) and can overlay 20/50-day moving averages.
- A guided tour for beginners, and a Help panel with a plain-English glossary (and a button to replay the tour).
- Saves automatically in the browser, and to your account when signed in (see below), so progress follows you between devices.

Prices start near recent real-world levels and are then simulated with a factor model (market, sector, interest rates, region, currency, plus company-specific noise). They are not live market data.

## Accounts and saving progress

The game always saves in the browser. Signing in also saves it to an account, so you can pick up on another device:

- **On the claude.ai link** you are signed in with your Claude account automatically (which itself can use Google, Apple or email). The game saves to that account's private storage.
- **On your own hosted copy** you can turn on **Google, Apple, Microsoft and email sign-in** with Firebase:
  1. Create a project at https://console.firebase.google.com and add a Web app.
  2. Paste its config into `js/firebase-config.js` in place of `null`.
  3. In Authentication > Sign-in method, enable Google, Apple, Microsoft and Email/Password. Apple needs an Apple Developer account (Services ID and key); Microsoft needs an Azure app registration. Firebase's console walks through both.
  4. In Authentication > Settings > Authorized domains, add the domain you host the app on. Sign-in does not work from a `file://` page, so serve it over http(s).
  5. Create a Cloud Firestore database and set these security rules so each person can only read and write their own save:

     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /users/{uid}/bullpen/{doc} {
           allow read, write: if request.auth != null && request.auth.uid == uid;
         }
       }
     }
     ```

Saves are compressed and stored in a few chunks, with a small summary document written last. When you sign in on a device that already has a different game, the app asks which one to keep.

## Files

- `index.html`, `styles.css`: the page
- `js/data.js`: the security list
- `js/engine.js`: the market simulation (prices, dividends, splits, orders)
- `js/charts.js`: canvas charts
- `js/holidays.js`: exchange and national holiday calendars, and region detection
- `js/realdata.js`, `data/real-*.js`: recorded price history for replay mode (see `data/README.md`)
- `js/indicators.js`: moving averages, RSI and MACD, shared by the charts and the backtester
- `js/stats.js`: trading statistics rebuilt from your own recorded trades
- `js/journal.js`: the trading journal
- `js/backtest.js`: the strategy backtester
- `js/calc.js`: dividend calculator projection
- `js/cloud.js`, `js/firebase-config.js`: sign-in and cloud saves
- `js/app.js`: the user interface
- `js/tour.js`: beginner tour and help glossary
- `js/setup.js`: first-run welcome screen
- `js/learn.js`: chart figures, chart notes and trend detection used by the course
- `js/academy-content.js`, `js/academy.js`: Learn course content and engine
