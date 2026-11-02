/* global UNITS */
const KEY = 'ppiyak-code-v1';
const DEF = { xp: 0, days: {}, l: {}, q: {}, mocks: [], goal: 20, exam: '', sound: true, tab: 'home', profile: { name: '', color: 0 }, setAt: 0, resetAt: 0 };
const FB = { apiKey: 'AIzaSyB-3tQY4yLI1eiR-bl4nFdEms9L3zhe5jU', authDomain: 'ppiyak-code.firebaseapp.com', projectId: 'ppiyak-code', appId: '1:542823112561:web:a5a00fabb856fb980920d0' };
const FB_VER = '10.14.1';
const LAST = 'ppiyak-last-uid', GUEST_OK = 'ppiyak-guest-ok';
const COLORS = [['노랑', '#ffc933', '#f2b100', '#ffe08a'], ['민트', '#5fd8b8', '#34b896', '#bff0e2'], ['하늘', '#6fbdf5', '#3f97d8', '#c7e5fb'], ['분홍', '#f79ac0', '#e06f9e', '#fcd5e5'], ['보라', '#b79bf2', '#9272d8', '#e1d5fa'], ['주황', '#ff9f5a', '#e57f35', '#ffd7b8']];
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장이 막힌 환경 */ } };
const lsDel = k => { try { localStorage.removeItem(k); } catch { /* 저장이 막힌 환경 */ } };
let UID = lsGet(LAST);
let cloud = { user: null, ready: false, api: null, status: 'idle', at: null, loading: true, pulled: 0, timer: null };
const SR = [0, 1, 3, 7, 16];
const SUBJ = { lang: '프로그래밍 언어', app: '응용SW 기초기술', sql: 'SQL 활용', sys: '정보시스템 기초기술' };
const LESSON_LEN = 8;

let S = load(storeKey());
let L = null;   // 진행 중인 레슨
let E = null;   // 진행 중인 모의고사
let sheet = null;
let audio = null;

/* ---------- 저장 ---------- */
function storeKey(uid = UID) { return uid ? `${KEY}:${uid}` : KEY; }
function load(k) {
  try { return { ...DEF, ...JSON.parse(lsGet(k) || '{}') }; } catch { return { ...DEF }; }
}
function save() {
  lsSet(storeKey(), JSON.stringify(S));
  if (UID && cloud.ready) schedulePush();
}

/* ---------- 로그인과 동기화 ---------- */
function mergeState(a, b) {
  if (!a) return b;
  if (!b) return a;
  if ((a.resetAt || 0) !== (b.resetAt || 0)) return (a.resetAt || 0) > (b.resetAt || 0) ? a : b;
  const base = (a.setAt || 0) >= (b.setAt || 0) ? a : b;
  const out = { ...DEF, ...base, tab: a.tab, lastResult: a.lastResult || b.lastResult };
  out.days = { ...a.days };
  for (const [k, v] of Object.entries(b.days || {})) { const c = out.days[k] || { xp: 0, ok: 0 }; out.days[k] = { xp: Math.max(c.xp, v.xp), ok: Math.max(c.ok, v.ok) }; }
  out.l = { ...a.l };
  for (const [k, v] of Object.entries(b.l || {})) out.l[k] = { n: Math.max(out.l[k]?.n || 0, v.n) };
  out.q = { ...a.q };
  for (const [k, v] of Object.entries(b.q || {})) { const c = out.q[k]; out.q[k] = !c ? v : { ...(c.due >= v.due ? c : v), wrong: Math.max(c.wrong, v.wrong) }; }
  const seen = new Set();
  out.mocks = [...(a.mocks || []), ...(b.mocks || [])].filter(m => { const k = [m.d, m.name, m.score, m.right].join('|'); if (seen.has(k)) return false; seen.add(k); return true; }).sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  out.xp = Object.values(out.days).reduce((s, d) => s + d.xp, 0);
  return out;
}
const hasProgress = s => s && (s.xp > 0 || Object.keys(s.q || {}).length > 0 || (s.mocks || []).length > 0);
function stamp() { S.setAt = Date.now(); }
async function pullCloud() {
  const { getDoc } = cloud.api;
  const snap = await getDoc(cloud.ref());
  cloud.pulled = Date.now();
  return snap.exists() ? { ...DEF, ...JSON.parse(snap.data().state) } : null;
}
function schedulePush() {
  clearTimeout(cloud.timer);
  cloud.timer = setTimeout(pushCloud, 1500);
}
async function pushCloud() {
  clearTimeout(cloud.timer);
  if (!UID || !cloud.ready) return false;
  const { tab, ...rest } = S;
  try {
    await cloud.api.setDoc(cloud.ref(), { state: JSON.stringify(rest), updatedAt: cloud.api.serverTimestamp() });
    cloud.status = 'ok'; cloud.at = new Date();
    return true;
  } catch {
    cloud.status = 'fail';
    return false;
  } finally {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = syncText();
  }
}
async function onUser(user) {
  cloud.user = user; cloud.loading = false; cloud.ready = false;
  if (!user) {
    if (UID) { UID = null; lsDel(LAST); S = load(storeKey()); }
    if (!L && !E) renderApp();
    return;
  }
  const prev = UID === user.uid ? S : load(storeKey(user.uid));
  const guest = lsGet(KEY) ? load(KEY) : null;
  UID = user.uid; lsSet(LAST, UID); lsSet(GUEST_OK, '1');
  S = prev;
  cloud.status = 'syncing';
  if (!L && !E) renderApp();
  try {
    const remote = await pullCloud();
    if (L || E) { S = mergeState(S, remote); } else { S = mergeState(mergeState(prev, guest), remote); }
    if (guest) lsDel(KEY);
    if (!S.profile?.name) S.profile = { color: S.profile?.color || 0, name: user.displayName || '' };
    cloud.ready = true;
    save();
    await pushCloud();
  } catch {
    cloud.status = 'fail';
  }
  if (!L && !E) renderApp();
}
async function initCloud() {
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}`;
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-firestore.js`)]);
    const fbApp = initializeApp(FB);
    const auth = authMod.getAuth(fbApp), db = fsMod.getFirestore(fbApp);
    auth.languageCode = 'ko';
    cloud.api = { ...fsMod, auth, authMod };
    cloud.ref = () => fsMod.doc(db, 'users', UID);
    authMod.onAuthStateChanged(auth, onUser);
  } catch {
    cloud.loading = false; cloud.status = 'offline';
    if (!L && !E) renderApp();
  }
}
async function login() {
  if (!cloud.api) return confirmBox('지금은 로그인할 수 없어', '인터넷 연결을 확인하고 웹 주소로 열어 줘.', '닫기', '확인', () => {});
  try {
    const { GoogleAuthProvider, signInWithPopup } = cloud.api.authMod;
    await signInWithPopup(cloud.api.auth, new GoogleAuthProvider());
  } catch (err) {
    const code = err?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    const msg = code === 'auth/popup-blocked' ? '브라우저가 로그인 창을 막았어. 팝업을 허용하고 다시 눌러 줘.'
      : code === 'auth/unauthorized-domain' || code === 'auth/operation-not-supported-in-this-environment' ? '내려받은 파일에서는 로그인이 안 돼. 웹 주소로 열어 줘.'
        : '로그인하지 못했어. 잠시 뒤에 다시 해 줘.';
    confirmBox('로그인 실패', msg, '닫기', '확인', () => {});
  }
}
async function logout() {
  const pushed = cloud.ready ? await pushCloud() : false;
  const uid = UID;
  await cloud.api.authMod.signOut(cloud.api.auth);
  if (pushed) lsDel(storeKey(uid));
  S.tab = 'home';
}
async function deleteCloudData() {
  const uid = UID;
  try {
    await cloud.api.deleteDoc(cloud.ref());
    cloud.ready = false;
    lsDel(storeKey(uid));
    await cloud.api.authMod.signOut(cloud.api.auth);
    lsDel(GUEST_OK);
  } catch {
    confirmBox('지우지 못했어', '인터넷 연결을 확인하고 다시 해 줘.', '닫기', '확인', () => {});
  }
}
document.addEventListener('visibilitychange', async () => {
  if (!UID || !cloud.ready) return;
  if (document.visibilityState === 'hidden') return void pushCloud();
  if (L || E || Date.now() - cloud.pulled < 30000) return;
  try {
    const remote = await pullCloud();
    if (L || E) return;
    const before = JSON.stringify(S);
    S = mergeState(S, remote);
    if (JSON.stringify(S) !== before) { lsSet(storeKey(), JSON.stringify(S)); if (!document.querySelector('.overlay')) renderApp(); }
  } catch { /* 다음에 다시 받는다 */ }
});

