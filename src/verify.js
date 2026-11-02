// 실행할 수 있는 문제(Python, JS, SQL)의 정답을 실제로 돌려서 확인한다.
const { UNITS } = require('./questions.js');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const norm = s => String(s).trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',');
let n = 0, bad = 0;
const stat = {}, kinds = {};
for (const u of UNITS) for (const l of u.lessons) {
  l.qs.forEach((q, i) => {
    stat[u.subj] = stat[u.subj] || { mc: 0, numIn: 0, all: 0 };
    stat[u.subj].all++;
    if (q.k === 'mc') stat[u.subj].mc++;
    if (q.k === 'in' && /^-?\d+(\.\d+)?$/.test(q.a[0])) stat[u.subj].numIn++;
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
console.log(`실행 검증 ${n}문제, 문제 ${bad}건`);
console.log('과목별', JSON.stringify(stat), '유형', JSON.stringify(kinds));
