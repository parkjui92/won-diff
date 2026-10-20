import Decimal from 'decimal.js';

// Inputs are bounded to 30 digits + 6 decimal places; sums to 10,000 rows.
// This precision exceeds the maximum admitted arithmetic by a wide margin.
export const D = Decimal.clone({ precision: 80, toExpNeg: -40, toExpPos: 50 });
export const UNITS = { 원: '1', 천원: '1000', 만원: '10000', 백만원: '1000000', 억원: '100000000', 조원: '1000000000000' } as const;
export type Unit = keyof typeof UNITS;
export type Money = { kind: 'value'; won: string; expression: string } |
  { kind: 'missing'; reason: string } | { kind: 'invalid'; reason: string };
const number = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,6})?';
const bare = new RegExp(`^${number}$`);
const part = new RegExp(`(${number})\\s*(백만원|천원|만원|억원|조원|백만|천|만|억|조|원)`, 'gy');
const missing = new Set(['', '-', '—', '–', 'N/A', 'NA', 'N.A.', '…', '...', '미정', '미상', '비공개']);

export function parseMoney(raw: string, defaultUnit: Unit | 'cell' = '원'): Money {
  let text = raw.normalize('NFKC').trim();
  if (missing.has(text.toUpperCase())) return { kind: 'missing', reason: '미기재·대시·결측 표시는 0으로 간주하지 않음' };
  if (text.length > 120) return { kind: 'invalid', reason: '금액 표현이 너무 김' };
  let sign = 1;
  if (/^\(.*\)$/.test(text)) { sign = -1; text = text.slice(1, -1).trim(); }
  else if (/^[△−-]/.test(text)) { sign = -1; text = text.slice(1).trim(); }
  else if (text.startsWith('+')) text = text.slice(1).trim();
  const wonSymbol = text.startsWith('₩');
  text = text.replace(/^₩\s*/, '').replace(/\s+원$/u, '원');
  if (wonSymbol && bare.test(text)) defaultUnit = '원';
  const validNumber = (n: string) => n.replace(/[,.]/g, '').length <= 30;
  if (bare.test(text)) {
    if (defaultUnit === 'cell') return { kind: 'invalid', reason: '셀에 단위가 없음: 열의 단위를 지정해야 함' };
    if (!validNumber(text)) return { kind: 'invalid', reason: '30자리 초과 금액은 지원하지 않음' };
    const won = new D(text.replaceAll(',', '')).mul(UNITS[defaultUnit]).mul(sign).toFixed();
    return { kind: 'value', won, expression: `${sign < 0 ? '−' : ''}${text} × ${UNITS[defaultUnit]} (${defaultUnit})` };
  }
  let sum = new D(0), offset = 0, previous = new D(Infinity);
  const expressions: string[] = [];
  // Stateful regex must be reset on every invocation.
  part.lastIndex = 0;
  while (offset < text.length) {
    part.lastIndex = offset;
    const m = part.exec(text);
    if (!m || m.index !== offset || !validNumber(m[1])) return { kind: 'invalid', reason: '지원하지 않는 금액/통화/주석 또는 잘못된 쉼표 형식' };
    const unit = (m[2].endsWith('원') ? m[2] : `${m[2]}원`) as Unit;
    const multiplier = new D(UNITS[unit]);
    if (multiplier.gte(previous)) return { kind: 'invalid', reason: '복합 단위는 큰 단위부터 한 번씩만 표기해야 함' };
    previous = multiplier;
    sum = sum.plus(new D(m[1].replaceAll(',', '')).mul(multiplier));
    expressions.push(`${m[1]} × ${multiplier.toFixed()} (${unit})`);
    offset = part.lastIndex;
    while (text[offset] === ' ') offset++;
  }
  if (!expressions.length) return { kind: 'invalid', reason: '숫자를 읽을 수 없음' };
  return { kind: 'value', won: sum.mul(sign).toFixed(), expression: `${sign < 0 ? '−(' : ''}${expressions.join(' + ')}${sign < 0 ? ')' : ''}` };
}

export function formatWon(won: string, unit: Unit = '억원'): string {
  const value = new D(won).div(UNITS[unit]).toFixed();
  const [whole, frac] = value.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? `.${frac}` : '');
}
