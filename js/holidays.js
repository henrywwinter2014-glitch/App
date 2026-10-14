/*
 * Exchange and national holiday calendars.
 *
 * Two different things are easy to confuse, so Bullpen keeps them apart.
 *
 * An *exchange* holiday closes the market. It belongs to the exchange, not to you: if you hold
 * Apple from Manchester, you cannot trade it on Thanksgiving, and you can trade it perfectly well
 * on a British bank holiday.
 *
 * A *national* holiday is yours. It may be a day off work with the market wide open, which is
 * worth knowing but changes nothing about trading. The calendar marks those separately.
 *
 * Dates are computed rather than listed, so every year works, including the ones that depend on
 * Easter and the ones that shift when they land at a weekend.
 */
(function () {
  'use strict';

  const iso = (d) => d.toISOString().slice(0, 10);
  const utc = (y, m, d) => new Date(Date.UTC(y, m, d));
  const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

  // The n-th given weekday of a month, and the last one.
  function nth(y, m, wd, n) {
    const d = utc(y, m, 1);
    d.setUTCDate(1 + ((wd - d.getUTCDay() + 7) % 7) + (n - 1) * 7);
    return d;
  }
  function last(y, m, wd) {
    const d = utc(y, m + 1, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7));
    return d;
  }
  // The Monday on or before a date, used for Victoria Day.
  function monBefore(y, m, d) {
    const x = utc(y, m, d);
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  }

  // Anonymous Gregorian computus: Easter Sunday for a year.
  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mo = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return utc(y, mo - 1, day);
  }
  const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };

  // US style: a weekend holiday is observed on the nearest weekday.
  function nearest(d) {
    const x = new Date(d);
    if (x.getUTCDay() === 6) x.setUTCDate(x.getUTCDate() - 1);
    else if (x.getUTCDay() === 0) x.setUTCDate(x.getUTCDate() + 1);
    return x;
  }

  /*
   * Build a calendar, applying the substitution rule the country uses.
   * 'nearest' is the US rule. 'forward' is the UK and Commonwealth rule: a holiday at a weekend
   * moves to the next working day, and if that day is already taken it moves on again, which is
   * how Christmas and Boxing Day end up on the Monday and Tuesday.
   */
  function build(items, rule) {
    const out = {};
    const taken = new Set();
    const add = (d, name) => { out[iso(d)] = name; taken.add(iso(d)); };
    if (rule === 'none') { for (const [d, name] of items) add(d, name); return out; }
    if (rule === 'nearest') { for (const [d, name] of items) add(nearest(d), name); return out; }
    // forward: order matters, so fixed dates are shifted in the order given
    for (const [d, name] of items) {
      let x = new Date(d);
      let moved = false;
      while (isWeekend(x) || taken.has(iso(x))) { x = addDays(x, 1); moved = true; }
      add(x, moved ? name + ' (substitute day)' : name);
    }
    return out;
  }

  /* ---------- exchange calendars ---------- */
  const EXCHANGES = {
    us: {
      name: 'United States', market: 'NYSE and Nasdaq', tz: 'America/New_York', hours: '9:30 to 16:00',
      cal: (y) => build([
        [utc(y, 0, 1), 'New Year’s Day'],
        [nth(y, 0, 1, 3), 'Martin Luther King Jr. Day'],
        [nth(y, 1, 1, 3), 'Presidents’ Day'],
        [addDays(easter(y), -2), 'Good Friday'],
        [last(y, 4, 1), 'Memorial Day'],
        [utc(y, 5, 19), 'Juneteenth'],
        [utc(y, 6, 4), 'Independence Day'],
        [nth(y, 8, 1, 1), 'Labor Day'],
        [nth(y, 10, 4, 4), 'Thanksgiving'],
        [utc(y, 11, 25), 'Christmas Day'],
      ], 'nearest'),
    },
    uk: {
      name: 'United Kingdom', market: 'London Stock Exchange', tz: 'Europe/London', hours: '8:00 to 16:30',
      cal: (y) => build([
        [utc(y, 0, 1), 'New Year’s Day'],
        [addDays(easter(y), -2), 'Good Friday'],
        [addDays(easter(y), 1), 'Easter Monday'],
        [nth(y, 4, 1, 1), 'Early May bank holiday'],
        [last(y, 4, 1), 'Spring bank holiday'],
        [last(y, 7, 1), 'Summer bank holiday'],
        [utc(y, 11, 25), 'Christmas Day'],
        [utc(y, 11, 26), 'Boxing Day'],
      ], 'forward'),
    },
    ca: {
      name: 'Canada', market: 'Toronto Stock Exchange', tz: 'America/Toronto', hours: '9:30 to 16:00',
      cal: (y) => build([
        [utc(y, 0, 1), 'New Year’s Day'],
        [nth(y, 1, 1, 3), 'Family Day'],
        [addDays(easter(y), -2), 'Good Friday'],
        [monBefore(y, 4, 24), 'Victoria Day'],
        [utc(y, 6, 1), 'Canada Day'],
        [nth(y, 7, 1, 1), 'Civic Holiday'],
        [nth(y, 8, 1, 1), 'Labour Day'],
        [nth(y, 9, 1, 2), 'Thanksgiving'],
        [utc(y, 11, 25), 'Christmas Day'],
        [utc(y, 11, 26), 'Boxing Day'],
      ], 'forward'),
    },
    au: {
      name: 'Australia', market: 'Australian Securities Exchange', tz: 'Australia/Sydney', hours: '10:00 to 16:00',
      cal: (y) => build([
        [utc(y, 0, 1), 'New Year’s Day'],
        [utc(y, 0, 26), 'Australia Day'],
        [addDays(easter(y), -2), 'Good Friday'],
        [addDays(easter(y), 1), 'Easter Monday'],
        [utc(y, 3, 25), 'Anzac Day'],
        [nth(y, 5, 1, 2), 'King’s Birthday'],
        [utc(y, 11, 25), 'Christmas Day'],
        [utc(y, 11, 26), 'Boxing Day'],
      ], 'forward'),
    },
    de: {
      name: 'Germany', market: 'Xetra, Frankfurt', tz: 'Europe/Berlin', hours: '9:00 to 17:30',
      cal: (y) => build([
        [utc(y, 0, 1), 'New Year’s Day'],
        [addDays(easter(y), -2), 'Good Friday'],
        [addDays(easter(y), 1), 'Easter Monday'],
        [utc(y, 4, 1), 'Labour Day'],
        [addDays(easter(y), 50), 'Whit Monday'],
        [utc(y, 11, 24), 'Christmas Eve'],
        [utc(y, 11, 25), 'Christmas Day'],
        [utc(y, 11, 26), 'Boxing Day'],
        [utc(y, 11, 31), 'New Year’s Eve'],
      ], 'none'),
    },
    eu: {
      name: 'Euronext', market: 'Paris, Amsterdam and Brussels', tz: 'Europe/Paris', hours: '9:00 to 17:30',
      cal: (y) => build([
        [utc(y, 0, 1), 'New Year’s Day'],
        [addDays(easter(y), -2), 'Good Friday'],
        [addDays(easter(y), 1), 'Easter Monday'],
        [utc(y, 4, 1), 'Labour Day'],
        [utc(y, 11, 25), 'Christmas Day'],
        [utc(y, 11, 26), 'Boxing Day'],
      ], 'none'),
    },
  };

  /*
   * Days off where you live that the exchange ignores. Only the ones that differ are listed,
   * because a holiday the market also takes is already on the calendar as a closure.
   */
  const NATIONAL_EXTRA = {
    us: (y) => build([
      [nth(y, 9, 1, 2), 'Columbus Day'],
      [utc(y, 10, 11), 'Veterans Day'],
    ], 'nearest'),
    uk: () => ({}),
    ca: (y) => build([[utc(y, 8, 30), 'National Day for Truth and Reconciliation']], 'forward'),
    au: () => ({}),
    de: (y) => build([
      [addDays(easter(y), 39), 'Ascension Day'],
      [utc(y, 9, 3), 'German Unity Day'],
    ], 'none'),
    eu: () => ({}),
  };

  /* ---------- where are you? ---------- */
  // Worked out from the browser's own time zone and language. No location permission is asked
  // for, and nothing is sent anywhere: this only picks which holiday list to use.
  const TZ_COUNTRY = {
    'America/New_York': 'us', 'America/Chicago': 'us', 'America/Denver': 'us', 'America/Los_Angeles': 'us',
    'America/Phoenix': 'us', 'America/Anchorage': 'us', 'Pacific/Honolulu': 'us', 'America/Detroit': 'us',
    'Europe/London': 'uk', 'Europe/Belfast': 'uk', 'Europe/Dublin': 'eu',
    'America/Toronto': 'ca', 'America/Vancouver': 'ca', 'America/Edmonton': 'ca', 'America/Winnipeg': 'ca', 'America/Halifax': 'ca',
    'Australia/Sydney': 'au', 'Australia/Melbourne': 'au', 'Australia/Brisbane': 'au', 'Australia/Perth': 'au', 'Australia/Adelaide': 'au',
    'Europe/Berlin': 'de', 'Europe/Vienna': 'de', 'Europe/Zurich': 'de',
    'Europe/Paris': 'eu', 'Europe/Amsterdam': 'eu', 'Europe/Brussels': 'eu', 'Europe/Madrid': 'eu', 'Europe/Lisbon': 'eu', 'Europe/Rome': 'eu',
  };
  const LANG_COUNTRY = { GB: 'uk', US: 'us', CA: 'ca', AU: 'au', NZ: 'au', DE: 'de', AT: 'de', CH: 'de', FR: 'eu', NL: 'eu', BE: 'eu', ES: 'eu', IT: 'eu', PT: 'eu', IE: 'eu' };

  function detect() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TZ_COUNTRY[tz]) return { code: TZ_COUNTRY[tz], how: `your time zone (${tz})` };
      const langs = [navigator.language || '', ...(navigator.languages || [])];
      for (const l of langs) {
        const r = (l.split('-')[1] || '').toUpperCase();
        if (LANG_COUNTRY[r]) return { code: LANG_COUNTRY[r], how: `your language setting (${l})` };
      }
      if (tz && tz.startsWith('America/')) return { code: 'us', how: `your time zone (${tz})` };
      if (tz && tz.startsWith('Europe/')) return { code: 'eu', how: `your time zone (${tz})` };
      if (tz && tz.startsWith('Australia/')) return { code: 'au', how: `your time zone (${tz})` };
    } catch (e) { /* fall through to the default */ }
    return { code: 'us', how: 'the default, since your region could not be worked out' };
  }

  const cache = {};
  function exchange(code, y) {
    const ex = EXCHANGES[code] || EXCHANGES.us;
    const k = (EXCHANGES[code] ? code : 'us') + y;
    return cache[k] || (cache[k] = ex.cal(y));
  }
  const nationalCache = {};
  function national(code, y) {
    const fn = NATIONAL_EXTRA[code] || NATIONAL_EXTRA.us;
    const k = code + y;
    return nationalCache[k] || (nationalCache[k] = fn(y));
  }
  // The local time at an exchange right now, for the market clock.
  function exchangeTime(code) {
    const ex = EXCHANGES[code] || EXCHANGES.us;
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ex.tz }).format(new Date());
    } catch (e) { return null; }
  }

  window.Holidays = { EXCHANGES, detect, exchange, national, exchangeTime, easter, nth, last };
})();
