/*
 * Learn: a Duolingo-style course in fundamental stock analysis.
 * A path of units and lessons with teaching cards, multiple-choice, number, chart and
 * match-the-pairs questions; XP, streaks, ranks, daily quests and achievements;
 * spaced-repetition revision, unit tests, a timed final exam and a ratio sprint.
 * Progress lives in the game state (Engine.S.academy), so it saves and syncs with the game.
 */
(function () {
  'use strict';

  const E = window.Engine;
  const { UNITS, GEN, RANKS, SPRINT_GENS, COURSE } = window.AcademyContent;

  // When the course changes, drop progress on lessons that no longer exist. XP, streaks and badges stay.
  function migrateCourse(a) {
    const ids = new Set(UNITS.map((u) => u.id));
    for (const k of Object.keys(a.lessons)) if (!ids.has(k.split(':')[0])) delete a.lessons[k];
    for (const k of Object.keys(a.tests)) if (!ids.has(k)) delete a.tests[k];
    for (const k of Object.keys(a.review)) { const p = k.split(':'); if (p[0] === 'g' ? !GEN[p[1]] : !ids.has(p[1])) delete a.review[k]; }
    a.final = { passed: false, best: 0, date: '' };
    a.sprintBest = 0;
    a.course = COURSE;
  }
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const REVIEW_DAYS = [1, 3, 7, 16, 35];
  const LESSON_LEN = 8, TEST_LEN = 10, FINAL_LEN = 25, FINAL_SECS = 30 * 60, SPRINT_SECS = 120, PASS = 0.8;
  const QUEST_XP = 10;

  /* ---------- state ---------- */
  function A() {
    const S = E.S;
    if (!S.academy) S.academy = {};
    const a = S.academy;
    const defaults = {
      xp: 0, streak: 0, bestStreak: 0, lastDay: '', today: { d: '', xp: 0 }, goal: 30,
      lessons: {}, tests: {}, review: {}, sprintBest: 0, final: { passed: false, best: 0, date: '' },
      quests: { d: '', list: [] }, badges: {}, counts: { correct: 0, lessons: 0, perfect: 0, reviews: 0, bestCombo: 0, charts: 0 }, sound: true,
    };
    for (const k in defaults) if (a[k] === undefined) a[k] = defaults[k];
    if (a.course !== COURSE) migrateCourse(a);
    delete a.hearts; delete a.heartAt; // hearts were removed
    return a;
  }
  function save() { if (window.App && window.App.save) window.App.save(); }
  function saveNow() { if (window.App && window.App.saveNow) window.App.saveNow(); else save(); }
  function toast(msg) { if (window.App && window.App.toast) window.App.toast(msg); }

  function dayStr(d) { const x = d || new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  function addDays(ds, n) { const [y, m, d] = ds.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n)); }


  function addXP(n) {
    const a = A(), today = dayStr();
    if (a.lastDay !== today) {
      a.streak = a.lastDay === addDays(today, -1) ? a.streak + 1 : 1;
      a.lastDay = today;
      a.bestStreak = Math.max(a.bestStreak, a.streak);
    }
    if (a.today.d !== today) a.today = { d: today, xp: 0 };
    a.xp += n; a.today.xp += n;
    questEvent('xp', n);
  }
  function liveStreak(a) { return a.lastDay === dayStr() || a.lastDay === addDays(dayStr(), -1) ? a.streak : 0; }

  function rankOf(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    return { i, name: RANKS[i][1], from: RANKS[i][0], to: RANKS[i + 1] ? RANKS[i + 1][0] : null, next: RANKS[i + 1] ? RANKS[i + 1][1] : null };
  }

  /* ---------- daily quests ---------- */
  const QUESTS = [
    { id: 'xp30', text: 'Earn 30 XP', goal: 30, ev: 'xp' },
    { id: 'xp60', text: 'Earn 60 XP', goal: 60, ev: 'xp' },
    { id: 'lessons2', text: 'Complete 2 lessons', goal: 2, ev: 'lesson' },
    { id: 'perfect', text: 'Finish a lesson with no mistakes', goal: 1, ev: 'perfect' },
    { id: 'combo5', text: 'Get 5 correct in a row', goal: 5, ev: 'combo', max: true },
    { id: 'combo10', text: 'Get 10 correct in a row', goal: 10, ev: 'combo', max: true },
    { id: 'correct20', text: 'Answer 20 questions correctly', goal: 20, ev: 'correct' },
    { id: 'review', text: 'Finish a revision set', goal: 1, ev: 'review' },
    { id: 'sprint15', text: 'Score 15+ in the ratio sprint', goal: 15, ev: 'sprint', max: true },
    { id: 'chart3', text: 'Read 3 charts correctly', goal: 3, ev: 'chart' },
  ];
  // Three quests a day, picked from the date so everyone's day is stable.
  function todaysQuests() {
    const a = A(), today = dayStr();
    if (a.quests.d !== today) {
      let h = 0; for (const c of today) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      const pool = QUESTS.slice(), picked = [];
      const want = (id) => { const i = pool.findIndex((q) => q.id === id); if (i >= 0) picked.push(pool.splice(i, 1)[0]); };
      want(h % 2 ? 'xp30' : 'xp60');
      pool.splice(pool.findIndex((q) => q.id.startsWith('xp')), 1);
      while (picked.length < 3) { h = (h * 1103515245 + 12345) >>> 0; picked.push(pool.splice(h % pool.length, 1)[0]); }
      a.quests = { d: today, list: picked.map((q) => ({ id: q.id, prog: 0, done: false })) };
    }
    return a.quests.list.map((x) => Object.assign({}, QUESTS.find((q) => q.id === x.id), x));
  }
  let questBusy = false;
  function questEvent(ev, n) {
    if (questBusy) return;
    const a = A();
    todaysQuests();
    for (const x of a.quests.list) {
      const q = QUESTS.find((y) => y.id === x.id);
      if (!q || x.done || q.ev !== ev) continue;
      x.prog = q.max ? Math.max(x.prog, n) : x.prog + n;
      if (x.prog >= q.goal) {
        x.done = true; x.prog = q.goal;
        questBusy = true; addXP(QUEST_XP); questBusy = false;
        toast(`Quest complete: ${q.text}. +${QUEST_XP} XP`);
        sfx('quest');
      }
    }
  }

  /* ---------- achievements ---------- */
  const BADGES = [
    { id: 'first', name: 'First steps', desc: 'Finish your first lesson', test: (a) => a.counts.lessons >= 1 },
    { id: 'perfect', name: 'Flawless', desc: 'Finish a lesson with no mistakes', test: (a) => a.counts.perfect >= 1 },
    { id: 'combo10', name: 'On fire', desc: 'Get 10 correct in a row', test: (a) => a.counts.bestCombo >= 10 },
    { id: 'streak3', name: 'Habit forming', desc: 'Reach a 3-day streak', test: (a) => a.bestStreak >= 3 },
    { id: 'streak7', name: 'Week warrior', desc: 'Reach a 7-day streak', test: (a) => a.bestStreak >= 7 },
    { id: 'xp500', name: 'Quick study', desc: 'Earn 500 XP', test: (a) => a.xp >= 500 },
    { id: 'xp2000', name: 'Scholar', desc: 'Earn 2,000 XP', test: (a) => a.xp >= 2000 },
    { id: 'unit1', name: 'Number cruncher', desc: 'Pass your first unit test', test: (a) => Object.values(a.tests).some((t) => t.passed) },
    { id: 'units6', name: 'Halfway there', desc: 'Pass 6 unit tests', test: (a) => Object.values(a.tests).filter((t) => t.passed).length >= 6 },
    { id: 'chartist', name: 'Chartist', desc: 'Read 10 charts correctly', test: (a) => a.counts.charts >= 10 },
    { id: 'reviewer', name: 'Spaced out', desc: 'Finish 5 revision sets', test: (a) => a.counts.reviews >= 5 },
    { id: 'sprint20', name: 'Human calculator', desc: 'Score 20+ in the sprint', test: (a) => a.sprintBest >= 20 },
    { id: 'cert', name: 'Certified analyst', desc: 'Pass the final exam', test: (a) => a.final.passed },
  ];
  function checkBadges() {
    const a = A(), fresh = [];
    for (const b of BADGES) if (!a.badges[b.id] && b.test(a)) { a.badges[b.id] = dayStr(); fresh.push(b); }
    return fresh;
  }

  /* ---------- sound ---------- */
  let audio = null;
  function sfx(kind) {
    if (!A().sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audio.currentTime;
      const notes = { ok: [[660, 0], [880, 0.09]], bad: [[220, 0], [180, 0.12]], done: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]], quest: [[784, 0], [1175, 0.08]], combo: [[880, 0], [1109, 0.07], [1319, 0.14]], fail: [[392, 0], [330, 0.15], [262, 0.3]] }[kind] || [];
      for (const [f, at] of notes) {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = kind === 'bad' || kind === 'fail' ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
        o.connect(g); g.connect(audio.destination);
        o.start(t0 + at); o.stop(t0 + at + 0.25);
      }
    } catch (e) { /* audio not available */ }
  }

  /* ---------- mascot ---------- */
  function mascot(mood) {
    const mouth = mood === 'sad' ? 'M41 63 Q50 56 59 63' : mood === 'wow' ? 'M46 60 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0' : 'M40 58 Q50 68 60 58';
    return `<svg class="mascot ${mood || ''}" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M20 30 Q6 18 10 6 Q18 22 30 24 Z" fill="#f4e3c3"/><path d="M80 30 Q94 18 90 6 Q82 22 70 24 Z" fill="#f4e3c3"/>
      <ellipse cx="16" cy="42" rx="9" ry="6" fill="#8a5a3b"/><ellipse cx="84" cy="42" rx="9" ry="6" fill="#8a5a3b"/>
      <ellipse cx="50" cy="50" rx="32" ry="34" fill="#a9714b"/>
      <ellipse cx="50" cy="70" rx="22" ry="15" fill="#e8b89a"/>
      <ellipse cx="43" cy="70" rx="3" ry="4" fill="#7b4a33"/><ellipse cx="57" cy="70" rx="3" ry="4" fill="#7b4a33"/>
      <circle cx="38" cy="44" r="7" fill="#fff"/><circle cx="62" cy="44" r="7" fill="#fff"/>
      <circle cx="39" cy="45" r="3.6" fill="#1b1b1b"/><circle cx="63" cy="45" r="3.6" fill="#1b1b1b"/>
      <circle cx="40" cy="43.5" r="1.2" fill="#fff"/><circle cx="64" cy="43.5" r="1.2" fill="#fff"/>
      <path d="${mouth}" fill="none" stroke="#5a3424" stroke-width="3" stroke-linecap="round" transform="translate(0 20) scale(1 0.55)"/>
    </svg>`;
  }
  function speech(mood, text) { return `<div class="ac-speech">${mascot(mood)}<div class="ac-bubble-say">${text}</div></div>`; }

  /* ---------- confetti ---------- */
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'ac-confetti';
    $('acad').appendChild(c);
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    const cols = ['#58cc02', '#1cb0f6', '#ff4b4b', '#ffc800', '#ce82ff', '#ff9600'];
    const bits = Array.from({ length: 140 }, () => ({ x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, s: 5 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now();
    const frame = (t) => {
      const age = t - t0;
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.vy += 0.38; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.globalAlpha = Math.max(0, 1 - age / 2400);
        ctx.fillStyle = b.c; ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
      }
      if (age < 2400) requestAnimationFrame(frame); else c.remove();
    };
    requestAnimationFrame(frame);
  }

  /* ---------- progress rules ---------- */
  const lessonKey = (u, l) => `${UNITS[u].id}:${l}`;
  const lessonDone = (u, l) => !!A().lessons[lessonKey(u, l)];
  const testPassed = (u) => !!(A().tests[UNITS[u].id] && A().tests[UNITS[u].id].passed);
  const unitOpen = (u) => u === 0 || testPassed(u - 1);
  const lessonOpen = (u, l) => unitOpen(u) && (l === 0 || lessonDone(u, l - 1));
  const testOpen = (u) => unitOpen(u) && UNITS[u].lessons.every((_, l) => lessonDone(u, l));
  const finalOpen = () => UNITS.every((_, u) => testPassed(u));
  function currentNode() {
    for (let u = 0; u < UNITS.length; u++) {
      if (!unitOpen(u)) return null;
      for (let l = 0; l < UNITS[u].lessons.length; l++) if (!lessonDone(u, l)) return { u, l };
      if (!testPassed(u)) return { u, l: 'test' };
    }
    return null;
  }

  /* ---------- questions ---------- */
  function rng(seed) { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function getQ(key) {
    const p = key.split(':');
    const u = UNITS.findIndex((x) => x.id === p[1]);
    if (p[0] === 'c') { return u < 0 ? null : ((UNITS[u].lessons[+p[2]] || {}).q || [])[+p[3]] || null; }
    if (p[0] === 'm') { const L = u < 0 ? null : UNITS[u].lessons[+p[2]]; return L && L.m ? { q: 'Match the pairs', match: L.m, why: 'Tap a term, then its match.' } : null; }
    if (p[0] === 'g' && GEN[p[1]]) return GEN[p[1]](rng(+p[2]));
    return null;
  }
  const curatedKeys = (u, l) => UNITS[u].lessons[l].q.map((_, i) => `c:${UNITS[u].id}:${l}:${i}`);
  const genKey = (name) => `g:${name}:${1 + Math.floor(Math.random() * 2e9)}`;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function unitGens(u) { return [...new Set(UNITS[u].lessons.flatMap((l) => l.gen || []))]; }

  function item(key) {
    const q = getQ(key);
    if (!q) return null;
    const it = { key, q, tries: 0 };
    if (q.opts) {
      const order = shuffle(q.opts.map((_, i) => i));
      it.opts = order.map((i) => q.opts[i]);
      it.ans = order.indexOf(q.a);
    }
    if (q.match) {
      it.left = shuffle(q.match.map((_, i) => i));
      it.right = shuffle(q.match.map((_, i) => i));
      it.matched = [];
      it.mistakes = 0;
    }
    return it;
  }
  const isChart = (q) => !!(q.fig || q.chart);

  function parseAnswer(str, allowSums) {
    // Accept the number with the extras people naturally type: currency, "x", units, "percent", "about".
    // If the working is shown ("400/500 = 0.8"), the answer is what comes after the last "=".
    let s = String(str).toLowerCase().split('=').filter((x) => x.trim()).pop() || '';
    s = s.trim()
      .replace(/[−–—]/g, '-')
      .replace(/÷|\bover\b|\bout of\b/g, '/')
      .replace(/^(about|approx\.?|around|roughly|≈|~|=)+/, '')
      .replace(/[$£€,\s]/g, '')
      .replace(/^\+/, '');
    if (!s) return null;
    let pct = false;
    if (/(%|percent|pc)$/.test(s)) { pct = true; s = s.replace(/(%|percent|pc)$/, ''); }
    // Units the question already states ("in $ millions", "P/E", "years") don't change the value.
    s = s.replace(/(x|times|years?|yrs?|millions?|mn|m|billions?|bn|b|dollars?|usd|pershare|ashare|\/share)$/, '');
    // A fraction written as a percentage: 400/500×100, (400/500)*100, 400/500 x 100.
    const asPct = /^\(?(-?\d*\.?\d+\/\d*\.?\d+)\)?[x×*]100$/.exec(s);
    if (asPct) { s = asPct[1]; pct = 'fraction'; }
    let v;
    if (/^-?\d*\.?\d+\/\d*\.?\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); v = a / b; }
    else if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) v = Number(s);
    else if (allowSums && /[\d)]/.test(s)) { v = calcEval(s); if (v == null) return null; }
    else return null;
    if (!isFinite(v)) return null;
    if (pct === 'fraction') return { v, pct: true };
    return { v: pct ? v / 100 : v, pct };
  }

  function checkNum(q, input) {
    const p = parseAnswer(input, calcAllowed(q));
    if (!p) return null;
    const ans = q.num;
    if (q.pct) {
      const tol = q.tol != null ? q.tol : 0.002;
      if (Math.abs(p.v - ans) <= tol) return true;
      if (!p.pct && Math.abs(p.v / 100 - ans) <= tol) return true;
      return false;
    }
    const tol = q.tol != null ? q.tol : Number.isInteger(ans) ? 1e-6 : Math.max(1e-6, Math.abs(ans) * 0.01);
    return Math.abs(p.v - ans) <= tol;
  }

  function showAnswer(it) {
    const q = it.q;
    if (q.match) return 'see the pairs above';
    if (q.opts) return it.opts[it.ans];
    if (q.show) return q.show;
    if (q.pct) return `${+(q.num * 100).toFixed(2)}%`;
    return (+q.num.toFixed(4)).toLocaleString('en-US', { maximumFractionDigits: 4 });
  }

  /* ---------- spaced repetition ---------- */
  function markReview(key, ok) {
    const a = A(), today = dayStr();
    const r = a.review[key];
    if (!ok) { a.review[key] = { box: 0, due: today }; return; }
    if (!r) return;
    const box = Math.min(r.box + 1, REVIEW_DAYS.length);
    if (box >= REVIEW_DAYS.length) { delete a.review[key]; return; }
    a.review[key] = { box, due: addDays(today, REVIEW_DAYS[box - 1]) };
  }
  function dueKeys() {
    const a = A(), today = dayStr();
    return Object.keys(a.review).filter((k) => a.review[k].due <= today && getQ(k));
  }

  /* ---------- sessions ---------- */
  let ses = null;

  function startLesson(u, l) {
    const a = A();
    const L = UNITS[u].lessons[l];
    const keys = curatedKeys(u, l);
    const gens = L.gen && L.gen.length ? L.gen : [];
    const room = LESSON_LEN - (L.m ? 1 : 0);
    while (keys.length < room && gens.length) keys.push(genKey(gens[keys.length % gens.length]));
    if (keys.length < room && l > 0) for (let p = 0; p < l && keys.length < room; p++) keys.push(...curatedKeys(u, p).slice(0, room - keys.length));
    shuffle(keys);
    if (L.m) keys.splice(Math.min(keys.length, 2 + Math.floor(Math.random() * 3)), 0, `m:${UNITS[u].id}:${l}`);
    const replay = lessonDone(u, l);
    begin({ kind: 'lesson', u, l, title: `Unit ${u + 1} · ${L.t}`, items: keys.map(item).filter(Boolean),
      intro: { title: L.t, html: L.tip, say: replay ? 'Back for more? Practice makes permanent.' : l === 0 ? `Welcome to ${esc(UNITS[u].title)}! Here’s the key idea.` : 'New concept! Read this, then give it a go.' } });
  }

  function startTest(u, testOut) {
    const keys = shuffle(UNITS[u].lessons.flatMap((_, l) => curatedKeys(u, l))).slice(0, 7);
    const gens = unitGens(u);
    while (keys.length < TEST_LEN) keys.push(gens.length ? genKey(gens[keys.length % gens.length]) : shuffle(UNITS[u].lessons.flatMap((_, l) => curatedKeys(u, l)))[0]);
    begin({ kind: 'test', u, testOut, title: `Unit ${u + 1} test · ${UNITS[u].title}`, items: shuffle(keys).map(item).filter(Boolean), exam: true,
      intro: { title: `${testOut ? 'Test out of' : 'Unit test:'} ${UNITS[u].title}`, say: 'Exam time. You’ve got this!', html: `${CALC_RULE}<p>${TEST_LEN} questions covering the whole unit. Score <b>${PASS * 100}%</b> or more to pass${testOut ? ' and skip ahead to this unit' : ' and unlock the next unit'}.</p><p>Like a real exam, you won’t see answers until the end.</p>` } });
  }

  function startFinal() {
    const keys = [];
    UNITS.forEach((un, u) => { keys.push(...shuffle(un.lessons.flatMap((_, l) => curatedKeys(u, l))).slice(0, 2)); });
    const gens = shuffle(Object.keys(GEN));
    while (keys.length < FINAL_LEN) keys.push(genKey(gens[keys.length % gens.length]));
    begin({ kind: 'final', title: 'Final certification exam', items: shuffle(keys).slice(0, FINAL_LEN).map(item).filter(Boolean), exam: true, timer: FINAL_SECS,
      intro: { title: 'Final certification exam', say: 'This is the big one. Deep breath!', html: `${CALC_RULE}<p>${FINAL_LEN} questions from every unit, with a <b>${FINAL_SECS / 60}-minute</b> time limit. Score <b>${PASS * 100}%</b> to earn your Bullpen Certified Analyst certificate.</p><p>Answers are shown at the end. You can retake it as many times as you like.</p>` } });
  }

  function startReview() {
    const a = A();
    let keys = shuffle(dueKeys()).slice(0, 10);
    if (keys.length < 6) {
      const pool = [];
      UNITS.forEach((un, u) => un.lessons.forEach((L, l) => { if (lessonDone(u, l)) { pool.push(...curatedKeys(u, l)); (L.gen || []).forEach((g) => pool.push(genKey(g))); if (L.m) pool.push(`m:${un.id}:${l}`); } }));
      if (!pool.length) { pool.push(...curatedKeys(0, 0)); UNITS[0].lessons[0].gen.forEach((g) => pool.push(genKey(g))); }
      shuffle(pool);
      while (keys.length < 8 && pool.length) { const k = pool.pop(); if (!keys.includes(k)) keys.push(k); }
    }
    const due = dueKeys().length;
    begin({ kind: 'review', title: 'Revision', items: keys.map(item).filter(Boolean),
      intro: { title: 'Revision', say: due ? 'Let’s fix those mistakes for good.' : 'Nothing due, so here’s a mixed workout.', html: `<p>${due ? `You have <b>${due}</b> question${due === 1 ? '' : 's'} due. Questions you miss come back after 1, 3, 7, 16 and 35 days until they stick.` : 'Questions you get wrong come back here on a schedule until they stick.'}</p>` } });
  }

  function startCharts() {
    const keys = Array.from({ length: 6 }, () => genKey('trendSpot'));
    const figs = [];
    UNITS.forEach((un, u) => un.lessons.forEach((L, l) => L.q.forEach((q, i) => { if (q.fig) figs.push(`c:${un.id}:${l}:${i}`); })));
    keys.push(...shuffle(figs).slice(0, 2));
    begin({ kind: 'charts', title: 'Chart practice', items: shuffle(keys).map(item).filter(Boolean),
      intro: { title: 'Chart practice', say: 'Let’s read some real charts!', html: '<p>Six months of real products from the simulator, names hidden. Spot the trend: are the highs and lows stepping up, stepping down, or going sideways?</p>' } });
  }

  function startSprint() {
    begin({ kind: 'sprint', title: 'Ratio sprint', items: [], timer: SPRINT_SECS, score: 0, attempts: 0,
      intro: { title: 'Ratio sprint', say: 'Speed round! Calculator away!', html: `<p>Work out as many P/E ratios, yields, payout ratios, margins and growth rates as you can in <b>${SPRINT_SECS / 60} minutes</b>. Analysts do these in their heads while skimming a results release.</p><p><b>No calculator</b> in the sprint.</p><p>Type the answer and press Enter. Your best so far: <b>${A().sprintBest}</b>.</p>` } });
  }

  function begin(s) {
    ses = Object.assign({ i: 0, firstTry: 0, results: [], phase: 'intro', started: 0, xp: 0, misses: 0, combo: 0, bestCombo: 0 }, s);
    ses.total = ses.items.length;
    openOverlay();
    render();
  }

  function nextSprintItem() { ses.items.push(item(genKey(SPRINT_GENS[Math.floor(Math.random() * SPRINT_GENS.length)]))); }

  function beginQuestions() {
    ses.phase = 'q';
    ses.started = Date.now();
    if (ses.kind === 'sprint') nextSprintItem();
    if (ses.timer) {
      ses.deadline = Date.now() + ses.timer * 1000;
      clearInterval(ses.tick);
      ses.tick = setInterval(() => {
        if (!ses) return;
        const left = Math.max(0, Math.round((ses.deadline - Date.now()) / 1000));
        const t = $('acTimer');
        if (t) { t.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; t.classList.toggle('low', left <= 15); }
        if (left <= 0) finish();
      }, 250);
    }
    render();
  }

  /* ---------- answering ---------- */
  function currentItem() { return ses.items[ses.i]; }

  function submit() {
    const it = currentItem();
    if (!it || ses.checked) return;
    let ok;
    if (it.q.match) { if (it.matched.length < it.q.match.length) return; ok = it.mistakes === 0; it.given = `${it.mistakes} mistake${it.mistakes === 1 ? '' : 's'}`; }
    else if (it.q.opts) { if (ses.sel == null) return; ok = ses.sel === it.ans; it.given = it.opts[ses.sel]; }
    else {
      const v = $('acInput') ? $('acInput').value : '';
      ok = checkNum(it.q, v);
      if (ok === null) { flashInput(); return; }
      // A common slip (the part kept instead of the part lost, new ÷ old instead of growth) gets
      // one hint and another try, outside exams and the sprint.
      if (!ok && it.q.near && !it.nudged && !ses.exam && ses.kind !== 'sprint') {
        const slip = it.q.near.find((x) => checkNum(Object.assign({}, it.q, { num: x.num }), v));
        if (slip) { it.nudged = true; return nudge(slip.say); }
      }
      it.given = v;
    }

    if (ses.kind === 'sprint') {
      ses.attempts++;
      if (ok) { ses.score++; sfx('ok'); } else sfx('bad');
      const fb = $('acFlash'); if (fb) { fb.textContent = ok ? 'Correct' : `${showAnswer(it)}`; fb.className = 'ac-flash ' + (ok ? 'ok' : 'bad'); }
      ses.i++; ses.sel = null; nextSprintItem(); renderQuestion(true); return;
    }

    it.tries++;
    if (ses.exam) {
      ses.results.push({ it, ok });
      if (ok) ses.firstTry++;
      advance();
      return;
    }
    ses.checked = true; ses.lastOk = ok;
    if (ok) {
      if (it.tries === 1) ses.firstTry++;
      ses.combo++; ses.bestCombo = Math.max(ses.bestCombo, ses.combo);
      const a = A(); a.counts.correct++; a.counts.bestCombo = Math.max(a.counts.bestCombo, ses.combo);
      if (isChart(it.q)) { a.counts.charts++; questEvent('chart', 1); }
      questEvent('correct', 1); questEvent('combo', ses.combo);
      sfx([3, 5, 10, 15, 20].includes(ses.combo) ? 'combo' : 'ok');
    } else {
      ses.combo = 0;
      ses.misses++;
      if (it.tries === 1) ses.items.push(Object.assign({}, it, it.q.match ? { matched: [], mistakes: 0, left: shuffle(it.left.slice()), right: shuffle(it.right.slice()) } : {}, { tries: 1, again: true, nudged: false }));
      sfx('bad');
    }
    markReview(it.key, ok);
    ses.results.push({ it, ok });
    renderFeedback();
  }

  function nudge(text) {
    const e = $('acErr'), i = $('acInput');
    if (e) { e.hidden = false; e.classList.add('hint'); e.textContent = text + ' Try again.'; }
    if (i) { i.focus(); i.select(); }
  }
  function flashInput() {
    const i = $('acInput');
    if (!i) return;
    i.classList.remove('shake'); void i.offsetWidth; i.classList.add('shake'); i.focus();
    const q = currentItem() && currentItem().q;
    const e = $('acErr');
    if (e) { e.hidden = false; e.classList.remove('hint'); e.textContent = `I couldn’t read “${i.value.trim()}” as a number. Type just the number, like ${q && q.pct ? '80%, 0.8 or 400/500' : '42, 1.5 or 400/500'}.`; }
  }

  function advance() {
    ses.checked = false; ses.sel = null; ses.mSel = null;
    ses.i++;
    if (ses.i >= ses.items.length) return finish();
    render();
  }

  function finish() {
    if (!ses || ses.phase === 'end') return;
    clearInterval(ses.tick);
    const a = A();
    ses.secs = Math.round((Date.now() - ses.started) / 1000);
    if (ses.kind === 'lesson') {
      const acc = ses.firstTry / ses.total;
      const key = lessonKey(ses.u, ses.l);
      const replay = !!a.lessons[key];
      ses.xp = (replay ? 5 : 10) + ses.firstTry + (acc === 1 ? 5 : 0);
      a.lessons[key] = { done: (a.lessons[key] ? a.lessons[key].done : 0) + 1, best: Math.max(acc, a.lessons[key] ? a.lessons[key].best : 0) };
      ses.acc = acc;
      a.counts.lessons++;
      questEvent('lesson', 1);
      if (acc === 1) { a.counts.perfect++; questEvent('perfect', 1); }
    } else if (ses.kind === 'test' || ses.kind === 'final') {
      const acc = ses.firstTry / ses.total;
      ses.acc = acc; ses.passed = acc >= PASS;
      if (ses.kind === 'test') {
        const id = UNITS[ses.u].id;
        const prev = a.tests[id] || {};
        ses.xp = ses.passed ? (prev.passed ? 10 : 25) : 5;
        a.tests[id] = { passed: prev.passed || ses.passed, best: Math.max(prev.best || 0, acc) };
        if (ses.passed && ses.testOut) {
          for (let u = 0; u <= ses.u; u++) {
            UNITS[u].lessons.forEach((_, l) => { const k = lessonKey(u, l); if (!a.lessons[k]) a.lessons[k] = { done: 1, best: 0 }; });
            const uid = UNITS[u].id; a.tests[uid] = Object.assign({ best: 0 }, a.tests[uid], { passed: true });
          }
        }
      } else {
        ses.xp = ses.passed ? (a.final.passed ? 20 : 100) : 10;
        a.final = { passed: a.final.passed || ses.passed, best: Math.max(a.final.best, acc), date: ses.passed && !a.final.passed ? dayStr() : a.final.date };
      }
      ses.results.forEach((r) => { if (!r.ok) markReview(r.it.key, false); });
    } else if (ses.kind === 'review' || ses.kind === 'charts') {
      const right = ses.results.filter((r) => r.ok).length;
      ses.xp = 5 + right;
      ses.acc = ses.firstTry / Math.max(1, ses.total);
      if (ses.kind === 'review') {
        a.counts.reviews++; questEvent('review', 1);
      }
    } else if (ses.kind === 'sprint') {
      ses.newBest = ses.score > a.sprintBest;
      a.sprintBest = Math.max(a.sprintBest, ses.score);
      ses.xp = Math.min(30, Math.floor(ses.score / 2));
      questEvent('sprint', ses.score);
    }
    const rankBefore = rankOf(a.xp).name;
    const xpBefore = a.xp;
    if (ses.xp) addXP(ses.xp);
    ses.xpGained = a.xp - xpBefore;   // includes any quest bonuses earned on the way
    ses.rankUp = rankOf(a.xp).name !== rankBefore ? rankOf(a.xp).name : null;
    ses.badges = checkBadges();
    ses.phase = 'end';
    saveNow();
    render();
    renderPage();
    const good = ses.kind === 'sprint' || !ses.exam || ses.passed;
    sfx(good ? 'done' : 'fail');
    if (good) confetti();
  }

  /* ---------- overlay ---------- */
  function openOverlay() { $('acad').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeOverlay() {
    document.querySelectorAll('.ac-confetti').forEach((c) => c.remove());
    if (ses) clearInterval(ses.tick);
    ses = null;
    $('acad').hidden = true;
    document.body.style.overflow = '';
    renderPage();
  }


  function render() {
    if (!ses) return;
    const done = ses.kind === 'sprint' ? 0 : ses.phase === 'end' ? 1 : ses.phase === 'q' ? Math.min(1, ses.i / Math.max(1, ses.items.length)) : 0;
    $('acBar').style.width = (done * 100).toFixed(1) + '%';
    $('acTimer').textContent = '';
    $('acTimer').hidden = !ses.timer || ses.phase !== 'q';
    $('acKind').textContent = ses.title || '';
    $('acCombo').hidden = true;
    if (ses.phase === 'intro') return renderIntro();
    if (ses.phase === 'end') return renderEnd();
    renderQuestion();
  }

  function renderIntro() {
    $('acMain').innerHTML = `<div class="ac-card ac-intro">${speech('happy', ses.intro.say || 'Let’s go!')}<span class="ac-eyebrow">${ses.kind === 'lesson' ? 'New concept' : ses.kind === 'review' ? 'Revision' : ses.kind === 'sprint' ? 'Speed round' : ses.kind === 'charts' ? 'Practice' : 'Exam'}</span><h2>${esc(ses.intro.title)}</h2><div class="ac-tip">${ses.intro.html}</div></div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<span></span><button type="button" class="chunky" id="acGo">${ses.kind === 'lesson' ? 'Start lesson' : ses.kind === 'sprint' ? 'Start sprint' : ses.kind === 'review' ? 'Start revision' : ses.kind === 'charts' ? 'Start' : 'Start exam'}</button>`;
    $('acGo').focus();
  }

  function drawQuestionChart(q) {
    const c = $('acFig');
    if (!c || !window.Learn) return;
    if (q.fig) window.Learn.drawFigure(c, window.Learn.FIGS[q.fig], { plain: q.plain });
    else if (q.chart) { const h = q.chart; window.Learn.drawFigure(c, { make: () => ({ c: h, overlays: [{ v: window.Learn.sma(h, 50), color: 'sell', label: '50-day average' }] }), type: 'line' }); }
  }

  function matchHTML(it) {
    const done = new Set(it.matched);
    const col = (side, order) => order.map((i) => {
      const text = it.q.match[i][side === 'l' ? 0 : 1];
      const sel = ses.mSel && ses.mSel.side === side && ses.mSel.i === i;
      return `<button type="button" class="ac-match${done.has(i) ? ' done' : ''}${sel ? ' sel' : ''}" data-m${side}="${i}"${done.has(i) ? ' disabled' : ''}>${esc(text)}</button>`;
    }).join('');
    return `<div class="ac-matchgrid"><div>${col('l', it.left)}</div><div>${col('r', it.right)}</div></div>`;
  }

  /* ---------- calculator ---------- */
  const CALC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="6" width="8" height="3" fill="currentColor"/><circle cx="9" cy="13" r="1.2" fill="currentColor"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/><circle cx="15" cy="13" r="1.2" fill="currentColor"/><circle cx="9" cy="17" r="1.2" fill="currentColor"/><circle cx="12" cy="17" r="1.2" fill="currentColor"/><circle cx="15" cy="17" r="1.2" fill="currentColor"/></svg>';
  // Number questions are mental maths unless marked calc. The sprint never allows one.
  const CALC_RULE = '<p class="ac-calcrule">' + '<b>Calculator rules:</b> each number question says whether a calculator is allowed. When it is, use the built-in one. The rest are mental maths.</p>';
  const calcAllowed = (q) => !!q.calc && !(ses && ses.kind === 'sprint');

  // Evaluates + − × ÷ ^ √ ( ) and % on numbers, without eval. Returns null if it can't.
  function calcEval(src) {
    const s = String(src).replace(/,/g, '').replace(/×|x|\*/gi, '*').replace(/÷/g, '/').replace(/−|–/g, '-').replace(/sqrt/gi, '√').replace(/\s+/g, '');
    if (!s || /[^0-9.+\-*/^()%√]/.test(s)) return null;
    let i = 0;
    const peek = () => s[i];
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = s[i++]; const w = term(); v = op === '+' ? v + w : v - w; } return v; }
    function term() { let v = unary(); while (peek() === '*' || peek() === '/') { const op = s[i++]; const w = unary(); v = op === '*' ? v * w : v / w; } return v; }
    function unary() { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return power(); }
    function power() { const b = root(); if (peek() === '^') { i++; return Math.pow(b, unary()); } return b; }
    function root() { if (peek() === '√') { i++; return Math.sqrt(root()); } return post(); }
    function post() { let v = atom(); while (peek() === '%') { i++; v /= 100; } return v; }
    function atom() {
      if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw 0; return v; }
      const m = /^\d*\.?\d+|^\d+\./.exec(s.slice(i));
      if (!m) throw 0;
      i += m[0].length; return parseFloat(m[0]);
    }
    try { const v = expr(); return i === s.length && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  const calcFmt = (v) => String(+v.toPrecision(10));
  function calcUpdate() {
    const v = calcEval($('acCalc').value);
    $('acCalcOut').textContent = v == null ? ($('acCalc').value.trim() ? '= …' : '= ') : '= ' + (Math.abs(v) < 1e15 ? v.toLocaleString('en-US', { maximumFractionDigits: 8 }) : calcFmt(v));
    $('acCalcUse').disabled = v == null;
    return v;
  }
  function calcUse() {
    const v = calcEval($('acCalc').value);
    if (v == null || !$('acInput') || $('acInput').disabled) return;
    $('acInput').value = calcFmt(v);
    $('acCheck').disabled = false;
    $('acInput').focus();
  }

  function renderQuestion(keepFlash) {
    const it = currentItem();
    const q = it.q;
    const n = ses.kind === 'sprint' ? `Score ${ses.score}` : `Question ${Math.min(ses.i + 1, ses.items.length)} of ${ses.items.length}`;
    const flash = keepFlash && $('acFlash') ? $('acFlash').outerHTML : '<p class="ac-flash" id="acFlash"></p>';
    let body;
    if (q.match) body = matchHTML(it);
    else if (q.opts) body = `<div class="ac-opts${q.opts.length === 3 && isChart(q) ? ' three' : ''}">${it.opts.map((o, i) => `<button type="button" class="ac-opt${ses.sel === i ? ' sel' : ''}" data-opt="${i}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div>`;
    else {
      const calc = calcAllowed(q);
      body = `<div class="ac-num"><input id="acInput" type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" aria-label="Your answer"><span class="ac-hint">${q.pct ? 'Enter a %, a decimal or a fraction, e.g. 80%, 0.8, 400/500 or 400/500 × 100' : 'Fractions like 400/500 are fine'}${calc ? '. You can also type a whole sum, like (460 − 400) / 400' : ''}</span><div class="ac-anskeys" aria-label="Extra keys">${['/', '×', '%', '−', '.'].map((k) => `<button type="button" class="btn btn-ghost small" data-ak="${k}" aria-label="Type ${k === '/' ? 'divide' : k === '×' ? 'times' : k === '%' ? 'percent' : k === '−' ? 'minus' : 'decimal point'}">${k}</button>`).join('')}</div><span class="ac-err" id="acErr" role="alert" hidden></span></div>
        <div class="ac-calcrow"><span class="ac-calcchip ${calc ? 'yes' : 'no'}">${calc ? CALC_SVG : CALC_SVG.replace('</svg>', '<path d="M3 3l18 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>')}${calc ? 'Calculator allowed' : 'No calculator: mental maths'}</span>${calc ? '<button type="button" class="btn btn-ghost small" id="acCalcBtn" aria-expanded="false">Open calculator</button>' : ''}</div>
        ${calc ? `<div class="ac-calc" id="acCalcBox" hidden><input id="acCalc" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="Type a sum, e.g. 3.75 / 75 * 100" aria-label="Calculator"><div class="ac-calc-keys">${['(', ')', '^', '√', '÷', '×', '−', '+'].map((k) => `<button type="button" class="btn btn-ghost small" data-ck="${k}">${k}</button>`).join('')}</div><div class="ac-calc-out"><span id="acCalcOut" aria-live="polite">= </span><button type="button" class="btn small" id="acCalcUse" disabled>Use this answer</button></div></div>` : ''}`;
    }
    $('acMain').innerHTML = `<div class="ac-card">
      <span class="ac-eyebrow">${n}${it.again ? ' · Try again' : ''}${q.match ? ' · New word pairs' : ''}</span>
      <h2 class="ac-q">${esc(q.q)}</h2>
      ${isChart(q) ? '<figure class="ac-fig"><canvas id="acFig" height="230"></canvas></figure>' : ''}
      ${q.code ? `<pre class="ac-code"><code>${esc(q.code)}</code></pre>` : ''}
      ${body}
      ${ses.kind === 'sprint' ? flash : ''}
    </div>`;
    drawQuestionChart(q);
    $('acFoot').className = 'ac-foot';
    const label = ses.exam ? (ses.i + 1 >= ses.items.length ? 'Finish' : 'Next') : ses.kind === 'sprint' ? 'Enter' : 'Check';
    $('acFoot').innerHTML = `<button type="button" class="btn btn-ghost" id="acSkip">${q.match ? 'Can’t do this now' : 'Skip'}</button>${q.match ? '<span></span>' : `<button type="button" class="chunky" id="acCheck"${q.opts && ses.sel == null ? ' disabled' : ''}>${label}</button>`}`;
    if (ses.timer) $('acTimer').hidden = false;
    if (ses.combo >= 3 && !ses.exam) { $('acCombo').hidden = false; $('acCombo').textContent = `${ses.combo} in a row`; }
    const inp = $('acInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('input', () => { $('acCheck').disabled = !inp.value.trim(); if ($('acErr')) $('acErr').hidden = true; });
      $('acCheck').disabled = true;
    }
  }

  function pickMatch(side, i) {
    const it = currentItem();
    if (!it || !it.q.match || ses.checked) return;
    if (!ses.mSel || ses.mSel.side === side) { ses.mSel = { side, i }; return refreshMatch(); }
    const l = side === 'l' ? i : ses.mSel.i, r = side === 'r' ? i : ses.mSel.i;
    ses.mSel = null;
    if (l === r) {
      it.matched.push(l); sfx('ok');
      refreshMatch();
      if (it.matched.length === it.q.match.length) setTimeout(submit, 350);
    } else {
      it.mistakes++; sfx('bad');
      refreshMatch();
      for (const [s2, k] of [['l', l], ['r', r]]) { const b = document.querySelector(`[data-m${s2}="${k}"]`); if (b) { b.classList.add('wrong'); setTimeout(() => b.classList.remove('wrong'), 450); } }
    }
  }
  function refreshMatch() { const g = document.querySelector('.ac-matchgrid'); if (g) g.outerHTML = matchHTML(currentItem()); }

  const PRAISE = ['Correct!', 'Nice work!', 'Spot on!', 'Exactly right!', 'Great!', 'Brilliant!'];
  function renderFeedback() {
    const it = currentItem();
    document.querySelectorAll('.ac-opt').forEach((b) => {
      const i = +b.dataset.opt;
      b.disabled = true;
      if (i === it.ans) b.classList.add('right');
      else if (i === ses.sel) b.classList.add('wrong');
    });
    if ($('acCalcBox')) { $('acCalc').disabled = true; $('acCalcUse').disabled = true; document.querySelectorAll('[data-ck], #acCalcBtn').forEach((b) => { b.disabled = true; }); }
    document.querySelectorAll('[data-ak]').forEach((b) => { b.disabled = true; });
    if ($('acInput')) { $('acInput').disabled = true; $('acInput').classList.add(ses.lastOk ? 'right' : 'wrong'); }
    const ok = ses.lastOk;
    let head;
    if (it.q.match) head = ok ? 'Perfect match!' : `Done, with ${it.mistakes} mistake${it.mistakes === 1 ? '' : 's'}. You’ll see these again.`;
    else head = ok ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : 'Correct answer: ' + esc(showAnswer(it));
    const combo = ok && [3, 5, 10, 15, 20].includes(ses.combo) ? `<span class="ac-combo-pop">${ses.combo} in a row!</span>` : '';
    $('acFoot').className = 'ac-foot ' + (ok ? 'ok' : 'bad');
    $('acFoot').innerHTML = `<div class="ac-fb">${mascot(ok ? (combo ? 'wow' : 'happy') : 'sad')}<div><b>${head}</b>${combo}<p>${it.q.match && ok ? 'Every pair right first time.' : esc(it.q.why || '')}</p></div></div><button type="button" class="chunky ${ok ? '' : 'red'}" id="acNext">Continue</button>`;
    $('acCombo').hidden = true;
    $('acNext').focus();
  }

  function fmtSecs(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function renderEnd() {
    const a = A();
    let head, sub, tiles, extra = '', mood = 'happy';
    if (ses.kind === 'sprint') {
      head = ses.newBest ? 'New personal best!' : 'Time’s up!';
      sub = `${ses.score} correct out of ${ses.attempts} attempted in ${SPRINT_SECS / 60} minutes.`;
      tiles = [['Score', ses.score], ['Best', a.sprintBest], ['XP', `+<span data-count="${ses.xpGained}">0</span>`]];
      if (ses.newBest) mood = 'wow';
    } else if (ses.exam) {
      const pct = Math.round(ses.acc * 100);
      head = ses.passed ? (ses.kind === 'final' ? 'You are a Bullpen Certified Analyst!' : 'Unit test passed!') : 'Not quite this time';
      mood = ses.passed ? 'wow' : 'sad';
      sub = ses.passed ? (ses.kind === 'final' ? 'You passed the final exam. Your certificate is on the Learn page.' : ses.testOut ? 'You tested out and skipped ahead.' : 'The next unit is unlocked.') : `You need ${PASS * 100}% to pass. Review the questions below, revise, and try again.`;
      tiles = [['Score', pct + '%'], ['Correct', `${ses.firstTry}/${ses.total}`], ['Time', fmtSecs(ses.secs)], ['XP', `+<span data-count="${ses.xpGained}">0</span>`]];
      const wrong = ses.results.filter((r) => !r.ok);
      const unanswered = ses.items.slice(ses.results.length);
      if (wrong.length || unanswered.length) {
        extra = `<div class="ac-review"><h3>Review your mistakes</h3>${wrong.concat(unanswered.map((it) => ({ it, skipped: true }))).map((r) => `<div class="ac-rev"><p class="ac-rev-q">${esc(r.it.q.q)}</p>${r.it.q.code ? `<pre class="ac-code small"><code>${esc(r.it.q.code)}</code></pre>` : ''}<p><span class="bad">${r.skipped ? 'Not answered' : 'Your answer: ' + esc(r.it.given || '–')}</span> · <span class="ok">Correct: ${esc(showAnswer(r.it))}</span></p><p class="muted">${esc(r.it.q.why || '')}</p></div>`).join('')}<p class="muted small">These questions have been added to your revision queue.</p></div>`;
      }
    } else {
      const pct = Math.round(ses.acc * 100);
      head = ses.kind === 'review' ? 'Revision complete!' : ses.kind === 'charts' ? 'Chart practice done!' : pct === 100 ? 'Perfect lesson!' : 'Lesson complete!';
      if (pct === 100) mood = 'wow';
      sub = ses.kind === 'review' ? 'Keep revising to make it stick.' : ses.misses ? `You missed ${ses.misses} question${ses.misses === 1 ? '' : 's'}. Missed questions go into your revision queue.` : 'No mistakes. Great work.';
      tiles = [['XP', `+<span data-count="${ses.xpGained}">0</span>`], ['Accuracy', pct + '%'], ['Best combo', ses.bestCombo], ['Time', fmtSecs(ses.secs)]];
    }
    const rk = rankOf(a.xp);
    const quests = todaysQuests();
    $('acMain').innerHTML = `<div class="ac-card ac-intro center">
      ${mascot(mood)}
      <h2 class="ac-done ${mood === 'sad' ? 'fail' : ''}">${head}</h2><p class="muted">${sub}</p>
      <div class="ac-tiles">${tiles.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      ${ses.rankUp ? `<p class="ac-rankup">Promoted to <b>${esc(ses.rankUp)}</b>!</p>` : ''}
      ${(ses.badges || []).map((b) => `<div class="ac-newbadge">${badgeIcon(b, true)}<div><b>Achievement unlocked: ${esc(b.name)}</b><span>${esc(b.desc)}</span></div></div>`).join('')}
      <div class="ac-endquests">${quests.map((q) => `<div class="${q.done ? 'done' : ''}"><span>${esc(q.text)}</span><div class="ac-meter small"><i style="width:${Math.min(100, (q.prog / q.goal) * 100)}%"></i></div></div>`).join('')}</div>
      <p class="muted small">Streak: ${liveStreak(a)} day${liveStreak(a) === 1 ? '' : 's'} · Today ${a.today.xp}/${a.goal} XP · ${esc(rk.name)}</p>
      ${extra}
    </div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<span></span><button type="button" class="chunky" id="acDone">Continue</button>`;
    $('acDone').focus();
    countUp();
  }

  function countUp() {
    document.querySelectorAll('#acMain [data-count]').forEach((el) => {
      const target = +el.dataset.count, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 700); el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  }

  /* ---------- page ---------- */
  function renderPage() {
    if (!$('tab-academy') || $('tab-academy').hidden) return;
    renderPath();
    renderSide();
  }

  const NODE_X = [0, 46, 70, 46, 0, -46, -70, -46];
  const UNIT_HUES = [145, 205, 265, 30, 175, 330, 220, 95, 285, 190, 12, 250, 45];

  function statsHTML(a, cls) {
    return `<div class="ac-stats ${cls || ''}">
        <div class="ac-stat streak${liveStreak(a) ? ' on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3 .5-6 1-9z"/></svg><b>${liveStreak(a)}</b><span>day streak</span></div>
        <div class="ac-stat xp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg><b>${a.xp}</b><span>total XP</span></div>
        <div class="ac-stat lessons"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><b>${Object.keys(a.lessons).length}</b><span>lessons done</span></div>
      </div>`;
  }

  function badgeIcon(b, on) {
    const hue = (BADGES.indexOf(b) * 47) % 360;
    return `<span class="ac-badgeicon${on ? ' on' : ''}" style="--bh:${hue}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 15.3 6.7 18.1l1-5.8L3.5 8.2l5.9-.9z"/></svg></span>`;
  }

  function renderPath() {
    const cur = currentNode();
    let html = '', k = 0;
    UNITS.forEach((un, u) => {
      const open = unitOpen(u);
      const passed = testPassed(u);
      const prevOpen = u > 0 && unitOpen(u - 1) && !open;
      const doneCount = un.lessons.filter((_, l) => lessonDone(u, l)).length;
      html += `<section class="ac-unit${open ? '' : ' locked'}${passed ? ' passed' : ''}" style="--hue:${UNIT_HUES[u % UNIT_HUES.length]}">
        <header class="ac-unit-head"><div><span class="ac-eyebrow">Unit ${u + 1}${passed ? ' · Passed' : open ? ` · ${doneCount}/${un.lessons.length} lessons` : ''}</span><h3>${esc(un.title)}</h3><p>${esc(un.blurb)}</p></div>
          <div class="ac-unit-btns"><button type="button" class="btn" data-guide="${u}">Guidebook</button>${prevOpen ? `<button type="button" class="btn" data-testout="${u}">Test out</button>` : ''}</div></header>
        <div class="ac-nodes">`;
      un.lessons.forEach((L, l) => {
        const done = lessonDone(u, l), op = lessonOpen(u, l);
        const isCur = cur && cur.u === u && cur.l === l;
        const best = done ? A().lessons[lessonKey(u, l)].best : 0;
        html += `<div class="ac-node-wrap" style="transform:translateX(${NODE_X[k++ % NODE_X.length]}px)">
          ${isCur ? `<span class="ac-bubble">${doneCount === 0 && l === 0 ? 'Start' : 'Next'}</span>` : ''}
          <button type="button" class="ac-node ${done ? 'done' : op ? 'open' : 'locked'}${isCur ? ' cur' : ''}${done && best === 1 ? ' gold' : ''}" data-lesson="${u}:${l}" aria-label="Lesson: ${esc(L.t)}${done ? ', done' : op ? '' : ', locked'}">
            ${done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : op ? `<span>${l + 1}</span>` : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'}
          </button><span class="ac-node-label">${esc(L.t)}${done && best === 1 ? ' · perfect' : ''}</span></div>`;
      });
      const tOpen = testOpen(u), isCurT = cur && cur.u === u && cur.l === 'test';
      html += `<div class="ac-node-wrap" style="transform:translateX(${NODE_X[k++ % NODE_X.length]}px)">${isCurT ? '<span class="ac-bubble">Test</span>' : ''}
          <button type="button" class="ac-node test ${passed ? 'done' : tOpen ? 'open' : 'locked'}${isCurT ? ' cur' : ''}" data-test="${u}" aria-label="Unit test${passed ? ', passed' : tOpen ? '' : ', locked'}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v3a5 5 0 0 1-10 0V4z M5 5H3v1.5A3.5 3.5 0 0 0 6.5 10 M19 5h2v1.5A3.5 3.5 0 0 1 17.5 10 M12 12v4 M8 20h8 M9.5 16h5v4h-5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </button><span class="ac-node-label">Unit test${A().tests[un.id] ? ` · best ${Math.round(A().tests[un.id].best * 100)}%` : ''}</span></div>`;
      html += `</div></section>`;
    });
    const fOpen = finalOpen();
    html += `<section class="ac-unit final${fOpen ? '' : ' locked'}"><header class="ac-unit-head"><div><span class="ac-eyebrow">Final</span><h3>Certification exam</h3><p>${FINAL_LEN} timed questions across all ${UNITS.length} units. ${fOpen ? 'Score 80% to earn your certificate.' : 'Pass all the unit tests to unlock it.'}</p></div>
      <div class="ac-unit-btns"><button type="button" class="chunky small" data-final${fOpen ? '' : ' disabled'}>${A().final.passed ? 'Retake exam' : 'Take the exam'}</button></div></header></section>`;
    const a = A();
    const intro = !a.counts.lessons && !a.xp ? `<div class="ac-welcome">${speech('happy', `<b>Hi, I’m Bullseye!</b> I’ll teach you to analyse a stock like a professional: reading the accounts, valuing a business, checking the dividend and spotting red flags. A few minutes a day is all it takes. Tap <b>Start</b> below.`)}</div>` : '';
    $('acPath').innerHTML = statsHTML(a, 'ac-stats-m') + intro + html;
  }

  function renderSide() {
    const a = A();
    const rk = rankOf(a.xp);
    const due = dueKeys().length;
    const today = a.today.d === dayStr() ? a.today.xp : 0;
    const unitsPassed = UNITS.filter((_, u) => testPassed(u)).length;
    const lessonsDone = UNITS.reduce((n, un, u) => n + un.lessons.filter((_, l) => lessonDone(u, l)).length, 0);
    const totalLessons = UNITS.reduce((n, un) => n + un.lessons.length, 0);
    const quests = todaysQuests();
    const earned = BADGES.filter((b) => a.badges[b.id]).length;
    $('acSide').innerHTML = `
      ${statsHTML(a)}
      <div class="card ac-side-card">
        <div class="ac-row"><b>Daily goal</b><select id="acGoal" aria-label="Daily XP goal">${[10, 20, 30, 50, 100].map((g) => `<option value="${g}"${a.goal === g ? ' selected' : ''}>${g} XP</option>`).join('')}</select></div>
        <div class="ac-meter"><i style="width:${Math.min(100, (today / a.goal) * 100)}%"></i></div>
        <p class="muted small">${today >= a.goal ? 'Goal reached today. Your streak is safe!' : `${today} / ${a.goal} XP today. One lesson is about 15 XP.`}</p>
      </div>
      <div class="card ac-side-card">
        <div class="ac-row"><b>Daily quests</b><span class="muted small">+${QUEST_XP} XP each</span></div>
        ${quests.map((q) => `<div class="ac-quest${q.done ? ' done' : ''}"><div class="ac-row"><span>${esc(q.text)}</span><span class="muted small">${q.done ? 'Done' : `${q.prog}/${q.goal}`}</span></div><div class="ac-meter small"><i style="width:${Math.min(100, (q.prog / q.goal) * 100)}%"></i></div></div>`).join('')}
      </div>
      <div class="card ac-side-card">
        <span class="ac-eyebrow">Your rank</span>
        <div class="ac-rank"><b>${esc(rk.name)}</b><span class="muted small">${rk.next ? `${rk.to - a.xp} XP to ${esc(rk.next)}` : 'Top rank reached'}</span></div>
        <div class="ac-meter gold"><i style="width:${rk.to ? Math.min(100, ((a.xp - rk.from) / (rk.to - rk.from)) * 100) : 100}%"></i></div>
        <p class="muted small">${lessonsDone}/${totalLessons} lessons · ${unitsPassed}/${UNITS.length} unit tests passed</p>
      </div>
      <div class="card ac-side-card">
        <div class="ac-row"><b>Revision</b><span class="ac-badge${due ? ' on' : ''}">${due} due</span></div>
        <p class="muted small">Mistakes come back on a schedule until they stick.</p>
        <button type="button" class="chunky small block" id="acReviseBtn">${due ? `Revise ${due} question${due === 1 ? '' : 's'}` : 'Practise'}</button>
      </div>
      <div class="card ac-side-card">
        <div class="ac-row"><b>Practice</b></div>
        <p class="muted small">Read real charts from the simulator, or race the clock working out ratios (best ${a.sprintBest}).</p>
        <div class="ac-two"><button type="button" class="chunky small alt" id="acChartBtn">Charts</button><button type="button" class="chunky small purple" id="acSprintBtn">Sprint</button></div>
      </div>
      <div class="card ac-side-card">
        <div class="ac-row"><b>Achievements</b><span class="muted small">${earned}/${BADGES.length}</span></div>
        <div class="ac-badges">${BADGES.map((b) => `<div class="ac-badgecell${a.badges[b.id] ? ' on' : ''}" title="${esc(b.name)}: ${esc(b.desc)}">${badgeIcon(b, !!a.badges[b.id])}<span>${esc(b.name)}</span></div>`).join('')}</div>
      </div>
      <div class="card ac-side-card ${a.final.passed ? 'cert' : ''}">
        ${a.final.passed
          ? `<span class="ac-eyebrow">Certificate</span><div class="ac-cert"><b>Bullpen Certified Analyst</b><span class="muted small">Passed ${esc(a.final.date)} · best ${Math.round(a.final.best * 100)}%</span></div>`
          : `<div class="ac-row"><b>Final exam</b><span class="muted small">${finalOpen() ? 'Unlocked' : `${unitsPassed}/${UNITS.length} units`}</span></div><p class="muted small">Pass every unit test to unlock the ${FINAL_LEN}-question certification exam.</p>`}
      </div>
      <label class="check ac-soundtoggle"><input type="checkbox" id="acSound"${a.sound ? ' checked' : ''}> Sound effects</label>`;
  }

  function showGuide(u) {
    const un = UNITS[u];
    ses = { kind: 'guide', phase: 'guide', title: `Unit ${u + 1} guidebook` };
    openOverlay();
    $('acBar').style.width = '0%';
    $('acTimer').hidden = true; $('acKind').textContent = ses.title; $('acCombo').hidden = true;
    let body = un.lessons.map((L, l) => `<section class="ac-guide"><h3>${l + 1}. ${esc(L.t)}</h3><div class="ac-tip">${L.tip}</div>${L.m ? `<dl class="ac-terms">${L.m.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}</section>`).join('');
    if (un.guideFromLearn && window.Learn) {
      body += `<h3 class="ac-guide-more">Chart school: the full notes</h3>` + window.Learn.LESSONS.map((L, i) => `<section class="ac-guide"><h3>${esc(L.title)}</h3><figure class="ac-fig"><canvas id="acGuideFig${i}" height="200"></canvas></figure><div class="ac-tip">${L.body}</div></section>`).join('');
    }
    $('acMain').innerHTML = `<div class="ac-card ac-intro"><span class="ac-eyebrow">Guidebook · revision notes</span><h2>${esc(un.title)}</h2><p class="muted">${esc(un.blurb)}</p>${body}</div>`;
    if (un.guideFromLearn && window.Learn) window.Learn.LESSONS.forEach((L, i) => window.Learn.drawFigure($(`acGuideFig${i}`), L.figure));
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<span></span><button type="button" class="chunky" id="acDone">Done</button>`;
  }
  function openGuideById(id) { const u = UNITS.findIndex((x) => x.id === id); if (u >= 0) showGuide(u); }

  /* ---------- events ---------- */
  function bind() {
    $('tab-academy').addEventListener('click', (e) => {
      const ln = e.target.closest('[data-lesson]');
      if (ln) {
        const [u, l] = ln.dataset.lesson.split(':').map(Number);
        if (!lessonOpen(u, l)) { toast('Finish the lessons before this one first.'); return; }
        startLesson(u, l); return;
      }
      const t = e.target.closest('[data-test]');
      if (t) { const u = +t.dataset.test; if (!testOpen(u)) { toast('Complete all the lessons in this unit to unlock its test.'); return; } startTest(u, false); return; }
      const to = e.target.closest('[data-testout]');
      if (to) { startTest(+to.dataset.testout, true); return; }
      const g = e.target.closest('[data-guide]');
      if (g) { showGuide(+g.dataset.guide); return; }
      if (e.target.closest('[data-final]')) { if (finalOpen()) startFinal(); return; }
      if (e.target.closest('#acReviseBtn')) { startReview(); return; }
      if (e.target.closest('#acSprintBtn')) { startSprint(); return; }
      if (e.target.closest('#acChartBtn')) { startCharts(); return; }
    });
    $('tab-academy').addEventListener('change', (e) => {
      if (e.target.id === 'acGoal') { A().goal = +e.target.value; save(); renderSide(); }
      if (e.target.id === 'acSound') { A().sound = e.target.checked; save(); if (A().sound) sfx('ok'); }
    });

    $('acad').addEventListener('input', (e) => { if (e.target.id === 'acCalc') calcUpdate(); });
    $('acad').addEventListener('click', (e) => {
      if (!ses) return;
      const ml = e.target.closest('[data-ml]'), mr = e.target.closest('[data-mr]');
      if (ml) return pickMatch('l', +ml.dataset.ml);
      if (mr) return pickMatch('r', +mr.dataset.mr);
      const opt = e.target.closest('[data-opt]');
      if (opt && !ses.checked && ses.phase === 'q') {
        ses.sel = +opt.dataset.opt;
        document.querySelectorAll('.ac-opt').forEach((b) => b.classList.toggle('sel', b === opt));
        $('acCheck').disabled = false;
        return;
      }
      const ak = e.target.closest('[data-ak]');
      if (ak && $('acInput') && !$('acInput').disabled) {
        const c = $('acInput'), k = ak.dataset.ak, a = c.selectionStart ?? c.value.length, b = c.selectionEnd ?? c.value.length;
        c.value = c.value.slice(0, a) + k + c.value.slice(b);
        c.focus(); c.setSelectionRange(a + k.length, a + k.length);
        c.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const ck = e.target.closest('[data-ck]');
      if (ck && $('acCalc')) {
        const c = $('acCalc'), k = ck.dataset.ck, a = c.selectionStart ?? c.value.length, b = c.selectionEnd ?? c.value.length;
        c.value = c.value.slice(0, a) + k + c.value.slice(b);
        c.focus(); c.setSelectionRange(a + k.length, a + k.length);
        calcUpdate();
        return;
      }
      const id = e.target.closest('button') && e.target.closest('button').id;
      if (id === 'acCalcBtn') {
        const open = $('acCalcBox').hidden;
        $('acCalcBox').hidden = !open;
        e.target.closest('button').setAttribute('aria-expanded', String(open));
        e.target.closest('button').textContent = open ? 'Hide calculator' : 'Open calculator';
        if (open) $('acCalc').focus();
        return;
      }
      if (id === 'acCalcUse') { calcUse(); return; }
      if (id === 'acGo') beginQuestions();
      else if (id === 'acCheck') submit();
      else if (id === 'acNext') advance();
      else if (id === 'acSkip') skip();
      else if (id === 'acDone') closeOverlay();
      else if (id === 'acQuit' || id === 'acQuitYes') closeOverlay();
      else if (id === 'acKeep') render();
      else if (id === 'acClose') askQuit();
    });
    document.addEventListener('keydown', (e) => {
      if ($('acad').hidden || !ses) return;
      if (e.key === 'Escape') { e.preventDefault(); askQuit(); return; }
      if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'acCalc') { e.preventDefault(); calcUse(); return; }
      if (e.key === 'Enter') {
        const btn = $('acNext') || $('acGo') || $('acDone') || ($('acCheck') && !$('acCheck').disabled ? $('acCheck') : null);
        if (btn) { e.preventDefault(); btn.click(); }
        return;
      }
      if (ses.phase === 'q' && !ses.checked && /^[1-4]$/.test(e.key) && document.activeElement.tagName !== 'INPUT') {
        const b = document.querySelector(`.ac-opt[data-opt="${+e.key - 1}"]`);
        if (b) b.click();
      }
    });
    window.addEventListener('resize', () => { if (ses && ses.phase === 'q' && currentItem() && isChart(currentItem().q)) drawQuestionChart(currentItem().q); });
  }

  function skip() {
    const it = currentItem();
    if (ses.kind === 'sprint') { ses.attempts++; ses.i++; nextSprintItem(); return renderQuestion(true); }
    if (ses.exam) { it.given = '(skipped)'; ses.results.push({ it, ok: false }); return advance(); }
    // In lessons a skip counts as a miss, like Duolingo.
    ses.sel = -1;
    if ($('acInput')) $('acInput').value = '';
    ses.checked = true; ses.lastOk = false; it.tries++; ses.combo = 0;
    if (it.q.match) it.mistakes = Math.max(it.mistakes, 1);
    ses.misses++;
    if (it.tries === 1) ses.items.push(Object.assign({}, it, it.q.match ? { matched: [], mistakes: 0 } : {}, { tries: 1, again: true, nudged: false }));
    markReview(it.key, false);
    ses.results.push({ it, ok: false });
    sfx('bad');
    renderFeedback();
  }

  function askQuit() {
    if (!ses || ses.phase === 'end' || ses.phase === 'intro' || ses.phase === 'guide') return closeOverlay();
    $('acFoot').className = 'ac-foot bad';
    $('acFoot').innerHTML = `<div class="ac-fb">${mascot('sad')}<div><b>Wait, don’t go!</b><p>${ses.exam ? 'This attempt won’t count.' : 'You’ll lose your progress in this lesson.'}</p></div></div><div class="ac-quit"><button type="button" class="btn" id="acKeep">Keep learning</button><button type="button" class="chunky red" id="acQuitYes">Quit</button></div>`;
  }

  bind();
  window.Academy = { _session: () => ses, render: renderPage, A, startLesson, startTest, startReview, startSprint, startFinal, startCharts, openGuideById, calcEval, checkNum, parseAnswer, getQ, rankOf, BADGES };
})();