/* ---------- 날짜 ---------- */
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return dstr(new Date(y, m - 1, d + n)); };
const dayDiff = (a, b) => { const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(a) - p(b)) / 864e5); };
const dayOf = s => S.days[s] || { xp: 0, ok: 0 };
const qualified = s => dayOf(s).ok >= 3;
function streak() {
  let d = today();
  if (!qualified(d)) d = addDays(d, -1);
  let n = 0;
  while (qualified(d)) { n++; d = addDays(d, -1); }
  return n;
}

/* ---------- 문제 목록 ---------- */
const ALL = [];
const LESSONS = [];
UNITS.forEach(u => u.lessons.forEach(l => {
  LESSONS.push({ ...l, unit: u });
  l.qs.forEach((q, i) => { q.id = `${l.id}-${i}`; q.subj = u.subj; q.unit = u.id; q.lesson = l.id; q.lname = l.name; ALL.push(q); });
}));
const byId = id => ALL.find(q => q.id === id);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const lessonDone = id => (S.l[id]?.n || 0) > 0;
const currentLesson = () => LESSONS.find(l => !lessonDone(l.id));
const dueQs = () => ALL.filter(q => { const s = S.q[q.id]; return s && s.due <= today(); }).sort((a, b) => S.q[a.id].box - S.q[b.id].box || S.q[b.id].wrong - S.q[a.id].wrong);

function prep(q) {
  if (q.k !== 'mc') return q;
  const order = shuffle(q.o.map((t, i) => ({ t, i })));
  return { ...q, o: order.map(x => x.t), a: order.findIndex(x => x.i === q.a) };
}
function pickFor(lesson, n) {
  const rank = q => { const s = S.q[q.id]; return !s ? 0 : s.due <= today() ? 1 : 2 + s.box; };
  return shuffle(lesson.qs).sort((a, b) => rank(a) - rank(b)).slice(0, n);
}
function recordSR(id, ok) {
  const s = S.q[id] || { box: 0, due: today(), wrong: 0 };
  if (ok) { s.box = Math.min(SR.length - 1, s.box + 1); s.due = addDays(today(), SR[s.box]); }
  else { s.box = 0; s.due = today(); s.wrong++; }
  S.q[id] = s;
}
function addDay(xp, ok) {
  const t = today(), d = S.days[t] || { xp: 0, ok: 0 };
  d.xp += xp; d.ok += ok; S.days[t] = d; S.xp += xp;
}

