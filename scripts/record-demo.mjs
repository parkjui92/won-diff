// Optional maintainer script: macOS say (Yuna), ffmpeg, Playwright + Chrome.
// Records the running app. Narration is synthetic; no real person's voice cloned.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const work = resolve('docs/video-work');
await mkdir(work, { recursive: true }); await mkdir('docs/assets', { recursive: true });
const scenes = [
  { title: '한국어 예산표, 실제 금액의 차이만', caption: '단위 환산 → 행 대응 → 변경 근거 확인',
    text: '원디프는 한국어 예산표의 실제 금액 변경을 검토하는 도구입니다. 천 곱하기 백만원은 십억원과 같습니다. 단위만 바뀐 것을 예산이 줄었다고 읽지 않도록, 먼저 원 단위로 맞춥니다.' },
  { title: '실제 KIAT 공개자료로 시작', caption: '2023·2024 결산 / 2024년만 억원으로 환산한 사본',
    text: '공개자료 예제를 누르면, 알리오에 공개된 한국산업기술진흥원의 정부지원수입 표를 불러옵니다. 이천이십삼년과 이천이십사년 결산을 비교합니다. 비교 파일은 같은 원문 값을 억원으로 환산한 사본입니다.' },
  { title: '금액 변경 2건 · 표기 변경 1건', caption: '상세 합계 차액 28.69억원 / 지정 소계와 대조',
    text: '비교 결과 실제 금액이 바뀐 항목은 두 건입니다. 상세 합계의 차이는 이십팔점 육구억원입니다. 지정한 소계와 상세 합산도 맞는지 대조합니다. 사업의 원인이나 정책 성과를 자동으로 추론하지는 않습니다.' },
  { title: '출연금은 줄지 않았습니다', caption: '6,826백만원 = 68.26억원 / 원문 셀과 환산식 보존',
    text: '표기와 단위만 변경된 항목을 고르면 출연금이 남습니다. 육천팔백이십육 백만원과 육십팔점 이육억원은 같습니다. 근거 버튼에서 원래 값, 셀 주소, 환산식과 파일 해시를 확인할 수 있습니다.' },
  { title: '결산과 예산을 섞으면 알립니다', caption: '차액은 산술 비교 / 증감률은 미산출',
    text: '회계 기준을 예산으로 바꾸면 이전 결과를 지우고 재검토를 요구합니다. 결산과 예산처럼 기준이 다를 때는 차액만 제시하고 증감률은 계산하지 않습니다. 이 기준은 사용자가 원문을 확인하고 선택합니다.' },
  { title: '중복 식별자는 조용히 덮어쓰지 않음', caption: '합성 오류 예제 / 비교 중단과 오류 위치 표시',
    text: '이번에는 일부러 같은 식별자를 두 번 넣은 합성 파일입니다. 도구는 뒤의 값으로 덮어쓰지 않고 비교를 중단합니다. 빈 금액과 수식도 확정된 영으로 처리하지 않습니다.' },
  { title: '검토 결과와 근거를 함께 저장', caption: 'CSV · JSON / 오프라인 HTML은 서버 없이 실행',
    text: '정상 예제로 돌아와 결과를 저장합니다. 씨에스브이에는 변경표가, 제이슨에는 설정과 파일 해시를 포함한 검토 근거가 담깁니다. 오프라인 파일은 인터넷 연결 없이 엑셀 파일도 비교합니다. 원본 파일은 수정하지 않습니다.' },
  { title: '차별점도 같은 입력으로 검증', caption: '24개 설계 사례 / 범용 도구도 단위 전처리 후에는 동점',
    text: '기존 공개 도구 세 가지와 같은 스물네 쌍을 비교했습니다. 원디프는 금액이 같은 표현 변경 열 건을 따로 구분했습니다. 기존 도구도 단위를 전처리하면 같은 결과를 냅니다. 환산과 근거 정리를 한 번에 처리하는 것이 이 도구의 장점입니다.' }
];
for (let i = 0; i < scenes.length; i++) {
  const textPath = `${work}/${i}.txt`, audioPath = `${work}/${i}.aiff`;
  await writeFile(textPath, scenes[i].text);
  execFileSync('say', ['-v', 'Yuna', '-r', '190', '-f', textPath, '-o', audioPath]);
  scenes[i].audio = audioPath;
  scenes[i].seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', audioPath], { encoding: 'utf8' }).trim());
}
console.log('Narration seconds:', scenes.map(s => s.seconds.toFixed(1)).join(', '));
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: work, size: { width: 1440, height: 1000 } }, reducedMotion: 'reduce' });
const start = performance.now();
const page = await context.newPage();
// Current Chrome's headless screencast reserves window chrome height even when
// screenshots have the full viewport. Match outer bounds to avoid cropping.
const cdp = await context.newCDPSession(page);
const { windowId } = await cdp.send('Browser.getWindowForTarget');
await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width: 1440, height: 1086 } });
await page.goto(process.env.DEMO_URL ?? 'http://127.0.0.1:4173');
await page.addStyleTag({ content: '#film-caption{position:fixed;z-index:99999;bottom:18px;left:6%;right:6%;background:#073f36f2;color:white;padding:17px 24px;border-radius:10px;box-shadow:0 3px 30px #0003;font-family:"Apple SD Gothic Neo",sans-serif;text-align:center;pointer-events:none}#film-caption b{display:block;font-size:27px;line-height:1.45}#film-caption span{display:block;font-size:18px;opacity:.85;margin-top:4px}html{scroll-behavior:auto!important}' });
async function caption(i) {
  await page.evaluate(({ title, caption }) => {
    let el = document.getElementById('film-caption');
    if (!el) { el = document.createElement('div'); el.id = 'film-caption'; document.body.append(el); }
    el.replaceChildren();
    const titleEl = document.createElement('b'), sub = document.createElement('span');
    titleEl.textContent = title; sub.textContent = caption; el.append(titleEl, sub);
  }, scenes[i]);
  scenes[i].start = (performance.now() - start) / 1000;
  await page.waitForTimeout((scenes[i].seconds + 1.2) * 1000);
  console.log(`Recorded scene ${i + 1}/${scenes.length}`);
}
await caption(0);
await page.getByRole('button', { name: 'KIAT 공개자료로 살펴보기' }).click();
await page.locator('#panels').evaluate(el => el.scrollIntoView({ block: 'start' }));
await caption(1);
await page.getByRole('button', { name: '변경사항 검토하기' }).click();
await page.locator('#results').evaluate(el => el.scrollIntoView({ block: 'start' }));
await page.screenshot({ path: 'docs/assets/demo-cover.png' });
await caption(2);
await page.getByRole('button', { name: '표기·단위만 변경 1', exact: true }).click();
await page.getByRole('button', { name: '출연금 근거' }).click();
// Dialog's top layer is above ordinary overlays; attach caption inside it temporarily.
await page.evaluate(() => document.getElementById('detail').append(document.getElementById('film-caption')));
await caption(3);
await page.evaluate(() => document.body.append(document.getElementById('film-caption')));
await page.getByRole('button', { name: '닫기', exact: true }).click();
await page.locator('#after').getByLabel('회계 기준').selectOption('budget');
await page.getByRole('button', { name: '변경사항 검토하기' }).click();
await page.locator('#results').evaluate(el => el.scrollIntoView({ block: 'start' }));
await caption(4);
await page.locator('#before input[type=file]').setInputFiles({ name: '중복키_합성검증.csv', mimeType: 'text/csv', buffer: Buffer.from('항목,금액\n출연금,100\n출연금,200') });
await page.getByRole('button', { name: '변경사항 검토하기' }).click();
await page.locator('#results').evaluate(el => el.scrollIntoView({ block: 'start' }));
await caption(5);
await page.getByRole('button', { name: 'KIAT 공개자료로 살펴보기' }).click();
await page.getByRole('button', { name: '변경사항 검토하기' }).click();
await page.locator('#results').evaluate(el => el.scrollIntoView({ block: 'start' }));
const downloadEvent = page.waitForEvent('download');
await page.getByRole('button', { name: '근거 JSON' }).click();
await (await downloadEvent).saveAs(`${work}/recorded-evidence.json`);
await caption(6);
await caption(7);
await page.evaluate(() => document.getElementById('film-caption').remove());
await page.screenshot({ path: 'docs/assets/screenshot.png' });
const video = page.video();
await page.close(); await context.close(); await browser.close();
await copyFile(await video.path(), `${work}/screen.webm`);
await writeFile(`${work}/timeline.json`, JSON.stringify(scenes, null, 2));
const inputs = scenes.flatMap(s => ['-i', s.audio]);
const filter = scenes.map((s, i) => `[${i + 1}:a]adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`).join(';') + ';' +
  scenes.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${scenes.length}:normalize=0[a]`;
execFileSync('ffmpeg', ['-y', '-i', `${work}/screen.webm`, ...inputs, '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', 'docs/assets/demo-ko.mp4'], { stdio: 'ignore' });
console.log('Created docs/assets/demo-ko.mp4');
