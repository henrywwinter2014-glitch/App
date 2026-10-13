# Real market data

Daily bars for 602 of Bullpen's US-listed products, 2 January 2019 to 9 October 2026
(1,954 trading days, about 1.16 million bars), plus 15,937 dividends and splits.

## Where it came from

Scraped Yahoo Finance data published in a public GitHub repository, pulled over
`raw.githubusercontent.com`. **It carries no licence.** Yahoo's terms permit personal use and
prohibit redistribution, so this data is fine for your own practice and is *not* safe to
redistribute or ship to other people. The app says so on screen.

The upstream repository is one person's throwaway snapshot and may vanish, so the bars are
mirrored here rather than fetched at runtime.

## What was done to it

The source is back-adjusted for both splits and dividends, so its older prices are not what
traded on the day — Apple's 28 August 2020 close reads 120.96 there, against the 499.23 that
really printed. Both adjustments are reversed when building `real-*.js`, walking backwards
through the series and undoing each corporate action in turn.

This was checked against closes known independently:

| | reconstructed | actual |
|---|---|---|
| AAPL 2020-08-28 | 499.23 | 499.23 |
| AAPL 2024-12-31 | 250.42 | 250.42 |
| SPY 2020-03-23 | 222.95 | 222.95 |
| MSFT 2020-03-23 | 135.98 | 135.98 |
| KO 2020-03-23 | 37.56 | 37.56 |
| NVDA 2024-06-07 | 1,208.88 | 1,208.88 (pre 10-for-1 split) |

Decoding is verified separately: 39,080 bars re-derived from the source CSVs by an independent
implementation match to 0.0001%, with no volume mismatches.

## Layout

- `real-index.js` — the trading calendar and ticker list (30 KB).
- `real-0.js` … `real-3.js` — the bars, split into four chunks of about 3.2 MB.

Bars are packed as base-64 varints, five per day: the change in close since the previous day,
then open, high and low as offsets from that close, then the change in volume. Prices are whole
units of 1/k, where k is 100 for most names and 10000 for sub-$5 ones, so nothing is a float.
That comes to about 11 bytes per bar. `js/realdata.js` unpacks it.

## What is not covered

- **159 of Bullpen's 761 products have no real data**: its 56 London-listed shares, index and
  money-market mutual funds (VFIAX, VTSAX, FXAIX, VBTLX, FZROX), Berkshire Hathaway, and about
  20 names the source failed to retrieve or that have since been renamed (EA, EQR, WBD, AVB,
  BK, FI, K, MMC, SW, XYZ and others).
- **No intraday data.** Minute bars are not available at any useful scale, so a replayed day
  moves a day at a time rather than tick by tick.

## Rebuilding

`scratchpad/emit.py` regenerates these files from CSVs in `scratchpad/raw/`. The scrape is a
fixed snapshot ending 9 October 2026 and will not update on its own.
