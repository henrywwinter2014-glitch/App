/*
 * Accounts and cloud saves.
 *
 * Two ways to sign in, picked automatically:
 *  - Claude account: when the app is opened as a claude.ai artifact, the viewer is already
 *    signed in, and the game is saved in the artifact's private per-person storage.
 *  - Firebase: on your own hosted copy, fill in js/firebase-config.js to enable
 *    Google, Apple, Microsoft and email sign-in, with saves in Cloud Firestore.
 * Without either, the game is saved in this browser only.
 *
 * A save is the whole game, gzip-compressed and split into chunks (document size limits),
 * written chunks first and a small "save" document last, so a half-written save is never loaded.
 */
(function () {
  'use strict';

  const SYNC_KEY = 'bullpen-sync';
  const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const CHUNK = { claude: 200000, firebase: 800000 };
  const AUTOSAVE_MS = 45000;

  let H = null;   // hooks from app.js
  const st = {
    provider: null,        // 'claude' | 'firebase' | null
    available: false,      // can this copy sign in at all?
    user: null,            // { id, name, avatar, email, via }
    backend: null,
    status: 'local',       // local | checking | saving | saved | error
    lastSaved: null,
    dirty: false,
    busy: false,
    conflict: null,        // cloud save meta when it differs from this device
    error: '',
    emailMode: 'signin',
  };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function readSync() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } }
  function writeSync(o) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(o)); } catch (e) { /* storage blocked */ } }

  /* ---------- encoding ---------- */
  async function encode(str) {
    if (typeof CompressionStream === 'undefined') return { enc: 'json', data: str };
    const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { enc: 'gz64', data: btoa(bin) };
  }
  async function decode(enc, data) {
    if (enc === 'json') return data;
    const bin = atob(data);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  /* ---------- storage backends: get(name) -> object|null, set(name, object) ---------- */
  function claudeBackend(db, uid) {
    const col = db.collection('data/users/' + uid);
    return {
      async get(n) { const s = await col.doc(n).get(); return s.exists ? s.data() : null; },
      async set(n, o) { await col.doc(n).set(o); },
    };
  }
  function firebaseBackend(fs, uid) {
    const col = fs.collection('users').doc(uid).collection('bullpen');
    return {
      async get(n) { const s = await col.doc(n).get(); return s.exists ? s.data() : null; },
      async set(n, o) { await col.doc(n).set(o); },
    };
  }

  /* ---------- save / load ---------- */
  async function pushSave() {
    if (!st.backend || st.busy || st.conflict) return;
    st.busy = true; st.status = 'saving'; render();
    try {
      const { enc, data } = await encode(H.serialize());
      const size = CHUNK[st.provider];
      const n = Math.max(1, Math.ceil(data.length / size));
      const v = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      st.dirty = false;
      for (let i = 0; i < n; i++) await st.backend.set('c' + i, { v, s: data.slice(i * size, (i + 1) * size) });
      await st.backend.set('save', Object.assign({ v, n, enc, savedAt: Date.now() }, H.summary()));
      writeSync({ v, dirty: st.dirty });
      st.lastSaved = Date.now(); st.status = 'saved'; st.error = '';
    } catch (e) {
      st.dirty = true; st.status = 'error';
      st.error = e && e.code === 'quota_exceeded' ? 'Your account storage is full, so the game could not be saved online.'
        : e && (e.code === 'invalid_argument' || e.code === 'permission-denied') ? 'Your access to this app does not allow saving online. Ask the owner for Contributor access.'
        : 'Could not reach your account. The game is still saved on this device and will sync again shortly.';
    }
    st.busy = false; render();
  }

  async function pullSave(meta) {
    const parts = [];
    for (let i = 0; i < meta.n; i++) {
      const c = await st.backend.get('c' + i);
      if (!c || c.v !== meta.v) throw new Error('incomplete save');
      parts.push(c.s);
    }
    return JSON.parse(await decode(meta.enc, parts.join('')));
  }

  async function loadCloud(meta) {
    st.status = 'checking'; render();
    try {
      const obj = await pullSave(meta);
      H.apply(obj);
      writeSync({ v: meta.v, dirty: false });
      st.dirty = false; st.conflict = null; st.status = 'saved'; st.lastSaved = meta.savedAt;
      H.toast(`Loaded your saved game: day ${meta.day + 1}, net worth ${H.money(meta.nw)}.`);
    } catch (e) {
      st.status = 'error'; st.error = 'Could not load the game from your account. Try again in a moment.';
    }
    render();
  }

  // Decide what to do when an account connects: push, pull, or ask.
  async function connected() {
    st.status = 'checking'; st.error = ''; render();
    let meta = null;
    try { meta = await st.backend.get('save'); }
    catch (e) { st.status = 'error'; st.error = 'Could not reach your account. Playing offline for now.'; render(); return; }
    const sync = readSync();
    if (!meta) { await pushSave(); return; }
    if (meta.v === sync.v) {
      st.lastSaved = meta.savedAt;
      if (sync.dirty || st.dirty) await pushSave(); else { st.status = 'saved'; render(); }
      return;
    }
    if (H.isFresh() || (sync.v && !sync.dirty && !st.dirty)) { await loadCloud(meta); return; }
    st.conflict = meta; st.status = 'local';
    openModal();
  }

  function markDirty() {
    st.dirty = true;
    const s = readSync();
    if (!s.dirty) writeSync(Object.assign(s, { dirty: true }));
  }

  /* ---------- Claude account ---------- */
  async function initClaude() {
    if (!window.claude || typeof window.claude.use !== 'function') return false;
    const [user, db] = await Promise.all([window.claude.use('user'), window.claude.use('db')]);
    if (!user || !db) return false;
    const me = await user.me();
    if (!me.id) return false;
    st.provider = 'claude'; st.available = true;
    st.user = { id: me.id, name: me.name || 'Your Claude account', avatar: me.avatarUrl, email: me.email, via: 'Claude account' };
    st.backend = claudeBackend(db, me.id);
    connected();
    return true;
  }

  /* ---------- Firebase (Google, Apple, Microsoft, email) ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  const PROVIDER_NAMES = { 'google.com': 'Google', 'apple.com': 'Apple', 'microsoft.com': 'Microsoft', password: 'email' };
  function authError(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'That email and password do not match an account. Check them, or create an account.';
    if (code === 'auth/email-already-in-use') return 'An account with that email already exists. Sign in instead.';
    if (code === 'auth/weak-password') return 'Use a password of at least 6 characters.';
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/operation-not-allowed') return 'This sign-in method is not turned on for this app yet.';
    if (code === 'auth/unauthorized-domain') return 'This website is not on the app’s list of allowed sign-in domains.';
    if (code === 'auth/account-exists-with-different-credential') return 'You already have an account with this email using a different sign-in method. Use that one.';
    return 'Sign-in did not work. Please try again.';
  }

  async function initFirebase() {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey) return false;
    try {
      for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js']) await loadScript(FIREBASE_SDK + f);
    } catch (e) { st.error = 'Could not load the sign-in service. Check your connection.'; render(); return false; }
    const fb = window.firebase;
    fb.initializeApp(cfg);
    st.provider = 'firebase'; st.available = true; st.fb = fb;
    fb.auth().getRedirectResult().catch((e) => { st.error = authError(e); render(); });
    fb.auth().onAuthStateChanged((u) => {
      if (u) {
        const pid = (u.providerData[0] && u.providerData[0].providerId) || 'password';
        st.user = { id: u.uid, name: u.displayName || u.email || 'Your account', avatar: u.photoURL, email: u.email, via: PROVIDER_NAMES[pid] || pid };
        st.backend = firebaseBackend(fb.firestore(), u.uid);
        closeModalIfSignedIn();
        connected();
      } else {
        st.user = null; st.backend = null; st.status = 'local'; st.conflict = null; render();
      }
    });
    render();
    return true;
  }

  function signIn(kind) {
    if (st.provider !== 'firebase') return;
    const fb = st.fb, auth = fb.auth();
    let p;
    if (kind === 'google') p = new fb.auth.GoogleAuthProvider();
    if (kind === 'apple') { p = new fb.auth.OAuthProvider('apple.com'); p.addScope('email'); p.addScope('name'); }
    if (kind === 'microsoft') p = new fb.auth.OAuthProvider('microsoft.com');
    st.error = ''; render();
    auth.signInWithPopup(p).catch((e) => {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return auth.signInWithRedirect(p);
      st.error = authError(e); render();
    });
  }

  function emailAuth(email, password, create) {
    const auth = st.fb.auth();
    st.error = ''; render();
    const call = create ? auth.createUserWithEmailAndPassword(email, password) : auth.signInWithEmailAndPassword(email, password);
    call.catch((e) => { st.error = authError(e); render(); });
  }

  async function signOut() {
    if (st.provider !== 'firebase') return;
    if (st.dirty) await pushSave();
    await st.fb.auth().signOut();
    writeSync({});
    H.toast('Signed out. Your game stays on this device.');
  }

  /* ---------- UI ---------- */
  function ago(ts) {
    if (!ts) return '';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return `${s} seconds ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
    return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function avatar(u) {
    const initial = esc((u.name || '?').trim().charAt(0).toUpperCase());
    return u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${initial}</span>`;
  }
  const STATUS_TEXT = { local: 'Not synced', checking: 'Connecting…', saving: 'Saving…', saved: 'Saved', error: 'Sync paused' };

  function render() {
    const btn = $('acctBtn');
    if (btn) {
      if (st.user) {
        btn.innerHTML = `${avatar(st.user)}<span class="acct-txt"><span class="acct-status ${st.status}">${STATUS_TEXT[st.status]}</span></span>`;
        btn.title = `${st.user.name}: ${STATUS_TEXT[st.status]}`;
      } else {
        btn.innerHTML = `<span class="acct-txt"><b>Sign in</b><span class="acct-status">Save progress</span></span>`;
        btn.title = 'Sign in to save your progress';
      }
    }
    if (!$('acctModal') || $('acctModal').hidden) return;
    $('acctBody').innerHTML = modalHtml();
  }

  function summaryLine(m) {
    return `Day ${m.day + 1} · ${esc(H.longDate(m.date))} · net worth ${esc(H.money(m.nw))}`;
  }

  function modalHtml() {
    const err = st.error ? `<p class="acct-err">${esc(st.error)}</p>` : '';
    if (st.conflict) {
      const here = H.summary();
      return `<h2>Choose which game to keep</h2>
        <p class="note">Your account has a saved game that is different from the one on this device.</p>
        <div class="acct-choice">
          <div><span class="eyebrow">Saved to your account</span><p>${summaryLine(st.conflict)}</p><p class="muted small">Saved ${esc(ago(st.conflict.savedAt))}</p>
            <button class="btn btn-primary" type="button" data-acct="load">Load this game</button></div>
          <div><span class="eyebrow">On this device</span><p>${summaryLine(here)}</p><p class="muted small">Not yet saved to your account</p>
            <button class="btn" type="button" data-acct="keep">Keep this one</button></div>
        </div>
        <p class="note">The game you don’t keep is replaced.</p>${err}`;
    }
    if (st.user) {
      const statusTxt = st.status === 'saved' ? `Saved to your account ${esc(ago(st.lastSaved))}.`
        : st.status === 'saving' ? 'Saving…' : st.status === 'checking' ? 'Connecting to your account…' : st.status === 'error' ? 'Sync paused.' : 'Not saved yet.';
      return `<div class="acct-profile">${avatar(st.user)}<div><b>${esc(st.user.name)}</b><span class="muted small">${esc(st.user.email || '')}${st.user.email ? ' · ' : ''}signed in with ${esc(st.user.via)}</span></div></div>
        <p>${statusTxt} Your game saves automatically and picks up where you left off on any device where you sign in.</p>
        ${st.provider === 'claude' ? '<p class="note">You are signed in with the account you use for Claude, which you can sign into with Google, Apple or email.</p>' : ''}
        ${err}
        <div class="acct-actions">
          <button class="btn btn-primary" type="button" data-acct="save"${st.busy ? ' disabled' : ''}>Save now</button>
          ${st.provider === 'firebase' ? '<button class="btn" type="button" data-acct="signout">Sign out</button>' : ''}
        </div>`;
    }
    if (st.provider === 'firebase') {
      const create = st.emailMode === 'create';
      return `<h2>Sign in to save your progress</h2>
        <p class="note">Your game saves to your account and follows you to any device.</p>
        <div class="acct-providers">
          <button class="btn provider" type="button" data-acct="google">Continue with Google</button>
          <button class="btn provider" type="button" data-acct="apple">Continue with Apple</button>
          <button class="btn provider" type="button" data-acct="microsoft">Continue with Microsoft</button>
        </div>
        <div class="acct-or"><span>or use email</span></div>
        <form class="form" id="acctEmailForm">
          <label class="field"><span>Email</span><input id="acctEmail" type="email" autocomplete="email" required></label>
          <label class="field"><span>Password</span><input id="acctPass" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" minlength="6" required></label>
          <button class="btn btn-primary btn-block" type="submit">${create ? 'Create account' : 'Sign in'}</button>
          <button class="btn btn-ghost" type="button" data-acct="toggle-email">${create ? 'I already have an account' : 'New here? Create an account'}</button>
        </form>${err}`;
    }
    return `<h2>Save your progress</h2>
      <p>Your game is saved in this browser, so it is still here when you come back on this device.</p>
      <div class="acct-providers">
        <button class="btn provider" type="button" disabled>Continue with Google</button>
        <button class="btn provider" type="button" disabled>Continue with Apple</button>
        <button class="btn provider" type="button" disabled>Continue with Microsoft</button>
      </div>
      <p class="note">Online accounts are not switched on for this copy of the app. Open it from its claude.ai link to save to your Claude account, or add a Firebase project in <code>js/firebase-config.js</code> to turn on Google, Apple, Microsoft and email sign-in (see the README).</p>${err}`;
  }

  function openModal() { $('acctModal').hidden = false; document.body.style.overflow = 'hidden'; render(); }
  function closeModal() { if (st.conflict) return; $('acctModal').hidden = true; document.body.style.overflow = ''; }
  function closeModalIfSignedIn() { if (!st.conflict && $('acctModal') && !$('acctModal').hidden) render(); }

  function bind() {
    $('acctBtn').addEventListener('click', openModal);
    $('acctClose').addEventListener('click', closeModal);
    $('acctModal').addEventListener('click', (e) => {
      if (e.target === $('acctModal')) { closeModal(); return; }
      const b = e.target.closest('[data-acct]');
      if (!b) return;
      const a = b.dataset.acct;
      if (a === 'google' || a === 'apple' || a === 'microsoft') signIn(a);
      if (a === 'save') pushSave();
      if (a === 'signout') signOut();
      if (a === 'toggle-email') { st.emailMode = st.emailMode === 'create' ? 'signin' : 'create'; st.error = ''; render(); }
      if (a === 'load') { const m = st.conflict; st.conflict = null; loadCloud(m).then(closeModal); }
      if (a === 'keep') { st.conflict = null; pushSave().then(closeModal); }
    });
    $('acctModal').addEventListener('submit', (e) => {
      if (e.target.id !== 'acctEmailForm') return;
      e.preventDefault();
      emailAuth($('acctEmail').value.trim(), $('acctPass').value, st.emailMode === 'create');
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('acctModal').hidden) closeModal(); });
    setInterval(() => { if (st.dirty && st.backend && !H.isSkipping()) pushSave(); }, AUTOSAVE_MS);
    setInterval(() => { if (!$('acctModal').hidden && st.user) render(); }, 15000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && st.dirty && st.backend) pushSave(); });
  }

  async function init(hooks) {
    H = hooks;
    bind();
    render();
    if (await initClaude()) return;
    await initFirebase();
    render();
  }

  window.Cloud = { init, markDirty, saveNow: () => pushSave(), open: openModal };
})();
