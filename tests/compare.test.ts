import { it, expect } from 'vitest';
import fc from 'fast-check';
import { compare } from '../src/compare';
import { makeTable, parseDelimited } from '../src/input';
import { reportCSV } from '../src/export';
import { demoFiles, demoSettings } from '../src/demo';
import type { Selection, Table } from '../src/types';
export function table(csv: string): Table {
  return makeTable({ name: 'test.csv', sha256: 'test-hash', sheets: [parseDelimited(csv)] }, 'CSV');
}
const selection: Selection = { keys: ['id'], amount: 'amount', unit: '원', basis: 'budget', period: '2024' };
it('단위만 변경과 실제 증감을 구분; 행 순서 불변', () => {
  const r = compare(table('id,amount\nA,1000백만원\nB,10억원'), table('id,amount\nB,11억원\nA,10억원'), selection, selection);
  expect(r.valid).toBe(true); expect(r.changes.map(c => c.status)).toEqual(['representation', 'changed']);
  expect(r.changes[1]).toMatchObject({ deltaWon: '100000000', percent: '10.00' });
});
it('공개 KIAT 표: 단위 환산과 합계 원문 독립 대조', () => {
  const r = compare(table(demoFiles.before), table(demoFiles.after), demoSettings.before, demoSettings.after);
  expect(r.issues).toEqual([]);
  expect(r.summary.counts).toMatchObject({ changed: 2, representation: 1 });
  expect(r.summary.before.knownSumWon).toBe('87437000000');
  expect(r.summary.after.knownSumWon).toBe('90306000000');
  expect(r.summary.netDeltaWon).toBe('2869000000');
  expect(r.summary.before.control?.matches).toBe(true);
  expect(r.summary.after.control?.matches).toBe(true);
  expect(r.changes.find(c => c.key[0] === '이전수입')?.deltaWon).toBe('2000000');
});
it('결산 대 예산이면 증감률 억제; 산술 차액 유지', () => {
  const r = compare(table('id,amount\nA,100'), table('id,amount\nA,110'), selection, { ...selection, basis: 'settlement' });
  expect(r.changes[0].deltaWon).toBe('10'); expect(r.changes[0].percent).toBeUndefined();
  expect(r.basisComparable).toBe(false);
});
it.each(['unknown', 'other'] as const)('동일 %s 기준도 비교가능 확정 금지', basis => {
  expect(compare(table('id,amount\nA,100'), table('id,amount\nA,110'), { ...selection, basis }, { ...selection, basis }).basisComparable).toBe(false);
});
it.each(['0', '-10'])('기준액 %s에서 증감률은 미산출', value => {
  const r = compare(table(`id,amount\nA,${value}`), table('id,amount\nA,10'), selection, selection);
  expect(r.changes[0].percent).toBeUndefined();
});
it('중복 키는 덮어쓰지 않고 차단', () => {
  const r = compare(table('id,amount\nA,1\nA,2'), table('id,amount\nA,3'), selection, selection);
  expect(r.valid).toBe(false); expect(r.changes).toEqual([]); expect(r.summary.netDeltaWon).toBeUndefined();
  expect(r.issues.some(i => i.code === 'DUPLICATE_KEY')).toBe(true);
});
it('빈 키와 잘못된 매핑 차단', () => {
  expect(compare(table('id,amount\n,1'), table('id,amount\nA,2'), selection, selection).valid).toBe(false);
  expect(compare(table('id,amount\nA,1'), table('id,amount\nA,2'), { ...selection, keys: [] }, selection).valid).toBe(false);
});
it('결측과 0 구분: 부분합과 전체 차액 분리', () => {
  const r = compare(table('id,amount\nA,-\nB,10'), table('id,amount\nA,0\nB,11'), selection, selection);
  expect(r.changes[0].status).toBe('unresolved'); expect(r.summary.before.complete).toBe(false);
  expect(r.summary.before.knownSumWon).toBe('10'); expect(r.summary.netDeltaWon).toBeUndefined();
});
it('수식 캐시를 확정 금액으로 간주하지 않음', () => {
  const t = table('id,amount\nA,10'); t.rows[0][1].formula = 'SUM(A1:A2)';
  const r = compare(t, table('id,amount\nA,10'), selection, selection);
  expect(r.changes[0].status).toBe('unresolved'); expect(r.issues[0].code).toBe('INVALID_AMOUNT');
});
it('합계·소계 이중 합산을 차단', () => {
  const t = table('id,amount\nA,10\n소계,10\n합계,10');
  const r = compare(t, t, { ...selection, totalKey: ['합계'] }, { ...selection, totalKey: ['합계'] });
  expect(r.valid).toBe(false); expect(r.issues.some(i => i.code === 'AGGREGATE_ROW')).toBe(true);
});
it('합계 불일치와 미확정 합계는 명시', () => {
  const t = table('id,amount\nA,10\n합계,11'), s = { ...selection, totalKey: ['합계'] };
  const r = compare(t, t, s, s);
  expect(r.summary.before.control?.differenceWon).toBe('1');
  expect(r.issues[0].code).toBe('TOTAL_MISMATCH');
  const missing = table('id,amount\nA,-\n합계,10');
  expect(compare(missing, t, s, s).summary.before.control?.matches).toBeUndefined();
});
it('추가·삭제와 미확정 신규행을 총액에 반영', () => {
  const r = compare(table('id,amount\nA,10\nB,20'), table('id,amount\nB,20\nC,30'), selection, selection);
  expect(r.summary.netDeltaWon).toBe('20');
  expect(r.summary.counts).toMatchObject({ added: 1, removed: 1, unchanged: 1 });
  expect(r.changes[0].deltaWon).toBeUndefined();
});
it('선행 0과 복합 식별자 보존; 구분문자 충돌 없음', () => {
  const s = { ...selection, keys: ['id', 'sub'] };
  const t = table('id,sub,amount\n01,X,1\n1,X,2\nA / B,C,3\nA,B / C,4');
  const r = compare(t, t, s, s); expect(r.valid).toBe(true); expect(r.changes).toHaveLength(4);
});
it('CSV 내보내기 식별자 수식 주입 차단', () => {
  const t = table('id,amount\n=HYPERLINK(1),-10');
  expect(reportCSV(compare(t, t, selection, selection))).toContain("'=HYPERLINK(1)");
});
it('무작위 금액·행 순서 200회에서 차액 합산 불변', () => {
  fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: -100000, max: 100000 }), fc.integer({ min: -100000, max: 100000 })), { minLength: 1, maxLength: 100 }), pairs => {
    const t1 = table('id,amount\n' + pairs.map(([x], i) => `${i},${x}`).join('\n'));
    const t2 = table('id,amount\n' + pairs.map(([, x], i) => `${i},${x}`).reverse().join('\n'));
    const r = compare(t1, t2, selection, selection);
    const expected = pairs.reduce((n, [x, y]) => n + BigInt(y) - BigInt(x), 0n).toString();
    expect(r.summary.netDeltaWon).toBe(expected);
  }), { numRuns: 200, seed: 20261021 });
});
