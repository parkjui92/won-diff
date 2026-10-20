import { readFile, writeFile, mkdir } from 'node:fs/promises';
const scenes = JSON.parse(await readFile('docs/video-work/timeline.json', 'utf8'));
const stamp = seconds => {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
};
const chapter = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
let vtt = 'WEBVTT\n\n';
for (const scene of scenes) {
  const sentences = scene.text.match(/[^.]+[.]?/g).map(s => s.trim()).filter(Boolean);
  const length = sentences.reduce((n, s) => n + s.length, 0);
  let cursor = scene.start;
  for (const line of sentences) {
    const end = cursor + scene.seconds * line.length / length;
    vtt += `${stamp(cursor)} --> ${stamp(end)}\n${line}\n\n`;
    cursor = end;
  }
}
await writeFile('docs/assets/demo-ko.vtt', vtt.trimEnd() + '\n');
await writeFile('docs/VIDEO.md', `# 한국어 설명 영상

[영상 재생](https://parkjui92.github.io/won-diff/demo.html) · [MP4](assets/demo-ko.mp4) · [한국어 자막](assets/demo-ko.vtt)

약 1분 59초. 실제 Chrome 화면을 조작해 녹화한 1440×1000 H.264/AAC 영상입니다.
한국어 내레이션은 macOS Yuna 합성 음성입니다. 화면 요약 자막과 별도의 전체 음성 자막을 제공합니다.
자막 문장별 시점은 장면 안에서 길이에 따라 배분한 근사값입니다.

${scenes.map(s => `## ${chapter(s.start)} ${s.title}\n\n${s.text}`).join('\n\n')}

## 재제작

macOS의 \`say -v Yuna\`, ffmpeg/ffprobe, Chrome이 필요합니다. 먼저 앱을 4173 포트에서 실행합니다.

\`\`\`bash
node scripts/record-demo.mjs
node scripts/build-video-docs.mjs
npm run build
\`\`\`

촬영 중간 파일은 \`docs/video-work/\`에만 저장하며 Git에서는 제외합니다. 배포 파일은
\`docs/assets/\`에 저장합니다. 개인정보나 실제 내부 파일을 사용하지 않습니다.
영상의 오류 예제는 합성 데이터이며 실제 KIAT 공시의 오류를 의미하지 않습니다.
`);
await mkdir('public', { recursive: true });
await writeFile('public/demo.html', `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'">
<title>won-diff · 한국어 설명 영상</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f4f5ef;color:#173a33;font:17px/1.8 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:40px 24px}a{color:#06735b;text-underline-offset:4px}nav{display:flex;justify-content:space-between;gap:16px}h1{font-size:clamp(30px,5vw,46px);line-height:1.3;margin:48px 0 16px}.sub{color:#536962}video{display:block;width:100%;max-height:78vh;background:#172923;border-radius:12px;margin:28px 0 16px}article{margin-top:38px;padding:24px 32px;background:#fff;border:1px solid #d7e0d7;border-radius:14px}article h2{font-size:21px;margin:0}article p{margin-bottom:0}.meta{font-size:14px;color:#536962}footer{margin-top:40px;font-size:14px}a:focus-visible,video:focus-visible{outline:3px solid #9c6815;outline-offset:4px}</style>
</head><body><main>
<nav><a href="./">₩ won-diff 실행하기</a><a href="https://github.com/parkjui92/won-diff">GitHub 소스·검증 기록 ↗</a></nav>
<h1>한국어 예산표의 차이,<br>근거까지 확인하는 2분</h1>
<p class="sub">KIAT 공개자료 비교부터 단위 환산, 기준 경고, 결과 저장까지 실제 화면으로 설명합니다.</p>
<video controls preload="metadata" poster="./media/screenshot.png"><source src="./media/demo-ko.mp4" type="video/mp4"><track kind="captions" src="./media/demo-ko.vtt" srclang="ko" label="한국어 전체 음성 자막"><p><a href="./media/demo-ko.mp4">MP4 다운로드</a></p></video>
<p class="meta">1분 59초 · 한국어 합성 음성(Yuna) · 화면 요약 자막 · CC에서 전체 자막 선택</p>
<p><a href="./media/demo-ko.mp4" download>영상 내려받기</a> · <a href="./won-diff.html" download>오프라인 도구 내려받기</a></p>
${scenes.map(s => `<article><h2>${chapter(s.start)} · ${escape(s.title)}</h2><p>${escape(s.text)}</p></article>`).join('\n')}
<footer>개인 개발 도구이며 KIAT의 공식 서비스가 아닙니다. 공시 수치의 발췌·환산 과정과 검증 한계는 GitHub에 공개했습니다.</footer>
</main></body></html>`);
console.log('Created transcript, WebVTT captions, and public video page');
