import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { readSource, makeTable } from '../src/input';
import { compare } from '../src/compare';
import { demoSettings } from '../src/demo';
async function fixture(name: string) {
  const s = await readSource(name, await readFile(`examples/${name}`));
  return makeTable(s, 'CSV');
}
it('원문에서 추출한 ALIO 2023/2024 자료와 화면 예제 독립 대조', async () => {
  const before = await fixture('kiat-2023-백만원.csv'), after = await fixture('kiat-2024-억원.csv');
  const r = compare(before, after, demoSettings.before, demoSettings.after);
  expect(r.issues).toEqual([]);
  expect(r.summary.netDeltaWon).toBe('2869000000');
  expect(r.summary.counts.changed).toBe(2);
  expect(r.changes.find(c => c.key[0] === '위탁수입')).toMatchObject({ deltaWon: '2867000000', percent: '3.60' });
});
it('동일 2024 결산의 단위만 바꾼 사본은 실질 변경 0건', async () => {
  const a = await fixture('kiat-2024-백만원.csv'), b = await fixture('kiat-2024-억원.csv');
  const r = compare(a, b, demoSettings.before, demoSettings.after);
  expect(r.summary.counts.changed).toBe(0); expect(r.summary.netDeltaWon).toBe('0');
});
it('실제 공시의 2024 결산/2025 예산은 기준 차이로 증감률 보류', async () => {
  const a = await fixture('kiat-2024-백만원.csv'), b = await fixture('kiat-2025-백만원.csv');
  const r = compare(a, b, demoSettings.before, { ...demoSettings.before, basis: 'budget', period: '2025 예산' });
  expect(r.basisComparable).toBe(false);
  expect(r.changes.every(c => c.percent === undefined)).toBe(true);
  expect(r.summary.netDeltaWon).toBe('12691000000');
});
it('공개자료에 합성 오류를 넣은 실험: 합계에 1백만원 오류', async () => {
  const a = await fixture('kiat-2024-백만원.csv'), b = structuredClone(a);
  b.rows.find(row => row[0].text === '소계')![1].text = '90,307';
  const r = compare(a, b, demoSettings.before, demoSettings.before);
  expect(r.issues.some(i => i.code === 'TOTAL_MISMATCH' && i.side === 'after')).toBe(true);
  expect(r.summary.after.control?.differenceWon).toBe('1000000');
});
