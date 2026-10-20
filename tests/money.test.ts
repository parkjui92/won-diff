import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { D, parseMoney, formatWon, UNITS, type Unit } from '../src/money';

describe('정확한 원화 파싱', () => {
  it.each([
    ['1,000', '백만원', '1000000000'], ['10억원', '원', '1000000000'],
    ['1조 2,000억원', '원', '1200000000000'], ['1억 2천원', '원', '100002000'],
    ['△1,234.5', '백만원', '-1234500000'], ['−5억원', '원', '-500000000'],
    ['(12.50)', '억원', '-1250000000'], ['−10', '원', '-10'], ['₩1,000', '원', '1000'],
    ['０．１', '억원', '10000000'], ['0.000001', '원', '0.000001'],
    ['9007199254740993', '원', '9007199254740993'], ['1 억 원', '원', '100000000'],
    ['₩100', '백만원', '100'],
    ['1억원', '백만원', '100000000'], ['0', '억원', '0'], ['+12', '만원', '120000']
  ])('%s %s', (text, unit, won) => expect(parseMoney(text, unit as Unit)).toMatchObject({ kind: 'value', won }));
  it.each(['', ' ', '-', '—', 'N/A', '미정', '비공개'])('결측 %s는 0이 아니다', raw => expect(parseMoney(raw)).toMatchObject({ kind: 'missing' }));
  it.each(['1,00', '12,34,567', '1e9', '10%', '3달러', '약 10억원', '10억원*', '=1+1', 'NaN', 'Infinity', '(−10)', '--10', '1억 2조', '1억 2억', '1.0000001', '1234567890123456789012345678901', '1 000', '1,2345억원'])('불확실 표현 거부 %s', raw => expect(parseMoney(raw)).toMatchObject({ kind: 'invalid' }));
  it('셀 단위 모드에서는 단위 없는 숫자 차단', () => expect(parseMoney('100', 'cell')).toMatchObject({ kind: 'invalid' }));
  it('▲의 증가·감소 의미를 임의로 추측하지 않음', () => expect(parseMoney('▲5억원')).toMatchObject({ kind: 'invalid' }));
  it('소수 원까지 표시하며 지수 표기로 바꾸지 않음', () => expect(formatWon('100000001', '억원')).toBe('1.00000001'));
  it('정수와 단위 조합 1,000건에서 단위 표현 불변', () => {
    fc.assert(fc.property(fc.integer({ min: -1000000000, max: 1000000000 }), fc.constantFrom(...Object.keys(UNITS) as Unit[]), (n, unit) => {
      const result = parseMoney(`${n}${unit}`);
      expect(result).toMatchObject({ kind: 'value', won: (BigInt(n) * BigInt(UNITS[unit])).toString() });
      expect(parseMoney(String(n), unit)).toMatchObject({ kind: 'value', won: new D(n).mul(UNITS[unit]).toFixed() });
    }), { numRuns: 1000, seed: 20261021 });
  });
});
