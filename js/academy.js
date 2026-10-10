/*
 * Quant Academy: a Duolingo-style course for becoming a quant.
 * A path of units and lessons, XP, streaks, hearts, ranks, spaced-repetition revision,
 * unit tests, a timed final exam and a mental-maths sprint.
 * Progress lives in the game state (Engine.S.academy), so it saves and syncs with the game.
 */
(function () {
  'use strict';

  const E = window.Engine;
  const { UNITS, GEN, RANKS, SPRINT_GENS } = window.AcademyContent;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MAX_HEARTS = 5;
  const HEART_MS = 30 * 60 * 1000;
  const REVIEW_DAYS = [1, 3, 7, 16, 35];
  const LESSON_LEN = 7, TEST_LEN = 10, FINAL_LEN = 25, FINAL_SECS = 30 * 60, SPRINT_SECS = 120, PASS = 0.8;

  /* ---------- state ---------- */
  function A() {
    const S = E.S;
    if (!S.academy) S.academy = {};
    const a = S.academy;
    const defaults = { xp: 0, hearts: MAX_HEARTS, heartAt: Date.now(), streak: 0, lastDay: '', today: { d: '', xp: 0 }, goal: 30, lessons: {}, tests: {}, review: {}, sprintBest: 0, final: { passed: false, best: 0, date: '' } };
    for (const k in defaults) if (a[k] === undefined) a[k] = defaults[k];
    regenHearts(a);
    return a;
  }
  function save() { if (window.App && window.App.save) window.App.save(); }
  // Finishing a lesson or exam is worth writing to storage immediately.
  function saveNow() { if (window.App && window.App.saveNow) window.App.saveNow(); else save(); }

  function dayStr(d) { const x = d || new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  function addDays(ds, n) { const [y, m, d] = ds.split('-').map(Number); return dayStr(new Date(y, m - 1, d + n)); }

  function regenHearts(a) {
    if (a.hearts >= MAX_HEARTS) { a.heartAt = Date.now(); return; }
    const gained = Math.floor((Date.now() - a.heartAt) / HEART_MS);
    if (gained > 0) { a.hearts = Math.min(MAX_HEARTS, a.hearts + gained); a.heartAt += gained * HEART_MS; if (a.hearts >= MAX_HEARTS) a.heartAt = Date.now(); }
  }
  function nextHeartMins(a) { return Math.max(1, Math.ceil((a.heartAt + HEART_MS - Date.now()) / 60000)); }

  function addXP(n) {
    const a = A(), today = dayStr();
    if (a.lastDay !== today) {
      a.streak = a.lastDay === addDays(today, -1) ? a.streak + 1 : 1;
      a.lastDay = today;
    }
    if (a.today.d !== today) a.today = { d: today, xp: 0 };
    a.xp += n; a.today.xp += n;
  }
  function liveStreak(a) { return a.lastDay === dayStr() || a.lastDay === addDays(dayStr(), -1) ? a.streak : 0; }

  function rankOf(xp) {
    let i = 0;
    while (i + 1 < RANKS.length && xp >= RANKS[i + 1][0]) i++;
    return { i, name: RANKS[i][1], from: RANKS[i][0], to: RANKS[i + 1] ? RANKS[i + 1][0] : null, next: RANKS[i + 1] ? RANKS[i + 1][1] : null };
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
      for (let l = 0; l < UNITS[u].lessons.length; l++) if (!lessonDone(u, l)) return { u, l };
      if (!testPassed(u)) return { u, l: 'test' };
    }
    return null;
  }

  /* ---------- questions ---------- */
  function rng(seed) { let s = (seed % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function getQ(key) {
    const p = key.split(':');
    if (p[0] === 'c') { const u = UNITS.findIndex((x) => x.id === p[1]); return u < 0 ? null : (UNITS[u].lessons[+p[2]] || {}).q[+p[3]] || null; }
    if (p[0] === 'g' && GEN[p[1]]) return GEN[p[1]](rng(+p[2]));
    return null;
  }
  const curatedKeys = (u, l) => UNITS[u].lessons[l].q.map((_, i) => `c:${UNITS[u].id}:${l}:${i}`);
  const genKey = (name) => `g:${name}:${1 + Math.floor(Math.random() * 2e9)}`;
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function unitGens(u) { return [...new Set(UNITS[u].lessons.flatMap((l) => l.gen || []))]; }

  // Each question in a session gets its own shuffled options.
  function item(key) {
    const q = getQ(key);
    if (!q) return null;
    const it = { key, q, tries: 0 };
    if (q.opts) {
      const order = shuffle(q.opts.map((_, i) => i));
      it.opts = order.map((i) => q.opts[i]);
      it.ans = order.indexOf(q.a);
    }
    return it;
  }

  function parseAnswer(str) {
    let s = String(str).trim().replace(/[$,\s]/g, '').replace('−', '-');
    if (!s) return null;
    let pct = false;
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1); }
    let v;
    if (/^-?\d*\.?\d+\/\d*\.?\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); v = a / b; }
    else v = Number(s);
    if (!isFinite(v)) return null;
    return { v: pct ? v / 100 : v, pct };
  }

  function checkNum(q, input) {
    const p = parseAnswer(input);
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
    if (a.hearts <= 0) { openOverlay(); ses = { kind: 'noHearts' }; return render(); }
    const L = UNITS[u].lessons[l];
    const keys = curatedKeys(u, l);
    const gens = L.gen && L.gen.length ? L.gen : [];
    while (keys.length < LESSON_LEN && gens.length) keys.push(genKey(gens[keys.length % gens.length]));
    if (keys.length < LESSON_LEN && l > 0) for (let p = 0; p < l && keys.length < LESSON_LEN; p++) keys.push(...curatedKeys(u, p).slice(0, LESSON_LEN - keys.length));
    begin({ kind: 'lesson', u, l, title: `Unit ${u + 1} · ${L.t}`, items: shuffle(keys).map(item).filter(Boolean), hearts: true, intro: { title: L.t, html: L.tip } });
  }

  function startTest(u, testOut) {
    const keys = shuffle(UNITS[u].lessons.flatMap((_, l) => curatedKeys(u, l))).slice(0, 7);
    const gens = unitGens(u);
    while (keys.length < TEST_LEN) keys.push(gens.length ? genKey(gens[keys.length % gens.length]) : shuffle(UNITS[u].lessons.flatMap((_, l) => curatedKeys(u, l)))[0]);
    begin({ kind: 'test', u, testOut, title: `Unit ${u + 1} test · ${UNITS[u].title}`, items: shuffle(keys).map(item).filter(Boolean), exam: true,
      intro: { title: `${testOut ? 'Test out of' : 'Unit test:'} ${UNITS[u].title}`, html: `<p>${TEST_LEN} questions covering the whole unit. Score <b>${PASS * 100}%</b> or more to pass${testOut ? ' and skip ahead to this unit' : ' and unlock the next unit'}.</p><p>Like a real exam, you won’t see answers until the end. No hearts are used.</p>` } });
  }

  function startFinal() {
    const keys = [];
    UNITS.forEach((un, u) => { keys.push(...shuffle(un.lessons.flatMap((_, l) => curatedKeys(u, l))).slice(0, 2)); });
    const gens = shuffle(Object.keys(GEN));
    while (keys.length < FINAL_LEN) keys.push(genKey(gens[keys.length % gens.length]));
    begin({ kind: 'final', title: 'Final certification exam', items: shuffle(keys).slice(0, FINAL_LEN).map(item).filter(Boolean), exam: true, timer: FINAL_SECS,
      intro: { title: 'Final certification exam', html: `<p>${FINAL_LEN} questions from every unit, with a <b>${FINAL_SECS / 60}-minute</b> time limit. Score <b>${PASS * 100}%</b> to earn your Bullpen Quant certificate.</p><p>Answers are shown at the end. You can retake it as many times as you like.</p>` } });
  }

  function startReview() {
    const a = A();
    let keys = shuffle(dueKeys()).slice(0, 10);
    if (keys.length < 6) {
      const pool = [];
      UNITS.forEach((un, u) => un.lessons.forEach((L, l) => { if (lessonDone(u, l)) { pool.push(...curatedKeys(u, l)); (L.gen || []).forEach((g) => pool.push(genKey(g))); } }));
      if (!pool.length) { pool.push(...curatedKeys(0, 0)); UNITS[0].lessons[0].gen.forEach((g) => pool.push(genKey(g))); }
      shuffle(pool);
      while (keys.length < 8 && pool.length) { const k = pool.pop(); if (!keys.includes(k)) keys.push(k); }
    }
    begin({ kind: 'review', title: 'Revision', items: keys.map(item).filter(Boolean),
      intro: { title: 'Revision', html: `<p>${dueKeys().length ? `You have <b>${dueKeys().length}</b> question${dueKeys().length === 1 ? '' : 's'} due for review. Questions you miss come back after 1, 3, 7, 16 and 35 days until they stick.` : 'Nothing is due right now, so here is a mixed practice set from the lessons you have done.'}</p><p>No hearts are used, and finishing revision restores a heart${a.hearts < MAX_HEARTS ? '' : ' (you are already full)'}.</p>` } });
  }

  function startSprint() {
    begin({ kind: 'sprint', title: 'Mental maths sprint', items: [], timer: SPRINT_SECS, score: 0, attempts: 0,
      intro: { title: 'Mental maths sprint', html: `<p>Answer as many arithmetic questions as you can in <b>${SPRINT_SECS / 60} minutes</b>. Trading firms use tests like this (often 80 questions in 8 minutes) to screen applicants.</p><p>Type the answer and press Enter. Wrong answers just move on. Your best so far: <b>${A().sprintBest}</b>.</p>` } });
  }

  function begin(s) {
    ses = Object.assign({ i: 0, firstTry: 0, answered: 0, results: [], phase: 'intro', started: 0, xp: 0, heartsLost: 0 }, s);
    ses.total = ses.items.length;
    openOverlay();
    render();
  }

  function nextSprintItem() {
    const g = SPRINT_GENS[Math.floor(Math.random() * SPRINT_GENS.length)];
    ses.items.push(item(genKey(g)));
  }

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
    if (it.q.opts) { if (ses.sel == null) return; ok = ses.sel === it.ans; it.given = it.opts[ses.sel]; }
    else { const v = $('acInput') ? $('acInput').value : ''; ok = checkNum(it.q, v); if (ok === null) { flashInput(); return; } it.given = v; }

    if (ses.kind === 'sprint') {
      ses.attempts++;
      if (ok) ses.score++;
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
    // Lessons and revision: instant feedback.
    ses.checked = true; ses.lastOk = ok;
    if (ok) { if (it.tries === 1) ses.firstTry++; }
    else {
      if (ses.hearts) { A().hearts = Math.max(0, A().hearts - 1); if (A().hearts < MAX_HEARTS && A().hearts === MAX_HEARTS - 1) A().heartAt = Date.now(); ses.heartsLost++; }
      if (it.tries === 1) ses.items.push(Object.assign({}, it, { tries: 1, again: true }));   // ask again at the end
    }
    if (ses.kind === 'review' || ses.kind === 'lesson') markReview(it.key, ok);
    ses.results.push({ it, ok });
    renderFeedback();
  }

  function flashInput() { const i = $('acInput'); if (i) { i.classList.remove('shake'); void i.offsetWidth; i.classList.add('shake'); i.focus(); } }

  function advance() {
    ses.checked = false; ses.sel = null;
    if (ses.hearts && A().hearts <= 0) { ses.phase = 'outOfHearts'; save(); return render(); }
    ses.i++;
    if (ses.i >= ses.items.length) return finish();
    render();
  }

  function finish() {
    if (!ses || ses.phase === 'end') return;
    clearInterval(ses.tick);
    const a = A();
    const secs = Math.round((Date.now() - ses.started) / 1000);
    ses.secs = secs;
    if (ses.kind === 'lesson') {
      const first = ses.total;
      const acc = ses.firstTry / first;
      const key = lessonKey(ses.u, ses.l);
      const replay = !!a.lessons[key];
      ses.xp = (replay ? 5 : 10) + ses.firstTry + (acc === 1 ? 5 : 0);
      a.lessons[key] = { done: (a.lessons[key] ? a.lessons[key].done : 0) + 1, best: Math.max(acc, a.lessons[key] ? a.lessons[key].best : 0) };
      ses.acc = acc;
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
    } else if (ses.kind === 'review') {
      const right = ses.results.filter((r) => r.ok).length;
      ses.xp = 5 + right;
      ses.acc = ses.firstTry / Math.max(1, ses.total);
      if (a.hearts < MAX_HEARTS) { a.hearts++; ses.heartBack = true; }
    } else if (ses.kind === 'sprint') {
      ses.newBest = ses.score > a.sprintBest;
      a.sprintBest = Math.max(a.sprintBest, ses.score);
      ses.xp = Math.min(30, Math.floor(ses.score / 2));
    }
    const rankBefore = rankOf(a.xp).name;
    if (ses.xp) addXP(ses.xp);
    ses.rankUp = rankOf(a.xp).name !== rankBefore ? rankOf(a.xp).name : null;
    ses.phase = 'end';
    saveNow();
    render();
    renderPage();
  }

  /* ---------- overlay ---------- */
  function openOverlay() { $('acad').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeOverlay() {
    if (ses) clearInterval(ses.tick);
    ses = null;
    $('acad').hidden = true;
    document.body.style.overflow = '';
    renderPage();
  }

  function heartsHTML() {
    const a = A();
    return `<span class="ac-heart" title="${a.hearts < MAX_HEARTS ? `Next heart in ${nextHeartMins(a)} min` : 'Full'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>${a.hearts}</span>`;
  }

  function render() {
    if (!ses) return;
    const done = ses.kind === 'sprint' ? 0 : ses.phase === 'end' ? 1 : ses.phase === 'intro' ? 0 : Math.min(1, ses.i / Math.max(1, ses.items.length));
    $('acBar').style.width = (done * 100).toFixed(1) + '%';
    $('acHearts').innerHTML = ses.hearts ? heartsHTML() : '';
    $('acTimer').textContent = '';
    $('acTimer').hidden = !ses.timer || ses.phase !== 'q';
    $('acKind').textContent = ses.title || '';
    if (ses.kind === 'noHearts' || ses.phase === 'outOfHearts') return renderNoHearts();
    if (ses.phase === 'intro') return renderIntro();
    if (ses.phase === 'end') return renderEnd();
    renderQuestion();
  }

  function renderIntro() {
    $('acMain').innerHTML = `<div class="ac-card ac-intro"><span class="ac-eyebrow">${ses.kind === 'lesson' ? 'New concept' : ses.kind === 'review' ? 'Revision' : ses.kind === 'sprint' ? 'Interview prep' : 'Exam'}</span><h2>${esc(ses.intro.title)}</h2><div class="ac-tip">${ses.intro.html}</div></div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<span></span><button type="button" class="chunky" id="acGo">${ses.kind === 'lesson' ? 'Start lesson' : ses.kind === 'sprint' ? 'Start sprint' : ses.kind === 'review' ? 'Start revision' : 'Start exam'}</button>`;
    $('acGo').focus();
  }

  function renderQuestion(keepFlash) {
    const it = currentItem();
    const q = it.q;
    const n = ses.kind === 'sprint' ? `Score ${ses.score}` : `Question ${Math.min(ses.i + 1, ses.items.length)} of ${ses.items.length}`;
    const flash = keepFlash && $('acFlash') ? $('acFlash').outerHTML : '<p class="ac-flash" id="acFlash"></p>';
    $('acMain').innerHTML = `<div class="ac-card">
      <span class="ac-eyebrow">${n}${it.again ? ' · Try again' : ''}</span>
      <h2 class="ac-q">${esc(q.q)}</h2>
      ${q.code ? `<pre class="ac-code"><code>${esc(q.code)}</code></pre>` : ''}
      ${q.opts ? `<div class="ac-opts">${it.opts.map((o, i) => `<button type="button" class="ac-opt${ses.sel === i ? ' sel' : ''}" data-opt="${i}"><kbd>${i + 1}</kbd><span>${esc(o)}</span></button>`).join('')}</div>`
        : `<div class="ac-num"><input id="acInput" type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" aria-label="Your answer"><span class="ac-hint">${q.pct ? 'Enter a % or a decimal, e.g. 12.5% or 0.125' : 'Fractions like 1/6 are fine'}</span></div>`}
      ${ses.kind === 'sprint' ? flash : ''}
    </div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<button type="button" class="btn btn-ghost" id="acSkip">${ses.exam || ses.kind === 'sprint' ? 'Skip' : 'Skip'}</button><button type="button" class="chunky" id="acCheck"${q.opts && ses.sel == null ? ' disabled' : ''}>${ses.exam ? (ses.i + 1 >= ses.items.length ? 'Finish' : 'Next') : ses.kind === 'sprint' ? 'Enter' : 'Check'}</button>`;
    if (ses.timer) { $('acTimer').hidden = false; }
    const inp = $('acInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('input', () => { $('acCheck').disabled = !inp.value.trim(); });
      $('acCheck').disabled = true;
    }
  }

  function renderFeedback() {
    const it = currentItem();
    document.querySelectorAll('.ac-opt').forEach((b) => {
      const i = +b.dataset.opt;
      b.disabled = true;
      if (i === it.ans) b.classList.add('right');
      else if (i === ses.sel) b.classList.add('wrong');
    });
    if ($('acInput')) { $('acInput').disabled = true; $('acInput').classList.add(ses.lastOk ? 'right' : 'wrong'); }
    const ok = ses.lastOk;
    $('acFoot').className = 'ac-foot ' + (ok ? 'ok' : 'bad');
    $('acFoot').innerHTML = `<div class="ac-fb"><b>${ok ? pickPraise() : 'Correct answer: ' + esc(showAnswer(it))}</b><p>${esc(it.q.why || '')}</p></div><button type="button" class="chunky ${ok ? '' : 'red'}" id="acNext">Continue</button>`;
    $('acHearts').innerHTML = ses.hearts ? heartsHTML() : '';
    $('acNext').focus();
  }
  const PRAISE = ['Correct!', 'Nice work!', 'Spot on!', 'Exactly right!', 'Great!'];
  function pickPraise() { return PRAISE[Math.floor(Math.random() * PRAISE.length)]; }

  function renderNoHearts() {
    const a = A();
    $('acMain').innerHTML = `<div class="ac-card ac-intro center"><div class="ac-big">${heartsHTML()}</div><h2>You’re out of hearts</h2><div class="ac-tip"><p>Every wrong answer in a lesson costs a heart. Hearts refill one every 30 minutes (next in ${nextHeartMins(a)} min).</p><p>Or earn one back now: revision doesn’t use hearts, and finishing a revision set restores one.</p></div></div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<button type="button" class="btn btn-ghost" id="acQuit">Back to the path</button><button type="button" class="chunky" id="acRevise">Revise to earn a heart</button>`;
  }

  function fmtSecs(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  function renderEnd() {
    const a = A();
    let head, sub, tiles, extra = '';
    if (ses.kind === 'sprint') {
      head = ses.newBest ? 'New personal best!' : 'Time’s up!';
      sub = `${ses.score} correct out of ${ses.attempts} attempted in ${SPRINT_SECS / 60} minutes.`;
      tiles = [['Score', ses.score], ['Best', a.sprintBest], ['XP', '+' + ses.xp]];
    } else if (ses.exam) {
      const pct = Math.round(ses.acc * 100);
      head = ses.passed ? (ses.kind === 'final' ? 'You are a certified Bullpen Quant!' : 'Unit test passed!') : 'Not quite this time';
      sub = ses.passed ? (ses.kind === 'final' ? 'You passed the final exam. Your certificate is on the Academy page.' : ses.testOut ? 'You tested out and skipped ahead.' : 'The next unit is unlocked.') : `You need ${PASS * 100}% to pass. Review the questions below, revise, and try again.`;
      tiles = [['Score', pct + '%'], ['Correct', `${ses.firstTry}/${ses.total}`], ['Time', fmtSecs(ses.secs)], ['XP', '+' + ses.xp]];
      const wrong = ses.results.filter((r) => !r.ok);
      const unanswered = ses.items.slice(ses.results.length);
      if (wrong.length || unanswered.length) {
        extra = `<div class="ac-review"><h3>Review your mistakes</h3>${wrong.concat(unanswered.map((it) => ({ it, skipped: true }))).map((r) => `<div class="ac-rev"><p class="ac-rev-q">${esc(r.it.q.q)}</p>${r.it.q.code ? `<pre class="ac-code small"><code>${esc(r.it.q.code)}</code></pre>` : ''}<p><span class="bad">${r.skipped ? 'Not answered' : 'Your answer: ' + esc(r.it.given || '–')}</span> · <span class="ok">Correct: ${esc(showAnswer(r.it))}</span></p><p class="muted">${esc(r.it.q.why || '')}</p></div>`).join('')}<p class="muted small">These questions have been added to your revision queue.</p></div>`;
      }
    } else {
      const pct = Math.round(ses.acc * 100);
      head = ses.kind === 'review' ? 'Revision complete!' : pct === 100 ? 'Perfect lesson!' : 'Lesson complete!';
      sub = ses.kind === 'review' ? (ses.heartBack ? 'You earned a heart back.' : 'Keep revising to make it stick.') : ses.heartsLost ? `You lost ${ses.heartsLost} heart${ses.heartsLost === 1 ? '' : 's'}. Missed questions go into your revision queue.` : 'No mistakes. Great work.';
      tiles = [['XP', '+' + ses.xp], ['Accuracy', pct + '%'], ['Time', fmtSecs(ses.secs)]];
    }
    const rk = rankOf(a.xp);
    $('acMain').innerHTML = `<div class="ac-card ac-intro center">
      <h2 class="ac-done ${ses.exam && !ses.passed ? 'fail' : ''}">${head}</h2><p class="muted">${sub}</p>
      <div class="ac-tiles">${tiles.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
      ${ses.rankUp ? `<p class="ac-rankup">Promoted to <b>${esc(ses.rankUp)}</b>!</p>` : ''}
      <p class="muted small">Streak: ${liveStreak(a)} day${liveStreak(a) === 1 ? '' : 's'} · Today ${a.today.xp}/${a.goal} XP · ${esc(rk.name)}</p>
      ${extra}
    </div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<span></span><button type="button" class="chunky" id="acDone">Continue</button>`;
    $('acDone').focus();
  }

  /* ---------- page ---------- */
  function renderPage() {
    if (!$('tab-academy') || $('tab-academy').hidden) return;
    renderPath();
    renderSide();
  }

  const NODE_X = [0, 46, 70, 46, 0, -46, -70, -46];
  const UNIT_HUES = [145, 205, 265, 30, 175, 330, 220, 95, 285, 190, 250, 45];

  function statsHTML(a, cls) {
    return `<div class="ac-stats ${cls || ''}">
        <div class="ac-stat streak${liveStreak(a) ? ' on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5.3 1.5 1 2.5 2 3 0-3 .5-6 1-9z"/></svg><b>${liveStreak(a)}</b><span>day streak</span></div>
        <div class="ac-stat xp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg><b>${a.xp}</b><span>total XP</span></div>
        <div class="ac-stat hearts"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg><b>${a.hearts}</b><span>${a.hearts < MAX_HEARTS ? `+1 in ${nextHeartMins(a)}m` : 'hearts'}</span></div>
      </div>`;
  }
  function renderPath() {
    const cur = currentNode();
    let html = '', k = 0;
    UNITS.forEach((un, u) => {
      const open = unitOpen(u);
      const passed = testPassed(u);
      const prevOpen = u > 0 && unitOpen(u - 1) && !open;
      html += `<section class="ac-unit${open ? '' : ' locked'}${passed ? ' passed' : ''}" style="--hue:${UNIT_HUES[u % UNIT_HUES.length]}">
        <header class="ac-unit-head"><div><span class="ac-eyebrow">Unit ${u + 1}${passed ? ' · Passed' : ''}</span><h3>${esc(un.title)}</h3><p>${esc(un.blurb)}</p></div>
          <div class="ac-unit-btns"><button type="button" class="btn" data-guide="${u}">Guidebook</button>${prevOpen ? `<button type="button" class="btn" data-testout="${u}">Test out</button>` : ''}</div></header>
        <div class="ac-nodes">`;
      un.lessons.forEach((L, l) => {
        const done = lessonDone(u, l), op = lessonOpen(u, l);
        const isCur = cur && cur.u === u && cur.l === l;
        const best = done ? A().lessons[lessonKey(u, l)].best : 0;
        html += `<div class="ac-node-wrap" style="transform:translateX(${NODE_X[k++ % NODE_X.length]}px)">
          ${isCur ? '<span class="ac-bubble">Start</span>' : ''}
          <button type="button" class="ac-node ${done ? 'done' : op ? 'open' : 'locked'}${isCur ? ' cur' : ''}${done && best === 1 ? ' gold' : ''}" data-lesson="${u}:${l}" aria-label="Lesson: ${esc(L.t)}${done ? ', done' : op ? '' : ', locked'}">
            ${done ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : op ? `<span>${l + 1}</span>` : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>'}
          </button><span class="ac-node-label">${esc(L.t)}</span></div>`;
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
    $('acPath').innerHTML = statsHTML(A(), 'ac-stats-m') + html;
  }

  function renderSide() {
    const a = A();
    const rk = rankOf(a.xp);
    const due = dueKeys().length;
    const today = a.today.d === dayStr() ? a.today.xp : 0;
    const unitsPassed = UNITS.filter((_, u) => testPassed(u)).length;
    const lessonsDone = UNITS.reduce((n, un, u) => n + un.lessons.filter((_, l) => lessonDone(u, l)).length, 0);
    const totalLessons = UNITS.reduce((n, un) => n + un.lessons.length, 0);
    const name = (window.App && window.App.playerName && window.App.playerName()) || '';
    $('acSide').innerHTML = `
      ${statsHTML(a)}
      <div class="card ac-side-card">
        <div class="ac-row"><b>Daily goal</b><select id="acGoal" aria-label="Daily XP goal">${[10, 20, 30, 50, 100].map((g) => `<option value="${g}"${a.goal === g ? ' selected' : ''}>${g} XP</option>`).join('')}</select></div>
        <div class="ac-meter"><i style="width:${Math.min(100, (today / a.goal) * 100)}%"></i></div>
        <p class="muted small">${today >= a.goal ? 'Goal reached today. Your streak is safe!' : `${today} / ${a.goal} XP today. One lesson is about 15 XP.`}</p>
      </div>
      <div class="card ac-side-card">
        <span class="ac-eyebrow">Your rank</span>
        <div class="ac-rank"><b>${esc(rk.name)}</b><span class="muted small">${rk.next ? `${rk.to - a.xp} XP to ${esc(rk.next)}` : 'Top rank reached'}</span></div>
        <div class="ac-meter gold"><i style="width:${rk.to ? Math.min(100, ((a.xp - rk.from) / (rk.to - rk.from)) * 100) : 100}%"></i></div>
        <p class="muted small">${lessonsDone}/${totalLessons} lessons · ${unitsPassed}/${UNITS.length} unit tests passed</p>
      </div>
      <div class="card ac-side-card">
        <div class="ac-row"><b>Revision</b><span class="ac-badge${due ? ' on' : ''}">${due} due</span></div>
        <p class="muted small">Mistakes come back on a schedule until they stick. Revising doesn’t use hearts and restores one.</p>
        <button type="button" class="chunky small block" id="acReviseBtn">${due ? `Revise ${due} question${due === 1 ? '' : 's'}` : 'Practise'}</button>
      </div>
      <div class="card ac-side-card">
        <div class="ac-row"><b>Interview sprint</b><span class="muted small">Best ${a.sprintBest}</span></div>
        <p class="muted small">Two minutes of rapid mental maths, like the arithmetic tests trading firms set.</p>
        <button type="button" class="chunky small block alt" id="acSprintBtn">Start sprint</button>
      </div>
      <div class="card ac-side-card ${a.final.passed ? 'cert' : ''}">
        ${a.final.passed
          ? `<span class="ac-eyebrow">Certificate</span><div class="ac-cert"><b>Bullpen Certified Quant</b>${name ? `<span>${esc(name)}</span>` : ''}<span class="muted small">Passed ${esc(a.final.date)} · best ${Math.round(a.final.best * 100)}%</span></div>`
          : `<div class="ac-row"><b>Final exam</b><span class="muted small">${finalOpen() ? 'Unlocked' : `${unitsPassed}/${UNITS.length} units`}</span></div><p class="muted small">Pass every unit test to unlock the ${FINAL_LEN}-question certification exam.</p>`}
      </div>`;
  }

  function showGuide(u) {
    const un = UNITS[u];
    ses = { kind: 'guide', phase: 'guide', title: `Unit ${u + 1} guidebook` };
    openOverlay();
    $('acBar').style.width = '0%';
    $('acHearts').innerHTML = ''; $('acTimer').hidden = true; $('acKind').textContent = ses.title;
    $('acMain').innerHTML = `<div class="ac-card ac-intro"><span class="ac-eyebrow">Guidebook · revision notes</span><h2>${esc(un.title)}</h2><p class="muted">${esc(un.blurb)}</p>
      ${un.lessons.map((L, l) => `<section class="ac-guide"><h3>${l + 1}. ${esc(L.t)}</h3><div class="ac-tip">${L.tip}</div></section>`).join('')}</div>`;
    $('acFoot').className = 'ac-foot';
    $('acFoot').innerHTML = `<span></span><button type="button" class="chunky" id="acDone">Done</button>`;
  }

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
      if (t) { const u = +t.dataset.test; if (!testOpen(u)) { toast('Complete all three lessons to unlock the unit test.'); return; } startTest(u, false); return; }
      const to = e.target.closest('[data-testout]');
      if (to) { startTest(+to.dataset.testout, true); return; }
      const g = e.target.closest('[data-guide]');
      if (g) { showGuide(+g.dataset.guide); return; }
      if (e.target.closest('[data-final]')) { if (finalOpen()) startFinal(); return; }
      if (e.target.closest('#acReviseBtn')) { startReview(); return; }
      if (e.target.closest('#acSprintBtn')) { startSprint(); return; }
    });
    $('tab-academy').addEventListener('change', (e) => {
      if (e.target.id === 'acGoal') { A().goal = +e.target.value; save(); renderSide(); }
    });

    $('acad').addEventListener('click', (e) => {
      if (!ses) return;
      const opt = e.target.closest('[data-opt]');
      if (opt && !ses.checked && ses.phase === 'q') {
        ses.sel = +opt.dataset.opt;
        document.querySelectorAll('.ac-opt').forEach((b) => b.classList.toggle('sel', b === opt));
        $('acCheck').disabled = false;
        return;
      }
      const id = e.target.closest('button') && e.target.closest('button').id;
      if (id === 'acGo') beginQuestions();
      else if (id === 'acCheck') submit();
      else if (id === 'acNext') advance();
      else if (id === 'acSkip') skip();
      else if (id === 'acDone') closeOverlay();
      else if (id === 'acQuit' || id === 'acQuitYes') closeOverlay();
      else if (id === 'acKeep') render();
      else if (id === 'acRevise') startReview();
      else if (id === 'acClose') askQuit();
    });
    document.addEventListener('keydown', (e) => {
      if ($('acad').hidden || !ses) return;
      if (e.key === 'Escape') { e.preventDefault(); askQuit(); return; }
      if (e.key === 'Enter') {
        const btn = $('acNext') || $('acGo') || $('acDone') || ($('acCheck') && !$('acCheck').disabled ? $('acCheck') : null);
        if (btn) { e.preventDefault(); btn.click(); }
        return;
      }
      if (ses.phase === 'q' && !ses.checked && /^[1-4]$/.test(e.key) && document.activeElement.id !== 'acInput') {
        const b = document.querySelector(`.ac-opt[data-opt="${+e.key - 1}"]`);
        if (b) b.click();
      }
    });
  }

  function skip() {
    const it = currentItem();
    if (ses.kind === 'sprint') { ses.attempts++; ses.i++; nextSprintItem(); return renderQuestion(true); }
    if (ses.exam) { it.given = '(skipped)'; ses.results.push({ it, ok: false }); return advance(); }
    // In lessons a skip counts as a miss.
    ses.sel = -1;
    if ($('acInput')) $('acInput').value = '';
    ses.checked = true; ses.lastOk = false; it.tries++;
    if (ses.hearts) { A().hearts = Math.max(0, A().hearts - 1); ses.heartsLost++; }
    if (it.tries === 1) ses.items.push(Object.assign({}, it, { tries: 1, again: true }));
    markReview(it.key, false);
    ses.results.push({ it, ok: false });
    renderFeedback();
  }

  function askQuit() {
    if (!ses || ses.phase === 'end' || ses.phase === 'intro' || ses.phase === 'guide' || ses.kind === 'noHearts' || ses.phase === 'outOfHearts') return closeOverlay();
    $('acFoot').className = 'ac-foot bad';
    $('acFoot').innerHTML = `<div class="ac-fb"><b>Quit now?</b><p>${ses.exam ? 'This attempt won’t count.' : 'You’ll lose your progress in this lesson.'}</p></div><div class="ac-quit"><button type="button" class="btn" id="acKeep">Keep going</button><button type="button" class="chunky red" id="acQuitYes">Quit</button></div>`;
  }

  function toast(msg) { if (window.App && window.App.toast) window.App.toast(msg); }

  bind();
  window.Academy = { _session: () => ses, render: renderPage, A, startLesson, startTest, startReview, startSprint, startFinal, checkNum, parseAnswer, getQ, rankOf };
})();
