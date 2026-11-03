// 레슨 설명. 한 장은 [제목, 내용...] 이고, 내용은 문장 또는 코드·표다.
const LEARN = {};
const lpy = (c, out) => ({ c, out, lang: 'python' });
const ljv = (c, out) => ({ c, out, lang: 'java' });
const lc = (c, out) => ({ c, out, lang: 'c' });
const ljs = (c, out) => ({ c, out, lang: 'js' });
const lsq = (c, out, tb) => ({ c, out, lang: 'sql', tb });
const lcmd = c => ({ c, lang: 'sh' });
const ltb = (h, ...r) => ({ tb: [{ n: '', h, r }] });
