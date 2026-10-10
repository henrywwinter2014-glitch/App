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
- Full-screen chart mode (button or double-click) with only Play/Pause, Sell and Buy, and a quick order box on the chart.
- Market, limit and stop orders; buy by share count or dollar amount; optional fractional shares and commission.
- Dividends on real-style schedules (monthly, quarterly, semi-annual, annual) with ex-dates, pay dates, and the price drop on the ex-date.
- Per-holding DRIP (dividend reinvestment), forward income, yield on cost and a monthly income chart.
- Annual dividend raises and cuts, quarterly earnings surprises, stock splits and reverse splits, and macro news (rate decisions, oil shocks, crashes).
- GBP/USD exchange rate and 0.5% UK stamp duty for London shares.
- Portfolio net worth chart against an S&P 500 benchmark, allocation by type and sector.
- Play at ½× to 100× speed (trading days per second), skip ahead 1 day, 1 week, 1 month, 3 months or 1 year, skip any number of days/weeks/months/years, jump to a date, or skip straight to your next dividend payout.
- Dividend speed: keep real schedules, or pay every dividend monthly or weekly (same yearly amount, more often).
- Calendar of ex-dividend days, paydays, dividends received and earnings for your holdings (and watchlist), with one-click "skip to this day".
- Dividend calculator: projects yearly income, final value and annualised return (after tax and fees) from a ticker, your portfolio, or your own numbers, with dividend growth, DRIP, account-specific tax, fund fees and inflation.
- Real-world costs: bid/ask spreads by liquidity (no spread on mutual funds), commission, UK stamp duty, and dividend tax by account type (US taxable 15%/24%, IRA, UK ISA with 15% US withholding, UK general account with the £500 allowance).
- A welcome screen on first visit: choose light or dark mode, starting money ($1,000 to $1,000,000 or any amount), and whether to take the tutorial.
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
- `js/calc.js`: dividend calculator projection
- `js/cloud.js`, `js/firebase-config.js`: sign-in and cloud saves
- `js/app.js`: the user interface
- `js/tour.js`: beginner tour and help glossary
- `js/setup.js`: first-run welcome screen
