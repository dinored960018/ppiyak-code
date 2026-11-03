// 실행할 수 있는 문제(Python, JS, SQL)의 정답을 실제로 돌려서 확인한다.
const { UNITS } = require('./questions.js');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const norm = s => String(s).trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',');
let n = 0, bad = 0;
const stat = {}, kinds = {};
for (const u of UNITS) for (const l of u.lessons) {
  const subj = l.subj || u.subj;
  l.qs.forEach((q, i) => {
    stat[subj] = stat[subj] || { mc: 0, numIn: 0, all: 0 };
    stat[subj].all++;
    if (q.k === 'mc') stat[subj].mc++;
    if (q.k === 'in' && /^-?\d+(\.\d+)?$/.test(q.a[0])) stat[subj].numIn++;
    kinds[q.k] = (kinds[q.k] || 0) + 1;
    if (q.k === 'mc' && (q.a < 0 || q.a >= q.o.length || new Set(q.o).size !== q.o.length)) { bad++; console.log('객관식 오류', l.id, i); }
    if (q.k === 'match' && new Set(q.pairs.map(p => p[1])).size !== q.pairs.length) { bad++; console.log('짝 중복', l.id, i); }
    const expected = q.k === 'mc' ? q.o[q.a] : q.a && q.a[0];
    let got;
    if (q.lang === 'sql' && q.tb && (q.run || /행 수/.test(q.q))) {
      const db = new DatabaseSync(':memory:');
      for (const t of q.tb) {
        db.exec(`CREATE TABLE ${t.n} (${t.h.join(',')})`);
        const st = db.prepare(`INSERT INTO ${t.n} VALUES (${t.h.map(() => '?').join(',')})`);
        t.r.forEach(r => st.run(...r));
      }
      const rows = db.prepare(q.c).all();
      got = /행 수/.test(q.q) ? String(rows.length) : rows.map(r => Object.values(r).join(' ')).join(' ');
    } else if (q.run && q.lang === 'python') {
      const r = spawnSync('py', ['-c', q.c], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      got = r.stdout + (r.status ? ' ERR ' + r.stderr : '');
    } else if (q.run && q.lang === 'js') {
      const r = spawnSync('node', ['-e', q.c], { encoding: 'utf8' });
      got = r.stdout + (r.status ? ' ERR ' + r.stderr : '');
    } else return;
    n++;
    if (norm(got) !== norm(expected)) { bad++; console.log(`틀림 ${l.id}#${i}\n  코드: ${q.c}\n  적힌 답: ${expected}\n  실제: ${got}`); }
  });
}
// 설명 화면의 예제도 같은 방식으로 돌려 본다.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, 'learn');
const LEARN = new Function(fs.readFileSync(path.join(__dirname, 'questions.js'), 'utf8') + fs.readdirSync(dir).sort().map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + '\nreturn LEARN;')();
let ln = 0, skipped = 0;
for (const u of UNITS) for (const l of u.lessons) {
  if (!LEARN[l.id]?.length) { bad++; console.log('설명 없음', l.id); continue; }
  for (const page of LEARN[l.id]) for (const b of page) {
    if (!b || b.out === undefined) continue;
    let got;
    if (b.lang === 'sql') {
      const db = new DatabaseSync(':memory:');
      for (const t of b.tb) {
        db.exec(`CREATE TABLE ${t.n} (${t.h.join(',')})`);
        const st = db.prepare(`INSERT INTO ${t.n} VALUES (${t.h.map(() => '?').join(',')})`);
        t.r.forEach(r => st.run(...r));
      }
      got = db.prepare(b.c).all().map(r => Object.values(r).map(x => x === null ? 'NULL' : x).join(' ')).join(' ');
    } else if (b.lang === 'python' || b.lang === 'js') {
      const r = b.lang === 'python' ? spawnSync('py', ['-c', b.c], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }) : spawnSync('node', ['-e', b.c], { encoding: 'utf8' });
      got = r.stdout + (r.status ? ' ERR ' + r.stderr : '');
    } else { skipped++; continue; }
    ln++;
    if (norm(got) !== norm(b.out)) { bad++; console.log(`설명 예제 틀림 ${l.id} "${page[0]}"\n  코드: ${b.c}\n  적힌 결과: ${b.out}\n  실제: ${got}`); }
  }
}
console.log(`설명 예제 실행 ${ln}개, 컴파일러가 없어 못 돌린 Java·C ${skipped}개`);
console.log(`실행 검증 ${n}문제, 문제 ${bad}건`);
console.log('과목별', JSON.stringify(stat), '유형', JSON.stringify(kinds));
