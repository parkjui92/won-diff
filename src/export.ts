import Papa from 'papaparse';
import type { Report } from './types';
export const STATUS: Record<string, string> = {
  changed: '금액 변경', representation: '표기·단위만 변경', unchanged: '동일',
  added: '추가', removed: '삭제', unresolved: '확인 필요'
};
// Neutralize spreadsheet formula execution in user-controlled identifiers and source text.
const safe = (s: string) => /^[\s]*[=+\-@\t\r]/u.test(s) ? `'${s}` : s;
export function reportCSV(report: Report): string {
  if (!report.valid) throw new Error('입력 오류를 해결하기 전에는 변경표를 내보낼 수 없습니다.');
  const rows = report.changes.map(c => ({
    식별자: safe(c.key.join(' / ')), 판정: STATUS[c.status],
    기준원문: safe(c.before?.raw ?? ''), 비교원문: safe(c.after?.raw ?? ''),
    기준금액_원: c.before?.money.kind === 'value' ? c.before.money.won : '',
    비교금액_원: c.after?.money.kind === 'value' ? c.after.money.won : '',
    차액_원: c.deltaWon ?? '', 증감률_퍼센트: c.percent ?? '',
    증감률미산출사유: c.percentReason ?? '', 기준셀: safe(c.before?.ref ?? ''), 비교셀: safe(c.after?.ref ?? ''),
    기준파일: safe(report.sources.before.source), 비교파일: safe(report.sources.after.source),
    기준시점: safe(report.settings.before.period), 비교시점: safe(report.settings.after.period),
    기준회계기준: report.settings.before.basis, 비교회계기준: report.settings.after.basis,
    기준SHA256: report.sources.before.sha256, 비교SHA256: report.sources.after.sha256
  }));
  return '\uFEFF' + Papa.unparse(rows);
}
export function reportJSON(report: Report) { return JSON.stringify(report, null, 2) + '\n'; }
