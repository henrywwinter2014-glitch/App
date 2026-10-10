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

- Market, limit and stop orders; buy by share count or dollar amount; optional fractional shares and commission.
- Dividends on real-style schedules (monthly, quarterly, semi-annual, annual) with ex-dates, pay dates, and the price drop on the ex-date.
- Per-holding DRIP (dividend reinvestment), forward income, yield on cost and a monthly income chart.
- Annual dividend raises and cuts, quarterly earnings surprises, stock splits and reverse splits, and macro news (rate decisions, oil shocks, crashes).
- GBP/USD exchange rate and 0.5% UK stamp duty for London shares.
- Portfolio net worth chart against an S&P 500 benchmark, allocation by type and sector.
- Play/pause at several speeds, or skip ahead a day, week, month or year.
- Saves automatically to the browser's local storage.

Prices start near recent real-world levels and are then simulated with a factor model (market, sector, interest rates, region, currency, plus company-specific noise). They are not live market data.

## Files

- `index.html`, `styles.css`: the page
- `js/data.js`: the security list
- `js/engine.js`: the market simulation (prices, dividends, splits, orders)
- `js/charts.js`: canvas charts
- `js/app.js`: the user interface
