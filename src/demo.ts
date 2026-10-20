import type { Selection } from './types';
// Extracted public facts, not an invented KIAT budget. Full provenance in docs/DATA.md.
export const demoFiles = {
  before: `항목,금액\n출연금,"6,826"\n이전수입,931\n위탁수입,"79,680"\n소계,"87,437"\n`,
  after: `항목,금액\n위탁수입,825.47\n출연금,68.26\n이전수입,9.33\n소계,903.06\n`
};
export const demoSettings: Record<'before' | 'after', Selection> = {
  before: { keys: ['항목'], amount: '금액', unit: '백만원', basis: 'settlement', period: '2023 결산', totalKey: ['소계'] },
  after: { keys: ['항목'], amount: '금액', unit: '억원', basis: 'settlement', period: '2024 결산', totalKey: ['소계'] }
};
