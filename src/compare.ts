import { D, parseMoney, UNITS } from './money';
import type { Entry, Issue, Report, Selection, SideSummary, Table, Change } from './types';
export const keyId = (key: string[]) => JSON.stringify(key);
const normalize = (s: string) => s.normalize('NFC').trim();
const aggregate = /^(?:총\s*계|합\s*계|소\s*계|총\s*액|총\s*합|수입합계|지출합계|total|subtotal)$/i;

export function compare(before: Table, after: Table, a: Selection, b: Selection): Report {
  const issues: Issue[] = [];
  const prepare = (table: Table, selection: Selection, side: 'before' | 'after') => {
    const entries = new Map<string, Entry>();
    const summary: SideSummary = { knownSumWon: '0', complete: true, detailRows: 0, unresolvedRows: 0 };
    const issue = (code: string, message: string, blocking: boolean, ref?: string) => issues.push({ code, message, blocking, side, ref });
    if (!selection.keys.length || new Set(selection.keys).size !== selection.keys.length ||
        !selection.amount || selection.keys.includes(selection.amount)) {
      issue('MAPPING', '서로 다른 식별 열과 금액 열을 선택하세요.', true);
    }
    if (!Object.hasOwn(UNITS, selection.unit) && selection.unit !== 'cell') issue('UNIT', '지원하지 않는 단위입니다.', true);
    if (!['budget', 'settlement', 'proposal', 'other', 'unknown'].includes(selection.basis)) issue('BASIS', '지원하지 않는 회계 기준입니다.', true);
    for (const column of [...selection.keys, selection.amount]) {
      if (!table.headers.includes(column)) issue('COLUMN', `열을 찾지 못했습니다: ${column}`, true);
    }
    if (selection.totalKey && selection.totalKey.length !== selection.keys.length) issue('TOTAL_KEY', '합계 행 식별자의 길이가 맞지 않습니다.', true);
    if (issues.some(i => i.side === side && i.blocking)) { summary.complete = false; return { entries, summary }; }
    const ki = selection.keys.map(k => table.headers.indexOf(k)), ai = table.headers.indexOf(selection.amount);
    let sum = new D(0);
    for (const row of table.rows) {
      const key = ki.map(i => normalize(row[i]?.text ?? ''));
      const cell = row[ai];
      const ref = cell?.ref ?? `${table.sheet}:?`;
      if (key.some(k => !k)) { issue('EMPTY_KEY', '빈 식별자는 행을 대응시킬 수 없습니다.', true, ref); continue; }
      if (ki.some(i => row[i]?.formula)) { issue('FORMULA_KEY', '수식 식별자는 값으로 확정한 뒤 비교하세요.', true, ref); continue; }
      const id = keyId(key);
      if (entries.has(id)) { issue('DUPLICATE_KEY', `중복 식별자 ${key.join(' / ')}: 첫 위치 ${entries.get(id)!.ref}`, true, ref); continue; }
      if (ki.some(i => row[i]?.numeric)) issue('NUMERIC_KEY', 'Excel 숫자 식별자: 표시 형식의 선행 0은 보존되지 않을 수 있습니다. 원본을 확인하세요.', false, ref);
      const money = cell?.formula
        ? { kind: 'invalid' as const, reason: '수식 셀: 캐시된 결과를 확정값으로 사용하지 않음. 값 붙여넣기 후 다시 비교' }
        : cell?.unsafeNumeric
          ? { kind: 'invalid' as const, reason: 'Excel 숫자 셀이 안전한 정수 범위를 넘습니다. 원천값을 확인해 텍스트로 입력하세요.' }
          : parseMoney(cell?.text ?? '', selection.unit);
      const entry: Entry = { key, raw: cell?.text ?? '', ref, money };
      entries.set(id, entry);
      if (selection.totalKey && id === keyId(selection.totalKey.map(normalize))) {
        summary.control = { entry };
        continue;
      }
      if (key.some(k => aggregate.test(k))) issue('AGGREGATE_ROW', `합계·소계 행 "${key.join(' / ')}"이 상세에 섞여 있습니다. 평면 표로 정리하거나 합계 행을 지정하세요.`, true, ref);
      summary.detailRows++;
      if (money.kind === 'value') sum = sum.plus(money.won);
      else { summary.complete = false; summary.unresolvedRows++; issue(money.kind === 'missing' ? 'MISSING_AMOUNT' : 'INVALID_AMOUNT', money.reason, false, ref); }
    }
    summary.knownSumWon = sum.toFixed();
    if (selection.totalKey && !summary.control) issue('TOTAL_NOT_FOUND', '지정한 합계 행을 찾지 못했습니다.', true);
    if (summary.control) {
      const control = summary.control;
      entries.delete(keyId(control.entry.key));
      if (summary.complete && control.entry.money.kind === 'value') {
        control.differenceWon = new D(control.entry.money.won).minus(sum).toFixed();
        control.matches = new D(control.differenceWon).isZero();
        if (!control.matches) issue('TOTAL_MISMATCH', `명시된 합계와 상세 합산이 ${control.differenceWon}원 다릅니다. 반올림·범위·입력을 확인하세요.`, false, control.entry.ref);
      } else issue('TOTAL_UNRESOLVED', '결측·수식·해석불가 셀이 있어 합계 일치 여부를 판정하지 않았습니다.', false, control.entry.ref);
    }
    if (issues.some(i => i.side === side && i.blocking)) summary.complete = false;
    return { entries, summary };
  };
  const left = prepare(before, a, 'before'), right = prepare(after, b, 'after');
  if (a.keys.length !== b.keys.length) issues.push({ code: 'KEY_ARITY', message: '양쪽 식별 열의 개수가 다릅니다.', blocking: true });
  const basisComparable = a.basis === b.basis && !['unknown', 'other'].includes(a.basis);
  if (!basisComparable) issues.push({ code: 'BASIS_MISMATCH', message: '회계 기준이 다르거나 미확인입니다. 차액은 산술 차이이며 증감률은 계산하지 않습니다.', blocking: false });
  if (!a.period.trim() || !b.period.trim()) issues.push({ code: 'PERIOD_UNKNOWN', message: '기준 시점이 미기재입니다. 결과를 인용하기 전에 두 시점을 확인하세요.', blocking: false });
  const valid = !issues.some(i => i.blocking);
  const changes: Change[] = [];
  if (valid) {
    const ids = [...new Set([...left.entries.keys(), ...right.entries.keys()])].sort();
    for (const id of ids) {
      const before = left.entries.get(id), after = right.entries.get(id);
      const change: Change = { key: (before ?? after)!.key, status: 'unchanged', before, after };
      if (!before) change.status = 'added';
      else if (!after) change.status = 'removed';
      else if (before.money.kind !== 'value' || after.money.kind !== 'value') change.status = 'unresolved';
      else {
        const delta = new D(after.money.won).minus(before.money.won);
        change.deltaWon = delta.toFixed();
        change.status = !delta.isZero() ? 'changed' : before.raw !== after.raw || a.unit !== b.unit ? 'representation' : 'unchanged';
        if (!basisComparable) change.percentReason = '회계 기준 다름·미확인';
        else if (new D(before.money.won).lte(0)) change.percentReason = '기준 금액이 0 이하';
        else change.percent = delta.div(before.money.won).mul(100).toFixed(2);
      }
      changes.push(change);
    }
  }
  const metadata = ({ rows: _rows, ...rest }: Table) => rest;
  const counts: Report['summary']['counts'] = { changed: 0, representation: 0, unchanged: 0, added: 0, removed: 0, unresolved: 0 };
  changes.forEach(c => counts[c.status]++);
  return {
    schemaVersion: '1.0', valid, sources: { before: metadata(before), after: metadata(after) },
    settings: { before: a, after: b }, basisComparable, issues, changes,
    summary: {
      before: left.summary, after: right.summary, counts,
      netDeltaWon: valid && left.summary.complete && right.summary.complete ? new D(right.summary.knownSumWon).minus(left.summary.knownSumWon).toFixed() : undefined
    }
  };
}
