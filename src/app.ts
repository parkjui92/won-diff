import './style.css';
import { compare, keyId } from './compare';
import { formatWon, UNITS, type Unit } from './money';
import { makeTable, readSource } from './input';
import { reportCSV, reportJSON, STATUS } from './export';
import type { Entry, Report, Selection, Source, Table } from './types';
import { demoFiles, demoSettings } from './demo';

type Side = 'before' | 'after';
type Panel = { source?: Source; table?: Table; sheet: string; header: number; selection: Selection; error: string; loading: boolean; generation: number };
const fresh = (): Panel => ({ sheet: '', header: 1, selection: { keys: [], amount: '', unit: '백만원', basis: 'unknown', period: '' }, error: '', loading: false, generation: 0 });
const panels = { before: fresh(), after: fresh() };
let report: Report | undefined, statusFilter = 'all', query = '', displayUnit: Unit = '억원';
const escape = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const options = (items: [string, string][], value: string) => items.map(([v, l]) => `<option value="${escape(v)}"${v === value ? ' selected' : ''}>${escape(l)}</option>`).join('');
const basisOptions: [string, string][] = [['unknown', '미확인'], ['budget', '예산'], ['settlement', '결산'], ['proposal', '예산안'], ['other', '기타']];
const unitOptions: [string, string][] = Object.keys(UNITS).map(u => [u, u]);
function mapping(side: Side) {
  const p = panels[side], s = p.selection;
  if (!p.source) return '';
  const hs = p.table?.headers.map(h => [h, h] as [string, string]) ?? [];
  const totalOptions: [string, string][] = [['', '지정 안 함']];
  if (p.table && s.keys.length) {
    for (const row of p.table.rows) {
      const key = s.keys.map(k => (row[p.table!.headers.indexOf(k)]?.text ?? '').normalize('NFC').trim());
      if (key.some(k => /합계|총계|소계|total/i.test(k)) || p.table.rows.length <= 100) totalOptions.push([keyId(key), key.join(' / ')]);
    }
  }
  return `<div class="mapping">
    <div class="fields"><label>시트<select data-field="sheet">${options(p.source.sheets.map(sh => [sh.name, sh.name]), p.sheet)}</select></label>
    <label>제목 행<input data-field="header" type="number" min="1" max="100" value="${p.header}"></label></div>
    ${p.table ? `<div class="fields"><label>식별 열<select data-field="key">${options(hs, s.keys[0] ?? '')}</select></label>
    <label>추가 식별 열 <span class="muted">선택</span><select data-field="key2">${options([['', '사용 안 함'], ...hs.filter(([h]) => h !== s.keys[0])], s.keys[1] ?? '')}</select></label></div>
    <div class="fields"><label>금액 열<select data-field="amount">${options(hs, s.amount)}</select></label>
    <label>숫자만 있는 셀의 단위<select data-field="unit">${options([...unitOptions, ['cell', '셀마다 단위 표기']], s.unit)}</select></label></div>
    <div class="fields"><label>회계 기준<select data-field="basis">${options(basisOptions, s.basis)}</select></label>
    <label>기준 시점<input data-field="period" placeholder="예: 2024 결산" value="${escape(s.period)}" maxlength="100"></label></div>
    <label>상세 합계와 대조할 행<select data-field="totalKey">${options(totalOptions, s.totalKey ? keyId(s.totalKey) : '')}</select></label>
    <p class="micro">${p.table.rows.length.toLocaleString()}행 · ${p.table.headers.length}열 · 식별자는 공백을 다듬고 정확히 대응 · 셀에 적힌 단위 우선</p>
    <details><summary>원본 미리보기</summary><div class="table-scroll"><table class="preview"><thead><tr>${p.table.headers.map(h => `<th>${escape(h)}</th>`).join('')}</tr></thead><tbody>${p.table.rows.slice(0, 4).map(r => `<tr>${r.map(c => `<td>${escape(c.text)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : ''}
  </div>`;
}
function panel(side: Side) {
  const p = panels[side], title = side === 'before' ? '기준 파일' : '비교 파일';
  return `<section class="file-panel" id="${side}" aria-label="${title}">
    <div class="panel-title"><span class="step">${side === 'before' ? '01' : '02'}</span><h2>${title}</h2><span class="file-state">${p.source ? '불러옴' : '대기'}</span></div>
    <label class="upload ${p.source ? 'loaded' : ''}">
      <span class="upload-icon">${p.source ? '↳' : '+'}</span><strong>${escape(p.loading ? '파일을 읽고 있습니다…' : p.source?.name ?? '파일을 놓거나 선택하세요')}</strong>
      <span>CSV · TSV · XLSX / 최대 5MB</span><input aria-label="${title} 선택" type="file" accept=".csv,.tsv,.xlsx,.txt" ${p.loading ? 'disabled' : ''}>
    </label>
    ${p.error ? `<p class="error" role="alert">${escape(p.error)}</p>` : ''}
    ${mapping(side)}
  </section>`;
}
function shell() {
  $('#app').innerHTML = `<header class="site-header"><a href="./" class="brand"><span class="brand-mark">₩</span>won-diff<span class="brand-note">예산표 변경 검토</span></a><a href="https://github.com/parkjui92/won-diff" target="_blank" rel="noopener">GitHub ↗</a></header>
  <main>
    <section class="hero"><div><p class="eyebrow">표를 읽기 전에, 단위부터 맞추세요</p><h1>달라진 숫자,<br><span>실제 금액도 달라졌을까요?</span></h1><p class="hero-copy">두 예산표의 행과 단위를 맞춰 금액 변경을 가려냅니다.<br>변경 근거는 원본 셀까지 따라갈 수 있습니다.</p></div>
    <div class="example"><span class="example-label">이 두 금액은 같습니다</span><div>1,000 <small>백만원</small></div><span class="equals">=</span><div>10 <small>억원</small></div><span class="tag representation">표기·단위만 변경</span></div></section>
    <div class="workspace-heading"><div><h2>비교할 표 준비</h2><p>같은 대상을 식별하는 열과 금액 열을 선택하세요. 합계·소계가 겹치지 않는 평면 표를 사용합니다.</p></div><button id="demo" class="secondary">KIAT 공개자료로 살펴보기 ↗</button></div>
    <div class="privacy-bar"><span class="dot"></span>파일은 이 브라우저 안에서 처리됩니다. 서버 전송·AI 호출·자동 저장이 없습니다.<label>CSV 인코딩<select id="encoding"><option value="utf-8">UTF-8</option><option value="euc-kr">EUC-KR / CP949</option></select></label></div>
    <div id="demo-note" class="sample-note" hidden></div>
    <div id="panels" class="panels">${panel('before')}${panel('after')}</div>
    <div class="compare-bar"><p>빈칸·대시는 0이 아닙니다. 수식 셀은 값으로 확정한 파일을 사용하세요.</p><button id="compare" class="primary" disabled>변경사항 검토하기 <span>→</span></button></div>
    <section id="results" aria-live="polite"><div class="empty"><span>↔</span><h2>비교 결과가 여기에 표시됩니다</h2><p>파일 두 개를 고르거나 공개자료 예제를 불러오세요.</p></div></section>
    <section class="principles"><div><b>01 / 원 단위로 환산</b><p>원·천원·만원·백만원·억원·조원을 맞춥니다. 소수 계산도 원래 자릿수를 보존합니다.</p></div><div><b>02 / 확인할 것은 남김</b><p>중복 식별자는 비교를 중단합니다. 결측·수식·다른 회계 기준은 검토 항목으로 남깁니다.</p></div><div><b>03 / 근거와 함께 저장</b><p>CSV와 JSON에 원문, 셀 위치, 파일 해시, 비교 설정을 담아 재검토할 수 있습니다.</p></div></section>
  </main><footer><span>won-diff · 박주이 · MIT</span><span>평면 금액표의 산술 비교 도구 · 회계 판단과 증감 원인 분석은 담당자 검토</span></footer>
  <dialog id="detail"><div id="detail-content"></div><button id="close-detail" class="secondary">닫기</button></dialog>`;
  $('#demo').addEventListener('click', loadDemo);
  $('#compare').addEventListener('click', run);
  $('#panels').addEventListener('change', onPanelChange);
  $('#panels').addEventListener('input', e => {
    const el = e.target as HTMLInputElement;
    if (el.dataset.field === 'period') {
      const side = el.closest('section')!.id as Side;
      panels[side].selection.period = el.value; invalidate();
    }
  });
  $('#close-detail').addEventListener('click', () => $<HTMLDialogElement>('#detail').close());
  $('#detail').addEventListener('click', e => { if (e.target === $('#detail')) $<HTMLDialogElement>('#detail').close(); });
  for (const side of ['before', 'after'] as Side[]) bindDrop(side);
}
function bindDrop(side: Side) {
  const p = $(`#${side}`);
  p.addEventListener('dragover', e => { e.preventDefault(); p.classList.add('dragging'); });
  p.addEventListener('dragleave', () => p.classList.remove('dragging'));
  p.addEventListener('drop', e => {
    e.preventDefault(); p.classList.remove('dragging');
    const files = e.dataTransfer?.files;
    if (files?.length === 1) void loadFile(side, files[0]);
  });
}
function redraw(side: Side) {
  $(`#${side}`).outerHTML = panel(side); bindDrop(side);
  $<HTMLButtonElement>('#compare').disabled = !panels.before.table || !panels.after.table || panels.before.loading || panels.after.loading;
}
function invalidate() {
  if (!report) return;
  report = undefined;
  $('#results').innerHTML = '<div class="empty"><h2>입력이 바뀌었습니다. 다시 비교하세요.</h2></div>';
}
function refreshTable(side: Side, reset = false) {
  const p = panels[side];
  try {
    p.table = makeTable(p.source!, p.sheet, p.header); p.error = '';
    if (reset) {
      p.selection.keys = [p.table.headers[0]];
      p.selection.amount = p.table.headers.find(h => /금액|예산|결산/.test(h)) ?? p.table.headers[1] ?? '';
      p.selection.totalKey = undefined;
      p.selection.unit = '백만원';
    }
  } catch (e) { p.table = undefined; p.error = (e as Error).message; }
}
async function loadFile(side: Side, file: File) {
  const p = panels[side], generation = ++p.generation;
  invalidate(); p.loading = true; p.error = ''; p.source = undefined; p.table = undefined; redraw(side);
  $('#demo-note').hidden = true;
  try {
    const encoding = $<HTMLSelectElement>('#encoding').value as 'utf-8' | 'euc-kr';
    const source = await readSource(file.name, new Uint8Array(await file.arrayBuffer()), encoding);
    if (generation !== p.generation) return;
    p.source = source; p.sheet = source.sheets[0].name; p.header = 1; p.selection = fresh().selection;
    refreshTable(side, true);
  } catch (e) { if (generation === p.generation) p.error = `읽기 실패: ${(e as Error).message}${(e as Error).name === 'TypeError' ? ' CSV 한글이 깨지면 인코딩을 바꾸고 다시 선택하세요.' : ''}`; }
  finally { if (generation === p.generation) { p.loading = false; redraw(side); } }
}
async function loadDemo() {
  invalidate();
  for (const side of ['before', 'after'] as Side[]) {
    const p = panels[side]; p.generation++;
    p.source = await readSource(side === 'before' ? 'KIAT_2023_결산_백만원.csv' : 'KIAT_2024_결산_억원.csv', new TextEncoder().encode(demoFiles[side]));
    p.sheet = 'CSV'; p.header = 1; p.loading = false;
    refreshTable(side, true); p.selection = structuredClone(demoSettings[side]); redraw(side);
  }
  $('#demo-note').hidden = false;
  $('#demo-note').innerHTML = `공개자료 예제: <a href="https://alio.go.kr/upload/disclosure/2025/04/10/2025041002977191/doc.html" target="_blank" rel="noopener">KIAT ALIO 2025년 1분기 공시 ↗</a>의 정부지원수입 3개 항목과 소계. 2023·2024 결산을 비교하며, 2024년 값만 억원으로 정확히 환산한 사본입니다. 공시 오류를 가정한 자료가 아닙니다.`;
}
function onPanelChange(event: Event) {
  const el = event.target as HTMLInputElement, side = el.closest('section')?.id as Side;
  if (!side) return;
  if (el.type === 'file') { if (el.files?.[0]) void loadFile(side, el.files[0]); return; }
  const field = el.dataset.field, p = panels[side]; if (!field) return;
  invalidate();
  if (field === 'sheet') { p.sheet = el.value; refreshTable(side, true); }
  else if (field === 'header') { p.header = Number(el.value); refreshTable(side, true); }
  else if (field === 'key') { p.selection.keys = [el.value]; p.selection.totalKey = undefined; }
  else if (field === 'key2') { p.selection.keys = [p.selection.keys[0], ...(el.value ? [el.value] : [])]; p.selection.totalKey = undefined; }
  else if (field === 'totalKey') p.selection.totalKey = el.value ? JSON.parse(el.value) : undefined;
  else if (field === 'amount') p.selection.amount = el.value;
  else if (field === 'unit') p.selection.unit = el.value as Selection['unit'];
  else if (field === 'basis') p.selection.basis = el.value as Selection['basis'];
  else if (field === 'period') p.selection.period = el.value;
  redraw(side);
}
function run() {
  if (!panels.before.table || !panels.after.table) return;
  report = compare(panels.before.table, panels.after.table, structuredClone(panels.before.selection), structuredClone(panels.after.selection));
  statusFilter = 'all'; query = ''; renderResults();
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderResults() {
  if (!report) return;
  const r = report, counts = r.summary.counts;
  const totalCard = (side: Side) => {
    const sum = r.summary[side], control = sum.control;
    return `<div><span>${side === 'before' ? '기준' : '비교'} 상세 ${sum.complete ? '합계' : '확인된 금액 소계'}</span><strong>${formatWon(sum.knownSumWon, displayUnit)}<small>${displayUnit}</small></strong><p>${sum.detailRows}개 상세행${sum.unresolvedRows ? ` · 미확정 ${sum.unresolvedRows}행` : ''} · ${control ? control.matches === true ? '지정 합계와 일치' : control.matches === false ? '지정 합계와 불일치' : '합계 판정 보류' : '대조할 합계 미지정'}</p></div>`;
  };
  $('#results').innerHTML = `<div class="result-header"><div><p class="eyebrow">REVIEW / 검토 결과</p><h2>${r.valid ? '숫자가 바뀐 이유를 구분했습니다' : '입력을 확인한 뒤 다시 비교하세요'}</h2></div><div class="exports"><button id="csv" class="secondary" ${r.valid ? '' : 'disabled'}>변경표 CSV ↓</button><button id="json" class="secondary">근거 JSON ↓</button></div></div>
    ${r.issues.length ? `<details class="issues" open><summary>검토 항목 ${r.issues.length}건${!r.valid ? ' · 비교 중단' : ''}</summary><ul>${r.issues.slice(0, 100).map(i => `<li class="${i.blocking ? 'blocking' : ''}"><b>${i.side === 'before' ? '기준' : i.side === 'after' ? '비교' : '공통'}${i.ref ? ` / ${escape(i.ref)}` : ''}</b> ${escape(i.message)}</li>`).join('')}${r.issues.length > 100 ? '<li>나머지 항목은 근거 JSON에 모두 포함됩니다.</li>' : ''}</ul></details>` : ''}
    ${r.valid ? `<div class="summary-grid">${totalCard('before')}${totalCard('after')}<div><span>${r.basisComparable ? '상세 합계 차액' : '산술 차액 · 기준 다름'}</span><strong>${r.summary.netDeltaWon === undefined ? '미확정' : formatWon(r.summary.netDeltaWon, displayUnit)}<small>${r.summary.netDeltaWon === undefined ? '' : displayUnit}</small></strong><p>${r.summary.netDeltaWon === undefined ? '미확정 금액을 제외한 전체 차액은 계산하지 않음' : '추가·삭제 포함 · 지정 합계 행 제외'}</p></div></div>
    <div class="filter-row"><div class="tabs" role="group" aria-label="판정 필터">${[['all', '전체', r.changes.length], ...Object.entries(STATUS).map(([key, text]) => [key, text, counts[key as keyof typeof counts]])].map(([key, text, n]) => `<button data-filter="${key}" aria-label="${text} ${n}" aria-pressed="${statusFilter === key}" class="${statusFilter === key ? 'active' : ''}">${text}<span>${n}</span></button>`).join('')}</div>
    <div class="result-tools"><input id="search" type="search" aria-label="식별자 검색" placeholder="식별자 검색" value="${escape(query)}"><label>표시 단위<select id="display-unit">${options(unitOptions, displayUnit)}</select></label></div></div>
    <div id="change-table"></div><p class="micro">금액·표기 변경만 비교합니다. 설명 열의 변경은 비교 대상이 아닙니다. 행의 “근거”에서 원본 값과 환산식을 확인하세요.</p>` : ''}
  `;
  $('#json').addEventListener('click', () => download('won-diff-evidence.json', reportJSON(r), 'application/json'));
  $('#csv').addEventListener('click', () => download('won-diff-changes.csv', reportCSV(r), 'text/csv;charset=utf-8'));
  if (!r.valid) return;
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(btn => btn.addEventListener('click', () => { statusFilter = btn.dataset.filter!; renderResults(); }));
  $('#search').addEventListener('input', () => { query = $<HTMLInputElement>('#search').value; renderRows(); });
  $('#display-unit').addEventListener('change', () => { displayUnit = $<HTMLSelectElement>('#display-unit').value as Unit; renderResults(); });
  renderRows();
}
function renderRows() {
  const all = report!.changes.map((c, i) => ({ c, i })).filter(({ c }) => (statusFilter === 'all' || c.status === statusFilter) && c.key.join(' / ').toLowerCase().includes(query.toLowerCase()));
  const amount = (entry: Entry | undefined) => entry?.money.kind === 'value' ? formatWon(entry.money.won, displayUnit) : entry ? '미확정' : '—';
  $('#change-table').innerHTML = `<p class="micro">${all.length}건${all.length > 300 ? ' 중 처음 300건 표시 · 전체는 다운로드' : ''}</p><div class="table-scroll"><table class="changes"><thead><tr><th>식별자</th><th>판정</th><th class="number">기준 (${displayUnit})</th><th class="number">비교 (${displayUnit})</th><th class="number">차액 (${displayUnit})</th><th class="number">증감률</th><th>확인</th></tr></thead><tbody>${all.slice(0, 300).map(({ c, i }) => `<tr><td class="key">${escape(c.key.join(' / '))}</td><td><span class="tag ${c.status}">${STATUS[c.status]}</span></td><td class="number">${amount(c.before)}</td><td class="number">${amount(c.after)}</td><td class="number delta">${c.deltaWon !== undefined ? formatWon(c.deltaWon, displayUnit) : '—'}</td><td class="number">${c.percent !== undefined ? c.percent + '%' : '—'}</td><td><button class="evidence" data-evidence="${i}" aria-label="${escape(c.key.join(' / '))} 근거">근거 ↗</button></td></tr>`).join('') || '<tr><td colspan="7">조건에 맞는 항목이 없습니다.</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-evidence]').forEach(button => button.addEventListener('click', () => showDetail(Number(button.dataset.evidence))));
}
function showDetail(index: number) {
  const c = report!.changes[index];
  $('#detail-content').innerHTML = `<p class="eyebrow">CELL EVIDENCE / 셀 근거</p><h2>${escape(c.key.join(' / '))}</h2><span class="tag ${c.status}">${STATUS[c.status]}</span>${(['before', 'after'] as Side[]).map(side => {
    const entry = c[side];
    return `<section><h3>${side === 'before' ? '기준' : '비교'} · ${escape(report!.sources[side].source)}</h3>${entry ? `<dl><dt>원본 위치</dt><dd>${escape(entry.ref)}</dd><dt>원래 표기</dt><dd>${escape(entry.raw || '(빈칸)')}</dd><dt>환산 근거</dt><dd>${escape(entry.money.kind === 'value' ? entry.money.expression : entry.money.reason)}</dd>${entry.money.kind === 'value' ? `<dt>원 단위 값</dt><dd>${formatWon(entry.money.won, '원')}원</dd>` : ''}</dl>` : '<p>이 파일에는 해당 행이 없습니다.</p>'}<p class="hash">SHA-256 ${report!.sources[side].sha256}</p></section>`;
  }).join('')}${c.deltaWon !== undefined ? `<p class="detail-delta">차액: ${formatWon(c.deltaWon, '원')}원</p>` : ''}<p>${c.percentReason ? `증감률 미산출: ${escape(c.percentReason)}` : c.percent !== undefined ? '증감률 = (비교 − 기준) ÷ 기준 × 100, 소수점 둘째 자리 반올림' : '추가·삭제·미확정 행은 증감률을 계산하지 않습니다.'}</p>`;
  $<HTMLDialogElement>('#detail').showModal();
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
shell();