/* ---------- 화면 조각 ---------- */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const ICON = {
  home: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="currentColor"/>',
  review: '<path d="M12 5a7 7 0 1 1-6.7 9h2.1A5 5 0 1 0 12 7v3L7.5 6 12 2z" fill="currentColor"/>',
  exam: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1m2 7v2h8v-2zm0 4v2h8v-2z" fill="currentColor"/>',
  chart: '<path d="M4 20V10h4v10zm6 0V4h4v16zm6 0v-7h4v7z" fill="currentColor"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4.5 2.5-7 1.5 1 2 2.5 2 3.5C12 9 12.5 5 12 2" fill="currentColor"/>',
  bolt: '<path d="M13.5 2 5 13.5h6L10 22l9-12h-6.5z" fill="currentColor"/>',
  target: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11m0 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5" fill="currentColor"/>',
  heart: '<path d="M12 21s-8.5-5.2-8.5-11.3A4.7 4.7 0 0 1 12 7a4.7 4.7 0 0 1 8.5 2.7C20.5 15.8 12 21 12 21" fill="currentColor"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  lock: '<path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z" fill="currentColor"/>',
  play: '<path d="M8 5.5v13a1 1 0 0 0 1.5.9l10.5-6.5a1 1 0 0 0 0-1.7L9.5 4.6A1 1 0 0 0 8 5.5" fill="currentColor"/>',
  user: '<path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9m0 2c-4.4 0-8 2.3-8 5.2V21h16v-1.8c0-2.9-3.6-5.2-8-5.2" fill="currentColor"/>',
  x: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
};
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
function chick(mood = 'idle', color = S.profile?.color || 0) {
  const [, body, wing, belly] = COLORS[color] || COLORS[0];
  const eyes = mood === 'happy'
    ? '<path d="M39 44q5-7 10 0M61 44q5-7 10 0" fill="none" stroke="#2b2100" stroke-width="4" stroke-linecap="round"/>'
    : mood === 'sad'
      ? '<circle cx="44" cy="45" r="4.5" fill="#2b2100"/><circle cx="66" cy="45" r="4.5" fill="#2b2100"/><path d="M37 39l11-5M73 39l-11-5" stroke="#2b2100" stroke-width="3.5" stroke-linecap="round"/>'
      : '<circle cx="44" cy="44" r="5" fill="#2b2100"/><circle cx="66" cy="44" r="5" fill="#2b2100"/><circle cx="46" cy="42" r="1.600" fill="#fff"/><circle cx="68" cy="42" r="1.600" fill="#fff"/>';
  const wings = mood === 'happy'
    ? `<path d="M21 62q-14-8-11-22 11 4 18 15zM89 62q14-8 11-22-11 4-18 15z" fill="${wing}"/>`
    : `<path d="M20 60q-8 8-3 19 9-1 13-9zM90 60q8 8 3 19-9-1-13-9z" fill="${wing}"/>`;
  return `<svg class="chick" viewBox="0 0 110 110" aria-hidden="true"><path d="M55 9q-3-7-8-5 3 3 2 7M57 9q4-7 9-4-4 3-4 7" fill="${wing}"/>${wings}<path d="M42 96v8m-6 0h12M68 96v8m-6 0h12" stroke="#ef8a1d" stroke-width="4" stroke-linecap="round"/><ellipse cx="55" cy="56" rx="36" ry="43" fill="${body}"/><ellipse cx="55" cy="73" rx="22" ry="20" fill="${belly}"/>${eyes}<path d="M47 53q8-5 16 0-8 10-16 0" fill="#ef8a1d"/><circle cx="33" cy="56" r="5" fill="#ff9d7a" opacity=".6"/><circle cx="77" cy="56" r="5" fill="#ff9d7a" opacity=".6"/></svg>`;
}
const KW = {
  python: 'def|return|if|elif|else|for|while|in|class|import|from|global|lambda|pass|break|continue|and|or|not|None|True|False|print',
  java: 'public|private|protected|static|void|int|char|double|float|long|boolean|class|interface|abstract|extends|implements|new|return|if|else|for|while|do|switch|case|break|continue|default|try|catch|finally|this|super|final|String',
  c: 'int|char|float|double|void|struct|return|if|else|for|while|do|switch|case|break|continue|sizeof|printf',
  js: 'let|const|var|function|return|if|else|for|while|console',
  sql: 'SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|GROUP|BY|HAVING|ORDER|ASC|DESC|JOIN|LEFT|RIGHT|INNER|ON|AS|UNION|ALL|EXCEPT|COUNT|SUM|AVG|MAX|MIN|DISTINCT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|DROP|TABLE|ALTER|ADD|INT',
};
function hl(line, lang) {
  const com = lang === 'python' ? '#.*$' : lang === 'sql' ? '--.*$' : '//.*$';
  const re = new RegExp(`("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')|(${com})|(____)|\\b(\\d+(?:\\.\\d+)?)\\b|\\b(${KW[lang] || 'zzzz'})\\b`, 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index));
    const t = esc(m[0]);
    out += m[1] ? `<span class="t-s">${t}</span>` : m[2] ? `<span class="t-c">${t}</span>` : m[3] ? '<span class="blank">빈칸</span>' : m[4] ? `<span class="t-n">${t}</span>` : `<span class="t-k">${t}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}
function codeBlock(c, lang) {
  return `<div class="code" tabindex="0">${c.split('\n').map((l, i) => `<div class="ln"><span class="no">${i + 1}</span><span class="tx">${hl(l, lang) || ' '}</span></div>`).join('')}</div>`;
}
function tables(tb) {
  if (!tb) return '';
  return `<div class="tbs">${tb.map(t => `<table class="tb"><caption>${esc(t.n)}</caption><tr>${t.h.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${t.r.map(r => `<tr>${r.map(v => v === null ? '<td class="null">NULL</td>' : `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</table>`).join('')}</div>`;
}
const app = () => document.getElementById('app');

/* ---------- 탭 화면 ---------- */
function statsData() {
  const t = dayOf(today());
  return { streak: streak(), xp: S.xp, todayXp: t.xp, ok: t.ok, due: dueQs().length };
}
function dday() {
  if (!S.exam) return null;
  return dayDiff(S.exam, today());
}
function renderApp() {
  if (L) return renderLesson();
  if (E) return renderExam();
  if (!UID && !lsGet(GUEST_OK)) return renderWelcome();
  const d = statsData();
  const nav = [['home', '코스', 'home'], ['review', '복습', 'review'], ['mock', '모의고사', 'exam'], ['stats', '기록', 'chart'], ['profile', '프로필', 'user']];
  const view = { home: viewHome, review: viewReview, mock: viewMock, stats: viewStats, profile: viewProfile, result: viewResult }[S.tab] || viewHome;
  app().innerHTML = `<div class="shell">
    <nav class="side" aria-label="메뉴"><div class="logo">${chick('idle')}삐약코드</div>
      ${nav.map(([k, n, i]) => `<button class="nav ${S.tab === k ? 'on' : ''}" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${icon(i)}<span>${n}</span>${k === 'review' && d.due ? `<span class="badge">${d.due}</span>` : ''}</button>`).join('')}
    </nav>
    <main class="main">
      <div class="top-stats">
        <div class="chip flame" title="연속 학습일">${icon('flame')}${d.streak}일</div>
        <div class="chip bolt" title="누적 XP">${icon('bolt')}${d.xp}</div>
        <div class="chip target" title="오늘 목표">${icon('target')}${Math.min(d.todayXp, S.goal)}<span class="muted">/${S.goal}</span></div>
      </div>
      ${view(d)}
    </main>
    <aside class="panel">${panel(d)}</aside>
  </div>`;
}
function panel(d) {
  const dd = dday();
  return `<button class="card me-card" data-tab="profile">${chick('idle')}<span><b>${esc(S.profile?.name || '손님')}</b><span class="note">${UID ? syncText() : '로그인하면 기기끼리 이어져'}</span></span></button>
    <div class="card"><h3>${icon('flame')} 연속 학습</h3><div class="stat-big">${d.streak}일</div>
      <p class="note">${d.ok >= 3 ? '오늘 몫은 끝났어.' : `오늘 ${3 - d.ok}문제만 더 맞히면 이어져.`}</p></div>
    <div class="card"><h3>${icon('target')} 오늘 목표</h3><div class="bar" role="progressbar" aria-valuenow="${Math.min(d.todayXp, S.goal)}" aria-valuemax="${S.goal}"><i style="width:${Math.min(100, d.todayXp / S.goal * 100)}%"></i></div>
      <p class="note" style="margin-top:8px">${d.todayXp} / ${S.goal} XP</p></div>
    <div class="card"><h3>시험까지</h3><div class="stat-big">${dd === null ? '날짜 미정' : dd > 0 ? `D-${dd}` : dd === 0 ? 'D-Day' : '시험 지남'}</div>
      <p class="note">${S.exam ? esc(S.exam) : '2027년 일정은 아직 공고 전이야. 공고가 뜨면 기록 탭에서 넣어 줘.'}</p></div>`;
}
function viewHome(d) {
  const cur = currentLesson();
  const needsFloor = d.ok < 3;
  const offs = [0, 44, 66, 44, 0, -44, -66, -44];
  let idx = 0;
  const units = UNITS.map(u => {
    const done = u.lessons.filter(l => lessonDone(l.id)).length;
    const nodes = u.lessons.map(l => {
      const isDone = lessonDone(l.id), isCur = cur && cur.id === l.id, locked = !isDone && !isCur;
      const n = Math.min(3, S.l[l.id]?.n || 0), off = offs[idx++ % offs.length];
      return `<div class="node-wrap" style="transform:translateX(${off}px)">
        ${isCur ? '<span class="start-tag">시작</span>' : ''}
        <button class="node ${locked ? 'locked' : ''} ${isCur ? 'current' : ''}" data-lesson="${l.id}" aria-label="${esc(l.name)} ${isDone ? '완료' : locked ? '잠김' : '시작'}">${icon(isDone ? 'check' : locked ? 'lock' : 'play')}</button>
        ${isDone ? `<div class="stars" aria-label="${n}회 완료">${[0, 1, 2].map(i => `<span class="${i < n ? '' : 'off'}">${icon('star')}</span>`).join('')}</div>` : ''}
        <div class="node-name ${locked ? 'locked' : ''}">${esc(l.name)}</div></div>`;
    }).join('');
    return `<section class="unit u-${u.color}"><div class="unit-head"><div><h2>${esc(u.name)}</h2><p>${esc(u.sub)}</p></div><b>${done} / ${u.lessons.length}</b></div><div class="path">${nodes}</div></section>`;
  }).join('');
  return `${needsFloor ? `<div class="nudge">${chick('idle')}<div><b>하기 싫은 날은 3문제만</b><span>맞히면 오늘 기록이 이어져.</span></div><button class="btn small" data-act="quick">3문제</button></div>` : ''}${units}`;
}
function viewReview(d) {
  const due = dueQs();
  const wrongTotal = ALL.filter(q => S.q[q.id]?.wrong).length;
  return `<h1 class="page-title">복습</h1><p class="page-sub">틀린 문제는 다음 날, 맞힌 문제는 1일, 3일, 7일, 16일 간격으로 다시 나와.</p>
    ${due.length ? `<div class="card" style="text-align:center"><div class="stat-big">${due.length}문제</div><p class="note" style="margin-bottom:14px">오늘 복습할 차례야. 한 번에 최대 10문제씩 풀어.</p><button class="btn wide" data-act="review">복습 시작</button></div>`
      : `<div class="empty">${chick('happy')}<h2>오늘 복습 끝</h2><p>${Object.keys(S.q).length ? '다음 복습은 날짜가 되면 여기 나타나.' : '레슨을 풀면 복습할 문제가 쌓여.'}</p></div>`}
    <div class="section"><h2>자주 틀린 문제</h2>${wrongTotal ? ALL.filter(q => S.q[q.id]?.wrong).sort((a, b) => S.q[b.id].wrong - S.q[a.id].wrong).slice(0, 5).map(q => `<div class="review-item"><b>${S.q[q.id].wrong}회</b> · ${esc(q.lname)}<div>${fmt(q.q)}</div>${q.c ? codeBlock(q.c, q.lang) : ''}<div class="fb-ans">정답: ${answerText(q)}</div></div>`).join('') : '<p class="note">아직 없어.</p>'}</div>`;
}
function viewMock() {
  const hist = S.mocks.slice(-5).reverse();
  return `<h1 class="page-title">모의고사</h1><p class="page-sub">필기는 과목별로 같은 수를 뽑아. 실제 과목별 문항 수는 공개 자료로 확인 못 했어.</p>
    <div class="card mock-card"><div><h3>필기 실전</h3><p>60문항 · 60분 · 60점 이상 합격</p></div><button class="btn small" data-mock="w60">시작</button></div>
    <div class="card mock-card"><div><h3>필기 맛보기</h3><p>20문항 · 20분</p></div><button class="btn small ghost" data-mock="w20">시작</button></div>
    <div class="card mock-card"><div><h3>실기 필답 연습</h3><p>12문항 · 90분 · 답을 직접 입력</p></div><button class="btn small" data-mock="p12">시작</button></div>
    <p class="note">실기는 2027년부터 필답형이야. 종이에 먼저 풀고 답만 입력하면 실제 시험과 가까워져. 실제 문항 수, 부분 점수 기준은 확인 못 했어.</p>
    <div class="section"><h2>지난 점수</h2>${hist.length ? `<div class="rows">${hist.map(m => `<div class="row"><span>${esc(m.d)} · ${esc(m.name)}</span><b class="${m.score >= 60 ? 'pass' : 'fail'}">${m.score}점</b></div>`).join('')}</div>` : '<p class="note">아직 없어. 40점이 55점 되는 걸 여기서 보게 될 거야.</p>'}</div>`;
}
const G_ICON = '<svg class="icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.700 1.200 9.200 3.600l6.800-6.800C35.900 2.400 30.5 0 24 0 14.600 0 6.5 5.400 2.600 13.200l7.900 6.200C12.400 13.700 17.700 9.5 24 9.5z"/><path fill="#4285F4" d="M46.100 24.5c0-1.600-.1-3.100-.4-4.5H24v9h12.400c-.5 2.900-2.200 5.300-4.600 7l7.200 5.600c4.200-3.900 7.100-9.600 7.100-17.100z"/><path fill="#FBBC05" d="M10.5 28.600A14.5 14.5 0 0 1 9.700 24c0-1.600.3-3.100.8-4.600l-7.900-6.200A24 24 0 0 0 0 24c0 3.900.9 7.5 2.600 10.800z"/><path fill="#34A853" d="M24 48c6.5 0 11.900-2.100 15.900-5.800l-7.200-5.600c-2 1.400-4.600 2.200-8.700 2.200-6.300 0-11.600-4.200-13.5-9.900l-7.900 6.100C6.5 42.600 14.600 48 24 48z"/></svg>';
const googleBtn = () => `<button class="btn wide ghost google" data-act="login">${G_ICON}구글로 로그인</button>`;
function syncText() {
  if (cloud.status === 'ok' && cloud.at) return `저장됨 ${pad(cloud.at.getHours())}:${pad(cloud.at.getMinutes())}`;
  if (cloud.status === 'fail') return '저장 못 함. 인터넷이 돌아오면 다시 올릴게.';
  if (cloud.status === 'offline') return '서버에 연결 못 함. 이 기기에는 저장돼.';
  return '동기화 중';
}
function renderWelcome() {
  app().innerHTML = `<div class="lesson"><div class="l-body"><div class="done-page">${chick('happy')}<h1>삐약코드</h1>
    <p class="muted">프로그래밍기능사, 하루 3문제부터.<br>로그인하면 폰과 PC에서 기록이 이어져.</p>
    ${googleBtn()}<button class="link" data-act="guest">로그인 없이 써 보기</button></div></div></div>`;
}
function viewProfile(d) {
  if (!UID) {
    return `<h1 class="page-title">프로필</h1><div class="empty">${chick('idle')}<h2>지금은 손님이야</h2><p style="margin-bottom:16px">기록이 이 기기에만 남아. 로그인하면 지금까지 푼 기록도 내 계정으로 옮겨 줄게.</p>${googleBtn()}</div>`;
  }
  const done = LESSONS.filter(l => lessonDone(l.id)).length;
  return `<h1 class="page-title">프로필</h1>
    <div class="profile-head">${chick('happy')}<div class="profile-main"><label class="note" for="profileName">이름</label>
      <input id="profileName" class="name-input" maxlength="20" value="${esc(S.profile?.name || '')}" autocomplete="off">
      ${cloud.user?.email ? `<p class="note">${esc(cloud.user.email)}</p>` : ''}</div></div>
    <div class="section"><h2>병아리 색</h2><div class="dots">${COLORS.map((c, i) => `<button class="dot ${(S.profile?.color || 0) === i ? 'on' : ''}" style="--c:${c[1]}" data-color="${i}" aria-label="${c[0]}" aria-pressed="${(S.profile?.color || 0) === i}"></button>`).join('')}</div></div>
    <div class="section"><h2>내 기록</h2><div class="rows">
      <div class="row"><span>누적 XP</span><b>${d.xp}</b></div>
      <div class="row"><span>연속 학습</span><b>${d.streak}일</b></div>
      <div class="row"><span>끝낸 레슨</span><b>${done} / ${LESSONS.length}</b></div>
      <div class="row"><span>동기화</span><span id="syncStatus">${syncText()}</span></div></div></div>
    <div class="section"><button class="btn wide ghost" data-act="logout">로그아웃</button>
      <p style="text-align:center;margin-top:12px"><button class="link" data-act="del-cloud">내 기록을 서버에서 지우기</button></p>
      <p class="note">서버에는 이름과 학습 기록만 저장돼. 이메일은 로그인 정보로만 쓰여.</p></div>`;
}
function viewStats(d) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const max = Math.max(S.goal, ...days.map(x => dayOf(x).xp));
  const subj = Object.entries(SUBJ).map(([k, n]) => {
    const qs = ALL.filter(q => q.subj === k), solid = qs.filter(q => (S.q[q.id]?.box || 0) >= 2).length;
    const pct = Math.round(solid / qs.length * 100);
    return `<div class="sbj"><div class="sbj-top"><span>${n}</span><span class="muted">${solid} / ${qs.length}</span></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  const mon = new Date().getMonth() + 1;
  const plan = [
    ['11월', 'Python·Java 코드 읽기, SQL', mon === 11],
    ['12월', '필기 책 1권 빠르게, 나머지 과목 레슨', mon === 12],
    ['1월', '접수하고 필기 모의고사 반복', mon === 1],
    ['필기 후', 'Linux, 실기 필답 연습', mon >= 2 && mon <= 4],
  ];
  return `<h1 class="page-title">기록</h1><p class="page-sub">${UID ? '내 계정에 저장돼서 폰과 PC에서 이어져.' : '이 기기의 브라우저에만 저장돼. 프로필 탭에서 로그인하면 폰과 PC에서 이어져.'}</p>
    <div class="card"><h3>최근 7일 XP</h3><div class="week">${days.map(x => { const v = dayOf(x).xp; return `<div class="${v ? '' : 'zero'}"><span>${v || ''}</span><i style="height:${Math.max(3, v / max * 80)}px"></i><span>${Number(x.slice(8))}일</span></div>`; }).join('')}</div></div>
    <div class="section"><h2>과목별로 익힌 문제</h2>${subj}<p class="note">두 번 이상 연달아 맞힌 문제만 세.</p></div>
    <div class="section"><h2>코스 순서</h2><div class="rows">${plan.map(p => `<div class="row ${p[2] ? 'now' : ''}"><b>${p[0]}</b><span style="text-align:right">${p[1]}</span></div>`).join('')}</div>
      <p class="note" style="margin-top:8px">2026년 패턴(1월 필기, 3~4월 실기)을 보고 잡은 내 추정이야. 2027년 일정은 큐넷 공고로 꼭 확인해.</p></div>
    <div class="section"><h2>설정</h2>
      <div class="rows">
        <div class="row"><span>시험일</span><input type="date" id="examDate" value="${esc(S.exam)}" aria-label="시험일"></div>
        <div class="row"><span>하루 목표</span><div class="seg">${[20, 40, 60].map(g => `<button class="${S.goal === g ? 'on' : ''}" data-goal="${g}">${g}</button>`).join('')}</div></div>
        <div class="row"><span>효과음</span><div class="seg"><button class="${S.sound ? 'on' : ''}" data-sound="1">켜기</button><button class="${S.sound ? '' : 'on'}" data-sound="0">끄기</button></div></div>
        <div class="row"><span>진행 파일</span><div class="seg"><button data-act="export">내보내기</button><button data-act="import">불러오기</button></div></div>
        <div class="row"><span>처음부터 다시</span><div class="seg"><button data-act="reset">초기화</button></div></div>
      </div><input type="file" id="importFile" accept="application/json" hidden></div>
    <div class="section"><h2>문제에 대해</h2>
      <p class="note">문제는 공단 예시문제의 유형을 참고해 새로 쓴 연습문제야. 기출문제가 아니야.</p>
      <p class="note">Python, JavaScript, SQL 문제는 정답을 실제로 실행해서 확인했어. Java, C 문제는 컴파일러로 돌려 보지 못하고 직접 검토만 했어.</p>
      <p class="note">2027년 출제기준의 세부 항목은 확인 못 했어. 이론 범위는 교재와 큐넷 출제기준을 함께 봐.</p></div>`;
}

/* ---------- 시트 ---------- */
function renderSheet() {
  if (sheet.kind === 'lesson') {
    const l = LESSONS.find(x => x.id === sheet.id), isDone = lessonDone(l.id), isCur = currentLesson()?.id === l.id;
    return `<div class="overlay" data-close="1"><div class="sheet u-${l.unit.color}" role="dialog" aria-modal="true" aria-label="${esc(l.name)}">
      <p class="q-tag">${esc(l.unit.name)}</p><h2>${esc(l.name)}</h2>
      <p class="muted" style="margin:4px 0 14px">${!isDone && !isCur ? '앞 레슨이 남았지만, 아는 내용이면 먼저 풀어도 돼.' : `${l.qs.length}문제 중 ${LESSON_LEN}문제를 뽑아서 풀어.`}</p>
      <button class="btn wide" data-start="${l.id}" id="sheetGo">${isDone ? '한 번 더 풀기' : '시작'}</button>
      <button class="btn wide ghost" data-tip="${l.id}">요약 먼저 보기</button></div></div>`;
  }
  if (sheet.kind === 'tip') {
    const l = LESSONS.find(x => x.id === sheet.id);
    return `<div class="overlay" data-close="1"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(l.name)} 요약"><h2>${esc(l.name)}</h2>
      <ul class="tip-list">${l.tip.map(t => `<li>${fmt(t)}</li>`).join('')}</ul>
      <button class="btn wide" style="margin-top:16px" data-start="${l.id}" id="sheetGo">문제 풀기</button></div></div>`;
  }
  if (sheet.kind === 'confirm') {
    return `<div class="overlay"><div class="sheet" role="alertdialog" aria-modal="true" aria-label="${esc(sheet.title)}"><h2>${esc(sheet.title)}</h2><p class="muted" style="margin:6px 0 16px">${esc(sheet.body)}</p>
      <button class="btn wide" data-act="confirm-no" id="sheetGo">${esc(sheet.no)}</button><button class="btn wide ghost" data-act="confirm-yes">${esc(sheet.yes)}</button></div></div>`;
  }
  if (sheet.kind === 'grid') {
    return `<div class="overlay" data-close="1"><div class="sheet" role="dialog" aria-modal="true" aria-label="문제 목록"><h2>문제 목록</h2><div class="grid-nav">${E.qs.map((q, i) => `<button class="${isAnswered(E.ans[i]) ? 'ans' : ''} ${i === E.i ? 'cur' : ''}" data-goto="${i}">${i + 1}</button>`).join('')}</div>
      <button class="btn wide" data-act="exam-submit">제출하기</button></div></div>`;
  }
  return '';
}
function openSheet(s) {
  sheet = s;
  document.querySelector('.overlay')?.remove();
  document.body.insertAdjacentHTML('beforeend', '<div id="sheetHost"></div>');
  const host = document.getElementById('sheetHost');
  host.outerHTML = renderSheet();
  document.getElementById('sheetGo')?.focus();
}
function closeSheet() { sheet = null; document.querySelector('.overlay')?.remove(); }
function confirmBox(title, body, yes, no, onYes) { confirmFn = onYes; openSheet({ kind: 'confirm', title, body, yes, no }); }
let confirmFn = null;

/* ---------- 레슨 ---------- */
function startSession(mode, qs, lesson) {
  closeSheet();
  L = { mode, lesson, queue: qs.map(prep), total: qs.length, done: 0, hearts: 5, st: 'ask', xp: 0, firstTry: 0, wrongIds: new Set(), fresh: true, showTip: mode === 'lesson' && lesson && !lessonDone(lesson.id), hit: false };
  setupQ();
  renderLesson();
}
function setupQ() {
  const q = L.queue[0];
  L.st = 'ask'; L.input = ''; L.sel = null; L.fresh = true; L.overridden = false;
  if (!q) return;
  L.isRetry = L.wrongIds.has(q.id);
  if (q.k === 'ord') { L.pool = shuffle([...q.a, ...(q.extra || [])].map((t, i) => ({ t, i }))); L.chosen = []; }
  if (q.k === 'match') { L.ml = shuffle(q.pairs.map((p, i) => ({ t: p[0], i }))); L.mr = shuffle(q.pairs.map((p, i) => ({ t: p[1], i }))); L.mSel = null; L.mDone = new Set(); L.mMiss = 0; }
}
function questionHtml(q, locked) {
  let body = '';
  if (q.k === 'mc') {
    body = `<div class="opts">${q.o.map((t, i) => {
      let c = '';
      if (locked) { if (i === q.a) c = 'right'; else if (i === L.sel) c = 'wrong'; } else if (i === L.sel) c = 'sel';
      return `<button class="opt ${c}" data-opt="${i}" ${locked ? 'disabled' : ''}><span class="n">${i + 1}</span><span>${fmt(t)}</span></button>`;
    }).join('')}</div>`;
  } else if (q.k === 'in') {
    const c = !locked ? '' : (L.st === 'right' ? 'right' : 'wrong');
    body = `<input class="answer ${c}" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="답을 입력해" aria-label="답" value="${esc(L.input)}" ${locked ? 'disabled' : ''}>${locked ? '' : '<p class="hint-line">Enter로 확인</p>'}`;
  } else if (q.k === 'ord') {
    body = `<div class="slot" aria-label="내가 고른 순서">${L.chosen.map((pi, n) => `<button class="tok" data-unpick="${n}" ${locked ? 'disabled' : ''}>${esc(L.pool[pi].t)}</button>`).join('')}</div>
      <div class="bank">${L.pool.map((p, i) => `<button class="tok ${L.chosen.includes(i) ? 'used' : ''}" data-pick="${i}" ${locked ? 'disabled' : ''}>${esc(p.t)}</button>`).join('')}</div>`;
  } else if (q.k === 'match') {
    const col = (arr, side) => `<div class="col">${arr.map(x => { const d = L.mDone.has(x.i); return `<button class="pr ${side === 'l' ? 'key' : ''} ${d ? 'done' : ''} ${L.mSel && L.mSel.side === side && L.mSel.i === x.i ? 'sel' : ''}" data-m="${side}:${x.i}" ${d || locked ? 'disabled' : ''}>${esc(x.t)}</button>`; }).join('')}</div>`;
    body = `<div class="pairs">${col(L.ml, 'l')}${col(L.mr, 'r')}</div>`;
  }
  return `<div class="q-text">${fmt(q.q)}</div>${tables(q.tb)}${q.c ? codeBlock(q.c, q.lang) : ''}${body}`;
}
function canCheck(q) {
  if (q.k === 'mc') return L.sel !== null;
  if (q.k === 'in') return L.input.trim() !== '';
  if (q.k === 'ord') return L.chosen.length > 0;
  return false;
}
function answerText(q) {
  if (q.k === 'mc') return fmt(q.o[q.a]);
  if (q.k === 'in') return `<code>${esc(q.a[0])}</code>`;
  if (q.k === 'ord') return `<code>${esc(q.a.join(' '))}</code>`;
  return q.pairs.map(p => `${esc(p[0])} = ${esc(p[1])}`).join(', ');
}
function renderLesson() {
  if (L.result) return renderDone();
  const pct = Math.round(L.done / L.total * 100);
  if (L.showTip) {
    const l = L.lesson;
    app().innerHTML = `<div class="lesson u-${l.unit.color}"><div class="l-top"><button class="x" data-act="quit" aria-label="나가기">${icon('x')}</button><div class="bar"><i style="width:0"></i></div></div>
      <div class="l-body"><div class="l-inner tip-page enter">${chick('idle')}<h2>${esc(l.name)}</h2><p class="muted">30초 요약부터 보고 시작하자.</p><ul class="tip-list">${l.tip.map(t => `<li>${fmt(t)}</li>`).join('')}</ul></div></div>
      <div class="l-foot"><div class="foot-in"><button class="btn wide" data-act="tip-go" id="goBtn">문제 풀기</button></div></div></div>`;
    document.getElementById('goBtn').focus();
    return;
  }
  const q = L.queue[0], locked = L.st !== 'ask';
  const foot = locked
    ? `<div class="l-foot fb ${L.st}"><div class="foot-in"><div class="fb-head">${chick(L.st === 'right' ? 'happy' : 'sad')}<div><div class="fb-title">${L.st === 'right' ? (L.mMiss ? '끝까지 맞췄어' : praise()) : '아깝다'}</div>
        <div class="fb-text">${L.st === 'wrong' ? `<div class="fb-ans">정답: ${answerText(q)}</div>` : ''}<div>${fmt(q.e)}</div></div></div></div>
        <div class="foot-row">${L.st === 'wrong' && q.k === 'in' && !L.overridden ? '<button class="link" data-act="override">내 답도 맞아</button>' : ''}<button class="btn ${L.st === 'right' ? 'ok' : 'no'}" data-act="next" id="goBtn">계속</button></div></div></div>`
    : q.k === 'match'
      ? '<div class="l-foot"><div class="foot-in"><p class="muted" style="text-align:center;padding:12px 0">왼쪽과 오른쪽을 눌러 짝을 맞춰.</p></div></div>'
      : `<div class="l-foot"><div class="foot-in"><button class="btn wide" data-act="check" id="checkBtn" ${canCheck(q) ? '' : 'disabled'}>확인</button></div></div>`;
  app().innerHTML = `<div class="lesson"><div class="l-top"><button class="x" data-act="quit" aria-label="나가기">${icon('x')}</button>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="hearts ${L.hit ? 'hit' : ''}" aria-label="하트 ${L.hearts}개">${icon('heart')}${L.hearts}</div></div>
    <div class="l-body"><div class="l-inner ${L.fresh ? 'enter' : ''} ${L.shake ? 'shake' : ''}">${L.isRetry ? '<p class="q-tag">다시 도전</p>' : `<p class="q-tag">${esc(q.lname)}</p>`}${questionHtml(q, locked)}</div></div>${foot}</div>`;
  L.fresh = false; L.hit = false; L.shake = false;
  if (locked) document.getElementById('goBtn')?.focus();
  else if (q.k === 'in') document.getElementById('ans')?.focus();
}
const PRAISE = ['맞았어!', '좋아!', '바로 그거야!', '정확해!', '잘하는데?'];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];
function norm(s, ci) {
  let t = String(s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/;$/, '').trim();
  return ci ? t.toLowerCase() : t;
}
function isRightIn(q, v) { return q.a.some(a => norm(a, q.ci) === norm(v, q.ci)); }
function check() {
  const q = L.queue[0];
  if (L.st !== 'ask' || !canCheck(q)) return;
  let ok = false;
  if (q.k === 'mc') ok = L.sel === q.a;
  if (q.k === 'in') ok = isRightIn(q, L.input);
  if (q.k === 'ord') ok = L.chosen.map(i => L.pool[i].t).join('\u0001') === q.a.join('\u0001');
  settle(q, ok);
}
function settle(q, ok) {
  const first = !L.wrongIds.has(q.id);
  recordSR(q.id, ok);
  if (ok) {
    const gain = first ? 2 : 1;
    L.xp += gain; L.done++; if (first) L.firstTry++;
    addDay(gain, 1);
    L.st = 'right'; beep([660, 880]);
  } else {
    L.wrongIds.add(q.id); L.hearts--; L.hit = true; L.st = 'wrong'; beep([220, 170]);
  }
  save();
  renderLesson();
}
function override() {
  const q = L.queue[0];
  L.hearts++; L.overridden = true; L.done++; L.st = 'right'; L.xp += 1;
  S.q[q.id].wrong = Math.max(0, S.q[q.id].wrong - 1);
  recordSR(q.id, true); addDay(1, 1); L.wrongIds.delete(q.id); save();
  renderLesson();
}
function nextQ() {
  const q = L.queue.shift();
  if (L.st === 'wrong') L.queue.push(prep(byIdFresh(q)));
  if (L.hearts <= 0) { L.result = { fail: true }; return renderLesson(); }
  if (!L.queue.length) return finishLesson();
  setupQ();
  renderLesson();
}
const byIdFresh = q => byId(q.id);
function finishLesson() {
  const perfect = L.wrongIds.size === 0;
  let bonus = L.mode === 'quick' ? 1 : 5;
  if (perfect && L.mode !== 'quick') bonus += 5;
  addDay(bonus, 0); L.xp += bonus;
  if (L.mode === 'lesson') { const r = S.l[L.lesson.id] || { n: 0 }; r.n++; S.l[L.lesson.id] = r; }
  save();
  L.result = { perfect, acc: Math.round(L.firstTry / L.total * 100) };
  beep([523, 659, 784, 1047]);
  renderLesson();
  if (perfect || L.mode === 'lesson') confetti();
}
function renderDone() {
  const r = L.result, l = L.lesson;
  if (r.fail) {
    app().innerHTML = `<div class="lesson"><div class="l-body"><div class="done-page">${chick('sad')}<h1>하트를 다 썼어</h1><p class="muted">틀린 문제는 복습 탭에 넣어 뒀어. 다시 풀면 금방 익숙해져.</p>
      <button class="btn wide" data-act="retry" id="goBtn">다시 도전</button><button class="link" data-act="leave">코스로 돌아가기</button></div></div></div>`;
  } else {
    const d = statsData();
    const title = L.mode === 'quick' ? '오늘 몫 끝!' : L.mode === 'review' ? '복습 끝!' : r.perfect ? '하나도 안 틀렸어!' : '레슨 완료!';
    app().innerHTML = `<div class="lesson"><div class="l-body"><div class="done-page">${chick('happy')}<h1>${title}</h1>
      <div class="tiles"><div class="tile" style="--t:var(--brand-dark)"><b>XP</b><span>+${L.xp}</span></div><div class="tile" style="--t:var(--ok-dark)"><b>한 번에 맞힘</b><span>${r.acc}%</span></div><div class="tile" style="--t:var(--orange-d)"><b>연속</b><span>${d.streak}일</span></div></div>
      <button class="btn wide" data-act="leave" id="goBtn">계속</button></div></div></div>`;
  }
  document.getElementById('goBtn')?.focus();
}
function confetti() {
  const colors = ['#ffc933', '#2c7be0', '#ee7426', '#0d9e9e', '#e04f7d', '#7857e0'];
  for (let i = 0; i < 44; i++) {
    const c = document.createElement('i');
    c.className = 'conf';
    c.style.cssText = `left:${Math.random() * 100}vw;background:${colors[i % 6]};--d:${1.2 + Math.random() * 1.1}s;--x:${(Math.random() - .5) * 140}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * .25}s`;
    document.body.appendChild(c);
    c.addEventListener('animationend', () => c.remove());
  }
}
function beep(seq) {
  if (!S.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    seq.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * .09;
      o.frequency.value = f; o.type = 'triangle';
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .015); g.gain.exponentialRampToValueAtTime(.0001, t + .16);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + .17);
    });
  } catch { /* 소리 없이 진행 */ }
}
function quick() {
  const due = dueQs();
  const cur = currentLesson() || LESSONS[Math.floor(Math.random() * LESSONS.length)];
  const qs = [...due, ...pickFor(cur, 3)].slice(0, 3);
  startSession('quick', qs, cur);
}
function pickMatch(side, i) {
  if (!L.mSel || L.mSel.side === side) { L.mSel = L.mSel && L.mSel.side === side && L.mSel.i === i ? null : { side, i }; return renderLesson(); }
  if (L.mSel.i === i) {
    L.mDone.add(i); L.mSel = null; beep([700]);
    const q = L.queue[0];
    if (L.mDone.size === q.pairs.length) return settleMatch(q);
    return renderLesson();
  }
  const other = L.mSel; L.mSel = null;
  if (!L.mMiss) { L.hearts--; L.hit = true; L.wrongIds.add(L.queue[0].id); }
  L.mMiss++; beep([220, 170]);
  renderLesson();
  [`${side}:${i}`, `${other.side}:${other.i}`].forEach(k => {
    const el = document.querySelector(`[data-m="${k}"]`);
    if (el) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 340); }
  });
}
function settleMatch(q) {
  const clean = !L.mMiss;
  recordSR(q.id, clean);
  const gain = clean ? 2 : 1;
  L.xp += gain; L.done++; if (clean) L.firstTry++;
  addDay(gain, 1); L.st = 'right'; beep([660, 880]); save();
  renderLesson();
}

