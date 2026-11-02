// src 파일들을 HTML 하나로 묶는다. 실행: node build.js
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const safe = s => s.replace(/<\/script/gi, '<\\/script');
const questions = read('questions.js').replace(/if \(typeof module[^\n]*\n/, '');
const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>삐약코드</title>
<meta name="description" content="프로그래밍기능사 필기·실기를 게임처럼 공부하는 개인 학습 앱">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 110 110'><ellipse cx='55' cy='56' rx='36' ry='43' fill='%23ffc933'/><circle cx='44' cy='44' r='5' fill='%232b2100'/><circle cx='66' cy='44' r='5' fill='%232b2100'/><path d='M47 53q8-5 16 0-8 10-16 0' fill='%23ef8a1d'/></svg>">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>
${read('style.css')}
</style>
</head>
<body>
<div id="app"></div>
<script>
${safe(questions)}
${safe(read('app.js'))}
</script>
</body>
</html>
`;
const out = path.join(__dirname, '..', 'index.html');
fs.writeFileSync(out, html);
console.log('완성:', out, Math.round(html.length / 1024) + 'KB');