/* ---------- 모의고사 ---------- */
function toMC(q) {
  if (q.k === 'mc') return prep(q);
  const n = Number(q.a[0]);
  const step = Number.isInteger(n) ? 1 : .5;
  const cand = shuffle([n + step, n + 2 * step, n - step, n + 3 * step, n * 2].filter(x => x >= 0 && x !== n));
  const o = shuffle([n, ...[...new Set(cand)].slice(0, 3)].map(String));
  return { ...q, k: 'mc', o, a: o.indexOf(String(n)) };
}
const isNumIn = q => q.k === 'in' && /^\d+(\.\d+)?$/.test(q.a[0]) && q.c;
function startMock(type) {
  closeSheet();
  let qs = [], mins, name;
  if (type === 'p12') {
    const take = (pre, n) => shuffle(ALL.filter(q => q.k === 'in' && pre.includes(q.lesson.slice(0, 2)))).slice(0, n);
    qs = shuffle([...take(['lx'], 2), ...take(['py'], 4), ...take(['jv'], 3), ...take(['sq'], 3)]);
    mins = 90; name = '실기 필답';
  } else {
    const each = type === 'w60' ? 15 : 5;
    for (const k of Object.keys(SUBJ)) {
      const pool = shuffle(ALL.filter(q => q.subj === k && (q.k === 'mc' || isNumIn(q)))).slice(0, each);
      qs.push(...pool.map(toMC));
    }
    qs = shuffle(qs);
    mins = type === 'w60' ? 60 : 20; name = type === 'w60' ? '필기 실전' : '필기 맛보기';
  }
  E = { type, name, qs, ans: qs.map(() => null), i: 0, endAt: Date.now() + mins * 6e4 };
  E.timer = setInterval(tickExam, 1000);
  renderExam();
}
const isAnswered = v => v !== null && v !== '';
function fmtLeft() {
  const s = Math.max(0, Math.round((E.endAt - Date.now()) / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
function tickExam() {
  if (!E) return;
  const el = document.getElementById('timer');
  if (el) { el.textContent = fmtLeft(); el.classList.toggle('low', E.endAt - Date.now() < 3e5); }
  if (Date.now() >= E.endAt) submitExam();
}
function renderExam() {
  const q = E.qs[E.i], v = E.ans[E.i], n = E.qs.length, ans = E.ans.filter(isAnswered).length;
  const body = q.k === 'mc'
    ? `<div class="opts">${q.o.map((t, i) => `<button class="opt ${v === i ? 'sel' : ''}" data-eopt="${i}"><span class="n">${i + 1}</span><span>${fmt(t)}</span></button>`).join('')}</div>`
    : `<input class="answer" id="eans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="답을 입력해" aria-label="답" value="${esc(v ?? '')}">`;
  app().innerHTML = `<div class="lesson"><div class="l-top"><button class="x" data-act="exam-quit" aria-label="나가기">${icon('x')}</button>
      <div class="bar"><i style="width:${ans / n * 100}%"></i></div><div class="exam-timer" id="timer">${fmtLeft()}</div></div>
    <div class="l-body"><div class="l-inner"><p class="q-tag">${E.i + 1} / ${n} · ${SUBJ[q.subj]}</p><div class="q-text">${fmt(q.q)}</div>${tables(q.tb)}${q.c ? codeBlock(q.c, q.lang) : ''}${body}</div></div>
    <div class="l-foot"><div class="foot-in"><div class="foot-row"><button class="btn ghost" data-act="exam-prev" ${E.i ? '' : 'disabled'}>이전</button><button class="btn ghost" data-act="exam-grid">${ans}/${n}</button>
      ${E.i < n - 1 ? '<button class="btn" data-act="exam-next">다음</button>' : '<button class="btn ok" data-act="exam-submit">제출</button>'}</div></div></div></div>`;
  document.getElementById('eans')?.focus();
  tickExam();
}
function trySubmit() {
  const left = E.ans.filter(v => !isAnswered(v)).length;
  if (left) confirmBox(`${left}문제가 비어 있어`, '빈 문제는 틀린 걸로 쳐. 제출할까?', '제출', '더 풀기', submitExam);
  else submitExam();
}
function submitExam() {
  clearInterval(E.timer);
  closeSheet();
  let right = 0; const by = {}, wrong = [];
  E.qs.forEach((q, i) => {
    const v = E.ans[i], ok = q.k === 'mc' ? v === q.a : isAnswered(v) && isRightIn(q, v);
    (by[q.subj] = by[q.subj] || { r: 0, n: 0 }).n++;
    if (ok) { right++; by[q.subj].r++; } else wrong.push({ q, v });
    recordSR(q.id, ok);
  });
  const score = Math.round(right / E.qs.length * 100);
  S.mocks.push({ d: today(), name: E.name, score, right, n: E.qs.length });
  addDay(Math.min(30, right), right);
  S.tab = 'result';
  S.lastResult = { name: E.name, score, right, n: E.qs.length, by, wrong: wrong.map(w => ({ id: w.q.id, v: w.q.k === 'mc' && w.v !== null ? w.q.o[w.v] : w.v })) };
  save();
  E = null;
  renderApp();
  if (score >= 60) { beep([523, 659, 784, 1047]); confetti(); }
}
function viewResult() {
  const r = S.lastResult;
  if (!r) return viewMock();
  const pass = r.score >= 60;
  return `<div class="result-top">${chick(pass ? 'happy' : 'sad')}<div class="result-score ${pass ? 'pass' : 'fail'}">${r.score}점</div><p class="muted">${esc(r.name)} · ${r.right} / ${r.n} · ${pass ? '60점 넘었어!' : `합격선까지 ${60 - r.score}점`}</p></div>
    <div class="section"><h2>과목별</h2>${Object.entries(r.by).map(([k, v]) => `<div class="sbj"><div class="sbj-top"><span>${SUBJ[k]}</span><span class="muted">${v.r} / ${v.n}</span></div><div class="bar"><i style="width:${v.r / v.n * 100}%"></i></div></div>`).join('')}</div>
    <div class="section"><h2>틀린 문제 ${r.wrong.length}개</h2><p class="note" style="margin-bottom:10px">복습 탭에도 넣어 뒀어.</p>
      ${r.wrong.map(w => { const q = byId(w.id); return `<div class="review-item"><div><b>${fmt(q.q)}</b></div>${tables(q.tb)}${q.c ? codeBlock(q.c, q.lang) : ''}<div class="fail">내 답: ${isAnswered(w.v ?? '') ? fmt(String(w.v)) : '안 씀'}</div><div class="fb-ans">정답: ${answerText(q)}</div><div class="note">${fmt(q.e)}</div></div>`; }).join('') || '<p class="note">없어. 대단한데?</p>'}</div>
    <button class="btn wide" data-tab="mock" style="margin-top:12px">모의고사로 돌아가기</button>`;
}

/* ---------- 입력 ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-lesson],[data-start],[data-tip],[data-act],[data-opt],[data-pick],[data-unpick],[data-m],[data-mock],[data-eopt],[data-goto],[data-goal],[data-sound],[data-color]');
  if (!t) {
    if (e.target.matches('.overlay[data-close]')) closeSheet();
    return;
  }
  const d = t.dataset;
  if (d.tab) { S.tab = d.tab; save(); renderApp(); window.scrollTo(0, 0); return; }
  if (d.lesson) return openSheet({ kind: 'lesson', id: d.lesson });
  if (d.tip) return openSheet({ kind: 'tip', id: d.tip });
  if (d.start) { const l = LESSONS.find(x => x.id === d.start); startSession('lesson', pickFor(l, LESSON_LEN), l); if (sheetTipSeen(d.start)) { L.showTip = false; renderLesson(); } return; }
  if (d.mock) return startMock(d.mock);
  if (d.color !== undefined) { S.profile = { ...S.profile, color: Number(d.color) }; stamp(); save(); return renderApp(); }
  if (d.goal) { S.goal = Number(d.goal); stamp(); save(); return renderApp(); }
  if (d.sound) { S.sound = d.sound === '1'; stamp(); save(); return renderApp(); }
  if (d.opt !== undefined) { if (L.st === 'ask') { L.sel = Number(d.opt); renderLesson(); } return; }
  if (d.pick !== undefined) { L.chosen.push(Number(d.pick)); return renderLesson(); }
  if (d.unpick !== undefined) { L.chosen.splice(Number(d.unpick), 1); return renderLesson(); }
  if (d.m) { const [side, i] = d.m.split(':'); return pickMatch(side, Number(i)); }
  if (d.eopt !== undefined) { E.ans[E.i] = Number(d.eopt); return renderExam(); }
  if (d.goto !== undefined) { E.i = Number(d.goto); closeSheet(); return renderExam(); }
  const acts = {
    quick, check, login,
    guest() { lsSet(GUEST_OK, '1'); renderApp(); },
    logout() { lsDel(GUEST_OK); logout(); },
    'del-cloud'() { confirmBox('서버 기록을 지울까?', '이 계정의 프로필과 학습 기록이 모두 지워지고 되돌릴 수 없어.', '전부 지우기', '취소', deleteCloudData); },
    review() { startSession('review', dueQs().slice(0, 10), null); },
    next: nextQ,
    override,
    'tip-go'() { L.showTip = false; L.fresh = true; renderLesson(); },
    quit() {
      if (L.done === 0 && L.st === 'ask') { L = null; return renderApp(); }
      confirmBox('지금 나갈 거야?', '맞힌 문제의 XP는 남지만 이 레슨은 완료로 안 쳐.', '나가기', '계속 풀기', () => { L = null; closeSheet(); renderApp(); });
    },
    leave() { L = null; S.tab = 'home'; renderApp(); },
    retry() { const m = L.mode, l = L.lesson; const qs = m === 'lesson' ? pickFor(l, LESSON_LEN) : m === 'quick' ? null : dueQs().slice(0, 10); L = null; if (m === 'quick') quick(); else { startSession(m, qs, l); L.showTip = false; renderLesson(); } },
    'confirm-yes'() { const f = confirmFn; confirmFn = null; closeSheet(); f?.(); },
    'confirm-no'() { confirmFn = null; closeSheet(); },
    'exam-prev'() { E.i--; renderExam(); },
    'exam-next'() { E.i++; renderExam(); },
    'exam-grid'() { openSheet({ kind: 'grid' }); },
    'exam-submit'() { closeSheet(); trySubmit(); },
    'exam-quit'() { confirmBox('시험을 그만둘 거야?', '지금까지 푼 답은 저장되지 않아.', '그만두기', '계속 풀기', () => { clearInterval(E.timer); E = null; S.tab = 'mock'; renderApp(); }); },
    export() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' }));
      a.download = `삐약코드_진행_${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    import() { document.getElementById('importFile').click(); },
    reset() { confirmBox('처음부터 다시 할까?', '모든 기록이 지워지고 되돌릴 수 없어. 필요하면 먼저 내보내기를 해 둬.', '전부 지우기', '취소', () => { S = { ...DEF, days: {}, l: {}, q: {}, mocks: [], profile: S.profile, resetAt: Date.now(), setAt: Date.now() }; save(); renderApp(); }); },
  };
  acts[d.act]?.();
});
const sheetTipSeen = () => sheetTipFlag && !(sheetTipFlag = false);
let sheetTipFlag = false;
document.addEventListener('click', e => { if (e.target.closest('[data-tip]')) sheetTipFlag = true; else if (e.target.closest('[data-lesson]')) sheetTipFlag = false; }, true);

document.addEventListener('input', e => {
  if (e.target.id === 'ans') {
    L.input = e.target.value;
    const b = document.getElementById('checkBtn');
    if (b) b.disabled = !canCheck(L.queue[0]);
  }
  if (e.target.id === 'eans') {
    E.ans[E.i] = e.target.value;
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'profileName') { S.profile = { ...S.profile, name: e.target.value.trim() }; stamp(); save(); renderApp(); }
  if (e.target.id === 'examDate') { S.exam = e.target.value; stamp(); save(); renderApp(); }
  if (e.target.id === 'importFile' && e.target.files[0]) {
    e.target.files[0].text().then(txt => {
      const o = JSON.parse(txt);
      if (typeof o.xp !== 'number' || typeof o.days !== 'object') throw new Error('형식 오류');
      S = { ...DEF, ...o, resetAt: Date.now(), setAt: Date.now() }; save(); renderApp();
    }).catch(() => confirmBox('불러오지 못했어', '이 앱에서 내보낸 파일이 맞는지 확인해 줘.', '닫기', '확인', () => {}));
  }
});
document.addEventListener('keydown', e => {
  if (e.isComposing) return;
  if (document.querySelector('.overlay')) {
    if (e.key === 'Escape') { confirmFn = null; closeSheet(); }
    return;
  }
  if (L && !L.result) {
    if (e.key === 'Enter') {
      if (e.target.closest?.('button') && e.target.id !== 'goBtn' && e.target.id !== 'checkBtn') return;
      e.preventDefault();
      if (e.repeat) return;
      if (L.showTip) { L.showTip = false; L.fresh = true; return renderLesson(); }
      if (L.st === 'ask') check(); else nextQ();
      return;
    }
    if (!L.showTip && L.st === 'ask' && L.queue[0]?.k === 'mc' && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < L.queue[0].o.length) { L.sel = i; renderLesson(); }
    }
    return;
  }
  if (E) {
    if (E.qs[E.i].k === 'mc' && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (i < E.qs[E.i].o.length) { E.ans[E.i] = i; renderExam(); }
    }
    if (e.key === 'Enter' && !e.repeat && !e.target.closest?.('button')) {
      e.preventDefault();
      if (E.i < E.qs.length - 1) { E.i++; renderExam(); } else trySubmit();
    }
  }
});
window.addEventListener('beforeunload', e => { if (E) e.preventDefault(); });
window.addEventListener('online', () => { if (UID && cloud.ready) pushCloud(); });

renderApp();
initCloud();
